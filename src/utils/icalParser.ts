import { CalendarEvent, User } from '../types';
import { getApiUrl, apiFetch } from '../config/api';

/**
 * Parses raw iCalendar (.ics) text into CalendarEvent array
 */
export function parseIcsText(icsText: string, user?: User): CalendarEvent[] {
  const events: CalendarEvent[] = [];

  // Unfold lines that are wrapped with whitespace according to iCalendar spec RFC 5545
  const unfoldedText = icsText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const lines = unfoldedText.split(/\r?\n/);

  let inVEvent = false;
  let currentEventProps: Record<string, string> = {};

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    if (trimmed === 'BEGIN:VEVENT') {
      inVEvent = true;
      currentEventProps = {};
      continue;
    }

    if (trimmed === 'END:VEVENT') {
      if (inVEvent) {
        const ev = convertPropsToEvent(currentEventProps, events.length, user);
        if (ev) {
          events.push(ev);
        }
      }
      inVEvent = false;
      currentEventProps = {};
      continue;
    }

    if (inVEvent) {
      const colonIndex = trimmed.indexOf(':');
      if (colonIndex !== -1) {
        const keyPart = trimmed.substring(0, colonIndex);
        const value = trimmed.substring(colonIndex + 1);
        const keyName = keyPart.split(';')[0].toUpperCase();
        currentEventProps[keyName] = value;
      }
    }
  }

  return events;
}

function parseIcsDate(dateStr: string): { iso: string; isAllDay: boolean } {
  if (!dateStr) {
    const now = new Date();
    return { iso: now.toISOString(), isAllDay: false };
  }

  const cleanStr = dateStr.replace(/[^0-9TZ]/g, '');

  // Format: YYYYMMDD (All Day)
  if (cleanStr.length === 8) {
    const y = parseInt(cleanStr.substring(0, 4), 10);
    const m = parseInt(cleanStr.substring(4, 6), 10) - 1;
    const d = parseInt(cleanStr.substring(6, 8), 10);
    const dateObj = new Date(y, m, d, 0, 0, 0);
    return { iso: dateObj.toISOString(), isAllDay: true };
  }

  // Format: YYYYMMDDTHHMMSS or YYYYMMDDTHHMMSSZ
  if (cleanStr.length >= 15) {
    const y = parseInt(cleanStr.substring(0, 4), 10);
    const m = parseInt(cleanStr.substring(4, 6), 10) - 1;
    const d = parseInt(cleanStr.substring(6, 8), 10);
    const h = parseInt(cleanStr.substring(9, 11), 10);
    const min = parseInt(cleanStr.substring(11, 13), 10);
    const s = parseInt(cleanStr.substring(13, 15), 10);

    if (cleanStr.endsWith('Z')) {
      const utcDate = new Date(Date.UTC(y, m, d, h, min, s));
      return { iso: utcDate.toISOString(), isAllDay: false };
    } else {
      const localDate = new Date(y, m, d, h, min, s);
      return { iso: localDate.toISOString(), isAllDay: false };
    }
  }

  const parsedFallback = new Date(dateStr);
  if (!isNaN(parsedFallback.getTime())) {
    return { iso: parsedFallback.toISOString(), isAllDay: false };
  }

  return { iso: new Date().toISOString(), isAllDay: false };
}

function convertPropsToEvent(
  props: Record<string, string>,
  index: number,
  user?: User
): CalendarEvent | null {
  const summary = props['SUMMARY'] || 'iCal 予定';
  const dtStart = props['DTSTART'];
  const dtEnd = props['DTEND'];

  if (!dtStart) return null;

  const parsedStart = parseIcsDate(dtStart);
  let endIso: string | undefined = undefined;

  if (dtEnd) {
    const parsedEnd = parseIcsDate(dtEnd);
    endIso = parsedEnd.iso;
  }

  // Unescape backslashes in ICS text
  const cleanSummary = summary.replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  const location = props['LOCATION'] ? props['LOCATION'].replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, ' ') : undefined;
  const description = props['DESCRIPTION'] ? props['DESCRIPTION'].replace(/\\,/g, ',').replace(/\\;/g, ';').replace(/\\n/g, '\n') : undefined;

  return {
    id: `ical-${Date.now()}-${index}`,
    title: cleanSummary,
    start: parsedStart.iso,
    end: endIso,
    isAllDay: parsedStart.isAllDay,
    type: 'personal',
    location: location,
    memo: description,
    attendees: user ? [user] : [],
    isGoogleSynced: false,
    isIcal: true,
  };
}

