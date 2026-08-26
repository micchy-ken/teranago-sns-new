import { CalendarEvent, RecurrenceRule } from '../types';
import { getLocalDateStr, formatTimePartJST } from './dateUtils';
import { RecurrenceActionScope } from '../components/RecurrenceActionModal';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 繰り返しルールの安全なパース（オブジェクト・JSON文字列対応）
 */
export function safeParseRecurrence(val: any): RecurrenceRule | undefined {
  if (!val) return undefined;
  if (typeof val === 'object' && val !== null) {
    if (val.frequency && val.frequency !== 'none') return val as RecurrenceRule;
    return undefined;
  }
  if (typeof val === 'string') {
    let trimmed = val.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      try {
        const unescaped = JSON.parse(trimmed);
        if (typeof unescaped === 'string') trimmed = unescaped.trim();
        else if (typeof unescaped === 'object' && unescaped !== null) {
          if (unescaped.frequency && unescaped.frequency !== 'none') return unescaped as RecurrenceRule;
        }
      } catch (_) {}
    }
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && parsed.frequency && parsed.frequency !== 'none') {
          return parsed as RecurrenceRule;
        }
      } catch (_) {}
    }
    const lower = trimmed.toLowerCase();
    if (['daily', 'weekly', 'monthly', 'yearly'].includes(lower)) {
      return { frequency: lower as any, endType: 'never' };
    }
  }
  return undefined;
}

/**
 * 除外日リストの安全なパース（配列・JSON文字列対応）
 */
export function safeParseExceptions(val: any): string[] {
  if (!val) return [];
  if (Array.isArray(val)) return val;
  if (typeof val === 'string') {
    let trimmed = val.trim();
    if ((trimmed.startsWith('"') && trimmed.endsWith('"')) || (trimmed.startsWith("'") && trimmed.endsWith("'"))) {
      try {
        const unescaped = JSON.parse(trimmed);
        if (Array.isArray(unescaped)) return unescaped;
        if (typeof unescaped === 'string') trimmed = unescaped.trim();
      } catch (_) {}
    }
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (Array.isArray(parsed)) return parsed;
      } catch (_) {}
    }
    if (trimmed.includes('-')) {
      return trimmed.split(',').map(s => s.trim()).filter(Boolean);
    }
  }
  return [];
}

/**
 * YYYY-MM-DD 文字列からタイムゾーン歪みなしで曜日 (0: 日 ~ 6: 土) を取得
 */
export function getDayOfWeekFromDateStr(dateStr: string): number {
  if (!dateStr || !dateStr.includes('-')) return 0;
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0)).getUTCDay();
}

/**
 * 指定した年・月・第N週・曜日の日付 (日: 1~31) を計算する
 * @param year 
 * @param month 0-indexed (0: 1月, 11: 12月)
 * @param weekOfMonth 1: 第1, 2: 第2, 3: 第3, 4: 第4, 5: 第5
 * @param dayOfWeek 0: 日, 1: 月, ..., 6: 土
 */
export function getNthWeekdayOfMonth(year: number, month: number, weekOfMonth: number, dayOfWeek: number): number | null {
  const firstDay = new Date(Date.UTC(year, month, 1, 12, 0, 0));
  const firstDayOfWeek = firstDay.getUTCDay();
  
  let offset = dayOfWeek - firstDayOfWeek;
  if (offset < 0) offset += 7;
  
  const day = 1 + offset + (weekOfMonth - 1) * 7;
  const daysInMonth = new Date(Date.UTC(year, month + 1, 0, 12, 0, 0)).getUTCDate();
  
  if (day > daysInMonth) return null;
  return day;
}

/**
 * 指定日付が「第何週の何曜日」かを計算する
 */
export function calculateWeekOfMonth(date: Date): { weekOfMonth: number; dayOfWeek: number } {
  const dayOfWeek = date.getDay();
  const day = date.getDate();
  const weekOfMonth = Math.ceil(day / 7);
  return { weekOfMonth, dayOfWeek };
}

/**
 * 繰り返しルールの日本語説明ラベルを生成する
 */
