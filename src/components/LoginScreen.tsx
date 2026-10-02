import React, { useState, useEffect } from 'react';
import { User, OfficeMaster, DivisionMaster, PositionMaster } from '../types';
import { API_BASE_URL } from '../config/api';
import { 
  Lock, 
  User as UserIcon, 
  LogIn, 
  AlertCircle, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  UserPlus, 
  CheckCircle2, 
  Mail, 
  Building2, 
  Layers, 
  Briefcase, 
  KeyRound, 
  Smartphone, 
  Phone, 
  RefreshCw,
  ArrowLeft,
  Sparkles
} from 'lucide-react';
import { getAvatarUrl, SILHOUETTE_SVG, sanitizeAvatarUrlForSave } from '../utils/avatar';

const DEFAULT_OFFICES: OfficeMaster[] = [
  { id: 'off-1', name: '本社', type: 'headquarter', code: 'HONSHA' },
  { id: 'off-2', name: '名古屋支店', type: 'branch', code: 'NAGOYA' },
  { id: 'off-3', name: '静岡営業所', type: 'sales_office', code: 'SHIZUOKA' },
  { id: 'off-4', name: '三河営業所', type: 'sales_office', code: 'MIKAWA' },
  { id: 'off-5', name: '三重営業所', type: 'sales_office', code: 'MIE' },
  { id: 'off-6', name: '岐阜営業所', type: 'sales_office', code: 'GIFU' },
  { id: 'off-7', name: '東京支店', type: 'branch', code: 'TOKYO' },
  { id: 'off-8', name: '大阪支店', type: 'branch', code: 'OSAKA' }
];

const DEFAULT_DIVISIONS: DivisionMaster[] = [
  { id: 'div-1', name: '管理部', code: 'KANRI' },
  { id: 'div-2', name: '営業部', code: 'EIGYO' },
  { id: 'div-3', name: '設計部', code: 'SEKKEI' },
  { id: 'div-4', name: '工務部', code: 'KOMU' },
  { id: 'div-5', name: '保守部', code: 'HOSHU' },
  { id: 'div-6', name: '総務部', code: 'SOUMU' },
  { id: 'div-7', name: '製造部', code: 'SEIZO' },
  { id: 'div-8', name: '開発部', code: 'KAIHATSU' },
  { id: 'div-9', name: 'IT', code: 'IT' },
  { id: 'div-10', name: '人事', code: 'JINJI' },
  { id: 'div-11', name: '経理', code: 'KEIRI' }
];

const DEFAULT_POSITIONS: PositionMaster[] = [
  { id: 'pos-1', name: '代表取締役', code: 'CEO' },
  { id: 'pos-2', name: '役員', code: 'EXEC' },
  { id: 'pos-3', name: '部長', code: 'BUCHO' },
  { id: 'pos-4', name: '課長', code: 'KACHO' },
  { id: 'pos-5', name: '係長', code: 'KAKARICHO' },
  { id: 'pos-6', name: '主任', code: 'SHUNIN' },
  { id: 'pos-7', name: '一般', code: 'IPPAN' }
];

