import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Bell, Menu, Phone, FileText, Monitor, Calendar as CalendarIcon, MessageSquare, CheckCheck, ChevronRight, X, Smartphone, Users, MessageCircle, Palette, Check, Pin, ShieldAlert, Type, Undo2, Minimize2, Bookmark, Trash2, Share2, ExternalLink } from 'lucide-react';
import { User, Memo, WorkflowApplication, BoardTopic, CalendarEvent, ChatRoom, Post, DailyReport, SafetyConfirmationEvent, SafetyConfirmationResponse, UserBookmarkCategory, UserBookmarkItem } from '../types';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';
import { AppTab } from './Sidebar';
import { MiniNotificationMode } from './MiniNotificationMode';
import { expandRecurringEvents } from '../utils/recurrenceUtils';
import { ColorTheme, THEME_OPTIONS, getSavedTheme, applyColorTheme, AppFontSize, FONT_SIZE_OPTIONS, getSavedFontSize, applyFontSize, NotificationWindowSize, NOTIFICATION_WINDOW_SIZE_OPTIONS, getSavedNotificationWindowSize, applyNotificationWindowSize } from '../utils/theme';
import { API_BASE_URL } from '../config/api';
import { buildAppUrl, copyTextToClipboard } from '../utils/urlParams';
import {
  getBookmarks,
  removeBookmarkForUser,
  restoreBookmarkForUser,
  toggleBookmarkPinForUser,
  getBookmarkCategoryLabel,
} from '../utils/bookmarks';
import {
  getAllNotifications,
  getUnreadNotifications,
  getReadEventIds,
  markEventAsRead,
  markAllEventsAsRead,
  getReadTopicIds,
  markTopicAsRead,
  getReadChatTimestamps,
  markChatRoomAsRead,
  getReadMemoIds,
  markMemoAsRead,
  isMemoVisibleToUser,
  getReadWorkflowIds,
  markWorkflowAsRead,
  getReadReportIds,
  markReportAsRead,
  getRespondedSafetyEventIds,
  markSafetyEventAsResponded,
  NotificationItem,
} from '../utils/notifications';
import { triggerOpenUserModal } from '../utils/userModal';
import { isEventVisibleToUser } from '../utils/eventVisibility';
import { APP_VERSION } from '../config/version';

export interface GlobalSearchResultItem {
  id: string;
  type: 'board' | 'event' | 'memo' | 'workflow' | 'chat' | 'post' | 'user' | 'report';
  typeName: string;
  title: string;
  snippet: string;
  badgeText?: string;
  dateStr?: string;
  tab: AppTab;
  originalData?: any;
}

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentUser: User;
  allUsers?: User[];
  onSwitchUser?: (user: User) => void;
  impersonatorAdmin?: User | null;
  onRevertToAdmin?: () => void;
  onLogout?: () => void;
  memos?: Memo[];
  applications?: WorkflowApplication[];
  topics?: BoardTopic[];
  events?: CalendarEvent[];
  chatRooms?: ChatRoom[];
  reports?: DailyReport[];
  posts?: Post[];
  safetyEvents?: SafetyConfirmationEvent[];
  safetyResponses?: SafetyConfirmationResponse[];
  userRespondedSafetyEventIds?: string[];
  onSelectTab?: (tab: AppTab) => void;
  onOpenSettings?: () => void;
  onNavigateToContent?: (target: {
    tab: AppTab;
    topicId?: string;
    chatRoomId?: string;
    memoId?: string;
    applicationId?: string;
    eventId?: string;
    postId?: string;
    reportId?: string;
    safetyEventId?: string;
    office?: string;
    division?: string;
    mode?: 'personal' | 'team';
    view?: 'month' | 'week' | 'day' | 'list';
    date?: string;
    type?: string;
    targetUserId?: string;
  }) => void;
  onUpdateMemos?: (memos: Memo[]) => void;
  onUpdateTopic?: (topic: BoardTopic) => void;
  onUpdateEvent?: (event: CalendarEvent) => void;
  onUpdateRooms?: (rooms: ChatRoom[]) => void;
  onToggleMobileMenu?: () => void;
  onUpdateUser?: (user: User) => void;
}