export function getRecurrenceLabel(ruleInput?: any): string {
  const rule = safeParseRecurrence(ruleInput);
  if (!rule || rule.frequency === 'none') return '';

  let label = '';
  if (rule.frequency === 'daily') {
    label = '毎日';
  } else if (rule.frequency === 'weekly') {
    if (rule.daysOfWeek && rule.daysOfWeek.length > 0) {
      const dayLabels = [...rule.daysOfWeek]
        .sort((a, b) => a - b)
        .map(d => DAY_NAMES[d])
        .join('・');
      label = `毎週 (${dayLabels})`;
    } else {
      label = '毎週';
    }
  } else if (rule.frequency === 'monthly') {
    if (rule.monthlyType === 'day_of_week' && rule.weekOfMonth && rule.dayOfWeek !== undefined) {
      label = `毎月 第${rule.weekOfMonth}${DAY_NAMES[rule.dayOfWeek]}曜日`;
    } else if (rule.monthDay) {
      label = `毎月 ${rule.monthDay}日`;
    } else {
      label = '毎月';
    }
  } else if (rule.frequency === 'yearly') {
    label = '毎年';
  }

  if (rule.endType === 'until_date' && rule.endDate) {
    label += `（${rule.endDate} まで）`;
  } else if (rule.endType === 'count' && rule.count) {
    label += `（${rule.count}回）`;
  }

  return label;
}

/**
 * イベントが繰り返し関連（親、インスタンス、オーバーライド）かどうか判定
 */
export function isRecurringEvent(event?: CalendarEvent | null): boolean {
  if (!event) return false;
  const rec = safeParseRecurrence(event.recurrence);
  return !!(
    (rec && rec.frequency !== 'none') ||
    event.recurrenceParentId ||
    event.instanceDate
  );
}

/**
 * 日付（YYYY-MM-DD）に日数を加算した新しい日付文字列を返す
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d + days, 12, 0, 0));
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 2つの日付文字列 (YYYY-MM-DD) の差分日数を計算する
 */
