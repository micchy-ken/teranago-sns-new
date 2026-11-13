import { User, UserBookmarkCategory, UserBookmarkItem } from '../types';
import type { AppQueryParams } from './urlParams';

const MAX_UNPINNED_BOOKMARKS = 100;

/**
 * ピン留め優先・新しい順にブックマークを並べ替え
 */
export function sortBookmarks(items: UserBookmarkItem[]): UserBookmarkItem[] {
  return [...items].sort((a, b) => {
    const aPinned = Boolean(a.isPinned);
    const bPinned = Boolean(b.isPinned);
    if (aPinned !== bPinned) {
      return aPinned ? -1 : 1;
    }
    if (aPinned && bPinned) {
      const aPinTime = new Date(a.pinnedAt || a.updatedAt || a.createdAt || 0).getTime();
      const bPinTime = new Date(b.pinnedAt || b.updatedAt || b.createdAt || 0).getTime();
      if (bPinTime !== aPinTime) return bPinTime - aPinTime;
    }
    const aTime = new Date(a.updatedAt || a.createdAt || 0).getTime();
    const bTime = new Date(b.updatedAt || b.createdAt || 0).getTime();
    return bTime - aTime;
  });
}

/**
 * ユーザーのブックマーク一覧を安全に取得（ピン留め先頭・新しい順）
 */
export function getBookmarks(user?: User | null): UserBookmarkItem[] {
  const raw = user?.preferences?.bookmarks;
  if (!Array.isArray(raw)) return [];
  const valid = raw.filter(
    (item): item is UserBookmarkItem =>
      Boolean(item && typeof item === 'object' && item.id && item.title && item.params)
  );
  return sortBookmarks(valid);
}

/**
 * 重複判定用の一意キーを生成
 */
export function buildBookmarkId(category: UserBookmarkCategory, params: AppQueryParams): string {
  if (params.topicId) return `board:${params.topicId}`;
  if (params.chatRoomId) return `chat:${params.chatRoomId}`;
  if (params.eventId) return `calendar:event:${params.eventId}`;
  if (params.applicationId) return `workflow:${params.applicationId}`;
  if (params.memoId) return `memo:${params.memoId}`;
  if (params.reportId) return `daily_report:${params.reportId}`;
  if (params.safetyEventId) return `safety:${params.safetyEventId}`;
  if (params.tab === 'calendar') {
    return [
      'calendar',
      params.mode || 'personal',
      params.view || 'week',
      params.date || '',
      params.office || '全社',
      params.division || '全部署',
      params.targetUserId || '',
      params.type || 'all',
    ].join(':');
  }
  return `${category}:${params.tab || 'other'}:${JSON.stringify(params)}`;
}

/**
 * 共有時などにブックマークをストック（既存があれば先頭・日時更新＆ピン留め状態維持）
 */
export function upsertBookmarkForUser(
  user: User,
  input: {
    category: UserBookmarkCategory;
    title: string;
    subtitle?: string;
    params: AppQueryParams;
  }
): { updatedUser: User; bookmark: UserBookmarkItem; isNew: boolean } {
  const nowIso = new Date().toISOString();
  const id = buildBookmarkId(input.category, input.params);
  const existingList = getBookmarks(user);
  const existing = existingList.find((b) => b.id === id);

  const bookmark: UserBookmarkItem = {
    id,
    category: input.category,
    title: input.title.trim() || '無題のブックマーク',
    subtitle: input.subtitle?.trim() || undefined,
    params: { ...input.params },
    isPinned: existing?.isPinned ?? false,
    pinnedAt: existing?.pinnedAt,
    createdAt: existing?.createdAt || nowIso,
    updatedAt: nowIso,
  };

  const withoutTarget = existingList.filter((b) => b.id !== id);
  const nextAll = sortBookmarks([bookmark, ...withoutTarget]);

  // ピン留めは全件保持し、通常ブックマークのみ上限件数まで維持
  const pinned = nextAll.filter((b) => b.isPinned);
  const unpinned = nextAll.filter((b) => !b.isPinned).slice(0, MAX_UNPINNED_BOOKMARKS);
  const finalBookmarks = sortBookmarks([...pinned, ...unpinned]);

  const updatedUser: User = {
    ...user,
    preferences: {
      ...(user.preferences || {}),
      bookmarks: finalBookmarks,
    },
  };

  return {
    updatedUser,
    bookmark,
    isNew: !existing,
  };
}

/**
 * ワンボタン削除用ヘルパー
 */
export function removeBookmarkForUser(user: User, bookmarkId: string): User {
  const existingList = getBookmarks(user);
  const nextList = existingList.filter((b) => b.id !== bookmarkId);
  return {
    ...user,
    preferences: {
      ...(user.preferences || {}),
      bookmarks: nextList,
    },
  };
}

/**
 * 削除直後の「元に戻す」用ヘルパー
 */
export function restoreBookmarkForUser(user: User, bookmark: UserBookmarkItem): User {
  const existingList = getBookmarks(user);
  const withoutTarget = existingList.filter((b) => b.id !== bookmark.id);
  const nextList = sortBookmarks([bookmark, ...withoutTarget]);
  return {
    ...user,
    preferences: {
      ...(user.preferences || {}),
      bookmarks: nextList,
    },
  };
}

/**
 * ピン留め ON/OFF 切り替えヘルパー
 */
export function toggleBookmarkPinForUser(
  user: User,
  bookmarkId: string
): { updatedUser: User; isPinned: boolean } {
  const nowIso = new Date().toISOString();
  const existingList = getBookmarks(user);
  let nextPinnedState = false;

  const updatedList = existingList.map((item) => {
    if (item.id !== bookmarkId) return item;
    nextPinnedState = !item.isPinned;
    return {
      ...item,
      isPinned: nextPinnedState,
      pinnedAt: nextPinnedState ? nowIso : undefined,
    };
  });

  const sorted = sortBookmarks(updatedList);
  return {
    updatedUser: {
      ...user,
      preferences: {
        ...(user.preferences || {}),
        bookmarks: sorted,
      },
    },
    isPinned: nextPinnedState,
  };
}

/**
 * カテゴリ表示用ラベル・バッジスタイル
 */
export function getBookmarkCategoryLabel(category: UserBookmarkCategory): string {
  switch (category) {
    case 'calendar':
      return 'スケジュール';
    case 'board':
      return '掲示板';
    case 'chat':
      return 'チャット';
    case 'timeline':
      return 'タイムライン';
    case 'workflow':
      return 'ワークフロー';
    case 'memo':
      return '伝言メモ';
    case 'daily_report':
      return '日報・週報';
    case 'site':
      return '現場管理';
    default:
      return 'その他';
  }
}
