import { BoardTopic, BoardPoll } from '../types';

/**
 * JST基準で回答期限日（その日の23:59:59.999 JST）のミリ秒タイムスタンプを取得
 */
export function getPollDeadlineMs(deadlineStr?: string | null): number {
  if (!deadlineStr) return NaN;
  const trimmed = deadlineStr.trim();
  // YYYY-MM-DD 形式の場合、日本時間その日の 23:59:59.999 とする
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return new Date(`${trimmed}T23:59:59.999+09:00`).getTime();
  }
  return new Date(trimmed).getTime();
}

/**
 * トピックが現在ピン留め状態にあるかを判定
 * - アンケートがあり autoPinUntilDeadline=true かつ期限前なら自動ピン留め
 * - 通常の isPinned かつ pinnedUntil 期限内ならピン留め
 */
export function isTopicCurrentlyPinned(topic?: (Partial<BoardTopic> & { isPinned?: boolean; pinnedUntil?: string | null; poll?: BoardPoll }) | null): boolean {
  if (!topic) return false;

  // 1. アンケート回答期限内の自動ピン留め判定
  if (topic.poll && topic.poll.autoPinUntilDeadline && topic.poll.deadline) {
    const deadlineMs = getPollDeadlineMs(topic.poll.deadline);
    if (!isNaN(deadlineMs) && deadlineMs > Date.now()) {
      return true;
    }
  }

  // 2. 通常のピン留め判定
  if (!topic.isPinned) return false;
  if (!topic.pinnedUntil) return true;
  const until = new Date(topic.pinnedUntil).getTime();
  if (isNaN(until)) return true;
  return until > Date.now();
}

/**
 * ピン留め期限またはアンケート自動ピン留めのバッジ文字列を生成
 * 例: 「あと8日」「常時固定」「期限終了」
 */
export function formatPinnedUntilBadge(pinnedUntil?: string | null, poll?: BoardPoll): string {
  // アンケート自動ピン留めが有効な場合
  if (poll && poll.autoPinUntilDeadline && poll.deadline) {
    const deadlineMs = getPollDeadlineMs(poll.deadline);
    if (!isNaN(deadlineMs)) {
      const now = Date.now();
      const diffMs = deadlineMs - now;
      if (diffMs > 0) {
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return `あと${diffDays}日`;
      }
    }
  }

  if (!pinnedUntil) return '常時固定';
  const d = new Date(pinnedUntil);
  if (isNaN(d.getTime())) return 'ピン留め';
  const now = new Date();
  const diffDays = Math.ceil((d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
  if (diffDays <= 0) return '期限終了';
  return `あと${diffDays}日`;
}

