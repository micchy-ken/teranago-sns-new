import React, { useState, useRef, useEffect, useMemo } from 'react';
import { User, CalendarEvent, BoardTopic, Memo, WorkflowApplication, ChatRoom, OfficeMaster, DivisionMaster, PositionMaster, DailyReport } from '../types';
import { AppTab } from './Sidebar';
import { getAvatarUrl, SILHOUETTE_SVG } from '../utils/avatar';
import { API_BASE_URL } from '../config/api';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import { getLocalDateStr } from '../utils/dateUtils';
import { expandRecurringEvents } from '../utils/recurrenceUtils';
import {
  getPushNotificationStatus,
  subscribeToPushNotifications,
  unsubscribeFromPushNotifications,
  sendTestPushNotification,
  runPushDiagnostics,
  PushStatus,
  PushDiagnosticReport,
} from '../utils/pushNotifications';
import {
  getReadEventIds,
  markEventAsRead as markEventAsReadUtil,
  getReadTopicIds,
  markTopicAsRead as markTopicAsReadUtil,
  getReadChatTimestamps,
  markChatRoomAsRead as markChatRoomAsReadUtil,
  getReadMemoIds,
  markMemoAsRead as markMemoAsReadUtil,
  markMemoAsUnread as markMemoAsUnreadUtil,
  getReadWorkflowIds,
  markWorkflowAsRead as markWorkflowAsReadUtil,
  getReadReportIds,
  markReportAsRead as markReportAsReadUtil,
  isEventUnread,
  isTopicUnread,
  isMemoUnhandled,
  isMemoUnread,
  isWorkflowPending,
  isChatUnread,
  isReportUnread,
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
  LogOut,
  Plus,
  Bell,
  BellRing,
  BellOff,
  Smartphone,
  Send,
  Loader2,
  Info,
  Wrench,
  AlertTriangle,
  GripVertical,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  SlidersHorizontal
} from 'lucide-react';
import { TopicDetailModal } from './TopicDetailModal';
import { EventModal } from './EventModal';
import { GlobalEventDetailModal } from './GlobalEventDetailModal';
import { TopicCreateModal } from './TopicCreateModal';
import { ApplicationModal } from './ApplicationModal';
import { MemoCreateModal } from './MemoCreateModal';
import { MyPageSectionCard } from './MyPageSectionCard';
import { ApprovalFlowRule, ItemMaster, ApplicationStatus } from '../types';

