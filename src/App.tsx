import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from './config/api';
import { getAvatarUrl, sanitizeAvatarUrlForSave } from './utils/avatar';
import { Header } from './components/Header';
import { Sidebar, AppTab } from './components/Sidebar';
import { Timeline } from './components/Timeline';
import { Calendar } from './components/Calendar';
import { Workflow } from './components/Workflow';
import { Board } from './components/Board';
import { Chat } from './components/Chat';
import { MemoList } from './components/MemoList';
import { DailyReportView } from './components/DailyReport';
import { InspectionScheduler } from './components/InspectionScheduler';
import { MyPage } from './components/MyPage';
import { AdminPanel } from './components/AdminPanel';
import { LoginScreen } from './components/LoginScreen';
import FileManager from './components/FileManager';
import { Post, CalendarEvent, WorkflowApplication, User, OfficeMaster, DivisionMaster, PositionMaster, BoardTopic, ChatRoom, ApprovalFlowRule, ApprovalStepConfig, ItemMaster, ApplicationStatus, DailyReport, Memo } from './types';
import { 
  syncUserReadStatusesFromServer, 
  isMemoUnread, 
  isTopicUnread, 
  isWorkflowUnread, 
  isEventUnread, 
  isReportUnread, 
  isChatUnread, 
  markMemoAsRead, 
  markMemoAsUnread, 
  markEventAsRead, 
  markTopicAsRead, 
  markWorkflowAsRead, 
  markReportAsRead, 
  markChatRoomAsRead 
} from './utils/notifications';
import { triggerPushNotification } from './utils/pushNotifications';
import { deleteAttachmentFiles } from './utils/fileUpload';
import { TopicDetailModal } from './components/TopicDetailModal';
import { GlobalEventDetailModal } from './components/GlobalEventDetailModal';
import { GlobalMemoDetailModal } from './components/GlobalMemoDetailModal';
import { GlobalReportDetailModal } from './components/GlobalReportDetailModal';
import { filterStepsForApplicant, resolveApproverForStep, getSupervisorAtLevel } from './utils/workflowHelpers';
import { planRecurrenceSave, planRecurrenceDelete, safeParseRecurrence, safeParseExceptions, expandRecurringEvents } from './utils/recurrenceUtils';
import { RecurrenceActionScope } from './components/RecurrenceActionModal';
import { parseAppQueryParams, updateBrowserUrl, AppQueryParams } from './utils/urlParams';

// Helper to map and sanitize API user objects to match frontend types safely
const mapUserFromApi = (apiUser: any): User => {
  const isAdmin = apiUser.isAdmin === true || apiUser.role === 'admin';
  const office = apiUser.office || undefined;
  const division = apiUser.division || undefined;
  const position = (apiUser.position && apiUser.position !== '一般') ? apiUser.position : undefined;
  const deptFromParts = [office, division, position].filter(Boolean).join(' ');
  const department = (apiUser.department && typeof apiUser.department === 'string' && apiUser.department.trim() !== '') ? apiUser.department : (deptFromParts || '未設定');

  let preferences = apiUser.preferences;
  if (typeof preferences === 'string') {
    try {
      preferences = JSON.parse(preferences);
    } catch (_) {
      preferences = undefined;
    }
  }

  return {
    ...apiUser,
    id: String(apiUser.id),
    name: apiUser.name || '名前未設定',
    avatarUrl: getAvatarUrl(apiUser.avatarUrl),
    department,
    office,
    division,
    position,
    role: isAdmin ? 'admin' : 'user',
    isAdmin: isAdmin,
    preferences: preferences || apiUser.preferences,
  };
};

// Helper to map and sanitize API posts to match frontend types safely
const mapPostFromApi = (apiPost: any, allUsers: User[]): Post => {
  let authorUser: User | undefined = undefined;

  if (apiPost.author && typeof apiPost.author === 'object') {
    authorUser = apiPost.author;
  } else if (apiPost.authorId) {
    authorUser = allUsers.find(u => u.id === apiPost.authorId);
  }

  if (!authorUser) {
    authorUser = {
      id: apiPost.authorId || (apiPost.author && apiPost.author.id) || 'unknown',
      name: (apiPost.author && apiPost.author.name) || '匿名',
      department: (apiPost.author && apiPost.author.department) || '未設定',
      avatarUrl: '',
    };
  }

  return {
    id: String(apiPost.id),
    author: {
      ...authorUser,
      id: String(authorUser.id),
      avatarUrl: getAvatarUrl(authorUser.avatarUrl),
      department: authorUser.department || '未設定',
    },
    content: apiPost.content || '',
    tags: Array.isArray(apiPost.tags) ? apiPost.tags : [],
    createdAt: apiPost.createdAt || new Date().toISOString(),
    likes: typeof apiPost.likes === 'number' ? apiPost.likes : 0,
    isLiked: !!apiPost.isLiked,
    nasLink: apiPost.nasLink || undefined,
  };
};

import { AlertCircle, RefreshCw, X } from 'lucide-react';
import { ConfirmModal, ConfirmModalState } from './components/ConfirmModal';
import { InstallPwaPrompt } from './components/InstallPwaPrompt';