export function diffDays(startDateStr: string, endDateStr: string): number {
  const [y1, m1, d1] = startDateStr.split('-').map(Number);
  const [y2, m2, d2] = endDateStr.split('-').map(Number);
  const t1 = Date.UTC(y1, m1 - 1, d1, 12, 0, 0);
  const t2 = Date.UTC(y2, m2 - 1, d2, 12, 0, 0);
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

/**
 * ISO日時文字列の日付部分を新しい日付 (YYYY-MM-DD) に安全に差し替える（JST 基準）
 */
export function replaceDateInIso(isoStr: string | undefined, newDateStr: string, isAllDay = false): string | undefined {
  if (!isoStr && !newDateStr) return undefined;
  if (isAllDay) {
    return `${newDateStr}T00:00:00+09:00`;
  }
  const timePart = isoStr ? formatTimePartJST(isoStr) : '09:00:00';
  return `${newDateStr}T${timePart}+09:00`;
}

/**
 * 全イベント（通常 + 繰り返し親 + 個別オーバーライド）から、
 * 指定期間内に発生するすべてのインスタンスを展開して返す
 */
export function expandRecurringEvents(
  events: CalendarEvent[],
  viewStartDate: Date,
  viewEndDate: Date
): CalendarEvent[] {
  const result: CalendarEvent[] = [];

  const viewStartStr = getLocalDateStr(viewStartDate.toISOString());
  const viewEndStr = getLocalDateStr(viewEndDate.toISOString());

  // 1. 個別変更されたインスタンス（オーバーライド）のマップを作成
  const overrideMap = new Map<string, CalendarEvent>();
  const normalAndParentEvents: CalendarEvent[] = [];

  for (const ev of events) {
    const parentId = ev.recurrenceParentId;
    const origDate = ev.recurrenceOriginalDate || ev.instanceDate || (ev.start ? getLocalDateStr(ev.start) : undefined);
    if (parentId && parentId !== ev.id && origDate) {
      overrideMap.set(`${parentId}_${origDate}`, ev);
    } else {
      normalAndParentEvents.push(ev);
    }
  }

  // 2. 各イベントを処理
  for (const event of normalAndParentEvents) {
    const recurrence = safeParseRecurrence(event.recurrence);

    // 繰り返し設定がない単発イベント
    if (!recurrence || recurrence.frequency === 'none') {
      result.push(event);
      continue;
    }

    // 繰り返し親イベントの展開
    const eventStartDateStr = getLocalDateStr(event.start);
    const eventEndDateStr = event.end ? getLocalDateStr(event.end) : eventStartDateStr;
    const durationDays = Math.max(0, diffDays(eventStartDateStr, eventEndDateStr));

    const exceptions = new Set(safeParseExceptions(event.recurrenceExceptions));
    let count = 0;
    const maxCount = recurrence.endType === 'count' ? (recurrence.count || 999) : 999;
    const untilDateStr = recurrence.endType === 'until_date' ? recurrence.endDate : undefined;

    const [startYear, startMonth, startDay] = eventStartDateStr.split('-').map(Number);
    
    // 最大展開範囲：表示終了日またはイベント開始から2年後まで
    const maxFutureDate = new Date();
    maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 2);
    const maxLimitStr = getLocalDateStr(maxFutureDate.toISOString());
    const effectiveLimitEndStr = untilDateStr && untilDateStr < maxLimitStr ? untilDateStr : maxLimitStr;

    const isAllDay = !!event.isAllDay;

    const pushInstance = (currStr: string) => {
      const overrideKey = `${event.id}_${currStr}`;
      if (overrideMap.has(overrideKey)) {
        const ovr = overrideMap.get(overrideKey)!;
        result.push({
          ...event,
          ...ovr,
          createdBy: ovr.createdBy || event.createdBy,
          instanceDate: currStr,
        });
      } else {
        const instEndStr = durationDays > 0 ? addDays(currStr, durationDays) : currStr;
        result.push({
          ...event,
          createdBy: event.createdBy,
          id: `${event.id}_${currStr}`,
          recurrenceParentId: event.id,
          recurrenceOriginalDate: currStr,
          instanceDate: currStr,
          start: replaceDateInIso(event.start, currStr, isAllDay) || event.start,
          end: event.end ? replaceDateInIso(event.end, instEndStr, isAllDay) : undefined,
        });
      }
    };

    const shouldProcessOccurrence = (currStr: string) => {
      if (currStr >= viewStartStr && currStr <= viewEndStr) {
        const overrideKey = `${event.id}_${currStr}`;
        if (overrideMap.has(overrideKey) || !exceptions.has(currStr)) {
          pushInstance(currStr);
        }
      }
    };

    // 日毎の繰り返し (daily)
    if (recurrence.frequency === 'daily') {
      let currStr = eventStartDateStr;
      while (true) {
        if (currStr > effectiveLimitEndStr) break;
        if (currStr > viewEndStr && recurrence.endType !== 'count') break;

        count++;
        if (count > maxCount) break;

        shouldProcessOccurrence(currStr);

        currStr = addDays(currStr, 1);
      }
    } else if (recurrence.frequency === 'weekly') {
      const selectedDays = recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0 
        ? recurrence.daysOfWeek 
        : [getDayOfWeekFromDateStr(eventStartDateStr)];

      let currStr = eventStartDateStr;
      while (true) {
        if (currStr > effectiveLimitEndStr) break;
        if (currStr > viewEndStr && recurrence.endType !== 'count') break;

        const dayOfWeek = getDayOfWeekFromDateStr(currStr);
        if (selectedDays.includes(dayOfWeek)) {
          count++;
          if (count > maxCount) break;

          shouldProcessOccurrence(currStr);
        }

        currStr = addDays(currStr, 1);
      }
    } else if (recurrence.frequency === 'monthly') {
      let currentYear = startYear;
      let currentMonth = startMonth - 1;

      while (true) {
        let instanceDay: number | null = null;

        if (recurrence.monthlyType === 'day_of_week' && recurrence.weekOfMonth && recurrence.dayOfWeek !== undefined) {
          instanceDay = getNthWeekdayOfMonth(currentYear, currentMonth, recurrence.weekOfMonth, recurrence.dayOfWeek);
        } else {
          const targetDay = recurrence.monthDay || startDay;
          const daysInMonth = new Date(Date.UTC(currentYear, currentMonth + 1, 0, 12, 0, 0)).getUTCDate();
          instanceDay = Math.min(targetDay, daysInMonth);
        }

        if (instanceDay !== null) {
          const mStr = String(currentMonth + 1).padStart(2, '0');
          const dStr = String(instanceDay).padStart(2, '0');
          const currStr = `${currentYear}-${mStr}-${dStr}`;

          if (currStr >= eventStartDateStr) {
            if (currStr > effectiveLimitEndStr) break;
            if (currStr > viewEndStr && recurrence.endType !== 'count') break;

            count++;
            if (count > maxCount) break;

            shouldProcessOccurrence(currStr);
          }
        }

        currentMonth++;
        if (currentMonth > 11) {
          currentMonth = 0;
          currentYear++;
        }

        const testMonthStr = String(currentMonth + 1).padStart(2, '0');
        const testStr = `${currentYear}-${testMonthStr}-01`;
        if (testStr > effectiveLimitEndStr) {
          break;
        }
      }
    } else if (recurrence.frequency === 'yearly') {
      let currentYear = startYear;
      while (true) {
        const mStr = String(startMonth).padStart(2, '0');
        const dStr = String(startDay).padStart(2, '0');
        const currStr = `${currentYear}-${mStr}-${dStr}`;

        if (currStr > effectiveLimitEndStr) break;
        if (currStr > viewEndStr && recurrence.endType !== 'count') break;

        count++;
        if (count > maxCount) break;

        shouldProcessOccurrence(currStr);

        currentYear++;
      }
    }
  }

  // 3. 親が見つからない孤立したオーバーライドイベントも拾う
  for (const [, ovr] of overrideMap.entries()) {
    if (!result.some(r => r.id === ovr.id)) {
      result.push(ovr);
    }
  }

  return result;
}