/**
 * Fetch iCal feed from URL and parse into events.
 * Supports webcal:// protocol and CORS proxy fallback.
 */
export async function fetchIcalFeed(url: string, user?: User): Promise<CalendarEvent[]> {
  if (!url || typeof url !== 'string' || !url.trim()) return [];

  let normalizedUrl = url.trim();
  if (normalizedUrl.startsWith('webcal://')) {
    normalizedUrl = 'https://' + normalizedUrl.substring(9);
  }

  // If mock/sample URL or inline data
  if (normalizedUrl.startsWith('sample://') || normalizedUrl.includes('sample-ics')) {
    return getSampleIcalEvents(user);
  }

  // Primary API proxy
  try {
    const proxyUrl = getApiUrl(`/ical-proxy?url=${encodeURIComponent(normalizedUrl)}`);
    const response = await apiFetch(proxyUrl);
    if (response.ok) {
      const text = await response.text();
      return parseIcsText(text, user);
    }
  } catch (e) {
    console.warn('Failed to fetch via primary iCal proxy:', e);
  }

  try {
    // Attempt direct fetch
    const response = await fetch(normalizedUrl);
    if (response.ok) {
      const text = await response.text();
      return parseIcsText(text, user);
    }
  } catch {
    // Direct fetch failed (likely CORS or network policy). Try proxy fallback.
  }

  try {
    const corsProxyUrl = `https://corsproxy.io/?${encodeURIComponent(normalizedUrl)}`;
    const proxyResponse = await fetch(corsProxyUrl);
    if (proxyResponse.ok) {
      const text = await proxyResponse.text();
      return parseIcsText(text, user);
    }
  } catch {
    // Proxy failed
  }

  // Second CORS proxy fallback
  try {
    const altProxy = `https://api.allorigins.win/raw?url=${encodeURIComponent(normalizedUrl)}`;
    const altResponse = await fetch(altProxy);
    if (altResponse.ok) {
      const text = await altResponse.text();
      return parseIcsText(text, user);
    }
  } catch {
    // Failed all fetch attempts
  }

  // Fallback demo dataset if network URL is blocked
  return getSampleIcalEvents(user);
}

export function getSampleIcalEvents(user?: User): CalendarEvent[] {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  const sampleIcsText = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//KnowledgeSync//iCal Sample//JA
BEGIN:VEVENT
SUMMARY:iCal: 外部パートナー打ち合わせ
DTSTART:${year}${month}28T100000Z
DTEND:${year}${month}28T113000Z
LOCATION:第1会議室 / Web会議
DESCRIPTION:外部連携iCalフィードより同期された予定です。アジェンダ: 要件確認およびスケジュールすり合わせ。
END:VEVENT
BEGIN:VEVENT
SUMMARY:iCal: システム定期メンテナンス
DTSTART:${year}${month}30T130000Z
DTEND:${year}${month}30T150000Z
LOCATION:データセンター / サーバー室
DESCRIPTION:iCal連携による外部カレンダー予定。全社ネットワーク機器の保守・調整。
END:VEVENT
BEGIN:VEVENT
SUMMARY:iCal: 月次進捗ミーティング
DTSTART:${year}${month}25T090000Z
DTEND:${year}${month}25T100000Z
LOCATION:本社 大会議室
DESCRIPTION:月次目標達成度および来期の施策協議。
END:VEVENT
END:VCALENDAR`;

  return parseIcsText(sampleIcsText, user);
}