export default function App() {
  const [usersList, setUsersList] = useState<User[]>([]);
  const [fetchErrors, setFetchErrors] = useState<Record<string, string>>({});
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // チャット同期・エラー制御用Ref
  const chatConsecutiveErrorsRef = useRef<number>(0);
  const isChatRefetchingRef = useRef<boolean>(false);

  // URLクエリパラメータの初期解析（ディープリンク対応）
  const initialUrlParams = useRef<AppQueryParams>(parseAppQueryParams()).current;

  // カレンダー用パラメータ状態
  const [calendarParams, setCalendarParams] = useState<{
    office?: string;
    division?: string;
    mode?: 'personal' | 'team';
    view?: 'month' | 'week' | 'day' | 'list';
    date?: string;
    type?: string;
  }>(() => ({
    office: initialUrlParams.office,
    division: initialUrlParams.division,
    mode: initialUrlParams.mode,
    view: initialUrlParams.view,
    date: initialUrlParams.date,
    type: initialUrlParams.type,
  }));

  // コンテンツディープリンク用のターゲットID状態
  const [targetTopicId, setTargetTopicId] = useState<string | undefined>(initialUrlParams.topicId);
  const [targetChatRoomId, setTargetChatRoomId] = useState<string | undefined>(initialUrlParams.chatRoomId);
  const [targetMemoId, setTargetMemoId] = useState<string | undefined>(initialUrlParams.memoId);
  const [targetApplicationId, setTargetApplicationId] = useState<string | undefined>(initialUrlParams.applicationId);
  const [targetEventId, setTargetEventId] = useState<string | undefined>(initialUrlParams.eventId);
  const [targetReportId, setTargetReportId] = useState<string | undefined>(initialUrlParams.reportId);

  // グローバル詳細ポップアップ表示用の状態
  const [globalSelectedEvent, setGlobalSelectedEvent] = useState<CalendarEvent | null>(null);
  const [globalSelectedTopic, setGlobalSelectedTopic] = useState<BoardTopic | null>(null);
  const [globalSelectedMemo, setGlobalSelectedMemo] = useState<Memo | null>(null);
  const [globalSelectedReport, setGlobalSelectedReport] = useState<DailyReport | null>(null);
  const [autoOpenCreateMemo, setAutoOpenCreateMemo] = useState(false);

  const handleNavigateToContent = (target: {
    tab: AppTab;
    topicId?: string;
    chatRoomId?: string;
    memoId?: string;
    applicationId?: string;
    eventId?: string;
    reportId?: string;
    openCreateMemo?: boolean;
  }) => {
    // スケジュール（eventId）
    if (target.eventId) {
      const searchStart = new Date();
      searchStart.setMonth(searchStart.getMonth() - 6);
      const searchEnd = new Date();
      searchEnd.setMonth(searchEnd.getMonth() + 12);
      const expanded = expandRecurringEvents(events, searchStart, searchEnd);

      const found = expanded.find(e => e.id === target.eventId || e.recurrenceParentId === target.eventId);
      if (found) {
        if (userState?.id) {
          markEventAsRead(userState.id, found.id);
          if (found.recurrenceParentId) markEventAsRead(userState.id, found.recurrenceParentId);
        }
        setGlobalSelectedEvent(found);
        return; // 画面遷移せずにポップアップ
      }
    }
    // 掲示板（topicId）
    if (target.topicId) {
      const found = topics.find(t => t.id === target.topicId);
      if (found) {
        if (userState?.id) markTopicAsRead(userState.id, found.id);
        setGlobalSelectedTopic(found);
        return; // 画面遷移せずにポップアップ
      }
    }
    // 伝言メモ（memoId）
    if (target.memoId) {
      const found = memos.find(m => m.id === target.memoId);
      if (found) {
        if (userState?.id) markMemoAsRead(userState.id, found.id);
        setGlobalSelectedMemo(found);
        return; // 画面遷移せずにポップアップ
      }
    }
    // 日報・週報（reportId）
    if (target.reportId) {
      const found = reports.find(r => r.id === target.reportId || String(r.id) === String(target.reportId));
      if (found) {
        if (userState?.id) markReportAsRead(userState.id, found.id);
        setGlobalSelectedReport(found);
        return; // 画面遷移せずにポップアップ
      }
    }

    // チャット、ワークフローなど遷移して表示
    setActiveTab(target.tab);
    if (target.openCreateMemo) {
      setAutoOpenCreateMemo(true);
    }
    setTargetTopicId(target.topicId);
    setTargetChatRoomId(target.chatRoomId);
    setTargetMemoId(target.memoId);
    setTargetApplicationId(target.applicationId);
    setTargetEventId(target.eventId);
    setTargetReportId(target.reportId);

    updateBrowserUrl({
      tab: target.tab,
      topicId: target.topicId,
      chatRoomId: target.chatRoomId,
      memoId: target.memoId,
      applicationId: target.applicationId,
      eventId: target.eventId,
      reportId: target.reportId,
    });
  };

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return localStorage.getItem('is_logged_in') === 'true';
  });

  const [userState, setUserState] = useState<User>(() => {
    const savedUserId = localStorage.getItem('logged_in_user_id');
    if (savedUserId) {
      return { id: savedUserId, name: 'ユーザー情報取得中...', role: 'user', department: '', avatarUrl: '' };
    }
    return { id: 'u1', name: 'ユーザー', role: 'user', department: '', avatarUrl: '' };
  });

  useEffect(() => {
    if (userState?.id && isAuthenticated) {
      syncUserReadStatusesFromServer(userState.id);
    }
  }, [userState?.id, isAuthenticated]);

  const handleLogin = (user: User) => {
    setUserState(user);
    setIsAuthenticated(true);
    localStorage.setItem('is_logged_in', 'true');
    localStorage.setItem('logged_in_user_id', user.id);
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    localStorage.removeItem('is_logged_in');
    localStorage.removeItem('logged_in_user_id');
  };

  const [activeTab, setActiveTab] = useState<AppTab>(() => initialUrlParams.tab || 'mypage');

  // ブラウザの戻る/進む（popstate）対応
  useEffect(() => {
    const handlePopState = () => {
      const parsed = parseAppQueryParams();
      if (parsed.tab) {
        setActiveTab(parsed.tab);
      }
      if (parsed.office || parsed.division || parsed.mode || parsed.view || parsed.date || parsed.type) {
        setCalendarParams(prev => ({
          ...prev,
          office: parsed.office ?? prev.office,
          division: parsed.division ?? prev.division,
          mode: parsed.mode ?? prev.mode,
          view: parsed.view ?? prev.view,
          date: parsed.date ?? prev.date,
          type: parsed.type ?? prev.type,
        }));
      }
      if (parsed.applicationId !== undefined) setTargetApplicationId(parsed.applicationId);
      if (parsed.memoId !== undefined) setTargetMemoId(parsed.memoId);
      if (parsed.topicId !== undefined) setTargetTopicId(parsed.topicId);
      if (parsed.chatRoomId !== undefined) setTargetChatRoomId(parsed.chatRoomId);
      if (parsed.eventId !== undefined) setTargetEventId(parsed.eventId);
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('is_sidebar_collapsed') === 'true';
  });

  useEffect(() => {
    if (userState?.preferences?.isSidebarCollapsed !== undefined) {
      setIsSidebarCollapsed(!!userState.preferences.isSidebarCollapsed);
    }
  }, [userState?.id, userState?.preferences?.isSidebarCollapsed]);
  const [autoOpenSettings, setAutoOpenSettings] = useState(false);

  const handleOpenPersonalSettings = () => {
    setActiveTab('mypage');
    setAutoOpenSettings(true);
  };
  const [offices, setOffices] = useState<OfficeMaster[]>([]);
  const [divisions, setDivisions] = useState<DivisionMaster[]>([]);
  const [positions, setPositions] = useState<PositionMaster[]>([]);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlowRule[]>([]);
  const [itemMasters, setItemMasters] = useState<ItemMaster[]>([]);

  // Item Master Handlers
  const handleAddItemMaster = async (item: Omit<ItemMaster, 'id'>) => {
    const newItem: ItemMaster = {
      ...item,
      id: `itm_${Date.now()}`
    };
    setItemMasters(prev => [...prev, newItem]);
    try {
      await fetch(`${API_BASE_URL}/masters/item-masters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      await refetchMasters();
    } catch (e) { console.error('Failed to save item master:', e); }
  };

  const handleUpdateItemMaster = async (updatedItem: ItemMaster) => {
    setItemMasters(prev => prev.map(i => i.id === updatedItem.id ? updatedItem : i));
    try {
      await fetch(`${API_BASE_URL}/masters/item-masters/${updatedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedItem)
      });
      await refetchMasters();
    } catch (e) { console.error('Failed to update item master:', e); }
  };

  const handleDeleteItemMaster = async (id: string) => {
    setItemMasters(prev => prev.filter(i => i.id !== id));
    try {
      await fetch(`${API_BASE_URL}/masters/item-masters/${id}`, { method: 'DELETE' });
      await refetchMasters();
    } catch (e) { console.error('Failed to delete item master:', e); }
  };

  const refetchMasters = async () => {
    const parseError = async (res: Response, label: string) => {
      let msg = `${label}取得エラー (HTTP ${res.status})`;
      try {
        const clone = res.clone();
        const errData = await clone.json();
        if (errData && errData.error) {
          return `${msg}: ${errData.error}${errData.details ? ' (' + errData.details + ')' : ''}`;
        }
      } catch (_) {}
      try {
        const errText = await res.text();
        if (errText) {
          return `${msg}: ${errText.slice(0, 150)}`;
        }
      } catch (_) {}
      return msg;
    };

    try {
      const offRes = await fetch(`${API_BASE_URL}/masters/offices`);
      if (offRes.ok) {
        const data = await offRes.json();
        if (Array.isArray(data)) {
          setOffices(data);
          setFetchErrors(prev => { if (!prev.offices) return prev; const next = { ...prev }; delete next.offices; return next; });
        }
      } else {
        const errMsg = await parseError(offRes, '拠点マスタ');
        setFetchErrors(prev => ({ ...prev, offices: errMsg }));
      }
    } catch (e: any) { setFetchErrors(prev => ({ ...prev, offices: '拠点マスタ接続エラー: ' + e.message })); }

    try {
      const divRes = await fetch(`${API_BASE_URL}/masters/divisions`);
      if (divRes.ok) {
        const data = await divRes.json();
        if (Array.isArray(data)) {
          setDivisions(data);
          setFetchErrors(prev => { if (!prev.divisions) return prev; const next = { ...prev }; delete next.divisions; return next; });
        }
      } else {
        const errMsg = await parseError(divRes, '部署マスタ');
        setFetchErrors(prev => ({ ...prev, divisions: errMsg }));
      }
    } catch (e: any) { setFetchErrors(prev => ({ ...prev, divisions: '部署マスタ接続エラー: ' + e.message })); }

    try {
      const posRes = await fetch(`${API_BASE_URL}/masters/positions`);
      if (posRes.ok) {
        const data = await posRes.json();
        if (Array.isArray(data)) {
          setPositions(data.filter((p: any) => p && p.name !== '一般'));
          setFetchErrors(prev => { if (!prev.positions) return prev; const next = { ...prev }; delete next.positions; return next; });
        }
      } else {
        const errMsg = await parseError(posRes, '役職マスタ');
        setFetchErrors(prev => ({ ...prev, positions: errMsg }));
      }
    } catch (e: any) { setFetchErrors(prev => ({ ...prev, positions: '役職マスタ接続エラー: ' + e.message })); }

    try {
      const itemRes = await fetch(`${API_BASE_URL}/masters/item-masters`);
      if (itemRes.ok) {
        const data = await itemRes.json();
        if (Array.isArray(data)) {
          setItemMasters(data);
          setFetchErrors(prev => { if (!prev.items) return prev; const next = { ...prev }; delete next.items; return next; });
        }
      } else {
        const errMsg = await parseError(itemRes, '品目マスタ');
        setFetchErrors(prev => ({ ...prev, items: errMsg }));
      }
    } catch (e: any) { setFetchErrors(prev => ({ ...prev, items: '品目マスタ接続エラー: ' + e.message })); }

    try {
      const flowRes = await fetch(`${API_BASE_URL}/masters/approval-flows`);
      if (flowRes.ok) {
        const data = await flowRes.json();
        if (Array.isArray(data)) {
          setApprovalFlows(data);
          setFetchErrors(prev => { if (!prev.flows) return prev; const next = { ...prev }; delete next.flows; return next; });
        }
      } else {
        const errMsg = await parseError(flowRes, '承認フロー');
        setFetchErrors(prev => ({ ...prev, flows: errMsg }));
      }
    } catch (e: any) { setFetchErrors(prev => ({ ...prev, flows: '承認フロー接続エラー: ' + e.message })); }
  };
  
  const [posts, setPosts] = useState<Post[]>([]);
  const [isPostsLoading, setIsPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  const refetchPosts = async (currentUsers = usersList) => {
    setIsPostsLoading(true);
    setPostsError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/posts`, {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const mapped = data.map(p => mapPostFromApi(p, currentUsers));
        setPosts(mapped);
        setPostsError(null);
        setFetchErrors(prev => { if (!prev.posts) return prev; const next = { ...prev }; delete next.posts; return next; });
      } else {
        throw new Error('Received posts data is not an array');
      }
    } catch (err: any) {
      console.warn('Failed to load posts from API:', err);
      setPostsError(err?.message || 'Failed to sync with API. Check connectivity.');
      setFetchErrors(prev => ({ ...prev, posts: `タイムライン取得エラー: ${err?.message || '接続エラー'}` }));
    } finally {
      setIsPostsLoading(false);
    }
  };

  const refetchUsers = async () => {
    try {
      const response = await fetch(`${API_BASE_URL}/users`, {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const processedUsers = data.map((u: any) => mapUserFromApi(u));
        setUsersList(processedUsers);
        setFetchErrors(prev => { if (!prev.users) return prev; const next = { ...prev }; delete next.users; return next; });

        // Synchronize logged-in user with the latest data from the database
        const savedUserId = localStorage.getItem('logged_in_user_id');
        const targetId = savedUserId || userState?.id;
        if (targetId) {
          const found = processedUsers.find(u => u.id === String(targetId));
          if (found) {
            setUserState(found);
          }
        }
        return processedUsers;
      }
    } catch (err: any) {
      console.warn('Failed to load users from API:', err);
      setFetchErrors(prev => ({ ...prev, users: `ユーザー一覧取得エラー: ${err?.message || '接続エラー'}` }));
    }
    return usersList;
  };

  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [applications, setApplications] = useState<WorkflowApplication[]>([]);
  const [topics, setTopics] = useState<BoardTopic[]>([]);
  const [chatRooms, setChatRooms] = useState<ChatRoom[]>([]);
  const [memos, setMemos] = useState<Memo[]>([]);
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTag, setSelectedTag] = useState<string | null>(null);

  // 対象画面（タブ）を開いたタイミングで、その機能に関連する未読通知を自動既読化してベルマークのバッジ数を即座に更新
  useEffect(() => {
    if (!userState?.id || !isAuthenticated) return;

    if (activeTab === 'memo') {
      const unreadMemos = memos.filter((m) => isMemoUnread(m, userState));
      if (unreadMemos.length > 0) {
        unreadMemos.forEach((m) => markMemoAsRead(userState.id, m.id));
      }
    } else if (activeTab === 'board') {
      const unreadTopics = topics.filter((t) => isTopicUnread(t, userState));
      if (unreadTopics.length > 0) {
        unreadTopics.forEach((t) => markTopicAsRead(userState.id, t.id));
      }
    } else if (activeTab === 'workflow') {
      const unreadWorkflows = applications.filter((app) => isWorkflowUnread(app, userState));
      if (unreadWorkflows.length > 0) {
        unreadWorkflows.forEach((app) => markWorkflowAsRead(userState.id, app.id));
      }
    } else if (activeTab === 'calendar' || activeTab === 'inspection_scheduler') {
      const unreadEvents = events.filter((e) => isEventUnread(e, userState));
      if (unreadEvents.length > 0) {
        unreadEvents.forEach((e) => markEventAsRead(userState.id, e.id));
      }
    } else if (activeTab === 'daily_report') {
      const unreadReports = reports.filter((r) => isReportUnread(r, userState));
      if (unreadReports.length > 0) {
        unreadReports.forEach((r) => markReportAsRead(userState.id, r.id));
      }
    } else if (activeTab === 'chat') {
      const unreadRooms = chatRooms.filter((r) => isChatUnread(r, userState));
      if (unreadRooms.length > 0) {
        unreadRooms.forEach((r) => markChatRoomAsRead(userState.id, r.id));
      }
    }
  }, [activeTab, userState, isAuthenticated, memos, topics, applications, events, reports, chatRooms]);

  const refetchEvents = async (currentUsers = usersList) => {
    try {
      const response = await fetch(`${API_BASE_URL}/events`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const activeUsers = currentUsers;
        const mapped = data.map((e: any) => {
          let detailsObj: any = {};
          if (e.description && typeof e.description === 'string' && e.description.startsWith('{')) {
            try { detailsObj = JSON.parse(e.description); } catch (_) {}
          }
          
          let rawAttendees = e.attendees || detailsObj.attendees || [];
          if (typeof rawAttendees === 'string') {
            try { rawAttendees = JSON.parse(rawAttendees); } catch (_) {}
          }
          
          const mappedAttendees = Array.isArray(rawAttendees)
            ? rawAttendees.map((att: any) => {
                if (typeof att === 'object' && att !== null && att.id) return att;
                const found = activeUsers.find(u => u.id === att || u.id === String(att));
                return found || { id: String(att), name: String(att), avatarUrl: '', office: '', division: '', department: '', role: 'user' };
              })
            : [];

          const parsedRecurrence = safeParseRecurrence(e.recurrence || detailsObj.recurrence);
          const parsedExceptions = safeParseExceptions(e.recurrenceExceptions || detailsObj.recurrenceExceptions);

          const rawCreatedBy = e.createdBy || detailsObj.createdBy || e.created_by || detailsObj.created_by || detailsObj.createdByUser || detailsObj.author || (e as any).user;
          let mappedCreatedBy: any = undefined;
          if (rawCreatedBy) {
            if (typeof rawCreatedBy === 'object' && rawCreatedBy !== null && rawCreatedBy.id) {
              mappedCreatedBy = rawCreatedBy;
            } else {
              const found = activeUsers.find(u => u.id === rawCreatedBy || u.id === String(rawCreatedBy) || u.name === rawCreatedBy || u.loginId === rawCreatedBy);
              mappedCreatedBy = found || { id: String(rawCreatedBy), name: String(rawCreatedBy), avatarUrl: '', office: '', division: '', department: '', role: 'user' };
            }
          } else if (e.userId || detailsObj.userId || e.authorId || detailsObj.authorId || (e as any).createdById || detailsObj.createdById) {
            const cId = e.userId || detailsObj.userId || e.authorId || detailsObj.authorId || (e as any).createdById || detailsObj.createdById;
            const found = activeUsers.find(u => u.id === cId || u.id === String(cId));
            if (found) mappedCreatedBy = found;
          }

          return {
            id: String(e.id),
            title: e.title || '予定',
            start: e.startAt || e.start || new Date().toISOString(),
            end: e.endAt || e.end || e.startAt || e.start || new Date().toISOString(),
            isAllDay: e.isAllDay === true || e.isAllDay === 1 || e.isAllDay === 'true' || e.isAllDay === '1',
            type: e.category || 'personal',
            office: e.office || '全社',
            division: e.division || '全部署',
            ...detailsObj,
            location: e.location || detailsObj.location || '',
            memo: e.memo || detailsObj.memo || '',
            isGoogleSynced: false,
            attachments: (e.attachments || e.attachmentsJson) 
              ? (typeof (e.attachments || e.attachmentsJson) === 'string' && (e.attachments || e.attachmentsJson).startsWith('[') ? JSON.parse(e.attachments || e.attachmentsJson) : (e.attachments || e.attachmentsJson)) 
              : (detailsObj.attachments || []),
            attendees: mappedAttendees,
            createdBy: mappedCreatedBy || detailsObj.createdBy || (e.createdById ? { id: e.createdById, name: '' } : undefined),
            createdById: mappedCreatedBy?.id || detailsObj.createdById || e.createdById || e.userId || detailsObj.userId || undefined,
            recurrence: parsedRecurrence,
            recurrenceParentId: e.recurrenceParentId || detailsObj.recurrenceParentId || undefined,
            recurrenceOriginalDate: e.recurrenceOriginalDate || detailsObj.recurrenceOriginalDate || undefined,
            recurrenceExceptions: parsedExceptions,
            createdAt: e.createdAt || detailsObj.createdAt || e.created_at || undefined,
            updatedAt: e.updatedAt || detailsObj.updatedAt || e.updated_at || undefined,
            draftSavedAt: e.draftSavedAt || detailsObj.draftSavedAt || undefined,
          };
        });
        setEvents(mapped);
        setFetchErrors(prev => { if (!prev.events) return prev; const next = { ...prev }; delete next.events; return next; });
      }
    } catch (err: any) {
      console.warn('Failed to load events from API:', err);
      setFetchErrors(prev => ({ ...prev, events: `カレンダー予定取得エラー: ${err?.message || '接続エラー'}` }));
    }
  };

  const refetchApplications = async (currentUsers = usersList) => {
    try {
      const response = await fetch(`${API_BASE_URL}/workflows`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const mapped = data.map((app: any) => {
          let detailsObj: any = {};
          if (app.details && typeof app.details === 'string' && app.details.startsWith('{')) {
            try { detailsObj = JSON.parse(app.details); } catch (_) {}
          }
          const applicantUser = currentUsers.find(u => u.id === app.applicantId) || app.applicant || userState;
          const approverUserObj = currentUsers.find(u => u.id === app.approverId) || app.approver;
          
          let rawStatus = app.status || detailsObj.status || 'pending';
          if (rawStatus.includes('approved') || rawStatus.includes('承認済')) rawStatus = 'approved';
          else if (rawStatus.includes('rejected') || rawStatus.includes('却下')) rawStatus = 'rejected';
          else if (rawStatus.includes('draft') || rawStatus.includes('下書き')) rawStatus = 'draft';
          else if (['pending', 'approved', 'rejected', 'draft'].includes(rawStatus)) { /* keep */ }
          else rawStatus = 'pending';

          let rawType = app.category || app.type || detailsObj.type || 'other';
          if (['business_trip', 'inventory_issue', 'purchase_order', 'other'].includes(rawType)) {
            /* keep */
          } else if (rawType === 'general') {
            rawType = 'other';
          } else {
            rawType = 'other';
          }

          const rawPo = app.purchaseOrderNumber || detailsObj.purchaseOrderNumber || undefined;
          const rawConstDate = app.constructionDate || detailsObj.constructionDate || undefined;
          const rawLinkedInv = app.linkedInventoryIssueId || detailsObj.linkedInventoryIssueId || undefined;

          return {
            id: String(app.id),
            title: app.title || '無題の申請',
            applicant: applicantUser,
            approver: approverUserObj,
            createdAt: app.createdAt || new Date().toISOString(),
            ...detailsObj,
            purchaseOrderNumber: rawPo,
            constructionDate: rawConstDate,
            linkedInventoryIssueId: rawLinkedInv,
            status: rawStatus,
            category: rawType,
            type: rawType,
          };
        });
        // Local deleted filter fallback to prevent deleted workflows from reappearing
        let deletedIds: string[] = [];
        try {
          const stored = localStorage.getItem('deleted_workflow_ids');
          if (stored) {
            deletedIds = JSON.parse(stored);
          }
        } catch (_) {}

        setApplications(mapped.filter((app: any) => !deletedIds.includes(app.id)));
        setFetchErrors(prev => { if (!prev.workflows) return prev; const next = { ...prev }; delete next.workflows; return next; });
      }
    } catch (err: any) {
      console.warn('Failed to load workflows from API:', err);
      setFetchErrors(prev => ({ ...prev, workflows: `ワークフロー取得エラー: ${err?.message || '接続エラー'}` }));
    }
  };

  const refetchTopics = async (currentUsers = usersList) => {
    try {
      const response = await fetch(`${API_BASE_URL}/bulletins`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const mapped = data.map((t: any) => {
          let detailsObj: any = {};
          if (t.content && typeof t.content === 'string' && t.content.startsWith('{')) {
            try { detailsObj = JSON.parse(t.content); } catch (_) {}
          }
          const authorUser = currentUsers.find(u => u.id === t.authorId) || t.author || userState;
          
          // APIから取得したコメントをそのまま使用
          const commentsList = Array.isArray(t.comments) ? t.comments : [];

          // APIから取得した閲覧者をそのまま使用
          let parsedViewers = [];
          if (Array.isArray(t.viewers)) {
            parsedViewers = t.viewers;
          } else if (typeof t.viewers === 'string' && t.viewers.startsWith('[')) {
            try { parsedViewers = JSON.parse(t.viewers); } catch (_) {}
          } else if (detailsObj.viewers && Array.isArray(detailsObj.viewers)) {
            parsedViewers = detailsObj.viewers;
          }

          return {
            id: String(t.id),
            category: t.category || 'general',
            title: t.title,
            content: t.content,
            author: authorUser,
            createdAt: t.createdAt,
            views: t.views || 0,
            likes: t.likes || 0,
            office: t.office || '全社',
            division: t.division || '全部署',
            scope: t.scope || '全社',
            tags: Array.isArray(t.tags) ? t.tags : (typeof t.tags === 'string' ? t.tags.split(',') : []),
            isPinned: t.isPinned === true || t.isPinned === 1,
            attachments: t.attachments ? (typeof t.attachments === 'string' && t.attachments.startsWith('[') ? JSON.parse(t.attachments) : t.attachments) : [],
            comments: commentsList,
            viewers: parsedViewers,
            commentsCount: commentsList.length || t.commentsCount || 0,
            ...detailsObj
          };
        });
        setTopics(mapped);
        setFetchErrors(prev => { if (!prev.bulletins) return prev; const next = { ...prev }; delete next.bulletins; return next; });
      }
    } catch (err: any) {
      console.warn('Failed to load bulletins from API:', err);
      setFetchErrors(prev => ({ ...prev, bulletins: `掲示板取得エラー: ${err?.message || '接続エラー'}` }));
    }
  };

  const refetchChatRooms = async (currentUsers = usersList, isBackground = false) => {
    if (isChatRefetchingRef.current) return;
    isChatRefetchingRef.current = true;

    try {
      const response = await fetch(`${API_BASE_URL}/chats`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        let deletedIds: string[] = [];
        try {
          const stored = localStorage.getItem('deleted_chat_room_ids');
          if (stored) deletedIds = JSON.parse(stored);
        } catch (_) {}

        const mapped = data
          .filter((room: any) => !deletedIds.includes(String(room.id)))
          .map((room: any) => {
            // 参加者リストの構築
            let resolvedParticipants: User[] = [];
            if (Array.isArray(room.participants) && room.participants.length > 0) {
              resolvedParticipants = room.participants;
            }

            // 安全なデフォルトフォールバック
            if (resolvedParticipants.length === 0) {
              if (room.type === 'dm') {
                resolvedParticipants = currentUsers.slice(0, 3);
              } else {
                // 社内SNSのグループチャットは、デフォルトで社員（ユーザー）全員を参加者にする
                resolvedParticipants = currentUsers;
              }
            }

            return {
              ...room,
              id: String(room.id),
              participants: resolvedParticipants,
              messages: Array.isArray(room.messages) ? room.messages : []
            };
          })
          .filter((room: any) => {
            if (!userState?.id) return true;
            return room.participants.some((p: any) => String(p.id) === String(userState.id));
          });
        setChatRooms(mapped);

        // 成功時はエラー状態とカウンターをリセット
        chatConsecutiveErrorsRef.current = 0;
        setFetchErrors(prev => {
          if (!prev.chats) return prev;
          const next = { ...prev };
          delete next.chats;
          return next;
        });
      }
    } catch (err: any) {
      chatConsecutiveErrorsRef.current += 1;
      if (!isBackground) {
        console.warn('Failed to load chat rooms from API:', err);
        setFetchErrors(prev => ({ ...prev, chats: `チャット取得エラー: ${err?.message || '接続エラー'}` }));
      } else {
        // バックグラウンド同期時（APIサーバー再起動等）は画面全体を覆う赤色エラーバナーを出さず抑制
        if (chatConsecutiveErrorsRef.current === 1 || chatConsecutiveErrorsRef.current % 10 === 0) {
          console.warn(`[Chat Polling] バックグラウンド接続待機中 (試行回数: ${chatConsecutiveErrorsRef.current}):`, err?.message);
        }
      }
    } finally {
      isChatRefetchingRef.current = false;
    }
  };

  const refetchMemos = async (currentUsers = usersList) => {
    try {
      const response = await fetch(`${API_BASE_URL}/memos`, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        let deletedMemoIds: string[] = [];
        try {
          const stored = localStorage.getItem('deleted_memo_ids');
          if (stored) deletedMemoIds = JSON.parse(stored);
        } catch (_) {}

        const mapped = data
          .filter((m: any) => !deletedMemoIds.includes(String(m.id)))
          .map((m: any) => {
            let detailsObj: any = {};
          if (m.details) {
            if (typeof m.details === 'object') {
              detailsObj = m.details;
            } else if (typeof m.details === 'string') {
              try { detailsObj = JSON.parse(m.details); } catch (_) {}
            }
          }
          if (m.content && typeof m.content === 'string' && m.content.startsWith('{')) {
            try { detailsObj = { ...detailsObj, ...JSON.parse(m.content) }; } catch (_) {}
          }
          const activeUsers = currentUsers;
          const targetUser = activeUsers.find(u => u.id === m.receiverId || u.id === m.toUserId) || activeUsers[0];

          // Determine overall status
          const isHandledStatus = m.status === 'handled' || (detailsObj && detailsObj.status === 'handled');
          const isReadStatus = isHandledStatus || m.status === 'read' || (detailsObj && detailsObj.status === 'read') || m.isRead === 1 || m.isRead === true;

          const defaultRecipientStatus = [{
            userId: targetUser?.id || 'u1',
            userName: targetUser?.name || '担当者',
            avatarUrl: targetUser?.avatarUrl || '',
            department: targetUser?.department || '',
            office: targetUser?.office || '',
            division: targetUser?.division || '',
            isViewed: isReadStatus,
            isHandled: isHandledStatus
          }];

          // Parse recipientStatusesJson / recipient_statuses_json / recipientStatuses
          let parsedRecipientStatuses: any[] | null = null;
          const repJson = m.recipientStatusesJson || m.recipient_statuses_json || m.recipientStatuses || (detailsObj && (detailsObj.recipientStatuses || detailsObj.recipientStatusesJson || detailsObj.recipient_statuses_json));
          if (repJson) {
            try {
              const parsed = typeof repJson === 'string' ? JSON.parse(repJson) : repJson;
              if (Array.isArray(parsed)) {
                parsedRecipientStatuses = parsed;
              } else if (parsed && typeof parsed === 'object') {
                // DB stores as { "u3": { "isRead": false, "readAt": null } }
                parsedRecipientStatuses = Object.entries(parsed).map(([uid, val]: [string, any]) => {
                  const uObj = activeUsers.find(u => u.id === uid);
                  return {
                    userId: uid,
                    userName: uObj?.name || '担当者',
                    avatarUrl: uObj?.avatarUrl || '',
                    department: uObj?.department || '',
                    office: uObj?.office || '',
                    division: uObj?.division || '',
                    isViewed: val.isRead || val.isViewed || false,
                    viewedAt: val.readAt || val.viewedAt || undefined,
                    isHandled: val.isHandled !== undefined ? val.isHandled : (val.isRead || false),
                    handledAt: val.handledAt || undefined,
                  };
                });
              }
            } catch (_) {}
          }

          const mergedRecipientStatuses = (parsedRecipientStatuses && parsedRecipientStatuses.length > 0)
            ? parsedRecipientStatuses
            : defaultRecipientStatus;

          const mergedTargetOffices = (Array.isArray(m.targetOffices) && m.targetOffices.length > 0)
            ? m.targetOffices
            : (detailsObj && Array.isArray(detailsObj.targetOffices) ? detailsObj.targetOffices : []);

          const mergedTargetDivisions = (Array.isArray(m.targetDivisions) && m.targetDivisions.length > 0)
            ? m.targetDivisions
            : (detailsObj && Array.isArray(detailsObj.targetDivisions) ? detailsObj.targetDivisions : []);

          let parsedToUsers: any[] | null = null;
          const toUsersJsonStr = m.toUsersJson || m.to_users_json;
          if (toUsersJsonStr) {
            try {
              const parsed = typeof toUsersJsonStr === 'string' ? JSON.parse(toUsersJsonStr) : toUsersJsonStr;
              if (Array.isArray(parsed)) {
                parsedToUsers = parsed.map((uid: string) => activeUsers.find(u => u.id === uid)).filter(Boolean);
              }
            } catch (_) {}
          }

          const mergedToUsers = parsedToUsers || (Array.isArray(m.toUsers) ? m.toUsers : (detailsObj && Array.isArray(detailsObj.toUsers) ? detailsObj.toUsers : (targetUser ? [targetUser] : [])));

          return {
            id: String(m.id),
            fromName: m.fromName || (detailsObj && detailsObj.fromName) || '不詳',
            fromCompany: m.fromCompany || (detailsObj && detailsObj.fromCompany) || '',
            fromPhone: m.fromPhone || (detailsObj && detailsObj.fromPhone) || '',
            content: m.content || (detailsObj && detailsObj.content) || '',
            createdAt: m.createdAt || (detailsObj && detailsObj.createdAt) || new Date().toISOString(),
            ...detailsObj,
            ...m,
            targetOffices: mergedTargetOffices,
            targetDivisions: mergedTargetDivisions,
            recipientStatuses: mergedRecipientStatuses,
            toUsers: mergedToUsers,
            toUser: targetUser,
            createdByUser: activeUsers.find(u => u.id === (m.senderId || (detailsObj && detailsObj.senderId))),
            status: m.status ? m.status : ((detailsObj && detailsObj.status) ? detailsObj.status : (isHandledStatus ? 'handled' : (isReadStatus ? 'read' : 'unread'))),
          };
        });

        setMemos(mapped);
        setFetchErrors(prev => { if (!prev.memos) return prev; const next = { ...prev }; delete next.memos; return next; });
      }
    } catch (err: any) {
      console.warn('Failed to load memos from API:', err);
      setFetchErrors(prev => ({ ...prev, memos: `伝言メモ取得エラー: ${err?.message || '接続エラー'}` }));
    }
  };

  const refetchReports = async (currentUsers = usersList) => {
    try {
      let response = await fetch(`${API_BASE_URL}/work-reports`, {
        headers: { 'Accept': 'application/json' }
      });
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/daily-reports`, {
          headers: { 'Accept': 'application/json' }
        });
      }
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/reports`, {
          headers: { 'Accept': 'application/json' }
        });
      }
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        let deletedReportIds: string[] = [];
        try {
          const stored = localStorage.getItem('deleted_report_ids');
          if (stored) deletedReportIds = JSON.parse(stored);
        } catch (_) {}

        const mapped = data
          .filter((r: any) => !deletedReportIds.includes(String(r.id)))
          .map((r: any) => {
          const authorUser = currentUsers.find(u => u.id === r.authorId) || r.author || userState;
          const supervisorUser = r.supervisorId ? (currentUsers.find(u => u.id === r.supervisorId) || r.supervisor) : undefined;
          let parsedTasks = r.tasks || '';
          let parsedResults = r.results || '';
          let parsedIssues = r.issues || '';
          let parsedOngoing = r.ongoingProjects || '';
          let parsedTomorrow = r.tomorrowPlan || '';
          if (r.content && (!r.tasks || !r.results)) {
            if (r.content.startsWith('{')) {
              try {
                const p = JSON.parse(r.content);
                parsedTasks = p.tasks || parsedTasks;
                parsedResults = p.results || parsedResults;
                parsedIssues = p.issues || parsedIssues;
                parsedOngoing = p.ongoingProjects || parsedOngoing;
                parsedTomorrow = p.tomorrowPlan || parsedTomorrow;
              } catch (_) {}
            } else {
              parsedTasks = r.content;
            }
          }
          let mData = r.maintenanceData || r.maintenance_data || r.Maintenance_Data;
          if (typeof mData === 'string') {
            try { mData = JSON.parse(mData); } catch (_) {}
            if (typeof mData === 'string') {
              try { mData = JSON.parse(mData); } catch (_) {}
            }
          }

          let cData = r.constructionData || r.construction_data || r.Construction_Data;
          if (typeof cData === 'string') {
            try { cData = JSON.parse(cData); } catch (_) {}
            if (typeof cData === 'string') {
              try { cData = JSON.parse(cData); } catch (_) {}
            }
          }

          let sData = r.salesData || r.sales_data || r.Sales_Data;
          if (typeof sData === 'string') {
            try { sData = JSON.parse(sData); } catch (_) {}
            if (typeof sData === 'string') {
              try { sData = JSON.parse(sData); } catch (_) {}
            }
          }

          return {
            id: String(r.id),
            author: authorUser,
            authorId: authorUser?.id || r.authorId || r.author_id,
            reportType: r.reportType || r.report_type || (r.weekStartDate || r.week_start_date ? 'weekly' : 'daily'),
            date: r.date || r.reportDate || r.report_date || (r.createdAt ? String(r.createdAt).substring(0, 10) : ''),
            weekStartDate: r.weekStartDate || r.week_start_date,
            weekLabel: r.weekLabel || r.week_label,
            department: r.department || authorUser?.department || '',
            tasks: parsedTasks,
            results: parsedResults,
            issues: parsedIssues,
            ongoingProjects: parsedOngoing,
            tomorrowPlan: parsedTomorrow,
            supervisorId: r.supervisorId || r.supervisor_id,
            supervisor: supervisorUser,
            status: r.status || 'submitted',
            feedbackComment: r.feedbackComment || r.feedback_comment || '',
            maintenanceData: mData,
            constructionData: cData,
            salesData: sData,
            submittedAt: r.submittedAt || r.submitted_at,
            reviewedAt: r.reviewedAt || r.reviewed_at,
            createdAt: r.createdAt || r.created_at || new Date().toISOString()
          };
        });
        setReports(mapped);
        setFetchErrors(prev => { if (!prev.reports) return prev; const next = { ...prev }; delete next.reports; return next; });
      }
    } catch (err: any) {
      console.warn('Failed to load reports from API:', err);
      setFetchErrors(prev => ({ ...prev, reports: `日報・週報取得エラー: ${err?.message || '接続エラー'}` }));
    }
  };

  const refetchAll = async () => {
    const latestUsers = await refetchUsers();
    await Promise.all([
      refetchMasters(),
      refetchPosts(latestUsers),
      refetchEvents(latestUsers),
      refetchApplications(latestUsers),
      refetchTopics(latestUsers),
      refetchChatRooms(latestUsers, false),
      refetchMemos(latestUsers),
      refetchReports(latestUsers),
    ]);
  };

  useEffect(() => {
    // Always load latest users from API on mount
    refetchUsers().then((latestUsers) => {
      if (isAuthenticated) {
        refetchAll();
      }
    });
  }, [isAuthenticated]);

  // チャットルームの自動更新（タブに応じた動的インターバル制御）
  useEffect(() => {
    if (!isAuthenticated) return;

    let timeoutId: any = null;
    let isCancelled = false;

    // チャット画面を開いたときは即時に最新データをフェッチしてリアルタイム性を確保
    if (activeTab === 'chat') {
      refetchChatRooms(usersList, true);
    }

    const scheduleNextPoll = () => {
      if (isCancelled) return;

      const isChatTab = activeTab === 'chat';
      const isDocumentHidden = typeof document !== 'undefined' && document.hidden;

      // チャットタブ閲覧時は高リアルタイム性 (2.5秒)
      // マイページや他タブ閲覧時は負荷軽減・サーバー再起動時のエラー抑制のため間隔を延長 (45秒)
      let baseDelay = isChatTab ? 2500 : 45000;
      if (isDocumentHidden) {
        baseDelay = isChatTab ? 15000 : 60000;
      }

      // サーバー再起動中などの連続エラー時はバックオフを適用してリクエスト過多を抑制
      const consecutiveErrors = chatConsecutiveErrorsRef.current;
      let delay = baseDelay;
      if (consecutiveErrors > 0) {
        if (isChatTab) {
          delay = Math.min(30000, 2500 * Math.pow(1.5, Math.min(consecutiveErrors, 6)));
        } else {
          delay = Math.min(90000, 45000 + consecutiveErrors * 5000);
        }
      }

      timeoutId = setTimeout(async () => {
        if (isCancelled) return;
        await refetchChatRooms(usersList, true);
        scheduleNextPoll();
      }, delay);
    };

    scheduleNextPoll();

    // ウィンドウ復帰時・タブアクティブ時の即時同期イベント
    const handleVisibilityOrFocus = () => {
      if (document.visibilityState === 'visible' && activeTab === 'chat') {
        refetchChatRooms(usersList, true);
      }
    };

    window.addEventListener('focus', handleVisibilityOrFocus);
    document.addEventListener('visibilitychange', handleVisibilityOrFocus);

    return () => {
      isCancelled = true;
      if (timeoutId) clearTimeout(timeoutId);
      window.removeEventListener('focus', handleVisibilityOrFocus);
      document.removeEventListener('visibilitychange', handleVisibilityOrFocus);
    };
  }, [isAuthenticated, activeTab, usersList]);

  // Board Handlers
  const handleAddTopic = async (topicData: Omit<BoardTopic, 'id' | 'createdAt' | 'views' | 'commentsCount'>) => {
    const tempId = `t-temp-${Date.now()}`;
    const newTopic: BoardTopic = {
      ...topicData,
      id: tempId,
      createdAt: new Date().toISOString(),
      views: 0,
      commentsCount: 0,
    };
    setTopics([newTopic, ...topics]);

    if (userState?.id) {
      markTopicAsRead(userState.id, tempId);
    }

    // 全ユーザーに掲示板のプッシュ通知を配信
    triggerPushNotification({
      targetUserId: 'all',
      excludeUserId: topicData.author.id,
      title: `📢 掲示板新着: ${topicData.title}`,
      body: `${topicData.author.name}さんが「${topicData.title}」を投稿しました。`,
      url: `/?tab=board&topicId=${tempId}`,
      tag: `topic-${tempId}`
    });

    try {
      const response = await fetch(`${API_BASE_URL}/bulletins`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: topicData.category,
          title: topicData.title,
          content: topicData.content,
          authorId: topicData.author.id,
          office: topicData.office || '全社',
          division: topicData.division || '全部署',
          scope: topicData.scope || '全社',
          tags: topicData.tags || [],
          isPinned: topicData.isPinned ? 1 : 0,
          attachments: topicData.attachments || [],
          comments: topicData.comments || [],
          viewers: topicData.viewers || [],
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data && data.id && userState?.id) {
          markTopicAsRead(userState.id, data.id);
        }
        await refetchTopics();
      }
    } catch (err) {
      console.error('Failed to save bulletin via API, keeping locally:', err);
    }
  };

  const handleUpdateTopic = async (updatedTopic: BoardTopic) => {
    try {
      const response = await fetch(`${API_BASE_URL}/bulletins/${updatedTopic.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          category: updatedTopic.category,
          title: updatedTopic.title,
          content: updatedTopic.content,
          authorId: updatedTopic.author.id,
          office: updatedTopic.office || '全社',
          division: updatedTopic.division || '全部署',
          scope: updatedTopic.scope || '全社',
          tags: updatedTopic.tags || [],
          isPinned: updatedTopic.isPinned ? 1 : 0,
          attachments: updatedTopic.attachments || [],
          comments: updatedTopic.comments || [],
          viewers: updatedTopic.viewers || [],
          views: updatedTopic.views,
        })
      });
      if (response.ok) {
        await refetchTopics();
      } else {
        setTopics(prev => prev.map(t => t.id === updatedTopic.id ? updatedTopic : t));
      }
    } catch (err) {
      console.warn('Failed to update bulletin via API:', err);
      setTopics(prev => prev.map(t => t.id === updatedTopic.id ? updatedTopic : t));
    } finally {
      window.dispatchEvent(new CustomEvent('notifications_updated'));
    }
  };

  const handleDeleteTopic = async (topicId: string) => {
    const targetTopic = topics.find(t => t.id === topicId);
    if (targetTopic) {
      const allAttachments = [
        ...(targetTopic.attachments || []),
        ...(targetTopic.comments || []).flatMap(c => c.attachments || [])
      ];
      if (allAttachments.length > 0) {
        await deleteAttachmentFiles(allAttachments);
      }
    }

    setTopics(prev => prev.filter(t => t.id !== topicId));

    try {
      const response = await fetch(`${API_BASE_URL}/bulletins/${topicId}`, {
        method: 'DELETE'
      });
      if (response.ok) {
        await refetchTopics();
      }
    } catch (err) {
      console.error('Failed to delete bulletin via API:', err);
    }
  };

  if (!isAuthenticated) {
    return <LoginScreen users={usersList} onLogin={handleLogin} />;
  }

  // Switch active user for testing permissions
  const handleSwitchUser = (user: User) => {
    setUserState(user);
    localStorage.setItem('logged_in_user_id', user.id);
  };

  // User Management
  const handleAddUser = async (userData: Omit<User, 'id'>) => {
    const tempId = `u-${Date.now()}`;
    const newUser: User = {
      ...userData,
      avatarUrl: sanitizeAvatarUrlForSave(userData.avatarUrl),
      id: tempId,
    };
    // Optimistic UI update
    setUsersList(prev => [...prev, newUser]);

    try {
      console.log('Attempting to create user via POST to /api/users...');
      const response = await fetch(`${API_BASE_URL}/users`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(newUser),
      });

      if (response.ok) {
        console.log('User successfully created on server.');
        await refetchUsers();
      } else {
        const errText = await response.text().catch(() => '');
        console.warn(`POST /api/users failed with status ${response.status}: ${errText}. Keeping locally.`);
      }
    } catch (err: any) {
      console.warn('Failed to create user via API, keeping locally:', err);
    }
  };

  const handleUpdateUser = async (updatedUser: User) => {
    const sanitizedUser = {
      ...updatedUser,
      avatarUrl: sanitizeAvatarUrlForSave(updatedUser.avatarUrl),
    };

    // Optimistically update GUI state instantly
    setUsersList(prev => prev.map((u) => (u.id === sanitizedUser.id ? sanitizedUser : u)));
    if (sanitizedUser.id === userState.id) {
      setUserState(sanitizedUser);
    }

    try {
      const urlWithId = `${API_BASE_URL}/users/${sanitizedUser.id}`;
      console.log(`Attempting update: PUT to ${urlWithId}...`);
      let response = await fetch(urlWithId, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(sanitizedUser),
      });

      if (!response.ok) {
        console.warn(`PUT /api/users/:id failed with status ${response.status}. Trying POST fallback...`);
        // Fallback 1: POST /api/users/:id
        response = await fetch(urlWithId, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(sanitizedUser),
        });
      }

      if (!response.ok) {
        console.warn(`POST /api/users/:id failed with status ${response.status}. Trying PUT to /api/users...`);
        // Fallback 2: PUT /api/users
        response = await fetch(`${API_BASE_URL}/users`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(sanitizedUser),
        });
      }

      if (!response.ok) {
        console.warn(`PUT /api/users failed with status ${response.status}. Trying POST to /api/users...`);
        // Fallback 3: POST /api/users (many simple APIs accept POST here to insert or update)
        response = await fetch(`${API_BASE_URL}/users`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(sanitizedUser),
        });
      }

      if (response.ok) {
        console.log('User successfully updated in backend DB.');
        await refetchUsers();
      } else {
        const errText = await response.text().catch(() => '');
        console.warn(`All fallback updates failed. Last status: ${response.status}: ${errText}. Keeping locally.`);
      }
    } catch (err: any) {
      console.warn('Failed to update user via API, keeping locally:', err);
    }
  };

  const handleToggleSidebarCollapse = (collapsed: boolean) => {
    setIsSidebarCollapsed(collapsed);
    localStorage.setItem('is_sidebar_collapsed', String(collapsed));

    if (userState && userState.id) {
      const updatedUser: User = {
        ...userState,
        preferences: {
          ...(userState.preferences || {}),
          isSidebarCollapsed: collapsed,
        },
      };
      handleUpdateUser(updatedUser);
    }
  };

  const handleDeleteUser = async (userId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'ユーザーの削除',
      message: 'このユーザーを削除してもよろしいですか？',
      type: 'danger',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      onConfirm: async () => {
        setUsersList(prev => prev.filter((u) => u.id !== userId));

        try {
          console.log(`Attempting to delete user via DELETE on /api/users/${userId}...`);
          let response = await fetch(`${API_BASE_URL}/users/${userId}`, {
            method: 'DELETE',
            headers: {
              'Accept': 'application/json',
            },
          });

          if (response.ok) {
            console.log('User successfully deleted from server DB.');
            await refetchUsers();
          } else {
            console.warn(`DELETE /api/users/:id failed with status ${response.status}. Keeping locally.`);
          }
        } catch (err: any) {
          console.warn('Failed to delete user via API, keeping locally:', err);
        }
      }
    });
  };

  const handleToggleUserAdmin = async (userId: string) => {
    let targetUser: User | undefined;

    setUsersList(prev => prev.map(u => {
      if (u.id === userId) {
        const updatedIsAdmin = !u.isAdmin;
        const updated = { ...u, isAdmin: updatedIsAdmin, role: (updatedIsAdmin ? 'admin' : 'user') as 'admin' | 'user' };
        if (u.id === userState.id) {
          setUserState(updated);
        }
        targetUser = updated;
        return updated;
      }
      return u;
    }));

    if (targetUser) {
      try {
        console.log(`Attempting to toggle admin status for user ${userId}...`);
        const urlWithId = `${API_BASE_URL}/users/${userId}`;
        let response = await fetch(urlWithId, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
          },
          body: JSON.stringify(targetUser),
        });

        if (!response.ok) {
          response = await fetch(`${API_BASE_URL}/users`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Accept': 'application/json',
            },
            body: JSON.stringify(targetUser),
          });
        }

        if (response.ok) {
          console.log('User admin status successfully updated.');
          await refetchUsers();
        } else {
          console.warn(`Admin toggle API failed with status ${response.status}. Keeping locally.`);
        }
      } catch (err: any) {
        console.warn('Failed to toggle admin status via API, keeping locally:', err);
      }
    }
  };

  // Helpers for Master error handling & rollback
  const getMasterErrorMessage = async (response: Response): Promise<string> => {
    try {
      const data = await response.json();
      return data.error || data.message || `HTTP ${response.status}`;
    } catch (_) {
      try {
        const text = await response.text();
        return text || `HTTP ${response.status}`;
      } catch (_) {
        return `HTTP ${response.status}`;
      }
    }
  };

  const showMasterErrorModal = (title: string, errorMsg: string) => {
    let suggestion = '管理者様は SSMS (SQL Server Management Studio) から `ssms-db-setup.sql` を実行して、データベースのテーブルスキーマ（カラムの追加等）を最新に更新してください。';
    
    const lowerMsg = errorMsg.toLowerCase();
    if (lowerMsg.includes('phone') || lowerMsg.includes('location') || lowerMsg.includes('type') || lowerMsg.includes('code')) {
      suggestion = 'SQL Server の `dbo.Offices` テーブルに `phone` などの新カラムが不足しているようです。`ssms-db-setup.sql` をお使いのデータベース（SSMS 等）に対して実行し、テーブルスキーマを最新の構成にアップデートしてください。';
    } else if (lowerMsg.includes('description') || lowerMsg.includes('code')) {
      suggestion = 'SQL Server の `dbo.Divisions` または `dbo.Positions` テーブルに `description` や `code` などの新カラムが不足しているようです。`ssms-db-setup.sql` をお使いのデータベースに対して実行し、テーブルスキーマをアップデートしてください。';
    }
    
    setConfirmModal({
      isOpen: true,
      title: `${title}に失敗しました`,
      message: `データベースの同期中にエラーが発生したため、変更をロールバックしました。\n\n【詳細なエラー】\n${errorMsg}\n\n【推奨される解決策】\n${suggestion}`,
      type: 'danger',
      confirmText: '閉じる',
    });
  };

  // Office Master Handlers
  const handleAddOffice = async (officeData: Omit<OfficeMaster, 'id'>) => {
    const originalOffices = [...offices];
    const newOffice: OfficeMaster = {
      ...officeData,
      id: `off-${Date.now()}`,
    };
    setOffices(prev => [...prev, newOffice]);
    try {
      const response = await fetch(`${API_BASE_URL}/masters/offices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOffice)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to add office:', e);
      setOffices(originalOffices);
      showMasterErrorModal('拠点マスターの追加', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  const handleUpdateOffice = async (updatedOffice: OfficeMaster) => {
    const originalOffices = [...offices];
    setOffices(prev => prev.map((o) => (o.id === updatedOffice.id ? updatedOffice : o)));
    try {
      const response = await fetch(`${API_BASE_URL}/masters/offices/${updatedOffice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOffice)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to update office:', e);
      setOffices(originalOffices);
      showMasterErrorModal('拠点マスターの更新', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  const handleDeleteOffice = async (officeId: string) => {
    const originalOffices = [...offices];
    setOffices(prev => prev.filter((o) => o.id !== officeId));
    try {
      const response = await fetch(`${API_BASE_URL}/masters/offices/${officeId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to delete office:', e);
      setOffices(originalOffices);
      showMasterErrorModal('拠点マスターの削除', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  // Division Master Handlers
  const handleAddDivision = async (divisionData: Omit<DivisionMaster, 'id'>) => {
    const originalDivisions = [...divisions];
    const newDivision: DivisionMaster = {
      ...divisionData,
      id: `div-${Date.now()}`,
    };
    setDivisions(prev => [...prev, newDivision]);
    try {
      const response = await fetch(`${API_BASE_URL}/masters/divisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDivision)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to add division:', e);
      setDivisions(originalDivisions);
      showMasterErrorModal('部署マスターの追加', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  const handleUpdateDivision = async (updatedDivision: DivisionMaster) => {
    const originalDivisions = [...divisions];
    setDivisions(prev => prev.map((d) => (d.id === updatedDivision.id ? updatedDivision : d)));
    try {
      const response = await fetch(`${API_BASE_URL}/masters/divisions/${updatedDivision.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDivision)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to update division:', e);
      setDivisions(originalDivisions);
      showMasterErrorModal('部署マスターの更新', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  const handleDeleteDivision = async (divisionId: string) => {
    const originalDivisions = [...divisions];
    setDivisions(prev => prev.filter((d) => d.id !== divisionId));
    try {
      const response = await fetch(`${API_BASE_URL}/masters/divisions/${divisionId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to delete division:', e);
      setDivisions(originalDivisions);
      showMasterErrorModal('部署マスターの削除', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  // Position Master Handlers
  const handleAddPosition = async (positionData: Omit<PositionMaster, 'id'>) => {
    const originalPositions = [...positions];
    const newPosition: PositionMaster = {
      ...positionData,
      id: `pos-${Date.now()}`,
    };
    setPositions(prev => [...prev, newPosition]);
    try {
      const response = await fetch(`${API_BASE_URL}/masters/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPosition)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to add position:', e);
      setPositions(originalPositions);
      showMasterErrorModal('役職マスターの追加', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  const handleUpdatePosition = async (updatedPosition: PositionMaster) => {
    const originalPositions = [...positions];
    setPositions(prev => prev.map((p) => (p.id === updatedPosition.id ? updatedPosition : p)));
    try {
      const response = await fetch(`${API_BASE_URL}/masters/positions/${updatedPosition.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPosition)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to update position:', e);
      setPositions(originalPositions);
      showMasterErrorModal('役職マスターの更新', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  const handleDeletePosition = async (positionId: string) => {
    const originalPositions = [...positions];
    setPositions(prev => prev.filter((p) => p.id !== positionId));
    try {
      const response = await fetch(`${API_BASE_URL}/masters/positions/${positionId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to delete position:', e);
      setPositions(originalPositions);
      showMasterErrorModal('役職マスターの削除', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  // Handle new post creation with API
  const handlePost = async (content: string, tags: string[], nasLink?: string) => {
    // Optimistic local post for instant response
    const tempId = `p-temp-${Date.now()}`;
    const newPost: Post = {
      id: tempId,
      author: userState,
      content,
      tags,
      createdAt: new Date().toISOString(),
      likes: 0,
      isLiked: false,
      nasLink,
    };
    setPosts(prev => [newPost, ...prev]);

    try {
      const response = await fetch(`${API_BASE_URL}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          authorId: userState.id,
          content,
          tags,
          nasLink: nasLink || "",
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create post: HTTP status ${response.status}`);
      }

      // Refetch posts to get the actual server-saved posts with correct IDs
      await refetchAll();
    } catch (err) {
      console.error('Error creating post on API:', err);
      // Fallback: keep the local post or trigger refetch
      await refetchAll();
    }
  };

  // Handle like toggle with API
  const handleToggleLike = async (postId: string) => {
    if (postId.startsWith('p-temp-')) return;

    // Optimistically update local state
    setPosts(prev => prev.map(post => {
      if (post.id === postId) {
        return {
          ...post,
          isLiked: !post.isLiked,
          likes: post.isLiked ? Math.max(0, post.likes - 1) : post.likes + 1,
        };
      }
      return post;
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/posts/${postId}/like`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to like: HTTP status ${response.status}`);
      }
      
      const updatedPostData = await response.json();
      setPosts(prev => prev.map(post => {
        if (post.id === postId) {
          return mapPostFromApi(updatedPostData, usersList);
        }
        return post;
      }));
    } catch (err) {
      console.error('Error liking post on API:', err);
      await refetchAll();
    }
  };

  // Handle delete post with API
  const handleDeletePost = async (postId: string) => {
    if (postId.startsWith('p-temp-')) return;

    setConfirmModal({
      isOpen: true,
      title: '投稿の削除',
      message: 'この投稿を削除してもよろしいですか？',
      type: 'danger',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      onConfirm: async () => {
        // Optimistically remove from state
        setPosts(prev => prev.filter(post => post.id !== postId));

        try {
          const response = await fetch(`${API_BASE_URL}/posts/${postId}`, {
            method: 'DELETE',
            headers: {
              'Accept': 'application/json',
            }
          });

          if (!response.ok) {
            throw new Error(`Failed to delete: HTTP status ${response.status}`);
          }

          await refetchAll();
        } catch (err) {
          console.error('Error deleting post on API:', err);
          await refetchAll();
        }
      }
    });
  };

  // Helper to persist event to API
  const saveEventToApi = async (ev: CalendarEvent, isNew = false) => {
    const createdByData = ev.createdBy || userState;
    const descObj = {
      attendees: ev.attendees || [],
      viewers: (ev as any).viewers || [],
      memo: ev.memo || '',
      attachments: ev.attachments || [],
      recurrence: ev.recurrence || null,
      recurrenceParentId: ev.recurrenceParentId || null,
      recurrenceOriginalDate: ev.recurrenceOriginalDate || null,
      recurrenceExceptions: ev.recurrenceExceptions || [],
      createdBy: createdByData,
      createdById: createdByData?.id,
    };

    const payload = {
      title: ev.title,
      startAt: ev.start,
      endAt: ev.end,
      isAllDay: ev.isAllDay ? 1 : 0,
      category: ev.type,
      office: ev.office || '全社',
      division: ev.division || '全部署',
      location: ev.location || '',
      attendees: ev.attendees || [],
      memo: ev.memo || '',
      attachments: ev.attachments || [],
      recurrence: ev.recurrence || null,
      recurrenceParentId: ev.recurrenceParentId || null,
      recurrenceOriginalDate: ev.recurrenceOriginalDate || null,
      recurrenceExceptions: ev.recurrenceExceptions || [],
      status: ev.status || 'published',
      targetYearMonth: ev.targetYearMonth || null,
      draftSavedAt: ev.draftSavedAt || null,
      createdBy: createdByData,
      createdById: createdByData?.id,
      userId: createdByData?.id,
      description: JSON.stringify(descObj),
      details: JSON.stringify(descObj)
    };

    const isTempId = !ev.id || ev.id.startsWith('e-temp-') || ev.id.startsWith('e-recur-split-');
    if (isNew || isTempId) {
      return fetch(`${API_BASE_URL}/events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    } else {
      return fetch(`${API_BASE_URL}/events/${ev.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
    }
  };

  // Handle new event creation
  const handleAddEvent = async (eventData: Omit<CalendarEvent, 'id'>) => {
    const tempId = `e-temp-${Date.now()}`;
    const newEvent: CalendarEvent = {
      ...eventData,
      id: tempId,
      createdBy: eventData.createdBy || userState,
    };
    setEvents([...events, newEvent]);

    if (userState?.id) {
      markEventAsRead(userState.id, tempId);
    }

    // 参加者にプッシュ通知を配信
    const attendeeIds = (eventData.attendees || [])
      .map(a => a.id)
      .filter(id => id && id !== userState.id);
    if (attendeeIds.length > 0) {
      triggerPushNotification({
        targetUserIds: attendeeIds,
        excludeUserId: userState.id,
        title: `📅 新しい予定: ${eventData.title}`,
        body: `${userState.name}さんが「${eventData.title}」を追加しました。`,
        url: `/?tab=calendar&eventId=${tempId}`,
        tag: `event-${tempId}`
      });
    }

    try {
      const response = await saveEventToApi(newEvent, true);
      if (response && response.ok) {
        const data = await response.json();
        if (data && data.id && userState?.id) {
          markEventAsRead(userState.id, data.id);
        }
        await refetchEvents();
      }
    } catch (err) {
      console.error('Failed to add event via API, keeping locally:', err);
    }
  };

  // Handle event update
  const handleUpdateEvent = async (
    updatedEvent: CalendarEvent,
    scope: RecurrenceActionScope = 'all',
    originalInstanceDate?: string
  ) => {
    const originalEvents = [...events];

    // 繰り返しスコープに応じた分割・更新プランを生成
    const plan = planRecurrenceSave(events, updatedEvent, scope, originalInstanceDate || updatedEvent.instanceDate);
    setEvents(plan.updatedEvents);
    if (userState?.id) {
      plan.toSave.forEach(ev => {
        markEventAsRead(userState.id, ev.id);
        if (ev.recurrenceParentId) markEventAsRead(userState.id, ev.recurrenceParentId);
      });
    }
    window.dispatchEvent(new CustomEvent('notifications_updated'));

    try {
      // 1. 更新/新規作成対象を保存
      await Promise.all(
        plan.toSave.map(ev => saveEventToApi(ev, !originalEvents.some(oe => oe.id === ev.id)))
      );

      // 2. 削除対象を削除
      await Promise.all(
        plan.toDelete.map(delId =>
          fetch(`${API_BASE_URL}/events/${delId}`, { method: 'DELETE' }).catch(() => {})
        )
      );

      await refetchEvents();
    } catch (err) {
      console.error('Failed to update event via API, rolling back:', err);
      setEvents(originalEvents);
    } finally {
      window.dispatchEvent(new CustomEvent('notifications_updated'));
    }
  };

  // Handle event deletion
  const handleDeleteEvent = async (
    eventId: string,
    scope: RecurrenceActionScope = 'all',
    instanceDate?: string
  ) => {
    if (eventId.startsWith('e-temp-')) {
      setEvents(events.filter(e => e.id !== eventId));
      return;
    }

    const isExpandedInstance = eventId.includes('_');
    const targetEvent = events.find(e => e.id === eventId);
    const parentId = targetEvent?.recurrenceParentId || (isExpandedInstance ? eventId.split('_')[0] : eventId);
    const parentEvent = events.find(e => e.id === parentId);
    const targetDate = instanceDate || targetEvent?.instanceDate || (isExpandedInstance ? eventId.split('_')[1] : (targetEvent?.start ? targetEvent.start.split('T')[0] : undefined));

    const hasRecurrence = isExpandedInstance ||
      !!(targetEvent && (targetEvent.recurrence?.frequency !== 'none' || targetEvent.recurrenceParentId || targetEvent.instanceDate)) ||
      !!(parentEvent && parentEvent.recurrence?.frequency !== 'none');

    const performDelete = async () => {
      const originalEvents = [...events];
      const plan = planRecurrenceDelete(events, eventId, scope, targetDate);
      setEvents(plan.updatedEvents);

      try {
        // 1. 親などの更新対象を保存 (exceptions 追加や endDate 短縮)
        await Promise.all(
          plan.toSave.map(ev => saveEventToApi(ev, false))
        );

        // 2. 削除対象を削除 (仮想IDや一時IDを正規化し、重複除去)
        const realDeleteIds = Array.from(new Set(
          plan.toDelete
            .map(delId => delId.includes('_') ? delId.split('_')[0] : delId)
            .filter(delId => delId && !delId.startsWith('e-temp-'))
        ));

        await Promise.all(
          realDeleteIds.map(delId =>
            fetch(`${API_BASE_URL}/events/${delId}`, { method: 'DELETE' }).catch((err) => {
              console.warn(`[Delete Event API] Failed to delete event id ${delId}:`, err);
            })
          )
        );

        await refetchEvents();
      } catch (err) {
        console.error('Failed to delete event via API, rolling back:', err);
        setEvents(originalEvents);
      }
    };

    if (scope !== 'all' || !hasRecurrence) {
      // モーダルで既に確認済み、または単発予定
      await performDelete();
    } else {
      setConfirmModal({
        isOpen: true,
        title: '予定の削除',
        message: 'この予定を削除してもよろしいですか？',
        type: 'danger',
        confirmText: '削除する',
        cancelText: 'キャンセル',
        onConfirm: performDelete
      });
    }
  };

  // 承認フロー マスター管理
  const handleAddApprovalFlow = async (flowData: Omit<ApprovalFlowRule, 'id'>) => {
    const newFlow: ApprovalFlowRule = {
      ...flowData,
      id: `flow-${Date.now()}`,
    };
    setApprovalFlows(prev => [...prev, newFlow]);
    try {
      await fetch(`${API_BASE_URL}/masters/approval-flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFlow)
      });
      await refetchMasters();
    } catch (e) { console.error('Failed to add approval flow:', e); }
  };

  const handleUpdateApprovalFlow = async (updatedFlow: ApprovalFlowRule) => {
    setApprovalFlows(prev => prev.map(f => f.id === updatedFlow.id ? updatedFlow : f));
    try {
      await fetch(`${API_BASE_URL}/masters/approval-flows/${updatedFlow.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedFlow)
      });
      await refetchMasters();
    } catch (e) { console.error('Failed to update approval flow:', e); }
  };

  const handleDeleteApprovalFlow = async (id: string) => {
    setApprovalFlows(prev => prev.filter(f => f.id !== id));
    try {
      await fetch(`${API_BASE_URL}/masters/approval-flows/${id}`, { method: 'DELETE' });
      await refetchMasters();
    } catch (e) { console.error('Failed to delete approval flow:', e); }
  };

  // 申請者から N 階層目の上長を辿るヘルパー関数 (level=1: 1次上長, level=2: 2次上長...)
  const getSupervisorAtLevel = (applicant: User, targetLevel: number, users: User[]): User | null => {
    let curr: User | undefined = applicant;
    for (let i = 0; i < targetLevel; i++) {
      if (!curr || !curr.supervisorId) {
        // 指定された階層の上長が存在しない場合は最後に辿れた上長を保持
        break;
      }
      const sup = users.find(u => u.id === curr.supervisorId);
      if (!sup) break;
      curr = sup;
    }
    return (curr && curr.id !== applicant.id) ? curr : null;
  };

  // ステップ設定に基づき具体的な承認者を動的解決する関数
  const resolveApproverForStep = (applicant: User, stepConfig: ApprovalStepConfig, users: User[]): User => {
    if (stepConfig.approverType === 'specific_user' && stepConfig.specificUserId) {
      const found = users.find(u => u.id === stepConfig.specificUserId);
      if (found) return found;
    }

    let targetLevel = stepConfig.supervisorLevel;
    if (!targetLevel) {
      if (stepConfig.approverType === 'supervisor_1') targetLevel = 1;
      else if (stepConfig.approverType === 'supervisor_2') targetLevel = 2;
      else targetLevel = stepConfig.stepNumber || 1;
    }

    const sup = getSupervisorAtLevel(applicant, targetLevel, users);
    if (sup) return sup;

    // 該当階層の上長未登録時のフォールバック (直近の上長、または管理者)
    const fallbackSup = getSupervisorAtLevel(applicant, 1, users);
    return fallbackSup || users.find(u => u.id === 'u4' || u.isAdmin) || users[0];
  };

  // Handle new workflow application
  const handleAddApplication = async (appData: Omit<WorkflowApplication, 'id' | 'createdAt' | 'status'> & { status?: ApplicationStatus }) => {
    // 送信データに承認フローが指定されていればそれを優先、なければ自動検索
    let selectedFlow = approvalFlows.find(f => f.id === appData.flowId);
    if (!selectedFlow) {
      selectedFlow = approvalFlows.find(f => f.targetApplicationType === appData.type) 
        || approvalFlows.find(f => f.isDefault) 
        || approvalFlows[0];
    }

    let rawSteps: ApprovalStepConfig[] = appData.stepsConfig && appData.stepsConfig.length > 0 
      ? appData.stepsConfig 
      : (selectedFlow ? selectedFlow.steps : [
          { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' }
        ]);

    // 申請者に合わせたステップ調整（2次上長不在の場合は1次のみ）
    const stepsConfig = filterStepsForApplicant(appData.applicant, rawSteps, usersList);

    const initialApprover = appData.approver || resolveApproverForStep(appData.applicant, stepsConfig[0] || rawSteps[0], usersList);

    const tempId = `a-temp-${Date.now()}`;
    const newApp: WorkflowApplication = {
      ...appData,
      id: tempId,
      createdAt: new Date().toISOString(),
      status: appData.status || 'pending',
      approver: initialApprover,
      flowId: appData.flowId || selectedFlow?.id,
      flowName: appData.flowName || selectedFlow?.name || '標準承認フロー',
      currentStepIndex: 1,
      totalSteps: stepsConfig.length,
      stepsConfig: stepsConfig,
      history: [],
    };
    setApplications([newApp, ...applications]);

    // 承認者にプッシュ通知を配信
    if (initialApprover?.id && initialApprover.id !== appData.applicant.id && appData.status !== 'draft') {
      triggerPushNotification({
        targetUserId: initialApprover.id,
        excludeUserId: appData.applicant.id,
        title: `📋 承認依頼: ${appData.title}`,
        body: `${appData.applicant.name}さんから新しい申請が届きました。`,
        url: `/?tab=workflow&appId=${tempId}`,
        tag: `wf-${tempId}`
      });
    }

    try {
      const { applicant, approver, ...restDetails } = appData as any;
      const response = await fetch(`${API_BASE_URL}/workflows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: tempId,
          title: appData.title,
          description: appData.description || appData.title || '',
          applicantId: appData.applicant.id,
          approverId: initialApprover.id,
          status: appData.status || 'pending',
          category: appData.type || 'other',
          purchaseOrderNumber: appData.purchaseOrderNumber || null,
          constructionDate: appData.constructionDate || null,
          linkedInventoryIssueId: appData.linkedInventoryIssueId || null,
          details: JSON.stringify({
            ...restDetails,
            flowId: appData.flowId || selectedFlow?.id,
            flowName: appData.flowName || selectedFlow?.name || '標準承認フロー',
            currentStepIndex: 1,
            totalSteps: stepsConfig.length,
            stepsConfig: stepsConfig,
            history: [],
            purchaseOrderNumber: appData.purchaseOrderNumber || null,
            constructionDate: appData.constructionDate || null,
            linkedInventoryIssueId: appData.linkedInventoryIssueId || null,
            reason: (appData as any).reason || '',
            purchaseItems: (appData as any).purchaseItems || [],
            leaveStart: (appData as any).leaveStart || '',
            leaveEnd: (appData as any).leaveEnd || '',
            expenseType: (appData as any).expenseType || '',
            amount: (appData as any).amount || 0,
            attachmentUrl: (appData as any).attachmentUrl || '',
          })
        })
      });
      if (response.ok) {
        await refetchApplications();
      }
    } catch (err) {
      console.error('Failed to submit workflow via API, keeping locally:', err);
    }
  };

  // Handle workflow approval / rejection (Multi-step approval processing)
  const handleWorkflowAction = async (id: string, actionStatus: 'approved' | 'rejected', comment?: string) => {
    const targetApp = applications.find(a => a.id === id);
    if (!targetApp) return;

    let resultApp: WorkflowApplication;
    if (actionStatus === 'rejected') {
      resultApp = {
        ...targetApp,
        status: 'rejected',
        rejectReason: comment || '理由未記入',
        history: [
          ...(targetApp.history || []),
          {
            stepNumber: targetApp.currentStepIndex || 1,
            approver: userState,
            status: 'rejected',
            actionAt: new Date().toISOString(),
            comment: comment,
          }
        ]
      };
    } else {
      // 承認アクション (actionStatus === 'approved')
      const currentStep = targetApp.currentStepIndex || 1;
      const stepsConfig = (targetApp.stepsConfig && targetApp.stepsConfig.length > 0) ? targetApp.stepsConfig : null;
      const totalSteps = stepsConfig ? stepsConfig.length : (targetApp.totalSteps || 1);

      if (currentStep < totalSteps && stepsConfig) {
        const nextStepConfig = stepsConfig[currentStep];
        const nextApprover = resolveApproverForStep(targetApp.applicant, nextStepConfig, usersList);

        resultApp = {
          ...targetApp,
          currentStepIndex: currentStep + 1,
          totalSteps: totalSteps,
          approver: nextApprover,
          status: 'pending',
          history: [
            ...(targetApp.history || []),
            {
              stepNumber: currentStep,
              approver: userState,
              status: 'approved',
              actionAt: new Date().toISOString(),
              comment: comment,
            }
          ]
        };
      } else {
        resultApp = {
          ...targetApp,
          status: 'approved',
          currentStepIndex: totalSteps,
          totalSteps: totalSteps,
          history: [
            ...(targetApp.history || []),
            {
              stepNumber: currentStep,
              approver: userState,
              status: 'approved',
              actionAt: new Date().toISOString(),
              comment: comment,
            }
          ]
        };
      }
    }

    // 申請者に結果を通知 (却下または全承認時)
    if (resultApp.applicant && resultApp.applicant.id !== userState.id) {
      if (actionStatus === 'rejected') {
        triggerPushNotification({
          targetUserId: resultApp.applicant.id,
          excludeUserId: userState.id,
          title: `❌ 申請却下: ${resultApp.title}`,
          body: `${userState.name}さんにより却下されました。理由: ${comment || '未記入'}`,
          url: `/?tab=workflow&appId=${id}`,
          tag: `wf-${id}`
        });
      } else if (resultApp.status === 'approved') {
        triggerPushNotification({
          targetUserId: resultApp.applicant.id,
          excludeUserId: userState.id,
          title: `✅ 申請承認完了: ${resultApp.title}`,
          body: `${userState.name}さんにより最終承認されました。`,
          url: `/?tab=workflow&appId=${id}`,
          tag: `wf-${id}`
        });
      }
    }

    // 次の承認者がいる場合、次の承認者に依頼を通知
    if (actionStatus === 'approved' && resultApp.status === 'pending' && resultApp.approver && resultApp.approver.id !== userState.id) {
      triggerPushNotification({
        targetUserId: resultApp.approver.id,
        excludeUserId: userState.id,
        title: `📋 次期承認依頼: ${resultApp.title}`,
        body: `${targetApp.applicant.name}さんの申請（ステップ ${resultApp.currentStepIndex}/${resultApp.totalSteps}）の確認をお願いします。`,
        url: `/?tab=workflow&appId=${id}`,
        tag: `wf-${id}`
      });
    }

    if (!id.startsWith('a-temp-')) {
      try {
        const { applicant, approver, ...restDetails } = resultApp as any;
        const response = await fetch(`${API_BASE_URL}/workflows/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: resultApp.title,
            applicantId: resultApp.applicant.id,
            approverId: resultApp.approver?.id || userState.id,
            status: resultApp.status,
            category: resultApp.type || 'other',
            purchaseOrderNumber: resultApp.purchaseOrderNumber || null,
            constructionDate: resultApp.constructionDate || null,
            linkedInventoryIssueId: resultApp.linkedInventoryIssueId || null,
            details: JSON.stringify({
              ...restDetails,
              flowId: resultApp.flowId,
              flowName: resultApp.flowName,
              currentStepIndex: resultApp.currentStepIndex,
              totalSteps: resultApp.totalSteps,
              stepsConfig: resultApp.stepsConfig,
              history: resultApp.history,
              rejectReason: resultApp.rejectReason,
              purchaseOrderNumber: resultApp.purchaseOrderNumber || null,
              constructionDate: resultApp.constructionDate || null,
              linkedInventoryIssueId: resultApp.linkedInventoryIssueId || null,
              reason: (resultApp as any).reason || '',
              purchaseItems: (resultApp as any).purchaseItems || [],
              leaveStart: (resultApp as any).leaveStart || '',
              leaveEnd: (resultApp as any).leaveEnd || '',
              expenseType: (resultApp as any).expenseType || '',
              amount: (resultApp as any).amount || 0,
              attachmentUrl: (resultApp as any).attachmentUrl || '',
            })
          })
        });
        if (response.ok) {
          await refetchApplications();
        } else {
          setApplications(prev => prev.map(a => a.id === id ? resultApp : a));
        }
      } catch (err) {
        console.error('Failed to sync workflow action with API:', err);
        setApplications(prev => prev.map(a => a.id === id ? resultApp : a));
      }
    } else {
      setApplications(prev => prev.map(a => a.id === id ? resultApp : a));
    }
    window.dispatchEvent(new CustomEvent('notifications_updated'));
  };

  // 申請の更新（再申請、下書き保存、発注No付与、取り下げ等）
  const handleUpdateApplication = async (updatedApp: WorkflowApplication) => {
    let finalAppObj: WorkflowApplication | undefined;

    setApplications(prevApps => prevApps.map(app => {
      if (app.id !== updatedApp.id) return app;

      const targetStatus = updatedApp.status ? updatedApp.status : 'pending';

      let selectedFlow = approvalFlows.find(f => f.id === updatedApp.flowId);
      if (!selectedFlow) {
        selectedFlow = approvalFlows.find(f => f.targetApplicationType === updatedApp.type) 
          || approvalFlows.find(f => f.isDefault) 
          || approvalFlows[0];
      }

      const stepsConfig: ApprovalStepConfig[] = updatedApp.stepsConfig && updatedApp.stepsConfig.length > 0 
        ? updatedApp.stepsConfig 
        : (selectedFlow ? selectedFlow.steps : [
            { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' }
          ]);

      const initialApprover = updatedApp.approver || resolveApproverForStep(updatedApp.applicant, stepsConfig[0], usersList);
      const isSubmittingFromDraftOrReject = (app.status === 'draft' || app.status === 'rejected') && targetStatus === 'pending';

      const resultApp: WorkflowApplication = {
        ...updatedApp,
        status: targetStatus,
        rejectReason: targetStatus === 'pending' ? undefined : updatedApp.rejectReason,
        currentStepIndex: targetStatus === 'pending' ? 1 : updatedApp.currentStepIndex,
        totalSteps: stepsConfig.length,
        stepsConfig: stepsConfig,
        approver: initialApprover,
        flowId: updatedApp.flowId || selectedFlow?.id,
        flowName: updatedApp.flowName || selectedFlow?.name || '標準承認フロー',
        history: isSubmittingFromDraftOrReject ? [
          ...(app.history || []),
          {
            stepNumber: 0,
            approver: userState,
            status: 'approved',
            actionAt: new Date().toISOString(),
            comment: app.status === 'draft' ? '下書きから申請提出' : '内容を修正して再申請提出'
          }
        ] : (updatedApp.history || app.history || [])
      };
      finalAppObj = resultApp;
      return resultApp;
    }));

    if (finalAppObj && !updatedApp.id.startsWith('a-temp-')) {
      try {
        const { applicant, approver, ...restDetails } = finalAppObj as any;
        await fetch(`${API_BASE_URL}/workflows/${updatedApp.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            title: finalAppObj.title,
            applicantId: finalAppObj.applicant.id,
            approverId: finalAppObj.approver?.id || userState.id,
            status: finalAppObj.status,
            category: finalAppObj.type || 'other',
            purchaseOrderNumber: finalAppObj.purchaseOrderNumber || null,
            constructionDate: finalAppObj.constructionDate || null,
            linkedInventoryIssueId: finalAppObj.linkedInventoryIssueId || null,
            details: JSON.stringify({
              ...restDetails,
              flowId: finalAppObj.flowId,
              flowName: finalAppObj.flowName,
              currentStepIndex: finalAppObj.currentStepIndex,
              totalSteps: finalAppObj.totalSteps,
              stepsConfig: finalAppObj.stepsConfig,
              history: finalAppObj.history,
              rejectReason: finalAppObj.rejectReason,
              purchaseOrderNumber: finalAppObj.purchaseOrderNumber || null,
              constructionDate: finalAppObj.constructionDate || null,
              linkedInventoryIssueId: finalAppObj.linkedInventoryIssueId || null,
              reason: (finalAppObj as any).reason || '',
              purchaseItems: (finalAppObj as any).purchaseItems || [],
              leaveStart: (finalAppObj as any).leaveStart || '',
              leaveEnd: (finalAppObj as any).leaveEnd || '',
              expenseType: (finalAppObj as any).expenseType || '',
              amount: (finalAppObj as any).amount || 0,
              attachmentUrl: (finalAppObj as any).attachmentUrl || '',
            })
          })
        });
        await refetchApplications();
      } catch (err) {
        console.error('Failed to sync updated workflow via API:', err);
      }
    }
  };

  // 申請の削除処理
  const handleDeleteApplication = async (applicationId: string) => {
    console.log(`[DELETE WORKFLOW] 削除処理が開始されました。ID: ${applicationId}`);
    try {
      let deletedIds: string[] = [];
      const stored = localStorage.getItem('deleted_workflow_ids');
      if (stored) {
        deletedIds = JSON.parse(stored);
      }
      if (!deletedIds.includes(applicationId)) {
        deletedIds.push(applicationId);
        localStorage.setItem('deleted_workflow_ids', JSON.stringify(deletedIds));
      }
    } catch (_) {}

    setApplications(prevApps => prevApps.filter(app => app.id !== applicationId));

    if (applicationId.startsWith('a-temp-')) {
      console.log(`[DELETE WORKFLOW] 一時的なローカルIDのため、API送信をスキップします: ${applicationId}`);
      return;
    }

    let deleteSuccess = false;

    // 1. 標準的な HTTP DELETE による削除の試行
    const deleteUrl = `${API_BASE_URL}/workflows/${applicationId}`;
    console.log(`[DELETE WORKFLOW] ①標準HTTP DELETEリクエストを送信します。URL: ${deleteUrl}`);
    try {
      const response = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          'Accept': 'application/json'
        }
      });
      console.log(`[DELETE WORKFLOW] ①DELETEレスポンスステータス: ${response.status}`);
      if (response.ok) {
        deleteSuccess = true;
        console.log(`[DELETE WORKFLOW] ①標準DELETEによる削除に成功しました。`);
      } else {
        console.warn(`[DELETE WORKFLOW] ①標準DELETEがステータス ${response.status} で失敗しました。リバースプロキシのメソッド制限を考慮し、フォールバックPOSTを実行します。`);
      }
    } catch (err) {
      console.warn('[DELETE WORKFLOW] ①標準DELETEでネットワークエラーが発生しました:', err, '。フォールバックPOSTを試行します。');
    }

    // 2. リバースプロキシ制限対策としての POST /workflows/:id/delete によるフォールバック
    if (!deleteSuccess) {
      const postDeleteUrl = `${API_BASE_URL}/workflows/${applicationId}/delete`;
      console.log(`[DELETE WORKFLOW] ②フォールバックPOSTリクエストを送信します。URL: ${postDeleteUrl}`);
      try {
        const response = await fetch(postDeleteUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          }
        });
        console.log(`[DELETE WORKFLOW] ②POSTレスポンスステータス: ${response.status}`);
        if (response.ok) {
          deleteSuccess = true;
          console.log(`[DELETE WORKFLOW] ②フォールバックPOSTによる削除に成功しました。`);
        } else {
          console.error(`[DELETE WORKFLOW] ②標準DELETEおよびフォールバックPOSTの両方の削除リクエストが失敗しました。`);
        }
      } catch (err) {
        console.error('[DELETE WORKFLOW] ②フォールバックPOST送信中にエラーが発生しました:', err);
      }
    }

    if (deleteSuccess) {
      await refetchApplications();
    }
  };

  const handleDeleteChatRoom = async (roomId: string) => {
    try {
      let deletedIds: string[] = [];
      const stored = localStorage.getItem('deleted_chat_room_ids');
      if (stored) deletedIds = JSON.parse(stored);
      if (!deletedIds.includes(roomId)) {
        deletedIds.push(roomId);
        localStorage.setItem('deleted_chat_room_ids', JSON.stringify(deletedIds));
      }
    } catch (_) {}

    setChatRooms(prevRooms => prevRooms.filter(room => room.id !== roomId));
    try {
      await fetch(`${API_BASE_URL}/chats/${roomId}`, {
        method: 'DELETE'
      });
      await refetchChatRooms();
    } catch (err) {
      console.error('Failed to delete chat room via API:', err);
    }
  };

  const handleDeleteChatMessage = async (roomId: string, messageId: string) => {
    setChatRooms(prevRooms => prevRooms.map(room => {
      if (room.id === roomId) {
        return {
          ...room,
          messages: (room.messages || []).filter(msg => msg.id !== messageId)
        };
      }
      return room;
    }));

    try {
      await fetch(`${API_BASE_URL}/chats/messages/${messageId}`, {
        method: 'DELETE'
      });
      await refetchChatRooms();
    } catch (err) {
      console.error('Failed to delete chat message via API:', err);
    }
  };

  const handleDeleteMemo = async (memoId: string) => {
    try {
      let deletedIds: string[] = [];
      const stored = localStorage.getItem('deleted_memo_ids');
      if (stored) deletedIds = JSON.parse(stored);
      if (!deletedIds.includes(memoId)) {
        deletedIds.push(memoId);
        localStorage.setItem('deleted_memo_ids', JSON.stringify(deletedIds));
      }
    } catch (_) {}

    setMemos(prevMemos => prevMemos.filter(memo => memo.id !== memoId));
    try {
      await fetch(`${API_BASE_URL}/memos/${memoId}`, {
        method: 'DELETE'
      });
      await refetchMemos();
    } catch (err) {
      console.error('Failed to delete memo via API:', err);
    }
  };

  const handleUpdateRooms = async (updatedRooms: ChatRoom[]) => {
    const prevRooms = [...chatRooms];
    setChatRooms(updatedRooms);

    try {
      // 変更があったチャットルーム（メッセージ追加、または参加者変更）を検知して同期
      for (const updatedRoom of updatedRooms) {
        const originalRoom = prevRooms.find(r => r.id === updatedRoom.id);
        
        const isParticipantsChanged = !originalRoom || 
          JSON.stringify(originalRoom.participants) !== JSON.stringify(updatedRoom.participants) ||
          JSON.stringify(originalRoom.adminIds) !== JSON.stringify(updatedRoom.adminIds) ||
          originalRoom.name !== updatedRoom.name;
        
        const originalMsgs = originalRoom?.messages || [];
        const updatedMsgs = updatedRoom.messages || [];
        const isMessagesChanged = originalMsgs.length !== updatedMsgs.length;

        if (isParticipantsChanged || isMessagesChanged) {
          // 1. チャットルーム情報（参加者、既読ステータスなど）を PUT で更新
          await fetch(`${API_BASE_URL}/chats/${updatedRoom.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              name: updatedRoom.name,
              participants: updatedRoom.participants || [],
              adminIds: updatedRoom.adminIds || [],
              readStatus: updatedRoom.readStatus || {},
              messages: updatedMsgs
            })
          });

          // 2. 新着メッセージがあれば POST で同期
          if (isMessagesChanged && updatedMsgs.length > 0) {
            const lastMsg = updatedMsgs[updatedMsgs.length - 1];
            const isNewMsg = originalMsgs.length === 0 || !originalMsgs.some(m => m.id === lastMsg.id);
            if (isNewMsg) {
              const payload = {
                roomId: updatedRoom.id,
                senderId: lastMsg.sender.id,
                message: lastMsg.content,
                content: lastMsg.content,
                createdAt: lastMsg.createdAt,
                roomName: updatedRoom.name,
                roomType: updatedRoom.type,
                participants: updatedRoom.participants,
                type: lastMsg.type || 'text',
                imageUrl: lastMsg.imageUrl || null,
                stampId: lastMsg.stampId || null,
                stampText: lastMsg.stampText || null,
                stampCategory: lastMsg.stampCategory || null,
                attachments: lastMsg.attachments || []
              };
              let response = await fetch(`${API_BASE_URL}/chats`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
              });
              if (!response.ok) {
                await fetch(`${API_BASE_URL}/chats/message`, {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(payload)
                });
              }
            }
          }
        }
      }
      await refetchChatRooms();
    } catch (err) {
      console.warn('Failed to sync chat message via API:', err);
    }
  };

  const handleUpdateChatRooms = async (updatedRooms: ChatRoom[]) => {
    try {
      for (const room of updatedRooms) {
        await fetch(`${API_BASE_URL}/chats/${room.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: room.name,
            participants: room.participants || [],
            adminIds: room.adminIds || [],
            readStatus: room.readStatus || {},
            messages: room.messages || []
          })
        });
      }
      await refetchChatRooms();
    } catch (err) {
      console.warn('Failed to update chat room read status via API:', err);
      setChatRooms(updatedRooms);
    } finally {
      window.dispatchEvent(new CustomEvent('notifications_updated'));
    }
  };

  const handleUpdateMemos = async (updatedMemos: any[]) => {
    // 1. 楽観的UIアップデート: まずstateを即時更新してユーザー体験を高速化する
    setMemos(updatedMemos);
    window.dispatchEvent(new CustomEvent('notifications_updated'));

    try {
      // 変更があったメモ、または新規メモのみを抽出してAPIリクエストを投げる
      const changedMemos = updatedMemos.filter(updatedMemo => {
        const originalMemo = memos.find(m => m.id === updatedMemo.id);
        if (!originalMemo) return true; // 新規メモ

        // status または recipientStatuses の中身に変更があるか判定
        const isStatusChanged = originalMemo.status !== updatedMemo.status;
        const isRecipientStatusesChanged = JSON.stringify(originalMemo.recipientStatuses) !== JSON.stringify(updatedMemo.recipientStatuses);
        
        return isStatusChanged || isRecipientStatusesChanged;
      });

      // 変更がなければ即終了
      if (changedMemos.length === 0) {
        return;
      }

      const existingIds = new Set(memos.map(m => m.id));

      // 変更されたメモのみに対してAPIリクエストをPromise.allで並列実行
      await Promise.all(
        changedMemos.map(async (memo) => {
          const recipientStatusesJsonStr = JSON.stringify(memo.recipientStatuses);
          if (!existingIds.has(memo.id)) {
            // 新規メモ作成
            await fetch(`${API_BASE_URL}/memos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: memo.id,
                senderId: userState.id,
                receiverId: memo.toUserId || memo.toUser?.id || 'u1',
                fromName: memo.fromName,
                fromCompany: memo.fromCompany,
                fromPhone: memo.fromPhone,
                content: memo.content,
                requirementType: memo.requirementType || 'phone_called',
                requirementText: memo.requirementText || '',
                recipientStatusesJson: recipientStatusesJsonStr,
                recipient_statuses_json: recipientStatusesJsonStr,
                recipientStatuses: recipientStatusesJsonStr,
                details: {
                  requirementType: memo.requirementType,
                  requirementText: memo.requirementText,
                  targetOffices: memo.targetOffices,
                  targetDivisions: memo.targetDivisions,
                  recipientStatuses: memo.recipientStatuses,
                },
                isRead: (memo.status === 'handled' || memo.status === 'read') ? 1 : 0,
                status: memo.status,
                createdAt: memo.createdAt || new Date().toISOString()
              })
            });
          } else {
            // 既存メモの更新（既読・対応フラグ等）
            await fetch(`${API_BASE_URL}/memos/${memo.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                isRead: (memo.status === 'handled' || memo.status === 'read') ? 1 : 0,
                status: memo.status,
                recipientStatusesJson: recipientStatusesJsonStr,
                recipient_statuses_json: recipientStatusesJsonStr,
                recipientStatuses: recipientStatusesJsonStr,
                details: {
                  requirementType: memo.requirementType,
                  requirementText: memo.requirementText,
                  targetOffices: memo.targetOffices,
                  targetDivisions: memo.targetDivisions,
                  recipientStatuses: memo.recipientStatuses,
                }
              })
            });
          }
        })
      );

      // バックグラウンドで最新データを同期
      await refetchMemos();
    } catch (err) {
      console.warn('Failed to sync memos via API:', err);
    } finally {
      window.dispatchEvent(new CustomEvent('notifications_updated'));
    }
  };

  const handleAddReport = async (reportData: {
    reportType?: any;
    date?: string;
    weekStartDate?: string;
    weekLabel?: string;
    department?: string;
    tasks: string;
    results: string;
    issues: string;
    ongoingProjects?: string;
    tomorrowPlan?: string;
    supervisorId?: string;
    status?: any;
  }) => {
    const tempId = `rep_${Date.now()}`;
    const targetSupervisor = reportData.supervisorId ? usersList.find(u => u.id === reportData.supervisorId) : undefined;
    const newReport: DailyReport = {
      id: tempId,
      author: userState,
      reportType: reportData.reportType || 'weekly',
      date: reportData.date || new Date().toISOString().split('T')[0],
      weekStartDate: reportData.weekStartDate,
      weekLabel: reportData.weekLabel,
      department: reportData.department || userState.department || '総務',
      tasks: reportData.tasks,
      results: reportData.results,
      issues: reportData.issues,
      ongoingProjects: reportData.ongoingProjects || '',
      tomorrowPlan: reportData.tomorrowPlan || '',
      supervisorId: reportData.supervisorId,
      supervisor: targetSupervisor,
      status: reportData.status || 'submitted',
      submittedAt: reportData.status === 'submitted' ? new Date().toISOString() : undefined,
      maintenanceData: (reportData as any).maintenanceData,
      constructionData: (reportData as any).constructionData,
      salesData: (reportData as any).salesData,
      createdAt: new Date().toISOString(),
    };
    setReports([newReport, ...reports]);

    // 週報・日報提出時のプッシュ通知送信 (下書き以外)
    if (newReport.status === 'submitted') {
      const typeLabel = newReport.reportType === 'weekly' ? '週報' : '日報';
      const dateLabel = newReport.reportType === 'weekly' ? (newReport.weekLabel || `${newReport.weekStartDate}週`) : newReport.date;
      
      // 上長が指定されている場合は上長宛、未指定の場合は同部署の承認者または管理者宛
      if (newReport.supervisorId && newReport.supervisorId !== userState.id) {
        triggerPushNotification({
          targetUserId: newReport.supervisorId,
          excludeUserId: userState.id,
          title: `📝 ${typeLabel}提出: ${userState.name}さん`,
          body: `${dateLabel}の${typeLabel}が提出されました。確認をお願いします。`,
          url: `/?tab=daily_report&reportId=${tempId}`,
          tag: `report-${tempId}`
        });
      } else {
        // 同部署の管理職/リーダーまたは全管理者に通知
        const approvers = usersList.filter(u => 
          u.id !== userState.id && 
          (u.role === 'admin' || (u.role as any) === 'manager' || (u.division === userState.division && ['課長', '部長', '所長', 'リーダー'].some(pos => u.position?.includes(pos))))
        );
        if (approvers.length > 0) {
          triggerPushNotification({
            targetUserIds: approvers.map(u => u.id),
            excludeUserId: userState.id,
            title: `📝 ${typeLabel}提出: ${userState.name}さん`,
            body: `${dateLabel}の${typeLabel}が提出されました。確認をお願いします。`,
            url: `/?tab=daily_report&reportId=${tempId}`,
            tag: `report-${tempId}`
          });
        }
      }
    }

    try {
      const payload = {
        id: tempId,
        authorId: userState.id,
        reportType: reportData.reportType || 'weekly',
        reportDate: reportData.date,
        date: reportData.date,
        weekStartDate: reportData.weekStartDate,
        weekLabel: reportData.weekLabel,
        department: reportData.department || userState.department || '総務',
        tasks: reportData.tasks,
        results: reportData.results,
        issues: reportData.issues,
        ongoingProjects: reportData.ongoingProjects,
        tomorrowPlan: reportData.tomorrowPlan,
        supervisorId: reportData.supervisorId,
        status: reportData.status || 'submitted',
        maintenanceData: (reportData as any).maintenanceData,
        constructionData: (reportData as any).constructionData,
        salesData: (reportData as any).salesData,
      };

      let response = await fetch(`${API_BASE_URL}/work-reports`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/daily-reports`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (response.ok) {
        await refetchReports();
      }
    } catch (err) {
      console.error('Failed to save report via API, keeping locally:', err);
    }
  };

  const handleUpdateReport = async (id: string, reportData: Partial<DailyReport>) => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, ...reportData } : r));
    try {
      const payload = {
        ...reportData,
        id,
        author_id: (reportData.author && reportData.author.id) || userState.id,
        supervisor_id: reportData.supervisorId || (reportData.supervisor && reportData.supervisor.id),
        week_start_date: reportData.weekStartDate,
        week_label: reportData.weekLabel,
        achievements: reportData.results !== undefined ? reportData.results : (reportData as any).achievements,
        continued_items: reportData.ongoingProjects !== undefined ? reportData.ongoingProjects : (reportData as any).continued_items,
        next_week_plans: reportData.tomorrowPlan !== undefined ? reportData.tomorrowPlan : (reportData as any).next_week_plans,
        maintenance_data: (reportData as any).maintenanceData !== undefined ? (reportData as any).maintenanceData : (reportData as any).maintenance_data,
        maintenanceData: (reportData as any).maintenanceData !== undefined ? (reportData as any).maintenanceData : (reportData as any).maintenance_data,
        construction_data: (reportData as any).constructionData !== undefined ? (reportData as any).constructionData : (reportData as any).construction_data,
        constructionData: (reportData as any).constructionData !== undefined ? (reportData as any).constructionData : (reportData as any).construction_data,
        sales_data: (reportData as any).salesData !== undefined ? (reportData as any).salesData : (reportData as any).sales_data,
        salesData: (reportData as any).salesData !== undefined ? (reportData as any).salesData : (reportData as any).sales_data,
      };
      let response = await fetch(`${API_BASE_URL}/work-reports/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/daily-reports/${id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }
      if (response.ok) {
        await refetchReports();
      }
    } catch (err) {
      console.error('Failed to update report via API:', err);
    }
  };

  const handleReviewReport = async (id: string, feedbackComment?: string) => {
    const targetReport = reports.find(r => r.id === id);
    setReports(prev => prev.map(r => r.id === id ? { ...r, status: 'reviewed', feedbackComment, reviewedAt: new Date().toISOString() } : r));

    // 作成者宛に確認・フィードバック完了のプッシュ通知を送信
    if (targetReport && targetReport.author && targetReport.author.id !== userState.id) {
      const typeLabel = targetReport.reportType === 'weekly' ? '週報' : '日報';
      const dateLabel = targetReport.reportType === 'weekly' ? (targetReport.weekLabel || `${targetReport.weekStartDate}週`) : targetReport.date;
      triggerPushNotification({
        targetUserId: targetReport.author.id,
        excludeUserId: userState.id,
        title: `✍️ ${typeLabel}確認完了: ${userState.name}さん`,
        body: `${userState.name}さんが${dateLabel}の${typeLabel}を確認しました。${feedbackComment ? `「${feedbackComment.slice(0, 40)}」` : ''}`,
        url: `/?tab=daily_report&reportId=${id}`,
        tag: `report-rev-${id}`
      });
    }

    try {
      let response = await fetch(`${API_BASE_URL}/work-reports/${id}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ feedbackComment })
      });
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/daily-reports/${id}/review`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ feedbackComment })
        });
      }
      if (response.ok) {
        await refetchReports();
      }
    } catch (err) {
      console.error('Failed to review report via API:', err);
    }
  };

  const handleDeleteReport = async (id: string) => {
    setReports(prev => prev.filter(r => r.id !== id));
    try {
      const stored = localStorage.getItem('deleted_report_ids');
      const list = stored ? JSON.parse(stored) : [];
      if (!list.includes(id)) {
        list.push(id);
        localStorage.setItem('deleted_report_ids', JSON.stringify(list));
      }
    } catch (_) {}

    try {
      let response = await fetch(`${API_BASE_URL}/work-reports/${id}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/daily-reports/${id}`, {
          method: 'DELETE'
        });
      }
      if (!response.ok) {
        response = await fetch(`${API_BASE_URL}/reports/${id}`, {
          method: 'DELETE'
        });
      }
      if (response.ok) {
        await refetchReports();
      }
    } catch (err) {
      console.error('Failed to delete report via API:', err);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-x-hidden" style={{ backgroundColor: '#f8fafc' }}>
      <InstallPwaPrompt />
      <Header 
        searchQuery={searchQuery} 
        onSearchChange={setSearchQuery} 
        currentUser={userState}
        allUsers={usersList}
        onSwitchUser={handleSwitchUser}
        onLogout={handleLogout}
        memos={memos}
        applications={applications}
        topics={topics}
        events={events}
        chatRooms={chatRooms}
        reports={reports}
        posts={posts}
        onSelectTab={setActiveTab}
        onOpenSettings={handleOpenPersonalSettings}
        onNavigateToContent={handleNavigateToContent}
        onUpdateMemos={handleUpdateMemos}
        onUpdateTopic={handleUpdateTopic}
        onUpdateEvent={handleUpdateEvent}
        onUpdateRooms={handleUpdateChatRooms}
        onToggleMobileMenu={() => setIsMobileMenuOpen(prev => !prev)}
      />

      {/* Mobile Navigation Drawer */}
      {isMobileMenuOpen && (
        <div className="fixed inset-0 z-50 lg:hidden">
          {/* Dark Backdrop */}
          <div
            className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs transition-opacity"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          {/* Drawer Content */}
          <div className="fixed inset-y-0 left-0 w-72 max-w-[85vw] bg-white z-50 p-4 overflow-y-auto shadow-2xl flex flex-col gap-4 animate-in slide-in-from-left duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div
                onClick={() => {
                  setActiveTab('mypage');
                  setIsMobileMenuOpen(false);
                }}
                className="flex items-center gap-2 cursor-pointer select-none hover:opacity-90 transition-opacity"
                title="マイページへ"
              >
                <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-xs">
                  <span className="text-white font-bold text-lg leading-none">T</span>
                </div>
                <span className="text-lg font-bold tracking-tight text-slate-800">
                  TERANAGO<span className="text-indigo-600">SNS</span>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsMobileMenuOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                title="閉じる"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <Sidebar
              posts={posts}
              selectedTag={selectedTag}
              onSelectTag={(tag) => {
                setSelectedTag(tag);
                setIsMobileMenuOpen(false);
              }}
              activeTab={activeTab}
              onChangeTab={(tab) => {
                setActiveTab(tab);
                setIsMobileMenuOpen(false);
              }}
              currentUser={userState}
              className="bg-white flex flex-col gap-6"
            />
          </div>
        </div>
      )}

      {Object.keys(fetchErrors).length > 0 && (
        <div className="bg-rose-50 border-b border-rose-200 py-3 px-4 text-rose-800 text-sm">
          <div className="w-full px-4 sm:px-6 lg:px-8 flex items-start justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-semibold text-rose-900">データ同期エラー ({Object.keys(fetchErrors).length}件):</span>
                <p className="text-xs text-rose-700 mt-0.5">
                  データの取得に失敗しました。APIサーバーまたはデータベースの接続状態を確認してください。
                </p>
                <ul className="list-disc list-inside mt-1.5 text-xs text-rose-700 space-y-0.5">
                  {Object.entries(fetchErrors).map(([key, msg]) => (
                    <li key={key}><span className="font-medium text-rose-800">{key}:</span> {msg}</li>
                  ))}
                </ul>
              </div>
            </div>
            <button 
              onClick={() => { setFetchErrors({}); refetchAll(); }}
              className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-md text-xs font-medium transition shrink-0 flex items-center gap-1.5 shadow-sm"
            >
              <RefreshCw className="w-3.5 h-3.5" />
              再試行
            </button>
          </div>
        </div>
      )}

      <main className={`w-full ${activeTab === 'chat' || activeTab === 'calendar' ? 'px-2 py-2 sm:px-6 lg:px-8 sm:py-6' : 'px-4 sm:px-6 lg:px-8 py-6'} flex flex-col lg:flex-row gap-6 transition-all duration-300`}>
        
        {/* Left Sidebar Column / Restore Button */}
        {!isSidebarCollapsed ? (
          <aside className="hidden lg:block lg:w-64 shrink-0 transition-all duration-300">
            <Sidebar
              posts={posts}
              selectedTag={selectedTag}
              onSelectTag={setSelectedTag}
              activeTab={activeTab}
              onChangeTab={setActiveTab}
              currentUser={userState}
              onCollapse={() => handleToggleSidebarCollapse(true)}
            />
          </aside>
        ) : (
          <div className="hidden lg:block shrink-0 transition-all duration-300">
            <button
              type="button"
              onClick={() => handleToggleSidebarCollapse(false)}
              className="sticky top-24 p-2.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-500 hover:text-slate-700 rounded-xl shadow-xs hover:shadow-sm transition-all duration-200 flex items-center justify-center group cursor-pointer"
              title="メニューを表示"
            >
              <svg className="w-4 h-4 fill-current text-indigo-600 group-hover:scale-110 transition-transform" viewBox="0 0 24 24">
                <path d="M10 17l5-5-5-5v10z" />
              </svg>
            </button>
          </div>
        )}

        {/* Main Content Area */}
        {activeTab === 'timeline' && (
          <Timeline 
            posts={posts}
            events={events}
            topics={topics}
            offices={offices}
            divisions={divisions}
            searchQuery={searchQuery}
            selectedTag={selectedTag}
            onPost={handlePost}
            onToggleLike={handleToggleLike}
            onSelectTag={setSelectedTag}
            onChangeTab={setActiveTab}
            isLoading={isPostsLoading}
            error={postsError}
            onRefetchPosts={refetchAll}
            onDeletePost={handleDeletePost}
            currentUser={userState}
          />
        )}
        {activeTab === 'calendar' && (
          <Calendar 
            events={events}
            onAddEvent={handleAddEvent}
            onUpdateEvent={handleUpdateEvent}
            onDeleteEvent={handleDeleteEvent}
            currentUser={userState}
            allUsers={usersList}
            offices={offices}
            divisions={divisions}
            initialEventId={targetEventId}
            initialOffice={calendarParams.office}
            initialDivision={calendarParams.division}
            initialMode={calendarParams.mode}
            initialView={calendarParams.view}
            initialDate={calendarParams.date}
            initialTypeFilter={calendarParams.type}
            memos={memos}
            onUpdateMemos={handleUpdateMemos}
            onRefetchEvents={refetchEvents}
            onNavigateToInspectionScheduler={() => setActiveTab('inspection_scheduler')}
          />
        )}
        {activeTab === 'inspection_scheduler' && (
          <InspectionScheduler
            allUsers={usersList}
            currentUser={userState}
            onAddEvents={(newEvents) => {
              newEvents.forEach((evt) => {
                const { id, ...eventData } = evt;
                handleAddEvent(eventData);
              });
            }}
            onNavigateToCalendar={() => setActiveTab('calendar')}
          />
        )}
        {activeTab === 'workflow' && (
          <Workflow 
            applications={applications}
            onAddApplication={handleAddApplication}
            onUpdateApplication={handleUpdateApplication}
            onDeleteApplication={handleDeleteApplication}
            allUsers={usersList}
            currentUser={userState}
            approvalFlows={approvalFlows}
            onWorkflowAction={handleWorkflowAction}
            itemMasters={itemMasters}
            initialAppId={targetApplicationId}
          />
        )}
        {activeTab === 'board' && (
          <Board
            topics={topics}
            onAddTopic={handleAddTopic}
            onUpdateTopic={handleUpdateTopic}
            onDeleteTopic={handleDeleteTopic}
            currentUser={userState}
            offices={offices}
            divisions={divisions}
            initialTopicId={targetTopicId}
          />
        )}
        {activeTab === 'chat' && (
          <Chat 
            rooms={chatRooms} 
            users={usersList}
            currentUser={userState}
            offices={offices}
            divisions={divisions}
            onUpdateRooms={handleUpdateRooms}
            onDeleteRoom={handleDeleteChatRoom}
            onDeleteMessage={handleDeleteChatMessage}
            initialRoomId={targetChatRoomId}
            refetchRooms={refetchChatRooms}
          />
        )}
        {activeTab === 'memo' && (
          <MemoList 
            memos={memos}
            offices={offices}
            divisions={divisions}
            users={usersList}
            currentUser={userState}
            onUpdateMemos={handleUpdateMemos}
            onDeleteMemo={handleDeleteMemo}
            initialMemoId={targetMemoId}
            initialOpenCreate={autoOpenCreateMemo}
            onCloseCreateModal={() => setAutoOpenCreateMemo(false)}
          />
        )}
        {activeTab === 'daily_report' && (
          <DailyReportView 
            reports={reports} 
            onAddReport={handleAddReport}
            onUpdateReport={handleUpdateReport}
            onReviewReport={handleReviewReport}
            onDeleteReport={handleDeleteReport}
            currentUser={userState}
            allUsers={usersList}
            divisions={divisions}
            refetchReports={refetchReports}
            calendarEvents={events}
            initialReportId={targetReportId}
          />
        )}
        {activeTab === 'files' && (
          <FileManager 
            currentUser={userState}
          />
        )}
        {activeTab === 'mypage' && (
          <MyPage 
            user={userState} 
            events={events}
            topics={topics}
            memos={memos}
            applications={applications}
            chatRooms={chatRooms}
            reports={reports}
            offices={offices}
            divisions={divisions}
            positions={positions}
            allUsers={usersList}
            onChangeTab={setActiveTab}
            onNavigateToContent={handleNavigateToContent}
            onUpdateUser={handleUpdateUser}
            onUpdateMemo={handleUpdateMemos}
            onUpdateTopic={handleUpdateTopic}
            onUpdateApplication={(updatedApp) => {
              if (updatedApp.status === 'approved' || updatedApp.status === 'rejected') {
                handleWorkflowAction(updatedApp.id, updatedApp.status);
              } else {
                setApplications(applications.map(a => a.id === updatedApp.id ? updatedApp : a));
              }
            }}
            onLogout={handleLogout}
            autoOpenSettings={autoOpenSettings}
            onCloseSettings={() => setAutoOpenSettings(false)}
            onAddEvent={handleAddEvent}
            onUpdateEvent={handleUpdateEvent}
            onDeleteEvent={handleDeleteEvent}
            onAddTopic={handleAddTopic}
            onAddApplication={handleAddApplication}
            approvalFlows={approvalFlows}
            itemMasters={itemMasters}
          />
        )}
        {activeTab === 'admin' && (
          <AdminPanel 
            currentUser={userState}
            allUsers={usersList}
            offices={offices}
            divisions={divisions}
            positions={positions}
            approvalFlows={approvalFlows}
            itemMasters={itemMasters}
            applications={applications}
            onDeleteApplication={handleDeleteApplication}
            onAddOffice={handleAddOffice}
            onUpdateOffice={handleUpdateOffice}
            onDeleteOffice={handleDeleteOffice}
            onAddDivision={handleAddDivision}
            onUpdateDivision={handleUpdateDivision}
            onDeleteDivision={handleDeleteDivision}
            onAddPosition={handleAddPosition}
            onUpdatePosition={handleUpdatePosition}
            onDeletePosition={handleDeletePosition}
            onAddUser={handleAddUser}
            onUpdateUser={handleUpdateUser}
            onDeleteUser={handleDeleteUser}
            onToggleUserAdmin={handleToggleUserAdmin}
            onSwitchUser={handleSwitchUser}
            onAddApprovalFlow={handleAddApprovalFlow}
            onUpdateApprovalFlow={handleUpdateApprovalFlow}
            onDeleteApprovalFlow={handleDeleteApprovalFlow}
            onAddItemMaster={handleAddItemMaster}
            onUpdateItemMaster={handleUpdateItemMaster}
            onDeleteItemMaster={handleDeleteItemMaster}
          />
        )}
      </main>

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      {/* グローバル詳細ポップアップ */}
      {globalSelectedEvent && (
        <GlobalEventDetailModal
          isOpen={!!globalSelectedEvent}
          event={globalSelectedEvent}
          onClose={() => setGlobalSelectedEvent(null)}
          onEditInCalendar={(eventId) => {
            // カレンダータブへ遷移して指定イベントを展開
            setActiveTab('calendar');
            setTargetEventId(eventId);
          }}
        />
      )}

      {globalSelectedTopic && (
        <TopicDetailModal
          isOpen={!!globalSelectedTopic}
          topic={globalSelectedTopic}
          currentUser={userState}
          onClose={() => setGlobalSelectedTopic(null)}
          onUpdateTopic={(updated) => {
            setGlobalSelectedTopic(updated);
            handleUpdateTopic(updated);
          }}
          offices={offices}
          divisions={divisions}
        />
      )}

      {globalSelectedMemo && (
        <GlobalMemoDetailModal
          isOpen={!!globalSelectedMemo}
          memo={globalSelectedMemo}
          currentUser={userState}
          onClose={() => setGlobalSelectedMemo(null)}
          onToggleStatus={(memoId) => {
            // メモの未読/対応トグル処理
            const updated = memos.map((m) => {
              if (m.id === memoId) {
                const currentlyUnread = isMemoUnread(m, userState, []);
                const nowIso = new Date().toISOString();

                // キャッシュ同期
                if (currentlyUnread) {
                  markMemoAsRead(userState.id, memoId);
                } else {
                  markMemoAsUnread(userState.id, memoId);
                }

                const statuses = m.recipientStatuses || [];
                const nextRecipientStatuses = statuses.length > 0
                  ? statuses.map((st) => {
                      if (st.userId === userState.id) {
                        const nextHandled = currentlyUnread; // 未読なら対応完了(true)、対応完了なら未対応(false)
                        return {
                          ...st,
                          isViewed: nextHandled ? true : false,
                          viewedAt: nextHandled ? (st.viewedAt || nowIso) : undefined,
                          isHandled: nextHandled,
                          handledAt: nextHandled ? nowIso : undefined,
                          handledByUserId: nextHandled ? userState.id : undefined,
                          handledByUserName: nextHandled ? userState.name : undefined,
                          status: nextHandled ? ('handled' as const) : ('unread' as const),
                        };
                      }
                      return st;
                    })
                  : [
                      {
                        userId: userState.id,
                        userName: userState.name || '',
                        avatarUrl: userState.avatarUrl || '',
                        department: userState.department || '',
                        office: userState.office || '',
                        division: userState.division || '',
                        isViewed: currentlyUnread,
                        viewedAt: currentlyUnread ? nowIso : undefined,
                        isHandled: currentlyUnread,
                        handledAt: currentlyUnread ? nowIso : undefined,
                        handledByUserId: currentlyUnread ? userState.id : undefined,
                        handledByUserName: currentlyUnread ? userState.name : undefined,
                        status: currentlyUnread ? ('handled' as const) : ('unread' as const),
                      }
                    ];

                // 全員が対応完了しているかチェック
                const allHandled = nextRecipientStatuses.length > 0 && nextRecipientStatuses.every((s) => s.isHandled);
                const nextOverallStatus = allHandled ? ('handled' as const) : ('unread' as const);

                return {
                  ...m,
                  status: nextOverallStatus,
                  recipientStatuses: nextRecipientStatuses,
                };
              }
              return m;
            });
            handleUpdateMemos(updated);
            
            // ポップアップ側の状態も更新
            const updatedMemo = updated.find(m => m.id === memoId);
            if (updatedMemo) {
              setGlobalSelectedMemo(updatedMemo);
            }
          }}
        />
      )}

      {/* グローバル日報・週報詳細モーダル */}
      {globalSelectedReport && (
        <GlobalReportDetailModal
          report={globalSelectedReport}
          currentUser={userState}
          allUsers={usersList}
          onClose={() => setGlobalSelectedReport(null)}
          onReviewReport={async (id, comment) => {
            await handleReviewReport(id, comment);
            setGlobalSelectedReport(prev => prev && prev.id === id ? { ...prev, status: 'reviewed', feedbackComment: comment, reviewedAt: new Date().toISOString() } : prev);
          }}
          onNavigateToEdit={(reportId) => {
            setActiveTab('daily_report');
            setTargetReportId(reportId);
          }}
          onOpenFullTab={(reportId) => {
            setActiveTab('daily_report');
            setTargetReportId(reportId);
          }}
        />
      )}
    </div>
  );
}