/**
 * 繰り返し予定の編集処理（スコープに応じた分割・更新）
 */
export interface RecurrencePlanResult {
  updatedEvents: CalendarEvent[];
  toSave: CalendarEvent[];
  toDelete: string[];
}

export function planRecurrenceSave(
  allEvents: CalendarEvent[],
  eventData: CalendarEvent | (Omit<CalendarEvent, 'id'> & { id?: string }),
  scope: RecurrenceActionScope = 'all',
  instanceDate?: string
): RecurrencePlanResult {
  const toSave: CalendarEvent[] = [];
  const toDelete: string[] = [];
  let currentEvents = [...allEvents];

  // 親イベントIDの特定
  const rawId = eventData.id || '';
  const isExpandedId = rawId.includes('_');

  let parentId = eventData.recurrenceParentId;
  if (!parentId && isExpandedId) {
    parentId = rawId.split('_')[0];
  }
  if (!parentId && rawId) {
    const rawMatch = currentEvents.find(e => e.id === rawId);
    if (rawMatch?.recurrenceParentId) {
      parentId = rawMatch.recurrenceParentId;
    } else if (rawMatch && ((rawMatch.recurrence && rawMatch.recurrence.frequency && rawMatch.recurrence.frequency !== 'none') || rawMatch.recurrenceExceptions)) {
      parentId = rawId;
    }
  }

  const parentEvent = parentId ? currentEvents.find(e => e.id === parentId) : null;

  // 元のインスタンス日付と新しい日付の特定
  const origDate = (eventData as any).recurrenceOriginalDate || (eventData as any).instanceDate || instanceDate || (isExpandedId ? rawId.split('_')[1] : undefined);
  const newStartIso = eventData.start || parentEvent?.start || new Date().toISOString();
  const newDate = getLocalDateStr(newStartIso);
  const targetDate = origDate || newDate;

  if (!parentEvent || scope === 'all' || !targetDate) {
    // 1. 全ての予定を変更 (親予定そのものを更新)
    const targetId = parentId || (rawId && !isExpandedId ? rawId : `e-recur-${Date.now()}`);
    const updatedParent: CalendarEvent = {
      ...(parentEvent || {}),
      ...eventData,
      createdBy: eventData.createdBy || parentEvent?.createdBy,
      createdById: (eventData as any).createdById || eventData.createdBy?.id || parentEvent?.createdBy?.id,
      id: targetId,
      recurrenceParentId: undefined,
      recurrenceOriginalDate: undefined,
      instanceDate: undefined,
    };

    // 親の全変更に伴い、紐づいていた古いオーバーライド子イベントは全リセットのためDB削除対象へ
    if (targetId) {
      const childEvents = currentEvents.filter(e => e.recurrenceParentId === targetId && e.id !== targetId);
      for (const child of childEvents) {
        const realChildId = child.id.includes('_') ? child.id.split('_')[0] : child.id;
        if (realChildId && !toDelete.includes(realChildId)) {
          toDelete.push(realChildId);
        }
      }
      currentEvents = currentEvents.filter(e => e.recurrenceParentId !== targetId || e.id === targetId);
    }

    currentEvents = currentEvents.map(e => e.id === targetId ? updatedParent : e);
    if (!currentEvents.some(e => e.id === targetId)) {
      currentEvents.push(updatedParent);
    }
    toSave.push(updatedParent);

    return { updatedEvents: currentEvents, toSave, toDelete };
  }

  if (scope === 'this_only') {
    // 2. このスケジュールのみ変更
    // ① 親イベントの recurrenceExceptions に対象日付（元の発生日）を追加
    const existingExceptions = safeParseExceptions(parentEvent.recurrenceExceptions);
    const updatedExceptions = Array.from(new Set([
      ...existingExceptions,
      ...(origDate ? [origDate] : []),
      ...(targetDate ? [targetDate] : [])
    ]));
    const updatedParent: CalendarEvent = {
      ...parentEvent,
      recurrenceExceptions: updatedExceptions,
    };
    currentEvents = currentEvents.map(e => e.id === parentEvent.id ? updatedParent : e);
    toSave.push(updatedParent);

    // ② この日専用の単発イベント（オーバーライド）を作成または更新
    const existingOvr = allEvents.find(e =>
      e.recurrenceParentId === parentEvent.id &&
      (e.recurrenceOriginalDate === origDate || e.instanceDate === origDate || e.id === rawId)
    );

    let overrideId = existingOvr?.id;
    if (!overrideId && rawId && !isExpandedId && rawId.startsWith('e-ovr-')) {
      overrideId = rawId;
    }
    if (!overrideId) {
      overrideId = `e-ovr-${parentEvent.id}-${(origDate || newDate || '').replace(/-/g, '')}`;
    }

    const overrideEvent: CalendarEvent = {
      ...parentEvent,
      ...eventData,
      createdBy: eventData.createdBy || parentEvent.createdBy,
      createdById: (eventData as any).createdById || eventData.createdBy?.id || parentEvent.createdBy?.id,
      id: overrideId,
      recurrence: undefined, // 単発化
      recurrenceParentId: parentEvent.id,
      recurrenceOriginalDate: origDate || targetDate,
      instanceDate: newDate || targetDate,
    };

    if (rawId && rawId !== overrideId && !isExpandedId) {
      toDelete.push(rawId);
    }

    currentEvents = currentEvents.filter(e => e.id !== overrideId && e.id !== rawId);
    currentEvents.push(overrideEvent);
    toSave.push(overrideEvent);

    return { updatedEvents: currentEvents, toSave, toDelete };
  }

  if (scope === 'this_and_following') {
    // 3. これ以降全てのスケジュールを変更
    const dayBefore = addDays(targetDate, -1);
    const parentStartStr = parentEvent.start ? getLocalDateStr(parentEvent.start) : targetDate;

    if (dayBefore < parentStartStr) {
      // 対象日が親の初回発生日以前なら、親イベント自体を更新
      const updatedParent: CalendarEvent = {
        ...parentEvent,
        ...eventData,
        createdBy: eventData.createdBy || parentEvent.createdBy,
        createdById: (eventData as any).createdById || eventData.createdBy?.id || parentEvent.createdBy?.id,
        id: parentEvent.id,
        recurrenceParentId: undefined,
        recurrenceOriginalDate: undefined,
        instanceDate: undefined,
      };
      currentEvents = currentEvents.map(e => e.id === parentEvent.id ? updatedParent : e);
      toSave.push(updatedParent);
    } else {
      // ① 旧親イベントの繰り返し終了日を「対象日の前日」に設定（有限データ化）
      const updatedParentRule: RecurrenceRule = {
        ...(safeParseRecurrence(parentEvent.recurrence) || { frequency: 'weekly', endType: 'never' }),
        endType: 'until_date',
        endDate: dayBefore,
      };
      const updatedParent: CalendarEvent = {
        ...parentEvent,
        recurrence: updatedParentRule,
      };
      currentEvents = currentEvents.map(e => e.id === parentEvent.id ? updatedParent : e);
      toSave.push(updatedParent);

      // ② 旧親イベントに紐づいていた対象日以降の古い子オーバーライドイベントを削除対象に追加
      const oldChildEvents = currentEvents.filter(e =>
        e.recurrenceParentId === parentEvent.id &&
        ((e.recurrenceOriginalDate && e.recurrenceOriginalDate >= targetDate) ||
         (e.instanceDate && e.instanceDate >= targetDate))
      );
      for (const child of oldChildEvents) {
        const realChildId = child.id.includes('_') ? child.id.split('_')[0] : child.id;
        if (realChildId && !toDelete.includes(realChildId)) {
          toDelete.push(realChildId);
        }
      }
      currentEvents = currentEvents.filter(e => !toDelete.includes(e.id));

      // ③ 対象日を開始日とする新しい繰り返し親イベントを作成
      const newRecurrenceId = `e-recur-split-${Date.now()}`;
      const newRecurrenceRule: RecurrenceRule = eventData.recurrence ? {
        ...eventData.recurrence,
      } : {
        ...(safeParseRecurrence(parentEvent.recurrence) || { frequency: 'weekly', endType: 'never' }),
      };

      const newRecurrenceEvent: CalendarEvent = {
        ...parentEvent,
        ...eventData,
        createdBy: eventData.createdBy || parentEvent.createdBy,
        createdById: (eventData as any).createdById || eventData.createdBy?.id || parentEvent.createdBy?.id,
        id: newRecurrenceId,
        recurrence: newRecurrenceRule,
        recurrenceParentId: undefined,
        recurrenceOriginalDate: undefined,
        instanceDate: undefined,
        recurrenceExceptions: undefined,
      };
      currentEvents.push(newRecurrenceEvent);
      toSave.push(newRecurrenceEvent);
    }

    return { updatedEvents: currentEvents, toSave, toDelete };
  }

  return { updatedEvents: currentEvents, toSave, toDelete };
}

