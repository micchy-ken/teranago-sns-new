import { getJstDateParts, formatTimeJST, getLocalDateStr } from './utils/dateUtils';

export function formatRelativeTime(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  // 未来の日時の場合（誤って未来の日時が渡された場合の安全処理）
  if (diffInSeconds < 0) {
    const dParts = getJstDateParts(date);
    const nowParts = getJstDateParts(now);
    const isSameYear = dParts.year === nowParts.year;
    const h = String(dParts.hour).padStart(2, '0');
    const min = String(dParts.minute).padStart(2, '0');
    if (isSameYear) {
      return `${dParts.month}/${dParts.day} ${h}:${min}`;
    }
    return `${dParts.year}/${dParts.month}/${dParts.day}`;
  }


  if (diffInSeconds < 60) return 'たった今';
  
  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}分前`;
  
  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}時間前`;
  
  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}日前`;

  const isSameYear = date.getFullYear() === now.getFullYear();
  const m = date.getMonth() + 1;
  const d = date.getDate();
  if (isSameYear) {
    return `${m}月${d}日`;
  }

  return new Intl.DateTimeFormat('ja-JP', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric' 
  }).format(date);
}

/**
 * 予定（スケジュール）の実施日時を分かりやすくバッジ形式でフォーマット（日本標準時 JST 厳格準拠）
 * 例: "8/25(火) 09:00〜10:00", "8/25(火) 終日"
 */
export function formatEventScheduleBadge(startIso: string, endIso?: string, isAllDay?: boolean): string {
  if (!startIso) return '';
  const sParts = getJstDateParts(startIso);

  if (isAllDay) {
    return `${sParts.month}/${sParts.day}(${sParts.weekdayShort}) 終日`;
  }

  const startH = String(sParts.hour).padStart(2, '0');
  const startM = String(sParts.minute).padStart(2, '0');

  if (!endIso) {
    return `${sParts.month}/${sParts.day}(${sParts.weekdayShort}) ${startH}:${startM}`;
  }

  const eParts = getJstDateParts(endIso);
  const endH = String(eParts.hour).padStart(2, '0');
  const endM = String(eParts.minute).padStart(2, '0');

  // 同日の場合は時間のみ範囲表示
  const isSameDay = getLocalDateStr(startIso) === getLocalDateStr(endIso);
  if (isSameDay) {
    return `${sParts.month}/${sParts.day}(${sParts.weekdayShort}) ${startH}:${startM}〜${endH}:${endM}`;
  }

  // 日を跨ぐ場合
  return `${sParts.month}/${sParts.day}(${sParts.weekdayShort}) ${startH}:${startM} 〜 ${eParts.month}/${eParts.day}(${eParts.weekdayShort}) ${endH}:${endM}`;
}

