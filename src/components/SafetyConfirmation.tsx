import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  Send,
  AlertTriangle,
  Users,
  CheckCircle2,
  Clock,
  RefreshCw,
  Search,
  Filter,
  Lock,
  Mail,
  Smartphone,
  Bell,
  Building2,
  Layers,
  ChevronRight,
  Download,
  AlertOctagon,
  HeartHandshake,
  Home,
  Check,
  X,
  Eye,
  EyeOff,
  Radio,
  FileSpreadsheet,
  Info,
  UserCheck,
  ShieldCheck,
  PhoneCall,
  UserX,
  Sparkles,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Trash2
} from 'lucide-react';
import { User, OfficeMaster, DivisionMaster, DisasterType } from '../types';
import { API_BASE_URL } from '../config/api';

export interface SafetyConfirmationEvent {
  id: string;
  title: string;
  disasterType: DisasterType;
  level?: string;
  message: string;
  targetScope: 'all' | 'offices' | 'divisions' | 'custom';
  targetOffices?: string[];
  targetDivisions?: string[];
  targetUserIds?: string[];
  channels: {
    webPush: boolean;
    companyEmail: boolean;
    personalEmail: boolean;
  };
  isTest: boolean;
  status: 'active' | 'closed' | 'archived';
  createdAt: string;
  closedAt?: string;
  createdById: string;
  createdByName: string;
  totalTargetsCount?: number;
  responseCount?: number;
  stats?: {
    total: number;
    responded: number;
    safe: number;
    minorInjured: number;
    severeInjured: number;
    needRescue: number;
    canWork: number;
    workFromHome: number;
    cannotWork: number;
  };
}

export interface SafetyConfirmationResponse {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  office?: string;
  division?: string;
  safetyStatus: 'safe' | 'minor_injury' | 'severe_injury' | 'need_rescue';
  familyStatus?: 'all_safe' | 'injured' | 'unreachable' | 'none';
  houseStatus?: 'no_damage' | 'partial_damage' | 'severe_damage' | 'evacuated';
  workAvailability: 'available' | 'remote_only' | 'unavailable' | 'undecided';
  locationStatus?: string;
  message?: string;
  respondedAt: string;
  updatedAt?: string;
}

interface SafetyConfirmationProps {
  currentUser: User;
  allUsers: User[];
  offices: OfficeMaster[];
  divisions: DivisionMaster[];
  initialEventId?: string;
  initialTab?: 'dashboard' | 'targets' | 'trigger' | 'respond';
  onOpenConfirmModal?: (options: {
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    isDangerous?: boolean;
    onConfirm: () => void;
  }) => void;
}

