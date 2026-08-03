import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Search, Bell, Menu, LogOut, Phone, FileText, Monitor, Calendar as CalendarIcon, MessageSquare, CheckCheck, ChevronRight, X } from 'lucide-react';
import { User, Memo, WorkflowApplication, BoardTopic, CalendarEvent, ChatRoom } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { AppTab } from './Sidebar';
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
  NotificationItem,
} from '../utils/notifications';

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
  onSelectTab?: (tab: AppTab) => void;
  onNavigateToContent?: (target: {
    tab: AppTab;
    topicId?: string;
    chatRoomId?: string;
    memoId?: string;
    applicationId?: string;
    eventId?: string;
  }) => void;
  onUpdateMemos?: (memos: Memo[]) => void;
  onUpdateTopic?: (topic: BoardTopic) => void;
  onUpdateEvent?: (event: CalendarEvent) => void;
  onUpdateRooms?: (rooms: ChatRoom[]) => void;
  onToggleMobileMenu?: () => void;
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
  onSelectTab,
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
  const popoverRef = useRef<HTMLDivElement>(null);

  // Sync read states when custom event fires or user changes
  useEffect(() => {
    const handleSync = () => {
      setReadEventIds(getReadEventIds(currentUser?.id));
      setReadTopicIds(getReadTopicIds(currentUser?.id));
      setReadChatTimestamps(getReadChatTimestamps(currentUser?.id));
      setReadMemoIds(getReadMemoIds(currentUser?.id));
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
    });
  }, [currentUser, memos, applications, topics, events, chatRooms, readEventIds, readTopicIds, readChatTimestamps, readMemoIds]);

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
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
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
        <div className="flex-1 max-w-xl px-2 sm:px-12">
          <div className="relative group">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              className="w-full bg-slate-100 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-full py-2 pl-10 pr-4 text-sm transition-all"
              placeholder="キーワードでナレッジを検索..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
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
                <div className="p-2.5 bg-slate-50 border-t border-slate-100 text-center">
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
                </div>
              </div>
            )}
          </div>

          <div className="flex items-center gap-3 pl-3 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <div className="text-sm font-semibold text-slate-800 flex items-center justify-end gap-1">
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
              className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 object-cover"
            />
            {onLogout && (
              <button
                onClick={onLogout}
                title="ログアウト"
                className="p-2 text-slate-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors flex items-center gap-1 text-xs font-semibold"
              >
                <LogOut className="w-4 h-4" />
                <span className="hidden md:inline">ログアウト</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}