interface LoginScreenProps {
  users: User[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  positions?: PositionMaster[];
  initialAuthMode?: 'login' | 'invite' | 'reset-password';
  initialInviteToken?: string;
  initialResetToken?: string;
  onLogin: (user: User) => void;
  onUserRegistered?: (user: User) => void;
}

export function LoginScreen({
  users,
  offices = [],
  divisions = [],
  positions = [],
  initialAuthMode = 'login',
  initialInviteToken,
  initialResetToken,
  onLogin,
  onUserRegistered
}: LoginScreenProps) {
  const [authMode, setAuthMode] = useState<'login' | 'invite' | 'reset-password'>(initialAuthMode);
  
  // マスタデータ（プロップスまたはデフォルト、マスタAPI直接取得で補完）
  const [masterOffices, setMasterOffices] = useState<OfficeMaster[]>(offices.length > 0 ? offices : DEFAULT_OFFICES);
  const [masterDivisions, setMasterDivisions] = useState<DivisionMaster[]>(divisions.length > 0 ? divisions : DEFAULT_DIVISIONS);
  const [masterPositions, setMasterPositions] = useState<PositionMaster[]>(positions.length > 0 ? positions : DEFAULT_POSITIONS);

  useEffect(() => {
    if (offices && offices.length > 0) setMasterOffices(offices);
  }, [offices]);

  useEffect(() => {
    if (divisions && divisions.length > 0) setMasterDivisions(divisions);
  }, [divisions]);

  useEffect(() => {
    if (positions && positions.length > 0) setMasterPositions(positions);
  }, [positions]);

  useEffect(() => {
    if (offices.length > 0 && divisions.length > 0 && positions.length > 0) return;
    const fetchMasters = async () => {
      try {
        const [offRes, divRes, posRes] = await Promise.allSettled([
          fetch(`${API_BASE_URL}/masters/offices`),
          fetch(`${API_BASE_URL}/masters/divisions`),
          fetch(`${API_BASE_URL}/masters/positions`)
        ]);
        if (offRes.status === 'fulfilled' && offRes.value.ok) {
          const d = await offRes.value.json();
          if (Array.isArray(d) && d.length > 0) setMasterOffices(d);
        }
        if (divRes.status === 'fulfilled' && divRes.value.ok) {
          const d = await divRes.value.json();
          if (Array.isArray(d) && d.length > 0) setMasterDivisions(d);
        }
        if (posRes.status === 'fulfilled' && posRes.value.ok) {
          const d = await posRes.value.json();
          if (Array.isArray(d) && d.length > 0) setMasterPositions(d);
        }
      } catch (_) {}
    };
    fetchMasters();
  }, []);
  
  // 通常ログイン用
  const [loginId, setLoginId] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // 初回ログイン・強制パスワード変更モーダル用
  const [forceChangeUser, setForceChangeUser] = useState<User | null>(null);
  const [forceNewPassword, setForceNewPassword] = useState('');
  const [forceConfirmPassword, setForceConfirmPassword] = useState('');
  const [forceShowPassword, setForceShowPassword] = useState(false);
  const [forceError, setForceError] = useState<string | null>(null);
  const [forceLoading, setForceLoading] = useState(false);

  // 招待登録用
  const [inviteToken, setInviteToken] = useState(initialInviteToken || '');
  const [inviteData, setInviteData] = useState<any>(null);
  const [inviteLoading, setInviteLoading] = useState(false);
  const [inviteForm, setInviteForm] = useState({
    name: '',
    kanaName: '',
    loginId: '',
    password: '',
    confirmPassword: '',
    office: '',
    division: '',
    position: '',
    mobileEmail: '',
    mobilePhone: '',
    phoneExtension: '',
    avatarUrl: ''
  });
  const [showInvitePassword, setShowInvitePassword] = useState(false);

  // パスワード再設定用
  const [resetToken, setResetToken] = useState(initialResetToken || '');
  const [resetUserData, setResetUserData] = useState<{ id: string; name: string; loginId?: string; email?: string } | null>(null);
  const [resetLoading, setResetLoading] = useState(false);
  const [resetNewPassword, setResetNewPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [showResetPassword, setShowResetPassword] = useState(false);

  // 招待トークンの検証
  useEffect(() => {
    if (authMode === 'invite' && inviteToken) {
      verifyInviteToken(inviteToken);
    }
  }, [authMode, inviteToken]);

  // パスワードリセットトークンの検証
  useEffect(() => {
    if (authMode === 'reset-password' && resetToken) {
      verifyResetToken(resetToken);
    }
  }, [authMode, resetToken]);

  const verifyInviteToken = async (token: string) => {
    setInviteLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/invitations/verify?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '無効な招待リンクです。');
      }
      setInviteData(data.invitation);
      setInviteForm(prev => ({
        ...prev,
        office: data.invitation.office || prev.office,
        division: data.invitation.division || prev.division,
        position: data.invitation.position || prev.position,
        loginId: data.invitation.email ? data.invitation.email.split('@')[0] : prev.loginId
      }));
    } catch (err: any) {
      setError(err.message || '招待リンクの確認に失敗しました。');
    } finally {
      setInviteLoading(false);
    }
  };

  const verifyResetToken = async (token: string) => {
    setResetLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/passwords/verify?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || '無効なパスワード設定リンクです。');
      }
      setResetUserData(data.user);
    } catch (err: any) {
      setError(err.message || 'パスワード設定リンクの確認に失敗しました。');
    } finally {
      setResetLoading(false);
    }
  };

  // 通常ログイン処理
  const handleLoginSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const trimmedId = (loginId || '').trim();
    const trimmedPw = (password || '').trim();

    if (!trimmedId || !trimmedPw) {
      setError('ユーザーIDとパスワードを入力してください。');
      return;
    }

    const matchedUser = users.find(
      u => u.loginId?.toLowerCase() === trimmedId.toLowerCase() && u.password === trimmedPw
    );

    if (matchedUser) {
      // パスワード強制変更が必要なユーザーかチェック
      if (matchedUser.mustChangePassword) {
        setForceChangeUser(matchedUser);
        setForceNewPassword('');
        setForceConfirmPassword('');
        setForceError(null);
        return;
      }
      onLogin(matchedUser);
    } else {
      setError('ユーザーIDまたはパスワードが正しくありません。');
    }
  };

  // 初回ログイン強制パスワード変更の送信
  const handleForcePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!forceChangeUser) return;
    setForceError(null);

    if (!forceNewPassword || forceNewPassword.length < 4) {
      setForceError('新しいパスワードは4文字以上で入力してください。');
      return;
    }
    if (forceNewPassword !== forceConfirmPassword) {
      setForceError('新しいパスワードと確認用パスワードが一致しません。');
      return;
    }

    setForceLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/passwords/force-change`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: forceChangeUser.id,
          newPassword: forceNewPassword
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'パスワードの変更に失敗しました。');
      }

      const updatedUser: User = {
        ...forceChangeUser,
        password: forceNewPassword,
        mustChangePassword: false
      };

      setForceChangeUser(null);
      onLogin(updatedUser);
    } catch (err: any) {
      setForceError(err.message || 'パスワードの変更処理中にエラーが発生しました。');
    } finally {
      setForceLoading(false);
    }
  };

  // 招待登録フォーム送信
  const handleInviteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!inviteForm.name.trim()) {
      setError('氏名を入力してください。');
      return;
    }
    if (!inviteForm.loginId.trim()) {
      setError('ユーザーIDを入力してください。');
      return;
    }
    if (!inviteForm.password || inviteForm.password.length < 4) {
      setError('パスワードは4文字以上で入力してください。');
      return;
    }
    if (inviteForm.password !== inviteForm.confirmPassword) {
      setError('パスワードと確認用パスワードが一致しません。');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/invitations/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: inviteToken,
          name: inviteForm.name.trim(),
          kanaName: inviteForm.kanaName.trim(),
          loginId: inviteForm.loginId.trim(),
          password: inviteForm.password,
          office: inviteForm.office,
          division: inviteForm.division,
          position: inviteForm.position,
          avatarUrl: sanitizeAvatarUrlForSave(inviteForm.avatarUrl),
          mobileEmail: inviteForm.mobileEmail.trim(),
          mobilePhone: inviteForm.mobilePhone.trim(),
          phoneExtension: inviteForm.phoneExtension.trim()
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'アカウント登録に失敗しました。');
      }

      const returnedUser = data.user || {};
      const newUser: User = {
        id: String(returnedUser.id || `u_${Date.now()}`),
        name: returnedUser.name || inviteForm.name.trim() || 'ユーザー',
        kanaName: returnedUser.kanaName || inviteForm.kanaName.trim() || '',
        loginId: returnedUser.loginId || inviteForm.loginId.trim(),
        role: returnedUser.role || inviteData?.role || 'user',
        isAdmin: returnedUser.isAdmin ?? (inviteData?.role === 'admin'),
        office: returnedUser.office || inviteForm.office || '',
        division: returnedUser.division || inviteForm.division || '',
        position: returnedUser.position || inviteForm.position || '',
        department: returnedUser.department || [inviteForm.office, inviteForm.division, inviteForm.position].filter(Boolean).join(' '),
        email: returnedUser.email || inviteData?.email || '',
        mobileEmail: returnedUser.mobileEmail || inviteForm.mobileEmail.trim() || '',
        mobilePhone: returnedUser.mobilePhone || inviteForm.mobilePhone.trim() || '',
        phoneExtension: returnedUser.phoneExtension || inviteForm.phoneExtension.trim() || '',
        avatarUrl: returnedUser.avatarUrl || sanitizeAvatarUrlForSave(inviteForm.avatarUrl) || '',
        password: inviteForm.password
      };

      if (onUserRegistered) {
        onUserRegistered(newUser);
      }
      onLogin(newUser);
    } catch (err: any) {
      setError(err.message || 'アカウント登録処理中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  // パスワード再設定送信
  const handleResetPasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!resetNewPassword || resetNewPassword.length < 4) {
      setError('パスワードは4文字以上で入力してください。');
      return;
    }
    if (resetNewPassword !== resetConfirmPassword) {
      setError('パスワードと確認用パスワードが一致しません。');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/passwords/reset`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token: resetToken,
          newPassword: resetNewPassword
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'パスワードの再設定に失敗しました。');
      }

      setSuccessMessage('新しいパスワードを設定しました。ログイン画面へ移動します...');
      setTimeout(() => {
        setAuthMode('login');
        setPassword('');
        setSuccessMessage(null);
        if (data.user) {
          setLoginId(data.user.loginId || '');
        }
      }, 1800);
    } catch (err: any) {
      setError(err.message || 'パスワード再設定中にエラーが発生しました。');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex items-center justify-center p-4 relative overflow-hidden">
      {/* 背景装飾 */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-indigo-600/20 rounded-full blur-3xl pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-blue-600/20 rounded-full blur-3xl pointer-events-none" />

      {/* 初回強制パスワード変更モーダル */}
      {forceChangeUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-slate-800 border border-indigo-500/40 rounded-2xl max-w-md w-full p-6 sm:p-8 shadow-2xl relative">
            <div className="text-center mb-6">
              <div className="w-14 h-14 bg-indigo-500/20 text-indigo-400 rounded-2xl flex items-center justify-center mx-auto mb-3 border border-indigo-500/30 shadow-inner">
                <KeyRound className="w-7 h-7" />
              </div>
              <h2 className="text-xl font-black text-white">
                初回パスワード変更のお願い
              </h2>
              <p className="text-xs text-slate-400 mt-1">
                こんにちは、<b>{forceChangeUser.name}</b> さん。<br />
                セキュリティ保護のため、初期パスワードからあなた専用の新しいパスワードへ変更してください。
              </p>
            </div>

            {forceError && (
              <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-rose-400 text-xs font-bold">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{forceError}</span>
              </div>
            )}

            <form onSubmit={handleForcePasswordChange} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  新しいパスワード <span className="text-rose-400">*</span>
                </label>
                <div className="relative">
                  <input
                    type={forceShowPassword ? 'text' : 'password'}
                    value={forceNewPassword}
                    onChange={e => setForceNewPassword(e.target.value)}
                    placeholder="4文字以上の新しいパスワード"
                    autoFocus
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={() => setForceShowPassword(!forceShowPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                  >
                    {forceShowPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 mb-1.5">
                  新しいパスワード（確認） <span className="text-rose-400">*</span>
                </label>
                <input
                  type={forceShowPassword ? 'text' : 'password'}
                  value={forceConfirmPassword}
                  onChange={e => setForceConfirmPassword(e.target.value)}
                  placeholder="もう一度入力してください"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                />
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={forceLoading}
                  className="w-full py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 text-xs transition-all cursor-pointer"
                >
                  {forceLoading ? (
                    <>
                      <RefreshCw className="w-4 h-4 animate-spin" />
                      変更を保存中...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      パスワードを変更して利用を開始する
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 画面モード 1: 通常ログイン画面 */}
      {/* ========================================================= */}
      {authMode === 'login' && (
        <div className="w-full max-w-md z-10">
          {/* ロゴ & ヘッダー */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl shadow-lg shadow-indigo-500/30 mb-4">
              <ShieldCheck className="w-9 h-9 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white mb-2">
              TERANAGO 社内ポータル
            </h1>
            <p className="text-sm text-slate-400 font-medium">
              社内SNS・グループウェアへログインしてください
            </p>
          </div>

          {/* ログインフォームカード */}
          <div className="bg-slate-800/80 backdrop-blur-md border border-slate-700/80 rounded-2xl p-6 sm:p-8 shadow-2xl">
            {error && (
              <div className="mb-6 p-3.5 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-3 text-rose-400 text-sm font-bold animate-in fade-in duration-150">
                <AlertCircle className="w-5 h-5 shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {successMessage && (
              <div className="mb-6 p-3.5 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-3 text-emerald-400 text-sm font-bold animate-in fade-in duration-150">
                <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-400" />
                <span>{successMessage}</span>
              </div>
            )}

            <form onSubmit={handleLoginSubmit} className="space-y-5">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  ユーザーID
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <UserIcon className="w-5 h-5" />
                  </div>
                  <input
                    type="text"
                    value={loginId}
                    onChange={e => setLoginId(e.target.value)}
                    placeholder="ユーザーIDを入力"
                    autoFocus
                    autoComplete="username"
                    className="w-full pl-11 pr-4 py-3 bg-slate-900/80 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-medium"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  パスワード
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-5 h-5" />
                  </div>
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="パスワードを入力"
                    autoComplete="current-password"
                    className="w-full pl-11 pr-11 py-3 bg-slate-900/80 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-sm focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-medium"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3.5 flex items-center text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
                    title={showPassword ? 'パスワードを隠す' : 'パスワードを表示する'}
                  >
                    {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 px-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 hover:shadow-indigo-500/40 transition-all flex items-center justify-center gap-2 text-sm mt-3 active:scale-[0.99] cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                ログイン
              </button>
            </form>
          </div>

          <div className="text-center mt-6 text-xs text-slate-500 font-medium">
            © TERANAGO SNS Portal System
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 画面モード 2: 招待からのアカウント登録画面 */}
      {/* ========================================================= */}
      {authMode === 'invite' && (
        <div className="w-full max-w-lg z-10 py-6">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl shadow-lg shadow-indigo-500/30 mb-3">
              <UserPlus className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white mb-1">
              アカウント初期登録
            </h1>
            <p className="text-xs text-slate-400">
              TERANAGO 社内ポータルへのご参加ありがとうございます。<br />
              必須項目を入力してアカウントを開設してください。
            </p>
          </div>

          <div className="bg-slate-800/90 backdrop-blur-md border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-2xl">
            {inviteLoading ? (
              <div className="py-12 text-center text-slate-400 space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
                <p className="text-xs font-bold">招待リンクを検証中...</p>
              </div>
            ) : error && !inviteData ? (
              <div className="space-y-4 text-center py-4">
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span className="text-left">{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 cursor-pointer transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  ログイン画面へ戻る
                </button>
              </div>
            ) : (
              <form onSubmit={handleInviteSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-rose-400 text-xs font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {/* 招待メールアドレス情報 */}
                {inviteData?.email && (
                  <div className="p-3 bg-indigo-950/40 border border-indigo-500/30 rounded-xl flex items-center justify-between text-xs">
                    <div className="flex items-center gap-2">
                      <Mail className="w-4 h-4 text-indigo-400" />
                      <span className="text-slate-400">招待先メール:</span>
                      <span className="font-mono font-bold text-indigo-200">{inviteData.email}</span>
                    </div>
                    {inviteData.role === 'admin' && (
                      <span className="px-2 py-0.5 bg-indigo-600/30 border border-indigo-500/40 text-indigo-300 rounded text-[10px] font-bold">
                        管理者権限
                      </span>
                    )}
                  </div>
                )}

                {/* 氏名 & フリガナ */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      氏名 <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type="text"
                      value={inviteForm.name}
                      onChange={e => setInviteForm({ ...inviteForm, name: e.target.value })}
                      placeholder="例: 寺岡 太郎"
                      required
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      フリガナ
                    </label>
                    <input
                      type="text"
                      value={inviteForm.kanaName}
                      onChange={e => setInviteForm({ ...inviteForm, kanaName: e.target.value })}
                      placeholder="例: テラオカ タロウ"
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* ログインID */}
                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1">
                    ログイン用ユーザーID <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type="text"
                    value={inviteForm.loginId}
                    onChange={e => setInviteForm({ ...inviteForm, loginId: e.target.value })}
                    placeholder="英数字で入力"
                    required
                    className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                  />
                </div>

                {/* パスワード & 確認 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      パスワード <span className="text-rose-400">*</span>
                    </label>
                    <div className="relative">
                      <input
                        type={showInvitePassword ? 'text' : 'password'}
                        value={inviteForm.password}
                        onChange={e => setInviteForm({ ...inviteForm, password: e.target.value })}
                        placeholder="4文字以上"
                        required
                        className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setShowInvitePassword(!showInvitePassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                      >
                        {showInvitePassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                      </button>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      パスワード（確認） <span className="text-rose-400">*</span>
                    </label>
                    <input
                      type={showInvitePassword ? 'text' : 'password'}
                      value={inviteForm.confirmPassword}
                      onChange={e => setInviteForm({ ...inviteForm, confirmPassword: e.target.value })}
                      placeholder="もう一度入力"
                      required
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                </div>

                {/* 拠点 / 部署 / 役職 */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">所属拠点</label>
                    <select
                      value={inviteForm.office}
                      onChange={e => setInviteForm({ ...inviteForm, office: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">未選択</option>
                      {masterOffices.map((o, idx) => {
                        const name = typeof o === 'string' ? o : (o?.name || '');
                        const id = typeof o === 'string' ? o : (o?.id || `off_${idx}`);
                        if (!name) return null;
                        return <option key={id} value={name}>{name}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">所属部署</label>
                    <select
                      value={inviteForm.division}
                      onChange={e => setInviteForm({ ...inviteForm, division: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">未選択</option>
                      {masterDivisions.map((d, idx) => {
                        const name = typeof d === 'string' ? d : (d?.name || '');
                        const id = typeof d === 'string' ? d : (d?.id || `div_${idx}`);
                        if (!name) return null;
                        return <option key={id} value={name}>{name}</option>;
                      })}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">役職</label>
                    <select
                      value={inviteForm.position}
                      onChange={e => setInviteForm({ ...inviteForm, position: e.target.value })}
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">一般 / 役職なし</option>
                      {masterPositions.map((p, idx) => {
                        const name = typeof p === 'string' ? p : (p?.name || '');
                        const id = typeof p === 'string' ? p : (p?.id || `pos_${idx}`);
                        if (!name) return null;
                        return <option key={id} value={name}>{name}</option>;
                      })}
                    </select>
                  </div>
                </div>

                {/* 携帯メール & 携帯電話 (任意) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      携帯メール (任意)
                    </label>
                    <input
                      type="email"
                      value={inviteForm.mobileEmail}
                      onChange={e => setInviteForm({ ...inviteForm, mobileEmail: e.target.value })}
                      placeholder="例: docomo, au, softbank..."
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-300 mb-1">
                      携帯電話番号 (任意)
                    </label>
                    <input
                      type="tel"
                      value={inviteForm.mobilePhone}
                      onChange={e => setInviteForm({ ...inviteForm, mobilePhone: e.target.value })}
                      placeholder="例: 090-1234-5678"
                      className="w-full px-3 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none font-mono"
                    />
                  </div>
                </div>

                <div className="pt-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 text-xs transition-all cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        アカウントを開設中...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        登録を完了してログイン
                      </>
                    )}
                  </button>
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode('login')}
                    className="text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  >
                    すでにアカウントをお持ちの場合はログイン画面へ
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================= */}
      {/* 画面モード 3: パスワード再設定画面 */}
      {/* ========================================================= */}
      {authMode === 'reset-password' && (
        <div className="w-full max-w-md z-10">
          <div className="text-center mb-6">
            <div className="inline-flex items-center justify-center w-14 h-14 bg-gradient-to-tr from-indigo-600 to-blue-500 rounded-2xl shadow-lg shadow-indigo-500/30 mb-3">
              <KeyRound className="w-7 h-7 text-white" />
            </div>
            <h1 className="text-2xl font-black tracking-tight text-white mb-1">
              パスワードの再設定
            </h1>
            <p className="text-xs text-slate-400">
              新しいパスワードを設定してログインしてください。
            </p>
          </div>

          <div className="bg-slate-800/90 backdrop-blur-md border border-slate-700 rounded-2xl p-6 sm:p-8 shadow-2xl">
            {resetLoading ? (
              <div className="py-12 text-center text-slate-400 space-y-3">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto text-indigo-500" />
                <p className="text-xs font-bold">リンクを確認中...</p>
              </div>
            ) : error && !resetUserData ? (
              <div className="space-y-4 text-center py-4">
                <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-xl text-rose-400 text-xs font-bold flex items-center gap-2.5">
                  <AlertCircle className="w-5 h-5 shrink-0" />
                  <span className="text-left">{error}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setAuthMode('login')}
                  className="px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white text-xs font-bold rounded-xl inline-flex items-center gap-2 cursor-pointer transition"
                >
                  <ArrowLeft className="w-4 h-4" />
                  ログイン画面へ戻る
                </button>
              </div>
            ) : (
              <form onSubmit={handleResetPasswordSubmit} className="space-y-4">
                {error && (
                  <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl flex items-center gap-2.5 text-rose-400 text-xs font-bold">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span>{error}</span>
                  </div>
                )}

                {successMessage && (
                  <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 rounded-xl flex items-center gap-2.5 text-emerald-400 text-xs font-bold">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    <span>{successMessage}</span>
                  </div>
                )}

                {resetUserData && (
                  <div className="p-3 bg-slate-900 border border-slate-700 rounded-xl text-xs space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">対象メンバー:</span>
                      <span className="font-bold text-white text-sm">{resetUserData.name}</span>
                    </div>
                    {resetUserData.loginId && (
                      <div className="flex items-center justify-between text-[11px] text-slate-400">
                        <span>ユーザーID:</span>
                        <span className="font-mono text-indigo-300">{resetUserData.loginId}</span>
                      </div>
                    )}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    新しいパスワード <span className="text-rose-400">*</span>
                  </label>
                  <div className="relative">
                    <input
                      type={showResetPassword ? 'text' : 'password'}
                      value={resetNewPassword}
                      onChange={e => setResetNewPassword(e.target.value)}
                      placeholder="4文字以上の新しいパスワード"
                      autoFocus
                      required
                      className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowResetPassword(!showResetPassword)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-200 cursor-pointer"
                    >
                      {showResetPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-300 mb-1.5">
                    新しいパスワード（確認） <span className="text-rose-400">*</span>
                  </label>
                  <input
                    type={showResetPassword ? 'text' : 'password'}
                    value={resetConfirmPassword}
                    onChange={e => setResetConfirmPassword(e.target.value)}
                    placeholder="もう一度入力してください"
                    required
                    className="w-full px-3.5 py-2.5 bg-slate-900 border border-slate-700 rounded-xl text-slate-100 placeholder-slate-500 text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                  />
                </div>

                <div className="pt-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white font-bold rounded-xl shadow-lg shadow-indigo-600/30 flex items-center justify-center gap-2 text-xs transition-all cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <RefreshCw className="w-4 h-4 animate-spin" />
                        パスワードを更新中...
                      </>
                    ) : (
                      <>
                        <CheckCircle2 className="w-4 h-4" />
                        新しいパスワードを保存
                      </>
                    )}
                  </button>
                </div>

                <div className="text-center pt-2">
                  <button
                    type="button"
                    onClick={() => setAuthMode('login')}
                    className="text-xs text-slate-400 hover:text-slate-200 transition cursor-pointer"
                  >
                    ログイン画面へ戻る
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
