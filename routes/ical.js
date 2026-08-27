import { Router } from 'express';
import sql from 'mssql';
import { getPool } from '../db.js';
import { safeParseJSON } from '../config.js';

const router = Router();

// iCalプロキシ取得 API (CORS回避用)
router.get('/ical-proxy', async (req, res) => {
  try {
    const targetUrl = req.query.url;
    if (!targetUrl || typeof targetUrl !== 'string') {
      return res.status(400).send('URLパラメータが指定されていません');
    }
    const fetch = (await import('node-fetch')).default;
    const response = await fetch(targetUrl);
    if (!response.ok) {
      return res.status(response.status).send('iCalの取得に失敗しました');
    }
    const text = await response.text();
    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.send(text);
  } catch (err) {
    res.status(500).send(err.message);
  }
});

// iCal案内ページ
router.get(['/ical', '/ical/'], (req, res) => {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(`
    <div style="font-family: sans-serif; padding: 24px; max-width: 600px; margin: auto; line-height: 1.6;">
      <h2 style="color: #4f46e5; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">iCalカレンダー同期機能 (RFC 5545 RRULE準拠)</h2>
      <p>このエンドポイントは、各ユーザー専用のiCal形式カレンダーを提供します。</p>
      <div style="background-color: #f3f4f6; padding: 16px; border-radius: 8px; font-family: monospace; font-size: 14px; margin: 16px 0;">
        <strong>URLフォーマット:</strong><br>
        /api/ical/user_【ユーザーID】_calendar.ics
      </div>
    </div>
  `);
});

