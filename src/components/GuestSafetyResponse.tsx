import React, { useState, useEffect } from 'react';
import {
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  AlertOctagon,
  HeartHandshake,
  Home,
  Briefcase,
  MapPin,
  Send,
  RefreshCw,
  Sparkles,
  Info,
  Clock,
  User as UserIcon,
  Check,
  Building2
} from 'lucide-react';
import { API_BASE_URL } from '../config/api';
import { User } from '../types';

interface GuestSafetyResponseProps {
  eventId: string;
  userId?: string;
  token?: string;
  allUsers?: User[];
  onGoToLogin?: () => void;
}

export const GuestSafetyResponse: React.FC<GuestSafetyResponseProps> = ({
  eventId,
  userId: initialUserId,
  allUsers = [],
  onGoToLogin
}) => {
  const [selectedUserId, setSelectedUserId] = useState<string>(initialUserId || '');
  const [user, setUser] = useState<User | null>(null);
  const [eventData, setEventData] = useState<any>(null);
  const [isLoadingEvent, setIsLoadingEvent] = useState(true);
  const [userList, setUserList] = useState<User[]>(allUsers);

  // Form states
  const [safetyStatus, setSafetyStatus] = useState<'safe' | 'minor_injury' | 'severe_injury' | 'need_rescue'>('safe');
  const [workAvailability, setWorkAvailability] = useState<'available' | 'remote_only' | 'unavailable' | 'undecided'>('available');
  const [familyStatus, setFamilyStatus] = useState<'all_safe' | 'injured' | 'unreachable' | 'none'>('all_safe');
  const [houseStatus, setHouseStatus] = useState<'no_damage' | 'partial_damage' | 'severe_damage' | 'evacuated'>('no_damage');
  const [locationStatus, setLocationStatus] = useState<string>('自宅');
  const [message, setMessage] = useState<string>('');
  
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [submittedData, setSubmittedData] = useState<any>(null);
  const [isLocating, setIsLocating] = useState(false);

  // 1. ユーザー一覧の取得（未設定時の選択用およびユーザー特定用）
  useEffect(() => {
    if (userList.length === 0) {
      fetch(`${API_BASE_URL}/users`)
        .then(res => res.json())
        .then(data => {
          if (Array.isArray(data)) {
            setUserList(data);
          }
        })
        .catch(err => console.warn('Failed to load users in guest mode:', err));
    }
  }, [userList.length]);

  // 2. ユーザー特定
  useEffect(() => {
    if (selectedUserId && userList.length > 0) {
      const found = userList.find(u => String(u.id) === String(selectedUserId));
      if (found) {
        setUser(found);
      }
    }
  }, [selectedUserId, userList]);

  // 3. イベント情報のロード
  useEffect(() => {
    let isMounted = true;
    setIsLoadingEvent(true);
    setErrorMsg(null);

    const fetchEvent = async () => {
      try {
        // safety-events API からイベント情報を取得
        let res = await fetch(`${API_BASE_URL}/safety-events/${eventId}`);
        if (!res.ok) {
          res = await fetch(`${API_BASE_URL}/safety/events/${eventId}`);
        }
        if (res.ok) {
          const data = await res.json();
          if (isMounted) {
            setEventData(data);
            // 既存の回答があるか確認
            if (data.responses && selectedUserId) {
              const prev = data.responses.find((r: any) => String(r.userId) === String(selectedUserId));
              if (prev) {
                setSafetyStatus(prev.safetyStatus || 'safe');
                setWorkAvailability(prev.workAvailability || 'available');
                setFamilyStatus(prev.familyStatus || 'all_safe');
                setHouseStatus(prev.houseStatus || 'no_damage');
                setLocationStatus(prev.locationStatus || '自宅');
                setMessage(prev.message || '');
              }
            }
          }
        } else {
          // イベント一覧から検索フォールバック
          const listRes = await fetch(`${API_BASE_URL}/safety-events`);
          if (listRes.ok) {
            const list = await listRes.json();
            const found = list.find((e: any) => String(e.id) === String(eventId));
            if (found && isMounted) {
              setEventData(found);
            }
          }
        }
      } catch (err: any) {
        console.error('Failed to fetch event:', err);
      } finally {
        if (isMounted) setIsLoadingEvent(false);
      }
    };

    if (eventId) {
      fetchEvent();
    }
    return () => { isMounted = false; };
  }, [eventId, selectedUserId]);

  // GPS現在地取得
  const handleGetLocation = () => {
    if (!navigator.geolocation) {
      alert('お使いの端末・ブラウザでは位置情報取得がサポートされていません。');
      return;
    }
    setIsLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setIsLocating(false);
        const { latitude, longitude } = pos.coords;
        const locStr = `GPS位置情報: 北緯${latitude.toFixed(4)}° 東経${longitude.toFixed(4)}° 付近`;
        setLocationStatus(prev => prev ? `${prev} (${locStr})` : locStr);
      },
      (err) => {
        setIsLocating(false);
        alert(`位置情報の取得に失敗しました: ${err.message || '位置情報の利用を許可してください'}`);
      },
      { timeout: 10000, enableHighAccuracy: false }
    );
  };

  // 送信処理
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId) {
      setErrorMsg('対象社員を選択してください。');
      return;
    }

    setIsSubmitting(true);
    setErrorMsg(null);

    const payload = {
      userId: selectedUserId,
      userName: user ? user.name : '社員',
      office: user?.office || '',
      division: user?.division || user?.department || '',
      safetyStatus,
      workAvailability,
      familyStatus,
      houseStatus,
      locationStatus: locationStatus.trim(),
      message: message.trim(),
      respondedAt: new Date().toISOString()
    };

    try {
      let res = await fetch(`${API_BASE_URL}/safety-events/${eventId}/respond`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) {
        res = await fetch(`${API_BASE_URL}/safety/events/${eventId}/respond`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
      }

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `送信に失敗しました (HTTP ${res.status})`);
      }

      setSubmittedData(payload);
      setIsSubmitted(true);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      console.error('Submit safety response error:', err);
      setErrorMsg(err.message || '送信中にエラーが発生しました。通信環境をご確認の上、再度お試しください。');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 1. 送信完了画面 (他画面への遷移を完全にブロック)
  if (isSubmitted) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col justify-between py-6 px-4 sm:px-6 lg:px-8 font-sans">
        <div className="max-w-lg w-full mx-auto space-y-6">
          {/* Header Branding */}
          <div className="text-center space-y-1">
            <div className="inline-flex items-center justify-center w-12 h-12 bg-emerald-600 text-white rounded-2xl shadow-md mb-2">
              <CheckCircle2 className="w-7 h-7" />
            </div>
            <h1 className="text-xl font-black text-slate-900 tracking-tight">安否状況の回答を受け付けました</h1>
            <p className="text-xs text-slate-500 font-medium">寺岡オートドア / 寺子屋SNS 緊急安否確認本部</p>
          </div>

          {/* Main Success Card */}
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 p-6 sm:p-8 space-y-6">
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3.5">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div className="text-sm text-emerald-900 leading-relaxed">
                <p className="font-bold">回答内容は正常に対策本部へ送信されました。</p>
                <p className="text-xs text-emerald-800 mt-1">
                  ご協力ありがとうございました。身の回りの安全を最優先にし、無理のない行動をお願いいたします。
                </p>
              </div>
            </div>

            {/* 回答控え */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider">ご回答内容の控え</h3>
              <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 space-y-2.5 text-sm">
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 text-xs">対象社員</span>
                  <span className="font-bold text-slate-900">{submittedData?.userName} 様</span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 text-xs">ご本人の安否</span>
                  <span className={`font-bold px-2 py-0.5 rounded text-xs ${
                    submittedData?.safetyStatus === 'safe' ? 'bg-emerald-100 text-emerald-800' :
                    submittedData?.safetyStatus === 'minor_injury' ? 'bg-amber-100 text-amber-800' :
                    submittedData?.safetyStatus === 'severe_injury' ? 'bg-rose-100 text-rose-800' : 'bg-red-600 text-white'
                  }`}>
                    {submittedData?.safetyStatus === 'safe' && '🟢 無事・怪我なし'}
                    {submittedData?.safetyStatus === 'minor_injury' && '🟡 軽傷（処置済）'}
                    {submittedData?.safetyStatus === 'severe_injury' && '🔴 重傷（要治療）'}
                    {submittedData?.safetyStatus === 'need_rescue' && '🚨 要救助'}
                  </span>
                </div>
                <div className="flex justify-between items-center py-1 border-b border-slate-200/60">
                  <span className="text-slate-500 text-xs">出社・業務可否</span>
                  <span className="font-semibold text-slate-800 text-xs">
                    {submittedData?.workAvailability === 'available' && '🏢 通常出社可能'}
                    {submittedData?.workAvailability === 'remote_only' && '💻 在宅・現場直行可能'}
                    {submittedData?.workAvailability === 'unavailable' && '🚫 出社・業務不可'}
                    {submittedData?.workAvailability === 'undecided' && '❓ 未定・確認中'}
                  </span>
                </div>
                {submittedData?.locationStatus && (
                  <div className="flex justify-between items-start py-1 border-b border-slate-200/60">
                    <span className="text-slate-500 text-xs shrink-0">現在の居場所</span>
                    <span className="font-medium text-slate-800 text-xs text-right">{submittedData?.locationStatus}</span>
                  </div>
                )}
                {submittedData?.message && (
                  <div className="pt-1">
                    <span className="text-slate-500 text-xs block mb-1">本部への連絡事項</span>
                    <p className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-slate-200 whitespace-pre-wrap">
                      {submittedData?.message}
                    </p>
                  </div>
                )}
                <div className="pt-2 text-right">
                  <span className="text-[11px] text-slate-400">送信日時: {new Date().toLocaleString('ja-JP')}</span>
                </div>
              </div>
            </div>

            {/* 再修正ボタン */}
            <div className="pt-2 flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setIsSubmitted(false)}
                className="w-full py-3 px-4 border border-slate-300 text-slate-700 text-sm font-bold rounded-xl hover:bg-slate-50 transition-colors flex items-center justify-center gap-2"
              >
                <RefreshCw className="w-4 h-4 text-slate-500" />
                回答内容を変更・再送信する
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="text-center pt-6 space-y-2">
          {onGoToLogin && (
            <button
              type="button"
              onClick={onGoToLogin}
              className="text-xs text-indigo-600 hover:text-indigo-800 hover:underline font-medium"
            >
              社内SNS ログイン画面へ進む（要アカウント）
            </button>
          )}
          <p className="text-[11px] text-slate-400">
            © 寺岡オートドア / 寺子屋SNS 緊急安否確認システム
          </p>
        </div>
      </div>
    );
  }

  // 2. 回答入力フォーム画面 (ログイン不要・完全隔離)
  return (
    <div className="min-h-screen bg-slate-900/5 py-4 sm:py-8 px-3 sm:px-6 lg:px-8 font-sans">
      <div className="max-w-lg w-full mx-auto space-y-4 sm:space-y-6">
        {/* Emergency Alert Header Banner */}
        <div className="bg-gradient-to-r from-red-600 to-rose-700 text-white rounded-2xl p-4 sm:p-5 shadow-lg border border-red-500">
          <div className="flex items-start gap-3">
            <div className="p-2 bg-white/20 rounded-xl shrink-0 mt-0.5">
              <ShieldAlert className="w-6 h-6 text-white animate-pulse" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="bg-white/30 text-white text-[10px] font-black uppercase px-2 py-0.5 rounded-full tracking-wider">
                  緊急安否確認
                </span>
                {eventData?.isDrill && (
                  <span className="bg-amber-400 text-slate-900 text-[10px] font-bold px-2 py-0.5 rounded-full">
                    ※ 訓練配信
                  </span>
                )}
              </div>
              <h1 className="text-base sm:text-lg font-black mt-1 leading-snug break-words">
                {eventData?.title || '緊急安否確認が発動されました'}
              </h1>
              {eventData?.message && (
                <p className="text-xs text-red-100 mt-1.5 bg-black/15 p-2.5 rounded-lg whitespace-pre-wrap leading-relaxed">
                  {eventData.message}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* 回答フォームカード */}
        <form onSubmit={handleSubmit} className="bg-white rounded-2xl shadow-xl border border-slate-200 p-5 sm:p-7 space-y-6">
          {/* 社員情報・特定 */}
          <div className="border-b border-slate-100 pb-4">
            <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">
              回答対象社員 <span className="text-red-500">*</span>
            </label>
            {user ? (
              <div className="flex items-center gap-3 p-3 bg-slate-50 border border-slate-200 rounded-xl">
                <div className="w-10 h-10 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-base shrink-0">
                  {user.name ? user.name[0] : '社'}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-1.5">
                    {user.name} 様
                    <span className="text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded font-medium">
                      認証完了
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 truncate">
                    {user.office || '全社'} {user.division || ''} {user.position ? `(${user.position})` : ''}
                  </div>
                </div>
              </div>
            ) : (
              <div>
                <select
                  value={selectedUserId}
                  onChange={(e) => setSelectedUserId(e.target.value)}
                  className="w-full text-sm font-semibold p-3 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:outline-hidden"
                  required
                >
                  <option value="">-- お名前を選択してください --</option>
                  {userList.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.office || ''} {u.division || ''})
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-400 mt-1">※ メールリンクから開かれた場合は自動で選択されます</p>
              </div>
            )}
          </div>

          {/* 1. ご本人の安否 (必須・大きなボタングループ) */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              1. ご自身の安否状況 <span className="text-red-500 font-bold">*必須</span>
            </label>
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3">
              {[
                { key: 'safe', label: '無事', sub: '怪我なし・安全', color: 'border-emerald-500 bg-emerald-50/70 text-emerald-950 ring-2 ring-emerald-500', icon: '🟢' },
                { key: 'minor_injury', label: '軽傷', sub: '処置済・移動可', color: 'border-amber-500 bg-amber-50/70 text-amber-950 ring-2 ring-amber-500', icon: '🟡' },
                { key: 'severe_injury', label: '重傷', sub: '要治療・歩行困難', color: 'border-rose-500 bg-rose-50/70 text-rose-950 ring-2 ring-rose-500', icon: '🔴' },
                { key: 'need_rescue', label: '要救助', sub: '脱出不能・救助要請', color: 'border-red-600 bg-red-100 text-red-950 ring-2 ring-red-600 animate-pulse', icon: '🚨' }
              ].map((item) => {
                const isSelected = safetyStatus === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setSafetyStatus(item.key as any)}
                    className={`p-3 sm:p-3.5 rounded-xl border text-left transition-all relative flex flex-col justify-between ${
                      isSelected ? item.color : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-base font-black flex items-center gap-1.5">
                        <span>{item.icon}</span> {item.label}
                      </span>
                      {isSelected && <Check className="w-4 h-4 shrink-0 font-bold" />}
                    </div>
                    <span className="text-[11px] text-slate-500 mt-1 block">{item.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 2. 出社・業務可否 */}
          <div className="space-y-2">
            <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
              2. 出社・業務可否
            </label>
            <div className="grid grid-cols-2 gap-2">
              {[
                { key: 'available', label: '通常出社可能', icon: '🏢' },
                { key: 'remote_only', label: '在宅/現場直行可', icon: '💻' },
                { key: 'unavailable', label: '出社・業務不可', icon: '🚫' },
                { key: 'undecided', label: '未定・確認中', icon: '❓' }
              ].map((item) => {
                const isSelected = workAvailability === item.key;
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => setWorkAvailability(item.key as any)}
                    className={`p-2.5 rounded-xl border text-xs font-bold text-left transition-all flex items-center justify-between ${
                      isSelected
                        ? 'border-indigo-600 bg-indigo-50/80 text-indigo-900 ring-2 ring-indigo-500'
                        : 'border-slate-200 hover:border-slate-300 bg-white text-slate-700'
                    }`}
                  >
                    <span className="flex items-center gap-1.5">
                      <span>{item.icon}</span> {item.label}
                    </span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0 font-bold" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3. ご家族・住居の状況 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            {/* 家族 */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                ご家族の状況
              </label>
              <select
                value={familyStatus}
                onChange={(e) => setFamilyStatus(e.target.value as any)}
                className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="all_safe">👨‍👩‍👧 全員無事</option>
                <option value="injured">⚠️ けが人あり</option>
                <option value="unreachable">❓ 連絡取れず・安否未確認</option>
                <option value="none">👤 単身・該当なし</option>
              </select>
            </div>
            {/* 自宅 */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">
                自宅・周囲の状況
              </label>
              <select
                value={houseStatus}
                onChange={(e) => setHouseStatus(e.target.value as any)}
                className="w-full text-xs font-semibold p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
              >
                <option value="no_damage">🏠 被害なし・安全</option>
                <option value="partial_damage">🏚️ 一部損壊・停電/断水</option>
                <option value="evacuated">⛺ 避難所へ避難中</option>
                <option value="severe_damage">💥 全壊・大規模損壊</option>
              </select>
            </div>
          </div>

          {/* 4. 現在の居場所・位置情報 */}
          <div className="space-y-1.5 pt-1">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700">
                現在の居場所
              </label>
              <button
                type="button"
                onClick={handleGetLocation}
                disabled={isLocating}
                className="inline-flex items-center gap-1 text-[11px] text-indigo-600 hover:text-indigo-800 font-bold bg-indigo-50 px-2 py-0.5 rounded-md hover:bg-indigo-100 transition-colors"
              >
                <MapPin className="w-3 h-3" />
                {isLocating ? 'GPS取得中...' : 'GPS現在地を付加'}
              </button>
            </div>
            <div className="flex gap-1.5 flex-wrap pb-1">
              {['自宅', '会社・事務所', '現場・移動中', '避難所'].map(preset => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => setLocationStatus(preset)}
                  className={`text-xs px-2.5 py-1 rounded-lg border font-medium transition-colors ${
                    locationStatus.startsWith(preset)
                      ? 'bg-slate-800 text-white border-slate-800'
                      : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  {preset}
                </button>
              ))}
            </div>
            <input
              type="text"
              value={locationStatus}
              onChange={(e) => setLocationStatus(e.target.value)}
              placeholder="例: 東京都港区 自宅 (または避難所名・移動先)"
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          {/* 5. 会社・本部への連絡・要望事項 */}
          <div className="space-y-1.5 pt-1">
            <label className="block text-xs font-bold text-slate-700">
              会社・本部への連絡事項・要望 (任意)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={3}
              placeholder="怪我の状況、停電・断水の有無、救助の要請、出社目処などを自由に入力してください。"
              className="w-full text-xs p-2.5 bg-slate-50 border border-slate-300 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:outline-hidden"
            />
          </div>

          {/* エラー表示 */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-800 rounded-xl text-xs flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 送信ボタン */}
          <button
            type="submit"
            disabled={isSubmitting || !selectedUserId}
            className={`w-full py-4 px-6 rounded-2xl text-white font-black text-base shadow-lg transition-all flex items-center justify-center gap-2 ${
              isSubmitting || !selectedUserId
                ? 'bg-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-700 hover:to-rose-700 active:scale-[0.99] shadow-red-500/25'
            }`}
          >
            {isSubmitting ? (
              <>
                <RefreshCw className="w-5 h-5 animate-spin" />
                回答を本部に送信中...
              </>
            ) : (
              <>
                <Send className="w-5 h-5" />
                安否回答を送信する
              </>
            )}
          </button>
        </form>

        {/* Footer info (他画面への遷移不可・安全な注記) */}
        <div className="text-center space-y-1.5 pt-2">
          <p className="text-[11px] text-slate-400">
            ※ この画面は緊急安否確認専用の回答フォームです。他画面へのアクセスは制限されています。
          </p>
          {onGoToLogin && (
            <button
              type="button"
              onClick={onGoToLogin}
              className="text-xs text-slate-400 hover:text-slate-600 hover:underline inline-block pt-1"
            >
              社内SNSへログイン
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
