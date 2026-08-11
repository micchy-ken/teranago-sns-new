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
