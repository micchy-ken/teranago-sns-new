import { BoardTopic, BoardPoll, User, OfficeMaster, DivisionMaster } from '../types';
import {
  doesUserMatchOffice,
  doesUserMatchDivision,
  resolveOfficeName,
  resolveDivisionName,
} from './masterResolver';

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

  // 1. アンケート回答期限内の自動ピン留め判定（締め切られていない場合のみ有効）
  if (topic.poll && topic.poll.autoPinUntilDeadline && topic.poll.deadline && !topic.poll.isClosed) {
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
 * 例: 「あと8日」「常時固定」「期限終了」「受付終了」
 */
export function formatPinnedUntilBadge(pinnedUntil?: string | null, poll?: BoardPoll): string {
  // アンケート自動ピン留めが設定されている場合
  if (poll && poll.autoPinUntilDeadline && poll.deadline) {
    if (poll.isClosed) {
      return '受付終了';
    }
    const deadlineMs = getPollDeadlineMs(poll.deadline);
    if (!isNaN(deadlineMs)) {
      const now = Date.now();
      const diffMs = deadlineMs - now;
      if (diffMs > 0) {
        const diffDays = Math.ceil(diffMs / (1000 * 60 * 60 * 24));
        return `あと${diffDays}日`;
      } else {
        return '受付終了';
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

/**
 * トピックが「マイグループ・指定メンバー」公開範囲かどうかを判定
 */
export function hasTopicTargetMembers(topic?: Partial<BoardTopic> | null): boolean {
  return Boolean(topic && Array.isArray(topic.targetUserIds) && topic.targetUserIds.length > 0);
}

/**
 * 指定ユーザーがトピックの作成者かどうかを判定
 */
export function isUserTopicAuthor(topic?: Partial<BoardTopic> | null, user?: User | null): boolean {
  if (!topic || !user) return false;
  const uid = String(user.id || '');
  const authorId = (topic as any).authorId ? String((topic as any).authorId) : '';
  return Boolean(
    (topic.author?.id && uid && String(topic.author.id) === uid) ||
    (authorId && uid && authorId === uid) ||
    (topic.author?.loginId && user.loginId && topic.author.loginId === user.loginId) ||
    (topic.author?.name && user.name && topic.author.name === user.name)
  );
}

/**
 * 指定ユーザーがトピックの指定メンバー(targetUserIds)に含まれているかを判定
 */
export function isUserInTopicTargetMembers(topic?: Partial<BoardTopic> | null, user?: User | null): boolean {
  if (!topic || !user || !Array.isArray(topic.targetUserIds) || topic.targetUserIds.length === 0) {
    return false;
  }
  const uid = String(user.id || '');
  const loginId = user.loginId ? String(user.loginId) : '';
  return topic.targetUserIds.some((id) => {
    const s = String(id);
    return (uid && s === uid) || (loginId && s === loginId);
  });
}

/**
 * 限定公開(isStrictScope)を考慮し、指定ユーザーがこのトピックを閲覧可能かどうかを判定
 * - isStrictScope が OFF の場合は全員閲覧可能
 * - isStrictScope が ON の場合は、作成者・管理者・指定範囲内のユーザーのみ閲覧可能
 */
export function canUserViewTopic(
  topic?: Partial<BoardTopic> | null,
  user?: User | null,
  offices?: OfficeMaster[],
  divisions?: DivisionMaster[]
): boolean {
  if (!topic) return false;
  if (!topic.isStrictScope) return true;
  if (!user) return false;

  if (isUserTopicAuthor(topic, user)) return true;
  if (user.role === 'admin' || user.isAdmin) return true;

  if (hasTopicTargetMembers(topic)) {
    return isUserInTopicTargetMembers(topic, user);
  }

  if ((topic.officeId || topic.office) && topic.office !== '全社' && topic.officeId !== 'all') {
    if (!doesUserMatchOffice(user, topic.officeId || topic.office, offices)) return false;
  }
  if ((topic.divisionId || topic.division) && topic.division !== '全部署' && topic.divisionId !== 'all') {
    if (!doesUserMatchDivision(user, topic.divisionId || topic.division, divisions)) return false;
  }

  return true;
}

/**
 * マイページ・未読通知の対象判定（このトピックが対象ユーザー宛てかどうか）
 * - マイグループ・指定メンバー指定時は対象メンバーのみ true
 * - 拠点・部署指定時は該当拠点・部署のユーザーのみ true
 */
export function isTopicTargetedToUser(
  topic?: Partial<BoardTopic> | null,
  user?: User | null,
  offices?: OfficeMaster[],
  divisions?: DivisionMaster[]
): boolean {
  if (!topic || !user) return false;

  if (hasTopicTargetMembers(topic)) {
    return isUserInTopicTargetMembers(topic, user);
  }

  const matchOffice =
    !topic.office ||
    topic.office === '全社' ||
    topic.officeId === 'all' ||
    doesUserMatchOffice(user, topic.officeId || topic.office, offices);

  const matchDivision =
    !topic.division ||
    topic.division === '全部署' ||
    topic.divisionId === 'all' ||
    doesUserMatchDivision(user, topic.divisionId || topic.division, divisions);

  return matchOffice && matchDivision;
}

/**
 * 掲示板カード・一覧用の公開範囲ラベル文字列を生成
 */
export function getTopicScopeBadgeLabel(
  topic: Partial<BoardTopic>,
  offices?: OfficeMaster[],
  divisions?: DivisionMaster[]
): string {
  if (hasTopicTargetMembers(topic)) {
    const count = topic.targetUserIds?.length || 0;
    const label = (topic.targetGroupName || '').trim();
    return label ? `${label} (${count}名)` : `指定メンバー (${count}名)`;
  }
  const officeLabel = resolveOfficeName(topic.officeId || topic.office, offices) || '全社';
  const divisionLabel = resolveDivisionName(topic.divisionId || topic.division, divisions) || '全部署';
  return `${officeLabel} / ${divisionLabel}`;
}