// ヘルパー関数: UTC 日時文字列フォーマット (YYYYMMDDTHHMMSSZ)
function formatToUtc(dateObj) {
  const d = new Date(dateObj);
  if (isNaN(d.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

// ヘルパー関数: JST 日付文字列 (YYYY-MM-DD)
function getJstDateStr(dateInput) {
  if (!dateInput) return '';
  const d = new Date(dateInput);
  if (isNaN(d.getTime())) return '';
  const jstDate = new Date(d.getTime() + 9 * 60 * 60 * 1000);
  const y = jstDate.getUTCFullYear();
  const m = String(jstDate.getUTCMonth() + 1).padStart(2, '0');
  const day = String(jstDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// ヘルパー関数: 終日予定の翌日計算 (YYYYMMDD)
function addDaysJstFormatted(dateStr, days) {
  const parts = dateStr.split('-');
  const y = parseInt(parts[0], 10);
  const m = parseInt(parts[1], 10) - 1;
  const d = parseInt(parts[2], 10);
  const date = new Date(Date.UTC(y, m, d + days, 12, 0, 0));
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

// 曜日番号(0-6) -> iCal曜日略称
const ICAL_DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

// ==========================================
// カレンダー iCal (ICS) エクスポート API
// 【DB(SQL Server)のみから抽出 & 参加メンバー(attendees)一致判定】
// ==========================================
router.get([
  '/ical/user_:userId_calendar.ics',
  '/ical/user_:userId.ics',
  '/ical/:userId.ics',
  '/ical/:userId',
  '/user_:userId_calendar.ics',
  '/user_:userId.ics',
  '/:userId.ics'
], async (req, res) => {
  try {
    let rawUserId = req.params.userId || req.params.userId_calendar || '';
    rawUserId = String(rawUserId).trim();
    if (rawUserId.startsWith('user_')) {
      rawUserId = rawUserId.substring(5);
    }
    if (rawUserId.endsWith('_calendar.ics')) {
      rawUserId = rawUserId.substring(0, rawUserId.length - '_calendar.ics'.length);
    } else if (rawUserId.endsWith('_calendar')) {
      rawUserId = rawUserId.substring(0, rawUserId.length - '_calendar'.length);
    } else if (rawUserId.endsWith('.ics')) {
      rawUserId = rawUserId.substring(0, rawUserId.length - 4);
    }
    const userId = rawUserId.trim();

    console.log(`[iCal] Export requested for userId: "${userId}" (raw: "${req.params.userId}")`);

    const pool = await getPool();
    if (!pool) {
      console.error('[iCal] Database connection pool not available');
      return res.status(500).send('データベースに接続できません');
    }

    // 1. ユーザー情報（氏名・メールアドレス・ログインID）を取得
    let userName = '';
    let userEmail = '';
    let userLoginId = '';
    try {
      const userRes = await pool.request()
        .input('userId', sql.VarChar, userId)
        .query('SELECT id, name, email, loginId FROM dbo.Users WHERE id = @userId');
      if (userRes.recordset && userRes.recordset.length > 0) {
        const u = userRes.recordset[0];
        userName = String(u.name || '').trim();
        userEmail = String(u.email || '').trim().toLowerCase();
        userLoginId = String(u.loginId || '').trim().toLowerCase();
      }
    } catch (uErr) {
      console.warn('[iCal] Users lookup warning:', uErr.message);
    }

    console.log(`[iCal] User info resolved: id="${userId}", name="${userName}", email="${userEmail}", loginId="${userLoginId}"`);

    // 2. SQL Server の dbo.Events テーブルから全件取得 (DBのみ)
    let allEvents = [];
    try {
      const result = await pool.request().query('SELECT * FROM dbo.Events');
      allEvents = result.recordset || [];
      console.log(`[iCal] Fetched ${allEvents.length} total events from dbo.Events`);
    } catch (eErr) {
      console.error('[iCal] Error querying dbo.Events:', eErr.message);
      return res.status(500).send(`イベントデータ取得エラー: ${eErr.message}`);
    }

    // 3. 各レコードのパース & 参加メンバー判定
    const userEvents = [];
    const normalizedEvents = [];

    for (const evt of allEvents) {
      const evtId = String(evt.id || evt.Id || '');
      const title = evt.title || evt.Title || '予定';
      const startAt = evt.startAt || evt.StartAt || evt.start || evt.startDate || new Date().toISOString();
      const endAt = evt.endAt || evt.EndAt || evt.end || evt.endDate || startAt;
      const isAllDay = evt.isAllDay === true || evt.isAllDay === 1 || evt.isAllDay === 'true' || evt.IsAllDay === 1;
      let location = evt.location || evt.Location || '';
      const rawDesc = evt.description !== undefined ? evt.description : (evt.Description !== undefined ? evt.Description : '');

      let memoText = typeof rawDesc === 'string' ? rawDesc : '';
      let parsedAttendees = [];

      // パターンA: description が JSON の場合 ({"attendees": [...], "memo": "..."})
      if (typeof rawDesc === 'string' && rawDesc.trim().startsWith('{')) {
        try {
          const descObj = JSON.parse(rawDesc);
          if (descObj) {
            if (descObj.memo !== undefined) memoText = descObj.memo;
            if (Array.isArray(descObj.attendees)) parsedAttendees = descObj.attendees;
            if (descObj.location && !location) location = descObj.location;
          }
        } catch (_) {}
      }

      // パターンB: evt.attendees カラムに直接入っている場合
      const rawColAttendees = evt.attendees || evt.Attendees;
      if (parsedAttendees.length === 0 && rawColAttendees) {
        if (Array.isArray(rawColAttendees)) {
          parsedAttendees = rawColAttendees;
        } else if (typeof rawColAttendees === 'string') {
          try {
            const parsed = JSON.parse(rawColAttendees);
            if (Array.isArray(parsed)) parsedAttendees = parsed;
          } catch (_) {
            parsedAttendees = rawColAttendees.split(',').map(s => s.trim());
          }
        }
      }

      // 繰り返し情報の抽出
      const recurrence = safeParseJSON(evt.recurrence || evt.Recurrence, null);
      const recurrenceParentId = evt.recurrenceParentId || evt.RecurrenceParentId || null;
      const recurrenceOriginalDate = evt.recurrenceOriginalDate || evt.RecurrenceOriginalDate || null;
      const recurrenceExceptions = safeParseJSON(evt.recurrenceExceptions || evt.RecurrenceExceptions, []);

      const normalized = {
        id: evtId,
        title,
        startAt,
        endAt,
        isAllDay,
        location,
        description: memoText,
        attendees: parsedAttendees,
        recurrence,
        recurrenceParentId,
        recurrenceOriginalDate,
        recurrenceExceptions,
        rawDescription: typeof rawDesc === 'string' ? rawDesc : ''
      };

      normalizedEvents.push(normalized);

      // 【参加者判定】
      // 1. attendees 配列の要素チェック
      let isParticipant = false;
      if (Array.isArray(parsedAttendees) && parsedAttendees.length > 0) {
        isParticipant = parsedAttendees.some(att => {
          if (!att) return false;
          if (typeof att === 'object') {
            const attId = String(att.id || '').trim();
            const attName = String(att.name || '').trim();
            const attEmail = String(att.email || '').trim().toLowerCase();
            const attLoginId = String(att.loginId || '').trim().toLowerCase();
            return (attId && (attId === userId || attId.toLowerCase() === userId.toLowerCase())) ||
                   (userName && attName === userName) ||
                   (userEmail && attEmail === userEmail) ||
                   (userLoginId && attLoginId === userLoginId);
          }
          const strVal = String(att).trim();
          return strVal === userId || 
                 (userName && strVal === userName) || 
                 (userLoginId && strVal.toLowerCase() === userLoginId);
        });
      }

      // 2. 万が一 JSON パースできなかった場合の文字列フォールバック検索
      if (!isParticipant && typeof rawDesc === 'string' && rawDesc.length > 0) {
        if (
          rawDesc.includes(`"id":"${userId}"`) || 
          rawDesc.includes(`"id": "${userId}"`) ||
          (userLoginId && rawDesc.includes(`"loginId":"${userLoginId}"`)) ||
          (userName && rawDesc.includes(`"name":"${userName}"`))
        ) {
          isParticipant = true;
        }
      }

      if (isParticipant) {
        userEvents.push(normalized);
      }
    }

    console.log(`[iCal] Found ${userEvents.length} events matching attendee: ${userId}`);

    // 子イベントで親が参加対象なら追加
    for (const norm of normalizedEvents) {
      if (norm.recurrenceParentId && !userEvents.some(u => u.id === norm.id)) {
        const parent = userEvents.find(p => p.id === norm.recurrenceParentId);
        if (parent) {
          userEvents.push(norm);
        }
      }
    }

    // 4. 親予定・例外変更予定・単発予定の分類
    const parentEventsMap = new Map();
    const overrideEventsList = [];
    const singleEventsList = [];

    for (const ev of userEvents) {
      if (ev.recurrenceParentId && ev.recurrenceParentId !== ev.id) {
        overrideEventsList.push(ev);
      } else if (ev.recurrence && ev.recurrence.frequency && ev.recurrence.frequency !== 'none') {
        parentEventsMap.set(ev.id, ev);
      } else {
        singleEventsList.push(ev);
      }
    }

    // 5. ICS コンテンツの組み立て (RFC 5545)
    let icsContent = "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Company SNS Calendar//JA\r\nCALSCALE:GREGORIAN\r\nMETHOD:PUBLISH\r\nX-WR-CALNAME:社内カレンダー同期\r\nX-WR-TIMEZONE:Asia/Tokyo\r\n";
    const nowStr = formatToUtc(new Date());

    // --- (A) 単発予定の出力 ---
    for (const evt of singleEventsList) {
      icsContent += buildVEvent({
        uid: `evt-${evt.id}@company-sns`,
        nowStr,
        title: evt.title,
        description: evt.description,
        location: evt.location,
        startAt: evt.startAt,
        endAt: evt.endAt,
        isAllDay: evt.isAllDay
      });
    }

    // --- (B) 繰り返し親予定の出力 (RRULE & EXDATE 付き) ---
    for (const [parentId, parentEvt] of parentEventsMap.entries()) {
      const rec = parentEvt.recurrence;
      const rruleParts = [];

      if (rec.frequency === 'daily') rruleParts.push('FREQ=DAILY');
      else if (rec.frequency === 'weekly') rruleParts.push('FREQ=WEEKLY');
      else if (rec.frequency === 'monthly') rruleParts.push('FREQ=MONTHLY');
      else if (rec.frequency === 'yearly') rruleParts.push('FREQ=YEARLY');

      if (rec.interval && Number(rec.interval) > 1) {
        rruleParts.push(`INTERVAL=${rec.interval}`);
      }

      if (rec.frequency === 'weekly' && Array.isArray(rec.daysOfWeek) && rec.daysOfWeek.length > 0) {
        const byDays = rec.daysOfWeek.map(d => ICAL_DAYS[Number(d)]).filter(Boolean);
        if (byDays.length > 0) rruleParts.push(`BYDAY=${byDays.join(',')}`);
      }

      if (rec.endType === 'until_date' && rec.endDate) {
        const untilClean = String(rec.endDate).replace(/-/g, '');
        rruleParts.push(`UNTIL=${untilClean}T235959Z`);
      } else if (rec.endType === 'count' && rec.count) {
        rruleParts.push(`COUNT=${rec.count}`);
      }

      const rruleLine = rruleParts.length > 0 ? `RRULE:${rruleParts.join(';')}\r\n` : '';

      // 除外日 (EXDATE) の収集: 削除された日 + 個別変更された日
      const exdateList = new Set();
      if (Array.isArray(parentEvt.recurrenceExceptions)) {
        parentEvt.recurrenceExceptions.forEach(d => { if (d) exdateList.add(d); });
      }

      overrideEventsList.filter(o => o.recurrenceParentId === parentId).forEach(o => {
        const origDate = o.recurrenceOriginalDate || getJstDateStr(o.startAt);
        if (origDate) exdateList.add(origDate);
      });

      let exdateLines = '';
      for (const exDateStr of exdateList) {
        if (parentEvt.isAllDay) {
          exdateLines += `EXDATE;VALUE=DATE:${exDateStr.replace(/-/g, '')}\r\n`;
        } else {
          const originalDateTimeIso = `${exDateStr}T${new Date(parentEvt.startAt).toISOString().slice(11, 19)}Z`;
          exdateLines += `EXDATE:${formatToUtc(originalDateTimeIso)}\r\n`;
        }
      }

      icsContent += buildVEvent({
        uid: `evt-${parentId}@company-sns`,
        nowStr,
        title: parentEvt.title,
        description: parentEvt.description,
        location: parentEvt.location,
        startAt: parentEvt.startAt,
        endAt: parentEvt.endAt,
        isAllDay: parentEvt.isAllDay,
        extraLines: rruleLine + exdateLines
      });
    }

    // --- (C) 個別変更された例外予定の出力 (親と同じUID + RECURRENCE-ID) ---
    for (const ovrEvt of overrideEventsList) {
      const parentId = ovrEvt.recurrenceParentId;
      const parentEvt = parentEventsMap.get(parentId);
      const isAllDay = ovrEvt.isAllDay !== undefined ? ovrEvt.isAllDay : (parentEvt ? parentEvt.isAllDay : false);
      const origDateStr = ovrEvt.recurrenceOriginalDate || getJstDateStr(ovrEvt.startAt);

      let recurrenceIdLine = '';
      if (isAllDay) {
        recurrenceIdLine = `RECURRENCE-ID;VALUE=DATE:${origDateStr.replace(/-/g, '')}\r\n`;
      } else {
        const parentStartTime = parentEvt ? new Date(parentEvt.startAt).toISOString().slice(11, 19) : '00:00:00';
        const originalDateTimeIso = `${origDateStr}T${parentStartTime}Z`;
        recurrenceIdLine = `RECURRENCE-ID:${formatToUtc(originalDateTimeIso)}\r\n`;
      }

      icsContent += buildVEvent({
        uid: `evt-${parentId}@company-sns`,
        nowStr,
        title: ovrEvt.title,
        description: ovrEvt.description,
        location: ovrEvt.location,
        startAt: ovrEvt.startAt,
        endAt: ovrEvt.endAt,
        isAllDay: isAllDay,
        extraLines: recurrenceIdLine
      });
    }

    icsContent += "END:VCALENDAR\r\n";

    // 6. RFC 5545 72バイト折りたたみ
    const foldedIcs = foldIcsLines(icsContent);

    res.setHeader('Content-Type', 'text/calendar; charset=utf-8');
    res.setHeader('Content-Disposition', `inline; filename="user_${userId}_calendar.ics"`);
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.send(foldedIcs);
  } catch (err) {
    console.error('[iCal] Fatal error in ical route:', err);
    res.status(500).send(err.message);
  }
});

// VEVENT 構築ヘルパー
function buildVEvent({ uid, nowStr, title, description, location, startAt, endAt, isAllDay, extraLines = '' }) {
  let dtStartLine = '';
  let dtEndLine = '';

  if (isAllDay) {
    const startStr = getJstDateStr(startAt);
    const endStr = endAt ? getJstDateStr(endAt) : startStr;
    if (startStr) {
      dtStartLine = `DTSTART;VALUE=DATE:${startStr.replace(/-/g, '')}\r\n`;
      dtEndLine = `DTEND;VALUE=DATE:${addDaysJstFormatted(endStr || startStr, 1)}\r\n`;
    }
  } else {
    const startD = startAt ? new Date(startAt) : null;
    const endD = endAt ? new Date(endAt) : startD;
    if (startD && endD) {
      dtStartLine = `DTSTART:${formatToUtc(startD)}\r\n`;
      dtEndLine = `DTEND:${formatToUtc(endD)}\r\n`;
    }
  }

  const summaryEscaped = (title || '').replace(/\r\n|\r|\n/g, ' ').replace(/[,;\\]/g, '\\$&');
  const descEscaped = String(description || '').replace(/\r\n|\r|\n/g, '\\n').replace(/[,;\\]/g, '\\$&');
  const locEscaped = (location || '').replace(/\r\n|\r|\n/g, ' ').replace(/[,;\\]/g, '\\$&');

  let vevent = "BEGIN:VEVENT\r\n";
  vevent += `UID:${uid}\r\n`;
  vevent += `DTSTAMP:${nowStr}\r\n`;
  vevent += `SUMMARY:${summaryEscaped}\r\n`;
  if (description) vevent += `DESCRIPTION:${descEscaped}\r\n`;
  if (location) vevent += `LOCATION:${locEscaped}\r\n`;
  if (dtStartLine) vevent += dtStartLine;
  if (dtEndLine) vevent += dtEndLine;
  if (extraLines) vevent += extraLines;
  vevent += "END:VEVENT\r\n";

  return vevent;
}

// 72バイト折りたたみ関数
function foldIcsLines(content) {
  const lines = content.split("\r\n");
  const folded = lines.map(line => {
    if (!line) return '';
    const buf = Buffer.from(line, 'utf-8');
    if (buf.length <= 72) return line;

    let result = '';
    let currentBytes = 0;
    let currentStr = '';

    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      const charBytes = Buffer.from(char, 'utf-8').length;
      if (currentBytes + charBytes > 72) {
        result += currentStr + "\r\n ";
        currentStr = char;
        currentBytes = charBytes;
      } else {
        currentStr += char;
        currentBytes += charBytes;
      }
    }
    result += currentStr;
    return result;
  });
  return folded.join("\r\n");
}

export default router;