function formatLocalDateStr(isoStr?: string): string {
  if (!isoStr) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return isoStr;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr.split('T')[0] || isoStr;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatLocalDateTimeStr(isoStr?: string, isAllDay?: boolean): string {
  if (!isoStr) return '';
  const datePart = formatLocalDateStr(isoStr);
  if (isAllDay) return `${datePart} (終日)`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(isoStr)) return `${datePart} (終日)`;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return datePart;
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${datePart} ${hours}:${minutes}`;
}

function formatRelativeTime(dateString: string): string {
  if (!dateString) return '';
  const date = new Date(dateString);
  if (isNaN(date.getTime())) return dateString;
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMinutes = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffMinutes < 1) return 'たった今';
  if (diffMinutes < 60) return `${diffMinutes}分前`;
  if (diffHours < 24) return `${diffHours}時間前`;
  if (diffDays === 1) return '昨日';
  if (diffDays < 7) return `${diffDays}日前`;
  
  return date.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export function Header({
  searchQuery,
  onSearchChange,
  currentUser,
  allUsers,
  onSwitchUser,
  impersonatorAdmin,
  onRevertToAdmin,
  onLogout,
  memos = [],
  applications = [],
  topics = [],
  events = [],
  chatRooms = [],
  reports = [],
  posts = [],
  safetyEvents = [],
  safetyResponses = [],
  userRespondedSafetyEventIds = [],
  onSelectTab,
  onOpenSettings,
  onNavigateToContent,
  onUpdateMemos,
  onUpdateTopic,
  onUpdateEvent,
  onUpdateRooms,
  onToggleMobileMenu,
  onUpdateUser,
}: HeaderProps) {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('app_notification_popover_open') === 'true';
    } catch {
      return false;
    }
  });
  const [filterType, setFilterType] = useState<'all' | 'memo' | 'workflow' | 'board' | 'event' | 'chat' | 'report' | 'safety'>('all');
  const [readFilter, setReadFilter] = useState<'all' | 'unread'>('all');
  const [readEventIds, setReadEventIds] = useState<string[]>(() => getReadEventIds(currentUser?.id));
  const [readTopicIds, setReadTopicIds] = useState<string[]>(() => getReadTopicIds(currentUser?.id));
  const [readChatTimestamps, setReadChatTimestamps] = useState<Record<string, string>>(() => getReadChatTimestamps(currentUser?.id));
  const [readMemoIds, setReadMemoIds] = useState<string[]>(() => getReadMemoIds(currentUser?.id));
  const [readWorkflowIds, setReadWorkflowIds] = useState<string[]>(() => getReadWorkflowIds(currentUser?.id));
  const [readReportIds, setReadReportIds] = useState<string[]>(() => getReadReportIds(currentUser?.id));
  const popoverRef = useRef<HTMLDivElement>(null);

  // Unified Appearance picker state (文字の大きさ + カラー設定)
  const [currentTheme, setCurrentTheme] = useState<ColorTheme>(() => getSavedTheme());
  const [currentFontSize, setCurrentFontSize] = useState<AppFontSize>(() => getSavedFontSize());
  const [isAppearancePickerOpen, setIsAppearancePickerOpen] = useState(false);
  const appearancePickerRef = useRef<HTMLDivElement>(null);

  // Notification window size state (小 / 中 / 大 - 記憶対応)
  const [notificationWindowSize, setNotificationWindowSize] = useState<NotificationWindowSize>(() => {
    const prefSize = currentUser?.preferences?.notificationWindowSize;
    if (prefSize && NOTIFICATION_WINDOW_SIZE_OPTIONS.some((o) => o.id === prefSize)) {
      return prefSize;
    }
    return getSavedNotificationWindowSize();
  });

  // Mini notification mode state (PC専用 縮小表示 / 最前面常駐 - リロード復元対応)
  const [isMiniNotificationOpen, setIsMiniNotificationOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem('app_mini_notification_open') === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('app_notification_popover_open', String(isOpen));
    } catch (_) {}
  }, [isOpen]);

  useEffect(() => {
    try {
      localStorage.setItem('app_mini_notification_open', String(isMiniNotificationOpen));
    } catch (_) {}
  }, [isMiniNotificationOpen]);

  // Personal Bookmarks popover state
  const [isBookmarkOpen, setIsBookmarkOpen] = useState(false);
  const [bookmarkFilter, setBookmarkFilter] = useState<'all' | 'pinned' | UserBookmarkCategory>('all');
  const [bookmarkSearch, setBookmarkSearch] = useState('');
  const [copiedBookmarkId, setCopiedBookmarkId] = useState<string | null>(null);
  const [deletedBookmarkUndo, setDeletedBookmarkUndo] = useState<UserBookmarkItem | null>(null);
  const undoTimeoutRef = useRef<number | null>(null);
  const bookmarkPopoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    applyColorTheme(currentTheme);
    applyFontSize(currentFontSize);
  }, []);

  useEffect(() => {
    const prefSize = currentUser?.preferences?.notificationWindowSize;
    if (prefSize && NOTIFICATION_WINDOW_SIZE_OPTIONS.some((o) => o.id === prefSize)) {
      setNotificationWindowSize(prefSize);
      applyNotificationWindowSize(prefSize);
    }
  }, [currentUser?.preferences?.notificationWindowSize]);

  useEffect(() => {
    const handleFontSizeChange = (e: any) => {
      if (e.detail) setCurrentFontSize(e.detail);
    };
    const handleColorThemeChange = (e: any) => {
      if (e.detail) setCurrentTheme(e.detail);
    };
    const handleNotifWindowSizeChange = (e: any) => {
      if (e.detail && NOTIFICATION_WINDOW_SIZE_OPTIONS.some((o) => o.id === e.detail)) {
        setNotificationWindowSize(e.detail);
      }
    };
    window.addEventListener('teranago:font-size-changed' as any, handleFontSizeChange);
    window.addEventListener('teranago:color-theme-changed' as any, handleColorThemeChange);
    window.addEventListener('teranago:notification-window-size-changed' as any, handleNotifWindowSizeChange);
    return () => {
      window.removeEventListener('teranago:font-size-changed' as any, handleFontSizeChange);
      window.removeEventListener('teranago:color-theme-changed' as any, handleColorThemeChange);
      window.removeEventListener('teranago:notification-window-size-changed' as any, handleNotifWindowSizeChange);
    };
  }, []);

  const persistUserPreferencePatch = (patch: Record<string, any>) => {
    if (!currentUser?.id) return;
    try {
      const cached = localStorage.getItem(`user_preferences_${currentUser.id}`);
      const currentPrefs = cached ? JSON.parse(cached) : (currentUser.preferences || {});
      const updatedPrefs = { ...currentPrefs, ...patch };
      localStorage.setItem(`user_preferences_${currentUser.id}`, JSON.stringify(updatedPrefs));

      if (onUpdateUser) {
        onUpdateUser({
          ...currentUser,
          preferences: updatedPrefs,
        });
      } else {
        fetch(`${API_BASE_URL}/users/${currentUser.id}/preferences`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(updatedPrefs),
        }).catch(() => {});
      }
    } catch (_) {}
  };

  const handleChangeFontSize = (size: AppFontSize) => {
    setCurrentFontSize(size);
    applyFontSize(size);
    persistUserPreferencePatch({ fontSize: size });
  };

  const handleChangeColorTheme = (theme: ColorTheme) => {
    setCurrentTheme(theme);
    applyColorTheme(theme);
    persistUserPreferencePatch({ colorTheme: theme });
  };

  const handleChangeNotificationWindowSize = (size: NotificationWindowSize) => {
    setNotificationWindowSize(size);
    applyNotificationWindowSize(size);
    persistUserPreferencePatch({ notificationWindowSize: size });
  };

  // Cross-functional search state
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchCategoryFilter, setSearchCategoryFilter] = useState<'all' | 'board' | 'event' | 'memo' | 'workflow' | 'chat' | 'post' | 'user'>('all');
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close overlays on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (searchContainerRef.current && !searchContainerRef.current.contains(target)) {
        setIsSearchFocused(false);
      }
      if (popoverRef.current && !popoverRef.current.contains(target)) {
        setIsOpen(false);
      }
      if (appearancePickerRef.current && !appearancePickerRef.current.contains(target)) {
        setIsAppearancePickerOpen(false);
      }
      if (bookmarkPopoverRef.current && !bookmarkPopoverRef.current.contains(target)) {
        setIsBookmarkOpen(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSearchFocused(false);
        setIsOpen(false);
        setIsAppearancePickerOpen(false);
        setIsBookmarkOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, []);

  // Global cross-functional search calculation
  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];

    const results: GlobalSearchResultItem[] = [];

    // 1. 掲示板 (Board Topics)
    topics.forEach((t) => {
      const matchTitle = t.title?.toLowerCase().includes(q);
      const matchContent = t.content?.toLowerCase().includes(q);
      const matchCategory = t.category?.toLowerCase().includes(q);
      const matchTags = t.tags?.some((tag) => tag.toLowerCase().includes(q));

      if (matchTitle || matchContent || matchCategory || matchTags) {
        results.push({
          id: `topic-${t.id}`,
          type: 'board',
          typeName: '掲示板',
          title: t.title,
          snippet: t.content ? t.content.slice(0, 80) : '',
          badgeText: t.category || '掲示板',
          dateStr: formatLocalDateStr(t.createdAt),
          tab: 'board',
          originalData: t,
        });
      }
    });

    // 2. スケジュール (Calendar Events)
    const searchStart = new Date();
    searchStart.setMonth(searchStart.getMonth() - 6);
    const searchEnd = new Date();
    searchEnd.setMonth(searchEnd.getMonth() + 12);
    const expandedSearchEvents = expandRecurringEvents(events, searchStart, searchEnd);

    expandedSearchEvents.forEach((evt) => {
      // 「他人から隠す」(isPrivate または isSecret) の非公開予定は、作成者または参加者以外には検索結果に表示しない
      if (!isEventVisibleToUser(evt, currentUser)) {
        return;
      }

      const matchTitle = evt.title?.toLowerCase().includes(q);
      const matchLocation = evt.location?.toLowerCase().includes(q);
      const matchMemo = evt.memo?.toLowerCase().includes(q);

      if (matchTitle || matchLocation || matchMemo) {
        const localDate = formatLocalDateStr(evt.start);
        const localDateTime = formatLocalDateTimeStr(evt.start, evt.isAllDay);
        const isSecret = Boolean(evt.isPrivate || (evt as any).isSecret);
        results.push({
          id: `event-${evt.id}`,
          type: 'event',
          typeName: 'スケジュール',
          title: `${isSecret ? '🔒 ' : ''}${evt.title}`,
          snippet: `${localDateTime}${evt.location ? ` @ ${evt.location}` : ''}${evt.memo ? ` - ${evt.memo.slice(0, 60)}` : ''}`,
          badgeText: isSecret ? '非公開' : (evt.type || '予定'),
          dateStr: localDate,
          tab: 'calendar',
          originalData: evt,
        });
      }
    });

    // 3. 伝言メモ (Memos)
    memos.forEach((m) => {
      // ログインユーザーに関係のない（自分宛て・自作成・自拠点/部署宛て以外の他人の）伝言メモは検索除外
      if (!isMemoVisibleToUser(m, currentUser)) {
        return;
      }

      const matchFrom = m.fromName?.toLowerCase().includes(q) || m.fromCompany?.toLowerCase().includes(q);
      const matchContent = m.content?.toLowerCase().includes(q) || m.requirementText?.toLowerCase().includes(q);
      const matchTo = m.toUser?.name?.toLowerCase().includes(q) || m.toUsers?.some((u) => u?.name?.toLowerCase().includes(q));

      if (matchFrom || matchContent || matchTo) {
        const recipientName = m.toUsers && m.toUsers.length > 0
          ? m.toUsers.map((u) => u.name).join(', ')
          : (m.toUser?.name || '自分');

        results.push({
          id: `memo-${m.id}`,
          type: 'memo',
          typeName: '伝言メモ',
          title: `${m.fromCompany ? `${m.fromCompany} ` : ''}${m.fromName || '伝言メモ'}`,
          snippet: `【用件】${m.requirementText || m.content || '詳細なし'}`,
          badgeText: `宛先: ${recipientName}`,
          dateStr: formatLocalDateStr(m.createdAt),
          tab: 'memo',
          originalData: m,
        });
      }
    });

    // 4. ワークフロー (Applications)
    applications.forEach((app) => {
      const matchTitle = app.title?.toLowerCase().includes(q);
      const matchDesc = app.description?.toLowerCase().includes(q);
      const matchApplicant = app.applicant?.name?.toLowerCase().includes(q);

      if (matchTitle || matchDesc || matchApplicant) {
        results.push({
          id: `wf-${app.id}`,
          type: 'workflow',
          typeName: 'ワークフロー',
          title: app.title,
          snippet: `申請者: ${app.applicant?.name || '不明'} / 内容: ${app.description || ''}`,
          badgeText: app.flowName || '申請',
          dateStr: formatLocalDateStr(app.createdAt),
          tab: 'workflow',
          originalData: app,
        });
      }
    });

    // 5. チャット (Chat Rooms)
    chatRooms.forEach((room) => {
      const roomTitle = room.name || room.participants?.map((p) => p.name).join(', ') || 'チャット';
      const matchName = roomTitle.toLowerCase().includes(q);
      const matchedMsgs = room.messages?.filter((msg) => msg.content?.toLowerCase().includes(q));
      const hasMsgMatch = matchedMsgs && matchedMsgs.length > 0;

      if (matchName || hasMsgMatch) {
        const snippetText = hasMsgMatch
          ? matchedMsgs[matchedMsgs.length - 1].content
          : `参加者: ${room.participants?.map((p) => p.name).join(', ')}`;
        results.push({
          id: `chat-${room.id}`,
          type: 'chat',
          typeName: 'チャット',
          title: roomTitle,
          snippet: snippetText,
          badgeText: `${room.participants?.length || 0}名参加`,
          dateStr: formatLocalDateStr(room.lastUpdated),
          tab: 'chat',
          originalData: room,
        });
      }
    });

    // 6. タイムライン (Posts)
    if (posts) {
      posts.forEach((p) => {
        const matchContent = p.content?.toLowerCase().includes(q);
        const matchAuthor = p.author?.name?.toLowerCase().includes(q);
        const matchTags = p.tags?.some((t) => t.toLowerCase().includes(q));

        if (matchContent || matchAuthor || matchTags) {
          results.push({
            id: `post-${p.id}`,
            type: 'post',
            typeName: 'タイムライン',
            title: `${p.author?.name || '投稿'}のタイムライン`,
            snippet: p.content ? p.content.slice(0, 80) : '',
            badgeText: p.tags?.length ? `#${p.tags[0]}` : '投稿',
            dateStr: formatLocalDateStr(p.createdAt),
            tab: 'timeline',
            originalData: p,
          });
        }
      });
    }

    // 7. 社員 (Users)
    if (allUsers) {
      allUsers.forEach((u) => {
        const matchName = u.name?.toLowerCase().includes(q);
        const matchKana = u.kanaName?.toLowerCase().includes(q);
        const matchOffice = u.office?.toLowerCase().includes(q);
        const matchDivision = u.division?.toLowerCase().includes(q);
        const matchPosition = u.position?.toLowerCase().includes(q);

        if (matchName || matchKana || matchOffice || matchDivision || matchPosition) {
          results.push({
            id: `user-${u.id}`,
            type: 'user',
            typeName: '社員',
            title: `${u.name}${u.kanaName ? ` (${u.kanaName})` : ''}`,
            snippet: `${u.office || ''} ${u.division || ''} ${u.position || ''}`,
            badgeText: u.department || '社員',
            tab: 'chat',
            originalData: u,
          });
        }
      });
    }

    return results;
  }, [searchQuery, topics, events, memos, applications, chatRooms, posts, allUsers, currentUser]);

  const filteredSearchResults = useMemo(() => {
    if (searchCategoryFilter === 'all') return searchResults;
    return searchResults.filter((item) => item.type === searchCategoryFilter);
  }, [searchResults, searchCategoryFilter]);

  const categoryCounts = useMemo(() => {
    const counts = {
      all: searchResults.length,
      board: 0,
      event: 0,
      memo: 0,
      workflow: 0,
      chat: 0,
      post: 0,
      user: 0,
    };
    searchResults.forEach((item) => {
      if (counts[item.type] !== undefined) {
        counts[item.type]++;
      }
    });
    return counts;
  }, [searchResults]);

  const handleSearchResultClick = (item: GlobalSearchResultItem) => {
    setIsSearchFocused(false);

    if (item.type === 'user' && item.originalData) {
      triggerOpenUserModal(item.originalData);
      return;
    }

    if (onNavigateToContent) {
      const targetParams: any = { tab: item.tab };
      if (item.type === 'board' && item.originalData) targetParams.topicId = item.originalData.id;
      if (item.type === 'chat' && item.originalData) targetParams.chatRoomId = item.originalData.id;
      if (item.type === 'memo' && item.originalData) targetParams.memoId = item.originalData.id;
      if (item.type === 'workflow' && item.originalData) targetParams.applicationId = item.originalData.id;
      if (item.type === 'event' && item.originalData) targetParams.eventId = item.originalData.id;
      if (item.type === 'post' && item.originalData) targetParams.postId = item.originalData.id;

      onNavigateToContent(targetParams);
    } else if (onSelectTab) {
      onSelectTab(item.tab);
    }
  };

  const getSearchItemBadge = (type: GlobalSearchResultItem['type']) => {
    switch (type) {
      case 'board':
        return { icon: Monitor, bg: 'bg-indigo-100 text-indigo-700 border-indigo-200' };
      case 'event':
        return { icon: CalendarIcon, bg: 'bg-amber-100 text-amber-700 border-amber-200' };
      case 'memo':
        return { icon: Phone, bg: 'bg-rose-100 text-rose-700 border-rose-200' };
      case 'workflow':
        return { icon: FileText, bg: 'bg-purple-100 text-purple-700 border-purple-200' };
      case 'chat':
        return { icon: MessageSquare, bg: 'bg-blue-100 text-blue-700 border-blue-200' };
      case 'post':
        return { icon: MessageCircle, bg: 'bg-sky-100 text-sky-700 border-sky-200' };
      case 'user':
        return { icon: Users, bg: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
      case 'report':
        return { icon: FileText, bg: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    }
  };

  // Sync read states when custom event fires or user changes
  useEffect(() => {
    const handleSync = () => {
      setReadEventIds(getReadEventIds(currentUser?.id));
      setReadTopicIds(getReadTopicIds(currentUser?.id));
      setReadChatTimestamps(getReadChatTimestamps(currentUser?.id));
      setReadMemoIds(getReadMemoIds(currentUser?.id));
      setReadWorkflowIds(getReadWorkflowIds(currentUser?.id));
      setReadReportIds(getReadReportIds(currentUser?.id));
    };
    handleSync();
    window.addEventListener('notifications_updated', handleSync);
    return () => window.removeEventListener('notifications_updated', handleSync);
  }, [currentUser?.id]);

  // Close popover when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
      if (bookmarkPopoverRef.current && !bookmarkPopoverRef.current.contains(event.target as Node)) {
        setIsBookmarkOpen(false);
      }
    };
    if (isOpen || isBookmarkOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, isBookmarkOpen]);

  // 個人ブックマーク一覧＆操作ハンドラー
  const bookmarks = useMemo(() => getBookmarks(currentUser), [currentUser]);
  const pinnedBookmarkCount = useMemo(() => bookmarks.filter((b) => b.isPinned).length, [bookmarks]);

  const bookmarkCategoryCounts = useMemo(() => {
    const counts: Partial<Record<UserBookmarkCategory, number>> = {};
    bookmarks.forEach((b) => {
      counts[b.category] = (counts[b.category] || 0) + 1;
    });
    return counts;
  }, [bookmarks]);

  const filteredBookmarks = useMemo(() => {
    let list = bookmarks;
    if (bookmarkFilter === 'pinned') {
      list = list.filter((b) => b.isPinned);
    } else if (bookmarkFilter !== 'all') {
      list = list.filter((b) => b.category === bookmarkFilter);
    }
    const q = bookmarkSearch.trim().toLowerCase();
    if (q) {
      list = list.filter(
        (b) =>
          b.title.toLowerCase().includes(q) ||
          (b.subtitle && b.subtitle.toLowerCase().includes(q)) ||
          getBookmarkCategoryLabel(b.category).toLowerCase().includes(q)
      );
    }
    return list;
  }, [bookmarks, bookmarkFilter, bookmarkSearch]);

  const handleNavigateBookmark = (item: UserBookmarkItem) => {
    setIsBookmarkOpen(false);
    if (onNavigateToContent) {
      onNavigateToContent({
        tab: item.params.tab || 'mypage',
        topicId: item.params.topicId,
        chatRoomId: item.params.chatRoomId,
        memoId: item.params.memoId,
        applicationId: item.params.applicationId,
        eventId: item.params.eventId,
        reportId: item.params.reportId,
        safetyEventId: item.params.safetyEventId,
        office: item.params.office,
        division: item.params.division,
        mode: item.params.mode,
        view: item.params.view,
        date: item.params.date,
        type: item.params.type,
        targetUserId: item.params.targetUserId,
      });
    } else if (onSelectTab && item.params.tab) {
      onSelectTab(item.params.tab);
    }
  };

  const handleTogglePinBookmark = (bookmarkId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser || !onUpdateUser) return;
    const { updatedUser } = toggleBookmarkPinForUser(currentUser, bookmarkId);
    onUpdateUser(updatedUser);
  };

  const handleOneClickDeleteBookmark = (item: UserBookmarkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!currentUser || !onUpdateUser) return;
    const updatedUser = removeBookmarkForUser(currentUser, item.id);
    onUpdateUser(updatedUser);
    setDeletedBookmarkUndo(item);
    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current);
    }
    undoTimeoutRef.current = window.setTimeout(() => {
      setDeletedBookmarkUndo(null);
    }, 4500);
  };

  const handleUndoDeleteBookmark = () => {
    if (!deletedBookmarkUndo || !currentUser || !onUpdateUser) return;
    const updatedUser = restoreBookmarkForUser(currentUser, deletedBookmarkUndo);
    onUpdateUser(updatedUser);
    setDeletedBookmarkUndo(null);
    if (undoTimeoutRef.current) {
      window.clearTimeout(undoTimeoutRef.current);
      undoTimeoutRef.current = null;
    }
  };

  const handleCopyBookmarkUrl = async (item: UserBookmarkItem, e: React.MouseEvent) => {
    e.stopPropagation();
    const url = buildAppUrl(item.params);
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setCopiedBookmarkId(item.id);
      setTimeout(() => {
        setCopiedBookmarkId((prev) => (prev === item.id ? null : prev));
      }, 2000);
    }
  };

  const getBookmarkBadgeStyle = (category: UserBookmarkCategory) => {
    switch (category) {
      case 'calendar':
        return { icon: CalendarIcon, bg: 'bg-emerald-50 text-emerald-700 border-emerald-200' };
      case 'board':
        return { icon: Monitor, bg: 'bg-indigo-50 text-indigo-700 border-indigo-200' };
      case 'chat':
        return { icon: MessageSquare, bg: 'bg-violet-50 text-violet-700 border-violet-200' };
      case 'workflow':
        return { icon: FileText, bg: 'bg-blue-50 text-blue-700 border-blue-200' };
      case 'memo':
        return { icon: Phone, bg: 'bg-amber-50 text-amber-700 border-amber-200' };
      case 'daily_report':
        return { icon: FileText, bg: 'bg-teal-50 text-teal-700 border-teal-200' };
      default:
        return { icon: Bookmark, bg: 'bg-slate-100 text-slate-700 border-slate-200' };
    }
  };

  // Unified Notification Items (未確認＋確認済み履歴)
  const allNotifications = useMemo<NotificationItem[]>(() => {
    return getAllNotifications({
      user: currentUser,
      memos,
      applications,
      topics,
      events,
      chatRooms,
      reports,
      safetyEvents,
      safetyResponses,
      userRespondedSafetyEventIds: (userRespondedSafetyEventIds && userRespondedSafetyEventIds.length > 0)
        ? userRespondedSafetyEventIds
        : getRespondedSafetyEventIds(currentUser?.id),
      readEventIds,
      readTopicIds,
      readChatTimestamps,
      readMemoIds,
      readWorkflowIds,
      readReportIds,
    });
  }, [currentUser, memos, applications, topics, events, chatRooms, reports, safetyEvents, safetyResponses, userRespondedSafetyEventIds, readEventIds, readTopicIds, readChatTimestamps, readMemoIds, readWorkflowIds, readReportIds]);

  const memoNotifications = useMemo(() => allNotifications.filter((n) => n.type === 'memo'), [allNotifications]);
  const workflowNotifications = useMemo(() => allNotifications.filter((n) => n.type === 'workflow'), [allNotifications]);
  const boardNotifications = useMemo(() => allNotifications.filter((n) => n.type === 'board'), [allNotifications]);
  const eventNotifications = useMemo(() => allNotifications.filter((n) => n.type === 'event'), [allNotifications]);
  const chatNotifications = useMemo(() => allNotifications.filter((n) => n.type === 'chat'), [allNotifications]);
  const reportNotifications = useMemo(() => allNotifications.filter((n) => n.type === 'report'), [allNotifications]);
  const safetyNotifications = useMemo(() => allNotifications.filter((n) => n.type === 'safety'), [allNotifications]);

  const unreadCount = useMemo(() => allNotifications.filter((n) => !n.isRead).length, [allNotifications]);

  const filteredNotifications = useMemo<NotificationItem[]>(() => {
    let list = allNotifications;
    if (filterType !== 'all') {
      list = list.filter((n) => n.type === filterType);
    }
    if (readFilter === 'unread') {
      list = list.filter((n) => !n.isRead);
    }
    return list;
  }, [allNotifications, filterType, readFilter]);

  const handleNotificationClick = (item: NotificationItem) => {
    setIsOpen(false);

    if (item.type === 'memo' && item.originalData) {
      const memo = item.originalData as Memo;
      markMemoAsRead(currentUser?.id, memo.id);
      if (onUpdateMemos) {
        const updated = memos.map((m) => {
          if (m.id === memo.id) {
            return {
              ...m,
              status: 'read' as const,
              recipientStatuses:
                m.recipientStatuses && m.recipientStatuses.length > 0
                  ? m.recipientStatuses.map((st) =>
                      st.userId === currentUser.id ? { ...st, isViewed: true, viewedAt: new Date().toISOString() } : st
                    )
                  : [
                      {
                        userId: currentUser.id,
                        userName: currentUser.name || '',
                        isViewed: true,
                        viewedAt: new Date().toISOString(),
                        isHandled: false,
                        status: 'read' as const,
                      },
                    ],
            };
          }
          return m;
        });
        onUpdateMemos(updated);
      }
    } else if (item.type === 'workflow' && item.originalData) {
      const app = item.originalData as WorkflowApplication;
      markWorkflowAsRead(currentUser?.id, app.id);
    } else if (item.type === 'board' && item.originalData) {
      const topic = item.originalData as BoardTopic;
      markTopicAsRead(currentUser?.id, topic.id);
      if (onUpdateTopic) {
        const currentViewers = topic.viewers || [];
        const alreadyViewed = currentViewers.some((v) => v?.user?.id === currentUser.id);
        if (!alreadyViewed) {
          onUpdateTopic({
            ...topic,
            viewers: [...currentViewers, { user: currentUser, viewedAt: new Date().toISOString() }],
            views: (topic.views || 0) + 1,
          });
        }
      }
    } else if (item.type === 'chat' && item.originalData) {
      const room = item.originalData as ChatRoom;
      markChatRoomAsRead(currentUser?.id, room.id);
      if (onUpdateRooms) {
        const updatedReadStatus = { ...(room.readStatus || {}), [currentUser.id]: new Date().toISOString() };
        onUpdateRooms(chatRooms.map(r => r.id === room.id ? { ...r, readStatus: updatedReadStatus } : r));
      }
    } else if (item.type === 'event' && item.originalData) {
      const evt = item.originalData as CalendarEvent;
      markEventAsRead(currentUser?.id, evt.id);
      if (onUpdateEvent) {
        const currentViewers = (evt as any).viewers || [];
        const alreadyViewed = currentViewers.some((v: any) => v?.userId === currentUser.id || v?.user?.id === currentUser.id);
        if (!alreadyViewed) {
          onUpdateEvent({
            ...evt,
            viewers: [...currentViewers, { userId: currentUser.id, viewedAt: new Date().toISOString() }]
          } as any);
        }
      }
    } else if (item.type === 'report' && item.originalData) {
      const rep = item.originalData as DailyReport;
      markReportAsRead(currentUser?.id, rep.id);
    } else if (item.type === 'safety' && item.originalData) {
      const sev = item.originalData as SafetyConfirmationEvent;
      markSafetyEventAsResponded(currentUser?.id, sev.id);
      if (onNavigateToContent) {
        onNavigateToContent({ tab: 'safety_confirmation', safetyEventId: sev.id });
        return;
      }
    }

    if (onNavigateToContent) {
      const targetParams: any = { tab: item.tab };
      if (item.type === 'board' && item.originalData) targetParams.topicId = (item.originalData as BoardTopic).id;
      if (item.type === 'chat' && item.originalData) targetParams.chatRoomId = (item.originalData as ChatRoom).id;
      if (item.type === 'memo' && item.originalData) targetParams.memoId = (item.originalData as Memo).id;
      if (item.type === 'workflow' && item.originalData) targetParams.applicationId = (item.originalData as WorkflowApplication).id;
      if (item.type === 'event' && item.originalData) targetParams.eventId = (item.originalData as CalendarEvent).id;
      if (item.type === 'report' && item.originalData) targetParams.reportId = (item.originalData as DailyReport).id;
      if (item.type === 'safety' && item.originalData) targetParams.safetyEventId = (item.originalData as SafetyConfirmationEvent).id;

      onNavigateToContent(targetParams);
    } else if (onSelectTab) {
      onSelectTab(item.tab);
    }
  };

  const handleMarkAllAsRead = () => {
    allNotifications.forEach((item) => {
      if (item.isRead) return;
      if (item.type === 'memo' && item.originalData) markMemoAsRead(currentUser?.id, item.originalData.id);
      if (item.type === 'workflow' && item.originalData) markWorkflowAsRead(currentUser?.id, item.originalData.id);
      if (item.type === 'board' && item.originalData) markTopicAsRead(currentUser?.id, item.originalData.id);
      if (item.type === 'chat' && item.originalData) markChatRoomAsRead(currentUser?.id, item.originalData.id);
      if (item.type === 'event' && item.originalData) markEventAsRead(currentUser?.id, item.originalData.id);
      if (item.type === 'report' && item.originalData) markReportAsRead(currentUser?.id, item.originalData.id);
      if (item.type === 'safety' && item.originalData) markSafetyEventAsResponded(currentUser?.id, item.originalData.id);
    });

    if (onUpdateMemos && memos.length > 0) {
      const updatedMemos = memos.map((m) => ({
        ...m,
        status: 'read' as const,
        recipientStatuses:
          m.recipientStatuses && m.recipientStatuses.length > 0
            ? m.recipientStatuses.map((st) =>
                st.userId === currentUser.id ? { ...st, isViewed: true, viewedAt: new Date().toISOString() } : st
              )
            : [
                {
                  userId: currentUser.id,
                  userName: currentUser.name || '',
                  isViewed: true,
                  viewedAt: new Date().toISOString(),
                  isHandled: false,
                  status: 'read' as const,
                },
              ],
      }));
      onUpdateMemos(updatedMemos);
    }

    if (onUpdateTopic && topics.length > 0) {
      topics.forEach((t) => {
        const isViewed = t.viewers?.some((v) => v?.user?.id === currentUser.id);
        if (!isViewed) {
          onUpdateTopic({
            ...t,
            viewers: [...(t.viewers || []), { user: currentUser, viewedAt: new Date().toISOString() }],
            views: (t.views || 0) + 1,
          });
        }
      });
    }

    if (events && events.length > 0) {
      const evtIds = events.map((e) => e.id);
      markAllEventsAsRead(currentUser?.id, evtIds);
    }
  };

  const getItemIcon = (type: NotificationItem['type']) => {
    switch (type) {
      case 'memo':
        return <Phone className="w-3.5 h-3.5 text-amber-600" />;
      case 'workflow':
        return <FileText className="w-3.5 h-3.5 text-blue-600" />;
      case 'board':
        return <Monitor className="w-3.5 h-3.5 text-indigo-600" />;
      case 'event':
        return <CalendarIcon className="w-3.5 h-3.5 text-emerald-600" />;
      case 'chat':
        return <MessageSquare className="w-3.5 h-3.5 text-violet-600" />;
      case 'report':
        return <FileText className="w-3.5 h-3.5 text-teal-600" />;
      case 'safety':
        return <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />;
    }
  };

  const getItemBg = (type: NotificationItem['type']) => {
    switch (type) {
      case 'memo':
        return 'bg-amber-100/70 border-amber-200';
      case 'workflow':
        return 'bg-blue-100/70 border-blue-200';
      case 'board':
        return 'bg-indigo-100/70 border-indigo-200';
      case 'event':
        return 'bg-emerald-100/70 border-emerald-200';
      case 'chat':
        return 'bg-violet-100/70 border-violet-200';
      case 'report':
        return 'bg-teal-100/70 border-teal-200';
      case 'safety':
        return 'bg-rose-100/70 border-rose-200';
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shrink-0 shadow-xs">
      {/* 代理ログイン中インフォメーション＆ワンクリック復帰バー */}
      {impersonatorAdmin && (
        <div className="bg-gradient-to-r from-amber-600 via-amber-500 to-orange-500 text-white px-3.5 sm:px-6 py-2 flex flex-wrap items-center justify-between gap-2.5 shadow-inner border-b border-amber-600/60 transition-all animate-in slide-in-from-top-2 duration-200">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="flex items-center justify-center w-6 h-6 rounded-full bg-black/25 text-white shrink-0 shadow-2xs">
              <ShieldAlert className="w-3.5 h-3.5 text-amber-200" />
            </span>
            <div className="text-xs sm:text-sm font-medium truncate flex items-center gap-2 flex-wrap">
              <span className="font-extrabold bg-black/30 px-2 py-0.5 rounded text-[11px] sm:text-xs tracking-wider shadow-2xs border border-white/15">
                代理ログイン中
              </span>
              <span className="text-amber-50">
                現在 <strong className="font-extrabold text-white underline decoration-amber-200/80 underline-offset-2">{currentUser.name}</strong> さん（{currentUser.department || currentUser.division || 'メンバー'}）のアカウントで操作中
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 ml-auto">
            {allUsers && allUsers.length > 0 && onSwitchUser && (
              <select
                value={currentUser.id}
                onChange={(e) => {
                  const targetId = e.target.value;
                  if (targetId === impersonatorAdmin.id) {
                    onRevertToAdmin?.();
                  } else {
                    const selected = allUsers.find((u) => u.id === targetId);
                    if (selected) onSwitchUser(selected);
                  }
                }}
                className="bg-black/25 hover:bg-black/35 text-white text-xs font-bold rounded-lg px-2.5 py-1.5 border border-white/25 focus:outline-none focus:ring-2 focus:ring-white/50 cursor-pointer shadow-xs transition-colors"
                title="他のメンバーへ代理ログインを切り替え"
              >
                <option value={impersonatorAdmin.id} className="text-slate-900 bg-white font-bold">
                  ↩ 元の管理者（{impersonatorAdmin.name}）に戻る
                </option>
                <optgroup label="全社メンバー切り替え" className="text-slate-900 bg-white font-medium">
                  {allUsers
                    .filter((u) => u.id !== impersonatorAdmin.id)
                    .map((u) => (
                      <option key={u.id} value={u.id} className="text-slate-800">
                        {u.name} {u.isAdmin ? ' (管理者)' : ''} - {u.department || u.division || '一般'}
                      </option>
                    ))}
                </optgroup>
              </select>
            )}

            {onRevertToAdmin && (
              <button
                type="button"
                onClick={onRevertToAdmin}
                className="px-3.5 py-1.5 bg-white hover:bg-amber-50 active:scale-95 text-amber-950 font-extrabold text-xs rounded-lg shadow-sm hover:shadow transition-all flex items-center gap-1.5 cursor-pointer shrink-0 border border-amber-300"
                title={`ワンクリックで元の管理者（${impersonatorAdmin.name}）のアカウントに復帰します`}
              >
                <Undo2 className="w-3.5 h-3.5 text-amber-700" />
                <span>管理者（{impersonatorAdmin.name}）に戻る</span>
              </button>
            )}
          </div>
        </div>
      )}

      <div className="w-full px-3 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-2 sm:gap-4">
        {/* Logo area */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="w-9 h-9 rounded-xl border border-slate-200/80 bg-white/80 hover:bg-slate-50 hover:border-slate-300 text-slate-600 shadow-2xs flex items-center justify-center shrink-0 lg:hidden cursor-pointer transition-all"
            title="メニュー"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div
            onClick={() => onSelectTab && onSelectTab('mypage')}
            className="flex items-center gap-2 cursor-pointer select-none hover:opacity-90 transition-opacity relative group/teranago-logo shrink-0"
            title={`マイページへ (TERAPO ${APP_VERSION.display})`}
          >
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-xs shrink-0">
              <span className="text-white font-bold text-lg leading-none">T</span>
            </div>
            <div className="relative flex items-center">
              <span className="text-xl font-bold tracking-tight text-slate-800 hidden lg:block">
                TERA<span className="text-indigo-600">PO</span>
              </span>
              {/* バージョン表示ツールチップ（マウスオーバーで表示） */}
              <div className="absolute left-0 top-full mt-2 hidden group-hover/teranago-logo:flex items-center gap-1.5 px-2.5 py-1 bg-slate-900/95 text-white text-[11px] font-medium rounded-md shadow-xl border border-slate-700/60 backdrop-blur-xs whitespace-nowrap z-50 pointer-events-none transition-all duration-150 animate-in fade-in slide-in-from-top-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                <span className="font-semibold text-emerald-300">{APP_VERSION.display}</span>
                <span className="text-slate-400 text-[10px]">({APP_VERSION.date} 日本標準時 JST)</span>
              </div>
            </div>
          </div>
        </div>

        {/* Search area */}
        <div className="flex-1 min-w-0 max-w-xl px-1 sm:px-2 md:px-4 lg:px-8 relative" ref={searchContainerRef}>
          <div className="relative group">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              id="teranago_header_global_search_input"
              name="teranago_header_global_search_input"
              autoComplete="off"
              autoCorrect="off"
              autoCapitalize="none"
              spellCheck={false}
              className="w-full bg-slate-100 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-full py-2 pl-9 sm:pl-10 pr-9 text-xs sm:text-sm transition-all truncate"
              placeholder="社内データを検索..."
              value={searchQuery}
              onFocus={() => setIsSearchFocused(true)}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setIsSearchFocused(true);
              }}
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  onSearchChange('');
                  setIsSearchFocused(false);
                }}
                className="absolute inset-y-0 right-3 flex items-center text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                title="検索入力をクリア"
              >
                <X className="w-4 h-4" />
              </button>
            )}
          </div>

          {/* Cross-functional Search Dropdown Overlay */}
          {isSearchFocused && searchQuery.trim().length > 0 && (
            <div className="absolute left-2 right-2 sm:left-12 sm:right-12 top-full mt-2 bg-white rounded-2xl shadow-2xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 ring-1 ring-slate-900/5 max-h-[80vh] flex flex-col">
              {/* Dropdown Header */}
              <div className="p-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2 shrink-0">
                <div className="flex items-center gap-2">
                  <Search className="w-4 h-4 text-indigo-600" />
                  <span className="font-bold text-slate-800 text-xs sm:text-sm">
                    横断検索結果 ({searchResults.length}件)
                  </span>
                </div>
                <span className="text-[10px] text-slate-400 hidden sm:inline">Escキーまたは外側クリックで閉じる</span>
              </div>

              {/* Category Filter Pills */}
              <div className="flex items-center gap-1 p-2 bg-white border-b border-slate-100 overflow-x-auto text-xs no-scrollbar shrink-0">
                <button
                  type="button"
                  onClick={() => setSearchCategoryFilter('all')}
                  className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    searchCategoryFilter === 'all'
                      ? 'bg-slate-800 text-white font-bold'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  すべて ({categoryCounts.all})
                </button>
                {categoryCounts.board > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchCategoryFilter('board')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      searchCategoryFilter === 'board'
                        ? 'bg-indigo-600 text-white font-bold'
                        : 'text-slate-600 hover:bg-indigo-50'
                    }`}
                  >
                    掲示板 ({categoryCounts.board})
                  </button>
                )}
                {categoryCounts.event > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchCategoryFilter('event')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      searchCategoryFilter === 'event'
                        ? 'bg-amber-600 text-white font-bold'
                        : 'text-slate-600 hover:bg-amber-50'
                    }`}
                  >
                    スケジュール ({categoryCounts.event})
                  </button>
                )}
                {categoryCounts.memo > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchCategoryFilter('memo')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      searchCategoryFilter === 'memo'
                        ? 'bg-rose-600 text-white font-bold'
                        : 'text-slate-600 hover:bg-rose-50'
                    }`}
                  >
                    伝言メモ ({categoryCounts.memo})
                  </button>
                )}
                {categoryCounts.workflow > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchCategoryFilter('workflow')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      searchCategoryFilter === 'workflow'
                        ? 'bg-purple-600 text-white font-bold'
                        : 'text-slate-600 hover:bg-purple-50'
                    }`}
                  >
                    ワークフロー ({categoryCounts.workflow})
                  </button>
                )}
                {categoryCounts.chat > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchCategoryFilter('chat')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      searchCategoryFilter === 'chat'
                        ? 'bg-blue-600 text-white font-bold'
                        : 'text-slate-600 hover:bg-blue-50'
                    }`}
                  >
                    チャット ({categoryCounts.chat})
                  </button>
                )}
                {categoryCounts.post > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchCategoryFilter('post')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      searchCategoryFilter === 'post'
                        ? 'bg-sky-600 text-white font-bold'
                        : 'text-slate-600 hover:bg-sky-50'
                    }`}
                  >
                    タイムライン ({categoryCounts.post})
                  </button>
                )}
                {categoryCounts.user > 0 && (
                  <button
                    type="button"
                    onClick={() => setSearchCategoryFilter('user')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                      searchCategoryFilter === 'user'
                        ? 'bg-emerald-600 text-white font-bold'
                        : 'text-slate-600 hover:bg-emerald-50'
                    }`}
                  >
                    社員 ({categoryCounts.user})
                  </button>
                )}
              </div>

              {/* Results List */}
              <div className="divide-y divide-slate-100 overflow-y-auto max-h-80">
                {filteredSearchResults.length > 0 ? (
                  filteredSearchResults.map((item) => {
                    const badgeInfo = getSearchItemBadge(item.type);
                    const IconComp = badgeInfo.icon;
                    return (
                      <div
                        key={item.id}
                        onClick={() => handleSearchResultClick(item)}
                        className="p-3 hover:bg-slate-50 transition-colors cursor-pointer flex items-start gap-3 group"
                      >
                        <div className={`p-2 rounded-xl border ${badgeInfo.bg} shrink-0 mt-0.5`}>
                          <IconComp className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between gap-2 mb-0.5">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${badgeInfo.bg}`}>
                                {item.typeName}
                              </span>
                              <h4 className="text-xs sm:text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                                {item.title}
                              </h4>
                            </div>
                            {item.dateStr && (
                              <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                                {item.dateStr}
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                            {item.snippet}
                          </p>
                        </div>
                        <div className="shrink-0 self-center text-slate-300 group-hover:text-indigo-500 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                    <Search className="w-8 h-8 text-slate-300 mb-1" />
                    <p className="text-sm font-semibold text-slate-600">該当する検索結果が見つかりませんでした</p>
                    <p className="text-xs text-slate-400">キーワードを変更してお試しください</p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-1.5 sm:gap-2 lg:gap-3 shrink-0">
          {/* Unified Appearance Settings Switcher (文字の大きさ設定 + カラー設定) */}
          <div className="relative shrink-0" ref={appearancePickerRef}>
            {(() => {
              const activeOpt = THEME_OPTIONS.find(t => t.id === currentTheme) || THEME_OPTIONS[0];
              const activeSizeOpt = FONT_SIZE_OPTIONS.find(f => f.id === currentFontSize) || FONT_SIZE_OPTIONS[1];
              return (
                <button
                  type="button"
                  id="header-appearance-picker-button"
                  onClick={() => {
                    setIsAppearancePickerOpen((prev) => !prev);
                    setIsOpen(false);
                    setIsBookmarkOpen(false);
                  }}
                  className={`w-9 h-9 rounded-xl transition-all flex items-center justify-center cursor-pointer border select-none shrink-0 ${
                    isAppearancePickerOpen
                      ? 'bg-slate-100/90 border-slate-300 ring-2 ring-indigo-500/20'
                      : 'border-slate-200/80 bg-white/80 hover:bg-slate-50 hover:border-slate-300 shadow-2xs'
                  }`}
                  title={`見た目設定（文字: ${activeSizeOpt.label} / 配色: ${activeOpt.name}）`}
                  aria-label={`見た目設定（文字: ${activeSizeOpt.label} / 配色: ${activeOpt.name}）`}
                >
                  <div
                    className="w-5 h-5 rounded-lg border border-slate-300/80 shadow-2xs flex items-center justify-center relative overflow-hidden"
                    style={{ backgroundColor: activeOpt.bgPreview }}
                  >
                    <div className="flex items-center -space-x-1 scale-75">
                      <span className="w-2.5 h-2.5 rounded-full inline-block shadow-2xs ring-1 ring-white" style={{ backgroundColor: activeOpt.previewColors[1] }} />
                      <span className="w-2 h-2 rounded-full inline-block shadow-2xs ring-1 ring-white" style={{ backgroundColor: activeOpt.previewColors[0] }} />
                      <span className="w-2.5 h-2.5 rounded-full inline-block shadow-2xs ring-1 ring-white" style={{ backgroundColor: activeOpt.previewColors[2] }} />
                    </div>
                  </div>
                </button>
              );
            })()}

            {isAppearancePickerOpen && (
              <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-full sm:mt-2 sm:w-96 bg-white rounded-2xl shadow-2xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 ring-1 ring-slate-900/5 max-h-[85vh] flex flex-col">
                <div className="flex items-center justify-between p-3.5 bg-slate-50/80 border-b border-slate-100 shrink-0">
                  <div className="flex items-center gap-2 font-bold text-xs text-slate-800">
                    <Palette className="w-4 h-4 text-indigo-600" />
                    <span>見た目設定（文字サイズ・配色）</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAppearancePickerOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                    title="閉じる"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="overflow-y-auto p-3 space-y-3.5 divide-y divide-slate-100">
                  {/* Section 1: 文字の大きさ設定 (カラー設定の上) */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <Type className="w-3.5 h-3.5 text-indigo-600" />
                        文字の大きさ設定
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">
                        現在: {(FONT_SIZE_OPTIONS.find(f => f.id === currentFontSize) || FONT_SIZE_OPTIONS[1]).label}（{(FONT_SIZE_OPTIONS.find(f => f.id === currentFontSize) || FONT_SIZE_OPTIONS[1]).badgeText}）
                      </span>
                    </div>

                    <div className="grid grid-cols-4 gap-1.5">
                      {FONT_SIZE_OPTIONS.map((opt) => {
                        const isSelected = currentFontSize === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleChangeFontSize(opt.id)}
                            title={opt.description}
                            className={`p-2 rounded-xl border transition-all flex flex-col items-center justify-center gap-1 cursor-pointer ${
                              isSelected
                                ? 'border-indigo-500 bg-indigo-50/80 ring-1 ring-indigo-500/30 shadow-2xs'
                                : 'border-slate-200/80 bg-white hover:border-slate-300 hover:bg-slate-50'
                            }`}
                          >
                            <span
                              className={`font-bold leading-none ${isSelected ? 'text-indigo-700' : 'text-slate-700'}`}
                              style={{ fontSize: opt.basePx }}
                            >
                              あA
                            </span>
                            <div className="flex items-center gap-0.5">
                              <span className={`text-[11px] font-bold whitespace-nowrap ${isSelected ? 'text-indigo-900' : 'text-slate-700'}`}>
                                {opt.label}
                              </span>
                              {isSelected && <Check className="w-3 h-3 text-indigo-600 shrink-0" />}
                            </div>
                            <span className="text-[9px] text-slate-400 font-mono leading-none">
                              {opt.badgeText}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Section 2: カラー設定 */}
                  <div className="pt-3 space-y-3.5 divide-y divide-slate-100">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                        <Palette className="w-3.5 h-3.5 text-indigo-600" />
                        カラー・テーマ設定
                      </span>
                      <span className="text-[10px] text-slate-500 font-medium">全10テーマ</span>
                    </div>

                    {/* Category 1: 🌙 ダーク＆大人系 */}
                    <div className="pt-2.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          🌙 ダーク＆大人系（夜間・高コントラスト）
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {THEME_OPTIONS.filter((o) => o.category === 'dark').map((opt) => {
                          const isSelected = currentTheme === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleChangeColorTheme(opt.id)}
                              className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                                isSelected
                                  ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500/30'
                                  : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <div
                                className="w-9 h-9 rounded-lg border border-slate-700/60 shadow-2xs shrink-0 flex flex-col items-center justify-center p-1 relative overflow-hidden"
                                style={{ backgroundColor: opt.bgPreview }}
                                title={opt.bgLabel}
                              >
                                <div
                                  className="w-6 h-4 rounded border border-slate-600/50 flex items-center justify-center shadow-xs"
                                  style={{ backgroundColor: opt.cardPreview }}
                                >
                                  <div className="flex items-center -space-x-1 scale-75">
                                    {opt.previewColors.map((color, idx) => (
                                      <span
                                        key={idx}
                                        className="w-2 h-2 rounded-full shadow-2xs ring-1 ring-slate-800 inline-block"
                                        style={{ backgroundColor: color }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className={`text-xs font-bold ${isSelected ? 'text-indigo-950 font-black' : 'text-slate-800'}`}>
                                    {opt.name}
                                  </span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                                  {opt.description}
                                </p>
                                <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-900 text-slate-200 font-medium">
                                  背景: {opt.bgLabel}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Category 2: 📜 クラシック＆シック */}
                    <div className="pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          📜 クラシック＆シック（書斎・ミニマル）
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {THEME_OPTIONS.filter((o) => o.category === 'classic').map((opt) => {
                          const isSelected = currentTheme === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleChangeColorTheme(opt.id)}
                              className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                                isSelected
                                  ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500/30'
                                  : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <div
                                className="w-9 h-9 rounded-lg border border-slate-300/80 shadow-2xs shrink-0 flex flex-col items-center justify-center p-1 relative overflow-hidden"
                                style={{ backgroundColor: opt.bgPreview }}
                                title={opt.bgLabel}
                              >
                                <div
                                  className="w-6 h-4 rounded border border-slate-200 flex items-center justify-center shadow-xs"
                                  style={{ backgroundColor: opt.cardPreview }}
                                >
                                  <div className="flex items-center -space-x-1 scale-75">
                                    {opt.previewColors.map((color, idx) => (
                                      <span
                                        key={idx}
                                        className="w-2 h-2 rounded-full shadow-2xs ring-1 ring-white/90 inline-block"
                                        style={{ backgroundColor: color }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className={`text-xs font-bold ${isSelected ? 'text-indigo-950 font-black' : 'text-slate-800'}`}>
                                    {opt.name}
                                  </span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                                  {opt.description}
                                </p>
                                <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                  背景: {opt.bgLabel}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Category 3: 🎨 カラー＆アース */}
                    <div className="pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          🎨 カラー＆アース（自然・寒色・暖色・パステル）
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {THEME_OPTIONS.filter((o) => o.category === 'color').map((opt) => {
                          const isSelected = currentTheme === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleChangeColorTheme(opt.id)}
                              className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                                isSelected
                                  ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500/30'
                                  : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <div
                                className="w-9 h-9 rounded-lg border border-slate-300/80 shadow-2xs shrink-0 flex flex-col items-center justify-center p-1 relative overflow-hidden"
                                style={{ backgroundColor: opt.bgPreview }}
                                title={opt.bgLabel}
                              >
                                <div
                                  className="w-6 h-4 rounded border border-slate-200 flex items-center justify-center shadow-xs"
                                  style={{ backgroundColor: opt.cardPreview }}
                                >
                                  <div className="flex items-center -space-x-1 scale-75">
                                    {opt.previewColors.map((color, idx) => (
                                      <span
                                        key={idx}
                                        className="w-2 h-2 rounded-full shadow-2xs ring-1 ring-white/90 inline-block"
                                        style={{ backgroundColor: color }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className={`text-xs font-bold ${isSelected ? 'text-indigo-950 font-black' : 'text-slate-800'}`}>
                                    {opt.name}
                                  </span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                                  {opt.description}
                                </p>
                                <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                  背景: {opt.bgLabel}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    {/* Category 4: ⚪ スタンダード */}
                    <div className="pt-3">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                          ⚪ スタンダード（標準）
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {THEME_OPTIONS.filter((o) => o.category === 'standard').map((opt) => {
                          const isSelected = currentTheme === opt.id;
                          return (
                            <button
                              key={opt.id}
                              type="button"
                              onClick={() => handleChangeColorTheme(opt.id)}
                              className={`w-full text-left p-2.5 rounded-xl border transition-all flex items-start gap-2.5 cursor-pointer ${
                                isSelected
                                  ? 'border-indigo-500 bg-indigo-50/70 ring-1 ring-indigo-500/30'
                                  : 'border-slate-100 hover:border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              <div
                                className="w-9 h-9 rounded-lg border border-slate-300/80 shadow-2xs shrink-0 flex flex-col items-center justify-center p-1 relative overflow-hidden"
                                style={{ backgroundColor: opt.bgPreview }}
                                title={opt.bgLabel}
                              >
                                <div
                                  className="w-6 h-4 rounded border border-slate-200 flex items-center justify-center shadow-xs"
                                  style={{ backgroundColor: opt.cardPreview }}
                                >
                                  <div className="flex items-center -space-x-1 scale-75">
                                    {opt.previewColors.map((color, idx) => (
                                      <span
                                        key={idx}
                                        className="w-2 h-2 rounded-full shadow-2xs ring-1 ring-white/90 inline-block"
                                        style={{ backgroundColor: color }}
                                      />
                                    ))}
                                  </div>
                                </div>
                              </div>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center justify-between gap-1">
                                  <span className={`text-xs font-bold ${isSelected ? 'text-indigo-950 font-black' : 'text-slate-800'}`}>
                                    {opt.name}
                                  </span>
                                  {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                                </div>
                                <p className="text-[10px] text-slate-500 mt-0.5 leading-snug">
                                  {opt.description}
                                </p>
                                <span className="inline-block mt-1 text-[9px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-medium">
                                  背景: {opt.bgLabel}
                                </span>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Mini Notification Mode Button (PC画面のみ表示: 縮小表示・最前面ミニ通知常駐) */}
          <button
            type="button"
            onClick={() => {
              setIsMiniNotificationOpen((prev) => !prev);
              setIsOpen(false);
              setIsBookmarkOpen(false);
            }}
            className={`w-9 h-9 rounded-xl transition-all items-center justify-center cursor-pointer border select-none shrink-0 hidden lg:flex ${
              isMiniNotificationOpen
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                : 'border-slate-200/80 bg-white/80 hover:bg-slate-50 hover:border-slate-300 text-slate-600 shadow-2xs'
            }`}
            title="最前面ミニ通知モード (縮小表示して通知のみ常駐表示)"
            aria-label="最前面ミニ通知モード (縮小表示して通知のみ常駐表示)"
          >
            <Minimize2 className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>

          {/* Personal Bookmarks / Favorites Button */}
          <div className="relative shrink-0" ref={bookmarkPopoverRef}>
            <button
              type="button"
              onClick={() => {
                setIsBookmarkOpen((prev) => !prev);
                setIsOpen(false);
              }}
              className={`w-9 h-9 rounded-xl transition-all flex items-center justify-center cursor-pointer border select-none shrink-0 relative ${
                isBookmarkOpen
                  ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/20 text-amber-600'
                  : bookmarks.length > 0
                  ? 'border-slate-200/80 bg-white/80 hover:bg-amber-50/70 hover:border-amber-300 text-slate-700 hover:text-amber-600 shadow-2xs'
                  : 'border-slate-200/80 bg-white/80 hover:bg-slate-50 hover:border-slate-300 text-slate-600 shadow-2xs'
              }`}
              title={`お気に入り・ブックマーク (${bookmarks.length}件)`}
              aria-label={`お気に入り・ブックマーク (${bookmarks.length}件)`}
            >
              <Bookmark className={`w-4 h-4 sm:w-4.5 sm:h-4.5 ${pinnedBookmarkCount > 0 ? 'fill-amber-400 text-amber-500' : ''}`} />
              {bookmarks.length > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-indigo-600 rounded-full ring-2 ring-white shadow-xs">
                  {bookmarks.length > 99 ? '99+' : bookmarks.length}
                </span>
              )}
            </button>

            {isBookmarkOpen && (
              <div className="fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-full sm:mt-2 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 ring-1 ring-slate-900/5">
                {/* Header */}
                <div className="p-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Bookmark className="w-4 h-4 text-amber-500 fill-amber-400 shrink-0" />
                    <span className="font-bold text-slate-800 text-sm whitespace-nowrap">お気に入り</span>
                    <span className="px-2 py-0.5 text-[11px] font-bold bg-indigo-100 text-indigo-700 rounded-full whitespace-nowrap">
                      {bookmarks.length}件
                    </span>
                    {pinnedBookmarkCount > 0 && (
                      <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-100 text-amber-800 rounded-full inline-flex items-center gap-0.5 whitespace-nowrap">
                        <Pin className="w-2.5 h-2.5 fill-amber-500 text-amber-600" />
                        {pinnedBookmarkCount}
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsBookmarkOpen(false)}
                    className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors cursor-pointer"
                    title="閉じる"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Search & Category Filter */}
                {bookmarks.length > 0 && (
                  <div className="border-b border-slate-100 bg-white">
                    {bookmarks.length >= 3 && (
                      <div className="px-3 pt-2.5 pb-1">
                        <div className="relative">
                          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                          <input
                            type="text"
                            value={bookmarkSearch}
                            onChange={(e) => setBookmarkSearch(e.target.value)}
                            placeholder="お気に入りを絞り込み..."
                            className="w-full bg-slate-100 focus:bg-white border border-transparent focus:border-indigo-300 focus:ring-2 focus:ring-indigo-500/20 rounded-lg py-1.5 pl-8 pr-7 text-xs text-slate-800 outline-none transition-all"
                          />
                          {bookmarkSearch && (
                            <button
                              type="button"
                              onClick={() => setBookmarkSearch('')}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    )}
                    <div className="flex items-center gap-1 p-2 overflow-x-auto text-xs no-scrollbar">
                      <button
                        type="button"
                        onClick={() => setBookmarkFilter('all')}
                        className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                          bookmarkFilter === 'all'
                            ? 'bg-slate-800 text-white font-bold'
                            : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        すべて ({bookmarks.length})
                      </button>
                      {pinnedBookmarkCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setBookmarkFilter('pinned')}
                          className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer inline-flex items-center gap-1 ${
                            bookmarkFilter === 'pinned'
                              ? 'bg-amber-500 text-white font-bold'
                              : 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                          }`}
                        >
                          <Pin className="w-3 h-3" />
                          <span>ピン留め ({pinnedBookmarkCount})</span>
                        </button>
                      )}
                      {(['board', 'calendar', 'chat', 'workflow', 'memo', 'daily_report'] as UserBookmarkCategory[]).map((cat) => {
                        const cnt = bookmarkCategoryCounts[cat] || 0;
                        if (cnt === 0) return null;
                        return (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setBookmarkFilter(cat)}
                            className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors cursor-pointer ${
                              bookmarkFilter === cat
                                ? 'bg-indigo-600 text-white font-bold'
                                : 'text-slate-600 hover:bg-indigo-50'
                            }`}
                          >
                            {getBookmarkCategoryLabel(cat)} ({cnt})
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Undo Toast Bar */}
                {deletedBookmarkUndo && (
                  <div className="px-3 py-2 bg-slate-900 text-white text-xs flex items-center justify-between gap-2">
                    <span className="truncate">「{deletedBookmarkUndo.title}」を削除しました</span>
                    <button
                      type="button"
                      onClick={handleUndoDeleteBookmark}
                      className="px-2 py-0.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded text-[11px] inline-flex items-center gap-1 shrink-0 cursor-pointer transition-colors"
                    >
                      <Undo2 className="w-3 h-3" />
                      <span>元に戻す</span>
                    </button>
                  </div>
                )}

                {/* Bookmarks List */}
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                  {filteredBookmarks.length > 0 ? (
                    filteredBookmarks.map((item) => {
                      const badge = getBookmarkBadgeStyle(item.category);
                      const IconComp = badge.icon;
                      const isCopied = copiedBookmarkId === item.id;
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleNavigateBookmark(item)}
                          className={`p-3 cursor-pointer transition-colors flex items-start gap-2.5 group ${
                            item.isPinned
                              ? 'bg-amber-50/45 hover:bg-amber-50/80'
                              : 'bg-white hover:bg-indigo-50/50'
                          }`}
                        >
                          <div className={`p-2 rounded-xl border shrink-0 mt-0.5 ${badge.bg}`}>
                            <IconComp className="w-4 h-4" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 mb-0.5 flex-wrap">
                              {item.isPinned && (
                                <span className="inline-flex items-center gap-0.5 px-1.5 py-0.2 rounded text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-200 whitespace-nowrap">
                                  <Pin className="w-2.5 h-2.5 fill-amber-500 text-amber-600" />
                                  ピン留め
                                </span>
                              )}
                              <span className="text-[10px] font-bold text-slate-500 whitespace-nowrap">
                                {getBookmarkCategoryLabel(item.category)}
                              </span>
                              <span className="text-[10px] text-slate-400 ml-auto whitespace-nowrap">
                                {formatRelativeTime(item.updatedAt || item.createdAt)}
                              </span>
                            </div>
                            <h4 className="text-xs sm:text-sm font-bold text-slate-800 group-hover:text-indigo-600 line-clamp-1 transition-colors">
                              {item.title}
                            </h4>
                            {item.subtitle && (
                              <p className="text-[11px] text-slate-500 line-clamp-1 mt-0.5">
                                {item.subtitle}
                              </p>
                            )}
                          </div>
                          {/* Actions: ピン留め / URL再コピー / ワンボタン削除 */}
                          <div className="flex items-center gap-1 shrink-0 self-center">
                            <button
                              type="button"
                              onClick={(e) => handleTogglePinBookmark(item.id, e)}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                item.isPinned
                                  ? 'bg-amber-100 text-amber-700 border-amber-300 hover:bg-amber-200'
                                  : 'bg-white text-slate-400 border-slate-200 hover:text-amber-600 hover:border-amber-300 hover:bg-amber-50'
                              }`}
                              title={item.isPinned ? 'ピン留めを解除' : '上部にピン留め'}
                            >
                              <Pin className={`w-3.5 h-3.5 ${item.isPinned ? 'fill-amber-500 text-amber-600' : ''}`} />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleCopyBookmarkUrl(item, e)}
                              className={`p-1.5 rounded-lg border transition-colors cursor-pointer ${
                                isCopied
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                                  : 'bg-white text-slate-400 border-slate-200 hover:text-indigo-600 hover:border-indigo-300 hover:bg-indigo-50'
                              }`}
                              title="共有リンクをコピー"
                            >
                              {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleOneClickDeleteBookmark(item, e)}
                              className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-400 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="お気に入りから削除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                      <div className="w-12 h-12 bg-amber-50 rounded-full flex items-center justify-center text-amber-400 mb-1 border border-amber-100">
                        <Bookmark className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-slate-600">
                        {bookmarks.length === 0 ? 'お気に入りはまだありません' : '条件に一致するお気に入りがありません'}
                      </p>
                      <p className="text-xs text-slate-400 leading-relaxed max-w-[260px]">
                        {bookmarks.length === 0
                          ? '掲示板・カレンダー・チャットなどの「共有」ボタンを押すと、URLコピーと同時にここへストックされます。'
                          : '絞り込み条件や検索ワードを変更してみてください。'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                {bookmarks.length > 0 && (
                  <div className="px-3.5 py-2 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <ExternalLink className="w-3 h-3 text-indigo-500" />
                      項目クリックで該当画面へ移動
                    </span>
                    <span>ピン留め項目は常に上部固定</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Notifications Bell */}
          <div className="relative shrink-0" ref={popoverRef}>
            <button
              type="button"
              onClick={() => {
                setIsOpen(!isOpen);
                setIsBookmarkOpen(false);
              }}
              className={`w-9 h-9 rounded-xl transition-all flex items-center justify-center cursor-pointer border select-none shrink-0 relative ${
                isOpen
                  ? 'bg-slate-100/90 border-slate-300 ring-2 ring-indigo-500/20 text-indigo-600'
                  : 'border-slate-200/80 bg-white/80 hover:bg-slate-50 hover:border-slate-300 text-slate-600 shadow-2xs'
              }`}
              title="通知一覧"
            >
              <Bell className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
              {unreadCount > 0 && (
                <span className="absolute -top-1 -right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white shadow-xs">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Popover Dropdown */}
            {isOpen && (() => {
              const activeNotifSizeOpt =
                NOTIFICATION_WINDOW_SIZE_OPTIONS.find((o) => o.id === notificationWindowSize) ||
                NOTIFICATION_WINDOW_SIZE_OPTIONS[1];
              return (
              <div className={`fixed sm:absolute left-2 right-2 sm:left-auto sm:right-0 top-16 sm:top-full sm:mt-2 ${activeNotifSizeOpt.popoverWidthClass} max-w-[calc(100vw-1rem)] bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 ring-1 ring-slate-900/5 transition-[width] duration-150`}>
                {/* Header */}
                <div className="px-2.5 py-2 bg-slate-50 border-b border-slate-100 flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <span className="font-bold text-slate-800 text-xs whitespace-nowrap">通知</span>
                    {unreadCount > 0 ? (
                      <span className="px-1.5 py-0.2 text-[10px] font-bold bg-red-100 text-red-700 rounded-full animate-pulse whitespace-nowrap">
                        {unreadCount}件
                      </span>
                    ) : (
                      <span className="px-1.5 py-0.2 text-[10px] font-medium bg-slate-200/80 text-slate-600 rounded-full whitespace-nowrap">
                        0
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {/* 通知ウィンドウサイズ切替 (小 / 中 / 大) */}
                    <div
                      className="inline-flex items-center bg-slate-200/70 p-0.5 rounded-md border border-slate-200/90 shrink-0"
                      title="通知ウィンドウの大きさを変更（設定は記憶されます）"
                    >
                      {NOTIFICATION_WINDOW_SIZE_OPTIONS.map((sizeOpt) => {
                        const isSizeActive = notificationWindowSize === sizeOpt.id;
                        return (
                          <button
                            key={sizeOpt.id}
                            type="button"
                            onClick={() => handleChangeNotificationWindowSize(sizeOpt.id)}
                            className={`px-1.5 py-0.5 text-[10px] font-bold rounded transition-all cursor-pointer whitespace-nowrap ${
                              isSizeActive
                                ? 'bg-white text-indigo-700 shadow-2xs ring-1 ring-slate-200/80'
                                : 'text-slate-600 hover:text-slate-900'
                            }`}
                            title={`${sizeOpt.label}サイズ（${sizeOpt.description}）`}
                          >
                            {sizeOpt.label}
                          </button>
                        );
                      })}
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        setIsMiniNotificationOpen(true);
                        setIsOpen(false);
                      }}
                      className="hidden lg:inline-flex items-center gap-0.5 text-[10px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 hover:text-indigo-900 px-1.5 py-1 rounded-md transition-colors border border-indigo-200/80 cursor-pointer whitespace-nowrap"
                      title="最前面ミニウィンドウで常駐表示"
                    >
                      <Minimize2 className="w-3 h-3" />
                      <span>ミニ</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-md transition-colors cursor-pointer"
                      title="閉じる"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Read / Unread Status Filter Toggle Bar */}
                <div className="flex items-center justify-between px-2.5 py-1 bg-slate-100/70 border-b border-slate-200/80 text-xs gap-1">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setReadFilter('all')}
                      className={`px-2 py-0.5 rounded text-[10.5px] font-bold transition-all cursor-pointer whitespace-nowrap ${
                        readFilter === 'all'
                          ? 'bg-slate-800 text-white shadow-2xs'
                          : 'text-slate-600 hover:bg-white hover:text-slate-800'
                      }`}
                    >
                      すべて ({allNotifications.length})
                    </button>
                    <button
                      type="button"
                      onClick={() => setReadFilter('unread')}
                      className={`px-2 py-0.5 rounded text-[10.5px] font-bold transition-all cursor-pointer flex items-center gap-1 whitespace-nowrap ${
                        readFilter === 'unread'
                          ? 'bg-indigo-600 text-white shadow-2xs'
                          : 'text-slate-600 hover:bg-white hover:text-slate-800'
                      }`}
                    >
                      <span>未読</span>
                      {unreadCount > 0 ? (
                        <span className={`px-1 py-0 text-[9.5px] rounded-full font-bold ${
                          readFilter === 'unread' ? 'bg-white text-indigo-700' : 'bg-red-500 text-white'
                        }`}>
                          {unreadCount}
                        </span>
                      ) : (
                        <span className="text-[9.5px] text-slate-400">0</span>
                      )}
                    </button>
                  </div>
                  {unreadCount > 0 ? (
                    <button
                      type="button"
                      onClick={handleMarkAllAsRead}
                      className="flex items-center gap-0.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:bg-white px-1.5 py-0.5 rounded transition-colors cursor-pointer border border-indigo-200/60 whitespace-nowrap"
                      title="すべての未読通知を既読にする"
                    >
                      <CheckCheck className="w-3 h-3 text-indigo-600" />
                      <span>すべて既読</span>
                    </button>
                  ) : readFilter === 'all' && allNotifications.some((n) => n.isRead) ? (
                    <span className="text-[9.5px] text-slate-400 whitespace-nowrap">
                      確認済は灰表示
                    </span>
                  ) : null}
                </div>

                {/* Categories Filter Bar */}
                <div className="flex items-center gap-1 px-2 py-1 bg-white border-b border-slate-100 overflow-x-auto text-[11px] no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setFilterType('all')}
                    className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                      filterType === 'all'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    すべて ({filteredNotifications.length})
                  </button>
                  {memoNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterType('memo')}
                      className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                        filterType === 'memo'
                          ? 'bg-amber-600 text-white font-bold'
                          : 'text-slate-600 hover:bg-amber-50'
                      }`}
                    >
                      伝言 ({memoNotifications.length})
                    </button>
                  )}
                  {workflowNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterType('workflow')}
                      className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                        filterType === 'workflow'
                          ? 'bg-blue-600 text-white font-bold'
                          : 'text-slate-600 hover:bg-blue-50'
                      }`}
                    >
                      申請 ({workflowNotifications.length})
                    </button>
                  )}
                  {boardNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterType('board')}
                      className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                        filterType === 'board'
                          ? 'bg-indigo-600 text-white font-bold'
                          : 'text-slate-600 hover:bg-indigo-50'
                      }`}
                    >
                      掲示板 ({boardNotifications.length})
                    </button>
                  )}
                  {eventNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterType('event')}
                      className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                        filterType === 'event'
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'text-slate-600 hover:bg-emerald-50'
                      }`}
                    >
                      予定 ({eventNotifications.length})
                    </button>
                  )}
                  {chatNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterType('chat')}
                      className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                        filterType === 'chat'
                          ? 'bg-violet-600 text-white font-bold'
                          : 'text-slate-600 hover:bg-violet-50'
                      }`}
                    >
                      チャット ({chatNotifications.length})
                    </button>
                  )}
                  {reportNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterType('report')}
                      className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                        filterType === 'report'
                          ? 'bg-teal-600 text-white font-bold'
                          : 'text-slate-600 hover:bg-teal-50'
                      }`}
                    >
                      日報・週報 ({reportNotifications.length})
                    </button>
                  )}
                  {safetyNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterType('safety')}
                      className={`px-2 py-0.5 rounded-md font-medium whitespace-nowrap transition-colors ${
                        filterType === 'safety'
                          ? 'bg-rose-600 text-white font-bold'
                          : 'text-slate-600 hover:bg-rose-50'
                      }`}
                    >
                      安否確認 ({safetyNotifications.length})
                    </button>
                  )}
                </div>

                {/* Items List (コンパクト表示で縦情報量を最大化) */}
                <div className={`${activeNotifSizeOpt.listMaxHeightClass} overflow-y-auto divide-y divide-slate-100`}>
                  {filteredNotifications.length > 0 ? (
                    filteredNotifications.map((item) => {
                      const isRead = !!item.isRead;
                      return (
                        <div
                          key={item.id}
                          onClick={() => handleNotificationClick(item)}
                          className={`px-2.5 py-1.5 cursor-pointer transition-colors flex items-start gap-2 group relative ${
                            isRead
                              ? 'bg-slate-50/70 hover:bg-slate-100/80 opacity-75'
                              : 'bg-white hover:bg-indigo-50/60'
                          }`}
                        >
                          <div
                            className={`p-1.5 rounded-lg shrink-0 border flex items-center justify-center mt-0.5 ${
                              isRead
                                ? 'bg-slate-100 border-slate-200/90 text-slate-400'
                                : getItemBg(item.type)
                            }`}
                          >
                            {getItemIcon(item.type)}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between gap-1">
                              <div className="flex items-center gap-1 min-w-0">
                                {isRead ? (
                                  <span className="text-[9px] text-slate-500 bg-slate-200/80 px-1 py-0 rounded font-medium shrink-0">
                                    済
                                  </span>
                                ) : (
                                  <span className="text-[9px] text-red-700 bg-red-100 px-1 py-0 rounded font-bold shrink-0">
                                    未
                                  </span>
                                )}
                                <h4
                                  className={`text-[11.5px] leading-tight line-clamp-1 transition-colors ${
                                    isRead
                                      ? 'font-medium text-slate-500'
                                      : 'font-bold text-slate-900 group-hover:text-indigo-600'
                                  }`}
                                >
                                  {item.title}
                                </h4>
                              </div>
                              <span className="text-[9.5px] text-slate-400 whitespace-nowrap shrink-0">
                                {formatRelativeTime(item.createdAt)}
                              </span>
                            </div>
                            {item.description && (
                              <p
                                className={`text-[10.5px] leading-snug mt-0.5 ${
                                  notificationWindowSize === 'large' ? 'line-clamp-2' : 'line-clamp-1'
                                } ${
                                  isRead ? 'text-slate-400' : 'text-slate-600'
                                }`}
                              >
                                {item.description}
                              </p>
                            )}
                          </div>
                          <div className="shrink-0 self-center flex items-center gap-0.5">
                            {!isRead && (
                              <span className="w-1.5 h-1.5 rounded-full bg-red-500" title="未読" />
                            )}
                            <ChevronRight className="w-3.5 h-3.5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className="p-6 text-center text-slate-400 flex flex-col items-center justify-center gap-1.5">
                      <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-0.5">
                        <Bell className="w-5 h-5" />
                      </div>
                      <p className="text-xs font-semibold text-slate-600">
                        {readFilter === 'unread' ? '未読の通知はありません' : '通知はありません'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {readFilter === 'unread' ? 'すべての通知を確認済みです' : '新着通知や履歴はここに表示されます'}
                      </p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-2 py-1.5 bg-slate-50 border-t border-slate-100 flex flex-col gap-1 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      if (onSelectTab) onSelectTab('mypage');
                    }}
                    className="w-full py-1 px-2 text-[11px] font-semibold text-slate-600 hover:text-indigo-600 hover:bg-white rounded-md transition-colors border border-transparent hover:border-slate-200"
                  >
                    マイページですべて確認 →
                  </button>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onOpenSettings();
                      }}
                      className="w-full py-0.5 px-2 text-[10.5px] font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md transition-colors flex items-center justify-center gap-1"
                    >
                      <Smartphone className="w-3 h-3" />
                      <span>プッシュ通知設定を開く</span>
                    </button>
                  )}
                </div>
              </div>
              );
            })()}
          </div>

          <div className="flex items-center gap-2 sm:gap-3 pl-2 sm:pl-3 border-l border-slate-200 shrink-0">
            <button
              type="button"
              onClick={() => {
                if (onOpenSettings) {
                  onOpenSettings();
                } else if (onSelectTab) {
                  onSelectTab('mypage');
                }
              }}
              className="flex items-center gap-2.5 group text-left focus:outline-none rounded-xl p-0.5 sm:p-1 hover:bg-slate-100/80 transition-colors cursor-pointer shrink-0"
              title="個人設定を開く"
            >
              <div className="text-right hidden lg:block">
                <div className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors flex items-center justify-end gap-1">
                  <span>{currentUser.name}</span>
                  {impersonatorAdmin ? (
                    <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-1.5 py-0.2 rounded font-extrabold flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                      代理中
                    </span>
                  ) : currentUser.isAdmin ? (
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded font-bold">
                      管理者
                    </span>
                  ) : null}
                </div>
                <div className="text-xs text-slate-500">{currentUser.department}</div>
              </div>
              <div className="relative shrink-0">
                <img
                  src={getAvatarUrl(currentUser.avatarUrl)}
                  alt={currentUser.name}
                  className={`w-9 h-9 rounded-full bg-indigo-100 border object-cover group-hover:ring-2 transition-all shrink-0 ${
                    impersonatorAdmin 
                      ? 'border-amber-400 ring-2 ring-amber-400/30' 
                      : 'border-indigo-200 group-hover:border-indigo-500 group-hover:ring-indigo-500/20'
                  }`}
                />
                {impersonatorAdmin && (
                  <span className="absolute -bottom-1 -right-1 w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center text-[9px] font-black border-2 border-white shadow-xs">
                    代
                  </span>
                )}
              </div>
            </button>
          </div>
        </div>
      </div>

      {/* 最前面ミニ通知ウィンドウ (Picture-in-Picture / 縮小表示・コンパクトモード) */}
      <MiniNotificationMode
        notifications={allNotifications}
        unreadCount={unreadCount}
        currentUser={currentUser}
        onNotificationClick={handleNotificationClick}
        onMarkAllAsRead={handleMarkAllAsRead}
        isOpen={isMiniNotificationOpen}
        onClose={() => setIsMiniNotificationOpen(false)}
        onRestoreMain={() => {
          setIsMiniNotificationOpen(false);
          window.focus();
        }}
        windowSize={notificationWindowSize}
        onChangeWindowSize={handleChangeNotificationWindowSize}
      />
    </header>
  );
}