/**
 * 繰り返し予定の削除処理（スコープに応じた除外・切り上げ・削除）
 */
export function planRecurrenceDelete(
  allEvents: CalendarEvent[],
  eventId: string,
  scope: RecurrenceActionScope = 'all',
  instanceDate?: string
): RecurrencePlanResult {
  const toSave: CalendarEvent[] = [];
  const toDelete: string[] = [];
  let currentEvents = [...allEvents];

  // 対象イベントと親イベントの特定
  const targetEvent = currentEvents.find(e => e.id === eventId);
  const isExpandedInstance = eventId.includes('_');

  let parentId = targetEvent?.recurrenceParentId;
  if (!parentId && isExpandedInstance) {
    parentId = eventId.split('_')[0];
  }
  if (!parentId && eventId) {
    const rawMatch = currentEvents.find(e => e.id === eventId);
    if (rawMatch?.recurrenceParentId) {
      parentId = rawMatch.recurrenceParentId;
    } else if (rawMatch && ((rawMatch.recurrence && rawMatch.recurrence.frequency && rawMatch.recurrence.frequency !== 'none') || rawMatch.recurrenceExceptions)) {
      parentId = eventId;
    }
  }

  const parentEvent = currentEvents.find(e => e.id === parentId);
  const targetDate = instanceDate || targetEvent?.instanceDate || (targetEvent as any)?.recurrenceOriginalDate || (isExpandedInstance ? eventId.split('_')[1] : (targetEvent?.start ? getLocalDateStr(targetEvent.start) : undefined));

  if (!parentEvent || scope === 'all' || !targetDate) {
    // 1. 全てのスケジュールを削除
    const deleteId = parentId || (isExpandedInstance ? eventId.split('_')[0] : eventId);

    const relatedEvents = allEvents.filter(e => e.id === deleteId || e.recurrenceParentId === deleteId || e.id === eventId);
    for (const rel of relatedEvents) {
      const realId = rel.id.includes('_') ? rel.id.split('_')[0] : rel.id;
      if (realId && !toDelete.includes(realId)) {
        toDelete.push(realId);
      }
    }
    if (deleteId && !toDelete.includes(deleteId)) {
      toDelete.push(deleteId);
    }

    currentEvents = currentEvents.filter(e => e.id !== deleteId && e.recurrenceParentId !== deleteId && !toDelete.includes(e.id));

    return { updatedEvents: currentEvents, toSave, toDelete };
  }

  if (scope === 'this_only') {
    // 2. このスケジュールのみ削除
    // ① 親イベントの recurrenceExceptions に対象日付を追加
    const existingExceptions = safeParseExceptions(parentEvent.recurrenceExceptions);
    const updatedExceptions = Array.from(new Set([...existingExceptions, targetDate]));
    const updatedParent: CalendarEvent = {
      ...parentEvent,
      recurrenceExceptions: updatedExceptions,
    };
    currentEvents = currentEvents.map(e => e.id === parentEvent.id ? updatedParent : e);
    toSave.push(updatedParent);

    // ② もしこの日専用の個別オーバーライドレコードがDBにあれば削除対象に追加
    const overrideKeyDate = targetDate.replace(/-/g, '');
    const matchingOverrides = currentEvents.filter(e =>
      e.recurrenceParentId === parentEvent.id &&
      (e.recurrenceOriginalDate === targetDate || e.instanceDate === targetDate || e.id.includes(overrideKeyDate))
    );
    for (const ovr of matchingOverrides) {
      const realOvrId = ovr.id.includes('_') ? ovr.id.split('_')[0] : ovr.id;
      if (realOvrId && !toDelete.includes(realOvrId)) {
        toDelete.push(realOvrId);
      }
      currentEvents = currentEvents.filter(e => e.id !== ovr.id);
    }

    return { updatedEvents: currentEvents, toSave, toDelete };
  }

  if (scope === 'this_and_following') {
    // 3. これ以降全てのスケジュールを削除
    // 親イベントの繰り返し終了日を対象日の前日に短縮（有限データ化）
    const dayBefore = addDays(targetDate, -1);
    const parentStartStr = parentEvent.start ? getLocalDateStr(parentEvent.start) : targetDate;

    if (dayBefore < parentStartStr) {
      if (!toDelete.includes(parentEvent.id)) {
        toDelete.push(parentEvent.id);
      }
      const childEvents = currentEvents.filter(e => e.recurrenceParentId === parentEvent.id);
      for (const child of childEvents) {
        const realId = child.id.includes('_') ? child.id.split('_')[0] : child.id;
        if (realId && !toDelete.includes(realId)) toDelete.push(realId);
      }
      currentEvents = currentEvents.filter(e => !toDelete.includes(e.id));
    } else {
      const updatedParentRule: RecurrenceRule = {
        ...(safeParseRecurrence(parentEvent.recurrence) || { frequency: 'weekly', endType: 'never' }),
        endType: 'until_date',
        endDate: dayBefore,
      };
      const updatedParent: CalendarEvent = {
        ...parentEvent,
        recurrence: updatedParentRule,
      };
      currentEvents = currentEvents.map(e => e.id === parentEvent.id ? updatedParent : e);
      toSave.push(updatedParent);

      // 対象日以降のオーバーライドイベントをDB削除対象に追加
      const followingOverrides = currentEvents.filter(
        e => e.recurrenceParentId === parentEvent.id &&
        ((e.recurrenceOriginalDate && e.recurrenceOriginalDate >= targetDate) ||
         (e.instanceDate && e.instanceDate >= targetDate))
      );
      for (const fo of followingOverrides) {
        const realFoId = fo.id.includes('_') ? fo.id.split('_')[0] : fo.id;
        if (realFoId && !toDelete.includes(realFoId)) {
          toDelete.push(realFoId);
        }
        currentEvents = currentEvents.filter(e => e.id !== fo.id);
      }
    }

    return { updatedEvents: currentEvents, toSave, toDelete };
  }

  return { updatedEvents: currentEvents, toSave, toDelete };
}
