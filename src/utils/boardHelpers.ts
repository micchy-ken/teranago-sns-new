export function isTopicCurrentlyPinned(topic?: { isPinned?: boolean; pinnedUntil?: string | null } | null): boolean {
  if (!topic || !topic.isPinned) return false;
  if (!topic.pinnedUntil) return true;
  const until = new Date(topic.pinnedUntil).getTime();
  if (isNaN(until)) return true;
  return until > Date.now();
}

export function formatPinnedUntilBadge(pinnedUntil?: string | null): string {
  if (!pinnedUntil) return '（常時固定）';
  const d = new Date(pinnedUntil);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return '（期限切れ）';
  return `（あと${diffDays}日 / 〜${d.getMonth() + 1}/${d.getDate()}まで）`;
}
