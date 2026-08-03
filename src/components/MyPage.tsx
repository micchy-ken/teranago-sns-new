import React, { useState, useRef, useEffect } from 'react';
import { User, CalendarEvent, BoardTopic, Memo, WorkflowApplication, ChatRoom, OfficeMaster, DivisionMaster, PositionMaster } from '../types';
import { AppTab } from './Sidebar';
import { getAvatarUrl, SILHOUETTE_SVG } from '../utils/avatar';
import { API_BASE_URL } from '../config/api';
import {
  getReadEventIds,
  markEventAsRead as markEventAsReadUtil,
  getReadTopicIds,
  markTopicAsRead as markTopicAsReadUtil,
  getReadChatTimestamps,
  markChatRoomAsRead as markChatRoomAsReadUtil,
  getReadMemoIds,
  markMemoAsRead as markMemoAsReadUtil,
  isEventUnread,
  isTopicUnread,
  isMemoUnread,
  isWorkflowPending,
  isChatUnread,
} from '../utils/notifications';
import { 
  User as UserIcon, 
  Calendar as CalendarIcon, 
  Monitor, 
  Phone, 
  FileText, 
  Check, 
  Clock, 
  ChevronRight, 
  AlertCircle, 
  Building2, 
  Briefcase, 
  MapPin, 
  Users, 
  ExternalLink, 
  X, 
  MessageSquare,
  CheckCircle2,
  XCircle,
  ShieldAlert,
  ArrowUpRight,
  Settings,
  Copy,
  RefreshCw,
  Edit2,
  Camera,
  Upload,
  Trash2,
  LogOut
} from 'lucide-react';
import { TopicDetailModal } from './TopicDetailModal';

interface MyPageProps {
  user: User;
  events: CalendarEvent[];
  topics: BoardTopic[];
  memos: Memo[];
  applications: WorkflowApplication[];
  chatRooms?: ChatRoom[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  positions?: PositionMaster[];
  allUsers?: User[];
  onChangeTab: (tab: AppTab) => void;
  onNavigateToContent?: (target: {
    tab: AppTab;
    topicId?: string;
    chatRoomId?: string;
    memoId?: string;
    applicationId?: string;
    eventId?: string;
  }) => void;
  onUpdateUser?: (updatedUser: User) => void;
  onUpdateMemo?: (updatedMemos: Memo[]) => void;
  onUpdateTopic?: (updatedTopic: BoardTopic) => void;
  onUpdateApplication?: (updatedApp: WorkflowApplication) => void;
  onLogout?: () => void;
  autoOpenSettings?: boolean;
  onCloseSettings?: () => void;
}

export function MyPage({
  user,
  events,
  topics,
  memos,
  applications,
  chatRooms = [],
  offices = [],
  divisions = [],
  positions = [],
  allUsers = [],
  onChangeTab,
  onNavigateToContent,
  onUpdateUser,
  onUpdateMemo,
  onUpdateTopic,
  onUpdateApplication,
  onLogout,
  autoOpenSettings,
  onCloseSettings,
}: MyPageProps) {
  // ローカル既読状態管理
  const [readEventIds, setReadEventIds] = useState<string[]>(() => getReadEventIds(user?.id));
  const [readTopicIds, setReadTopicIds] = useState<string[]>(() => getReadTopicIds(user?.id));
  const [readChatTimestamps, setReadChatTimestamps] = useState<Record<string, string>>(() => getReadChatTimestamps(user?.id));
  const [readMemoIds, setReadMemoIds] = useState<string[]>(() => getReadMemoIds(user?.id));

  useEffect(() => {
    const handleSync = () => {
      setReadEventIds(getReadEventIds(user?.id));
      setReadTopicIds(getReadTopicIds(user?.id));
      setReadChatTimestamps(getReadChatTimestamps(user?.id));
      setReadMemoIds(getReadMemoIds(user?.id));
    };
    handleSync();
    window.addEventListener('notifications_updated', handleSync);
    return () => window.removeEventListener('notifications_updated', handleSync);
  }, [user?.id]);

  // モーダル管理
  const [selectedTopic, setSelectedTopic] = useState<BoardTopic | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);

  useEffect(() => {
    if (autoOpenSettings) {
      setSettingsForm(user);
      setIsSettingsOpen(true);
    }
  }, [autoOpenSettings, user]);

  const handleCloseSettings = () => {
    setIsSettingsOpen(false);
    if (onCloseSettings) {
      onCloseSettings();
    }
  };

