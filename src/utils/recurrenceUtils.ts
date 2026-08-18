import { CalendarEvent, RecurrenceRule } from '../types';
import { getLocalDateStr } from './dateUtils';
import { RecurrenceActionScope } from '../components/RecurrenceActionModal';

const DAY_NAMES = ['日', '月', '火', '水', '木', '金', '土'];

/**
 * 指定した年・月・第N週・曜日の日付 (日: 1~31) を計算する
 * @param year 
 * @param month 0-indexed (0: 1月, 11: 12月)
 * @param weekOfMonth 1: 第1, 2: 第2, 3: 第3, 4: 第4, 5: 第5
 * @param dayOfWeek 0: 日, 1: 月, ..., 6: 土
 */
export function getNthWeekdayOfMonth(year: number, month: number, weekOfMonth: number, dayOfWeek: number): number | null {
  const firstDay = new Date(year, month, 1);
  const firstDayOfWeek = firstDay.getDay();
  
  let offset = dayOfWeek - firstDayOfWeek;
  if (offset < 0) offset += 7;
  
  const day = 1 + offset + (weekOfMonth - 1) * 7;
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  
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
export function getRecurrenceLabel(rule?: RecurrenceRule): string {
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
  return !!(
    (event.recurrence && event.recurrence.frequency !== 'none') ||
    event.recurrenceParentId ||
    event.instanceDate
  );
}

/**
 * 日付（YYYY-MM-DD）に日数を加算した新しい日付文字列を返す
 */
export function addDays(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number);
  const date = new Date(y, m - 1, d + days);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * 2つの日付文字列 (YYYY-MM-DD) の差分日数を計算する
 */
export function diffDays(startDateStr: string, endDateStr: string): number {
  const [y1, m1, d1] = startDateStr.split('-').map(Number);
  const [y2, m2, d2] = endDateStr.split('-').map(Number);
  const t1 = new Date(y1, m1 - 1, d1).getTime();
  const t2 = new Date(y2, m2 - 1, d2).getTime();
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

/**
 * ISO日時文字列の日付部分を新しい日付 (YYYY-MM-DD) に差し替える
 */
export function replaceDateInIso(isoStr: string | undefined, newDateStr: string): string | undefined {
  if (!isoStr) return undefined;
  const timeMatch = isoStr.match(/T(\d{2}:\d{2}(?::\d{2})?(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?)$/);
  if (timeMatch) {
    return `${newDateStr}T${timeMatch[1]}`;
  }
  return `${newDateStr}T09:00:00`;
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
    if (ev.recurrenceParentId && ev.recurrenceOriginalDate) {
      overrideMap.set(`${ev.recurrenceParentId}_${ev.recurrenceOriginalDate}`, ev);
    } else {
      normalAndParentEvents.push(ev);
    }
  }

  // 2. 各イベントを処理
  for (const event of normalAndParentEvents) {
    const recurrence = event.recurrence;

    // 繰り返し設定がない単発イベント
    if (!recurrence || recurrence.frequency === 'none') {
      result.push(event);
      continue;
    }

    // 繰り返し親イベントの展開
    const eventStartDateStr = getLocalDateStr(event.start);
    const eventEndDateStr = event.end ? getLocalDateStr(event.end) : eventStartDateStr;
    const durationDays = Math.max(0, diffDays(eventStartDateStr, eventEndDateStr));

    const exceptions = new Set(event.recurrenceExceptions || []);
    let count = 0;
    const maxCount = recurrence.endType === 'count' ? (recurrence.count || 999) : 999;
    const untilDateStr = recurrence.endType === 'until_date' ? recurrence.endDate : undefined;

    const [startYear, startMonth, startDay] = eventStartDateStr.split('-').map(Number);
    
    // 最大展開範囲：表示終了日またはイベント開始から2年後まで
    const maxFutureDate = new Date();
    maxFutureDate.setFullYear(maxFutureDate.getFullYear() + 2);
    const maxLimitStr = getLocalDateStr(maxFutureDate.toISOString());
    const effectiveLimitEndStr = untilDateStr && untilDateStr < maxLimitStr ? untilDateStr : maxLimitStr;

    // 週・日・月ごとのステップ処理
    if (recurrence.frequency === 'daily') {
      let currDate = new Date(startYear, startMonth - 1, startDay);
      while (true) {
        const currStr = getLocalDateStr(currDate.toISOString());
        if (currStr > effectiveLimitEndStr) break;
        if (currStr > viewEndStr && count >= maxCount) break;

        count++;
        if (count > maxCount) break;

        if (!exceptions.has(currStr)) {
          const overrideKey = `${event.id}_${currStr}`;
          if (overrideMap.has(overrideKey)) {
            const ovr = overrideMap.get(overrideKey)!;
            result.push({
              ...ovr,
              instanceDate: currStr
            });
          } else {
            const instEndStr = durationDays > 0 ? addDays(currStr, durationDays) : currStr;
            result.push({
              ...event,
              id: `${event.id}_${currStr}`,
              recurrenceParentId: event.id,
              recurrenceOriginalDate: currStr,
              instanceDate: currStr,
              start: replaceDateInIso(event.start, currStr) || event.start,
              end: event.end ? replaceDateInIso(event.end, instEndStr) : undefined,
            });
          }
        }

        currDate.setDate(currDate.getDate() + 1);
      }
    } else if (recurrence.frequency === 'weekly') {
      const selectedDays = recurrence.daysOfWeek && recurrence.daysOfWeek.length > 0 
        ? recurrence.daysOfWeek 
        : [new Date(startYear, startMonth - 1, startDay).getDay()];

      let currDate = new Date(startYear, startMonth - 1, startDay);
      while (true) {
        const currStr = getLocalDateStr(currDate.toISOString());
        if (currStr > effectiveLimitEndStr) break;
        if (currStr > viewEndStr && count >= maxCount) break;

        const dayOfWeek = currDate.getDay();
        if (selectedDays.includes(dayOfWeek)) {
          count++;
          if (count > maxCount) break;

          if (!exceptions.has(currStr)) {
            const overrideKey = `${event.id}_${currStr}`;
            if (overrideMap.has(overrideKey)) {
              const ovr = overrideMap.get(overrideKey)!;
              result.push({
                ...ovr,
                instanceDate: currStr
              });
            } else {
              const instEndStr = durationDays > 0 ? addDays(currStr, durationDays) : currStr;
              result.push({
                ...event,
                id: `${event.id}_${currStr}`,
                recurrenceParentId: event.id,
                recurrenceOriginalDate: currStr,
                instanceDate: currStr,
                start: replaceDateInIso(event.start, currStr) || event.start,
                end: event.end ? replaceDateInIso(event.end, instEndStr) : undefined,
              });
            }
          }
        }

        currDate.setDate(currDate.getDate() + 1);
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
          const daysInMonth = new Date(currentYear, currentMonth + 1, 0).getDate();
          instanceDay = Math.min(targetDay, daysInMonth);
        }

        if (instanceDay !== null) {
          const instDate = new Date(currentYear, currentMonth, instanceDay);
          const currStr = getLocalDateStr(instDate.toISOString());

          if (currStr >= eventStartDateStr) {
            if (currStr > effectiveLimitEndStr) break;
            if (currStr > viewEndStr && count >= maxCount) break;

            count++;
            if (count > maxCount) break;

            if (!exceptions.has(currStr)) {
              const overrideKey = `${event.id}_${currStr}`;
              if (overrideMap.has(overrideKey)) {
                const ovr = overrideMap.get(overrideKey)!;
                result.push({
                  ...ovr,
                  instanceDate: currStr
                });
              } else {
                const instEndStr = durationDays > 0 ? addDays(currStr, durationDays) : currStr;
                result.push({
                  ...event,
                  id: `${event.id}_${currStr}`,
                  recurrenceParentId: event.id,
                  recurrenceOriginalDate: currStr,
                  instanceDate: currStr,
                  start: replaceDateInIso(event.start, currStr) || event.start,
                  end: event.end ? replaceDateInIso(event.end, instEndStr) : undefined,
                });
              }
            }
          }
        }

        currentMonth++;
        if (currentMonth > 11) {
          currentMonth = 0;
          currentYear++;
        }

        const testDate = new Date(currentYear, currentMonth, 1);
        if (getLocalDateStr(testDate.toISOString()) > effectiveLimitEndStr) {
          break;
        }
      }
    } else if (recurrence.frequency === 'yearly') {
      let currentYear = startYear;
      while (true) {
        const instDate = new Date(currentYear, startMonth - 1, startDay);
        const currStr = getLocalDateStr(instDate.toISOString());
        if (currStr > effectiveLimitEndStr) break;
        if (currStr > viewEndStr && count >= maxCount) break;

        count++;
        if (count > maxCount) break;

        if (!exceptions.has(currStr)) {
          const overrideKey = `${event.id}_${currStr}`;
          if (overrideMap.has(overrideKey)) {
            const ovr = overrideMap.get(overrideKey)!;
            result.push({
              ...ovr,
              instanceDate: currStr
            });
          } else {
            const instEndStr = durationDays > 0 ? addDays(currStr, durationDays) : currStr;
            result.push({
              ...event,
              id: `${event.id}_${currStr}`,
              recurrenceParentId: event.id,
              recurrenceOriginalDate: currStr,
              instanceDate: currStr,
              start: replaceDateInIso(event.start, currStr) || event.start,
              end: event.end ? replaceDateInIso(event.end, instEndStr) : undefined,
            });
          }
        }

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
  const parentId = eventData.recurrenceParentId || (eventData.id && !eventData.id.includes('_') ? eventData.id : undefined);
  const parentEvent = parentId ? currentEvents.find(e => e.id === parentId) : null;
  const targetDate = instanceDate || (eventData.start ? getLocalDateStr(eventData.start) : undefined);

  if (!parentEvent || scope === 'all' || !targetDate) {
    // 1. 全ての予定を変更 (親予定そのものを更新)
    const targetId = parentId || eventData.id || `e-recur-${Date.now()}`;
    const updatedParent: CalendarEvent = {
      ...(parentEvent || {}),
      ...eventData,
      id: targetId,
      recurrenceParentId: undefined,
      recurrenceOriginalDate: undefined,
      instanceDate: undefined,
    };

    currentEvents = currentEvents.map(e => e.id === targetId ? updatedParent : e);
    if (!currentEvents.some(e => e.id === targetId)) {
      currentEvents.push(updatedParent);
    }
    toSave.push(updatedParent);

    return { updatedEvents: currentEvents, toSave, toDelete };
  }

  if (scope === 'this_only') {
    // 2. このスケジュールのみ変更
    // ① 親イベントの recurrenceExceptions に対象日付を追加
    const existingExceptions = parentEvent.recurrenceExceptions || [];
    const updatedExceptions = Array.from(new Set([...existingExceptions, targetDate]));
    const updatedParent: CalendarEvent = {
      ...parentEvent,
      recurrenceExceptions: updatedExceptions,
    };
    currentEvents = currentEvents.map(e => e.id === parentEvent.id ? updatedParent : e);
    toSave.push(updatedParent);

    // ② この日専用の単発イベント（オーバーライド）を作成
    const overrideId = `e-ovr-${parentEvent.id}-${targetDate.replace(/-/g, '')}`;
    const overrideEvent: CalendarEvent = {
      ...eventData,
      id: overrideId,
      recurrence: undefined, // 単発化
      recurrenceParentId: parentEvent.id,
      recurrenceOriginalDate: targetDate,
      instanceDate: targetDate,
    };

    currentEvents = currentEvents.filter(e => e.id !== overrideId);
    currentEvents.push(overrideEvent);
    toSave.push(overrideEvent);

    return { updatedEvents: currentEvents, toSave, toDelete };
  }

  if (scope === 'this_and_following') {
    // 3. これ以降全てのスケジュールを変更
    // ① 親イベントの繰り返し終了日を「対象日の前日」に設定
    const dayBefore = addDays(targetDate, -1);
    const updatedParent: CalendarEvent = {
      ...parentEvent,
      recurrence: {
        ...(parentEvent.recurrence || { frequency: 'weekly' }),
        endType: 'until_date',
        endDate: dayBefore,
      },
    };
    currentEvents = currentEvents.map(e => e.id === parentEvent.id ? updatedParent : e);
    toSave.push(updatedParent);

    // ② 対象日を開始日とする新しい繰り返しイベントを作成
    const newRecurrenceId = `e-recur-split-${Date.now()}`;
    const newRecurrenceEvent: CalendarEvent = {
      ...eventData,
      id: newRecurrenceId,
      recurrenceParentId: undefined,
      recurrenceOriginalDate: undefined,
      instanceDate: undefined,
    };
    currentEvents.push(newRecurrenceEvent);
    toSave.push(newRecurrenceEvent);

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
  const parentId = targetEvent?.recurrenceParentId || (eventId.includes('_') ? eventId.split('_')[0] : eventId);
  const parentEvent = currentEvents.find(e => e.id === parentId);
  const targetDate = instanceDate || targetEvent?.instanceDate || (targetEvent?.start ? getLocalDateStr(targetEvent.start) : undefined);

  if (!parentEvent || scope === 'all' || !targetDate) {
    // 1. 全てのスケジュールを削除
    const deleteId = parentId || eventId;
    currentEvents = currentEvents.filter(e => e.id !== deleteId && e.recurrenceParentId !== deleteId);
    toDelete.push(deleteId);

    return { updatedEvents: currentEvents, toSave, toDelete };
  }

  if (scope === 'this_only') {
    // 2. このスケジュールのみ削除
    // ① 親イベントの recurrenceExceptions に対象日付を追加
    const existingExceptions = parentEvent.recurrenceExceptions || [];
    const updatedExceptions = Array.from(new Set([...existingExceptions, targetDate]));
    const updatedParent: CalendarEvent = {
      ...parentEvent,
      recurrenceExceptions: updatedExceptions,
    };
    currentEvents = currentEvents.map(e => e.id === parentEvent.id ? updatedParent : e);
    toSave.push(updatedParent);

    // もし既存のオーバーライドイベントが存在する場合はそれも削除
    const overrideId = `e-ovr-${parentEvent.id}-${targetDate.replace(/-/g, '')}`;
    if (currentEvents.some(e => e.id === overrideId)) {
      currentEvents = currentEvents.filter(e => e.id !== overrideId);
      toDelete.push(overrideId);
    }

    return { updatedEvents: currentEvents, toSave, toDelete };
  }

  if (scope === 'this_and_following') {
    // 3. これ以降全てのスケジュールを削除
    // 親イベントの繰り返し終了日を対象日の前日に短縮
    const dayBefore = addDays(targetDate, -1);
    const updatedParent: CalendarEvent = {
      ...parentEvent,
      recurrence: {
        ...(parentEvent.recurrence || { frequency: 'weekly' }),
        endType: 'until_date',
        endDate: dayBefore,
      },
    };
    currentEvents = currentEvents.map(e => e.id === parentEvent.id ? updatedParent : e);
    toSave.push(updatedParent);

    // 対象日以降のオーバーライドイベントを削除
    const followingOverrides = currentEvents.filter(
      e => e.recurrenceParentId === parentEvent.id && e.recurrenceOriginalDate && e.recurrenceOriginalDate >= targetDate
    );
    for (const fo of followingOverrides) {
      currentEvents = currentEvents.filter(e => e.id !== fo.id);
      toDelete.push(fo.id);
    }

    return { updatedEvents: currentEvents, toSave, toDelete };
  }

  return { updatedEvents: currentEvents, toSave, toDelete };
}
