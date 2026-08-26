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
  Info
} from 'lucide-react';
import { User, OfficeMaster, DivisionMaster, DisasterType } from '../types';

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
  allUsers,
  offices,
  divisions,
  onOpenConfirmModal,
}) => {
  // Tabs: 'dashboard' (発動中・集計), 'trigger' (安否確認発動), 'respond' (安否回答)
  const [activeTab, setActiveTab] = useState<'dashboard' | 'trigger' | 'respond'>('dashboard');

  // Events & responses state
  const [events, setEvents] = useState<SafetyConfirmationEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [responses, setResponses] = useState<SafetyConfirmationResponse[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSending, setIsSending] = useState(false);
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

  // Filter in Dashboard
  const [statusFilter, setStatusFilter] = useState<'all' | 'safe' | 'unanswered' | 'danger'>('all');
  const [searchKeyword, setSearchKeyword] = useState('');
  const [selectedOfficeFilter, setSelectedOfficeFilter] = useState('all');

  // Load events on mount
  useEffect(() => {
    fetchEvents();
  }, []);

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
      const res = await fetch('/api/safety-events');
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
      const res = await fetch(`/api/safety-events/${eventId}/responses`);
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

  // Handle Trigger Submit
  const handleTriggerSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!triggerTitle.trim()) {
      setActionMessage({ type: 'error', text: '発動タイトルを入力してください。' });
      return;
    }

    const payload = {
      title: triggerTitle.trim(),
      disasterType,
      level: triggerLevel,
      message: triggerMessage.trim(),
      targetScope,
      targetOffices: targetScope === 'offices' ? selectedOffices : undefined,
      targetDivisions: targetScope === 'divisions' ? selectedDivisions : undefined,
      channels: {
        webPush: useWebPush,
        companyEmail: useCompanyEmail,
        personalEmail: usePersonalEmail,
      },
      isTest: isTestMode,
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
      const res = await fetch('/api/safety-events', {
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

      const res = await fetch(`/api/safety-events/${activeEvent.id}/respond`, {
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
      const res = await fetch(`/api/safety-events/${activeEvent.id}/remind`, {
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

  // Filtered members list
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
                    CSVエクスポート
                  </button>

                  <button
                    onClick={handleSendReminder}
                    disabled={isSending}
                    className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs disabled:opacity-50"
                  >
                    <Bell className="w-3.5 h-3.5" />
                    未回答者へ一括再通知 ({totalUsersCount - answeredCount}名)
                  </button>

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
      {/* TAB 2: TRIGGER (安否確認発動) */}
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
            {/* Title & Level */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  発動タイトル <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={triggerTitle}
                  onChange={(e) => setTriggerTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold focus:outline-none focus:ring-2 focus:ring-rose-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  災害規模 / 警報レベル
                </label>
                <input
                  type="text"
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

            {/* Submit Button */}
            <div className="pt-2 flex justify-end">
              <button
                type="submit"
                disabled={isSending}
                className="px-6 py-3 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl shadow-md shadow-rose-200 transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
                {isSending ? '一斉送信中...' : isTestMode ? 'テスト発動を実行' : '緊急安否確認を発動する'}
              </button>
            </div>
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
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  5. 現在地・避難場所
                </label>
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
    </div>
  );
};
export default SafetyConfirmation;
