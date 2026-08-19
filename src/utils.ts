export function formatRelativeTime(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;

  const now = new Date();
  const diffInSeconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  // 未来の日時の場合（誤って未来の日時が渡された場合の安全処理）
  if (diffInSeconds < 0) {
    const isSameYear = date.getFullYear() === now.getFullYear();
    const m = date.getMonth() + 1;
    const d = date.getDate();
    const h = String(date.getHours()).padStart(2, '0');
    const min = String(date.getMinutes()).padStart(2, '0');
    if (isSameYear) {
      return `${m}/${d} ${h}:${min}`;
    }
    return `${date.getFullYear()}/${m}/${d}`;
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
 * 予定（スケジュール）の実施日時を分かりやすくバッジ形式でフォーマット
 * 例: "8/25(火) 09:00〜10:00", "8/25(火) 終日"
 */
export function formatEventScheduleBadge(startIso: string, endIso?: string, isAllDay?: boolean): string {
  if (!startIso) return '';
  const start = new Date(startIso);
  if (isNaN(start.getTime())) return startIso;

  const days = ['日', '月', '火', '水', '木', '金', '土'];
  const m = start.getMonth() + 1;
  const d = start.getDate();
  const dow = days[start.getDay()];

  if (isAllDay) {
    return `${m}/${d}(${dow}) 終日`;
  }

  const startH = String(start.getHours()).padStart(2, '0');
  const startM = String(start.getMinutes()).padStart(2, '0');

  if (!endIso) {
    return `${m}/${d}(${dow}) ${startH}:${startM}`;
  }

  const end = new Date(endIso);
  if (isNaN(end.getTime())) {
    return `${m}/${d}(${dow}) ${startH}:${startM}`;
  }

  const endH = String(end.getHours()).padStart(2, '0');
  const endM = String(end.getMinutes()).padStart(2, '0');

  // 同日の場合は時間のみ範囲表示
  if (start.toDateString() === end.toDateString()) {
    return `${m}/${d}(${dow}) ${startH}:${startM}〜${endH}:${endM}`;
  }

  // 日を跨ぐ場合
  const endMth = end.getMonth() + 1;
  const endD = end.getDate();
  const endDow = days[end.getDay()];
  return `${m}/${d}(${dow}) ${startH}:${startM} 〜 ${endMth}/${endD}(${endDow}) ${endH}:${endM}`;
}