interface MyPageProps {
  user: User;
  events: CalendarEvent[];
  topics: BoardTopic[];
  memos: Memo[];
  applications: WorkflowApplication[];
  chatRooms?: ChatRoom[];
  reports?: DailyReport[];
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
    reportId?: string;
  }) => void;
  onUpdateUser?: (updatedUser: User) => void;
  onUpdateMemo?: (updatedMemos: Memo[]) => void;
  onUpdateTopic?: (updatedTopic: BoardTopic) => void;
  onUpdateApplication?: (updatedApp: WorkflowApplication) => void;
  onAddEvent?: (eventData: Omit<CalendarEvent, 'id'>) => Promise<void> | void;
  onUpdateEvent?: (event: CalendarEvent) => Promise<void> | void;
  onDeleteEvent?: (eventId: string) => Promise<void> | void;
  onAddTopic?: (topicData: Omit<BoardTopic, 'id' | 'createdAt' | 'views' | 'commentsCount'>) => Promise<void> | void;
  onAddApplication?: (application: Omit<WorkflowApplication, 'id' | 'createdAt' | 'status'> & { status?: ApplicationStatus }) => Promise<void> | void;
  approvalFlows?: ApprovalFlowRule[];
  itemMasters?: ItemMaster[];
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
  reports = [],
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
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  onAddTopic,
  onAddApplication,
  approvalFlows = [],
  itemMasters = [],
  onLogout,
  autoOpenSettings,
  onCloseSettings,
}: MyPageProps) {
  // ローカル既読状態管理
  const [readEventIds, setReadEventIds] = useState<string[]>(() => getReadEventIds(user?.id));
  const [readTopicIds, setReadTopicIds] = useState<string[]>(() => getReadTopicIds(user?.id));
  const [readChatTimestamps, setReadChatTimestamps] = useState<Record<string, string>>(() => getReadChatTimestamps(user?.id));
  const [readMemoIds, setReadMemoIds] = useState<string[]>(() => getReadMemoIds(user?.id));
  const [readReportIds, setReadReportIds] = useState<string[]>(() => getReadReportIds(user?.id));

  useEffect(() => {
    const handleSync = () => {
      setReadEventIds(getReadEventIds(user?.id));
      setReadTopicIds(getReadTopicIds(user?.id));
      setReadChatTimestamps(getReadChatTimestamps(user?.id));
      setReadMemoIds(getReadMemoIds(user?.id));
      setReadReportIds(getReadReportIds(user?.id));
    };
    handleSync();
    window.addEventListener('notifications_updated', handleSync);
    return () => window.removeEventListener('notifications_updated', handleSync);
  }, [user?.id]);

  // モーダル管理
  const [selectedTopic, setSelectedTopic] = useState<BoardTopic | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [isCopyMode, setIsCopyMode] = useState<boolean>(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isEventModalOpen, setIsEventModalOpen] = useState(false);
  const [isCreateTopicModalOpen, setIsCreateTopicModalOpen] = useState(false);
  const [isCreateApplicationOpen, setIsCreateApplicationOpen] = useState(false);
  const [isCreateMemoOpen, setIsCreateMemoOpen] = useState(false);

  // Web Push 通知状態管理
  const [pushStatus, setPushStatus] = useState<PushStatus | null>(null);
  const [pushLoading, setPushLoading] = useState(false);
  const [pushProgressStep, setPushProgressStep] = useState<string>('');
  const [pushMessage, setPushMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);
  const [diagModalOpen, setDiagModalOpen] = useState(false);
  const [diagReport, setDiagReport] = useState<PushDiagnosticReport | null>(null);
  const [diagLoading, setDiagLoading] = useState(false);

  const refreshPushStatus = async () => {
    if (user?.id) {
      const st = await getPushNotificationStatus(user.id);
      setPushStatus(st);
    }
  };

  useEffect(() => {
    refreshPushStatus();
  }, [user?.id]);

  // D&D並び替え状態管理
  const DEFAULT_SECTION_ORDER = ['events', 'topics', 'memos', 'workflow', 'chats', 'reports'];
  const savedOrder = user?.preferences?.mypageSectionOrder;
  const [sectionOrder, setSectionOrder] = useState<string[]>(() => {
    if (Array.isArray(savedOrder) && savedOrder.length > 0) {
      const valid = savedOrder.filter(id => DEFAULT_SECTION_ORDER.includes(id));
      const missing = DEFAULT_SECTION_ORDER.filter(id => !valid.includes(id));
      return [...valid, ...missing];
    }
    return DEFAULT_SECTION_ORDER;
  });

  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);

  useEffect(() => {
    if (Array.isArray(user?.preferences?.mypageSectionOrder) && user.preferences.mypageSectionOrder.length > 0) {
      const valid = user.preferences.mypageSectionOrder.filter(id => DEFAULT_SECTION_ORDER.includes(id));
      const missing = DEFAULT_SECTION_ORDER.filter(id => !valid.includes(id));
      setSectionOrder([...valid, ...missing]);
    }
  }, [user?.preferences?.mypageSectionOrder]);

  const handleSaveOrder = (newOrder: string[]) => {
    setSectionOrder(newOrder);
    if (onUpdateUser) {
      const updatedUser: User = {
        ...user,
        preferences: {
          ...(user.preferences || {}),
          mypageSectionOrder: newOrder,
        },
      };
      onUpdateUser(updatedUser);
    }
  };

  const moveSection = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sectionOrder.length) return;
    const newOrder = [...sectionOrder];
    const [movedItem] = newOrder.splice(index, 1);
    newOrder.splice(targetIndex, 0, movedItem);
    handleSaveOrder(newOrder);
  };

  const handleResetOrder = () => {
    handleSaveOrder(DEFAULT_SECTION_ORDER);
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex) return;
    const newOrder = [...sectionOrder];
    const [draggedItem] = newOrder.splice(draggedIndex, 1);
    newOrder.splice(dropIndex, 0, draggedItem);
    setDraggedIndex(null);
    handleSaveOrder(newOrder);
  };

  const handleRunDiagnostics = async () => {
    setDiagLoading(true);
    setDiagModalOpen(true);
    const report = await runPushDiagnostics();
    setDiagReport(report);
    setDiagLoading(false);
  };

  const handleEnablePush = async () => {
    if (!user?.id) return;
    setPushLoading(true);
    setPushProgressStep('📍 [1/5] 初期化中...');
    setPushMessage(null);

    const res = await subscribeToPushNotifications(user.id, (stepMsg) => {
      setPushProgressStep(stepMsg);
    });

    if (res.success) {
      setPushMessage({ type: 'success', text: res.message || 'スマートフォンへのプッシュ通知を有効にしました！' });
      await refreshPushStatus();
    } else {
      setPushMessage({ type: 'error', text: res.error || '通知の登録に失敗しました。' });
    }
    setPushLoading(false);
    setPushProgressStep('');
  };

  const handleDisablePush = async () => {
    if (!user?.id) return;
    setPushLoading(true);
    setPushMessage(null);
    const res = await unsubscribeFromPushNotifications(user.id);
    if (res.success) {
      setPushMessage({ type: 'info', text: '通知の購読を解除しました。' });
      await refreshPushStatus();
    } else {
      setPushMessage({ type: 'error', text: res.error || '通知の解除に失敗しました。' });
    }
    setPushLoading(false);
  };

  const handleTestPush = async () => {
    if (!user?.id) return;
    setPushLoading(true);
    setPushMessage(null);
    const res = await sendTestPushNotification(user.id);
    if (res.success) {
      setPushMessage({ type: 'success', text: res.message || 'テスト通知を送信しました！数秒で通知が届きます。' });
    } else {
      setPushMessage({ type: 'error', text: res.error || 'テスト通知の送信に失敗しました。' });
    }
    setPushLoading(false);
  };

  // 既存タグの収集
  const existingTags = React.useMemo(() => {
    const tagsSet = new Set<string>();
    topics.forEach(t => {
      if (t.tags) {
        t.tags.forEach(tag => tagsSet.add(tag));
      }
    });
    return Array.from(tagsSet);
  }, [topics]);

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
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });

  const handleOpenSettings = () => {
    setSettingsForm(user);
    setIsSettingsOpen(true);
  };

  const handleSaveSettings = (e: React.FormEvent) => {
    e.preventDefault();
    if (!settingsForm.office) {
      setConfirmModal({
        isOpen: true,
        title: '入力エラー',
        message: '所属拠点を選択してください。',
        type: 'warning',
        confirmText: '確認',
      });
      return;
    }
    if (!settingsForm.division) {
      setConfirmModal({
        isOpen: true,
        title: '入力エラー',
        message: '所属部署を選択してください。',
        type: 'warning',
        confirmText: '確認',
      });
      return;
    }
    if (onUpdateUser) {
      const deptString = [settingsForm.office, settingsForm.division, settingsForm.position].filter(Boolean).join(' ');
      onUpdateUser({
        ...settingsForm,
        department: deptString,
      });
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
          const currentlyUnhandled = isMemoUnhandled(m, user);
          const nowIso = new Date().toISOString();

          // キャッシュの同期
          if (currentlyUnhandled) {
            markMemoAsReadUtil(user.id, memoId);
          } else {
            markMemoAsUnreadUtil(user.id, memoId);
          }

          const statuses = m.recipientStatuses || [];
          const nextRecipientStatuses = statuses.length > 0
            ? statuses.map((st) => {
                if (st.userId === user.id) {
                  const nextHandled = currentlyUnhandled; // 未対応なら対応完了(true)、対応完了なら未対応(false)
                  return {
                    ...st,
                    isViewed: true,
                    viewedAt: st.viewedAt || nowIso,
                    isHandled: nextHandled,
                    handledAt: nextHandled ? nowIso : undefined,
                    handledByUserId: nextHandled ? user.id : undefined,
                    handledByUserName: nextHandled ? user.name : undefined,
                    status: nextHandled ? ('handled' as const) : ('read' as const),
                  };
                }
                return st;
              })
            : [
                {
                  userId: user.id,
                  userName: user.name || '',
                  avatarUrl: user.avatarUrl || '',
                  department: user.department || '',
                  office: user.office || '',
                  division: user.division || '',
                  isViewed: true,
                  viewedAt: nowIso,
                  isHandled: currentlyUnhandled,
                  handledAt: currentlyUnhandled ? nowIso : undefined,
                  handledByUserId: currentlyUnhandled ? user.id : undefined,
                  handledByUserName: currentlyUnhandled ? user.name : undefined,
                  status: currentlyUnhandled ? ('handled' as const) : ('read' as const),
                }
              ];

          // 全員が対応完了しているかチェック
          const allHandled = nextRecipientStatuses.length > 0 && nextRecipientStatuses.every((s) => s.isHandled);
          const nextOverallStatus = allHandled ? ('handled' as const) : ('read' as const);

          return {
            ...m,
            status: nextOverallStatus,
            recipientStatuses: nextRecipientStatuses,
          };
        }
        return m;
      });
      onUpdateMemo(updated);
    }
  };

  // 1. 直近スケジュール（自分が参加している本日以降1週間の予定）
  const todayStr = getLocalDateStr(new Date());
  const todayStart = new Date(todayStr + 'T00:00:00');
  const weekEnd = new Date(todayStart);
  weekEnd.setDate(weekEnd.getDate() + 7);
  weekEnd.setHours(23, 59, 59, 999);

  const expandedMyPageEvents = useMemo(() => {
    if (!events || !events.length) return [];
    return expandRecurringEvents(events, todayStart, weekEnd);
  }, [events, todayStart, weekEnd]);

  const myEvents = useMemo(() => {
    return expandedMyPageEvents
      .filter((e) => {
        const isAttendee = e.attendees ? e.attendees.some((a) => a?.id === user?.id || a?.name === user?.name) : false;
        if (!isAttendee) return false;

        const eventStart = new Date(e.start);
        const eventEnd = e.end ? new Date(e.end) : eventStart;

        return eventEnd >= todayStart && eventStart <= weekEnd;
      })
      .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime());
  }, [expandedMyPageEvents, user?.id, user?.name, todayStart, weekEnd]);

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

  const unhandledMemos = myMemos.filter((m) => isMemoUnhandled(m, user));
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

  // 6. 自分に関係する日報・週報（自分が作成者 または 上長）
  const myReports = useMemo(() => {
    return (reports || [])
      .filter((r) => {
        const authorId = r.author?.id || (r as any).authorId;
        const supervisorId = r.supervisorId || r.supervisor?.id || (r.author as any)?.supervisorId;
        return authorId === user?.id || supervisorId === user?.id;
      })
      .sort((a, b) => {
        const aTime = a.reviewedAt || a.submittedAt || a.createdAt || '';
        const bTime = b.reviewedAt || b.submittedAt || b.createdAt || '';
        return new Date(bTime || 0).getTime() - new Date(aTime || 0).getTime();
      });
  }, [reports, user?.id]);

  const unreadReports = useMemo(() => {
    return myReports.filter((r) => isReportUnread(r, user, readReportIds));
  }, [myReports, user, readReportIds]);

  // ワークフロー承認・却下アクションハンドラー
  const handleWorkflowAction = (appId: string, status: 'approved' | 'rejected') => {
    if (onUpdateApplication) {
      const target = applications.find((a) => a.id === appId);
      if (target) {
        onUpdateApplication({ ...target, status });
      }
    }
  };

  const renderSectionCard = (sectionId: string, index: number) => {
    const isFullWidth = false;
    const isDragging = draggedIndex === index;

    switch (sectionId) {
      case 'events':
        return (
          <MyPageSectionCard
            key="events"
            id="events"
            title="スケジュール"
            icon={CalendarIcon}
            iconBgColor="bg-amber-500 hover:bg-amber-600"
            badgeCount={unreadEvents.length}
            badgeLabel="未確認"
            badgeBgColor="bg-rose-500"
            onNavigate={() => onChangeTab('calendar')}
            actionButton={
              <button
                type="button"
                onClick={() => setIsEventModalOpen(true)}
                className="text-xs font-bold bg-amber-500 hover:bg-amber-600 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                予定追加
              </button>
            }
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="space-y-3">
              {myEvents.length > 0 ? (
                myEvents.map((evt) => {
                  const isUnread = isEventUnread(evt, user, readEventIds);
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
                  本日以降1週間の参加予定はありません
                </div>
              )}
            </div>
          </MyPageSectionCard>
        );

      case 'topics':
        return (
          <MyPageSectionCard
            key="topics"
            id="topics"
            title="掲示板"
            icon={Monitor}
            iconBgColor="bg-indigo-600 hover:bg-indigo-700"
            badgeCount={unreadTopics.length}
            badgeLabel="未読"
            badgeBgColor="bg-indigo-600"
            onNavigate={() => onChangeTab('board')}
            actionButton={
              <button
                type="button"
                onClick={() => setIsCreateTopicModalOpen(true)}
                className="text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                新規投稿
              </button>
            }
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="space-y-3">
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
          </MyPageSectionCard>
        );

      case 'memos':
        return (
          <MyPageSectionCard
            key="memos"
            id="memos"
            title="伝言メモ"
            icon={Phone}
            iconBgColor="bg-rose-500 hover:bg-rose-600"
            badgeCount={unhandledMemos.length}
            badgeLabel="未対応"
            badgeBgColor="bg-rose-500"
            onNavigate={() => onChangeTab('memo')}
            actionButton={
              <button
                type="button"
                onClick={() => setIsCreateMemoOpen(true)}
                className="text-xs font-bold bg-rose-500 hover:bg-rose-600 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                新規登録
              </button>
            }
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="space-y-3">
              {myMemos.length > 0 ? (
                myMemos.map((memo) => {
                  const isUnhandled = isMemoUnhandled(memo, user);
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
                        isUnhandled
                          ? 'bg-rose-50/40 border-rose-300 shadow-xs'
                          : 'bg-white border-slate-200 opacity-80'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          {isUnhandled ? (
                            <span className="px-2 py-0.5 bg-rose-500 text-white font-black text-[10px] rounded-full flex items-center gap-1">
                              <Clock className="w-3 h-3" /> 未対応
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold text-[10px] rounded-full flex items-center gap-1">
                              <Check className="w-3 h-3 text-emerald-600" /> 対応完了
                            </span>
                          )}
                          {isUnread && (
                            <span className="px-1.5 py-0.5 bg-amber-500 text-white font-black text-[9px] rounded-full">
                              未読
                            </span>
                          )}
                          <span className="text-xs font-bold text-slate-900">
                            {memo.fromName} 様 {memo.fromCompany && <span className="text-slate-500 font-normal">({memo.fromCompany})</span>}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleMemoStatus(memo.id);
                          }}
                          className={`relative z-10 cursor-pointer px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all border ${
                            isUnhandled
                              ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 hover:shadow-xs'
                              : 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                          }`}
                        >
                          {isUnhandled ? '対応完了にする' : '未対応に戻す'}
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
          </MyPageSectionCard>
        );

      case 'workflow':
        return (
          <MyPageSectionCard
            key="workflow"
            id="workflow"
            title="ワークフロー"
            icon={FileText}
            iconBgColor="bg-purple-600 hover:bg-purple-700"
            badgeCount={pendingApprovals.length}
            badgeLabel="要承認"
            badgeBgColor="bg-purple-600"
            onNavigate={() => onChangeTab('workflow')}
            actionButton={
              <button
                type="button"
                onClick={() => setIsCreateApplicationOpen(true)}
                className="text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                新規登録
              </button>
            }
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="space-y-3">
              {myApplications.length > 0 ? (
                myApplications.slice(0, 5).map((app) => {
                  const isMyApproval = (app.approver?.id === user?.id || app.approver?.name === user?.name) && app.status === 'pending';

                  return (
                    <div
                      key={app.id}
                      onClick={() => {
                        markWorkflowAsReadUtil(user?.id, app.id);
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
                              type="button"
                              onClick={() => handleWorkflowAction(app.id, 'approved')}
                              className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold rounded shadow-2xs flex items-center gap-0.5 cursor-pointer"
                            >
                              <CheckCircle2 className="w-3 h-3" /> 承認
                            </button>
                            <button
                              type="button"
                              onClick={() => handleWorkflowAction(app.id, 'rejected')}
                              className="px-2.5 py-1 bg-rose-600 hover:bg-rose-700 text-white text-[10px] font-bold rounded shadow-2xs flex items-center gap-0.5 cursor-pointer"
                            >
                              <XCircle className="w-3 h-3" /> 却下
                            </button>
                          </div>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 line-clamp-1">{app.description}</p>

                      <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1 border-t border-slate-100">
                        <span>申請者: {app.applicant?.name || '不明'}</span>
                        <span>承認者: {app.approver?.name || '未指定'}</span>
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
          </MyPageSectionCard>
        );

      case 'chats':
      default:
        return (
          <MyPageSectionCard
            key="chats"
            id="chats"
            title="チャットルーム"
            icon={MessageSquare}
            iconBgColor="bg-blue-600 hover:bg-blue-700"
            badgeCount={unreadChatRooms.length}
            badgeLabel="未読"
            badgeBgColor="bg-blue-600"
            onNavigate={() => onChangeTab('chat')}
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
              {myChatRooms.length > 0 ? (
                myChatRooms.slice(0, 8).map((room) => {
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
          </MyPageSectionCard>
        );

      case 'reports':
        return (
          <MyPageSectionCard
            key="reports"
            id="reports"
            title="日報・週報"
            icon={FileText}
            iconBgColor="bg-teal-600 hover:bg-teal-700"
            badgeCount={unreadReports.length}
            badgeLabel="未確認"
            badgeBgColor="bg-teal-600"
            onNavigate={() => onChangeTab('daily_report')}
            actionButton={
              <button
                type="button"
                onClick={() => onChangeTab('daily_report')}
                className="text-xs font-bold bg-teal-600 hover:bg-teal-700 text-white px-2.5 py-1.5 rounded-lg flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                作成・確認
              </button>
            }
            isFullWidth={isFullWidth}
            isDragging={isDragging}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDrop={(e) => handleDrop(e, index)}
          >
            <div className="grid gap-3 grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 2xl:grid-cols-2">
              {myReports.length > 0 ? (
                myReports.slice(0, 8).map((report) => {
                  const isUnread = isReportUnread(report, user, readReportIds);
                  const isAuthor = (report.author?.id || (report as any).authorId) === user?.id;
                  const isWeekly = report.reportType === 'weekly';
                  const isMaintenance = report.reportType === 'maintenance_daily';
                  const isSales = report.reportType === 'sales_daily';
                  const isConstruction = report.reportType === 'construction_daily';
                  const typeLabel = isMaintenance 
                    ? '保守日報' 
                    : (isSales 
                      ? '営業日報' 
                      : (isConstruction 
                        ? '工務日報' 
                        : (isWeekly ? '週報' : '日報')));
                  const title = report.weekLabel || (isWeekly ? `週報 (${report.weekStartDate || ''}~)` : `${typeLabel} (${report.date || ''})`);
                  const dateStr = report.date || report.weekStartDate || (report.createdAt ? new Date(report.createdAt).toLocaleDateString('ja-JP') : '');

                  return (
                    <div
                      key={report.id}
                      onClick={() => {
                        markReportAsReadUtil(user?.id, report.id);
                        if (onNavigateToContent) {
                          onNavigateToContent({ tab: 'daily_report', reportId: report.id });
                        } else {
                          onChangeTab('daily_report');
                        }
                      }}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex flex-col gap-2 ${
                        isUnread
                          ? 'bg-teal-50/50 border-teal-300 shadow-xs hover:border-teal-400'
                          : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-md font-bold shrink-0 ${
                            isMaintenance ? 'bg-amber-100 text-amber-800' : (isWeekly ? 'bg-indigo-100 text-indigo-800' : 'bg-emerald-100 text-emerald-800')
                          }`}>
                            {typeLabel}
                          </span>
                          <span className="text-xs font-extrabold text-slate-900 line-clamp-1">
                            {title}
                          </span>
                        </div>
                        {isUnread && (
                          <span className="px-2 py-0.5 bg-teal-600 text-white text-[9px] font-black rounded-full shrink-0 animate-pulse">
                            NEW {isAuthor ? '要確認' : '未確認'}
                          </span>
                        )}
                      </div>

                      <div className="flex items-center justify-between text-xs text-slate-600">
                        <span className="font-medium">{report.author?.name || '作成者未設定'}</span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          report.status === 'reviewed' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {report.status === 'reviewed' ? '確認済' : '確認待ち'}
                        </span>
                      </div>

                      {report.feedbackComment && (
                        <p className="text-xs text-slate-600 line-clamp-1 bg-slate-50 p-1.5 rounded border border-slate-100">
                          <span className="font-bold text-slate-700">上長コメント: </span>
                          {report.feedbackComment}
                        </p>
                      )}

                      <div className="text-[10px] text-slate-400 text-right">
                        {dateStr}
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="p-8 text-center text-slate-400 text-xs col-span-full">
                  関連する日報・週報はありません
                </div>
              )}
            </div>
          </MyPageSectionCard>
        );
    }
  };

  return (
    <div className="flex-1 overflow-y-auto bg-slate-50/50 rounded-xl border border-slate-200 h-[calc(100vh-8rem)] p-3 sm:p-6 space-y-4 sm:space-y-6">


      {/* 6つの未読通知サマリーカード（クリックで各機能ページへ直接遷移） */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5 sm:gap-3.5">
        {/* スケジュール */}
        <div
          onClick={() => onChangeTab?.('calendar')}
          className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-amber-400 group ${
            unreadEvents.length > 0
              ? 'bg-amber-50/70 border-amber-300 text-amber-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title="スケジュール画面へ移動"
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onChangeTab?.('calendar');
            }}
            className="p-1.5 sm:p-2 bg-amber-100 group-hover:bg-amber-200 text-amber-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            title="スケジュール画面を開く"
          >
            <CalendarIcon className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-amber-800 transition-colors truncate">スケジュール</div>
            <div className="mt-0.5 sm:mt-1">
              {unreadEvents.length > 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 bg-rose-500 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full animate-pulse shadow-2xs">
                  未確認 {unreadEvents.length}
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full">
                  確認済
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 掲示板 */}
        <div
          onClick={() => onChangeTab?.('board')}
          className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-indigo-400 group ${
            unreadTopics.length > 0
              ? 'bg-indigo-50/70 border-indigo-300 text-indigo-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title="掲示板画面へ移動"
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onChangeTab?.('board');
            }}
            className="p-1.5 sm:p-2 bg-indigo-100 group-hover:bg-indigo-200 text-indigo-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            title="掲示板画面を開く"
          >
            <Monitor className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-indigo-800 transition-colors truncate">掲示板</div>
            <div className="mt-0.5 sm:mt-1">
              {unreadTopics.length > 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 bg-indigo-600 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full shadow-2xs">
                  未読 {unreadTopics.length}
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full">
                  既読
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 伝言メモ */}
        <div
          onClick={() => onChangeTab?.('memo')}
          className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-rose-400 group ${
            unhandledMemos.length > 0
              ? 'bg-rose-50/70 border-rose-300 text-rose-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title="伝言メモ画面へ移動"
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onChangeTab?.('memo');
            }}
            className="p-1.5 sm:p-2 bg-rose-100 group-hover:bg-rose-200 text-rose-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            title="伝言メモ画面を開く"
          >
            <Phone className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-rose-800 transition-colors truncate">伝言メモ</div>
            <div className="mt-0.5 sm:mt-1">
              {unhandledMemos.length > 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 bg-rose-600 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full shadow-2xs">
                  未対応 {unhandledMemos.length}
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full">
                  対応済
                </span>
              )}
            </div>
          </div>
        </div>

        {/* ワークフロー */}
        <div
          onClick={() => onChangeTab?.('workflow')}
          className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-purple-400 group ${
            pendingApprovals.length > 0
              ? 'bg-purple-50/70 border-purple-300 text-purple-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title="ワークフロー画面へ移動"
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onChangeTab?.('workflow');
            }}
            className="p-1.5 sm:p-2 bg-purple-100 group-hover:bg-purple-200 text-purple-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            title="ワークフロー画面を開く"
          >
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-purple-800 transition-colors truncate">ワークフロー</div>
            <div className="mt-0.5 sm:mt-1">
              {pendingApprovals.length > 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 bg-purple-600 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full shadow-2xs">
                  要承認 {pendingApprovals.length}
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full">
                  処理済
                </span>
              )}
            </div>
          </div>
        </div>

        {/* チャット */}
        <div
          onClick={() => onChangeTab?.('chat')}
          className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-blue-400 group ${
            unreadChatRooms.length > 0
              ? 'bg-blue-50/70 border-blue-300 text-blue-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title="チャットルーム画面へ移動"
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onChangeTab?.('chat');
            }}
            className="p-1.5 sm:p-2 bg-blue-100 group-hover:bg-blue-200 text-blue-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            title="チャットルーム画面を開く"
          >
            <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-blue-800 transition-colors truncate">チャットルーム</div>
            <div className="mt-0.5 sm:mt-1">
              {unreadChatRooms.length > 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 bg-blue-600 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full shadow-2xs">
                  未読 {unreadChatRooms.length}
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full">
                  既読
                </span>
              )}
            </div>
          </div>
        </div>

        {/* 日報・週報 */}
        <div
          onClick={() => onChangeTab?.('daily_report')}
          className={`flex items-center gap-2 sm:gap-3 p-2.5 sm:p-3.5 rounded-xl border shadow-xs transition-all cursor-pointer hover:shadow-md hover:border-teal-400 group ${
            unreadReports.length > 0
              ? 'bg-teal-50/70 border-teal-300 text-teal-950'
              : 'bg-white border-slate-200 text-slate-800'
          }`}
          title="日報・週報画面へ移動"
        >
          <div
            onClick={(e) => {
              e.stopPropagation();
              onChangeTab?.('daily_report');
            }}
            className="p-1.5 sm:p-2 bg-teal-100 group-hover:bg-teal-200 text-teal-700 rounded-lg shrink-0 transition-transform group-hover:scale-105 active:scale-95 cursor-pointer shadow-2xs"
            title="日報・週報画面を開く"
          >
            <FileText className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-[11px] sm:text-xs font-bold text-slate-600 group-hover:text-teal-800 transition-colors truncate">日報・週報</div>
            <div className="mt-0.5 sm:mt-1">
              {unreadReports.length > 0 ? (
                <span className="inline-flex items-center px-2 py-0.5 bg-teal-600 text-white font-extrabold text-[10px] sm:text-[11px] rounded-full shadow-2xs">
                  未確認 {unreadReports.length}
                </span>
              ) : (
                <span className="inline-flex items-center px-2 py-0.5 bg-slate-100 text-slate-500 font-bold text-[10px] sm:text-[11px] rounded-full">
                  確認済
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* メインセクション（D&Dで順序変更可能） */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1 text-xs text-slate-500">
          <div className="flex items-center gap-1.5 font-bold text-slate-700">
            <SlidersHorizontal className="w-4 h-4 text-indigo-600" />
            <span>マイページ画面配置（D&Dで並び替え可能）</span>
          </div>
          <button
            type="button"
            onClick={handleResetOrder}
            className="flex items-center gap-1 px-2.5 py-1 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer text-xs font-semibold border border-slate-200 bg-white shadow-2xs"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>並び順リセット</span>
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {sectionOrder.map((sectionId, index) => renderSectionCard(sectionId, index))}
        </div>
      </div>

      {/* スケジュール詳細モーダル */}
      {selectedEvent && (
        <GlobalEventDetailModal
          isOpen={!!selectedEvent}
          event={selectedEvent}
          onClose={() => setSelectedEvent(null)}
          onEdit={(evt) => {
            setSelectedEvent(null);
            setEditingEvent(evt);
            setIsCopyMode(false);
            setIsEventModalOpen(true);
          }}
          onCopyAndAdd={(evt) => {
            setSelectedEvent(null);
            setEditingEvent(evt);
            setIsCopyMode(true);
            setIsEventModalOpen(true);
          }}
          onDelete={(evt) => {
            if (onDeleteEvent) {
              onDeleteEvent(evt.id);
            }
            setSelectedEvent(null);
          }}
          onEditInCalendar={(eventId) => {
            setSelectedEvent(null);
            if (onNavigateToContent) {
              onNavigateToContent({ tab: 'calendar', eventId });
            } else {
              onChangeTab('calendar');
            }
          }}
          currentUser={user}
        />
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

      {/* スケジュール新規作成・編集モーダル */}
      <EventModal
        isOpen={isEventModalOpen}
        onClose={() => {
          setIsEventModalOpen(false);
          setEditingEvent(null);
          setIsCopyMode(false);
        }}
        onSave={async (eventData) => {
          if ('id' in eventData && eventData.id) {
            if (onUpdateEvent) {
              await onUpdateEvent(eventData as CalendarEvent);
            }
          } else if (onAddEvent) {
            await onAddEvent(eventData as Omit<CalendarEvent, 'id'>);
          }
          setIsEventModalOpen(false);
          setEditingEvent(null);
          setIsCopyMode(false);
        }}
        onDelete={onDeleteEvent}
        editingEvent={editingEvent}
        isCopyMode={isCopyMode}
        offices={offices}
        divisions={divisions}
        allUsers={allUsers}
        currentUser={user}
      />

      {/* 掲示板新規作成モーダル */}
      <TopicCreateModal
        isOpen={isCreateTopicModalOpen}
        onClose={() => setIsCreateTopicModalOpen(false)}
        onSubmit={async (topicData) => {
          if (onAddTopic) {
            await onAddTopic(topicData);
          }
          setIsCreateTopicModalOpen(false);
        }}
        currentUser={user}
        offices={offices}
        divisions={divisions}
        existingTags={existingTags}
      />

      {/* ワークフロー新規申請モーダル */}
      <ApplicationModal
        isOpen={isCreateApplicationOpen}
        onClose={() => setIsCreateApplicationOpen(false)}
        onSave={async (appData) => {
          if (onAddApplication) {
            await onAddApplication(appData);
          }
          setIsCreateApplicationOpen(false);
        }}
        allUsers={allUsers}
        currentUser={user}
        approvalFlows={approvalFlows}
        itemMasters={itemMasters}
      />

      {/* 伝言メモ新規登録モーダル */}
      <MemoCreateModal
        isOpen={isCreateMemoOpen}
        onClose={() => setIsCreateMemoOpen(false)}
        currentUser={user}
        users={allUsers}
        offices={offices}
        divisions={divisions}
        memos={memos}
        onUpdateMemos={onUpdateMemo}
      />

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
                      value={settingsForm.office || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, office: e.target.value })}
                      className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">-- 選択してください --</option>
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
                      value={settingsForm.division || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, division: e.target.value })}
                      className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
                    >
                      <option value="">-- 選択してください --</option>
                      {divisions.map((div) => (
                        <option key={div.id} value={div.name}>
                          {div.name}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      役職 <span className="text-slate-400 font-normal text-[10px]">（任意 / 未設定時は空欄）</span>
                    </label>
                    <select
                      value={settingsForm.position || ''}
                      onChange={(e) => setSettingsForm({ ...settingsForm, position: e.target.value })}
                      className="w-full px-2.5 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                    >
                      <option value="">（役職なし / 空欄）</option>
                      {positions.filter(pos => pos.name !== '一般').map((pos) => (
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
                      <h4 className="text-xs font-bold text-amber-900">iCal形式 外部連携URL（個人専用カレンダー）</h4>
                      <p className="text-[11px] text-amber-700 leading-relaxed mt-0.5">
                        GoogleカレンダーやiPhone・Outlook等にこのURLを登録すると、<strong>ご自身が参加者・担当者として含まれる予定のみ</strong>が自動同期されます（代理投稿した別メンバーの作業等は除外されます）。
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
                      value={`${API_BASE_URL}/ical/user_${user.id}_calendar.ics`}
                      className="flex-1 px-3 py-1.5 bg-white border border-amber-300 rounded-lg text-[11px] font-mono text-slate-700 select-all focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(`${API_BASE_URL}/ical/user_${user.id}_calendar.ics`);
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

              {/* スマートフォン・ブラウザ Web Push プッシュ通知設定 */}
              <div className="space-y-3 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5 pb-1 border-b border-slate-100">
                    <Smartphone className="w-4 h-4 text-indigo-500" />
                    Web Push プッシュ通知設定（スマホ・PCリアルタイム通知）
                  </h3>
                  <button
                    type="button"
                    onClick={refreshPushStatus}
                    className="text-[11px] text-slate-500 hover:text-indigo-600 flex items-center gap-1 transition-colors"
                  >
                    <RefreshCw className={`w-3 h-3 ${pushLoading ? 'animate-spin' : ''}`} />
                    状態更新
                  </button>
                </div>

                {pushMessage && (
                  <div className={`p-3 rounded-lg text-xs font-medium flex items-center gap-2 ${
                    pushMessage.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
                    pushMessage.type === 'error' ? 'bg-rose-50 text-rose-800 border border-rose-200' :
                    'bg-sky-50 text-sky-800 border border-sky-200'
                  }`}>
                    {pushMessage.type === 'success' ? <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" /> :
                     pushMessage.type === 'error' ? <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" /> :
                     <Info className="w-4 h-4 text-sky-600 shrink-0" />}
                    <span>{pushMessage.text}</span>
                  </div>
                )}

                {pushLoading && pushProgressStep && (
                  <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-900 flex items-center gap-2.5 shadow-sm animate-pulse">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                    <span>{pushProgressStep}</span>
                  </div>
                )}

                {pushStatus?.inIframe && (
                  <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-xs text-amber-900 space-y-1">
                    <div className="font-bold flex items-center gap-1.5 text-amber-800">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      【注意】現在プレビュー画面（iFrame枠内）で動作しています
                    </div>
                    <p className="text-[11px] text-amber-800 leading-relaxed">
                      iFrame内ではブラウザセキュリティ制限により「通知許可ポップアップ」が出ない場合があります。画面右上の <strong>「新しいタブで開く」</strong> アイコンを押して別タブでアクセスしてから「通知を有効にする」を試してください。
                    </p>
                  </div>
                )}

                <div className="p-4 bg-indigo-50/40 rounded-xl border border-indigo-100 space-y-3.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <h4 className="text-xs font-bold text-slate-900">この端末でのリアルタイム通知</h4>
                        {pushStatus?.isSubscribed ? (
                          <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded-full flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                            受信有効
                          </span>
                        ) : pushStatus?.permission === 'denied' ? (
                          <span className="px-2 py-0.5 bg-rose-100 text-rose-800 text-[10px] font-bold rounded-full">
                            通知拒否
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 bg-slate-200 text-slate-700 text-[10px] font-bold rounded-full">
                            未登録
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-600 leading-relaxed">
                        電話メモ、チャットメッセージ、承認依頼などが届いた際、アプリを開いていなくてもスマートフォンのロック画面やPCに即座に通知されます。
                      </p>
                      {pushStatus && (pushStatus.subscriptionCount ?? 0) > 0 && (
                        <p className="text-[10px] text-indigo-700 font-medium">
                          📲 あなたのアカウントで現在 <strong>{pushStatus.subscriptionCount}台</strong> の端末が通知受信登録されています。
                        </p>
                      )}
                    </div>
                  </div>

                  {/* iOS PWA案内 */}
                  <div className="p-2.5 bg-white rounded-lg border border-indigo-100/80 text-[11px] text-slate-600 space-y-1">
                    <div className="font-bold text-slate-800 flex items-center gap-1 text-[11px]">
                      <Info className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      iPhone / iPad をご利用の場合の注意
                    </div>
                    <p className="text-[10.5px] leading-relaxed text-slate-600">
                      iOS 16.4以降のSafariでSafari下部の共有ボタン <span className="inline-block px-1 py-0.5 bg-slate-100 border border-slate-200 rounded font-mono text-[9px]">共有 [↑]</span> → <strong>「ホーム画面に追加」</strong> を行い、ホーム画面のアイコンから起動した状態で下記の「通知を有効にする」を押してください。
                    </p>
                  </div>

                  {/* アクションボタン群 */}
                  <div className="flex flex-wrap items-center gap-2 pt-1">
                    {pushStatus?.isSubscribed ? (
                      <>
                        <button
                          type="button"
                          disabled={pushLoading}
                          onClick={handleTestPush}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          {pushLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Send className="w-3.5 h-3.5" />}
                          テスト通知を送信
                        </button>
                        <button
                          type="button"
                          disabled={pushLoading}
                          onClick={handleDisablePush}
                          className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-600 border border-slate-200 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        >
                          <BellOff className="w-3.5 h-3.5 text-slate-400" />
                          この端末の通知を解除
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        disabled={pushLoading}
                        onClick={handleEnablePush}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-lg transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      >
                        {pushLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <BellRing className="w-4 h-4" />}
                        この端末でプッシュ通知を有効にする
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={pushLoading || diagLoading}
                      onClick={handleRunDiagnostics}
                      className="px-3 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-xs font-medium rounded-lg transition-all flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
                    >
                      {diagLoading ? <Loader2 className="w-3.5 h-3.5 animate-spin text-slate-500" /> : <Wrench className="w-3.5 h-3.5 text-slate-500" />}
                      端末通知環境を診断
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
      {/* 端末通知環境診断モーダル */}
      {diagModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl border border-slate-100 space-y-4 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">端末通知環境の自己診断レポート</h3>
              </div>
              <button
                type="button"
                onClick={() => setDiagModalOpen(false)}
                className="p-1 hover:bg-slate-100 rounded-lg text-slate-400 hover:text-slate-600 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {diagLoading ? (
              <div className="py-12 text-center space-y-3">
                <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto" />
                <p className="text-xs text-slate-500 font-medium">ブラウザ環境・Service Worker・サーバー通信をチェック中...</p>
              </div>
            ) : diagReport ? (
              <div className="space-y-4 text-xs">
                <div className="grid grid-cols-2 gap-2">
                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-medium">通信プロトコル (HTTPS)</span>
                    <span className={`font-bold flex items-center gap-1 mt-0.5 ${diagReport.isHttps ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {diagReport.isHttps ? '✅ 正常 (HTTPS / Localhost)' : '❌ 非安全 (HTTP)'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-medium">表示ウィンドウ環境</span>
                    <span className={`font-bold flex items-center gap-1 mt-0.5 ${diagReport.isTopWindow ? 'text-emerald-600' : 'text-amber-600'}`}>
                      {diagReport.isTopWindow ? '✅ トップレベル画面' : '⚠️ iFrame内（注意）'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-medium">Push / Notification API</span>
                    <span className={`font-bold flex items-center gap-1 mt-0.5 ${diagReport.hasNotification && diagReport.hasPushManager ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {diagReport.hasNotification && diagReport.hasPushManager ? '✅ サポート対応' : '❌ 非対応ブラウザ'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-medium">通知パーミッション</span>
                    <span className={`font-bold flex items-center gap-1 mt-0.5 ${
                      diagReport.permission === 'granted' ? 'text-emerald-600' :
                      diagReport.permission === 'denied' ? 'text-rose-600' : 'text-slate-600'
                    }`}>
                      {diagReport.permission === 'granted' ? '✅ 許可済み (granted)' :
                       diagReport.permission === 'denied' ? '❌ 拒否済み (denied)' : '⚪️ 未設定 (default)'}
                    </span>
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-medium">Service Worker (/sw.js)</span>
                    <span className={`font-bold flex items-center gap-1 mt-0.5 ${diagReport.swActive ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {diagReport.swActive ? '✅ 稼働可能' : '❌ 起動不能/エラー'}
                    </span>
                    {diagReport.swErrorDetails && (
                      <span className="text-[9px] text-rose-500 block truncate mt-0.5 font-mono" title={diagReport.swErrorDetails}>
                        {diagReport.swErrorDetails}
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200/80">
                    <span className="text-[10px] text-slate-400 block font-medium">VAPID公開鍵API</span>
                    <span className={`font-bold flex items-center gap-1 mt-0.5 ${diagReport.vapidApiOk ? 'text-emerald-600' : 'text-rose-600'}`}>
                      {diagReport.vapidApiOk ? '✅ 応答正常' : '❌ 通信失敗'}
                    </span>
                  </div>
                </div>

                {diagReport.recommendations.length > 0 ? (
                  <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-xl space-y-2">
                    <h4 className="font-bold text-amber-900 text-xs flex items-center gap-1.5">
                      <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                      検出された問題と改善の解決手順
                    </h4>
                    <ul className="space-y-1.5 pl-1 text-[11px] text-amber-800 leading-relaxed list-disc list-inside">
                      {diagReport.recommendations.map((rec, i) => (
                        <li key={i}>{rec}</li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                    お使いの端末・ブラウザ環境は正常にプッシュ通知をサポートしています！
                  </div>
                )}

                <div className="pt-2 flex justify-end">
                  <button
                    type="button"
                    onClick={() => setDiagModalOpen(false)}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-xs transition-colors cursor-pointer"
                  >
                    閉じる
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