  // アバターアップロード状態
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [avatarError, setAvatarError] = useState<string | null>(null);

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      setAvatarError('画像サイズは2MB以下にしてください。');
      return;
    }

    setAvatarUploading(true);
    setAvatarError(null);

    const formData = new FormData();
    formData.append('avatar', file);

    try {
      const response = await fetch(`${API_BASE_URL}/upload-avatar`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const data = await response.json();
        if (data.avatarUrl) {
          setSettingsForm(prev => ({ ...prev, avatarUrl: data.avatarUrl }));
        }
      } else {
        const errData = await response.json().catch(() => ({}));
        setAvatarError(errData.error || 'アップロードに失敗しました。');
      }
    } catch (error: any) {
      setAvatarError('通信エラー: ' + error.message);
    } finally {
      setAvatarUploading(false);
    }
  };

  const handleRemoveAvatar = () => {
    setSettingsForm(prev => ({ ...prev, avatarUrl: '' }));
    setAvatarError(null);
  };

  // 設定フォーム状態
  const [settingsForm, setSettingsForm] = useState<User>(user);
  const [copiedICal, setCopiedICal] = useState(false);

  const handleOpenSettings = () => {
    setSettingsForm(user);
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (onUpdateUser) {
      onUpdateUser(settingsForm);
    }
    handleCloseSettings();
  };

  // イベント既読化
  const markEventAsRead = (eventId: string) => {
    markEventAsReadUtil(user.id, eventId);
  };

  // メモの対応ステータストグル
  const handleToggleMemoStatus = (memoId: string) => {
    if (onUpdateMemo) {
      const updated = memos.map((m) => {
        if (m.id === memoId) {
          const currentlyUnread = isMemoUnread(m, user);
          const nextStatus = currentlyUnread ? ('read' as const) : ('unread' as const);

          const newRecipientStatuses =
            m.recipientStatuses && m.recipientStatuses.length > 0
              ? m.recipientStatuses.map((st) =>
                  st.userId === user.id
                    ? { ...st, isViewed: currentlyUnread, viewedAt: new Date().toISOString() }
                    : st
                )
              : [
                  {
                    userId: user.id,
                    userName: user.name || '',
                    isViewed: currentlyUnread,
                    viewedAt: new Date().toISOString(),
                    isHandled: !currentlyUnread,
                    status: nextStatus,
                  },
                ];

          return {
            ...m,
            status: nextStatus,
            recipientStatuses: newRecipientStatuses,
          };
        }
        return m;
      });
      onUpdateMemo(updated);
    }
  };

  // 1. 直近スケジュール（自分が参加 または 全社・自拠点宛て）
  const myEvents = events
    .filter((e) => {
      const isAttendee = e.attendees ? e.attendees.some((a) => a?.id === user?.id || a?.name === user?.name) : false;
      const isTargetOffice = e.office === '全社' || e.office === user?.office;
      return isAttendee || isTargetOffice;
    })
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());

  const unreadEvents = myEvents.filter((e) => isEventUnread(e, user, readEventIds));

  // 2. 対象の掲示板トピック（全社・自拠点・自部署宛て）
  const myTopics = topics
    .filter((t) => {
      const matchOffice = !t.office || t.office === '全社' || t.office === user?.office;
      const matchDivision = !t.division || t.division === '全部署' || t.division === user?.division;
      return matchOffice && matchDivision;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const unreadTopics = myTopics.filter((t) => isTopicUnread(t, user, readTopicIds));

  // 3. 自分宛ての伝言メモ
  const myMemos = memos
    .filter((m) => {
      if (m.recipientStatuses && m.recipientStatuses.length > 0) {
        return m.recipientStatuses.some((st) => st.userId === user?.id);
      }
      if (m.toUsers && m.toUsers.length > 0) {
        return m.toUsers.some((u) => u?.id === user?.id || u?.name === user?.name);
      }
      if (m.toUser) {
        return m.toUser.id === user?.id || m.toUser.name === user?.name || (m.toUser.loginId && m.toUser.loginId === user?.loginId);
      }
      return true;
    })
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const unreadMemos = myMemos.filter((m) => isMemoUnread(m, user, readMemoIds));

  // 4. 自分に関係するワークフロー（自分が申請者 または 承認者）
  const myApplications = applications
    .filter(
      (a) =>
        a.applicant?.id === user?.id ||
        a.applicant?.name === user?.name ||
        a.approver?.id === user?.id ||
        a.approver?.name === user?.name
    )
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  const pendingApprovals = myApplications.filter((a) => isWorkflowPending(a, user));

  // 5. 参加しているチャットルーム
  const myChatRooms = (chatRooms || [])
    .filter((room) => room.participants?.some((p) => p?.id === user?.id || p?.name === user?.name))
    .sort((a, b) => {
      const aTime = a.messages && a.messages.length > 0 ? a.messages[a.messages.length - 1].createdAt || a.lastUpdated : a.lastUpdated;
      const bTime = b.messages && b.messages.length > 0 ? b.messages[b.messages.length - 1].createdAt || b.lastUpdated : b.lastUpdated;
      return new Date(bTime || 0).getTime() - new Date(aTime || 0).getTime();
    });

  const unreadChatRooms = myChatRooms.filter((room) => isChatUnread(room, user, readChatTimestamps));

  // ワークフロー承認・却下アクションハンドラー
  const handleWorkflowAction = (appId: string, status: 'approved' | 'rejected') => {
    if (onUpdateApplication) {
      const target = applications.find((a) => a.id === appId);
      if (target) {
        onUpdateApplication({ ...target, status });
      }
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 rounded-xl border border-slate-200 h-[calc(100vh-8rem)] p-4 sm:p-6 space-y-6">
      {/* 5つの未読通知サマリーカード */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* スケジュール */}
        <div
          onClick={() => {
            const el = document.getElementById('my-events-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className={`p-4 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md ${
            unreadEvents.length > 0
              ? 'bg-amber-50/60 border-amber-200 text-amber-900'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-lg">
              <CalendarIcon className="w-5 h-5" />
            </div>
            {unreadEvents.length > 0 ? (
              <span className="px-2 py-0.5 bg-rose-500 text-white font-extrabold text-[10px] rounded-full animate-pulse shadow-2xs">
                未確認 {unreadEvents.length}
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] rounded-full">
                確認済
              </span>
            )}
          </div>
          <div className="text-xs font-bold text-slate-500">参加スケジュール</div>
          <div className="text-lg font-black text-slate-900 mt-0.5">{myEvents.length} 件</div>
        </div>

        {/* 掲示板 */}
        <div
          onClick={() => {
            const el = document.getElementById('my-topics-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className={`p-4 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md ${
            unreadTopics.length > 0
              ? 'bg-indigo-50/60 border-indigo-200 text-indigo-900'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-indigo-100 text-indigo-700 rounded-lg">
              <Monitor className="w-5 h-5" />
            </div>
            {unreadTopics.length > 0 ? (
              <span className="px-2 py-0.5 bg-indigo-600 text-white font-extrabold text-[10px] rounded-full shadow-2xs">
                未読 {unreadTopics.length}
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] rounded-full">
                既読
              </span>
            )}
          </div>
          <div className="text-xs font-bold text-slate-500">対象掲示板</div>
          <div className="text-lg font-black text-slate-900 mt-0.5">{myTopics.length} 件</div>
        </div>

        {/* 伝言メモ */}
        <div
          onClick={() => {
            const el = document.getElementById('my-memos-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className={`p-4 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md ${
            unreadMemos.length > 0
              ? 'bg-rose-50/60 border-rose-200 text-rose-900'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-rose-100 text-rose-700 rounded-lg">
              <Phone className="w-5 h-5" />
            </div>
            {unreadMemos.length > 0 ? (
              <span className="px-2 py-0.5 bg-rose-600 text-white font-extrabold text-[10px] rounded-full shadow-2xs">
                未対応 {unreadMemos.length}
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] rounded-full">
                対応済
              </span>
            )}
          </div>
          <div className="text-xs font-bold text-slate-500">自分宛て伝言メモ</div>
          <div className="text-lg font-black text-slate-900 mt-0.5">{myMemos.length} 件</div>
        </div>

        {/* ワークフロー */}
        <div
          onClick={() => {
            const el = document.getElementById('my-workflow-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className={`p-4 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md ${
            pendingApprovals.length > 0
              ? 'bg-purple-50/60 border-purple-200 text-purple-900'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-purple-100 text-purple-700 rounded-lg">
              <FileText className="w-5 h-5" />
            </div>
            {pendingApprovals.length > 0 ? (
              <span className="px-2 py-0.5 bg-purple-600 text-white font-extrabold text-[10px] rounded-full shadow-2xs">
                要承認 {pendingApprovals.length}
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] rounded-full">
                処理済
              </span>
            )}
          </div>
          <div className="text-xs font-bold text-slate-500">ワークフロー</div>
          <div className="text-lg font-black text-slate-900 mt-0.5">{myApplications.length} 件</div>
        </div>

        {/* チャット */}
        <div
          onClick={() => {
            const el = document.getElementById('my-chats-section');
            if (el) el.scrollIntoView({ behavior: 'smooth' });
          }}
          className={`p-4 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md ${
            unreadChatRooms.length > 0
              ? 'bg-blue-50/60 border-blue-200 text-blue-900'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
        >
          <div className="flex items-center justify-between mb-2">
            <div className="p-2 bg-blue-100 text-blue-700 rounded-lg">
              <MessageSquare className="w-5 h-5" />
            </div>
            {unreadChatRooms.length > 0 ? (
              <span className="px-2 py-0.5 bg-blue-600 text-white font-extrabold text-[10px] rounded-full shadow-2xs">
                未読 {unreadChatRooms.length}
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] rounded-full">
                既読
              </span>
            )}
          </div>
          <div className="text-xs font-bold text-slate-500">チャットルーム</div>
          <div className="text-lg font-black text-slate-900 mt-0.5">{myChatRooms.length} 件</div>
        </div>
      </div>

      {/* メイングリッド (2列レイアウト) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* 1. 自分が参加の直近スケジュール */}
        <section id="my-events-section" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-amber-500 text-white rounded-lg shadow-2xs">
                <CalendarIcon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-extrabold text-slate-900">参加スケジュール（直近）</h2>
              {unreadEvents.length > 0 && (
                <span className="px-2 py-0.5 bg-rose-500 text-white text-[10px] font-black rounded-full">
                  未確認 {unreadEvents.length}
                </span>
              )}
            </div>

            <button
              onClick={() => onChangeTab('calendar')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
            >
              カレンダーへ
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 flex-1 space-y-3">
            {myEvents.length > 0 ? (
              myEvents.slice(0, 5).map((evt) => {
                const isUnread = !readEventIds.includes(evt.id);
                const eventDate = new Date(evt.start);

                return (
                  <div
                    key={evt.id}
                    onClick={() => {
                      if (onNavigateToContent) {
                        onNavigateToContent({ tab: 'calendar', eventId: evt.id });
                      } else {
                        setSelectedEvent(evt);
                      }
                      markEventAsRead(evt.id);
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start gap-3 relative ${
                      isUnread
                        ? 'bg-amber-50/40 border-amber-300 hover:border-amber-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                    }`}
                  >
                    {isUnread && (
                      <span className="absolute top-3 right-3 px-2 py-0.5 bg-rose-500 text-white text-[9px] font-black rounded-full shadow-2xs">
                        NEW 未確認
                      </span>
                    )}

                    <div className="bg-slate-100 text-slate-800 p-2.5 rounded-xl text-center min-w-[56px] shrink-0 border border-slate-200">
                      <div className="text-[10px] font-extrabold text-indigo-600 uppercase">
                        {eventDate.toLocaleDateString('ja-JP', { weekday: 'short' })}
                      </div>
                      <div className="text-base font-black leading-tight">
                        {eventDate.getDate()}
                      </div>
                    </div>

                    <div className="flex-1 min-w-0 pr-12">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                          evt.type === 'personal' ? 'bg-emerald-100 text-emerald-700' :
                          evt.type === 'construction' ? 'bg-amber-100 text-amber-700' :
                          evt.type === 'inspection' ? 'bg-indigo-100 text-indigo-700' :
                          evt.type === 'replacement' ? 'bg-cyan-100 text-cyan-700' :
                          evt.type === 'repair' ? 'bg-rose-100 text-rose-700' :
                          evt.type === 'visitor' ? 'bg-orange-100 text-orange-700' : 'bg-sky-100 text-sky-700'
                        }`}>
                          {
                            evt.type === 'personal' ? '個人' :
                            evt.type === 'construction' ? '工事' :
                            evt.type === 'inspection' ? '点検' :
                            evt.type === 'replacement' ? '取替' :
                            evt.type === 'repair' ? '修理' :
                            evt.type === 'visitor' ? '来客' : '出張'
                          }
                        </span>
                        <span className="text-xs font-mono text-slate-500">
                          {eventDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 truncate">{evt.title}</h3>

                      {evt.location && (
                        <p className="text-xs text-slate-500 flex items-center gap-1 mt-1 truncate">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          {evt.location}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                直近の参加予定はありません
              </div>
            )}
          </div>
        </section>

        {/* 2. 自分が対象になっている掲示板 */}
        <section id="my-topics-section" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-2xs">
                <Monitor className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-extrabold text-slate-900">対象掲示板（直近）</h2>
              {unreadTopics.length > 0 && (
                <span className="px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-black rounded-full">
                  未読 {unreadTopics.length}
                </span>
              )}
            </div>

            <button
              onClick={() => onChangeTab('board')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
            >
              掲示板一覧へ
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 flex-1 space-y-3">
            {myTopics.length > 0 ? (
              myTopics.slice(0, 5).map((topic) => {
                const unread = isTopicUnread(topic, user, readTopicIds);

                return (
                  <div
                    key={topic.id}
                    onClick={() => {
                      markTopicAsReadUtil(user?.id, topic.id);
                      if (onNavigateToContent) {
                        onNavigateToContent({ tab: 'board', topicId: topic.id });
                      } else {
                        setSelectedTopic(topic);
                      }
                      // トピック既読化処理
                      if (onUpdateTopic && unread) {
                        const newViewers = [...(topic.viewers || []), { user, viewedAt: new Date().toISOString() }];
                        onUpdateTopic({ ...topic, viewers: newViewers });
                      }
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-start justify-between gap-3 relative ${
                      unread
                        ? 'bg-indigo-50/40 border-indigo-300 hover:border-indigo-400 shadow-xs'
                        : 'bg-white border-slate-200 hover:border-indigo-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        {unread ? (
                          <span className="px-2 py-0.5 bg-rose-500 text-white font-black text-[9px] rounded-full">
                            未読
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[9px] rounded-full">
                            既読
                          </span>
                        )}

                        <span className="text-[10px] font-bold bg-indigo-100 text-indigo-800 px-2 py-0.5 rounded">
                          {topic.office || '全社'} / {topic.division || '全部署'}
                        </span>

                        <span className="text-[10px] text-slate-400">
                          {new Date(topic.createdAt).toLocaleDateString('ja-JP')}
                        </span>
                      </div>

                      <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{topic.title}</h3>
                      <p className="text-xs text-slate-500 line-clamp-1 mt-0.5">{topic.content}</p>
                    </div>

                    <div className="flex items-center gap-1 text-slate-400 text-xs shrink-0 pt-1">
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>{topic.commentsCount || 0}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                対象の掲示板はありません
              </div>
            )}
          </div>
        </section>

        {/* 3. 自分に対する伝言メモ */}
        <section id="my-memos-section" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-rose-500 text-white rounded-lg shadow-2xs">
                <Phone className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-extrabold text-slate-900">自分宛ての伝言メモ</h2>
              {unreadMemos.length > 0 && (
                <span className="px-2 py-0.5 bg-rose-500 text-white text-[10px] font-black rounded-full">
                  未対応 {unreadMemos.length}
                </span>
              )}
            </div>

            <button
              onClick={() => onChangeTab('memo')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
            >
              伝言メモ一覧へ
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 flex-1 space-y-3">
            {myMemos.length > 0 ? (
              myMemos.map((memo) => {
                const isUnread = isMemoUnread(memo, user, readMemoIds);

                return (
                  <div
                    key={memo.id}
                    onClick={() => {
                      markMemoAsReadUtil(user?.id, memo.id);
                      if (onNavigateToContent) {
                        onNavigateToContent({ tab: 'memo', memoId: memo.id });
                      }
                    }}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2 cursor-pointer hover:border-rose-400 ${
                      isUnread
                        ? 'bg-rose-50/40 border-rose-300 shadow-xs'
                        : 'bg-white border-slate-200 opacity-80'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        {isUnread ? (
                          <span className="px-2 py-0.5 bg-rose-500 text-white font-black text-[10px] rounded-full flex items-center gap-1">
                            <Clock className="w-3 h-3" /> 未対応
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold text-[10px] rounded-full flex items-center gap-1">
                            <Check className="w-3 h-3 text-emerald-600" /> 対応完了
                          </span>
                        )}
                        <span className="text-xs font-bold text-slate-900">
                          {memo.fromName} 様 {memo.fromCompany && <span className="text-slate-500 font-normal">({memo.fromCompany})</span>}
                        </span>
                      </div>

                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleMemoStatus(memo.id);
                        }}
                        className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors border ${
                          isUnread
                            ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                            : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                        }`}
                      >
                        {isUnread ? '確認済にする' : '未対応に戻す'}
                      </button>
                    </div>

                    <div className="bg-white/80 p-2.5 rounded-lg border border-slate-100 text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                      {memo.content}
                    </div>

                    <div className="text-[10px] text-slate-400 text-right">
                      {new Date(memo.createdAt).toLocaleString('ja-JP')}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                自分宛ての伝言メモはありません
              </div>
            )}
          </div>
        </section>

        {/* 4. ワークフロー（申請・承認） */}
        <section id="my-workflow-section" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col">
          <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-purple-600 text-white rounded-lg shadow-2xs">
                <FileText className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-extrabold text-slate-900">関係ワークフロー</h2>
              {pendingApprovals.length > 0 && (
                <span className="px-2 py-0.5 bg-purple-600 text-white text-[10px] font-black rounded-full">
                  要承認 {pendingApprovals.length}
                </span>
              )}
            </div>

            <button
              onClick={() => onChangeTab('workflow')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline"
            >
              ワークフロー一覧へ
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 flex-1 space-y-3">
            {myApplications.length > 0 ? (
              myApplications.slice(0, 5).map((app) => {
                const isMyApproval = (app.approver?.id === user?.id || app.approver?.name === user?.name) && app.status === 'pending';

                return (
                  <div
                    key={app.id}
                    onClick={() => {
                      if (onNavigateToContent) {
                        onNavigateToContent({ tab: 'workflow', applicationId: app.id });
                      } else {
                        onChangeTab('workflow');
                      }
                    }}
                    className={`p-3.5 rounded-xl border transition-all flex flex-col gap-2 cursor-pointer hover:border-purple-400 ${
                      isMyApproval
                        ? 'bg-purple-50/50 border-purple-300 shadow-xs'
                        : 'bg-white border-slate-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 flex-wrap">
                        {app.status === 'approved' && (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-extrabold rounded">
                            承認済
                          </span>
                        )}
                        {app.status === 'rejected' && (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-extrabold rounded">
                            却下
                          </span>
                        )}
                        {app.status === 'pending' && (
                          <span className="px-2 py-0.5 bg-amber-100 text-amber-800 text-[10px] font-extrabold rounded">
                            申請中
                          </span>
                        )}

                        <span className="text-xs font-extrabold text-slate-900">{app.title}</span>
                      </div>

                      {isMyApproval && (
                        <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                          <button
                            onClick={() => handleWorkflowAction(app.id, 'approved')}
                            className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded shadow-2xs flex items-center gap-0.5"
                          >
                            <CheckCircle2 className="w-3 h-3" /> 承認
                          </button>
                          <button
                            onClick={() => handleWorkflowAction(app.id, 'rejected')}
                            className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded shadow-2xs flex items-center gap-0.5"
                          >
                            <XCircle className="w-3 h-3" /> 却下
                          </button>
                        </div>
                      )}
                    </div>

                    <p className="text-xs text-slate-500 line-clamp-1">{app.description}</p>

                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                      <span>申請者: {app.applicant.name}</span>
                      <span>承認者: {app.approver.name}</span>
                      <span>{new Date(app.createdAt).toLocaleDateString('ja-JP')}</span>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs">
                関係するワークフローはありません
              </div>
            )}
          </div>
        </section>

        {/* 5. 参加チャットルーム */}
        <section id="my-chats-section" className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col lg:col-span-2">
          <div className="p-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="p-1.5 bg-blue-600 text-white rounded-lg shadow-2xs">
                <MessageSquare className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-extrabold text-slate-900">参加チャットルーム（新着・未読）</h2>
              {unreadChatRooms.length > 0 && (
                <span className="px-2 py-0.5 bg-blue-600 text-white text-[10px] font-black rounded-full">
                  未読 {unreadChatRooms.length}
                </span>
              )}
            </div>

            <button
              onClick={() => onChangeTab('chat')}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 hover:underline cursor-pointer"
            >
              チャット画面へ
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="p-4 flex-1 grid grid-cols-1 md:grid-cols-2 gap-3">
            {myChatRooms.length > 0 ? (
              myChatRooms.slice(0, 6).map((room) => {
                const isUnread = isChatUnread(room, user, readChatTimestamps);
                const lastMsg = room.messages && room.messages.length > 0 ? room.messages[room.messages.length - 1] : null;

                return (
                  <div
                    key={room.id}
                    onClick={() => {
                      markChatRoomAsReadUtil(user?.id, room.id);
                      if (onNavigateToContent) {
                        onNavigateToContent({ tab: 'chat', chatRoomId: room.id });
                      } else {
                        onChangeTab('chat');
                      }
                    }}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                      isUnread
                        ? 'bg-blue-50/50 border-blue-300 shadow-xs hover:border-blue-400'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-slate-900 line-clamp-1">
                        {room.name || (lastMsg ? lastMsg.sender?.name : 'チャットルーム')}
                      </span>
                      {isUnread && (
                        <span className="px-2 py-0.5 bg-blue-600 text-white text-[9px] font-black rounded-full shrink-0">
                          NEW 未読
                        </span>
                      )}
                    </div>

                    {lastMsg ? (
                      <p className="text-xs text-slate-600 line-clamp-2 bg-slate-50/80 p-2 rounded-lg border border-slate-100">
                        <span className="font-semibold text-slate-800">{lastMsg.sender?.name}: </span>
                        {lastMsg.content}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-400 italic">メッセージはありません</p>
                    )}

                    <div className="text-[10px] text-slate-400 text-right">
                      {lastMsg?.createdAt ? new Date(lastMsg.createdAt).toLocaleString('ja-JP') : ''}
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-8 text-center text-slate-400 text-xs col-span-full">
                参加しているチャットルームはありません
              </div>
            )}
          </div>
        </section>

      </div>

      {/* スケジュール詳細モーダル */}
      {selectedEvent && (
        <div
          onClick={() => setSelectedEvent(null)}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden p-6 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2.5 py-1 rounded-md border border-amber-200">
                スケジュール詳細
              </span>
              <button
                onClick={() => setSelectedEvent(null)}
                className="p-1 text-slate-400 hover:bg-slate-100 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div>
              <h3 className="text-lg font-bold text-slate-900">{selectedEvent.title}</h3>
              <p className="text-xs text-slate-500 mt-1">
                {new Date(selectedEvent.start).toLocaleString('ja-JP')}
              </p>
            </div>

            {selectedEvent.location && (
              <div className="text-xs text-slate-700 flex items-center gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                <MapPin className="w-4 h-4 text-indigo-500 shrink-0" />
                <span>場所: {selectedEvent.location}</span>
              </div>
            )}

            {selectedEvent.memo && (
              <div className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed whitespace-pre-wrap">
                {selectedEvent.memo}
              </div>
            )}

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setSelectedEvent(null)}
                className="px-4 py-2 bg-slate-800 text-white text-xs font-bold rounded-xl hover:bg-slate-900 transition-colors"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 掲示板トピック詳細モーダル */}
      {selectedTopic && (
        <TopicDetailModal
          isOpen={!!selectedTopic}
          topic={selectedTopic}
          currentUser={user}
          onClose={() => setSelectedTopic(null)}
          onUpdateTopic={(updated) => {
            setSelectedTopic(updated);
            if (onUpdateTopic) onUpdateTopic(updated);
          }}
        />
      )}

      {/* 個人設定・カレンダー連携モーダル */}
      {isSettingsOpen && (
        <div
          onClick={handleCloseSettings}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden my-8 max-h-[90vh] flex flex-col border border-slate-100"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Settings className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold">個人設定・カレンダー同期</h2>
              </div>
              <button
                onClick={handleCloseSettings}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSettings} className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* 基本情報設定 */}
              <div className="space-y-4">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-100">
                  <UserIcon className="w-4 h-4 text-indigo-600" />
                  基本プロフィール情報
                </h3>

                {/* 顔写真（アバター）アップロード */}
                <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200/80">
                  <div className="relative shrink-0">
                    <img
                      src={getAvatarUrl(settingsForm.avatarUrl)}
                      alt="アバタープレビュー"
                      className="w-20 h-20 rounded-full border border-slate-200 shadow-xs object-cover bg-slate-100"
                    />
                    {avatarUploading && (
                      <div className="absolute inset-0 bg-slate-900/60 rounded-full flex items-center justify-center">
                        <RefreshCw className="w-5 h-5 text-white animate-spin" />
                      </div>
                    )}
                  </div>
                  <div className="space-y-1.5 text-center sm:text-left flex-1">
                    <span className="block text-xs font-bold text-slate-700">マイ顔写真 (アバター)</span>
                    <span className="block text-[10px] text-slate-400">推奨サイズ: 正方形、2MB以下のJPG/PNG</span>
                    
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2 pt-1">
                      <input
                        type="file"
                        ref={fileInputRef}
                        onChange={handleAvatarChange}
                        accept="image/*"
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        disabled={avatarUploading}
                        className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs shrink-0 cursor-pointer"
                      >
                        <Upload className="w-3.5 h-3.5" />
                        写真をアップロード
                      </button>
                      
                      {settingsForm.avatarUrl && settingsForm.avatarUrl !== SILHOUETTE_SVG && !settingsForm.avatarUrl.includes('data:image/svg+xml') && (
                        <button
                          type="button"
                          onClick={handleRemoveAvatar}
                          disabled={avatarUploading}
                          className="px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          削除してシルエットに戻す
                        </button>
                      )}
                    </div>
                    {avatarError && (
                      <span className="block text-[10px] text-rose-500 font-semibold">{avatarError}</span>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">氏名</label>
                    <input
                      type="text"
                      required
                      value={settingsForm.name}
                      onChange={(e) => setSettingsForm({ ...settingsForm, name: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">フリガナ</label>
                    <input
                      type="text"
                      value={settingsForm.kanaName || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, kanaName: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">所属拠点</label>
                    <select
                      value={settingsForm.office}
                      onChange={(e) => setSettingsForm({ ...settingsForm, office: e.target.value })}
                      className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="名古屋">名古屋</option>
                      {offices.map((off) => (
                        <option key={off.id} value={off.name}>
                          {off.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">所属部署</label>
                    <select
                      value={settingsForm.division}
                      onChange={(e) => setSettingsForm({ ...settingsForm, division: e.target.value })}
                      className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                    >
                      <option value="総務">総務</option>
                      {divisions.map((div) => (
                        <option key={div.id} value={div.name}>
                          {div.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">役職</label>
                    <select
                      value={settingsForm.position || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, position: e.target.value })}
                      className="w-full px-2.5 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="課長補佐">課長補佐</option>
                      {positions.map((pos) => (
                        <option key={pos.id} value={pos.name}>
                          {pos.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">メールアドレス</label>
                    <input
                      type="email"
                      value={settingsForm.email || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, email: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">携帯メール</label>
                    <input
                      type="email"
                      value={settingsForm.mobileEmail || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, mobileEmail: e.target.value })}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">電話 (外線)</label>
                    <input
                      type="text"
                      value={settingsForm.phoneOutside || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, phoneOutside: e.target.value })}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">電話 (内線)</label>
                    <input
                      type="text"
                      value={settingsForm.phoneExtension || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, phoneExtension: e.target.value })}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">電話 (携帯)</label>
                    <input
                      type="text"
                      value={settingsForm.mobilePhone || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, mobilePhone: e.target.value })}
                      className="w-full px-2 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>

                {/* 上長設定 */}
                <div className="pt-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    上長（承認者）
                  </label>
                  <select
                    value={settingsForm.supervisorId || ''}
                    onChange={(e) => setSettingsForm({ ...settingsForm, supervisorId: e.target.value || undefined })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="">（未設定）</option>
                    {allUsers
                      .filter((u) => u.id !== user.id) // 自分自身以外を上長に設定可能
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.office || ''} / {u.division || ''} / {u.position || ''})
                        </option>
                      ))}
                  </select>
                </div>
              </div>

              {/* 外部カレンダー連携（iCal / Google Calendar） */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-100">
                  <CalendarIcon className="w-4 h-4 text-amber-500" />
                  外部カレンダー同期設定 (iCal / Google Calendar)
                </h3>

                <div className="p-3.5 bg-amber-50/60 rounded-xl border border-amber-200 space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-amber-900">iCal形式 外部連携URL</h4>
                      <p className="text-[11px] text-amber-700 leading-relaxed mt-0.5">
                        GoogleカレンダーやiPhone・Outlook等にこのURLを登録すると、社内スケジュールが自動同期されます。
                      </p>
                    </div>
                    <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded shrink-0">
                      同期有効
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      readOnly
                      value={`https://teranago.co.jp/api/ical/user_${user.id}_calendar.ics`}
                      className="flex-1 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-[11px] font-mono text-slate-700 select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`https://teranago.co.jp/api/ical/user_${user.id}_calendar.ics`);
                        setCopiedICal(true);
                        setTimeout(() => setCopiedICal(false), 2000);
                      }}
                      className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shrink-0 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5" />
                      {copiedICal ? 'コピー完了' : 'URLコピー'}
                    </button>
                  </div>
                </div>
              </div>



              {/* フッターアクション */}
              <div className="flex items-center justify-between gap-3 pt-4 border-t border-slate-100">
                {onLogout ? (
                  <button
                    type="button"
                    onClick={() => {
                      handleCloseSettings();
                      onLogout();
                    }}
                    className="px-3.5 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <LogOut className="w-4 h-4" />
                    <span>ログアウト</span>
                  </button>
                ) : <div />}

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={handleCloseSettings}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm cursor-pointer"
                  >
                    設定内容を保存
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
