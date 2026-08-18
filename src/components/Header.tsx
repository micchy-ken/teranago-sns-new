import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Bell, Menu, Phone, FileText, Monitor, Calendar as CalendarIcon, MessageSquare, CheckCheck, ChevronRight, X, Smartphone, Users, MessageCircle } from 'lucide-react';
import { User, Memo, WorkflowApplication, BoardTopic, CalendarEvent, ChatRoom, Post } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { AppTab } from './Sidebar';
import { expandRecurringEvents } from '../utils/recurrenceUtils';
import {
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
  getReadWorkflowIds,
  markWorkflowAsRead,
  NotificationItem,
} from '../utils/notifications';

export interface GlobalSearchResultItem {
  id: string;
  type: 'board' | 'event' | 'memo' | 'workflow' | 'chat' | 'post' | 'user';
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
  onLogout?: () => void;
  memos?: Memo[];
  applications?: WorkflowApplication[];
  topics?: BoardTopic[];
  events?: CalendarEvent[];
  chatRooms?: ChatRoom[];
  posts?: Post[];
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
  }) => void;
  onUpdateMemos?: (memos: Memo[]) => void;
  onUpdateTopic?: (topic: BoardTopic) => void;
  onUpdateEvent?: (event: CalendarEvent) => void;
  onUpdateRooms?: (rooms: ChatRoom[]) => void;
  onToggleMobileMenu?: () => void;
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
  onLogout,
  memos = [],
  applications = [],
  topics = [],
  events = [],
  chatRooms = [],
  posts = [],
  onSelectTab,
  onOpenSettings,
  onNavigateToContent,
  onUpdateMemos,
  onUpdateTopic,
  onUpdateEvent,
  onUpdateRooms,
  onToggleMobileMenu,
}: HeaderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [filterType, setFilterType] = useState<'all' | 'memo' | 'workflow' | 'board' | 'event'>('all');
  const [readEventIds, setReadEventIds] = useState<string[]>(() => getReadEventIds(currentUser?.id));
  const [readTopicIds, setReadTopicIds] = useState<string[]>(() => getReadTopicIds(currentUser?.id));
  const [readChatTimestamps, setReadChatTimestamps] = useState<Record<string, string>>(() => getReadChatTimestamps(currentUser?.id));
  const [readMemoIds, setReadMemoIds] = useState<string[]>(() => getReadMemoIds(currentUser?.id));
  const [readWorkflowIds, setReadWorkflowIds] = useState<string[]>(() => getReadWorkflowIds(currentUser?.id));
  const popoverRef = useRef<HTMLDivElement>(null);

  // Cross-functional search state
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [searchCategoryFilter, setSearchCategoryFilter] = useState<'all' | 'board' | 'event' | 'memo' | 'workflow' | 'chat' | 'post' | 'user'>('all');
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // Close search overlay on outside click or Escape key
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchContainerRef.current && !searchContainerRef.current.contains(event.target as Node)) {
        setIsSearchFocused(false);
      }
    };
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsSearchFocused(false);
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
      const matchTitle = evt.title?.toLowerCase().includes(q);
      const matchLocation = evt.location?.toLowerCase().includes(q);
      const matchMemo = evt.memo?.toLowerCase().includes(q);

      if (matchTitle || matchLocation || matchMemo) {
        const localDate = formatLocalDateStr(evt.start);
        const localDateTime = formatLocalDateTimeStr(evt.start, evt.isAllDay);
        results.push({
          id: `event-${evt.id}`,
          type: 'event',
          typeName: 'スケジュール',
          title: evt.title,
          snippet: `${localDateTime}${evt.location ? ` @ ${evt.location}` : ''}${evt.memo ? ` - ${evt.memo.slice(0, 60)}` : ''}`,
          badgeText: evt.type || '予定',
          dateStr: localDate,
          tab: 'calendar',
          originalData: evt,
        });
      }
    });

    // 3. 伝言メモ (Memos)
    memos.forEach((m) => {
      const matchFrom = m.fromName?.toLowerCase().includes(q) || m.fromCompany?.toLowerCase().includes(q);
      const matchContent = m.content?.toLowerCase().includes(q) || m.requirementText?.toLowerCase().includes(q);
      const matchTo = m.toUser?.name?.toLowerCase().includes(q);

      if (matchFrom || matchContent || matchTo) {
        results.push({
          id: `memo-${m.id}`,
          type: 'memo',
          typeName: '伝言メモ',
          title: `${m.fromCompany ? `${m.fromCompany} ` : ''}${m.fromName || '伝言メモ'}`,
          snippet: `【用件】${m.requirementText || m.content || '詳細なし'}`,
          badgeText: `宛先: ${m.toUser?.name || '自分'}`,
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
  }, [searchQuery, topics, events, memos, applications, chatRooms, posts, allUsers]);

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
      if (onNavigateToContent) {
        onNavigateToContent({ tab: 'chat' });
      } else if (onSelectTab) {
        onSelectTab('chat');
      }
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
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Unified Notification Items
  const allNotifications = useMemo<NotificationItem[]>(() => {
    return getUnreadNotifications({
      user: currentUser,
      memos,
      applications,
      topics,
      events,
      chatRooms,
      readEventIds,
      readTopicIds,
      readChatTimestamps,
      readMemoIds,
      readWorkflowIds,
    });
  }, [currentUser, memos, applications, topics, events, chatRooms, readEventIds, readTopicIds, readChatTimestamps, readMemoIds, readWorkflowIds]);

  const memoNotifications = useMemo(() => allNotifications.filter((n) => n.type === 'memo'), [allNotifications]);
  const workflowNotifications = useMemo(() => allNotifications.filter((n) => n.type === 'workflow'), [allNotifications]);
  const boardNotifications = useMemo(() => allNotifications.filter((n) => n.type === 'board'), [allNotifications]);
  const eventNotifications = useMemo(() => allNotifications.filter((n) => n.type === 'event'), [allNotifications]);

  const filteredNotifications = useMemo<NotificationItem[]>(() => {
    if (filterType === 'all') return allNotifications;
    return allNotifications.filter((n) => n.type === filterType);
  }, [allNotifications, filterType]);

  const unreadCount = allNotifications.length;

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
    }

    if (onNavigateToContent) {
      const targetParams: any = { tab: item.tab };
      if (item.type === 'board' && item.originalData) targetParams.topicId = (item.originalData as BoardTopic).id;
      if (item.type === 'chat' && item.originalData) targetParams.chatRoomId = (item.originalData as ChatRoom).id;
      if (item.type === 'memo' && item.originalData) targetParams.memoId = (item.originalData as Memo).id;
      if (item.type === 'workflow' && item.originalData) targetParams.applicationId = (item.originalData as WorkflowApplication).id;
      if (item.type === 'event' && item.originalData) targetParams.eventId = (item.originalData as CalendarEvent).id;

      onNavigateToContent(targetParams);
    } else if (onSelectTab) {
      onSelectTab(item.tab);
    }
  };

  const handleMarkAllAsRead = () => {
    allNotifications.forEach((item) => {
      if (item.type === 'memo' && item.originalData) markMemoAsRead(currentUser?.id, item.originalData.id);
      if (item.type === 'workflow' && item.originalData) markWorkflowAsRead(currentUser?.id, item.originalData.id);
      if (item.type === 'board' && item.originalData) markTopicAsRead(currentUser?.id, item.originalData.id);
      if (item.type === 'chat' && item.originalData) markChatRoomAsRead(currentUser?.id, item.originalData.id);
      if (item.type === 'event' && item.originalData) markEventAsRead(currentUser?.id, item.originalData.id);
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
        return <Phone className="w-4 h-4 text-amber-600" />;
      case 'workflow':
        return <FileText className="w-4 h-4 text-blue-600" />;
      case 'board':
        return <Monitor className="w-4 h-4 text-indigo-600" />;
      case 'event':
        return <CalendarIcon className="w-4 h-4 text-emerald-600" />;
      case 'chat':
        return <MessageSquare className="w-4 h-4 text-violet-600" />;
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
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shrink-0 shadow-xs">
      <div className="w-full px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo area */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onToggleMobileMenu}
            className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full lg:hidden focus:outline-none"
            title="メニュー"
          >
            <Menu className="w-5 h-5" />
          </button>
          <div
            onClick={() => onSelectTab && onSelectTab('mypage')}
            className="flex items-center gap-2 cursor-pointer select-none hover:opacity-90 transition-opacity"
            title="マイページへ"
          >
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-xs">
              <span className="text-white font-bold text-lg leading-none">T</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-800 hidden sm:block">
              TERANAGO<span className="text-indigo-600">SNS</span>
            </span>
          </div>
        </div>

        {/* Search area */}
        <div className="flex-1 max-w-xl px-2 sm:px-12 relative" ref={searchContainerRef}>
          <div className="relative group">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              className="w-full bg-slate-100 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-full py-2 pl-10 pr-9 text-sm transition-all"
              placeholder="キーワードでナレッジ・社内データを横断検索..."
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
        <div className="flex items-center gap-3">
          {/* Notifications Bell */}
          <div className="relative" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setIsOpen(!isOpen)}
              className={`relative p-2.5 rounded-full transition-colors ${
                isOpen
                  ? 'bg-indigo-50 text-indigo-600 ring-2 ring-indigo-500/20'
                  : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
              }`}
              title="通知一覧"
            >
              <Bell className="w-5 h-5" />
              {unreadCount > 0 && (
                <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 text-[10px] font-bold text-white bg-red-500 rounded-full ring-2 ring-white shadow-xs">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>

            {/* Notification Popover Dropdown */}
            {isOpen && (
              <div className="absolute right-0 top-full mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-slate-200/90 z-50 overflow-hidden animate-in fade-in slide-in-from-top-2 duration-150 ring-1 ring-slate-900/5">
                {/* Header */}
                <div className="p-3.5 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-slate-800 text-sm">通知</span>
                    {unreadCount > 0 ? (
                      <span className="px-2 py-0.5 text-xs font-bold bg-indigo-100 text-indigo-700 rounded-full">
                        {unreadCount}件の未読
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 text-xs font-medium bg-slate-200/80 text-slate-600 rounded-full">
                        未読なし
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-1">
                    {unreadCount > 0 && (
                      <button
                        type="button"
                        onClick={handleMarkAllAsRead}
                        className="flex items-center gap-1 text-xs font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors"
                        title="すべて既読にする"
                      >
                        <CheckCheck className="w-3.5 h-3.5" />
                        すべて既読
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setIsOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors ml-1"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Categories Filter Bar */}
                <div className="flex items-center gap-1 p-2 bg-white border-b border-slate-100 overflow-x-auto text-xs no-scrollbar">
                  <button
                    type="button"
                    onClick={() => setFilterType('all')}
                    className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                      filterType === 'all'
                        ? 'bg-slate-800 text-white font-bold'
                        : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    すべて ({allNotifications.length})
                  </button>
                  {memoNotifications.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFilterType('memo')}
                      className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
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
                      className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
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
                      className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
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
                      className={`px-2.5 py-1 rounded-lg font-medium whitespace-nowrap transition-colors ${
                        filterType === 'event'
                          ? 'bg-emerald-600 text-white font-bold'
                          : 'text-slate-600 hover:bg-emerald-50'
                      }`}
                    >
                      予定 ({eventNotifications.length})
                    </button>
                  )}
                </div>

                {/* Items List */}
                <div className="max-h-[380px] overflow-y-auto divide-y divide-slate-100">
                  {filteredNotifications.length > 0 ? (
                    filteredNotifications.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => handleNotificationClick(item)}
                        className="p-3.5 hover:bg-indigo-50/50 cursor-pointer transition-colors flex items-start gap-3 group relative"
                      >
                        <div
                          className={`p-2 rounded-xl shrink-0 border ${getItemBg(
                            item.type
                          )} flex items-center justify-center mt-0.5`}
                        >
                          {getItemIcon(item.type)}
                        </div>
                        <div className="flex-1 min-w-0 pr-2">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <h4 className="text-xs sm:text-sm font-bold text-slate-800 line-clamp-1 group-hover:text-indigo-600 transition-colors">
                              {item.title}
                            </h4>
                            <span className="text-[10px] text-slate-400 whitespace-nowrap shrink-0">
                              {formatRelativeTime(item.createdAt)}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 line-clamp-2 leading-relaxed">
                            {item.description}
                          </p>
                        </div>
                        <div className="shrink-0 self-center text-slate-300 group-hover:text-indigo-500 transition-colors">
                          <ChevronRight className="w-4 h-4" />
                        </div>
                      </div>
                    ))
                  ) : (
                    <div className="p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                      <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center text-slate-300 mb-1">
                        <Bell className="w-6 h-6" />
                      </div>
                      <p className="text-sm font-semibold text-slate-600">未読の通知はありません</p>
                      <p className="text-xs text-slate-400">すべての通知を確認済みです</p>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="p-2.5 bg-slate-50 border-t border-slate-100 flex flex-col gap-1.5 text-center">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      if (onSelectTab) onSelectTab('mypage');
                    }}
                    className="w-full py-1.5 px-3 text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors border border-transparent hover:border-slate-200"
                  >
                    マイページですべての通知とタスクを確認 →
                  </button>
                  {onOpenSettings && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsOpen(false);
                        onOpenSettings();
                      }}
                      className="w-full py-1 px-3 text-[11px] font-medium text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-md transition-colors flex items-center justify-center gap-1.5"
                    >
                      <Smartphone className="w-3.5 h-3.5" />
                      <span>スマホのプッシュ通知設定を開く</span>
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
            <button
              type="button"
              onClick={() => {
                if (onOpenSettings) {
                  onOpenSettings();
                } else if (onSelectTab) {
                  onSelectTab('mypage');
                }
              }}
              className="flex items-center gap-2.5 group text-left focus:outline-none rounded-xl p-1 hover:bg-slate-100/80 transition-colors cursor-pointer"
              title="個人設定を開く"
            >
              <div className="text-right hidden sm:block">
                <div className="text-sm font-semibold text-slate-800 group-hover:text-indigo-600 transition-colors flex items-center justify-end gap-1">
                  <span>{currentUser.name}</span>
                  {currentUser.isAdmin && (
                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded font-bold">
                      管理者
                    </span>
                  )}
                </div>
                <div className="text-xs text-slate-500">{currentUser.department}</div>
              </div>
              <img
                src={getAvatarUrl(currentUser.avatarUrl)}
                alt={currentUser.name}
                className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 object-cover group-hover:border-indigo-500 group-hover:ring-2 group-hover:ring-indigo-500/20 transition-all"
              />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}

