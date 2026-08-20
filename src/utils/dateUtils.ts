// 日本標準時（Asia/Tokyo JST）統一ユーティリティ

/**
 * ISO文字列やDateオブジェクトを JST (Asia/Tokyo) の 'YYYY-MM-DD' 形式文字列に変換
 */
export function getLocalDateStr(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return '';

  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) {
    if (typeof dateInput === 'string') {
      return dateInput.split('T')[0] || '';
    }
    return '';
  }

  // Asia/Tokyo タイムゾーンで YYYY-MM-DD を正確に取得
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;

  return `${year}-${month}-${day}`;
}

/**
 * JST で日時（例: 2026/08/17 08:30）にフォーマット
 */
export function formatDateTimeJST(
  dateInput: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return String(dateInput);

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };

  return new Intl.DateTimeFormat('ja-JP', defaultOptions).format(d);
}

/**
 * JST で日付（例: 2026/08/17）にフォーマット
 */
export function formatDateJST(
  dateInput: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return String(dateInput);

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...options,
  };

  return new Intl.DateTimeFormat('ja-JP', defaultOptions).format(d);
}

/**
 * JST で時刻（例: 08:30）にフォーマット
 */
export function formatTimeJST(
  dateInput: Date | string | number | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  if (!dateInput) return '';
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return String(dateInput);

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    ...options,
  };

  return new Intl.DateTimeFormat('ja-JP', defaultOptions).format(d);
}

/**
 * local ISO 文字列 ('YYYY-MM-DDTHH:mm') に分数を加算
 */
export function addMinutesToLocalDatetime(localDatetimeStr: string, minutesToAdd: number): string {
  if (!localDatetimeStr || !localDatetimeStr.includes('T')) return '';
  const [datePart, timePart] = localDatetimeStr.split('T');
  const [h, m] = (timePart || '00:00').split(':').map(Number);
  const [year, month, day] = datePart.split('-').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(h) || isNaN(m)) return '';

  const d = new Date(year, month - 1, day, h, m + minutesToAdd);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/**
 * 2つの 'YYYY-MM-DDTHH:mm' 間の差分（分単位）を計算
 */
export function getMinutesDifference(startStr: string, endStr: string): number | null {
  if (!startStr || !endStr || !startStr.includes('T') || !endStr.includes('T')) return null;
  const [sDate, sTime] = startStr.split('T');
  const [eDate, eTime] = endStr.split('T');
  const [sY, sM, sD] = sDate.split('-').map(Number);
  const [sH, sMin] = sTime.split(':').map(Number);
  const [eY, eM, eD] = eDate.split('-').map(Number);
  const [eH, eMin] = eTime.split(':').map(Number);

  const startDate = new Date(sY, sM - 1, sD, sH, sMin);
  const endDate = new Date(eY, eM - 1, eD, eH, eMin);

  const diffMs = endDate.getTime() - startDate.getTime();
  if (isNaN(diffMs)) return null;
  return Math.round(diffMs / (60 * 1000));
}

/**
 * JST で時刻部分（例: 08:30:00）のみを正確に取得
 */
export function formatTimePartJST(dateInput: Date | string | number | null | undefined): string {
  if (!dateInput) return '09:00:00';
  const d = typeof dateInput === 'string' || typeof dateInput === 'number' ? new Date(dateInput) : dateInput;
  if (isNaN(d.getTime())) return '09:00:00';

  const defaultOptions: Intl.DateTimeFormatOptions = {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  };

  const parts = new Intl.DateTimeFormat('ja-JP', defaultOptions).formatToParts(d);
  const hour = parts.find(p => p.type === 'hour')?.value || '09';
  const minute = parts.find(p => p.type === 'minute')?.value || '00';
  const second = parts.find(p => p.type === 'second')?.value || '00';
  return `${hour}:${minute}:${second}`;
}