export const SafetyConfirmation: React.FC<SafetyConfirmationProps> = ({
  currentUser,
  allUsers = [],
  offices = [],
  divisions = [],
  initialEventId,
  initialTab,
  onOpenConfirmModal,
}) => {
  const isAdmin = currentUser.role === 'admin' || currentUser.isAdmin === true || (currentUser as any).id === 'u1';

  // Tabs: 'dashboard' (発動中・集計), 'targets' (対象者一覧・登録状況), 'trigger' (安否確認発動), 'respond' (安否回答)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'targets' | 'trigger' | 'respond'>(
    initialTab || (initialEventId ? 'respond' : (!isAdmin ? 'respond' : 'dashboard'))
  );

  // Events & responses state
  const [events, setEvents] = useState<SafetyConfirmationEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(initialEventId || null);
  const [responses, setResponses] = useState<SafetyConfirmationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [isGettingLocation, setIsGettingLocation] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Trigger Form State
  const [disasterType, setDisasterType] = useState<DisasterType>('earthquake');
  const [triggerTitle, setTriggerTitle] = useState('【安否確認】地震発生に伴う安否状況確認');
  const [triggerLevel, setTriggerLevel] = useState('震度5強以上');
  const [triggerMessage, setTriggerMessage] = useState(
    '地震が発生しました。自身の安全を最優先に確保した上で、現在の安否状況・出社可否について回答をお願いします。'
  );
  const [targetScope, setTargetScope] = useState<'all' | 'offices' | 'divisions'>('all');
  const [selectedOffices, setSelectedOffices] = useState<string[]>([]);
  const [selectedDivisions, setSelectedDivisions] = useState<string[]>([]);
  const [useWebPush, setUseWebPush] = useState(true);
  const [useCompanyEmail, setUseCompanyEmail] = useState(true);
  const [usePersonalEmail, setUsePersonalEmail] = useState(true);
  const [isTestMode, setIsTestMode] = useState(false);

  // Response Form State (for current user)
  const [mySafetyStatus, setMySafetyStatus] = useState<'safe' | 'minor_injury' | 'severe_injury' | 'need_rescue'>('safe');
  const [myFamilyStatus, setMyFamilyStatus] = useState<'all_safe' | 'injured' | 'unreachable' | 'none'>('all_safe');
  const [myHouseStatus, setMyHouseStatus] = useState<'no_damage' | 'partial_damage' | 'severe_damage' | 'evacuated'>('no_damage');
  const [myWorkAvailability, setMyWorkAvailability] = useState<'available' | 'remote_only' | 'unavailable' | 'undecided'>('available');
  const [myLocation, setMyLocation] = useState('自宅');
  const [myComment, setMyComment] = useState('');
  const [isSubmittingResponse, setIsSubmittingResponse] = useState(false);

  // Test Email State in trigger
  const [testingSend, setTestingSend] = useState(false);
  const [testEmailDestination, setTestEmailDestination] = useState(currentUser?.email || currentUser?.mobileEmail || '');
  const [showTestEmailInput, setShowTestEmailInput] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; isSimulated?: boolean } | null>(null);

  // Filter in Dashboard
  const [statusFilter, setStatusFilter] = useState<'all' | 'safe' | 'unanswered' | 'danger'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedOfficeFilter, setSelectedOfficeFilter] = useState('all');

  // Filter & Sort in Targets Roster (対象者一覧タブ)
  const [targetSearchKeyword, setTargetSearchKeyword] = useState('');
  const [targetOfficeFilter, setTargetOfficeFilter] = useState('all');
  const [targetDivisionFilter, setTargetDivisionFilter] = useState('all');
  const [targetRegistrationFilter, setTargetRegistrationFilter] = useState<'all' | 'both' | 'personalOnly' | 'mobileOnly' | 'none'>('all');
  const [targetSortField, setTargetSortField] = useState<'name' | 'office' | 'division' | 'mobileEmail' | 'personalEmail' | 'status'>('name');
  const [targetSortOrder, setTargetSortOrder] = useState<'asc' | 'desc'>('asc');

  // 対象者選択 & 個人メール登録依頼 State
  const [selectedTargetUserIds, setSelectedTargetUserIds] = useState<string[]>([]);
  const [isRequestModalOpen, setIsRequestModalOpen] = useState(false);
  const [requestCustomMessage, setRequestCustomMessage] = useState('');
  const [requestSendCompany, setRequestSendCompany] = useState(true);
  const [requestSendMobile, setRequestSendMobile] = useState(true);
  const [isSendingRequest, setIsSendingRequest] = useState(false);
  const [requestResultModal, setRequestResultModal] = useState<{ open: boolean; success: boolean; message: string; details?: any } | null>(null);

  // Toggle sort handler
  const handleToggleTargetSort = (field: 'name' | 'office' | 'division' | 'mobileEmail' | 'personalEmail' | 'status') => {
    if (targetSortField === field) {
      setTargetSortOrder(prev => prev === 'asc' ? 'desc' : 'asc');
    } else {
      setTargetSortField(field);
      setTargetSortOrder('asc');
    }
  };

  // Load events on mount
  useEffect(() => {
    fetchEvents();
  }, []);

  // Quick 1-tap Answer Presets
  const applyQuickPreset = (preset: 'safe' | 'remote' | 'injured' | 'rescue') => {
    if (preset === 'safe') {
      setMySafetyStatus('safe');
      setMyFamilyStatus('all_safe');
      setMyHouseStatus('no_damage');
      setMyWorkAvailability('available');
      setMyLocation(prev => prev && prev !== '自宅' ? prev : '自宅');
      setMyComment('本人・家族ともに無事です。通常通り出社・業務可能です。');
    } else if (preset === 'remote') {
      setMySafetyStatus('safe');
      setMyFamilyStatus('all_safe');
      setMyHouseStatus('partial_damage');
      setMyWorkAvailability('remote_only');
      setMyLocation(prev => prev && prev !== '自宅' ? prev : '自宅');
      setMyComment('本人は無事ですが、交通機関の乱れまたは周辺状況のため在宅勤務にて対応します。');
    } else if (preset === 'injured') {
      setMySafetyStatus('minor_injury');
      setMyFamilyStatus('injured');
      setMyHouseStatus('partial_damage');
      setMyWorkAvailability('undecided');
      setMyLocation(prev => prev && prev !== '自宅' ? prev : '自宅');
      setMyComment('軽傷または家族の対応中です。状況が落ち着き次第再度連絡します。');
    } else if (preset === 'rescue') {
      setMySafetyStatus('need_rescue');
      setMyFamilyStatus('injured');
      setMyHouseStatus('severe_damage');
      setMyWorkAvailability('unavailable');
      setMyLocation('避難所');
      setMyComment('被害が大きく出社できません。支援・救助が必要です。');
    }
  };

  // GPS Location Handler
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('お使いのブラウザはGPS位置情報取得に対応していません。');
      return;
    }
    setIsGettingLocation(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const { latitude, longitude } = pos.coords;
        setMyLocation(`現在地 (GPS: 北緯${latitude.toFixed(4)}°, 東経${longitude.toFixed(4)}°)`);
        setIsGettingLocation(false);
      },
      (err) => {
        console.warn('GPS error:', err);
        alert('位置情報を取得できませんでした。ブラウザの位置情報アクセスを許可してください。');
        setIsGettingLocation(false);
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  };

  // Close Event Handler
  const handleCloseEvent = async (eventId: string) => {
    const doClose = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/safety-events/${eventId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: 'closed' }),
        });
        if (res.ok) {
          setActionMessage({ type: 'success', text: '安否確認イベントを終了（アーカイブ）しました。' });
          await fetchEvents();
        } else {
          setActionMessage({ type: 'error', text: '終了処理に失敗しました。' });
        }
      } catch (e: any) {
        setActionMessage({ type: 'error', text: 'エラー: ' + e.message });
      }
    };

    if (onOpenConfirmModal) {
      onOpenConfirmModal({
        title: '安否確認の終了（アーカイブ）',
        message: 'この安否確認イベントを終了（ステータス完了）にしますか？終了後も集計結果の閲覧やCSV出力は可能です。',
        confirmLabel: '終了する',
        cancelLabel: 'キャンセル',
        isDangerous: false,
        onConfirm: doClose,
      });
    } else {
      if (window.confirm('この安否確認イベントを終了（アーカイブ）にしますか？')) {
        await doClose();
      }
    }
  };

  // Delete Event Handler (安否確認イベントの個別削除)
  const handleDeleteEvent = async (eventId: string) => {
    const targetEv = events.find(e => e.id === eventId);
    const evTitle = targetEv ? targetEv.title : 'この安否確認イベント';

    const doDelete = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/safety-events/${eventId}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setActionMessage({ type: 'success', text: `安否確認イベント「${evTitle}」を削除しました。` });
          const updatedEvents = events.filter(e => e.id !== eventId);
          setEvents(updatedEvents);
          if (updatedEvents.length > 0) {
            setSelectedEventId(updatedEvents[0].id);
          } else {
            setSelectedEventId(null);
          }
        } else {
          setActionMessage({ type: 'error', text: 'イベントの削除に失敗しました。' });
        }
      } catch (e: any) {
        setActionMessage({ type: 'error', text: 'エラー: ' + e.message });
      }
    };

    if (onOpenConfirmModal) {
      onOpenConfirmModal({
        title: '安否確認イベントの削除',
        message: `安否確認イベント「${evTitle}」およびこれに紐づくすべての回答集計データを完全に削除しますか？\n（※この操作は取り消せません）`,
        confirmLabel: '完全に削除する',
        cancelLabel: 'キャンセル',
        isDangerous: true,
        onConfirm: doDelete,
      });
    } else {
      if (window.confirm(`安否確認イベント「${evTitle}」およびすべての回答データを完全に削除しますか？`)) {
        await doDelete();
      }
    }
  };

  // Delete Individual Response Handler (個別回答レコードの削除・未回答リセット)
  const handleDeleteResponse = async (eventId: string, userId: string, userName: string) => {
    const doDelete = async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/safety-events/${eventId}/responses/${userId}`, {
          method: 'DELETE',
        });
        if (res.ok) {
          setActionMessage({ type: 'success', text: `${userName} さんの安否回答を削除（未回答にリセット）しました。` });
          await fetchResponses(eventId);
        } else {
          setActionMessage({ type: 'error', text: '回答の削除に失敗しました。' });
        }
      } catch (e: any) {
        setActionMessage({ type: 'error', text: 'エラー: ' + e.message });
      }
    };

    if (onOpenConfirmModal) {
      onOpenConfirmModal({
        title: '安否回答の個別削除・取消',
        message: `${userName} さんの安否回答データを削除し、未回答ステータスに戻しますか？`,
        confirmLabel: '回答を削除する',
        cancelLabel: 'キャンセル',
        isDangerous: true,
        onConfirm: doDelete,
      });
    } else {
      if (window.confirm(`${userName} さんの安否回答データを削除しますか？`)) {
        await doDelete();
      }
    }
  };

  // Update response form when selected event changes or user has already answered
  const activeEvent = events.find(e => e.id === selectedEventId) || events.find(e => e.status === 'active') || events[0];

  useEffect(() => {
    if (activeEvent) {
      fetchResponses(activeEvent.id);
      const myResp = responses.find(r => r.userId === currentUser.id);
      if (myResp) {
        setMySafetyStatus(myResp.safetyStatus);
        setMyFamilyStatus(myResp.familyStatus || 'all_safe');
        setMyHouseStatus(myResp.houseStatus || 'no_damage');
        setMyWorkAvailability(myResp.workAvailability);
        setMyLocation(myResp.locationStatus || '自宅');
        setMyComment(myResp.message || '');
      }
    }
  }, [selectedEventId, activeEvent?.id]);

  const fetchEvents = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/safety-events`);
      if (res.ok) {
        const data = await res.json();
        setEvents(data);
        if (data.length > 0 && !selectedEventId) {
          setSelectedEventId(data[0].id);
        }
      }
    } catch (err) {
      console.error('Failed to fetch safety events:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const fetchResponses = async (eventId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/safety-events/${eventId}/responses`);
      if (res.ok) {
        const data = await res.json();
        setResponses(data);
      }
    } catch (err) {
      console.error('Failed to fetch responses:', err);
    }
  };

  // Quick Template handler for triggering
  const applyTemplate = (type: DisasterType) => {
    setDisasterType(type);
    if (type === 'earthquake') {
      setTriggerTitle('【安否確認】地震発生に伴う安否状況確認');
      setTriggerLevel('震度5強以上');
      setTriggerMessage('強い地震が発生しました。身の安全を最優先に確保した上で、現在の安否状況・出社可否について回答をお願いします。');
    } else if (type === 'typhoon_rain') {
      setTriggerTitle('【安否確認】台風接近・大雨特別警報に伴う安否及び出社確認');
      setTriggerLevel('警戒レベル4以上');
      setTriggerMessage('非常に強い台風・大雨が予想されます。安全を確保し、本日の出社・テレワーク可否、周辺被害状況について回答をお願いします。');
    } else if (type === 'blackout') {
      setTriggerTitle('【安否確認】大規模停電・インフラ障害に伴う状況確認');
      setTriggerLevel('停電発生');
      setTriggerMessage('大規模停電が発生しています。業務継続・通信状況および社員の安全確保のため、現在の状況を回答してください。');
    } else if (type === 'fire') {
      setTriggerTitle('【緊急】事業所近隣での火災発生に伴う安否確認');
      setTriggerLevel('火災発生');
      setTriggerMessage('近隣での火災発生に伴い、安全確認および避難状況の確認を実施します。状況を回答してください。');
    } else if (type === 'drill') {
      setTriggerTitle('【安否確認訓練】第' + (new Date().getMonth() + 1) + '回 定期安否確認テスト');
      setTriggerLevel('訓練');
      setTriggerMessage('これは定期安否確認訓練です。実際の災害時を想定し、速やかに安否状況の選択・回答手順を確認してください。');
      setIsTestMode(true);
    } else {
      setTriggerTitle('【緊急安否確認】災害発生に伴う状況確認');
      setTriggerLevel('緊急発動');
      setTriggerMessage('現在発生している事象に伴い、社員の皆様の安否確認を実施します。速やかに回答をお願いします。');
    }
  };

  // Handle test mail send for trigger form
  const handleSendTestTriggerMail = async () => {
    if (!triggerTitle.trim()) {
      alert('発動タイトルを入力してください。');
      return;
    }

    const targetEmail = testEmailDestination.trim() || currentUser.email || currentUser.mobileEmail;
    if (!targetEmail || !targetEmail.includes('@')) {
      setShowTestEmailInput(true);
      setTestResult({
        success: false,
        message: 'テスト送信先のメールアドレスを入力してください。'
      });
      return;
    }

    setTestingSend(true);
    setTestResult(null);

    try {
      const nowStr = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
      const disasterLabel = disasterType === 'earthquake' ? '地震発生'
        : disasterType === 'typhoon_rain' ? '台風・豪雨'
        : disasterType === 'blackout' ? '停電・インフラ障害'
        : disasterType === 'fire' ? '火災・事故'
        : disasterType === 'drill' ? '安否確認テスト訓練'
        : '緊急事態';

      const emailSubject = `【安否確認テスト送信】${triggerTitle}`;
      const emailText = `※これは安否確認発動のテスト送信です。実際の発動ではありません。\n\n` +
        `【災害種別】: ${disasterLabel}\n` +
        `【災害規模/レベル】: ${triggerLevel}\n` +
        `【対象】: ${targetScope === 'all' ? '全社員・全拠点' : targetScope === 'offices' ? selectedOffices.join(', ') : selectedDivisions.join(', ')}\n\n` +
        `【通知メッセージ本文】:\n${triggerMessage || '（メッセージなし）'}\n\n` +
        `━━━━━━━━━━━━━━━━━━━━━━\n` +
        `【安否確認システムURL】:\n${window.location.origin}\n` +
        `送信日時: ${nowStr}\n` +
        `━━━━━━━━━━━━━━━━━━━━━━`;

      const res = await fetch(`${API_BASE_URL}/notifications/test-email`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: targetEmail,
          subject: emailSubject,
          text: emailText
        })
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok && data.success) {
        if (data.simulated) {
          setTestResult({
            success: true,
            isSimulated: true,
            message: `【テスト成功 (シミュレーション)】メール本文と配信ルーティングを正常に生成・検証しました。（※現在SMTP設定が未定義のため、サーバーログに出力されました）`
          });
        } else {
          setTestResult({
            success: true,
            isSimulated: false,
            message: `テストメールを ${targetEmail} へ正常に送信しました。`
          });
        }
      } else {
        const detailInfo = data.details ? ` (${data.details})` : '';
        setTestResult({
          success: false,
          message: `${data.error || data.message || 'メール送信に失敗しました。'}${detailInfo}`
        });
      }
    } catch (err: any) {
      setTestResult({
        success: false,
        message: '通信エラーが発生しました: ' + (err.message || '')
      });
    } finally {
      setTestingSend(false);
    }
  };

  // Handle Trigger Submit
  const handleTriggerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triggerTitle.trim()) {
      setActionMessage({ type: 'error', text: '発動タイトルを入力してください。' });
      return;
    }

    const payload = {
      title: triggerTitle.trim(),
      type: disasterType,
      disasterType,
      severity: triggerLevel || 'warning',
      level: triggerLevel,
      message: triggerMessage.trim(),
      targetOffice: targetScope === 'offices' && selectedOffices.length > 0 ? selectedOffices[0] : '全社',
      targetDivision: targetScope === 'divisions' && selectedDivisions.length > 0 ? selectedDivisions[0] : '全部署',
      targetScope,
      targetOffices: targetScope === 'offices' ? selectedOffices : undefined,
      targetDivisions: targetScope === 'divisions' ? selectedDivisions : undefined,
      notifyWebPush: useWebPush,
      notifyCompanyEmail: useCompanyEmail,
      notifyPersonalEmail: usePersonalEmail,
      channels: {
        webPush: useWebPush,
        companyEmail: useCompanyEmail,
        personalEmail: usePersonalEmail,
      },
      isDrill: isTestMode,
      isTest: isTestMode,
      appBaseUrl: window.location.origin + window.location.pathname.replace(/\/+$/, ''),
      createdBy: currentUser.id,
      createdById: currentUser.id,
      createdByName: currentUser.name,
    };

    const confirmText = isTestMode
      ? `【テスト発動】対象者に安否確認の通知（テスト）を送信しますか？`
      : `【本番発動】全社/対象者に緊急安否確認を発動し、WebPush・メール・個人メール宛へ一斉通知を送信します。よろしいですか？`;

    if (onOpenConfirmModal) {
      onOpenConfirmModal({
        title: isTestMode ? '安否確認テスト発動' : '⚠️ 緊急安否確認の一斉発動',
        message: confirmText,
        confirmLabel: '発動して一斉送信',
        isDangerous: !isTestMode,
        onConfirm: async () => {
          await executeTrigger(payload);
        },
      });
    } else {
      if (window.confirm(confirmText)) {
        await executeTrigger(payload);
      }
    }
  };

  const executeTrigger = async (payload: any) => {
    setIsSending(true);
    setActionMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/safety-events`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `安否確認を発動しました！ (${data.totalTargets || 0}名に通知送信完了 / WebPush: ${data.pushSent || 0}件, メール: ${data.emailSent || 0}件)`,
        });
        await fetchEvents();
        setActiveTab('dashboard');
        if (data.event?.id) {
          setSelectedEventId(data.event.id);
        }
      } else {
        setActionMessage({ type: 'error', text: data.error || '安否確認の発動に失敗しました。' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: '通信エラーが発生しました: ' + err.message });
    } finally {
      setIsSending(false);
    }
  };

  // Submit Answer
  const handleResponseSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeEvent) return;

    setIsSubmittingResponse(true);
    setActionMessage(null);
    try {
      const payload = {
        userId: currentUser.id,
        userName: currentUser.name,
        office: currentUser.office,
        division: currentUser.division,
        safetyStatus: mySafetyStatus,
        familyStatus: myFamilyStatus,
        houseStatus: myHouseStatus,
        workAvailability: myWorkAvailability,
        locationStatus: myLocation,
        message: myComment.trim(),
      };

      const res = await fetch(`${API_BASE_URL}/safety-events/${activeEvent.id}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setActionMessage({ type: 'success', text: '安否状況を回答・登録しました。ご無事をお祈りいたします。' });
        await fetchResponses(activeEvent.id);
        await fetchEvents();
      } else {
        const data = await res.json();
        setActionMessage({ type: 'error', text: data.error || '回答の送信に失敗しました。' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: 'エラー: ' + err.message });
    } finally {
      setIsSubmittingResponse(false);
    }
  };

  // Send Reminder to Unanswered Users
  const handleSendReminder = async () => {
    if (!activeEvent) return;
    const confirmMsg = `未回答の対象者全員にリマインド通知（WebPush & メール）を一斉再送します。よろしいですか？`;
    if (!window.confirm(confirmMsg)) return;

    setIsSending(true);
    setActionMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/safety-events/${activeEvent.id}/remind`, {
        method: 'POST',
      });
      const data = await res.json();
      if (res.ok) {
        setActionMessage({
          type: 'success',
          text: `未回答者 ${data.remindedCount || 0}名 にリマインド通知を再送しました。`,
        });
      } else {
        setActionMessage({ type: 'error', text: data.error || 'リマインド送信に失敗しました。' });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: 'エラー: ' + err.message });
    } finally {
      setIsSending(false);
    }
  };

  // Export CSV
  const handleExportCSV = () => {
    if (!activeEvent) return;
    const answeredMap = new Map(responses.map(r => [r.userId, r]));
    const rows = [
      ['社員名', '拠点', '部署', '回答状況', '本人の安否', '家族の安否', '家屋状況', '出社可否', '現在地', 'コメント・要望', '回答日時']
    ];

    allUsers.forEach(u => {
      const resp = answeredMap.get(u.id);
      if (resp) {
        const safetyMap: Record<string, string> = {
          safe: '無事',
          minor_injury: '軽傷',
          severe_injury: '重傷',
          need_rescue: '要救助',
        };
        const workMap: Record<string, string> = {
          available: '出社可',
          remote_only: '在宅可',
          unavailable: '出社不可',
          undecided: '未定',
        };
        rows.push([
          u.name,
          u.office || '',
          u.division || '',
          '回答済',
          safetyMap[resp.safetyStatus] || resp.safetyStatus,
          resp.familyStatus || '',
          resp.houseStatus || '',
          workMap[resp.workAvailability] || resp.workAvailability,
          resp.locationStatus || '',
          `"${(resp.message || '').replace(/"/g, '""')}"`,
          resp.respondedAt,
        ]);
      } else {
        rows.push([u.name, u.office || '', u.division || '', '未回答', '-', '-', '-', '-', '-', '-', '-']);
      }
    });

    const csvContent = '\uFEFF' + rows.map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `安否確認集計_${activeEvent.title}_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Export Target Members List CSV
  const handleExportTargetsCSV = () => {
    const rows = [
      ['社員番号/ID', '氏名', '営業所・拠点', '所属部署', 'PCメール', '携帯メール', '携帯メール登録状況', '個人メール(暗号化)', '個人メール登録状況', '緊急連絡先登録状況']
    ];

    filteredTargets.forEach(u => {
      const hasMobile = !!(u.mobileEmail && u.mobileEmail.trim());
      const hasPersonal = !!(u.personalEmailMasked || u.personalEmailEncrypted);
      const regStatus = (hasMobile && hasPersonal)
        ? '両方登録済'
        : hasPersonal
        ? '個人メールのみ登録'
        : hasMobile
        ? '携帯メールのみ登録'
        : '未登録';

      rows.push([
        u.id,
        u.name,
        u.office || '',
        u.division || '',
        u.email || '',
        u.mobileEmail || '',
        hasMobile ? '登録済' : '未登録',
        u.personalEmailMasked || (hasPersonal ? '登録済(暗号化)' : ''),
        hasPersonal ? '登録済' : '未登録',
        regStatus
      ]);
    });

    const csvContent = '\uFEFF' + rows.map(e => e.join(',')).join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `安否確認_対象者連絡先登録状況一覧_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // 対象者選択ハンドラー
  const handleToggleTargetSelect = (userId: string) => {
    setSelectedTargetUserIds(prev => 
      prev.includes(userId) ? prev.filter(id => id !== userId) : [...prev, userId]
    );
  };

  const handleSelectAllFilteredTargets = () => {
    const allFilteredIds = filteredTargets.map(u => u.id);
    const isAllSelected = allFilteredIds.every(id => selectedTargetUserIds.includes(id));
    if (isAllSelected) {
      setSelectedTargetUserIds(prev => prev.filter(id => !allFilteredIds.includes(id)));
    } else {
      setSelectedTargetUserIds(prev => Array.from(new Set([...prev, ...allFilteredIds])));
    }
  };

  const handleSelectUnregisteredOnly = () => {
    const unregisteredUsers = allUsers.filter(u => !u.personalEmailMasked && !u.personalEmailEncrypted);
    const unregIds = unregisteredUsers.map(u => u.id);
    setSelectedTargetUserIds(unregIds);
    setActionMessage({
      type: 'success',
      text: `個人メール未登録の社員 ${unregIds.length} 名を選択しました。`
    });
  };

  const handleClearTargetSelection = () => {
    setSelectedTargetUserIds([]);
  };

  // 個人メール登録依頼メール送信実行
  const handleSendRegistrationRequest = async () => {
    if (selectedTargetUserIds.length === 0) {
      alert('送信対象の社員を1名以上選択してください。');
      return;
    }

    if (!requestSendCompany && !requestSendMobile) {
      alert('会社PCメールまたは会社携帯メールのいずれか1つ以上を送信先として選択してください。');
      return;
    }

    setIsSendingRequest(true);
    setActionMessage(null);
    try {
      const appBaseUrl = window.location.origin + window.location.pathname.replace(/\/$/, '');
      const payload = {
        userIds: selectedTargetUserIds,
        appBaseUrl,
        customMessage: requestCustomMessage.trim(),
        sendToCompanyEmail: requestSendCompany,
        sendToMobileEmail: requestSendMobile,
        senderName: currentUser.name ? `${currentUser.name} (${currentUser.office || ''} ${currentUser.division || ''})` : '安否確認管理者'
      };

      const res = await fetch(`${API_BASE_URL}/safety/request-registration`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      const data = await res.json();

      if (res.ok && data.success) {
        setIsRequestModalOpen(false);
        setRequestResultModal({
          open: true,
          success: true,
          message: data.message || `${data.sentCount} 名に登録依頼メールを送信しました。`,
          details: data
        });
        setActionMessage({
          type: 'success',
          text: `【送信完了】${data.sentCount} 名の社員宛に個人メール登録依頼メールを送信しました。`
        });
        setSelectedTargetUserIds([]);
      } else {
        setRequestResultModal({
          open: true,
          success: false,
          message: data.error || '登録依頼メールの送信に失敗しました。',
          details: data
        });
      }
    } catch (err: any) {
      console.error('Request registration send error:', err);
      setRequestResultModal({
        open: true,
        success: false,
        message: `通信エラー: ${err.message || '送信できませんでした'}`
      });
    } finally {
      setIsSendingRequest(false);
    }
  };

  // Calculations for dashboard
  const answeredUserIds = new Set(responses.map(r => r.userId));
  const totalUsersCount = allUsers.length;
  const answeredCount = responses.length;
  const responseRate = totalUsersCount > 0 ? Math.round((answeredCount / totalUsersCount) * 100) : 0;

  const safeCount = responses.filter(r => r.safetyStatus === 'safe').length;
  const minorInjuryCount = responses.filter(r => r.safetyStatus === 'minor_injury').length;
  const severeInjuryCount = responses.filter(r => r.safetyStatus === 'severe_injury' || r.safetyStatus === 'need_rescue').length;
  const canWorkCount = responses.filter(r => r.workAvailability === 'available').length;
  const remoteWorkCount = responses.filter(r => r.workAvailability === 'remote_only').length;
  const cannotWorkCount = responses.filter(r => r.workAvailability === 'unavailable').length;

  // Filtered members list for dashboard
  const filteredMembers = allUsers.filter(u => {
    if (selectedOfficeFilter !== 'all' && u.office !== selectedOfficeFilter) return false;
    if (searchKeyword.trim()) {
      const kw = searchKeyword.toLowerCase();
      const matchName = u.name.toLowerCase().includes(kw);
      const matchOffice = (u.office || '').toLowerCase().includes(kw);
      const matchDivision = (u.division || '').toLowerCase().includes(kw);
      if (!matchName && !matchOffice && !matchDivision) return false;
    }
    const isAnswered = answeredUserIds.has(u.id);
    const resp = responses.find(r => r.userId === u.id);
    if (statusFilter === 'unanswered' && isAnswered) return false;
    if (statusFilter === 'safe' && (!resp || resp.safetyStatus !== 'safe')) return false;
    if (statusFilter === 'danger' && (!resp || (resp.safetyStatus !== 'minor_injury' && resp.safetyStatus !== 'severe_injury' && resp.safetyStatus !== 'need_rescue'))) return false;
    return true;
  });

  // Filtered & Sorted targets list for Target Members Roster (対象者一覧タブ)
  const filteredTargets = allUsers.filter(u => {
    if (targetOfficeFilter !== 'all' && u.office !== targetOfficeFilter) return false;
    if (targetDivisionFilter !== 'all' && u.division !== targetDivisionFilter) return false;
    
    const hasMobile = !!(u.mobileEmail && u.mobileEmail.trim());
    const hasPersonal = !!(u.personalEmailMasked || u.personalEmailEncrypted);

    if (targetRegistrationFilter === 'both' && (!hasMobile || !hasPersonal)) return false;
    if (targetRegistrationFilter === 'personalOnly' && (!hasPersonal || hasMobile)) return false;
    if (targetRegistrationFilter === 'mobileOnly' && (!hasMobile || hasPersonal)) return false;
    if (targetRegistrationFilter === 'none' && (hasMobile || hasPersonal)) return false;

    if (targetSearchKeyword.trim()) {
      const kw = targetSearchKeyword.toLowerCase();
      const matchName = u.name.toLowerCase().includes(kw);
      const matchKana = (u.kanaName || '').toLowerCase().includes(kw);
      const matchOffice = (u.office || '').toLowerCase().includes(kw);
      const matchDivision = (u.division || '').toLowerCase().includes(kw);
      const matchEmail = (u.email || '').toLowerCase().includes(kw);
      const matchMobileEmail = (u.mobileEmail || '').toLowerCase().includes(kw);
      const matchPersonalEmail = (u.personalEmailMasked || '').toLowerCase().includes(kw);
      if (!matchName && !matchKana && !matchOffice && !matchDivision && !matchEmail && !matchMobileEmail && !matchPersonalEmail) {
        return false;
      }
    }
    return true;
  }).sort((a, b) => {
    let comp = 0;
    if (targetSortField === 'name') {
      const aVal = (a.kanaName || a.name || '').toLowerCase();
      const bVal = (b.kanaName || b.name || '').toLowerCase();
      comp = aVal.localeCompare(bVal, 'ja');
    } else if (targetSortField === 'office') {
      const aVal = (a.office || '').toLowerCase();
      const bVal = (b.office || '').toLowerCase();
      comp = aVal.localeCompare(bVal, 'ja');
    } else if (targetSortField === 'division') {
      const aVal = (a.division || '').toLowerCase();
      const bVal = (b.division || '').toLowerCase();
      comp = aVal.localeCompare(bVal, 'ja');
    } else if (targetSortField === 'mobileEmail') {
      const aVal = (a.mobileEmail || '').toLowerCase();
      const bVal = (b.mobileEmail || '').toLowerCase();
      comp = aVal.localeCompare(bVal);
    } else if (targetSortField === 'personalEmail') {
      const aVal = (a.personalEmailMasked || '').toLowerCase();
      const bVal = (b.personalEmailMasked || '').toLowerCase();
      comp = aVal.localeCompare(bVal);
    } else if (targetSortField === 'status') {
      const aScore = (a.mobileEmail && (a.personalEmailMasked || a.personalEmailEncrypted)) ? 3 : (a.personalEmailMasked || a.personalEmailEncrypted) ? 2 : a.mobileEmail ? 1 : 0;
      const bScore = (b.mobileEmail && (b.personalEmailMasked || b.personalEmailEncrypted)) ? 3 : (b.personalEmailMasked || b.personalEmailEncrypted) ? 2 : b.mobileEmail ? 1 : 0;
      comp = aScore - bScore;
    }
    return targetSortOrder === 'asc' ? comp : -comp;
  });

  // Target registration statistics
  const targetTotalCount = allUsers.length;
  const targetPersonalRegisteredCount = allUsers.filter(u => !!(u.personalEmailMasked || u.personalEmailEncrypted)).length;
  const targetMobileRegisteredCount = allUsers.filter(u => !!(u.mobileEmail && u.mobileEmail.trim())).length;
  const targetBothRegisteredCount = allUsers.filter(u => !!(u.personalEmailMasked || u.personalEmailEncrypted) && !!(u.mobileEmail && u.mobileEmail.trim())).length;
  const targetAtLeastOneRegisteredCount = allUsers.filter(u => !!(u.personalEmailMasked || u.personalEmailEncrypted) || !!(u.mobileEmail && u.mobileEmail.trim())).length;
  const targetNoneRegisteredCount = targetTotalCount - targetAtLeastOneRegisteredCount;
  const targetPersonalRate = targetTotalCount > 0 ? Math.round((targetPersonalRegisteredCount / targetTotalCount) * 100) : 0;
  const targetMobileRate = targetTotalCount > 0 ? Math.round((targetMobileRegisteredCount / targetTotalCount) * 100) : 0;
  const targetOverallRate = targetTotalCount > 0 ? Math.round((targetAtLeastOneRegisteredCount / targetTotalCount) * 100) : 0;

  return (
    <div className="flex-1 max-w-7xl mx-auto space-y-6 pb-12">
      {/* Top Header Card */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center shadow-md shadow-rose-200 shrink-0">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-black text-slate-800 tracking-tight">
                安否確認システム (BCP・災害対策)
              </h1>
              <span className="text-xs px-2.5 py-0.5 rounded-full font-bold bg-rose-100 text-rose-700 border border-rose-200">
                ユーティリティ / BCP
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              地震・津波・風水害発生時における全社安否確認の一斉発動、リアルタイム集計、および個人メール暗号化管理を行えます。
            </p>
          </div>
        </div>

        {/* Global Action Navigation Tabs */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveTab('respond')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'respond'
                ? 'bg-rose-600 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <HeartHandshake className="w-4 h-4" />
            自分の安否を回答
          </button>

          <button
            onClick={() => setActiveTab('dashboard')}
            className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              activeTab === 'dashboard'
                ? 'bg-white text-rose-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-4 h-4" />
            集計ダッシュボード
          </button>

          {isAdmin && (
            <>
              <button
                onClick={() => setActiveTab('targets')}
                className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'targets'
                    ? 'bg-white text-rose-700 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <UserCheck className="w-4 h-4 text-indigo-600" />
                対象者・登録管理
              </button>

              <button
                onClick={() => setActiveTab('trigger')}
                className={`px-3.5 py-2 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                  activeTab === 'trigger'
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Send className="w-4 h-4" />
                安否確認を発動
              </button>
            </>
          )}
        </div>
      </div>

      {/* Action Notification Banner */}
      {actionMessage && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs font-bold ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600 cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 1: DASHBOARD (集計・進捗ダッシュボード) */}
      {/* ========================================================================= */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {events.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-4">
              <div className="w-16 h-16 bg-rose-50 text-rose-600 rounded-2xl flex items-center justify-center mx-auto ring-8 ring-rose-50/50">
                <ShieldAlert className="w-8 h-8" />
              </div>
              <h2 className="text-base font-extrabold text-slate-800">
                現在発動中の安否確認はありません
              </h2>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                緊急時や訓練時には、右上の「安否確認を発動」ボタンから全社・拠点向けに一斉通知を送信できます。
              </p>
              <button
                onClick={() => setActiveTab('trigger')}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all inline-flex items-center gap-2 cursor-pointer"
              >
                <Send className="w-4 h-4" />
                安否確認を発動する
              </button>
            </div>
          ) : (
            <>
              {/* Event Selector Header */}
              <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-500">対象イベント:</span>
                  <select
                    value={selectedEventId || ''}
                    onChange={(e) => setSelectedEventId(e.target.value)}
                    className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 cursor-pointer"
                  >
                    {events.map((ev) => (
                      <option key={ev.id} value={ev.id}>
                        {ev.status === 'active' ? '🔴 [発動中] ' : '⚪ [完了] '}
                        {ev.title} ({new Date(ev.createdAt).toLocaleString('ja-JP', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={handleExportCSV}
                    className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    CSV出力
                  </button>

                  {isAdmin && (
                    <>
                      <button
                        onClick={handleSendReminder}
                        disabled={isSending || (totalUsersCount - answeredCount) === 0}
                        className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                        title="未回答者に対してプッシュ通知・メール通知を再送します"
                      >
                        <Bell className="w-3.5 h-3.5" />
                        未回答者へ再通知 ({totalUsersCount - answeredCount}名)
                      </button>

                      {activeEvent && activeEvent.status === 'active' && (
                        <button
                          onClick={() => handleCloseEvent(activeEvent.id)}
                          className="px-3 py-1.5 rounded-lg border border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          title="安否確認イベントを終了（アーカイブ）します"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5 text-slate-600" />
                          終了・完了
                        </button>
                      )}

                      {activeEvent && (
                        <button
                          onClick={() => handleDeleteEvent(activeEvent.id)}
                          className="px-3 py-1.5 rounded-lg border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
                          title="この安否確認イベントおよび全集計データを完全に削除します"
                        >
                          <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                          イベント削除
                        </button>
                      )}
                    </>
                  )}

                  <button
                    onClick={() => {
                      if (activeEvent) fetchResponses(activeEvent.id);
                    }}
                    className="p-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-slate-600 cursor-pointer"
                    title="再読み込み"
                  >
                    <RefreshCw className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Statistics Bento Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3.5">
                {/* 1. 回答率 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between">
                  <span className="text-[11px] font-bold text-slate-500">回答率</span>
                  <div className="my-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-rose-600">{responseRate}%</span>
                    <span className="text-xs text-slate-400 font-bold">{answeredCount}/{totalUsersCount}名</span>
                  </div>
                  <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                    <div className="bg-rose-600 h-full transition-all duration-500" style={{ width: `${responseRate}%` }} />
                  </div>
                </div>

                {/* 2. 無事 */}
                <div className="bg-white rounded-2xl border border-emerald-200 p-4 shadow-sm bg-emerald-50/20">
                  <span className="text-[11px] font-bold text-emerald-700">無事・軽微</span>
                  <div className="my-2">
                    <span className="text-2xl font-black text-emerald-600">{safeCount}</span>
                    <span className="text-xs text-emerald-600/70 font-bold ml-1">名</span>
                  </div>
                  <span className="text-[10px] text-emerald-600 font-semibold">支障なし</span>
                </div>

                {/* 3. 軽傷・被害あり */}
                <div className="bg-white rounded-2xl border border-amber-200 p-4 shadow-sm bg-amber-50/20">
                  <span className="text-[11px] font-bold text-amber-700">軽傷・対応中</span>
                  <div className="my-2">
                    <span className="text-2xl font-black text-amber-600">{minorInjuryCount}</span>
                    <span className="text-xs text-amber-600/70 font-bold ml-1">名</span>
                  </div>
                  <span className="text-[10px] text-amber-600 font-semibold">自力対応中</span>
                </div>

                {/* 4. 重傷・要救助 */}
                <div className="bg-white rounded-2xl border border-rose-200 p-4 shadow-sm bg-rose-50/30">
                  <span className="text-[11px] font-bold text-rose-700">重傷・救助要請</span>
                  <div className="my-2">
                    <span className="text-2xl font-black text-rose-600">{severeInjuryCount}</span>
                    <span className="text-xs text-rose-600/70 font-bold ml-1">名</span>
                  </div>
                  <span className="text-[10px] text-rose-600 font-semibold">最優先支援</span>
                </div>

                {/* 5. 出社可 */}
                <div className="bg-white rounded-2xl border border-indigo-200 p-4 shadow-sm bg-indigo-50/20">
                  <span className="text-[11px] font-bold text-indigo-700">通常出社可</span>
                  <div className="my-2">
                    <span className="text-2xl font-black text-indigo-600">{canWorkCount}</span>
                    <span className="text-xs text-indigo-600/70 font-bold ml-1">名</span>
                  </div>
                  <span className="text-[10px] text-indigo-600 font-semibold">稼働可能</span>
                </div>

                {/* 6. 在宅/出社不可 */}
                <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
                  <span className="text-[11px] font-bold text-slate-600">在宅 / 出社不可</span>
                  <div className="my-2 flex items-baseline gap-2">
                    <span className="text-2xl font-black text-slate-800">{remoteWorkCount + cannotWorkCount}</span>
                    <span className="text-xs text-slate-400 font-bold">名</span>
                  </div>
                  <span className="text-[10px] text-slate-500 font-medium">出社不可: {cannotWorkCount}名</span>
                </div>
              </div>

              {/* Members Status Filter & List */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="p-4 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Users className="w-4 h-4 text-slate-700" />
                    <span className="text-xs font-bold text-slate-800">
                      社員安否状況一覧 ({filteredMembers.length}名)
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap text-xs">
                    {/* Status filter buttons */}
                    <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5">
                      <button
                        onClick={() => setStatusFilter('all')}
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          statusFilter === 'all' ? 'bg-slate-800 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        全員
                      </button>
                      <button
                        onClick={() => setStatusFilter('unanswered')}
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          statusFilter === 'unanswered' ? 'bg-amber-500 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        未回答のみ
                      </button>
                      <button
                        onClick={() => setStatusFilter('danger')}
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          statusFilter === 'danger' ? 'bg-rose-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        被害・要救助
                      </button>
                      <button
                        onClick={() => setStatusFilter('safe')}
                        className={`px-2.5 py-1 rounded text-xs font-bold ${
                          statusFilter === 'safe' ? 'bg-emerald-600 text-white' : 'text-slate-600 hover:bg-slate-100'
                        }`}
                      >
                        無事
                      </button>
                    </div>

                    {/* Office selector */}
                    <select
                      value={selectedOfficeFilter}
                      onChange={(e) => setSelectedOfficeFilter(e.target.value)}
                      className="px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-700"
                    >
                      <option value="all">全拠点</option>
                      {offices.map(off => (
                        <option key={off.id} value={off.name}>{off.name}</option>
                      ))}
                    </select>

                    {/* Search bar */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                      <input
                        type="text"
                        placeholder="氏名・部署で検索..."
                        value={searchKeyword}
                        onChange={(e) => setSearchKeyword(e.target.value)}
                        className="pl-8 pr-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-rose-500"
                      />
                    </div>
                  </div>
                </div>

                {/* Table */}
                <div className="divide-y divide-slate-100 overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-slate-50/50 text-slate-500 font-bold border-b border-slate-100">
                      <tr>
                        <th className="py-3 px-4">氏名 / 所属</th>
                        <th className="py-3 px-4">安否状況</th>
                        <th className="py-3 px-4">家族・家屋</th>
                        <th className="py-3 px-4">出社可否 / 現在地</th>
                        <th className="py-3 px-4">連絡先 (暗号化保護)</th>
                        <th className="py-3 px-4">コメント・要望</th>
                        <th className="py-3 px-4">回答日時</th>
                        <th className="py-3 px-3 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {filteredMembers.map((member) => {
                        const resp = responses.find(r => r.userId === member.id);
                        return (
                          <tr key={member.id} className="hover:bg-slate-50/80 transition-colors">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900">{member.name}</div>
                              <div className="text-[10px] text-slate-400">
                                {[member.office, member.division, member.position].filter(Boolean).join(' / ')}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              {resp ? (
                                resp.safetyStatus === 'safe' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                                    <Check className="w-3 h-3 text-emerald-600" />
                                    無事
                                  </span>
                                ) : resp.safetyStatus === 'minor_injury' ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                                    <AlertTriangle className="w-3 h-3 text-amber-600" />
                                    軽傷・対応中
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200 animate-pulse">
                                    <AlertOctagon className="w-3 h-3 text-rose-600" />
                                    重傷・要救助
                                  </span>
                                )
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-bold bg-slate-100 text-slate-400 border border-slate-200">
                                  <Clock className="w-3 h-3" />
                                  未回答
                                </span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-600">
                              {resp ? (
                                <div className="space-y-0.5 text-[11px]">
                                  <div>家族: {resp.familyStatus === 'all_safe' ? '全員無事' : resp.familyStatus === 'injured' ? '負傷者あり' : '未定'}</div>
                                  <div>家屋: {resp.houseStatus === 'no_damage' ? '被害なし' : resp.houseStatus === 'partial_damage' ? '一部破損' : '倒壊・避難'}</div>
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              {resp ? (
                                <div className="space-y-0.5 text-[11px]">
                                  <div className="font-bold text-slate-800">
                                    {resp.workAvailability === 'available' ? '通常出社可' : resp.workAvailability === 'remote_only' ? '在宅勤務可' : '出社不可'}
                                  </div>
                                  <div className="text-slate-500">現在地: {resp.locationStatus || '自宅'}</div>
                                </div>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <div className="space-y-0.5 text-[10px] text-slate-500 font-mono">
                                {member.mobileEmail && (
                                  <div className="flex items-center gap-1">
                                    <Smartphone className="w-2.5 h-2.5 text-indigo-500" />
                                    <span>{member.mobileEmail}</span>
                                  </div>
                                )}
                                {member.personalEmailMasked ? (
                                  <div className="flex items-center gap-1 text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-100">
                                    <Lock className="w-2.5 h-2.5 text-emerald-600" />
                                    <span>個人: {member.personalEmailMasked}</span>
                                  </div>
                                ) : (
                                  <span className="text-slate-300">個人メール未登録</span>
                                )}
                              </div>
                            </td>
                            <td className="py-3 px-4 text-slate-700 max-w-xs">
                              {resp?.message ? (
                                <span className="line-clamp-2">{resp.message}</span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="py-3 px-4 text-slate-400 text-[11px] whitespace-nowrap">
                              {resp?.respondedAt ? (
                                new Date(resp.respondedAt).toLocaleString('ja-JP', {
                                  month: 'numeric',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit',
                                })
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="py-3 px-3 text-center whitespace-nowrap">
                              {resp ? (
                                (isAdmin || currentUser.id === member.id) ? (
                                  <button
                                    onClick={() => handleDeleteResponse(activeEvent.id, member.id, member.name)}
                                    className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                    title={`${member.name} さんの回答を削除（未回答にリセット）`}
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                ) : (
                                  <span className="text-slate-300">-</span>
                                )
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 2: TARGETS ROSTER (対象者一覧・登録状況) */}
      {/* ========================================================================= */}
      {activeTab === 'targets' && (
        <div className="space-y-6">
          {/* Summary Stat Cards for Registration Status */}
          <div className="grid grid-cols-2 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">全社対象人数</span>
                <span className="p-2 rounded-xl bg-slate-100 text-slate-700">
                  <Users className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-slate-800">{targetTotalCount}</span>
                <span className="text-xs font-bold text-slate-400">名</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">安否確認システムの対象全社員</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">いずれか登録済</span>
                <span className="p-2 rounded-xl bg-emerald-50 text-emerald-600">
                  <ShieldCheck className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-emerald-600">{targetAtLeastOneRegisteredCount}</span>
                <span className="text-xs font-bold text-slate-400">名 ({targetOverallRate}%)</span>
              </div>
              <div className="w-full bg-slate-100 h-1.5 rounded-full mt-2 overflow-hidden">
                <div
                  className="bg-emerald-500 h-full rounded-full transition-all duration-500"
                  style={{ width: `${targetOverallRate}%` }}
                />
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">暗号化個人メール</span>
                <span className="p-2 rounded-xl bg-indigo-50 text-indigo-600">
                  <Lock className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-indigo-600">{targetPersonalRegisteredCount}</span>
                <span className="text-xs font-bold text-slate-400">名 ({targetPersonalRate}%)</span>
              </div>
              <p className="text-[11px] text-slate-400 mt-1">私用アドレス(Gmail/キャリア等)</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">緊急連絡先 未登録</span>
                <span className="p-2 rounded-xl bg-rose-50 text-rose-600">
                  <UserX className="w-4 h-4" />
                </span>
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="text-2xl font-black text-rose-600">{targetNoneRegisteredCount}</span>
                <span className="text-xs font-bold text-slate-400">名</span>
              </div>
              <p className="text-[11px] text-rose-600 font-bold mt-1">
                {targetNoneRegisteredCount > 0 ? '⚠️ 要登録アナウンス' : '全員登録完了'}
              </p>
            </div>
          </div>

          {/* Roster Table Card */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
            {/* Table Filter and Action Toolbar */}
            <div className="p-5 border-b border-slate-100 flex flex-col gap-4">
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                <div className="flex items-center gap-2">
                  <UserCheck className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h3 className="text-sm font-extrabold text-slate-800">
                      安否確認対象者・連絡先登録状況一覧
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      全社の営業所、部署、氏名、携帯メール、個人メール（暗号化）の登録具合を一覧で確認し、未登録者への個別・一括依頼が可能です。
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2.5">
                  {/* Search Keyword */}
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={targetSearchKeyword}
                      onChange={(e) => setTargetSearchKeyword(e.target.value)}
                      placeholder="氏名・部署・アドレス検索..."
                      className="pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white w-48"
                    />
                    {targetSearchKeyword && (
                      <button
                        onClick={() => setTargetSearchKeyword('')}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>

                  {/* Office Filter */}
                  <select
                    value={targetOfficeFilter}
                    onChange={(e) => setTargetOfficeFilter(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="all">全拠点・営業所</option>
                    {offices.map((o) => (
                      <option key={o.id} value={o.name}>
                        {o.name}
                      </option>
                    ))}
                  </select>

                  {/* Division Filter */}
                  <select
                    value={targetDivisionFilter}
                    onChange={(e) => setTargetDivisionFilter(e.target.value)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="all">全部署</option>
                    {divisions.map((d) => (
                      <option key={d.id} value={d.name}>
                        {d.name}
                      </option>
                    ))}
                  </select>

                  {/* Registration Filter */}
                  <select
                    value={targetRegistrationFilter}
                    onChange={(e) => setTargetRegistrationFilter(e.target.value as any)}
                    className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="all">全登録状況 ({allUsers.length})</option>
                    <option value="both">両方登録済 ({targetBothRegisteredCount})</option>
                    <option value="personalOnly">個人メールのみ登録</option>
                    <option value="mobileOnly">携帯メールのみ登録</option>
                    <option value="none">未登録者のみ ({targetNoneRegisteredCount})</option>
                  </select>

                  {/* CSV Export Button */}
                  <button
                    onClick={handleExportTargetsCSV}
                    className="px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs shrink-0"
                  >
                    <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
                    CSV出力
                  </button>
                </div>
              </div>

              {/* Action Bar for Registration Request & Selection */}
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60 p-3 rounded-xl">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs font-bold text-slate-600">
                    選択中: <strong className="text-indigo-600 text-sm font-black">{selectedTargetUserIds.length}</strong> / {filteredTargets.length} 名
                  </span>

                  <button
                    onClick={handleSelectAllFilteredTargets}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    {filteredTargets.every(u => selectedTargetUserIds.includes(u.id)) && filteredTargets.length > 0
                      ? '表示中の全解除'
                      : '表示中の全選択'}
                  </button>

                  <button
                    onClick={handleSelectUnregisteredOnly}
                    className="px-2.5 py-1 text-[11px] font-bold rounded-lg border border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100 transition-colors flex items-center gap-1"
                  >
                    <UserX className="w-3 h-3" />
                    未登録者を一括選択 ({allUsers.filter(u => !u.personalEmailMasked && !u.personalEmailEncrypted).length}名)
                  </button>

                  {selectedTargetUserIds.length > 0 && (
                    <button
                      onClick={handleClearTargetSelection}
                      className="px-2 py-1 text-[11px] font-bold text-slate-500 hover:text-slate-700 underline"
                    >
                      選択クリア
                    </button>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      if (selectedTargetUserIds.length === 0) {
                        alert('依頼メールを送信する対象者を1名以上選択（チェック）してください。');
                        return;
                      }
                      setIsRequestModalOpen(true);
                    }}
                    disabled={selectedTargetUserIds.length === 0}
                    className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 shadow-sm transition-all ${
                      selectedTargetUserIds.length > 0
                        ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer hover:shadow-md'
                        : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                    }`}
                  >
                    <Mail className="w-4 h-4" />
                    <span>個人メール登録の依頼メールを送信</span>
                    {selectedTargetUserIds.length > 0 && (
                      <span className="bg-white/20 px-2 py-0.5 rounded-full text-[11px]">
                        {selectedTargetUserIds.length}名
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Target Members Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50/80 text-slate-600 font-bold border-b border-slate-200 select-none">
                    {/* Checkbox Column */}
                    <th className="py-3 px-3 text-center w-10">
                      <input
                        type="checkbox"
                        checked={filteredTargets.length > 0 && filteredTargets.every(u => selectedTargetUserIds.includes(u.id))}
                        onChange={handleSelectAllFilteredTargets}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        title="表示中を全選択/解除"
                      />
                    </th>

                    {/* Name column with sort */}
                    <th
                      onClick={() => handleToggleTargetSort('name')}
                      className="py-3 px-4 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>社員名</span>
                        {targetSortField === 'name' ? (
                          targetSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300" />
                        )}
                      </div>
                    </th>

                    {/* Office column with sort */}
                    <th
                      onClick={() => handleToggleTargetSort('office')}
                      className="py-3 px-4 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>営業所</span>
                        {targetSortField === 'office' ? (
                          targetSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300" />
                        )}
                      </div>
                    </th>

                    {/* Division column with sort */}
                    <th
                      onClick={() => handleToggleTargetSort('division')}
                      className="py-3 px-4 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>所属部署</span>
                        {targetSortField === 'division' ? (
                          targetSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300" />
                        )}
                      </div>
                    </th>

                    {/* Company PC Email */}
                    <th className="py-3 px-4 whitespace-nowrap">会社PCメール</th>

                    {/* Mobile Email column with sort */}
                    <th
                      onClick={() => handleToggleTargetSort('mobileEmail')}
                      className="py-3 px-4 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>携帯メール</span>
                        {targetSortField === 'mobileEmail' ? (
                          targetSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300" />
                        )}
                      </div>
                    </th>

                    {/* Personal Email column with sort */}
                    <th
                      onClick={() => handleToggleTargetSort('personalEmail')}
                      className="py-3 px-4 whitespace-nowrap cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center gap-1.5">
                        <span>個人メール (暗号化)</span>
                        {targetSortField === 'personalEmail' ? (
                          targetSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300" />
                        )}
                      </div>
                    </th>

                    {/* Registration Status column with sort */}
                    <th
                      onClick={() => handleToggleTargetSort('status')}
                      className="py-3 px-4 whitespace-nowrap text-center cursor-pointer hover:bg-slate-100 transition-colors"
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>登録状況</span>
                        {targetSortField === 'status' ? (
                          targetSortOrder === 'asc' ? <ArrowUp className="w-3.5 h-3.5 text-indigo-600" /> : <ArrowDown className="w-3.5 h-3.5 text-indigo-600" />
                        ) : (
                          <ArrowUpDown className="w-3 h-3 text-slate-300" />
                        )}
                      </div>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredTargets.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400 font-bold">
                        条件に一致する対象者は見つかりませんでした
                      </td>
                    </tr>
                  ) : (
                    filteredTargets.map((user) => {
                      const hasMobile = !!(user.mobileEmail && user.mobileEmail.trim());
                      const hasPersonal = !!(user.personalEmailMasked || user.personalEmailEncrypted);
                      const isBoth = hasMobile && hasPersonal;
                      const isSelected = selectedTargetUserIds.includes(user.id);

                      return (
                        <tr 
                          key={user.id} 
                          className={`transition-colors ${isSelected ? 'bg-indigo-50/60 hover:bg-indigo-50' : 'hover:bg-slate-50/80'}`}
                        >
                          {/* Checkbox */}
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => handleToggleTargetSelect(user.id)}
                              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                            />
                          </td>

                          {/* Name */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <div className="flex items-center gap-2">
                              <img
                                src={user.avatarUrl}
                                alt={user.name}
                                className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                              />
                              <span className="font-bold text-slate-800 text-xs">{user.name}</span>
                            </div>
                          </td>

                          {/* Office */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className="px-2 py-0.5 rounded-md font-bold text-[11px] bg-slate-100 text-slate-700">
                              {user.office || '本社'}
                            </span>
                          </td>

                          {/* Division */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            <span className="font-bold text-slate-700">{user.division || '-'}</span>
                          </td>

                          {/* Company PC Email */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {user.email ? (
                              <div className="flex items-center gap-1 text-[11px] font-mono text-slate-600">
                                <Mail className="w-3 h-3 text-slate-400 shrink-0" />
                                <span>{user.email}</span>
                              </div>
                            ) : (
                              <span className="text-slate-300">-</span>
                            )}
                          </td>

                          {/* Mobile Email */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {hasMobile ? (
                              <div className="flex items-center gap-1 text-[11px] font-mono text-indigo-700 font-bold bg-indigo-50/70 px-2 py-0.5 rounded border border-indigo-100 w-fit">
                                <Smartphone className="w-3 h-3 text-indigo-500 shrink-0" />
                                <span>{user.mobileEmail}</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">未登録</span>
                            )}
                          </td>

                          {/* Personal Email (Encrypted) */}
                          <td className="py-2.5 px-4 whitespace-nowrap">
                            {hasPersonal ? (
                              <div className="flex items-center gap-1.5 text-[11px] font-mono text-emerald-800 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 w-fit">
                                <Lock className="w-3 h-3 text-emerald-600 shrink-0" />
                                <span>{user.personalEmailMasked || '登録済(暗号化)'}</span>
                              </div>
                            ) : (
                              <span className="text-[11px] text-slate-400 italic">未登録</span>
                            )}
                          </td>

                          {/* Registration Badge */}
                          <td className="py-2.5 px-4 text-center whitespace-nowrap">
                            {isBoth ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                両方登録済
                              </span>
                            ) : hasPersonal ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-indigo-100 text-indigo-800 border border-indigo-200">
                                <Lock className="w-3 h-3 text-indigo-600" />
                                個人メール済
                              </span>
                            ) : hasMobile ? (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-blue-100 text-blue-800 border border-blue-200">
                                <Smartphone className="w-3 h-3 text-blue-600" />
                                携帯メール済
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-rose-100 text-rose-700 border border-rose-200">
                                <AlertTriangle className="w-3 h-3 text-rose-500" />
                                未登録
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>

            {/* Table Footer */}
            <div className="p-3.5 bg-slate-50/50 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
              <span>
                表示中: <strong className="text-slate-800">{filteredTargets.length}</strong> 名 / 全体 {allUsers.length} 名
              </span>
              <div className="flex items-center gap-4 text-[11px]">
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" />
                  両方登録: {targetBothRegisteredCount}名
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-indigo-500" />
                  個人メール: {targetPersonalRegisteredCount}名
                </span>
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-rose-500" />
                  未登録: {targetNoneRegisteredCount}名
                </span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: TRIGGER (安否確認発動) */}
      {/* ========================================================================= */}
      {activeTab === 'trigger' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div>
            <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
              <Send className="w-5 h-5 text-rose-600" />
              安否確認の一斉発動
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              災害種別を選択し、WebPush・会社メール・個人メール（暗号化）を通じて全社または指定拠点へ緊急確認を一斉送信します。
            </p>
          </div>

          {/* Quick Template Selector */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-2">
              定型テンプレートからクイック入力
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2">
              {[
                { type: 'earthquake' as DisasterType, label: '地震発生 (震度5強+)' },
                { type: 'tsunami' as DisasterType, label: '津波警報発令' },
                { type: 'typhoon' as DisasterType, label: '台風・暴風特別警報' },
                { type: 'flood' as DisasterType, label: '大雨・河川氾濫' },
                { type: 'fire' as DisasterType, label: '火災・事故' },
                { type: 'drill' as DisasterType, label: '安否確認テスト訓練' },
              ].map((tpl) => (
                <button
                  key={tpl.type}
                  type="button"
                  onClick={() => applyTemplate(tpl.type)}
                  className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all cursor-pointer ${
                    disasterType === tpl.type
                      ? 'bg-rose-50 border-rose-300 text-rose-800 ring-2 ring-rose-400/20'
                      : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  {tpl.label}
                </button>
              ))}
            </div>
          </div>

          <form onSubmit={handleTriggerSubmit} className="space-y-5">
            {/* Type, Title & Level */}
            <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  災害種別 <span className="text-rose-500">*</span>
                </label>
                <select
                  value={disasterType}
                  onChange={(e) => {
                    const selected = e.target.value as DisasterType;
                    applyTemplate(selected);
                  }}
                  className="w-full px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white cursor-pointer"
                >
                  <option value="earthquake">地震 (震度5強以上)</option>
                  <option value="tsunami">津波 (津波警報発令)</option>
                  <option value="typhoon">台風・暴風特別警報</option>
                  <option value="flood">大雨・河川氾濫</option>
                  <option value="fire">火災・重大事故</option>
                  <option value="drill">安否確認テスト訓練</option>
                </select>
              </div>

              <div className="md:col-span-6">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  発動タイトル <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: 【安否確認】地震発生に伴う安否状況確認"
                  value={triggerTitle}
                  onChange={(e) => setTriggerTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
                />
              </div>

              <div className="md:col-span-3">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  災害規模 / 警報レベル
                </label>
                <input
                  type="text"
                  placeholder="例: 震度5強以上"
                  value={triggerLevel}
                  onChange={(e) => setTriggerLevel(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
                />
              </div>
            </div>

            {/* Message */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">
                通知メッセージ本文
              </label>
              <textarea
                rows={3}
                value={triggerMessage}
                onChange={(e) => setTriggerMessage(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white leading-relaxed"
              />
            </div>

            {/* Target Scope */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                通知対象範囲
              </label>
              <div className="flex items-center gap-4 text-xs font-bold">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={targetScope === 'all'}
                    onChange={() => setTargetScope('all')}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  全社員・全拠点 ({allUsers.length}名)
                </label>

                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    name="scope"
                    checked={targetScope === 'offices'}
                    onChange={() => setTargetScope('offices')}
                    className="text-rose-600 focus:ring-rose-500"
                  />
                  特定拠点のみ選択
                </label>
              </div>

              {targetScope === 'offices' && (
                <div className="mt-3 flex flex-wrap gap-2 p-3 bg-slate-50 rounded-xl border border-slate-200">
                  {offices.map((off) => (
                    <label key={off.id} className="flex items-center gap-1.5 text-xs font-bold cursor-pointer bg-white px-2.5 py-1.5 rounded-lg border border-slate-200">
                      <input
                        type="checkbox"
                        checked={selectedOffices.includes(off.name)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedOffices([...selectedOffices, off.name]);
                          } else {
                            setSelectedOffices(selectedOffices.filter(o => o !== off.name));
                          }
                        }}
                        className="text-rose-600 rounded focus:ring-rose-500"
                      />
                      {off.name} ({allUsers.filter(u => u.office === off.name).length}名)
                    </label>
                  ))}
                </div>
              )}
            </div>

            {/* Notification Channels */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                送信通知チャネル
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <Bell className="w-4 h-4 text-rose-600" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">Web Push通知</span>
                      <span className="text-[10px] text-slate-400">スマホ・PCのブラウザへ即時プッシュ</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={useWebPush}
                    onChange={(e) => setUseWebPush(e.target.checked)}
                    className="w-4 h-4 text-rose-600 rounded focus:ring-rose-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <Mail className="w-4 h-4 text-indigo-600" />
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">社内・携帯メール</span>
                      <span className="text-[10px] text-slate-400">PCメール / 携帯メール宛</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={useCompanyEmail}
                    onChange={(e) => setUseCompanyEmail(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500"
                  />
                </label>

                <label className="flex items-center justify-between p-3 rounded-xl border border-emerald-200 bg-emerald-50/30 cursor-pointer">
                  <div className="flex items-center gap-2.5">
                    <Lock className="w-4 h-4 text-emerald-600" />
                    <div>
                      <span className="text-xs font-bold text-emerald-900 block">個人メールアドレス</span>
                      <span className="text-[10px] text-emerald-600">AES-256暗号化された個人アドレス宛</span>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={usePersonalEmail}
                    onChange={(e) => setUsePersonalEmail(e.target.checked)}
                    className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500"
                  />
                </label>
              </div>
            </div>

            {/* Test Mode Flag */}
            <div className="p-3.5 bg-amber-50 rounded-xl border border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <div>
                  <span className="text-xs font-bold text-amber-900 block">テスト発動モード</span>
                  <span className="text-[10px] text-amber-700">
                    ONにするとタイトルに【訓練・テスト】が付与され、実際の緊急発動と区別されます。
                  </span>
                </div>
              </div>
              <input
                type="checkbox"
                checked={isTestMode}
                onChange={(e) => setIsTestMode(e.target.checked)}
                className="w-4 h-4 text-amber-600 rounded focus:ring-amber-500 cursor-pointer"
              />
            </div>

            {/* Submit Button & Test Email Area */}
            <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    if (!showTestEmailInput) {
                      setShowTestEmailInput(true);
                    } else {
                      handleSendTestTriggerMail();
                    }
                  }}
                  disabled={testingSend || !triggerTitle.trim()}
                  className="px-3.5 py-2.5 rounded-xl border border-slate-200 hover:bg-slate-100/80 text-slate-700 text-xs font-bold flex items-center justify-center gap-1.5 transition-all disabled:opacity-50 cursor-pointer shadow-2xs"
                  title="入力中の内容でテストメールを送信し、疎通やフォーマットを確認します"
                >
                  {testingSend ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin text-slate-400" />
                      テストメール送信中...
                    </>
                  ) : (
                    <>
                      <Send className="w-4 h-4 text-slate-500" />
                      自分宛にテスト送信
                    </>
                  )}
                </button>
                {!showTestEmailInput && (
                  <button
                    type="button"
                    onClick={() => setShowTestEmailInput(true)}
                    className="text-[11px] text-indigo-600 hover:text-indigo-800 underline font-bold cursor-pointer"
                  >
                    宛先を指定
                  </button>
                )}
              </div>

              <button
                type="submit"
                disabled={isSending}
                className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md shadow-rose-200 transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Radio className="w-4 h-4" />
                {isSending ? '一斉送信中...' : isTestMode ? 'テスト発動を実行' : '緊急安否確認を発動する'}
              </button>
            </div>

            {/* Test Email Destination Input Box */}
            {showTestEmailInput && (
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    テスト送信先メールアドレス:
                  </span>
                  <button
                    type="button"
                    onClick={() => setShowTestEmailInput(false)}
                    className="text-slate-400 hover:text-slate-600 text-[11px] cursor-pointer"
                  >
                    閉じる
                  </button>
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={testEmailDestination}
                    onChange={(e) => setTestEmailDestination(e.target.value)}
                    placeholder="example@company.co.jp"
                    className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                  <button
                    type="button"
                    onClick={handleSendTestTriggerMail}
                    disabled={testingSend || !triggerTitle.trim() || !testEmailDestination.trim()}
                    className="px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs disabled:opacity-50 cursor-pointer shrink-0"
                  >
                    送信
                  </button>
                </div>
                <p className="text-[11px] text-slate-500">
                  ※PCメール、携帯メール、または届くか確認したい任意のアドレスを指定できます。
                </p>
              </div>
            )}

            {/* Test Result Message Banner */}
            {testResult && (
              <div className={`p-3.5 rounded-xl text-xs flex items-start gap-2.5 ${
                testResult.success 
                  ? testResult.isSimulated ? 'bg-amber-50 text-amber-800 border border-amber-200' : 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                  : 'bg-rose-50 text-rose-800 border border-rose-200'
              }`}>
                {testResult.success ? (
                  <CheckCircle2 className={`w-4 h-4 shrink-0 mt-0.5 ${testResult.isSimulated ? 'text-amber-600' : 'text-emerald-600'}`} />
                ) : (
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                )}
                <div className="space-y-1">
                  <p className="font-bold">{testResult.message}</p>
                  {!testResult.success && (
                    <p className="text-[11px] text-rose-700/80">
                      💡 本番サーバー（社内NAS / オンプレミス）で実メールを配信するには、サーバー環境変数 <code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code> を設定してください。
                    </p>
                  )}
                </div>
              </div>
            )}
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* TAB 3: RESPOND (自分の安否を回答) */}
      {/* ========================================================================= */}
      {activeTab === 'respond' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          <div className="border-b border-slate-100 pb-4 flex items-center justify-between">
            <div>
              <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
                <HeartHandshake className="w-5 h-5 text-rose-600" />
                安否状況の回答
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                回答者: <strong className="text-slate-800">{currentUser.name}</strong> ({currentUser.office || '本社'} / {currentUser.division || '所属'})
              </p>
            </div>
            {activeEvent && (
              <span className="text-xs font-bold text-rose-700 bg-rose-50 px-3 py-1 rounded-full border border-rose-200">
                対象: {activeEvent.title}
              </span>
            )}
          </div>

          {/* 個人メール設定案内バナー */}
          <div className="p-3 bg-indigo-50/70 rounded-xl border border-indigo-100 flex items-center justify-between gap-3 text-xs text-indigo-900">
            <div className="flex items-center gap-2">
              <ShieldAlert className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                <strong>緊急時の個人メール連絡網:</strong> 私用メール（Gmail/iCloud等）への暗号化配信設定・テストは、画面右上の「<strong>マイページ（個人設定）</strong>」から安全に登録・変更できます。
              </span>
            </div>
            {currentUser.personalEmailMasked && (
              <span className="text-[10px] font-mono font-bold text-emerald-800 bg-emerald-100/80 px-2 py-0.5 rounded border border-emerald-200 shrink-0">
                登録済: {currentUser.personalEmailMasked}
              </span>
            )}
          </div>

          {/* 1タップ・クイック入力プリセット */}
          <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2.5">
            <div className="flex items-center justify-between">
              <span className="text-xs font-black text-slate-700 flex items-center gap-1.5">
                ⚡ 1タップ・クイック選択プリセット (急ぎの場合に便利)
              </span>
              <span className="text-[11px] text-slate-500">
                タップすると下の項目が一括自動入力されます
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              <button
                type="button"
                onClick={() => applyQuickPreset('safe')}
                className="p-2.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100/80 text-emerald-900 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center gap-1.5 font-black text-xs text-emerald-800">
                  <span>🟢</span>
                  <span>自身・家族とも無事</span>
                </div>
                <span className="text-[10px] text-emerald-700 mt-1">
                  無事 / 被害なし / 通常出社可
                </span>
              </button>

              <button
                type="button"
                onClick={() => applyQuickPreset('remote')}
                className="p-2.5 rounded-xl border border-blue-200 bg-blue-50 hover:bg-blue-100/80 text-blue-900 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center gap-1.5 font-black text-xs text-blue-800">
                  <span>🟡</span>
                  <span>無事・在宅勤務可</span>
                </div>
                <span className="text-[10px] text-blue-700 mt-1">
                  無事 / 軽微被害 / テレワーク
                </span>
              </button>

              <button
                type="button"
                onClick={() => applyQuickPreset('injured')}
                className="p-2.5 rounded-xl border border-amber-200 bg-amber-50 hover:bg-amber-100/80 text-amber-900 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center gap-1.5 font-black text-xs text-amber-800">
                  <span>🟠</span>
                  <span>軽傷・要確認</span>
                </div>
                <span className="text-[10px] text-amber-700 mt-1">
                  軽傷 / 家族対応 / 出社未定
                </span>
              </button>

              <button
                type="button"
                onClick={() => applyQuickPreset('rescue')}
                className="p-2.5 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100/80 text-rose-900 text-left transition-all cursor-pointer flex flex-col justify-between"
              >
                <div className="flex items-center gap-1.5 font-black text-xs text-rose-800">
                  <span>🔴</span>
                  <span>被害大・要救助</span>
                </div>
                <span className="text-[10px] text-rose-700 mt-1">
                  要救助 / 損壊 / 避難所 / 出社不可
                </span>
              </button>
            </div>
          </div>

          <form onSubmit={handleResponseSubmit} className="space-y-6">
            {/* 1. 本人の安否 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                1. ご自身の安否状況 <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                {[
                  { value: 'safe', label: '無事 (怪我なし)', desc: '身体に支障なし', color: 'emerald' },
                  { value: 'minor_injury', label: '軽傷 (自力対応可)', desc: '治療・応急手当対応中', color: 'amber' },
                  { value: 'severe_injury', label: '重傷 (要手当て)', desc: '病院・手当が必要', color: 'rose' },
                  { value: 'need_rescue', label: '要救助 (緊急)', desc: '閉じ込め・救助要請', color: 'rose' },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`p-3.5 rounded-xl border flex flex-col justify-between cursor-pointer transition-all ${
                      mySafetyStatus === opt.value
                        ? 'bg-rose-50/50 border-rose-500 ring-2 ring-rose-500/20'
                        : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="text-xs font-bold text-slate-800">{opt.label}</span>
                      <input
                        type="radio"
                        name="safetyStatus"
                        value={opt.value}
                        checked={mySafetyStatus === opt.value}
                        onChange={() => setMySafetyStatus(opt.value as any)}
                        className="text-rose-600 focus:ring-rose-500"
                      />
                    </div>
                    <span className="text-[10px] text-slate-500">{opt.desc}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* 2. 家族の安否 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                2. 同居家族・ご親族の状況
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { value: 'all_safe', label: '全員無事' },
                  { value: 'injured', label: '負傷者あり' },
                  { value: 'unreachable', label: '連絡取れず・確認中' },
                  { value: 'none', label: '単身 / 該当なし' },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`p-2.5 rounded-xl border text-xs font-bold text-center cursor-pointer transition-all ${
                      myFamilyStatus === opt.value
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="familyStatus"
                      value={opt.value}
                      checked={myFamilyStatus === opt.value}
                      onChange={() => setMyFamilyStatus(opt.value as any)}
                      className="hidden"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* 3. 家屋・自宅の状況 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                3. 自宅・家屋の被害状況
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { value: 'no_damage', label: '被害なし' },
                  { value: 'partial_damage', label: '一部損壊 / 停電・断水' },
                  { value: 'severe_damage', label: '大規模損壊 / 倒壊' },
                  { value: 'evacuated', label: '避難所へ避難中' },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`p-2.5 rounded-xl border text-xs font-bold text-center cursor-pointer transition-all ${
                      myHouseStatus === opt.value
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="houseStatus"
                      value={opt.value}
                      checked={myHouseStatus === opt.value}
                      onChange={() => setMyHouseStatus(opt.value as any)}
                      className="hidden"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* 4. 出社・就業可否 */}
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-2">
                4. 今後の出社・テレワーク可否 <span className="text-rose-500">*</span>
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                {[
                  { value: 'available', label: '通常通り出社可' },
                  { value: 'remote_only', label: '在宅勤務・リモート可' },
                  { value: 'unavailable', label: '出社不可 (対応優先)' },
                  { value: 'undecided', label: '未定 / 状況判断中' },
                ].map((opt) => (
                  <label
                    key={opt.value}
                    className={`p-2.5 rounded-xl border text-xs font-bold text-center cursor-pointer transition-all ${
                      myWorkAvailability === opt.value
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <input
                      type="radio"
                      name="workAvailability"
                      value={opt.value}
                      checked={myWorkAvailability === opt.value}
                      onChange={() => setMyWorkAvailability(opt.value as any)}
                      className="hidden"
                    />
                    {opt.label}
                  </label>
                ))}
              </div>
            </div>

            {/* 5. 現在地 */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    5. 現在地・避難場所
                  </label>
                  <button
                    type="button"
                    onClick={handleGetLocation}
                    disabled={isGettingLocation}
                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer disabled:opacity-50"
                    title="スマートフォンのGPS位置情報を取得して現在地に自動入力します"
                  >
                    {isGettingLocation ? (
                      <>
                        <RefreshCw className="w-3 h-3 animate-spin" />
                        <span>GPS取得中...</span>
                      </>
                    ) : (
                      <>
                        <span>📍 GPS現在地を取得</span>
                      </>
                    )}
                  </button>
                </div>
                <input
                  type="text"
                  value={myLocation}
                  onChange={(e) => setMyLocation(e.target.value)}
                  placeholder="自宅 / 〇〇小学校体育館 / 営業先 等"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  6. 連絡事項・会社への要望・特記事項
                </label>
                <input
                  type="text"
                  value={myComment}
                  onChange={(e) => setMyComment(e.target.value)}
                  placeholder="家族の状況や必要支援、出社目処など"
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
                />
              </div>
            </div>

            {/* Submit */}
            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                type="submit"
                disabled={isSubmittingResponse}
                className="px-8 py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-extrabold rounded-xl shadow-md shadow-rose-200 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSubmittingResponse ? '送信中...' : '安否状況を回答・登録する'}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: 個人メール登録依頼メール送信モーダル */}
      {/* ========================================================================= */}
      {isRequestModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-xl w-full overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 bg-gradient-to-r from-indigo-600 to-indigo-700 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white">
                  <Mail className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black">
                    個人メール登録の依頼メールを送信
                  </h3>
                  <p className="text-xs text-indigo-100 mt-0.5">
                    選択した対象者へ、緊急連絡先（個人メール）の登録を促す案内メールを一斉配信します
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsRequestModalOpen(false)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-5 overflow-y-auto flex-1 text-xs">
              {/* Target Count & List Preview */}
              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-700 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-600" />
                    送信対象者: <strong className="text-indigo-600 text-sm font-black">{selectedTargetUserIds.length}</strong> 名
                  </span>
                  <span className="text-[11px] text-slate-500">
                    （全社対象者一覧より選択中）
                  </span>
                </div>

                <div className="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto p-2 bg-white rounded-xl border border-slate-200">
                  {selectedTargetUserIds.map(id => {
                    const u = allUsers.find(user => user.id === id);
                    if (!u) return null;
                    const hasPersonal = !!(u.personalEmailMasked || u.personalEmailEncrypted);
                    return (
                      <span
                        key={u.id}
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${
                          hasPersonal 
                            ? 'bg-slate-100 text-slate-700 border-slate-200' 
                            : 'bg-rose-50 text-rose-700 border-rose-200'
                        }`}
                      >
                        {u.name}
                        {!hasPersonal && <span className="text-[9px] bg-rose-200 text-rose-800 px-1 rounded">未</span>}
                      </span>
                    );
                  })}
                </div>
              </div>

              {/* Delivery Channels */}
              <div className="space-y-2">
                <label className="font-bold text-slate-800 block">
                  送信先チャネルの選択 <span className="text-rose-500">*</span>
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 cursor-pointer transition-colors">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-slate-600" />
                      <div>
                        <span className="font-bold text-slate-800 block">会社PCメール宛</span>
                        <span className="text-[10px] text-slate-400">社内アドレス (example@company.co.jp)</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={requestSendCompany}
                      onChange={(e) => setRequestSendCompany(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                    />
                  </label>

                  <label className="flex items-center justify-between p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100/70 cursor-pointer transition-colors">
                    <div className="flex items-center gap-2">
                      <Smartphone className="w-4 h-4 text-indigo-600" />
                      <div>
                        <span className="font-bold text-slate-800 block">会社携帯メール宛</span>
                        <span className="text-[10px] text-slate-400">支給携帯のアドレス</span>
                      </div>
                    </div>
                    <input
                      type="checkbox"
                      checked={requestSendMobile}
                      onChange={(e) => setRequestSendMobile(e.target.checked)}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                    />
                  </label>
                </div>
              </div>

              {/* Custom Message input */}
              <div className="space-y-1.5">
                <label className="font-bold text-slate-800 block">
                  管理者からの案内メッセージ（任意・追加文面）
                </label>
                <textarea
                  value={requestCustomMessage}
                  onChange={(e) => setRequestCustomMessage(e.target.value)}
                  placeholder="例：来期のBCP対策および災害時初動体制強化のため、各自ご自身の私用メールアドレス（Gmailや携帯キャリアメール等）の登録にご協力をお願いいたします。"
                  rows={3}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-700 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-none"
                />
              </div>

              {/* Email Content Direct-link preview */}
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl space-y-2">
                <div className="flex items-center gap-2 font-bold text-indigo-900">
                  <ShieldCheck className="w-4 h-4 text-indigo-600" />
                  <span>スムーズなワンクリック登録の仕組み</span>
                </div>
                <p className="text-[11px] text-indigo-800 leading-relaxed">
                  配信されるメールには、専用のディープリンクURLが記載されます。受信者がURLをクリックすると、<strong>マイページの「安否確認・緊急連絡先（個人メール）」が自動的に展開された状態</strong>で開くため、社員が迷わずスムーズに登録できます。
                </p>
                <div className="p-2 bg-white rounded-lg border border-indigo-200 font-mono text-[10px] text-indigo-700 break-all select-all">
                  {window.location.origin + window.location.pathname}?tab=mypage&openEmergencyContact=true
                </div>
              </div>

              {/* Privacy Notice */}
              <div className="flex items-start gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-900">
                <Lock className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed">
                  <strong>高度暗号化（AES-256-GCM）保護:</strong> 登録された個人メールはサーバー上で暗号化され、管理者を含め第三者からは伏字（<code>m***@gmail.com</code> 等）で保護されます。
                </p>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setIsRequestModalOpen(false)}
                disabled={isSendingRequest}
                className="px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 font-bold transition-colors cursor-pointer"
              >
                キャンセル
              </button>

              <button
                type="button"
                onClick={handleSendRegistrationRequest}
                disabled={isSendingRequest || selectedTargetUserIds.length === 0}
                className="px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold flex items-center gap-2 shadow-md shadow-indigo-200 transition-all cursor-pointer disabled:opacity-50"
              >
                {isSendingRequest ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>送信処理中...</span>
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    <span>登録依頼メールを送信する ({selectedTargetUserIds.length}名)</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* MODAL: 登録依頼送信結果モーダル */}
      {/* ========================================================================= */}
      {requestResultModal && requestResultModal.open && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-md w-full overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className={`p-5 flex items-center gap-3 text-white ${
              requestResultModal.success ? 'bg-emerald-600' : 'bg-rose-600'
            }`}>
              <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0">
                {requestResultModal.success ? (
                  <CheckCircle2 className="w-6 h-6" />
                ) : (
                  <AlertTriangle className="w-6 h-6" />
                )}
              </div>
              <div>
                <h3 className="text-base font-black">
                  {requestResultModal.success ? '登録依頼メール送信完了' : '送信エラー'}
                </h3>
                <p className="text-xs text-white/90">
                  {requestResultModal.success ? '対象社員への配信が正常に完了しました' : 'メールの送信中に問題が発生しました'}
                </p>
              </div>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="font-bold text-slate-800 leading-relaxed">
                {requestResultModal.message}
              </p>

              {requestResultModal.details && (
                <div className="p-3.5 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-slate-600 font-mono text-[11px]">
                  <div className="flex justify-between">
                    <span>送信対象者数:</span>
                    <strong className="text-slate-900">{requestResultModal.details.totalRequested || 0} 名</strong>
                  </div>
                  <div className="flex justify-between">
                    <span>正常配信数:</span>
                    <strong className="text-emerald-700">{requestResultModal.details.sentCount || 0} 名</strong>
                  </div>
                  {requestResultModal.details.skippedCount > 0 && (
                    <div className="flex justify-between text-amber-700">
                      <span>スキップ (宛先なし):</span>
                      <strong>{requestResultModal.details.skippedCount} 名</strong>
                    </div>
                  )}
                  {requestResultModal.details.directUrl && (
                    <div className="pt-2 border-t border-slate-200">
                      <span className="text-[10px] text-slate-500 font-sans block mb-1">配信された登録先URL:</span>
                      <div className="p-2 bg-white rounded border border-slate-200 text-[10px] break-all select-all">
                        {requestResultModal.details.directUrl}
                      </div>
                    </div>
                  )}
                </div>
              )}

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setRequestResultModal(null)}
                  className="px-6 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white font-bold transition-colors cursor-pointer text-xs"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
export default SafetyConfirmation;
