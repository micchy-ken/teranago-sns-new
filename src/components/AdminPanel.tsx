import React, { useState, useRef, useEffect } from 'react';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import { RECOMMEND_SERVER_JS } from './RecommendServerCode';
import { getAvatarUrl, SILHOUETTE_SVG } from '../utils/avatar';
import { API_BASE_URL } from '../config/api';
import { 
  Shield, 
  Building2, 
  MapPin, 
  Phone, 
  User as UserIcon, 
  Users, 
  Plus, 
  Search, 
  Edit2, 
  Trash2, 
  AlertTriangle, 
  X, 
  ShieldAlert,
  ShieldCheck,
  Settings,
  Info,
  Layers,
  Mail,
  UserPlus,
  CheckCircle2,
  Briefcase,
  Smartphone,
  KeyRound,
  GitMerge,
  ArrowRight,
  FileCheck,
  CheckSquare,
  ShoppingBag,
  Package,
  Upload,
  RefreshCw,
  Database,
  Play,
  Activity,
  Server,
  Copy,
  Check,
  Send,
  Inbox
} from 'lucide-react';
import { User, OfficeMaster, DivisionMaster, PositionMaster, OfficeType, ApprovalFlowRule, ApprovalStepConfig, ApplicationType, ApproverType, ItemMaster, WorkflowApplication, ApplicationStatus } from '../types';

interface AdminPanelProps {
  currentUser: User;
  allUsers: User[];
  offices: OfficeMaster[];
  divisions: DivisionMaster[];
  positions?: PositionMaster[];
  approvalFlows?: ApprovalFlowRule[];
  itemMasters?: ItemMaster[];
  applications?: WorkflowApplication[];
  onDeleteApplication?: (id: string) => void;
  onAddOffice: (office: Omit<OfficeMaster, 'id'>) => void;
  onUpdateOffice: (office: OfficeMaster) => void;
  onDeleteOffice: (id: string) => void;
  onAddDivision: (division: Omit<DivisionMaster, 'id'>) => void;
  onUpdateDivision: (division: DivisionMaster) => void;
  onDeleteDivision: (id: string) => void;
  onAddPosition?: (position: Omit<PositionMaster, 'id'>) => void;
  onUpdatePosition?: (position: PositionMaster) => void;
  onDeletePosition?: (id: string) => void;
  onAddUser: (user: Omit<User, 'id'>) => void;
  onUpdateUser: (user: User) => void;
  onDeleteUser: (id: string) => void;
  onToggleUserAdmin: (userId: string) => void;
  onSwitchUser?: (user: User) => void;
  onAddApprovalFlow?: (flow: Omit<ApprovalFlowRule, 'id'>) => void;
  onUpdateApprovalFlow?: (flow: ApprovalFlowRule) => void;
  onDeleteApprovalFlow?: (id: string) => void;
  onAddItemMaster?: (item: Omit<ItemMaster, 'id'>) => void;
  onUpdateItemMaster?: (item: ItemMaster) => void;
  onDeleteItemMaster?: (id: string) => void;
}

const officeTypeLabels: Record<OfficeType, { label: string; badgeClass: string }> = {
  headquarter: { label: '本社', badgeClass: 'bg-slate-100 text-slate-800 border-slate-300' },
  branch: { label: '支店', badgeClass: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  sales_office: { label: '営業所', badgeClass: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  other: { label: 'その他', badgeClass: 'bg-purple-100 text-purple-800 border-purple-200' },
};

export function AdminPanel({
  currentUser,
  allUsers,
  offices,
  divisions,
  positions = [],
  approvalFlows = [],
  itemMasters = [],
  applications = [],
  onDeleteApplication,
  onAddOffice,
  onUpdateOffice,
  onDeleteOffice,
  onAddDivision,
  onUpdateDivision,
  onDeleteDivision,
  onAddPosition,
  onUpdatePosition,
  onDeletePosition,
  onAddUser,
  onUpdateUser,
  onDeleteUser,
  onToggleUserAdmin,
  onSwitchUser,
  onAddApprovalFlow,
  onUpdateApprovalFlow,
  onDeleteApprovalFlow,
  onAddItemMaster,
  onUpdateItemMaster,
  onDeleteItemMaster,
}: AdminPanelProps) {
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'offices' | 'divisions' | 'positions' | 'items' | 'approval_flows' | 'system' | 'workflows_cleanup'>('users');
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOfficeFilter, setSelectedOfficeFilter] = useState<string>('all');
  const [workflowSearchQuery, setWorkflowSearchQuery] = useState('');
  const [workflowStatusFilter, setWorkflowStatusFilter] = useState<'all' | 'approved' | 'pending' | 'rejected' | 'draft'>('all');

  // システム情報・診断ツール拡張用状態
  const [diagnosticLoading, setDiagnosticLoading] = useState(false);
  const [diagnosticLogs, setDiagnosticLogs] = useState<string[]>([]);
  const [diagnosticStatus, setDiagnosticStatus] = useState<'idle' | 'success' | 'warning' | 'error'>('idle');
  const [copySuccess, setCopySuccess] = useState<Record<string, boolean>>({});
  const [systemActiveSection, setSystemActiveSection] = useState<'diagnostics' | 'database' | 'server_code' | 'email'>('email');
  const [selectedSystemTable, setSelectedSystemTable] = useState('dbo.Users');
  const [isServerCodeUpdated, setIsServerCodeUpdated] = useState(true);

  // メールテスト送信用の状態
  const [testCustomEmail, setTestCustomEmail] = useState('');
  const [testCustomRecipientName, setTestCustomRecipientName] = useState('');
  const [testEmailSendingKey, setTestEmailSendingKey] = useState<string | null>(null);
  const [testEmailResult, setTestEmailResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);
  const [smtpConfigInfo, setSmtpConfigInfo] = useState<{ host?: string; port?: number; user?: string; fromEmail?: string; fromName?: string; isConfigured?: boolean; inbound?: any } | null>(null);

  // POP3 メール受信設定 & 稼働状態
  const [pop3InboundInfo, setPop3InboundInfo] = useState<{
    config?: { host: string; port: number; secure: boolean; user: string; fromAddress: string; deleteAfterImport: boolean; checkIntervalSec: number; defaultTag: string };
    whitelist?: { totalMembers: number; whitelistedMembersCount: number; members: any[] };
    state?: { isPolling: boolean; lastCheckedAt: string | null; lastCheckStatus: 'idle' | 'checking' | 'success' | 'error'; lastCheckMessage: string; totalImportedCount: number; logs: any[] };
  } | null>(null);
  const [isCheckingPop3, setIsCheckingPop3] = useState(false);
  const [pop3CheckResult, setPop3CheckResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);
  const [simulateSenderEmail, setSimulateSenderEmail] = useState('');
  const [simulateSubject, setSimulateSubject] = useState('【連絡】社内メールからのテスト投稿');
  const [simulateBody, setSimulateBody] = useState('[お知らせ]\n外出先からの社内メール受信連携のテスト投稿です。\n本文1行目に [重要] や [お知らせ]、または [名古屋支店/営業] などのタブ・宛先を指定できます（省略時は全社・全部署宛て）。');
  const [isSimulatingPop3, setIsSimulatingPop3] = useState(false);
  const [simulateResult, setSimulateResult] = useState<{ success?: boolean; message?: string; error?: string } | null>(null);

  const safeFetchJson = async (url: string, options?: RequestInit) => {
    try {
      const res = await fetch(url, options);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        return { ok: false, status: res.status, isHtml: true, data: null };
      }
      const data = await res.json();
      return { ok: res.ok, status: res.status, isHtml: false, data };
    } catch (err: any) {
      return { ok: false, status: 0, isHtml: false, data: null, error: err.message };
    }
  };

  const handleFetchSmtpConfig = async () => {
    let result = await safeFetchJson(`${API_BASE_URL}/email/config`);
    if ((!result.ok || result.isHtml) && API_BASE_URL !== '/api') {
      const localResult = await safeFetchJson('/api/email/config');
      if (localResult.ok) {
        result = localResult;
      }
    }
    if (result.ok && result.data) {
      setSmtpConfigInfo(result.data);
    }
    handleFetchPop3Status();
  };

  const handleFetchPop3Status = async () => {
    let result = await safeFetchJson(`${API_BASE_URL}/email/inbound/status`);
    if ((!result.ok || result.isHtml) && API_BASE_URL !== '/api') {
      const localResult = await safeFetchJson('/api/email/inbound/status');
      if (localResult.ok) {
        result = localResult;
      }
    }
    if (result.ok && result.data) {
      setPop3InboundInfo(result.data);
    }
  };

  const handleCheckPop3Now = async () => {
    setIsCheckingPop3(true);
    setPop3CheckResult(null);
    const options: RequestInit = { method: 'POST' };
    let result = await safeFetchJson(`${API_BASE_URL}/email/inbound/check-now`, options);
    if ((!result.ok || result.isHtml) && API_BASE_URL !== '/api') {
      const localResult = await safeFetchJson('/api/email/inbound/check-now', options);
      if (localResult.ok && localResult.data) {
        result = localResult;
      }
    }
    if (result.ok && result.data) {
      setPop3CheckResult({
        success: result.data.checked && !result.data.message.includes('エラー'),
        message: result.data.message || `POP3チェック完了: 検出 ${result.data.found}件, 掲載 ${result.data.imported}件, 削除 ${result.data.deleted}件`
      });
      handleFetchPop3Status();
      if (result.data.imported > 0) {
        window.dispatchEvent(new CustomEvent('bulletins_updated'));
        window.dispatchEvent(new CustomEvent('notifications_updated'));
      }
    } else {
      setPop3CheckResult({
        error: result.data?.error || result.error || 'POP3メール受信チェックに失敗しました。'
      });
    }
    setIsCheckingPop3(false);
  };

  const handleSimulateEmailPost = async () => {
    if (!simulateSenderEmail || !simulateSenderEmail.trim()) {
      setSimulateResult({ error: '送信者メールアドレスを選択または入力してください。' });
      return;
    }
    setIsSimulatingPop3(true);
    setSimulateResult(null);
    const options: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderEmail: simulateSenderEmail.trim(),
        subject: simulateSubject,
        body: simulateBody
      })
    };
    let result = await safeFetchJson(`${API_BASE_URL}/email/inbound/simulate`, options);
    if ((!result.ok || result.isHtml) && API_BASE_URL !== '/api') {
      const localResult = await safeFetchJson('/api/email/inbound/simulate', options);
      if (localResult.ok && localResult.data) {
        result = localResult;
      }
    }
    if (result.ok && result.data) {
      setSimulateResult({
        success: result.data.success,
        message: result.data.message,
        error: !result.data.success ? (result.data.details?.reason || '投稿スキップされました') : undefined
      });
      handleFetchPop3Status();
      if (result.data.success) {
        window.dispatchEvent(new CustomEvent('bulletins_updated'));
        window.dispatchEvent(new CustomEvent('notifications_updated'));
      }
    } else {
      setSimulateResult({
        error: result.data?.error || result.error || 'シミュレーション実行に失敗しました。'
      });
    }
    setIsSimulatingPop3(false);
  };

  useEffect(() => {
    handleFetchSmtpConfig();
    handleFetchPop3Status();
  }, []);

  const handleSendTestEmail = async (targetEmail: string, recipientName?: string, keyId?: string) => {
    if (!targetEmail || !targetEmail.trim()) {
      setTestEmailResult({ error: 'メールアドレスが設定されていません。' });
      return;
    }
    const sendKey = keyId || targetEmail;
    setTestEmailSendingKey(sendKey);
    setTestEmailResult(null);

    const payload = JSON.stringify({ to: targetEmail.trim(), recipientName });
    const options: RequestInit = {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload
    };

    let result = await safeFetchJson(`${API_BASE_URL}/email/test`, options);

    if ((!result.ok || result.isHtml) && API_BASE_URL !== '/api') {
      const localResult = await safeFetchJson('/api/email/test', options);
      if (localResult.ok && localResult.data) {
        result = localResult;
      }
    }

    if (result.ok && result.data?.success) {
      setTestEmailResult({
        success: true,
        message: result.data.message || `${targetEmail} へテストメールを送信しました。`
      });
    } else if (result.isHtml) {
      setTestEmailResult({
        error: '接続先サーバー (NAS) がまだ更新されていません。NAS側で cd /volume1/docker/sns-api && docker-compose up -d --build を実行し、Dockerコンテナを再起動してください。'
      });
    } else {
      setTestEmailResult({
        error: result.data?.error || result.error || 'テストメールの送信に失敗しました。サーバーの設定をご確認ください。'
      });
    }
    setTestEmailSendingKey(null);
  };

  // Modal State for Item Master (品名マスタ)
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ItemMaster | null>(null);
  const [itemFormData, setItemFormData] = useState<{
    name: string;
    category: string;
    defaultUnitPrice: number | '';
    unit: string;
    code: string;
  }>({
    name: '',
    category: '資材',
    defaultUnitPrice: '',
    unit: '個',
    code: '',
  });

  // Modal State for Approval Flow Master
  const [isFlowModalOpen, setIsFlowModalOpen] = useState(false);
  const [editingFlow, setEditingFlow] = useState<ApprovalFlowRule | null>(null);
  const [flowFormData, setFlowFormData] = useState<{
    name: string;
    description: string;
    targetApplicationType: ApplicationType | 'all';
    isDefault: boolean;
    steps: ApprovalStepConfig[];
  }>({
    name: '',
    description: '',
    targetApplicationType: 'all',
    isDefault: false,
    steps: [
      { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' }
    ]
  });

  // Modal State for Member (User) Add / Edit
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);

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
          setUserFormData(prev => ({ ...prev, avatarUrl: data.avatarUrl }));
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
    setUserFormData(prev => ({ ...prev, avatarUrl: '' }));
    setAvatarError(null);
  };
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({
    name: '',
    kanaName: '',
    loginId: '',
    password: 'test',
    office: '',
    division: '',
    position: '',
    avatarUrl: '',
    email: '',
    mobileEmail: '',
    phoneOutside: '',
    phoneExtension: '',
    mobilePhone: '',
    isAdmin: false,
    supervisorId: '',
    showInspectionScheduler: false, // デフォルト: OFF
    showSharedFiles: false,         // デフォルト: OFF
  });
  const [userFormError, setUserFormError] = useState<string | null>(null);

  // ワンクリック・個別メニュー表示切り替え（点検予定管理）
  const handleToggleInspection = (targetUser: User) => {
    const isCurrentlyOn = targetUser.preferences?.showInspectionScheduler === true;
    onUpdateUser({
      ...targetUser,
      preferences: {
        ...(targetUser.preferences || {}),
        showInspectionScheduler: !isCurrentlyOn,
        hideInspectionScheduler: isCurrentlyOn,
      },
    });
  };

  // ワンクリック・個別メニュー表示切り替え（共有ファイル）
  const handleToggleFiles = (targetUser: User) => {
    const isCurrentlyOn = targetUser.preferences?.showSharedFiles === true;
    onUpdateUser({
      ...targetUser,
      preferences: {
        ...(targetUser.preferences || {}),
        showSharedFiles: !isCurrentlyOn,
        hideSharedFiles: isCurrentlyOn,
      },
    });
  };

  // 全員一括メニュー表示切り替え（ON / OFF）
  const handleBatchToggle = (type: 'inspection' | 'files', enable: boolean) => {
    const targetUsers = filteredUsers.length > 0 ? filteredUsers : allUsers;
    targetUsers.forEach((u) => {
      if (u.isAdmin) return; // 管理者は常に全アクセス可能
      const updatedPreferences = {
        ...(u.preferences || {}),
        ...(type === 'inspection'
          ? { showInspectionScheduler: enable, hideInspectionScheduler: !enable }
          : { showSharedFiles: enable, hideSharedFiles: !enable }),
      };
      onUpdateUser({
        ...u,
        preferences: updatedPreferences,
      });
    });
  };

  // Modal State for Office Master
  const [isOfficeModalOpen, setIsOfficeModalOpen] = useState(false);
  const [editingOffice, setEditingOffice] = useState<OfficeMaster | null>(null);
  const [officeFormData, setOfficeFormData] = useState({
    name: '',
    type: 'branch' as OfficeType,
    code: '',
    location: '',
    phone: '',
  });

  // Modal State for Division Master
  const [isDivisionModalOpen, setIsDivisionModalOpen] = useState(false);
  const [editingDivision, setEditingDivision] = useState<DivisionMaster | null>(null);
  const [divisionFormData, setDivisionFormData] = useState({
    name: '',
    code: '',
    description: '',
  });

  // Modal State for Position Master
  const [isPositionModalOpen, setIsPositionModalOpen] = useState(false);
  const [editingPosition, setEditingPosition] = useState<PositionMaster | null>(null);
  const [positionFormData, setPositionFormData] = useState({
    name: '',
    code: '',
    description: '',
  });

  // Access Control check
  if (!currentUser.isAdmin) {
    return (
      <div className="flex-1 max-w-4xl mx-auto space-y-6">
        <div className="bg-white rounded-2xl border border-red-200 p-8 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 bg-red-100 text-red-600 rounded-2xl flex items-center justify-center mx-auto ring-8 ring-red-50">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2 max-w-md mx-auto">
            <h2 className="text-xl font-bold text-slate-900">管理者権限が必要です</h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              現在ログイン中のユーザー <span className="font-semibold text-slate-800">「{currentUser.name}」</span> には管理者メニューの操作権限が付与されていません。
            </p>
          </div>

          <div className="p-4 bg-amber-50 rounded-xl border border-amber-200 max-w-md mx-auto text-left text-xs text-amber-800 space-y-2">
            <div className="font-semibold flex items-center gap-1.5 text-amber-900">
              <Info className="w-4 h-4 shrink-0 text-amber-600" />
              動作確認用のユーザー切り替え
            </div>
            <p>
              「山道 健介」アカウントには管理者権限が付与されています。以下のボタンからユーザーを切り替えて操作をお試しいただけます。
            </p>
          </div>

          {onSwitchUser && (
            <div className="flex flex-wrap justify-center gap-3 pt-2">
              {allUsers.map((user) => (
                <button
                  key={user.id}
                  onClick={() => onSwitchUser(user)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold flex items-center gap-2 border transition-all ${
                    user.isAdmin
                      ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700 shadow-sm'
                      : 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200'
                  }`}
                >
                  <img src={getAvatarUrl(user.avatarUrl)} alt={user.name} className="w-5 h-5 rounded-full object-cover" />
                  <span>{user.name}</span>
                  {user.isAdmin && <span className="bg-indigo-500/80 text-white px-1.5 py-0.2 rounded text-[10px]">管理者</span>}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  }

  // --- USER HANDLERS ---
  const handleOpenAddUserModal = () => {
    setEditingUser(null);
    setUserFormData({
      name: '',
      kanaName: '',
      loginId: '',
      password: 'test',
      office: '',
      division: '',
      position: '',
      avatarUrl: '',
      email: '',
      mobileEmail: '',
      phoneOutside: '',
      phoneExtension: '',
      mobilePhone: '',
      isAdmin: false,
      supervisorId: '',
      showInspectionScheduler: false,
      showSharedFiles: false,
    });
    setUserFormError(null);
    setIsUserModalOpen(true);
  };

  const handleOpenEditUserModal = (user: User) => {
    setEditingUser(user);
    setUserFormData({
      name: user.name,
      kanaName: user.kanaName || '',
      loginId: user.loginId || '',
      password: user.password || 'test',
      office: user.office || '',
      division: user.division || '',
      position: user.position || '',
      avatarUrl: user.avatarUrl || '',
      email: user.email || '',
      mobileEmail: user.mobileEmail || '',
      phoneOutside: user.phoneOutside || '',
      phoneExtension: user.phoneExtension || '',
      mobilePhone: user.mobilePhone || user.phone || '',
      isAdmin: !!user.isAdmin,
      supervisorId: user.supervisorId || '',
      showInspectionScheduler: user.preferences?.showInspectionScheduler === true,
      showSharedFiles: user.preferences?.showSharedFiles === true,
    });
    setUserFormError(null);
    setIsUserModalOpen(true);
  };

  const handleSaveUser = (e: React.FormEvent) => {
    e.preventDefault();
    if (!userFormData.name || !userFormData.name.trim()) {
      setUserFormError('氏名を入力してください。');
      return;
    }
    if (!userFormData.office) {
      setUserFormError('拠点を選択してください。');
      return;
    }
    if (!userFormData.division) {
      setUserFormError('部署を選択してください。');
      return;
    }

    const deptString = [userFormData.office, userFormData.division, userFormData.position].filter(Boolean).join(' ');
    const finalLoginId = (userFormData.loginId || '').trim() || `user_${Date.now().toString().slice(-4)}`;

    if (editingUser) {
      onUpdateUser({
        ...editingUser,
        name: (userFormData.name || '').trim(),
        kanaName: (userFormData.kanaName || '').trim(),
        loginId: finalLoginId,
        password: (userFormData.password || '').trim() || 'test',
        office: userFormData.office,
        division: userFormData.division,
        position: userFormData.position,
        department: deptString,
        avatarUrl: userFormData.avatarUrl,
        email: (userFormData.email || '').trim(),
        mobileEmail: (userFormData.mobileEmail || '').trim(),
        phoneOutside: (userFormData.phoneOutside || '').trim(),
        phoneExtension: (userFormData.phoneExtension || '').trim(),
        mobilePhone: (userFormData.mobilePhone || '').trim(),
        phone: (userFormData.mobilePhone || '').trim() || (userFormData.phoneOutside || '').trim() || editingUser.phone,
        isAdmin: userFormData.isAdmin,
        role: userFormData.isAdmin ? 'admin' : 'user',
        supervisorId: userFormData.supervisorId || undefined,
        preferences: {
          ...(editingUser.preferences || {}),
          showInspectionScheduler: userFormData.showInspectionScheduler,
          showSharedFiles: userFormData.showSharedFiles,
          hideInspectionScheduler: !userFormData.showInspectionScheduler,
          hideSharedFiles: !userFormData.showSharedFiles,
        },
      });
    } else {
      onAddUser({
        name: (userFormData.name || '').trim(),
        kanaName: (userFormData.kanaName || '').trim(),
        loginId: finalLoginId,
        password: (userFormData.password || '').trim() || 'test',
        office: userFormData.office,
        division: userFormData.division,
        position: userFormData.position,
        department: deptString,
        avatarUrl: userFormData.avatarUrl || '',
        email: (userFormData.email || '').trim(),
        mobileEmail: (userFormData.mobileEmail || '').trim(),
        phoneOutside: (userFormData.phoneOutside || '').trim(),
        phoneExtension: (userFormData.phoneExtension || '').trim(),
        mobilePhone: (userFormData.mobilePhone || '').trim(),
        phone: (userFormData.mobilePhone || '').trim() || (userFormData.phoneOutside || '').trim(),
        isAdmin: userFormData.isAdmin,
        role: userFormData.isAdmin ? 'admin' : 'user',
        supervisorId: userFormData.supervisorId || undefined,
        preferences: {
          showInspectionScheduler: userFormData.showInspectionScheduler,
          showSharedFiles: userFormData.showSharedFiles,
          hideInspectionScheduler: !userFormData.showInspectionScheduler,
          hideSharedFiles: !userFormData.showSharedFiles,
        },
      });
    }

    setIsUserModalOpen(false);
  };

  const handleDeleteUserClick = (user: User) => {
    if (user.id === currentUser.id) {
      setConfirmModal({
        isOpen: true,
        title: '削除不可',
        message: '自分自身のアカウントを削除することはできません。',
        type: 'warning',
        confirmText: 'OK'
      });
      return;
    }
    setConfirmModal({
      isOpen: true,
      title: 'メンバーの削除',
      message: `メンバー「${user.name}」を削除してもよろしいですか？`,
      type: 'danger',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      onConfirm: () => {
        onDeleteUser(user.id);
      }
    });
  };

  // --- SYSTEM DIAGNOSTIC & DATABASE INFO HELPERS ---
  const DB_SCHEMAS_ALL = [
    {
      tableName: 'dbo.Users',
      description: 'メンバー（ユーザー）の基本情報・ログイン情報・各種連絡先を保持するテーブルです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: 'ユーザーの一意識別子 (UUID等)' },
        { name: 'loginId', type: 'VARCHAR(50)', constraint: 'UNIQUE / NULL許可', desc: 'ログインID' },
        { name: 'password', type: 'VARCHAR(100)', constraint: 'NULL許可', desc: 'パスワード' },
        { name: 'name', type: 'NVARCHAR(100)', constraint: 'NOT NULL', desc: '氏名（漢字）' },
        { name: 'department', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '所属部署' },
        { name: 'office', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '所属拠点 (OfficeMaster.name と紐付け)' },
        { name: 'division', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '所属部門 (DivisionMaster.name と紐付け)' },
        { name: 'position', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '役職 (PositionMaster.name と紐付け)' },
        { name: 'role', type: "VARCHAR(50) DEFAULT 'user'", constraint: 'NOT NULL', desc: "システム権限 ('admin' または 'user')" },
        { name: 'isAdmin', type: 'BIT DEFAULT 0', constraint: 'NOT NULL', desc: '管理者フラグ (1:管理者, 0:一般ユーザー)' },
        { name: 'avatarUrl', type: 'NVARCHAR(500)', constraint: 'NULL許可', desc: 'アバター画像URLまたはアバターパス' },
        { name: 'email', type: 'NVARCHAR(255)', constraint: 'NULL許可', desc: 'PCメールアドレス' },
        { name: 'mobileEmail', type: 'NVARCHAR(255)', constraint: 'NULL許可', desc: '携帯メールアドレス' },
        { name: 'phone', type: 'NVARCHAR(50)', constraint: 'NULL許可', desc: '直通電話番号' },
        { name: 'phoneOutside', type: 'NVARCHAR(50)', constraint: 'NULL許可', desc: '外線番号' },
        { name: 'phoneExtension', type: 'NVARCHAR(50)', constraint: 'NULL許可', desc: '内線番号' },
        { name: 'mobilePhone', type: 'NVARCHAR(50)', constraint: 'NULL許可', desc: '携帯電話番号' },
        { name: 'icalUrl', type: 'NVARCHAR(500)', constraint: 'NULL許可', desc: 'iCal連携用外部スケジュールURL' },
        { name: 'supervisorId', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: '直属の上長(承認者)のID (Users.id と紐付け)' }
      ]
    },
    {
      tableName: 'dbo.Posts',
      description: 'タイムライン（社内SNS）の投稿データを格納するテーブルです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: '投稿の一意識別子' },
        { name: 'authorId', type: 'VARCHAR(50)', constraint: 'NOT NULL', desc: '投稿者ID (Users.id と紐付け)' },
        { name: 'content', type: 'NVARCHAR(MAX)', constraint: 'NOT NULL', desc: '投稿本文' },
        { name: 'createdAt', type: 'DATETIME', constraint: 'DEFAULT GETDATE()', desc: '投稿日時' },
        { name: 'likes', type: 'INT DEFAULT 0', constraint: 'NOT NULL', desc: 'いいねの総数' },
        { name: 'isLiked', type: 'BIT DEFAULT 0', constraint: 'NOT NULL', desc: 'ダミー/デフォルトいいね状態' },
        { name: 'nasLink', type: 'NVARCHAR(500)', constraint: 'NULL許可', desc: 'ファイルサーバー (NAS) 共有リンクパス' },
        { name: 'tags', type: 'NVARCHAR(500)', constraint: 'NULL許可', desc: 'カンマ区切りのタグリスト' }
      ]
    },
    {
      tableName: 'dbo.PostTags',
      description: 'タイムライン投稿に関連付けられたタグを高速検索・管理するための中間テーブルです。',
      columns: [
        { name: 'postId', type: 'VARCHAR(50)', constraint: 'NOT NULL', desc: '投稿ID (Posts.id と紐付け)' },
        { name: 'tag', type: 'NVARCHAR(100)', constraint: 'NOT NULL', desc: 'タグ文字列' }
      ]
    },
    {
      tableName: 'dbo.Events',
      description: 'カレンダーの予定・会議室や社用車の施設予約・行事を管理するテーブルです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: 'イベントの一意識別子' },
        { name: 'title', type: 'NVARCHAR(255)', constraint: 'NOT NULL', desc: '予定・行事名 / 施設予約名' },
        { name: 'startAt', type: 'DATETIME', constraint: 'NOT NULL', desc: '開始日時' },
        { name: 'endAt', type: 'DATETIME', constraint: 'NOT NULL', desc: '終了日時' },
        { name: 'isAllDay', type: 'BIT DEFAULT 0', constraint: 'NOT NULL', desc: '終日フラグ' },
        { name: 'category', type: 'NVARCHAR(50)', constraint: 'NULL許可', desc: '予定カテゴリー (例: 社内行事, 施設予約, 往訪など)' },
        { name: 'description', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: '予定・予約の詳細説明' },
        { name: 'location', type: 'NVARCHAR(255)', constraint: 'NULL許可', desc: '会議室・場所・予約施設情報' },
        { name: 'office', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '対象拠点 (特定の拠点に絞る場合)' },
        { name: 'division', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '対象部署' }
      ]
    },
    {
      tableName: 'dbo.Workflows',
      description: '電子決裁（申請・承認フロー）の申請データと進捗状態を管理するテーブルです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: '申請の一意識別子' },
        { name: 'title', type: 'NVARCHAR(255)', constraint: 'NOT NULL', desc: '申請タイトル' },
        { name: 'description', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: '申請内容・理由' },
        { name: 'applicantId', type: 'VARCHAR(50)', constraint: 'NOT NULL', desc: '申請者ID (Users.id と紐付け)' },
        { name: 'approverId', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: '現在の判定者 / 承認者ID (Users.id)' },
        { name: 'status', type: "VARCHAR(50) DEFAULT 'pending'", constraint: 'NOT NULL', desc: "進捗ステータス ('pending', 'approved', 'rejected' 等)" },
        { name: 'createdAt', type: 'DATETIME', constraint: 'DEFAULT GETDATE()', desc: '申請日時' },
        { name: 'category', type: 'NVARCHAR(50)', constraint: 'NULL許可', desc: '電子決裁カテゴリ' },
        { name: 'type', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '申請書類タイプ (例: 経費精算, 休暇申請など)' },
        { name: 'details', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: 'JSON形式の各種申請固有データ (フォーム項目値等)' }
      ]
    },
    {
      tableName: 'dbo.Bulletins',
      description: '掲示板（重要お知らせや情報共有トピック）の親データを格納するテーブルです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: 'トピックの一意識別子' },
        { name: 'title', type: 'NVARCHAR(255)', constraint: 'NOT NULL', desc: 'トピックタイトル' },
        { name: 'content', type: 'NVARCHAR(MAX)', constraint: 'NOT NULL', desc: '本文 (マークダウンまたはテキスト)' },
        { name: 'category', type: 'NVARCHAR(50)', constraint: 'NULL許可', desc: 'カテゴリー' },
        { name: 'authorId', type: 'VARCHAR(50)', constraint: 'NOT NULL', desc: '作成者ID (Users.id)' },
        { name: 'isPinned', type: 'BIT DEFAULT 0', constraint: 'NOT NULL', desc: 'ピン留め（最上部固定）フラグ' },
        { name: 'office', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '公開先拠点制限' },
        { name: 'division', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '公開先部署制限' },
        { name: 'scope', type: "NVARCHAR(50) DEFAULT N'全社'", constraint: 'NOT NULL', desc: '公開範囲定義' },
        { name: 'tags', type: 'NVARCHAR(500)', constraint: 'NULL許可', desc: 'カンマ区切りのタグ' },
        { name: 'attachments', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: '添付ファイルデータのJSON配列文字列' },
        { name: 'createdAt', type: 'DATETIME', constraint: 'DEFAULT GETDATE()', desc: '作成日時' },
        { name: 'views', type: 'INT DEFAULT 0', constraint: 'NOT NULL', desc: '総閲覧数' },
        { name: 'likes', type: 'INT DEFAULT 0', constraint: 'NOT NULL', desc: '総いいね数' }
      ]
    },
    {
      tableName: 'dbo.BoardComments',
      isUpdated: true,
      description: '掲示板トピックに紐づくコメントデータを格納するテーブルです。古い制約バグ防止のため NULL許可を推奨します。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: 'コメントID' },
        { name: 'bulletinId', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: 'トピックID (Bulletins.id 紐付け)', isUpdated: true },
        { name: 'topicId', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: 'トピックID（互換用）', isUpdated: true },
        { name: 'authorId', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: '投稿者ID' },
        { name: 'author_id', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: '投稿者ID（古い構成への互換用）', isUpdated: true },
        { name: 'content', type: 'NVARCHAR(MAX)', constraint: 'NOT NULL', desc: 'コメント内容' },
        { name: 'createdAt', type: 'DATETIME', constraint: 'DEFAULT GETDATE()', desc: '投稿日時' }
      ]
    },
    {
      tableName: 'dbo.BoardViewers',
      isUpdated: true,
      description: '掲示板トピックを誰がいつ閲覧したか、既読/未読数を追跡するためのテーブルです。',
      columns: [
        { name: 'bulletinId', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: 'トピックID', isUpdated: true },
        { name: 'topicId', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: 'トピックID（互換用）', isUpdated: true },
        { name: 'userId', type: 'VARCHAR(50)', constraint: 'NOT NULL', desc: '閲覧したユーザーID' },
        { name: 'viewedAt', type: 'DATETIME', constraint: 'DEFAULT GETDATE()', desc: '初回閲覧日時' }
      ]
    },
    {
      tableName: 'dbo.ChatRooms',
      description: '社内チャットのグループまたは1対1ダイレクトチャットの部屋を管理するテーブルです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: 'チャットルームID' },
        { name: 'name', type: 'NVARCHAR(100)', constraint: 'NOT NULL', desc: 'チャットルーム名 (グループ名等)' },
        { name: 'type', type: "VARCHAR(50) DEFAULT 'group'", constraint: 'NOT NULL', desc: "ルームタイプ ('group' or 'direct')" },
        { name: 'avatarUrl', type: 'NVARCHAR(500)', constraint: 'NULL許可', desc: 'グループアイコン画像URL' },
        { name: 'lastMessage', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: '最新のメッセージの抜粋' },
        { name: 'updatedAt', type: 'DATETIME', constraint: 'DEFAULT GETDATE()', desc: '最終更新日時' },
        { name: 'last_updated', type: 'DATETIME', constraint: 'NULL許可', desc: '最終更新日時（互換用）' }
      ]
    },
    {
      tableName: 'dbo.ChatMessages',
      description: '各チャットルーム内で送受信されたメッセージ本文を格納するテーブルです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: 'メッセージID' },
        { name: 'senderId', type: 'VARCHAR(50)', constraint: 'NOT NULL', desc: '送信者ユーザーID' },
        { name: 'roomId', type: 'VARCHAR(50)', constraint: 'NOT NULL', desc: '所属チャットルームID' },
        { name: 'message', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: 'メッセージ本文' },
        { name: 'content', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: 'メッセージ本文（互換用）' },
        { name: 'createdAt', type: 'DATETIME', constraint: 'DEFAULT GETDATE()', desc: '送信日時' }
      ]
    },
    {
      tableName: 'dbo.Memos',
      description: '不在時の電話や伝言メモ、および回覧・連絡事項を保持・管理するテーブルです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: '伝言メモID' },
        { name: 'senderId', type: 'VARCHAR(50)', constraint: 'NOT NULL', desc: '作成・送信者ID (Users.id)' },
        { name: 'receiverId', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: '主たる受信者ID (単一宛先互換用)' },
        { name: 'content', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: 'メモ用自由記述内容' },
        { name: 'isRead', type: 'BIT DEFAULT 0', constraint: 'NOT NULL', desc: '既読フラグ' },
        { name: 'createdAt', type: 'DATETIME', constraint: 'DEFAULT GETDATE()', desc: '作成日時' },
        { name: 'fromName', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '相手先担当者名' },
        { name: 'fromCompany', type: 'NVARCHAR(150)', constraint: 'NULL許可', desc: '相手先企業名・社名' },
        { name: 'fromPhone', type: 'NVARCHAR(50)', constraint: 'NULL許可', desc: '相手先連絡先電話番号' },
        { name: 'requirementType', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '要件分類（折返し希望, 伝言のみ等）' },
        { name: 'requirementText', type: 'NVARCHAR(255)', constraint: 'NULL許可', desc: '要件分類（テキスト）' },
        { name: 'details', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: 'その他伝言詳細' },
        { name: 'toUsersJson', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: '複数宛先を格納するJSON配列 (ユーザーID의 リスト)', isNew: true },
        { name: 'recipientStatusesJson', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: '宛先ごとの既読・確認状況を追跡するJSONデータ', isNew: true }
      ]
    },
    {
      tableName: 'dbo.DailyReports',
      isNew: true,
      description: '日々の業務報告、課題、および翌日の予定などを記録する日報テーブルです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: '日報の一意識別子', isNew: true },
        { name: 'authorId', type: 'VARCHAR(50)', constraint: 'NOT NULL', desc: '作成したユーザーID', isNew: true },
        { name: 'reportDate', type: 'VARCHAR(10)', constraint: 'NOT NULL', desc: '日報対象日 (YYYY-MM-DD)', isNew: true },
        { name: 'content', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: '業務の要約・フリーテキスト', isNew: true },
        { name: 'createdAt', type: 'DATETIME', constraint: 'DEFAULT GETDATE()', desc: '日報登録日時', isNew: true },
        { name: 'tasks', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: '本日の実施タスク / JSONまたはテキスト', isNew: true },
        { name: 'results', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: '本日の成果・結果', isNew: true },
        { name: 'issues', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: '課題・反省点・特記事項', isNew: true },
        { name: 'tomorrowPlan', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: '明日の予定・計画', isNew: true }
      ]
    },
    {
      tableName: 'dbo.OfficeMaster',
      isNew: true,
      description: '全社の「拠点（支店、営業所、本社）」の情報を集中管理するマスタテーブルです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: '拠点ID', isNew: true },
        { name: 'name', type: 'NVARCHAR(100)', constraint: 'NOT NULL', desc: '拠点名称', isNew: true },
        { name: 'type', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: '拠点種別 (例: branch, office)', isNew: true },
        { name: 'code', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: '拠点コード', isNew: true },
        { name: 'location', type: 'NVARCHAR(255)', constraint: 'NULL許可', desc: '拠点所在地・住所', isNew: true },
        { name: 'phone', type: 'NVARCHAR(50)', constraint: 'NULL許可', desc: '代表電話番号', isNew: true }
      ]
    },
    {
      tableName: 'dbo.DivisionMaster',
      isNew: true,
      description: '各拠点に存在する「所属部門・部署」を管理するマスタテーブルです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: '部署ID', isNew: true },
        { name: 'name', type: 'NVARCHAR(100)', constraint: 'NOT NULL', desc: '部署・課名称', isNew: true },
        { name: 'code', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: '部署コード', isNew: true },
        { name: 'description', type: 'NVARCHAR(255)', constraint: 'NULL許可', desc: '部署に関するメモ・説明', isNew: true }
      ]
    },
    {
      tableName: 'dbo.PositionMaster',
      isNew: true,
      description: '役職マスタです。メンバー登録時に設定する役職（代表取締役、部長、課長等）を保持します。未設定時は空欄として扱われます。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: '役職ID', isNew: true },
        { name: 'name', type: 'NVARCHAR(100)', constraint: 'NOT NULL', desc: '役職名', isNew: true },
        { name: 'code', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: '役職順序 / コード', isNew: true },
        { name: 'description', type: 'NVARCHAR(255)', constraint: 'NULL許可', desc: '役職権限などの補足説明', isNew: true }
      ]
    },
    {
      tableName: 'dbo.ItemMasters',
      isNew: true,
      description: '電子決裁などの申請書面で選択・精算する「物品・備品名」を管理する品名マスタです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: '品名ID', isNew: true },
        { name: 'name', type: 'NVARCHAR(200)', constraint: 'NOT NULL', desc: '品名・科目名称', isNew: true },
        { name: 'category', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '品名カテゴリ', isNew: true },
        { name: 'defaultUnitPrice', type: 'INT', constraint: 'DEFAULT 0', desc: '標準単価', isNew: true },
        { name: 'unit', type: 'NVARCHAR(50)', constraint: 'NULL許可', desc: '単位 (個, 箱, 枚 等)', isNew: true },
        { name: 'code', type: 'VARCHAR(50)', constraint: 'NULL許可', desc: '品名コード', isNew: true }
      ]
    },
    {
      tableName: 'dbo.ApprovalFlows',
      isNew: true,
      description: '電子決裁に適用する「承認ステップ定義・順序」を保存するマスターテーブルです。',
      columns: [
        { name: 'id', type: 'VARCHAR(50)', constraint: 'PRIMARY KEY', desc: '承認フロー定義ID', isNew: true },
        { name: 'name', type: 'NVARCHAR(100)', constraint: 'NOT NULL', desc: 'フロー定義名', isNew: true },
        { name: 'description', type: 'NVARCHAR(255)', constraint: 'NULL許可', desc: 'フローの説明', isNew: true },
        { name: 'targetApplicationType', type: 'NVARCHAR(100)', constraint: 'NULL許可', desc: '適用する申請タイプ', isNew: true },
        { name: 'stepsJson', type: 'NVARCHAR(MAX)', constraint: 'NULL許可', desc: '各承認ステップの構成（JSON配列文字列）', isNew: true },
        { name: 'isDefault', type: 'BIT DEFAULT 0', constraint: 'NOT NULL', desc: '標準適用フローかどうか', isNew: true }
      ]
    },
    {
      tableName: 'dbo.UserReadStatuses',
      isNew: true,
      description: '社内SNSや掲示板などのコンテンツの「ユーザー別・記事別の個別既読状態」を高速判定するためのテーブルです。',
      columns: [
        { name: 'userId', type: 'VARCHAR(50)', constraint: 'NOT NULL', desc: 'ユーザーID (Users.id)', isNew: true },
        { name: 'targetType', type: 'VARCHAR(50)', constraint: 'NOT NULL', desc: "対象タイプ ('post', 'bulletin', 'workflow' 等)", isNew: true },
        { name: 'targetId', type: 'VARCHAR(50)', constraint: 'NOT NULL', desc: '対象コンテンツID', isNew: true },
        { name: 'readAt', type: 'DATETIME', constraint: 'DEFAULT GETDATE()', desc: '既読になった日時', isNew: true }
      ]
    }
  ];

  const runDiagnostic = async () => {
    setDiagnosticLoading(true);
    setDiagnosticStatus('idle');
    setDiagnosticLogs([]);

    const addLog = (msg: string) => {
      setDiagnosticLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    addLog('===== 統合 API & データベース診断を開始します =====');
    addLog(`検証先 API ベースURL: ${API_BASE_URL}`);

    if (!API_BASE_URL) {
      addLog('❌ エラー: APIベースURLが空です。.envの設定を確認してください。');
      setDiagnosticStatus('error');
      setDiagnosticLoading(false);
      return;
    }

    const testEndpoints = [
      { name: 'メンバー管理 (GET /users)', path: '/users' },
      { name: 'タイムラインSNS (GET /posts)', path: '/posts' },
      { name: 'スケジュール・予定 (GET /events)', path: '/events' },
      { name: '電子決裁 (GET /workflows)', path: '/workflows' },
      { name: '掲示板トピック (GET /bulletins)', path: '/bulletins' },
      { name: '社内チャット (GET /chats)', path: '/chats' },
      { name: '伝言メモ (GET /memos)', path: '/memos' },
      { name: '日報 (GET /daily-reports)', path: '/daily-reports' },
      { name: 'マスター (拠点) (GET /masters/offices)', path: '/masters/offices' },
      { name: 'マスター (部署) (GET /masters/divisions)', path: '/masters/divisions' },
      { name: 'マスター (役職) (GET /masters/positions)', path: '/masters/positions' },
    ];

    let hasError = false;
    let hasWarning = false;

    for (let i = 0; i < testEndpoints.length; i++) {
      const ep = testEndpoints[i];
      try {
        addLog(`${i + 1}. 【${ep.name}】 の通信テストを送信中...`);
        const start = Date.now();
        const res = await fetch(`${API_BASE_URL}${ep.path}`, {
          method: 'GET',
          headers: { 'Accept': 'application/json' }
        });
        const duration = Date.now() - start;

        addLog(`   ▶ 受信ステータス: ${res.status} (${duration}ms)`);

        if (res.status === 200) {
          const data = await res.json();
          addLog(`   ✅ 接続成功！ ${Array.isArray(data) ? `${data.length}件のデータを取得しました。` : '正常なレスポンスを受信しました。'}`);
        } else if (res.status === 404) {
          addLog(`   ⚠️ 未実装またはエンドポイントが異なります (404)`);
          hasWarning = true;
        } else {
          const text = await res.text();
          addLog(`   ❌ エラー応答: ${text.slice(0, 150)}`);
          hasError = true;
        }
      } catch (err: any) {
        addLog(`   ❌ 通信に失敗しました: ${err.message}`);
        hasError = true;
      }
    }

    addLog('\n===== 総合アドバイス & 診断結果 =====');
    if (hasError) {
      addLog('❌ 診断結果: 重大な接続エラーが検出されました。');
      addLog('【対策】APIサーバー(Express)が起動しているか、CORSポリシーに * もしくは適切なオリジンが許可されているか、ネットワークルート設定をご確認ください。');
      setDiagnosticStatus('error');
    } else if (hasWarning) {
      addLog('⚠️ 診断結果: 一部のAPIが未実装、またはエンドポイント名が異なっています。');
      addLog('【対策】必要に応じて server.js 側にルートを追加するか、フロントエンドの接続パスを調整してください。');
      setDiagnosticStatus('warning');
    } else {
      addLog('✅ 診断結果: すべての主要APIエンドポイントが正常に応答を返しています！');
      setDiagnosticStatus('success');
    }
    
    addLog('===== 診断完了 =====');
    setDiagnosticLoading(false);
  };

  const handleCopyText = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopySuccess(prev => ({ ...prev, [key]: true }));
    setTimeout(() => {
      setCopySuccess(prev => ({ ...prev, [key]: false }));
    }, 2000);
  };

  // --- OFFICE MASTER HANDLERS ---
  const handleOpenAddOfficeModal = () => {
    setEditingOffice(null);
    setOfficeFormData({
      name: '',
      type: 'branch',
      code: `OFF-${Date.now().toString().slice(-3)}`,
      location: '',
      phone: '',
    });
    setIsOfficeModalOpen(true);
  };

  const handleOpenEditOfficeModal = (off: OfficeMaster) => {
    setEditingOffice(off);
    setOfficeFormData({
      name: off.name,
      type: off.type,
      code: off.code,
      location: off.location || '',
      phone: off.phone || '',
    });
    setIsOfficeModalOpen(true);
  };

  const handleSaveOffice = (e: React.FormEvent) => {
    e.preventDefault();
    if (!officeFormData.name || !officeFormData.name.trim()) return;

    if (editingOffice) {
      onUpdateOffice({
        ...editingOffice,
        name: (officeFormData.name || '').trim(),
        type: officeFormData.type,
        code: (officeFormData.code || '').trim() || editingOffice.code,
        location: (officeFormData.location || '').trim(),
        phone: (officeFormData.phone || '').trim(),
      });
    } else {
      onAddOffice({
        name: (officeFormData.name || '').trim(),
        type: officeFormData.type,
        code: (officeFormData.code || '').trim() || `OFF-${Date.now().toString().slice(-3)}`,
        location: (officeFormData.location || '').trim(),
        phone: (officeFormData.phone || '').trim(),
      });
    }
    setIsOfficeModalOpen(false);
  };

  // --- ITEM MASTER HANDLERS ---
  const handleOpenAddItemModal = () => {
    setEditingItem(null);
    setItemFormData({
      name: '',
      category: '補充',
      defaultUnitPrice: '',
      unit: '',
      code: '',
    });
    setIsItemModalOpen(true);
  };

  const handleOpenEditItemModal = (item: ItemMaster) => {
    setEditingItem(item);
    setItemFormData({
      name: item.name,
      category: item.category || '補充',
      defaultUnitPrice: item.defaultUnitPrice !== undefined ? item.defaultUnitPrice : '',
      unit: item.unit || '',
      code: item.code || '',
    });
    setIsItemModalOpen(true);
  };

  const handleSaveItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!itemFormData.name || !itemFormData.name.trim()) return;

    if (editingItem) {
      if (onUpdateItemMaster) {
        onUpdateItemMaster({
          ...editingItem,
          name: (itemFormData.name || '').trim(),
          category: (itemFormData.category || '').trim(),
          defaultUnitPrice: itemFormData.defaultUnitPrice !== '' ? Number(itemFormData.defaultUnitPrice) : undefined,
          unit: (itemFormData.unit || '').trim(),
          code: (itemFormData.code || '').trim(),
        });
      }
    } else {
      if (onAddItemMaster) {
        onAddItemMaster({
          name: (itemFormData.name || '').trim(),
          category: (itemFormData.category || '').trim(),
          defaultUnitPrice: itemFormData.defaultUnitPrice !== '' ? Number(itemFormData.defaultUnitPrice) : undefined,
          unit: (itemFormData.unit || '').trim(),
          code: (itemFormData.code || '').trim() || `ITM-${Date.now().toString().slice(-4)}`,
        });
      }
    }
    setIsItemModalOpen(false);
  };

  const handleDeleteItemClick = (item: ItemMaster) => {
    setConfirmModal({
      isOpen: true,
      title: '品名マスターの削除',
      message: `品名「${item.name}」をマスターから削除してもよろしいですか？`,
      type: 'danger',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      onConfirm: () => {
        if (onDeleteItemMaster) {
          onDeleteItemMaster(item.id);
        }
      }
    });
  };

  // --- DIVISION MASTER HANDLERS ---
  const handleOpenAddDivisionModal = () => {
    setEditingDivision(null);
    setDivisionFormData({
      name: '',
      code: `DIV-${Date.now().toString().slice(-3)}`,
      description: '',
    });
    setIsDivisionModalOpen(true);
  };

  const handleOpenEditDivisionModal = (div: DivisionMaster) => {
    setEditingDivision(div);
    setDivisionFormData({
      name: div.name,
      code: div.code,
      description: div.description || '',
    });
    setIsDivisionModalOpen(true);
  };

  const handleSaveDivision = (e: React.FormEvent) => {
    e.preventDefault();
    if (!divisionFormData.name || !divisionFormData.name.trim()) return;

    if (editingDivision) {
      onUpdateDivision({
        ...editingDivision,
        name: (divisionFormData.name || '').trim(),
        code: (divisionFormData.code || '').trim() || editingDivision.code,
        description: (divisionFormData.description || '').trim(),
      });
    } else {
      onAddDivision({
        name: (divisionFormData.name || '').trim(),
        code: (divisionFormData.code || '').trim() || `DIV-${Date.now().toString().slice(-3)}`,
        description: (divisionFormData.description || '').trim(),
      });
    }
    setIsDivisionModalOpen(false);
  };

  // --- POSITION MASTER HANDLERS ---
  const handleOpenAddPositionModal = () => {
    setEditingPosition(null);
    setPositionFormData({
      name: '',
      code: `POS-${Date.now().toString().slice(-3)}`,
      description: '',
    });
    setIsPositionModalOpen(true);
  };

  const handleOpenEditPositionModal = (pos: PositionMaster) => {
    setEditingPosition(pos);
    setPositionFormData({
      name: pos.name,
      code: pos.code,
      description: pos.description || '',
    });
    setIsPositionModalOpen(true);
  };

  const handleSavePosition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!positionFormData.name || !positionFormData.name.trim()) return;

    if (editingPosition) {
      if (onUpdatePosition) {
        onUpdatePosition({
          ...editingPosition,
          name: (positionFormData.name || '').trim(),
          code: (positionFormData.code || '').trim() || editingPosition.code,
          description: (positionFormData.description || '').trim(),
        });
      }
    } else {
      if (onAddPosition) {
        onAddPosition({
          name: (positionFormData.name || '').trim(),
          code: (positionFormData.code || '').trim() || `POS-${Date.now().toString().slice(-3)}`,
          description: (positionFormData.description || '').trim(),
        });
      }
    }
    setIsPositionModalOpen(false);
  };

  // --- APPROVAL FLOW HANDLERS ---
  const handleOpenAddFlowModal = () => {
    setEditingFlow(null);
    setFlowFormData({
      name: '',
      description: '',
      targetApplicationType: 'all',
      isDefault: false,
      steps: [
        { stepNumber: 1, approverType: 'supervisor_1', stepName: '一次承認（直属上長）' }
      ]
    });
    setIsFlowModalOpen(true);
  };

  const handleOpenEditFlowModal = (flow: ApprovalFlowRule) => {
    setEditingFlow(flow);
    setFlowFormData({
      name: flow.name,
      description: flow.description || '',
      targetApplicationType: flow.targetApplicationType || 'all',
      isDefault: !!flow.isDefault,
      steps: flow.steps.map(s => ({ ...s })),
    });
    setIsFlowModalOpen(true);
  };

  const handleAddFlowStep = () => {
    const newStepNum = flowFormData.steps.length + 1;
    setFlowFormData({
      ...flowFormData,
      steps: [
        ...flowFormData.steps,
        {
          stepNumber: newStepNum,
          approverType: 'supervisor',
          supervisorLevel: newStepNum,
          stepName: `${newStepNum}次承認（上長 第${newStepNum}階層）`
        }
      ]
    });
  };

  const handleRemoveFlowStep = (index: number) => {
    if (flowFormData.steps.length <= 1) return; // 最低1つのステップが必要
    const newSteps = flowFormData.steps.filter((_, i) => i !== index).map((s, idx) => ({
      ...s,
      stepNumber: idx + 1,
      supervisorLevel: s.approverType === 'supervisor' || s.approverType === 'supervisor_n' ? idx + 1 : s.supervisorLevel,
    }));
    setFlowFormData({ ...flowFormData, steps: newSteps });
  };

  const handleStepTypeChange = (index: number, newType: ApproverType) => {
    const updatedSteps = [...flowFormData.steps];
    const stepNum = index + 1;
    let defaultStepName = updatedSteps[index].stepName;

    if (newType === 'supervisor_1') {
      defaultStepName = '一次承認（直属上長）';
    } else if (newType === 'supervisor_2') {
      defaultStepName = '二次承認（二次上長）';
    } else if (newType === 'supervisor' || newType === 'supervisor_n') {
      defaultStepName = `${stepNum}次承認（上長 第${stepNum}階層）`;
    } else if (newType === 'specific_user') {
      defaultStepName = `${stepNum}次承認（特定個人指定）`;
    }

    updatedSteps[index] = {
      ...updatedSteps[index],
      approverType: newType,
      supervisorLevel: (newType === 'supervisor_1') ? 1 : (newType === 'supervisor_2') ? 2 : stepNum,
      stepName: defaultStepName,
      specificUserId: newType === 'specific_user' ? (allUsers[0]?.id || '') : undefined,
    };
    setFlowFormData({ ...flowFormData, steps: updatedSteps });
  };

  const handleStepUserChange = (index: number, userId: string) => {
    const updatedSteps = [...flowFormData.steps];
    updatedSteps[index] = {
      ...updatedSteps[index],
      specificUserId: userId
    };
    setFlowFormData({ ...flowFormData, steps: updatedSteps });
  };

  const handleSaveFlow = (e: React.FormEvent) => {
    e.preventDefault();
    if (!flowFormData.name || !flowFormData.name.trim() || flowFormData.steps.length === 0) return;

    if (editingFlow) {
      if (onUpdateApprovalFlow) {
        onUpdateApprovalFlow({
          ...editingFlow,
          name: (flowFormData.name || '').trim(),
          description: (flowFormData.description || '').trim(),
          targetApplicationType: flowFormData.targetApplicationType,
          isDefault: flowFormData.isDefault,
          steps: flowFormData.steps,
        });
      }
    } else {
      if (onAddApprovalFlow) {
        onAddApprovalFlow({
          name: (flowFormData.name || '').trim(),
          description: (flowFormData.description || '').trim(),
          targetApplicationType: flowFormData.targetApplicationType,
          isDefault: flowFormData.isDefault,
          steps: flowFormData.steps,
        });
      }
    }
    setIsFlowModalOpen(false);
  };

  // Filter Users
  const filteredUsers = allUsers.filter((u) => {
    const matchesSearch = 
      u.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      u.department.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (u.email && u.email.toLowerCase().includes(searchQuery.toLowerCase()));

    if (selectedOfficeFilter === 'all') return matchesSearch;
    return matchesSearch && u.office === selectedOfficeFilter;
  });

  return (
    <div className="flex-1 max-w-5xl mx-auto space-y-6">
      {/* Top Admin Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm ring-1 ring-slate-900/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-indigo-600 text-white rounded-xl flex items-center justify-center shadow-md shadow-indigo-100">
            <ShieldCheck className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold text-slate-900">全社・拠点・部署マスター管理</h1>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                管理者 (健介) 専用
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              拠点マスター（名古屋支店・浜松営業所・静岡営業所・本社 等）と部署マスター（管理・営業・設計・工務・保守・保守営業・総務 等）の定義およびメンバー配属登録を行えます。
            </p>
          </div>
        </div>

        {/* User switcher & status */}
        <div className="flex items-center gap-3 bg-slate-50 p-2.5 rounded-xl border border-slate-200 shrink-0">
          <img
            src={getAvatarUrl(currentUser.avatarUrl)}
            alt={currentUser.name}
            className="w-8 h-8 rounded-full object-cover border border-indigo-300"
          />
          <div className="text-xs">
            <div className="font-bold text-slate-800 flex items-center gap-1">
              <span>{currentUser.name}</span>
              <span className="text-[10px] text-indigo-600 font-semibold">(管理者)</span>
            </div>
            <div className="text-slate-500">{currentUser.department}</div>
          </div>

          {onSwitchUser && (
            <div className="pl-3 border-l border-slate-200">
              <select
                onChange={(e) => {
                  const selected = allUsers.find((u) => u.id === e.target.value);
                  if (selected) onSwitchUser(selected);
                }}
                value={currentUser.id}
                className="text-xs bg-white border border-slate-300 rounded-lg px-2 py-1 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-700 font-medium cursor-pointer"
                title="表示ユーザー切り替え"
              >
                {allUsers.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name} {u.isAdmin ? ' (管理者)' : ' (一般)'}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>
      </div>

      {/* Admin Sub Navigation Tabs */}
      <div className="flex border-b border-slate-200 bg-white rounded-xl p-1.5 shadow-xs border">
        <button
          onClick={() => setActiveSubTab('users')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'users'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Users className="w-4 h-4" />
          メンバー配属登録 & 権限管理 ({allUsers.length}名)
        </button>

        <button
          onClick={() => setActiveSubTab('offices')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'offices'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Building2 className="w-4 h-4" />
          拠点マスター ({offices.length})
        </button>

        <button
          onClick={() => setActiveSubTab('divisions')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'divisions'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Layers className="w-4 h-4" />
          部署マスター ({divisions.length})
        </button>

        <button
          onClick={() => setActiveSubTab('positions')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'positions'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Briefcase className="w-4 h-4" />
          役職マスター ({positions.length})
        </button>

        <button
          onClick={() => setActiveSubTab('items')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'items'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <ShoppingBag className="w-4 h-4" />
          品名マスター ({itemMasters.length})
        </button>

        <button
          onClick={() => setActiveSubTab('approval_flows')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'approval_flows'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <GitMerge className="w-4 h-4" />
          承認フロー設定 ({approvalFlows.length})
        </button>

        <button
          onClick={() => setActiveSubTab('system')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'system'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Settings className="w-4 h-4" />
          システム情報
        </button>

        <button
          onClick={() => setActiveSubTab('workflows_cleanup')}
          className={`flex-1 py-2.5 text-xs font-bold rounded-lg flex items-center justify-center gap-2 transition-all ${
            activeSubTab === 'workflows_cleanup'
              ? 'bg-indigo-600 text-white shadow-sm'
              : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
          }`}
        >
          <Trash2 className="w-4 h-4" />
          承認済みワークフロー削除
        </button>
      </div>

      {/* SUB TAB 1: MEMBERS & AFFILIATIONS */}
      {activeSubTab === 'users' && (
        <div className="space-y-6">
          {/* Action bar: Search, Office filter, Add user button */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex-1 flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoComplete="off"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="メンバー氏名、所属、メールアドレスで検索..."
                  className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-9 pr-3 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
                />
              </div>

              <select
                value={selectedOfficeFilter}
                onChange={(e) => setSelectedOfficeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">すべての拠点 ({allUsers.length}名)</option>
                {offices.map((off) => (
                  <option key={off.id} value={off.name}>
                    {off.name} ({allUsers.filter((u) => u.office === off.name).length}名)
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={handleOpenAddUserModal}
              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-2 transition-all shadow-sm shrink-0"
            >
              <UserPlus className="w-4 h-4" />
              新規メンバー追加・登録
            </button>
          </div>

          {/* Members Table / List */}
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
            <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                <span className="font-bold text-slate-700 text-sm">
                  登録メンバー一覧 ({filteredUsers.length}名)
                </span>
              </div>
              {/* 一括操作バー */}
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-amber-900">点検予定:</span>
                  <button
                    type="button"
                    onClick={() => handleBatchToggle('inspection', true)}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500 hover:bg-amber-600 text-white transition-colors cursor-pointer shadow-2xs"
                    title="表示中メンバーの点検予定管理メニューを一括ON"
                  >
                    全員ON
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchToggle('inspection', false)}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer shadow-2xs"
                    title="表示中メンバーの点検予定管理メニューを一括OFF"
                  >
                    全員OFF
                  </button>
                </div>
                <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
                  <span className="text-[11px] font-bold text-indigo-900">共有ファイル:</span>
                  <button
                    type="button"
                    onClick={() => handleBatchToggle('files', true)}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-indigo-600 hover:bg-indigo-700 text-white transition-colors cursor-pointer shadow-2xs"
                    title="表示中メンバーの共有ファイルメニューを一括ON"
                  >
                    全員ON
                  </button>
                  <button
                    type="button"
                    onClick={() => handleBatchToggle('files', false)}
                    className="px-2 py-0.5 rounded text-[11px] font-bold bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors cursor-pointer shadow-2xs"
                    title="表示中メンバーの共有ファイルメニューを一括OFF"
                  >
                    全員OFF
                  </button>
                </div>
              </div>
            </div>

            {filteredUsers.length === 0 ? (
              <div className="p-12 text-center space-y-3">
                <Users className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-slate-500 text-xs">該当するメンバーが見つかりません。</p>
              </div>
            ) : (
              filteredUsers.map((user) => (
                <div key={user.id} className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 hover:bg-slate-50/80 transition-colors">
                  <div className="flex items-center gap-4">
                    <img
                      src={getAvatarUrl(user.avatarUrl)}
                      alt={user.name}
                      className="w-12 h-12 rounded-full object-cover border-2 border-indigo-100 ring-2 ring-slate-100"
                    />
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-base">{user.name}</span>
                        {user.isAdmin ? (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                            <Shield className="w-3 h-3 text-indigo-600" />
                            管理者
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                            一般ユーザー
                          </span>
                        )}
                      </div>

                      {/* Affiliation Badges (Office + Division + Position) */}
                      <div className="flex flex-wrap items-center gap-2 pt-0.5">
                        <span className="text-xs font-bold text-slate-800 bg-slate-100 px-2.5 py-0.5 rounded border border-slate-200 flex items-center gap-1">
                          <Building2 className="w-3 h-3 text-slate-500" />
                          {user.office || '拠点未設定'}
                        </span>
                        <span className="text-slate-300 font-bold">/</span>
                        <span className="text-xs font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-200 flex items-center gap-1">
                          <Layers className="w-3 h-3 text-indigo-500" />
                          {user.division || '部署未設定'}
                        </span>
                        {user.position && (
                          <>
                            <span className="text-slate-300 font-bold">/</span>
                            <span className="text-xs font-extrabold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-200 flex items-center gap-1">
                              <Briefcase className="w-3 h-3 text-purple-500" />
                              {user.position}
                            </span>
                          </>
                        )}
                        {!user.isAdmin && (
                          user.preferences?.showInspectionScheduler ? (
                            <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200" title="点検予定管理メニュー表示中">
                              点検予定: 表示
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200" title="点検予定管理メニュー非表示中">
                              点検予定: 非表示
                            </span>
                          )
                        )}
                        {!user.isAdmin && (
                          user.preferences?.showSharedFiles ? (
                            <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200" title="共有ファイルメニュー表示中">
                              共有ファイル: 表示
                            </span>
                          ) : (
                            <span className="text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded border border-slate-200" title="共有ファイルメニュー非表示中">
                              共有ファイル: 非表示
                            </span>
                          )
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 text-xs text-slate-500 pt-1">
                        {user.mobileEmail ? (
                          <span className="flex items-center gap-1 font-mono text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">
                            <Smartphone className="w-3 h-3 text-indigo-500" />
                            携帯: {user.mobileEmail}
                          </span>
                        ) : (
                          <span className="text-slate-400 text-[11px]">携帯: 未設定</span>
                        )}
                        {user.email && (
                          <span className="flex items-center gap-1 font-mono">
                            <Mail className="w-3 h-3 text-slate-400" />
                            PC: {user.email}
                          </span>
                        )}
                        {user.phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="w-3 h-3 text-slate-400" />
                            {user.phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Action Buttons */}
                  <div className="flex flex-wrap items-center gap-2 self-end md:self-center shrink-0">
                    {user.mobileEmail && (
                      <button
                        type="button"
                        disabled={testEmailSendingKey === `user-mob-${user.id}`}
                        onClick={() => handleSendTestEmail(user.mobileEmail!, user.name, `user-mob-${user.id}`)}
                        title="このメンバーの携帯メールへテスト送信"
                        className="px-2.5 py-1.5 rounded-lg text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition-colors flex items-center gap-1 cursor-pointer disabled:opacity-50"
                      >
                        <Smartphone className="w-3.5 h-3.5 text-indigo-600" />
                        {testEmailSendingKey === `user-mob-${user.id}` ? '送信中...' : '携帯宛テスト送信'}
                      </button>
                    )}

                    {/* ワンクリック 点検予定トグル */}
                    {!user.isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleToggleInspection(user)}
                        title={`クリックで「点検予定管理」を${user.preferences?.showInspectionScheduler ? 'OFF（非表示）' : 'ON（表示）'}に切り替え`}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                          user.preferences?.showInspectionScheduler
                            ? 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 hover:text-slate-700'
                        }`}
                      >
                        {user.preferences?.showInspectionScheduler ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-amber-600" />
                            点検: ON
                          </>
                        ) : (
                          <>
                            <X className="w-3.5 h-3.5 text-slate-400" />
                            点検: OFF
                          </>
                        )}
                      </button>
                    )}

                    {/* ワンクリック 共有ファイルトグル */}
                    {!user.isAdmin && (
                      <button
                        type="button"
                        onClick={() => handleToggleFiles(user)}
                        title={`クリックで「共有ファイル」を${user.preferences?.showSharedFiles ? 'OFF（非表示）' : 'ON（表示）'}に切り替え`}
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1 border transition-all cursor-pointer ${
                          user.preferences?.showSharedFiles
                            ? 'bg-indigo-50 text-indigo-800 border-indigo-300 hover:bg-indigo-100'
                            : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200 hover:text-slate-700'
                        }`}
                      >
                        {user.preferences?.showSharedFiles ? (
                          <>
                            <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                            ファイル: ON
                          </>
                        ) : (
                          <>
                            <X className="w-3.5 h-3.5 text-slate-400" />
                            ファイル: OFF
                          </>
                        )}
                      </button>
                    )}

                    <button
                      onClick={() => onToggleUserAdmin(user.id)}
                      title="管理者権限切り替え"
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5 border transition-all ${
                        user.isAdmin
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100'
                          : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      <Shield className="w-3.5 h-3.5" />
                      {user.isAdmin ? '管理者' : '一般'}
                    </button>

                    <button
                      onClick={() => handleOpenEditUserModal(user)}
                      className="px-3.5 py-1.5 text-xs font-bold text-slate-700 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 rounded-lg flex items-center gap-1.5 transition-colors border border-slate-200"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                      拠点・部署編集
                    </button>

                    <button
                      onClick={() => handleDeleteUserClick(user)}
                      className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors border border-transparent hover:border-red-200"
                      title="メンバー削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* SUB TAB 2: OFFICE MASTERS */}
      {activeSubTab === 'offices' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-indigo-600" />
                  拠点マスター（支店・営業所・本社 等）一覧
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  全社共通の拠点を管理・定義します。ここで登録された拠点がメンバー登録時の「拠点選択」に反映されます。
                </p>
              </div>

              <button
                onClick={handleOpenAddOfficeModal}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                拠点マスター追加
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {offices.map((off) => {
                const badge = officeTypeLabels[off.type] || officeTypeLabels.branch;
                const memberCount = allUsers.filter((u) => u.office === off.name).length;

                return (
                  <div key={off.id} className="p-5 bg-white border border-slate-200 rounded-xl shadow-xs space-y-3 relative hover:border-indigo-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-mono font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                          {off.code}
                        </span>
                        <span className={`text-xs px-2.5 py-0.5 rounded-full font-bold border ${badge.badgeClass}`}>
                          {badge.label}
                        </span>
                      </div>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditOfficeModal(off)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors"
                          title="編集"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: '拠点マスターの削除',
                              message: `拠点マスター「${off.name}」を削除してもよろしいですか？`,
                              type: 'danger',
                              confirmText: '削除する',
                              cancelText: 'キャンセル',
                              onConfirm: () => {
                                onDeleteOffice(off.id);
                              }
                            });
                          }}
                          className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div>
                      <h4 className="text-lg font-bold text-slate-900">{off.name}</h4>
                    </div>

                    <div className="space-y-1 text-xs text-slate-600">
                      {off.location && (
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{off.location}</span>
                        </div>
                      )}
                      {off.phone && (
                        <div className="flex items-center gap-1.5">
                          <Phone className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{off.phone}</span>
                        </div>
                      )}
                    </div>

                    <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">所属メンバー数:</span>
                      <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-100">
                        {memberCount} 名
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB 3: DIVISION MASTERS */}
      {activeSubTab === 'divisions' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Layers className="w-5 h-5 text-indigo-600" />
                  部署マスター（管理・営業・設計・工務・保守・保守営業・総務 等）一覧
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  全社共通の部署定義です。ここで登録された部署がメンバー登録時の「部署選択」に反映されます。
                </p>
              </div>

              <button
                onClick={handleOpenAddDivisionModal}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                部署マスター追加
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {divisions.map((div) => {
                const memberCount = allUsers.filter((u) => u.division === div.name).length;

                return (
                  <div key={div.id} className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2 relative hover:border-purple-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                        {div.code}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditDivisionModal(div)}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors"
                          title="編集"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: '部署マスターの削除',
                              message: `部署マスター「${div.name}」を削除してもよろしいですか？`,
                              type: 'danger',
                              confirmText: '削除する',
                              cancelText: 'キャンセル',
                              onConfirm: () => {
                                onDeleteDivision(div.id);
                              }
                            });
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-purple-600 shrink-0" />
                      <h4 className="text-base font-bold text-slate-900">{div.name}</h4>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed min-h-[32px]">
                      {div.description || '業務を担当します。'}
                    </p>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">所属メンバー数:</span>
                      <span className="font-extrabold text-purple-700 bg-purple-50 px-2.5 py-0.5 rounded border border-purple-100">
                        {memberCount} 名
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB 4: POSITION MASTERS */}
      {activeSubTab === 'positions' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Briefcase className="w-5 h-5 text-indigo-600" />
                  役職マスター（代表取締役・部長・課長・課長補佐・主任 等）一覧
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  全社共通の役職定義です。メンバー登録時は「（役職なし / 空欄）」の選択も可能です。
                </p>
              </div>

              <button
                onClick={handleOpenAddPositionModal}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition-colors shadow-sm shrink-0"
              >
                <Plus className="w-4 h-4" />
                役職マスター追加
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {positions.map((pos) => {
                const memberCount = allUsers.filter((u) => u.position === pos.name).length;

                return (
                  <div key={pos.id} className="p-4 bg-white border border-slate-200 rounded-xl shadow-xs space-y-2 relative hover:border-indigo-300 transition-colors">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-mono font-bold bg-slate-100 text-slate-500 px-2 py-0.5 rounded">
                        {pos.code}
                      </span>

                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => handleOpenEditPositionModal(pos)}
                          className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded transition-colors"
                          title="編集"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => {
                            setConfirmModal({
                              isOpen: true,
                              title: '役職マスターの削除',
                              message: `役職マスター「${pos.name}」を削除してもよろしいですか？`,
                              type: 'danger',
                              confirmText: '削除する',
                              cancelText: 'キャンセル',
                              onConfirm: () => {
                                if (onDeletePosition) onDeletePosition(pos.id);
                              }
                            });
                          }}
                          className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded transition-colors"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full bg-indigo-600 shrink-0" />
                      <h4 className="text-base font-bold text-slate-900">{pos.name}</h4>
                    </div>

                    <p className="text-xs text-slate-500 leading-relaxed min-h-[32px]">
                      {pos.description || '社内役職・権限区分です。'}
                    </p>

                    <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-xs">
                      <span className="text-slate-500">該当メンバー数:</span>
                      <span className="font-extrabold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded border border-indigo-100">
                        {memberCount} 名
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* SUB TAB: APPROVAL FLOW SETTINGS */}
      {activeSubTab === 'approval_flows' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-indigo-600" />
                承認フローの定義・ステップ設定
              </h3>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                申請内容や種別に応じた1段階・最大2段階の承認プロセスを設定できます。<br />
                「上長（一次）」「上長（二次）」を指定すると、個人ではなく動的に対象者の直属上長・上位上長に確認依頼が届きます。
              </p>
            </div>

            <button
              onClick={handleOpenAddFlowModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center justify-center gap-1.5 shadow-sm shrink-0 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>新規承認フロー作成</span>
            </button>
          </div>

          {/* Flow Cards List */}
          <div className="space-y-4">
            {approvalFlows.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                <GitMerge className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-600">承認フローがまだ登録されていません</p>
                <p className="text-xs text-slate-400 mt-1">「新規承認フロー作成」ボタンから承認ステップを追加してください。</p>
              </div>
            ) : (
              approvalFlows.map((flow) => {
                const appTypeLabels: Record<string, string> = {
                  all: '全申請共通',
                  business_trip: '出張申請',
                  inventory_issue: '補充申請',
                  purchase_order: '発注申請',
                  other: 'その他',
                };

                return (
                  <div
                    key={flow.id}
                    className="p-5 bg-white border border-slate-200 rounded-2xl shadow-xs hover:border-indigo-200 transition-all space-y-4"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <h4 className="text-sm font-bold text-slate-900">{flow.name}</h4>
                        {flow.isDefault && (
                          <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-indigo-100 text-indigo-700 border border-indigo-200">
                            デフォルト
                          </span>
                        )}
                        <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                          {appTypeLabels[flow.targetApplicationType || 'all']}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 self-end sm:self-auto">
                        <button
                          onClick={() => handleOpenEditFlowModal(flow)}
                          className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg border border-slate-200 transition-colors flex items-center gap-1 cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                          <span>編集</span>
                        </button>
                        {onDeleteApprovalFlow && (
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: '承認フローの削除',
                                message: `承認フロー「${flow.name}」を削除しますか？`,
                                type: 'danger',
                                confirmText: '削除する',
                                cancelText: 'キャンセル',
                                onConfirm: () => {
                                  onDeleteApprovalFlow(flow.id);
                                }
                              });
                            }}
                            className="px-2.5 py-1 text-xs font-semibold text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>削除</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {flow.description && (
                      <p className="text-xs text-slate-500 leading-relaxed">{flow.description}</p>
                    )}

                    {/* Flow Steps Visualization */}
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200/80">
                      <div className="text-xs font-bold text-slate-700 mb-3 flex items-center gap-1.5">
                        <FileCheck className="w-4 h-4 text-indigo-600" />
                        <span>承認ステップ順序 ({flow.steps.length}段階承認):</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-3">
                        {flow.steps.map((step, idx) => {
                          let approverBadge = '';
                          let approverDesc = '';
                          const lvl = step.supervisorLevel || (step.approverType === 'supervisor_2' ? 2 : step.approverType === 'supervisor_1' ? 1 : idx + 1);

                          if (step.approverType === 'supervisor_1') {
                            approverBadge = '上長（一次・直属）';
                            approverDesc = '申請者の直属の上長';
                          } else if (step.approverType === 'supervisor_2') {
                            approverBadge = '上長（二次）';
                            approverDesc = '直属上長の上長（二次上長）';
                          } else if (step.approverType === 'supervisor' || step.approverType === 'supervisor_n') {
                            approverBadge = `上長（第${lvl}階層）`;
                            approverDesc = `申請者から${lvl}階層上の上長`;
                          } else {
                            const specUser = allUsers.find(u => u.id === step.specificUserId);
                            approverBadge = specUser ? `${specUser.name}（個人指定）` : '指定個人';
                            approverDesc = specUser ? `${specUser.office || ''} / ${specUser.division || ''} / ${specUser.position || ''}` : '特定ユーザー';
                          }

                          return (
                            <React.Fragment key={step.stepNumber || idx}>
                              <div className="flex-1 min-w-[200px] bg-white p-3 rounded-xl border border-slate-200 shadow-2xs flex items-center gap-3">
                                <div className="w-7 h-7 rounded-full bg-indigo-600 text-white font-extrabold text-xs flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="text-xs font-bold text-slate-800 truncate">
                                    {step.stepName || `${idx + 1}次承認`}
                                  </div>
                                  <div className="text-[11px] font-extrabold text-indigo-700 flex items-center gap-1 mt-0.5">
                                    <span className="bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-100">
                                      {approverBadge}
                                    </span>
                                  </div>
                                  <div className="text-[10px] text-slate-400 mt-0.5 truncate">{approverDesc}</div>
                                </div>
                              </div>

                              {idx < flow.steps.length - 1 && (
                                <ArrowRight className="w-5 h-5 text-slate-400 shrink-0 hidden sm:block" />
                              )}
                            </React.Fragment>
                          );
                        })}

                        <div className="flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-2 rounded-xl border border-emerald-200 shrink-0">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span>最終承認完了</span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* SUB TAB: ITEM MASTER */}
      {activeSubTab === 'items' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-600" />
                <span>品名マスター設定 ({itemMasters.length}件)</span>
              </h2>
              <p className="text-xs text-slate-500 mt-1">
                発注申請等で選択可能な標準品名・資材・単価のマスタ定義です。
              </p>
            </div>
            <button
              onClick={handleOpenAddItemModal}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>新規品名を追加</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-600 font-bold border-b border-slate-200">
                  <th className="py-2.5 px-3">品番</th>
                  <th className="py-2.5 px-3">品名</th>
                  <th className="py-2.5 px-3">分類/カテゴリ</th>
                  <th className="py-2.5 px-3 text-right">単価</th>
                  <th className="py-2.5 px-3 text-center">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {itemMasters.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="text-center py-8 text-slate-400">
                      登録されている品名マスターはありません。
                    </td>
                  </tr>
                ) : (
                  itemMasters.map(item => (
                    <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono text-slate-600 font-medium">{item.code || '-'}</td>
                      <td className="py-3 px-3 font-bold text-slate-900">{item.name}</td>
                      <td className="py-3 px-3">
                        <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-medium rounded border border-indigo-100">
                          {item.category || '補充'}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-extrabold text-indigo-900 text-right">
                        {item.defaultUnitPrice !== undefined ? `¥${item.defaultUnitPrice.toLocaleString()}` : '-'}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => handleOpenEditItemModal(item)}
                            className="p-1.5 text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                            title="編集"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteItemClick(item)}
                            className="p-1.5 text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SUB TAB 4: SYSTEM SETTINGS */}
      {activeSubTab === 'system' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Settings className="w-5 h-5 text-indigo-600" />
                  システム情報 & 開発・運用統合センター
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  KnowledgeSyncの開発・運用に必要なDB構成、サーバーコード、およびAPI接続状況を管理・共有します。
                </p>
              </div>
              <div className="flex items-center gap-2 text-xs bg-indigo-50 text-indigo-700 font-semibold px-3 py-1.5 rounded-lg border border-indigo-100">
                <Activity className="w-4 h-4 text-indigo-500 animate-pulse" />
                現在稼働環境: 本番 / 同期運用
              </div>
            </div>

            {/* Sub-section Navigation */}
            <div className="flex flex-wrap gap-1 mt-6 p-1 bg-slate-50 rounded-xl border border-slate-200/60 max-w-3xl">
              <button
                onClick={() => setSystemActiveSection('email')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  systemActiveSection === 'email'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Mail className="w-4 h-4 text-indigo-500" />
                <span>📧 メール通知設定 & テスト送信</span>
              </button>
              <button
                onClick={() => setSystemActiveSection('diagnostics')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  systemActiveSection === 'diagnostics'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Activity className="w-4 h-4" />
                API接続 & データベース診断
              </button>
              <button
                onClick={() => setSystemActiveSection('database')}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  systemActiveSection === 'database'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Database className="w-4 h-4" />
                期待されるDB構成 & SQL
              </button>
              <button
                onClick={() => setSystemActiveSection('server_code')}
                className={`relative flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                  systemActiveSection === 'server_code'
                    ? 'bg-white text-indigo-600 shadow-sm'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Server className="w-4 h-4" />
                <span>推奨 server.js コード</span>
                {isServerCodeUpdated && (
                  <span className="absolute -top-1 -right-1 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-rose-500"></span>
                  </span>
                )}
              </button>
            </div>

            {/* SECTION: EMAIL NOTIFICATION SETTINGS & TEST */}
            {systemActiveSection === 'email' && (
              <div className="mt-6 space-y-6">
                {/* SMTP 設定状況概要カード */}
                <div className="bg-gradient-to-r from-slate-900 to-indigo-950 text-white rounded-2xl p-5 shadow-sm space-y-4">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-indigo-900/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-indigo-600/30 rounded-xl border border-indigo-500/30">
                        <Mail className="w-5 h-5 text-indigo-300" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-white flex items-center gap-2">
                          SMTP メールサーバー設定状況
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-2 py-0.5 rounded-full font-normal">
                            .env 設定適用済み
                          </span>
                        </h4>
                        <p className="text-xs text-indigo-200/70 mt-0.5">
                          システム全体のメール通知（スケジュール・伝言メモ・ワークフロー等）に使用されるSMTP設定です。
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={handleFetchSmtpConfig}
                      className="text-xs bg-indigo-800/60 hover:bg-indigo-700 text-indigo-100 px-3 py-1.5 rounded-lg border border-indigo-600/40 flex items-center gap-1.5 transition-colors"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      設定を更新
                    </button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10 space-y-1">
                      <span className="text-indigo-300 font-medium block">送信サーバー (SMTP)</span>
                      <span className="font-mono font-bold text-white text-sm block">
                        {smtpConfigInfo?.host || '111.89.134.68'}
                      </span>
                      <span className="text-[10px] text-slate-400">ポート: {smtpConfigInfo?.port || 587} (暗号化: TLS/STARTTLS)</span>
                    </div>

                    <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10 space-y-1">
                      <span className="text-indigo-300 font-medium block">認証ユーザー</span>
                      <span className="font-mono font-bold text-white text-sm block">
                        {smtpConfigInfo?.user || 'nagoya-soumu2'}
                      </span>
                      <span className="text-[10px] text-slate-400">認証方式: SMTP認証</span>
                    </div>

                    <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10 space-y-1">
                      <span className="text-indigo-300 font-medium block">差出人アドレス</span>
                      <span className="font-mono font-bold text-white text-xs truncate block">
                        {smtpConfigInfo?.fromEmail || 'nagoya-soumu2@teraoka-ads.co.jp'}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate block">
                        名義: {smtpConfigInfo?.fromName || 'Aipo送信用'}
                      </span>
                    </div>

                    <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10 space-y-1">
                      <span className="text-indigo-300 font-medium block">接続ステータス</span>
                      <span className="font-bold text-emerald-400 text-xs flex items-center gap-1.5 mt-1">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        通信準備完了
                      </span>
                      <span className="text-[10px] text-slate-400">SMTPクライアント有効</span>
                    </div>
                  </div>
                </div>

                {/* メール送信テスト結果通知トースト/メッセージ */}
                {testEmailResult && (
                  <div className={`p-4 rounded-xl border flex items-start gap-3 shadow-xs transition-all ${
                    testEmailResult.success 
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-800' 
                      : 'bg-rose-50 border-rose-200 text-rose-800'
                  }`}>
                    {testEmailResult.success ? (
                      <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                    )}
                    <div className="space-y-1 text-xs">
                      <span className="font-bold block">
                        {testEmailResult.success ? 'テストメール送信完了' : '送信エラー'}
                      </span>
                      <p className="leading-relaxed">
                        {testEmailResult.message || testEmailResult.error}
                      </p>
                    </div>
                  </div>
                )}

                {/* 1. 管理者に登録されたユーザーの携帯メールへのテスト送信セクション */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-indigo-600" />
                        管理者宛テストメール送信
                      </h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        システム管理者に指定されているメンバー（およびその携帯メールアドレス）へワンクリックでテストメールを送信します。
                      </p>
                    </div>
                    <span className="text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100 self-start sm:self-auto">
                      管理者数: {allUsers.filter(u => u.isAdmin).length} 名
                    </span>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {allUsers.filter(u => u.isAdmin).length === 0 ? (
                      <div className="col-span-2 text-center py-6 text-slate-400 text-xs">
                        管理者に指定されているユーザーがありません。「メンバー管理」より管理者を指定してください。
                      </div>
                    ) : (
                      allUsers.filter(u => u.isAdmin).map((adminUser) => {
                        const hasMobileEmail = !!adminUser.mobileEmail?.trim();
                        const hasEmail = !!adminUser.email?.trim();

                        return (
                          <div key={adminUser.id} className="p-4 bg-slate-50 rounded-xl border border-slate-200/80 space-y-3 flex flex-col justify-between">
                            <div className="space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div className="flex items-center gap-2.5">
                                  <img
                                    src={getAvatarUrl(adminUser.avatarUrl)}
                                    alt={adminUser.name}
                                    className="w-9 h-9 rounded-full object-cover border border-slate-200 shadow-xs"
                                  />
                                  <div>
                                    <div className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                                      {adminUser.name}
                                      <span className="bg-indigo-600 text-white text-[10px] px-1.5 py-0.2 rounded font-normal">管理者</span>
                                    </div>
                                    <div className="text-[10px] text-slate-500">
                                      {[adminUser.office, adminUser.division, adminUser.position].filter(Boolean).join(' / ')}
                                    </div>
                                  </div>
                                </div>
                              </div>

                              <div className="space-y-1 text-xs pt-1 border-t border-slate-200/60 font-mono">
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-slate-500 flex items-center gap-1 font-sans">
                                    <Smartphone className="w-3.5 h-3.5 text-indigo-500" />
                                    携帯メール:
                                  </span>
                                  <span className={hasMobileEmail ? 'text-slate-800 font-semibold' : 'text-slate-400 italic font-sans'}>
                                    {hasMobileEmail ? adminUser.mobileEmail : '未登録'}
                                  </span>
                                </div>
                                <div className="flex items-center justify-between text-[11px]">
                                  <span className="text-slate-500 flex items-center gap-1 font-sans">
                                    <Mail className="w-3.5 h-3.5 text-slate-400" />
                                    PCメール:
                                  </span>
                                  <span className={hasEmail ? 'text-slate-700' : 'text-slate-400 italic font-sans'}>
                                    {hasEmail ? adminUser.email : '未登録'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            <div className="pt-2 flex flex-wrap gap-2">
                              <button
                                type="button"
                                disabled={!hasMobileEmail || testEmailSendingKey === `mobile-${adminUser.id}`}
                                onClick={() => handleSendTestEmail(adminUser.mobileEmail!, adminUser.name, `mobile-${adminUser.id}`)}
                                className="flex-1 min-w-[140px] px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold rounded-lg shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                              >
                                <Smartphone className="w-3.5 h-3.5" />
                                {testEmailSendingKey === `mobile-${adminUser.id}` ? (
                                  <>
                                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                    送信中...
                                  </>
                                ) : (
                                  '📱 携帯メールへテスト送信'
                                )}
                              </button>

                              {hasEmail && (
                                <button
                                  type="button"
                                  disabled={testEmailSendingKey === `pc-${adminUser.id}`}
                                  onClick={() => handleSendTestEmail(adminUser.email!, adminUser.name, `pc-${adminUser.id}`)}
                                  className="px-3 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                                >
                                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                                  {testEmailSendingKey === `pc-${adminUser.id}` ? '送信中...' : 'PC宛送信'}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>
                </div>

                {/* 2. 任意のメールアドレス宛への自由テスト送信フォーム */}
                <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-5 space-y-4">
                  <div>
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                      <Send className="w-4 h-4 text-indigo-600" />
                      指定メールアドレスへの直接テスト送信
                    </h4>
                    <p className="text-xs text-slate-500 mt-0.5">
                      任意のメールアドレス（docomo, au, SoftBank, Y!mobile, Gmail等のキャリア携帯メールを含む）を入力してテスト送信を実行できます。
                    </p>
                  </div>

                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleSendTestEmail(testCustomEmail, testCustomRecipientName, 'custom-form');
                    }}
                    className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/80"
                  >
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          宛先メールアドレス <span className="text-red-500">*</span>
                        </label>
                        <input
                          type="email"
                          required
                          placeholder="例: user@docomo.ne.jp / admin@example.com"
                          value={testCustomEmail}
                          onChange={(e) => setTestCustomEmail(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1">
                          宛先お名前（任意）
                        </label>
                        <input
                          type="text"
                          placeholder="例: 山道 健介"
                          value={testCustomRecipientName}
                          onChange={(e) => setTestCustomRecipientName(e.target.value)}
                          className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="submit"
                        disabled={!testCustomEmail.trim() || testEmailSendingKey === 'custom-form'}
                        className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg shadow-xs transition-all flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                      >
                        {testEmailSendingKey === 'custom-form' ? (
                          <>
                            <RefreshCw className="w-4 h-4 animate-spin" />
                            テストメール送信中...
                          </>
                        ) : (
                          <>
                            <Send className="w-4 h-4" />
                            テストメールを送信する
                          </>
                        )}
                      </button>
                    </div>
                  </form>
                </div>

                {/* 3. POP3 メール受信・掲示板自動投稿 (メール投稿) 管理 & シミュレーター */}
                <div className="bg-gradient-to-br from-slate-900 via-slate-900 to-blue-950 text-white rounded-2xl p-5 shadow-sm space-y-5 border border-blue-900/50">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 border-b border-blue-900/60 pb-3">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2 bg-blue-600/30 rounded-xl border border-blue-500/30 text-blue-300">
                        <Inbox className="w-5 h-5" />
                      </div>
                      <div>
                        <h4 className="font-bold text-sm text-white flex items-center gap-2">
                          POP3 受信・掲示板自動投稿 (メール投稿連携)
                          <span className="text-[10px] bg-blue-500/20 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded-full font-normal">
                            自動巡回 (60秒毎) & ホワイトリスト保護
                          </span>
                        </h4>
                        <p className="text-xs text-blue-200/70 mt-0.5">
                          SNS専用アドレス（nagoya-soumu2@teraoka-ads.co.jp）へ届いたメールを自動巡回し、登録メンバーのメールのみ「#社内メール」タグで掲示板へ自動掲載します。
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 self-stretch sm:self-auto">
                      <button
                        onClick={handleCheckPop3Now}
                        disabled={isCheckingPop3}
                        className="flex-1 sm:flex-initial text-xs bg-blue-600 hover:bg-blue-500 disabled:bg-blue-800/60 text-white font-bold px-3.5 py-2 rounded-lg shadow-sm flex items-center justify-center gap-1.5 transition-all cursor-pointer disabled:cursor-not-allowed"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${isCheckingPop3 ? 'animate-spin' : ''}`} />
                        {isCheckingPop3 ? '受信巡回中...' : '📥 今すぐ受信チェック'}
                      </button>
                      <button
                        onClick={handleFetchPop3Status}
                        className="text-xs bg-slate-800 hover:bg-slate-700 text-slate-200 px-3 py-2 rounded-lg border border-slate-700 flex items-center gap-1.5 transition-colors"
                        title="稼働状況を再取得"
                      >
                        <RefreshCw className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* POP3 通信パラメータ概要 */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                    <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10 space-y-1">
                      <span className="text-blue-300 font-medium block">受信サーバー (POP3)</span>
                      <span className="font-mono font-bold text-white text-sm block">
                        {pop3InboundInfo?.config?.host || '111.89.134.68'}
                      </span>
                      <span className="text-[10px] text-slate-400">ポート: {pop3InboundInfo?.config?.port || 110} (セキュリティ: なし/平文)</span>
                    </div>

                    <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10 space-y-1">
                      <span className="text-blue-300 font-medium block">認証アカウント / 受信先</span>
                      <span className="font-mono font-bold text-white text-xs truncate block">
                        {pop3InboundInfo?.config?.user || 'nagoya-soumu2'}
                      </span>
                      <span className="text-[10px] text-slate-400 truncate block">
                        {pop3InboundInfo?.config?.fromAddress || 'nagoya-soumu2@teraoka-ads.co.jp'}
                      </span>
                    </div>

                    <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10 space-y-1">
                      <span className="text-blue-300 font-medium block">ホワイトリスト & 自動タグ</span>
                      <span className="font-bold text-emerald-300 text-xs block">
                        登録メンバー {pop3InboundInfo?.whitelist?.whitelistedMembersCount || allUsers.filter(u => !!(u.email?.trim() || u.mobileEmail?.trim())).length} 名 許可
                      </span>
                      <span className="text-[10px] text-blue-200">付与タグ: #{pop3InboundInfo?.config?.defaultTag || '社内メール'}</span>
                    </div>

                    <div className="bg-white/5 backdrop-blur-xs p-3 rounded-xl border border-white/10 space-y-1">
                      <span className="text-blue-300 font-medium block">受信箱自動クリーンアップ</span>
                      <span className="font-bold text-emerald-400 text-xs flex items-center gap-1.5 mt-0.5">
                        <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                        自動削除 有効
                      </span>
                      <span className="text-[10px] text-slate-400">掲示板掲載後・迷惑メール即時削除（容量圧迫完全防止）</span>
                    </div>
                  </div>

                  {/* POP3 手動巡回結果通知 */}
                  {pop3CheckResult && (
                    <div className={`p-4 rounded-xl border flex items-start gap-3 shadow-xs transition-all ${
                      pop3CheckResult.success 
                        ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-200' 
                        : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                    }`}>
                      {pop3CheckResult.success ? (
                        <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                      ) : (
                        <AlertTriangle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
                      )}
                      <div className="space-y-0.5 text-xs">
                        <span className="font-bold block text-white">
                          {pop3CheckResult.success ? '受信巡回完了' : '受信巡回エラー'}
                        </span>
                        <p className="leading-relaxed">
                          {pop3CheckResult.message || pop3CheckResult.error}
                        </p>
                      </div>
                    </div>
                  )}

                  {/* メール投稿テスト・シミュレーター */}
                  <div className="bg-slate-800/80 rounded-xl p-4 border border-slate-700/80 space-y-3">
                    <div className="flex items-center justify-between">
                      <h5 className="font-bold text-xs text-white flex items-center gap-1.5">
                        <Smartphone className="w-4 h-4 text-blue-400" />
                        🧪 メール投稿テスト・シミュレーター (ホワイトリスト照合・掲示板掲載検証)
                      </h5>
                      <span className="text-[10px] text-slate-400">
                        登録メンバーのアドレスからのメールを擬似送信して掲示板への掲載を即時テストできます
                      </span>
                    </div>

                    {simulateResult && (
                      <div className={`p-3 rounded-lg border text-xs flex items-center gap-2 ${
                        simulateResult.success 
                          ? 'bg-emerald-950/60 border-emerald-600/40 text-emerald-200' 
                          : 'bg-rose-950/60 border-rose-600/40 text-rose-200'
                      }`}>
                        {simulateResult.success ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                        ) : (
                          <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
                        )}
                        <span>{simulateResult.message || simulateResult.error}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-300 mb-1">
                          送信者メールアドレス (登録メンバー)
                        </label>
                        <select
                          value={simulateSenderEmail}
                          onChange={(e) => setSimulateSenderEmail(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        >
                          <option value="">-- 送信者を選択してください --</option>
                          {allUsers.map(u => {
                            const candidate = u.email || u.mobileEmail;
                            if (!candidate) return null;
                            return (
                              <option key={u.id} value={candidate}>
                                {u.name} ({candidate})
                              </option>
                            );
                          })}
                        </select>
                      </div>

                      <div className="sm:col-span-2">
                        <label className="block text-[11px] font-bold text-slate-300 mb-1">
                          メール件名
                        </label>
                        <input
                          type="text"
                          value={simulateSubject}
                          onChange={(e) => setSimulateSubject(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                          placeholder="例: 【緊急連絡】現場完了報告 #連絡"
                        />
                      </div>

                      <div className="sm:col-span-3">
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[11px] font-bold text-slate-300">
                            メール本文
                          </label>
                          <span className="text-[10px] text-blue-300">
                            💡 1行目に [重要] [お知らせ] や [名古屋支店/営業] 等でタブ・宛先を指定可能（省略時は全社・全部署）
                          </span>
                        </div>
                        <textarea
                          rows={3}
                          value={simulateBody}
                          onChange={(e) => setSimulateBody(e.target.value)}
                          className="w-full px-3 py-2 bg-slate-900 border border-slate-700 rounded-lg text-xs text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                          placeholder="[お知らせ] （1行目にタブ・タグ指定、省略可）&#10;メール本文を入力..."
                        />
                      </div>
                    </div>

                    <div className="flex justify-end pt-1">
                      <button
                        type="button"
                        disabled={!simulateSenderEmail || isSimulatingPop3}
                        onClick={handleSimulateEmailPost}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-500 disabled:bg-slate-700 text-white text-xs font-bold rounded-lg shadow-sm transition-all flex items-center gap-1.5 cursor-pointer disabled:cursor-not-allowed"
                      >
                        <Send className={`w-3.5 h-3.5 ${isSimulatingPop3 ? 'animate-spin' : ''}`} />
                        {isSimulatingPop3 ? '投稿シミュレーション実行中...' : 'メール投稿テストを実行して掲示板に掲載'}
                      </button>
                    </div>
                  </div>

                  {/* POP3 稼働・受信履歴ログ */}
                  {pop3InboundInfo?.state?.logs && pop3InboundInfo.state.logs.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-blue-400" />
                        最新のPOP3受信・判定ログ (直近50件)
                      </span>
                      <div className="bg-slate-950 rounded-xl p-3 font-mono text-[11px] leading-relaxed text-slate-300 max-h-48 overflow-y-auto border border-slate-800">
                        {pop3InboundInfo.state.logs.map((log: any, idx: number) => (
                          <div key={idx} className="flex items-start gap-2 py-0.5 border-b border-slate-900 last:border-0">
                            <span className="text-slate-500 shrink-0">{log.timestamp}</span>
                            <span className={`font-bold shrink-0 ${
                              log.type === 'success' ? 'text-emerald-400' :
                              log.type === 'error' ? 'text-rose-400' :
                              log.type === 'warn' ? 'text-amber-400' : 'text-blue-300'
                            }`}>
                              [{log.type.toUpperCase()}]
                            </span>
                            <span className="text-slate-300 break-all">{log.message}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* SECTION 1: API DIAGNOSTICS */}
            {systemActiveSection === 'diagnostics' && (
              <div className="mt-6 space-y-4">
                <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                  <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
                    <div>
                      <div className="text-xs font-bold text-slate-700">API 接続先設定</div>
                      <div className="text-xs font-mono text-indigo-600 mt-1">{API_BASE_URL || '未設定 (開発環境モード)'}</div>
                    </div>
                    <button
                      onClick={runDiagnostic}
                      disabled={diagnosticLoading}
                      className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white text-xs font-bold px-4 py-2 rounded-lg shadow transition-all whitespace-nowrap"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${diagnosticLoading ? 'animate-spin' : ''}`} />
                      {diagnosticLoading ? '診断実行中...' : '接続テストを実行する'}
                    </button>
                  </div>
                </div>

                {diagnosticLogs.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex justify-between items-center">
                      <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Activity className="w-3.5 h-3.5 text-indigo-500" />
                        診断ログ出力
                      </div>
                      <button
                        onClick={() => handleCopyText(diagnosticLogs.join('\n'), 'logs')}
                        className="text-[10px] text-slate-500 hover:text-slate-800 flex items-center gap-1 border border-slate-200 bg-white px-2 py-1 rounded"
                      >
                        {copySuccess['logs'] ? (
                          <>
                            <Check className="w-3 h-3 text-emerald-500" />
                            コピーしました
                          </>
                        ) : (
                          <>
                            <Copy className="w-3 h-3" />
                            ログをコピー
                          </>
                        )}
                      </button>
                    </div>
                    <div className="bg-slate-950 rounded-xl p-4 font-mono text-[11px] leading-relaxed text-slate-300 max-h-72 overflow-y-auto border border-slate-800 shadow-inner">
                      {diagnosticLogs.map((log, index) => (
                        <div key={index} className={log.includes('❌') ? 'text-rose-400' : log.includes('✅') ? 'text-emerald-400' : log.includes('💡') ? 'text-amber-300' : 'text-slate-300'}>
                          {log}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="text-xs font-bold text-slate-700">システム統計概要</div>
                    <div className="text-xs text-slate-600 space-y-1">
                      <div className="flex justify-between"><span>拠点マスター登録数:</span> <span className="font-bold">{offices.length} 件</span></div>
                      <div className="flex justify-between"><span>部署マスター登録数:</span> <span className="font-bold">{divisions.length} 件</span></div>
                      <div className="flex justify-between"><span>役職マスター登録数:</span> <span className="font-bold">{positions.length} 件</span></div>
                      <div className="flex justify-between"><span>全登録メンバー数:</span> <span className="font-bold">{allUsers.length} 名</span></div>
                    </div>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
                    <div className="text-xs font-bold text-slate-700 font-mono">CORS / Synology 連携設定</div>
                    <div className="text-xs text-slate-600 space-y-1">
                      <p className="text-[11px] text-slate-500 leading-normal">
                        Synology NAS 等のリバースプロキシ (Nginx / Portal) 経由で運用する場合、ヘッダーに <code className="font-mono bg-slate-200 px-1 py-0.5 rounded text-indigo-600">Access-Control-Allow-Origin: *</code> または指定オリジンを設定してCORSを解除してください。
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 2: DATABASE SCHEMA & DDL SQL */}
            {systemActiveSection === 'database' && (
              <div className="mt-6 space-y-6">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Database className="w-3.5 h-3.5 text-indigo-500" />
                    期待される SQL Server データベーステーブル構成（全機能網羅）
                  </h4>
                  <p className="text-[11px] text-slate-500 mt-1">
                    社内SNS、カレンダー、電子決裁、掲示板、チャット、伝言メモ、日報等の機能拡張に対応した、SQL Server上での推奨テーブル構成です。
                  </p>
                </div>

                <div className="space-y-4">
                  {/* Table selector Dropdown */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-indigo-50/50 p-4 rounded-xl border border-indigo-100">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-3 w-full sm:w-auto">
                      <label className="text-xs font-bold text-indigo-900 shrink-0">
                        詳細を確認するテーブルを選択:
                      </label>
                      <select
                        value={selectedSystemTable}
                        onChange={(e) => setSelectedSystemTable(e.target.value)}
                        className="w-full sm:w-80 px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer shadow-sm"
                      >
                        {DB_SCHEMAS_ALL.map((schema) => {
                          const prefix = schema.isNew ? '🆕 [新規] ' : schema.isUpdated ? '✨ [更新] ' : '';
                          return (
                            <option key={schema.tableName} value={schema.tableName}>
                              {prefix}{schema.tableName} ({schema.description.slice(0, 15)}...)
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <div className="flex items-center gap-3 text-[10px] text-slate-500 font-bold shrink-0 self-end sm:self-auto">
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-emerald-400"></span>新規テーブル/カラム</span>
                      <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded bg-amber-400"></span>更新テーブル/カラム</span>
                    </div>
                  </div>

                  {/* Render Selected Table Schema */}
                  {(() => {
                    const currentSchema = DB_SCHEMAS_ALL.find(s => s.tableName === selectedSystemTable);
                    if (!currentSchema) return null;

                    return (
                      <div className={`border rounded-2xl overflow-hidden shadow-xs bg-white transition-all ${
                        currentSchema.isNew 
                          ? 'border-emerald-300 ring-2 ring-emerald-100' 
                          : currentSchema.isUpdated 
                          ? 'border-amber-300 ring-2 ring-amber-100' 
                          : 'border-slate-200'
                      }`}>
                        <div className={`border-b px-5 py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 ${
                          currentSchema.isNew 
                            ? 'bg-emerald-50/50 border-emerald-150' 
                            : currentSchema.isUpdated 
                            ? 'bg-amber-50/50 border-amber-150' 
                            : 'bg-slate-50 border-slate-200'
                        }`}>
                          <span className="text-xs font-extrabold text-slate-800 flex items-center flex-wrap gap-2 font-mono">
                            <span className={`w-2 h-2 rounded-full ${
                              currentSchema.isNew 
                                ? 'bg-emerald-500 animate-pulse' 
                                : currentSchema.isUpdated 
                                ? 'bg-amber-500 animate-pulse' 
                                : 'bg-indigo-600'
                            }`}></span>
                            {currentSchema.tableName}
                            {currentSchema.isNew && (
                              <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-emerald-500 text-white rounded shadow-xs animate-bounce">🆕 NEW (新設)</span>
                            )}
                            {currentSchema.isUpdated && (
                              <span className="px-1.5 py-0.5 text-[9px] font-extrabold bg-amber-500 text-white rounded shadow-xs">✨ UPDATED (更新)</span>
                            )}
                          </span>
                          <span className="text-xs text-slate-500 font-medium">
                            {currentSchema.description}
                          </span>
                        </div>
                        <div className="p-4 overflow-x-auto">
                          <table className="w-full text-left text-xs border-collapse">
                            <thead>
                              <tr className="border-b border-slate-200 text-slate-500 font-bold bg-slate-50/50">
                                <th className="py-2.5 px-3">列名</th>
                                <th className="py-2.5 px-3">データ型 (SQL Server)</th>
                                <th className="py-2.5 px-3">制約</th>
                                <th className="py-2.5 px-3">日本語説明 / 紐付け・運用ヒント</th>
                              </tr>
                            </thead>
                            <tbody className="text-slate-700 divide-y divide-slate-100">
                              {currentSchema.columns.map((col: any, idx) => {
                                const isColNew = col.isNew;
                                const isColUpdated = col.isUpdated;
                                const rowClass = isColNew 
                                  ? 'bg-emerald-50/60 hover:bg-emerald-100/40 border-l-4 border-l-emerald-500' 
                                  : isColUpdated 
                                  ? 'bg-amber-50/60 hover:bg-amber-100/40 border-l-4 border-l-amber-500' 
                                  : 'hover:bg-slate-50/40';

                                return (
                                  <tr key={idx} className={`${rowClass} transition-colors`}>
                                    <td className="py-3 px-3 font-mono text-indigo-600 font-bold">
                                      <div className="flex items-center gap-1.5">
                                        <span>{col.name}</span>
                                        {isColNew && (
                                          <span className="px-1 py-0.2 text-[8px] font-extrabold bg-emerald-100 border border-emerald-300 text-emerald-800 rounded font-sans scale-90 origin-left">新設</span>
                                        )}
                                        {isColUpdated && (
                                          <span className="px-1 py-0.2 text-[8px] font-extrabold bg-amber-100 border border-amber-300 text-amber-800 rounded font-sans scale-90 origin-left">更新</span>
                                        )}
                                      </div>
                                    </td>
                                    <td className="py-3 px-3 font-mono text-slate-600">{col.type}</td>
                                    <td className="py-3 px-3">
                                      <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                        col.constraint.includes('PRIMARY KEY')
                                          ? 'bg-rose-50 text-rose-700 border border-rose-100'
                                          : col.constraint.includes('NOT NULL')
                                          ? 'bg-amber-50 text-amber-700 border border-amber-100'
                                          : 'bg-slate-100 text-slate-600'
                                      }`}>
                                        {col.constraint}
                                      </span>
                                    </td>
                                    <td className="py-3 px-3 text-slate-600 leading-normal font-medium">{col.desc}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    );
                  })()}
                </div>

                {/* SQL Server Batch Setup copyable section */}
                <div className="space-y-2">
                  <div className="flex justify-between items-center">
                    <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                      <Database className="w-3.5 h-3.5 text-indigo-500" />
                      全テーブル一括構成 & アップデート SQL (`ssms-db-setup.sql` 基準)
                    </div>
                    <button
                      onClick={() => handleCopyText(`-- ==========================================
-- SQL Server setup & migration script for SSMS
-- Fully non-destructive & idempotent:
-- ==========================================

-- 1. Master Tables
IF OBJECT_ID('dbo.OfficeMaster', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.OfficeMaster (
        id VARCHAR(50) PRIMARY KEY,
        name NVARCHAR(100) NOT NULL,
        type VARCHAR(50) NULL,
        code VARCHAR(50) NULL,
        location NVARCHAR(255) NULL,
        phone NVARCHAR(50) NULL
    );
END;

-- 2. Users Table
IF OBJECT_ID('dbo.Users', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Users (
        id VARCHAR(50) PRIMARY KEY,
        loginId VARCHAR(50) NULL,
        password VARCHAR(100) NULL,
        name NVARCHAR(100) NOT NULL,
        department NVARCHAR(100) NULL,
        avatarUrl NVARCHAR(500) NULL,
        office NVARCHAR(100) NULL,
        division NVARCHAR(100) NULL,
        position NVARCHAR(100) NULL,
        role VARCHAR(50) DEFAULT 'user',
        isAdmin BIT DEFAULT 0,
        supervisorId VARCHAR(50) NULL
    );
END;

-- 3. Bulletins Table
IF OBJECT_ID('dbo.Bulletins', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.Bulletins (
        id VARCHAR(50) PRIMARY KEY,
        title NVARCHAR(255) NOT NULL,
        content NVARCHAR(MAX) NOT NULL,
        authorId VARCHAR(50) NOT NULL,
        createdAt DATETIME DEFAULT GETDATE(),
        category NVARCHAR(50) NULL,
        isPinned BIT DEFAULT 0,
        views INT DEFAULT 0,
        likes INT DEFAULT 0,
        office NVARCHAR(100) NULL,
        division NVARCHAR(100) NULL,
        scope NVARCHAR(50) DEFAULT N'全社',
        tags NVARCHAR(500) NULL,
        attachments NVARCHAR(MAX) NULL
    );
END;

-- 4. BoardComments Table (古い制約の緩和と完全作成)
IF OBJECT_ID('dbo.BoardComments', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BoardComments (
        id VARCHAR(50) PRIMARY KEY,
        bulletinId VARCHAR(50) NULL,
        topicId VARCHAR(50) NULL,
        authorId VARCHAR(50) NULL,
        author_id VARCHAR(50) NULL,
        content NVARCHAR(MAX) NOT NULL,
        createdAt DATETIME DEFAULT GETDATE()
    );
END
ELSE
BEGIN
    IF COL_LENGTH('dbo.BoardComments', 'bulletinId') IS NULL ALTER TABLE dbo.BoardComments ADD bulletinId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.BoardComments', 'topicId') IS NULL ALTER TABLE dbo.BoardComments ADD topicId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.BoardComments', 'authorId') IS NULL ALTER TABLE dbo.BoardComments ADD authorId VARCHAR(50) NULL;
    IF COL_LENGTH('dbo.BoardComments', 'author_id') IS NULL ALTER TABLE dbo.BoardComments ADD author_id VARCHAR(50) NULL;
    
    -- NOT NULLを解除するALTER文
    ALTER TABLE dbo.BoardComments ALTER COLUMN authorId VARCHAR(50) NULL;
    ALTER TABLE dbo.BoardComments ALTER COLUMN author_id VARCHAR(50) NULL;
END;

-- 5. BoardViewers Table (複合キーのバグ回避・NULL許容)
IF OBJECT_ID('dbo.BoardViewers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BoardViewers (
        bulletinId VARCHAR(50) NULL,
        topicId VARCHAR(50) NULL,
        userId VARCHAR(50) NOT NULL,
        viewedAt DATETIME DEFAULT GETDATE()
    );
END;
`, 'setup_sql')}
                      className="text-[10px] text-indigo-600 hover:text-indigo-800 flex items-center gap-1 border border-indigo-200 bg-indigo-50 px-2 py-1 rounded"
                    >
                      {copySuccess['setup_sql'] ? (
                        <>
                          <Check className="w-3 h-3 text-emerald-500" />
                          コピーしました！
                        </>
                      ) : (
                        <>
                          <Copy className="w-3 h-3" />
                          セットアップSQLをコピー
                        </>
                      )}
                    </button>
                  </div>
                  <div className="bg-slate-900 border border-slate-800 rounded-xl p-4 font-mono text-[11px] leading-relaxed text-slate-300 max-h-56 overflow-y-auto">
                    <pre className="text-slate-300">
{`-- ==========================================
-- SQL Server setup & migration script (Board Fixes)
-- ==========================================
-- (1) BoardCommentsテーブルへの互換カラムの追加
IF COL_LENGTH('dbo.BoardComments', 'author_id') IS NULL 
    ALTER TABLE dbo.BoardComments ADD author_id VARCHAR(50) NULL;

-- (2) 制約の緩和 (NOT NULLの解除)
ALTER TABLE dbo.BoardComments ALTER COLUMN authorId VARCHAR(50) NULL;
ALTER TABLE dbo.BoardComments ALTER COLUMN author_id VARCHAR(50) NULL;

-- (3) BoardViewersテーブルの構成
IF OBJECT_ID('dbo.BoardViewers', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.BoardViewers (
        bulletinId VARCHAR(50) NULL,
        topicId VARCHAR(50) NULL,
        userId VARCHAR(50) NOT NULL,
        viewedAt DATETIME DEFAULT GETDATE()
    );
END;`}
                    </pre>
                  </div>
                </div>
              </div>
            )}

            {/* SECTION 3: RECOMMENDED SERVER.JS CODE */}
            {systemActiveSection === 'server_code' && (
              <div className="mt-6 space-y-4">
                {isServerCodeUpdated && (
                  <div className="p-4 bg-rose-50 border border-rose-200 shadow-xs rounded-2xl flex items-start gap-3 animate-pulse">
                    <div className="p-2 bg-rose-100 rounded-xl text-rose-600 shrink-0">
                      <Server className="w-5 h-5" />
                    </div>
                    <div className="space-y-1">
                      <div className="text-xs font-bold text-rose-900 flex items-center gap-1.5 flex-wrap">
                        <span>【更新通知】最新機能に対応した server.js のアップデート推奨</span>
                        <span className="px-1.5 py-0.5 text-[8px] bg-rose-600 text-white font-extrabold rounded">UPDATE</span>
                      </div>
                      <p className="text-[11px] text-rose-700 leading-normal">
                        日報の取得・登録、マスタ統合（拠点・部署・役職・品名マスタ等）、および複数宛先対応の伝言メモに関する最新APIエンドポイントを追加した
                        <code className="bg-rose-100 px-1 py-0.5 rounded font-bold">server.js</code> の最新コードが利用可能です。
                        以下のコードをコピーして、Synology NASまたはサーバーに上書き保存し、Node.js サーバーを再起動してください。
                      </p>
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pb-2">
                  <div>
                    <h4 className="text-xs font-bold text-slate-800">
                      推奨される `server.js` (Express + SQL Server) の全量
                    </h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      不具合・制約バグを完全に解消した、Windows Server & Synology 用 Express バックエンドコードです。
                    </p>
                  </div>
                  <button
                    onClick={() => handleCopyText(RECOMMEND_SERVER_JS, 'server_js')}
                    className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg shadow shadow-indigo-100 transition-all"
                  >
                    {copySuccess['server_js'] ? (
                      <>
                        <Check className="w-3.5 h-3.5" />
                        コピーしました！
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        server.js コードをコピー
                      </>
                    )}
                  </button>
                </div>

                <div className="relative">
                  <div className={`rounded-xl overflow-hidden transition-all duration-300 ${
                    isServerCodeUpdated ? 'ring-2 ring-rose-500 ring-offset-2' : ''
                  }`}>
                    <div className="bg-slate-950 rounded-xl p-4 font-mono text-[11px] leading-relaxed text-slate-300 max-h-[480px] overflow-y-auto border border-slate-800 shadow-inner">
                      <pre className="text-slate-300 whitespace-pre">
                        {RECOMMEND_SERVER_JS}
                      </pre>
                    </div>
                  </div>
                </div>

                <div className="p-4 bg-amber-50 rounded-xl border border-amber-200/80">
                  <div className="text-xs font-bold text-amber-800 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    【注意】Synology NAS等での環境構築のステップ
                  </div>
                  <ol className="list-decimal text-[11px] text-amber-700 mt-2 ml-4 space-y-1.5 leading-normal">
                    <li>NAS内の任意のフォルダ（例: <code className="bg-amber-100 px-1 py-0.5 rounded text-amber-800">/volume1/web/api</code>）に、この推奨コードを <code className="font-bold font-mono">server.js</code> として保存します。</li>
                    <li>同フォルダ内に <code className="font-bold font-mono">package.json</code> を作成し、<code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-800">{"{\"name\": \"sns-backend-api\", \"version\": \"1.0.0\", \"main\": \"server.js\", \"type\": \"module\", \"dependencies\": {\"cors\": \"^2.8.5\", \"dotenv\": \"^16.4.5\", \"express\": \"^4.19.2\", \"mssql\": \"^10.0.2\", \"multer\": \"^1.4.5-lts.2\", \"node-fetch\": \"^2.7.0\", \"web-push\": \"^3.6.7\"}, \"nodemonConfig\": {\"ignore\": [\"uploads/*\", \"public/uploads/*\"]}}"}</code> と記述します。</li>
                    <li>ターミナル（SSH）で同フォルダに入り、<code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-800">npm install</code> を実行して依存関係をダウンロードします。</li>
                    <li>同フォルダ内に <code className="font-mono font-bold">.env</code> を作成し、接続設定（DB_USER, DB_PASSWORD, DB_SERVER 等）を保存し、<code className="font-mono bg-amber-100 px-1 py-0.5 rounded text-amber-800">node server.js</code> で起動します。</li>
                  </ol>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* MEMBER (USER) ADD/EDIT MODAL */}
      {isUserModalOpen && (
        <div
          onClick={() => setIsUserModalOpen(false)}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden ring-1 ring-slate-900/5 my-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-indigo-600" />
                {editingUser ? 'メンバープロフィールの編集' : '新規メンバー登録'}
              </h2>
              <button
                onClick={() => setIsUserModalOpen(false)}
                className="p-1 text-slate-400 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} autoComplete="off" className="p-6 space-y-4">
              {userFormError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{userFormError}</span>
                </div>
              )}

              {/* アバター（顔写真）アップロード */}
              <div className="flex flex-col sm:flex-row items-center gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200/80">
                <div className="relative shrink-0">
                  <img
                    src={getAvatarUrl(userFormData.avatarUrl)}
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
                  <span className="block text-xs font-bold text-slate-700">メンバーの顔写真</span>
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
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-indigo-400 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors shadow-xs shrink-0"
                    >
                      <Upload className="w-3.5 h-3.5" />
                      写真をアップロード
                    </button>
                    
                    {userFormData.avatarUrl && userFormData.avatarUrl !== SILHOUETTE_SVG && !userFormData.avatarUrl.includes('data:image/svg+xml') && (
                      <button
                        type="button"
                        onClick={handleRemoveAvatar}
                        disabled={avatarUploading}
                        className="px-3 py-1.5 bg-white border border-rose-200 hover:bg-rose-50 text-rose-600 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors"
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

              {/* Name & Kana */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    氏名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    autoComplete="off"
                    placeholder="例: 山道 健介"
                    value={userFormData.name}
                    onChange={(e) => {
                      setUserFormData({ ...userFormData, name: e.target.value });
                      setUserFormError(null);
                    }}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    名前（フリガナ）
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="例: ヤマミチ ケンスケ"
                    value={userFormData.kanaName}
                    onChange={(e) => setUserFormData({ ...userFormData, kanaName: e.target.value })}
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Login Credentials */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    ユーザー名 (ログインID)
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="例: yamamichi"
                    value={userFormData.loginId}
                    onChange={(e) => setUserFormData({ ...userFormData, loginId: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    パスワード
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="例: test"
                    value={userFormData.password}
                    onChange={(e) => setUserFormData({ ...userFormData, password: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Office, Division, Position */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    拠点マスター <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={userFormData.office}
                    onChange={(e) => setUserFormData({ ...userFormData, office: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    部署マスター <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={userFormData.division}
                    onChange={(e) => setUserFormData({ ...userFormData, division: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500 cursor-pointer"
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
                    役職マスター <span className="text-slate-400 font-normal text-[10px]">（任意 / 未設定時は空欄）</span>
                  </label>
                  <select
                    value={userFormData.position || ''}
                    onChange={(e) => setUserFormData({ ...userFormData, position: e.target.value })}
                    className="w-full px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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

              {/* Preview */}
              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">登録表記プレビュー:</span>
                <span className="font-extrabold text-indigo-900 text-xs bg-white px-3 py-1 rounded-lg border border-indigo-200 shadow-2xs">
                  {[userFormData.office || '拠点未設定', userFormData.division || '部署未設定', userFormData.position].filter(Boolean).join(' / ')}
                </span>
              </div>

              {/* Emails */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">メールアドレス</label>
                  <input
                    type="email"
                    autoComplete="off"
                    placeholder="yamamichi@teraoka-ads.co.jp"
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">携帯メールアドレス</label>
                    {userFormData.mobileEmail?.trim() && (
                      <button
                        type="button"
                        disabled={testEmailSendingKey === 'modal-mobile'}
                        onClick={() => handleSendTestEmail(userFormData.mobileEmail, userFormData.name || 'メンバー', 'modal-mobile')}
                        className="text-[10px] text-indigo-600 font-bold hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        <Smartphone className="w-3 h-3" />
                        {testEmailSendingKey === 'modal-mobile' ? 'テスト送信中...' : 'テスト送信'}
                      </button>
                    )}
                  </div>
                  <input
                    type="email"
                    autoComplete="off"
                    placeholder="example@docomo.ne.jp"
                    value={userFormData.mobileEmail}
                    onChange={(e) => setUserFormData({ ...userFormData, mobileEmail: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Phones */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">電話番号 (外線)</label>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="052-123-4567"
                    value={userFormData.phoneOutside}
                    onChange={(e) => setUserFormData({ ...userFormData, phoneOutside: e.target.value })}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">電話番号 (内線)</label>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="16"
                    value={userFormData.phoneExtension}
                    onChange={(e) => setUserFormData({ ...userFormData, phoneExtension: e.target.value })}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">電話番号 (携帯)</label>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="080-3281-6140"
                    value={userFormData.mobilePhone}
                    onChange={(e) => setUserFormData({ ...userFormData, mobilePhone: e.target.value })}
                    className="w-full px-2.5 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>
              </div>

              {/* Supervisor field */}
              <div className="pt-2 border-t border-slate-100">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  上長（承認者）
                </label>
                <select
                  value={userFormData.supervisorId}
                  onChange={(e) => setUserFormData({ ...userFormData, supervisorId: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                >
                  <option value="">（未設定）</option>
                  {allUsers
                    .filter((u) => !editingUser || u.id !== editingUser.id) // 自分自身は選択不可
                    .map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.office || ''} / {u.division || ''} / {u.position || ''})
                      </option>
                    ))}
                </select>
              </div>

              {/* Admin toggle */}
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <div>
                  <span className="text-xs font-bold text-slate-700 block">管理者権限を付与する</span>
                  <span className="text-[10px] text-slate-400">管理者権限を持つユーザーはすべての機能・メニューにアクセスできます</span>
                </div>
                <input
                  type="checkbox"
                  checked={userFormData.isAdmin}
                  onChange={(e) => setUserFormData({ ...userFormData, isAdmin: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                />
              </div>

              {/* Menu & Page Permissions */}
              <div className="pt-3 border-t border-slate-100 space-y-2.5">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-slate-700">
                    メニュー・機能の表示制御
                  </label>
                  <span className="text-[10px] text-slate-400 font-medium">※デフォルトはOFF（非表示）</span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        「点検予定管理」メニューを表示
                      </span>
                      <span className="text-[10px] text-slate-500">
                        ONにすると、このメンバーのメニューに「点検予定管理」が表示されます
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={userFormData.showInspectionScheduler}
                      onChange={(e) => setUserFormData({ ...userFormData, showInspectionScheduler: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer shrink-0"
                    />
                  </label>
                  <div className="border-t border-slate-200/80 my-1" />
                  <label className="flex items-center justify-between cursor-pointer">
                    <div>
                      <span className="text-xs font-bold text-slate-800 block">
                        「共有ファイル」メニューを表示
                      </span>
                      <span className="text-[10px] text-slate-500">
                        ONにすると、このメンバーのメニューに「共有ファイル」が表示されます
                      </span>
                    </div>
                    <input
                      type="checkbox"
                      checked={userFormData.showSharedFiles}
                      onChange={(e) => setUserFormData({ ...userFormData, showSharedFiles: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer shrink-0"
                    />
                  </label>
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                >
                  {editingUser ? '更新保存' : '登録する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* OFFICE MASTER MODAL */}
      {isOfficeModalOpen && (
        <div
          onClick={() => setIsOfficeModalOpen(false)}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-slate-900/5"
          >
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-indigo-600" />
                {editingOffice ? '拠点マスター編集' : '拠点マスター追加'}
              </h2>
              <button
                onClick={() => setIsOfficeModalOpen(false)}
                className="p-1 text-slate-400 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOffice} autoComplete="off" className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  拠点名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="例: 名古屋支店, 浜松営業所, 静岡営業所"
                  value={officeFormData.name}
                  onChange={(e) => setOfficeFormData({ ...officeFormData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">拠点区分</label>
                  <select
                    value={officeFormData.type}
                    onChange={(e) => setOfficeFormData({ ...officeFormData, type: e.target.value as OfficeType })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="branch">支店</option>
                    <option value="sales_office">営業所</option>
                    <option value="headquarter">本社</option>
                    <option value="other">その他</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">識別コード</label>
                  <input
                    type="text"
                    autoComplete="off"
                    placeholder="OFF-001"
                    value={officeFormData.code}
                    onChange={(e) => setOfficeFormData({ ...officeFormData, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">所在地 (住所)</label>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="愛知県名古屋市中村区名駅1-1-4"
                  value={officeFormData.location}
                  onChange={(e) => setOfficeFormData({ ...officeFormData, location: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">代表電話番号</label>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="052-555-0192"
                  value={officeFormData.phone}
                  onChange={(e) => setOfficeFormData({ ...officeFormData, phone: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsOfficeModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                >
                  {editingOffice ? '更新保存' : '追加する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* DIVISION MASTER MODAL */}
      {isDivisionModalOpen && (
        <div
          onClick={() => setIsDivisionModalOpen(false)}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-slate-900/5"
          >
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Layers className="w-5 h-5 text-indigo-600" />
                {editingDivision ? '部署マスター編集' : '部署マスター追加'}
              </h2>
              <button
                onClick={() => setIsDivisionModalOpen(false)}
                className="p-1 text-slate-400 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveDivision} autoComplete="off" className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  部署名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="例: 管理, 営業, 設計, 工務, 保守, 保守営業, 総務"
                  value={divisionFormData.name}
                  onChange={(e) => setDivisionFormData({ ...divisionFormData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-purple-900 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">識別コード</label>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="DIV-001"
                  value={divisionFormData.code}
                  onChange={(e) => setDivisionFormData({ ...divisionFormData, code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">説明・業務概要</label>
                <textarea
                  rows={3}
                  placeholder="例: 設備点検及び各種アフターフォローを担当"
                  value={divisionFormData.description}
                  onChange={(e) => setDivisionFormData({ ...divisionFormData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsDivisionModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                >
                  {editingDivision ? '更新保存' : '追加する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* POSITION MASTER MODAL */}
      {isPositionModalOpen && (
        <div
          onClick={() => setIsPositionModalOpen(false)}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-slate-900/5"
          >
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <Briefcase className="w-5 h-5 text-indigo-600" />
                {editingPosition ? '役職マスター編集' : '役職マスター追加'}
              </h2>
              <button
                onClick={() => setIsPositionModalOpen(false)}
                className="p-1 text-slate-400 hover:bg-slate-200 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePosition} autoComplete="off" className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  役職名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="例: 代表取締役, 部長, 課長, 課長補佐, 主任"
                  value={positionFormData.name}
                  onChange={(e) => setPositionFormData({ ...positionFormData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">識別コード</label>
                <input
                  type="text"
                  autoComplete="off"
                  placeholder="POS-001"
                  value={positionFormData.code}
                  onChange={(e) => setPositionFormData({ ...positionFormData, code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">説明・職責の定義</label>
                <textarea
                  rows={3}
                  placeholder="例: 部署内の業務統括及び意思決定を補佐"
                  value={positionFormData.description}
                  onChange={(e) => setPositionFormData({ ...positionFormData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsPositionModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm"
                >
                  {editingPosition ? '更新保存' : '追加する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* APPROVAL FLOW MASTER MODAL */}
      {isFlowModalOpen && (
        <div
          onClick={() => setIsFlowModalOpen(false)}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden ring-1 ring-slate-900/5 my-8 max-h-[90vh] overflow-y-auto"
          >
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <GitMerge className="w-5 h-5 text-indigo-600" />
                {editingFlow ? '承認フロー編集' : '新規承認フロー登録'}
              </h2>
              <button
                onClick={() => setIsFlowModalOpen(false)}
                className="p-1 text-slate-400 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveFlow} autoComplete="off" className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  フロー名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  placeholder="例: 標準2段階承認フロー（上長1次 → 上長2次）"
                  value={flowFormData.name}
                  onChange={(e) => setFlowFormData({ ...flowFormData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">説明・運用メモ</label>
                <textarea
                  rows={2}
                  placeholder="例: 直属上長と、その上の二次上長の二段階で確認・承認を行います。"
                  value={flowFormData.description}
                  onChange={(e) => setFlowFormData({ ...flowFormData, description: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">対象申請タイプ</label>
                  <select
                    value={flowFormData.targetApplicationType}
                    onChange={(e) => setFlowFormData({ ...flowFormData, targetApplicationType: e.target.value as ApplicationType | 'all' })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="all">全申請共通</option>
                    <option value="business_trip">出張申請</option>
                    <option value="inventory_issue">補充申請</option>
                    <option value="purchase_order">発注申請</option>
                    <option value="other">その他</option>
                  </select>
                </div>

                <div className="flex items-center pt-5">
                  <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={flowFormData.isDefault}
                      onChange={(e) => setFlowFormData({ ...flowFormData, isDefault: e.target.checked })}
                      className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
                    />
                    <span>デフォルトフローとして設定</span>
                  </label>
                </div>
              </div>

              {/* Step Configuration Section */}
              <div className="pt-2 border-t border-slate-100 space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <CheckSquare className="w-4 h-4 text-indigo-600" />
                    承認ステップ設定 (無制限・任意階層)
                  </label>
                  <button
                    type="button"
                    onClick={handleAddFlowStep}
                    className="text-xs font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>ステップを追加</span>
                  </button>
                </div>

                <div className="space-y-3">
                  {flowFormData.steps.map((step, idx) => (
                    <div key={idx} className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl space-y-3 relative">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-extrabold text-indigo-900 bg-indigo-100 px-2 py-0.5 rounded">
                          ステップ {idx + 1}: {idx + 1}次承認
                        </span>
                        {flowFormData.steps.length > 1 && (
                          <button
                            type="button"
                            onClick={() => handleRemoveFlowStep(idx)}
                            className="text-xs text-rose-600 hover:text-rose-800 hover:bg-rose-100 p-1 rounded transition-colors cursor-pointer"
                            title="このステップを削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            承認者の指定方法
                          </label>
                          <select
                            value={step.approverType}
                            onChange={(e) => handleStepTypeChange(idx, e.target.value as ApproverType)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                          >
                            <option value="supervisor_1">直属上長 (1階層目)</option>
                            <option value="supervisor_2">二次上長 (2階層目)</option>
                            <option value="supervisor">階層上長 (第{idx + 1}階層上長)</option>
                            <option value="specific_user">特定ユーザー (個人指定)</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            ステップ表示名
                          </label>
                          <input
                            type="text"
                            autoComplete="off"
                            value={step.stepName || ''}
                            onChange={(e) => {
                              const updatedSteps = [...flowFormData.steps];
                              updatedSteps[idx].stepName = e.target.value;
                              setFlowFormData({ ...flowFormData, steps: updatedSteps });
                            }}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
                          />
                        </div>
                      </div>

                      {step.approverType === 'specific_user' && (
                        <div>
                          <label className="block text-[11px] font-bold text-slate-600 mb-1">
                            承認者を選択
                          </label>
                          <select
                            value={step.specificUserId || ''}
                            onChange={(e) => handleStepUserChange(idx, e.target.value)}
                            className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                          >
                            {allUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name} ({u.office || ''} / {u.division || ''} / {u.position || ''})
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsFlowModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm cursor-pointer"
                >
                  {editingFlow ? '更新保存' : '追加する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ITEM MASTER ADD / EDIT MODAL */}
      {isItemModalOpen && (
        <div
          onClick={() => setIsItemModalOpen(false)}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden ring-1 ring-slate-900/5 my-8"
          >
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
              <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
                <ShoppingBag className="w-5 h-5 text-indigo-600" />
                {editingItem ? '品名マスターの編集' : '新規品名マスター登録'}
              </h2>
              <button
                onClick={() => setIsItemModalOpen(false)}
                className="p-1 text-slate-400 hover:bg-slate-200 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveItem} autoComplete="off" className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  品名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={itemFormData.name}
                  onChange={e => setItemFormData({ ...itemFormData, name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="例: 高圧制御盤用CVTケーブル"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    品番
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={itemFormData.code}
                    onChange={e => setItemFormData({ ...itemFormData, code: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="例: 16010140"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    分類/カテゴリ
                  </label>
                  <input
                    type="text"
                    autoComplete="off"
                    value={itemFormData.category}
                    onChange={e => setItemFormData({ ...itemFormData, category: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    placeholder="例: 補充"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  単価 (円)
                </label>
                <input
                  type="number"
                  min="0"
                  autoComplete="off"
                  value={itemFormData.defaultUnitPrice}
                  onChange={e => setItemFormData({ ...itemFormData, defaultUnitPrice: e.target.value ? Number(e.target.value) : '' })}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  placeholder="例: 2105"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsItemModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm cursor-pointer"
                >
                  {editingItem ? '更新保存' : '登録する'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* WORKFLOWS CLEANUP SUB TAB */}
      {activeSubTab === 'workflows_cleanup' && (
        <div className="space-y-6">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
              <div>
                <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
                  <Trash2 className="w-5 h-5 text-indigo-600" />
                  ワークフロー削除・クリーンアップ
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  テスト用や不要になった申請（ワークフロー）のデータを一括、または個別で安全に削除できます。
                </p>
              </div>
            </div>

            {/* 一括削除セクション */}
            {applications.filter(app => app.status === 'approved').length > 0 && (
              <div className="mt-6 p-4 bg-rose-50 border border-rose-200 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
                <div className="space-y-1">
                  <h4 className="text-sm font-bold text-rose-900 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-rose-600" />
                    承認済みワークフローの一括削除
                  </h4>
                  <p className="text-xs text-rose-700 leading-relaxed">
                    現在、システム内に承認済みのワークフローが <strong>{applications.filter(app => app.status === 'approved').length} 件</strong> 存在します。<br />
                    テストなどで作成した承認済みデータを一掃したい場合は、右のボタンからすべて一括削除できます。
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const approvedApps = applications.filter(app => app.status === 'approved');
                    setConfirmModal({
                      isOpen: true,
                      title: '承認済みワークフローの一括削除',
                      message: `現在登録されているすべての承認済みワークフロー（${approvedApps.length}件）を削除します。この操作は取り消せません。本当によろしいですか？`,
                      type: 'danger',
                      confirmText: '一括削除する',
                      cancelText: 'キャンセル',
                      onConfirm: async () => {
                        if (onDeleteApplication) {
                          for (const app of approvedApps) {
                            await onDeleteApplication(app.id);
                          }
                          setConfirmModal({
                            isOpen: true,
                            title: '一括削除完了',
                            message: `${approvedApps.length} 件の承認済みワークフローを削除しました。`,
                            type: 'success',
                            confirmText: 'OK'
                          });
                        }
                      }
                    });
                  }}
                  className="flex items-center gap-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg shadow-sm transition-all whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  承認済みを一括削除
                </button>
              </div>
            )}

            {/* 検索・絞り込みバー */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  autoComplete="off"
                  value={workflowSearchQuery}
                  onChange={(e) => setWorkflowSearchQuery(e.target.value)}
                  placeholder="タイトル、申請者名、理由などで検索..."
                  className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>

              <div className="flex gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 shrink-0">
                {(['all', 'approved', 'pending', 'rejected', 'draft'] as const).map((status) => {
                  const labelMap: Record<typeof status, string> = {
                    all: 'すべて',
                    approved: '承認済み',
                    pending: '申請中',
                    rejected: '却下',
                    draft: '下書き',
                  };
                  const count = status === 'all' 
                    ? applications.length 
                    : applications.filter(app => app.status === status).length;

                  return (
                    <button
                      key={status}
                      onClick={() => setWorkflowStatusFilter(status)}
                      className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                        workflowStatusFilter === status
                          ? 'bg-white text-indigo-600 shadow-xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {labelMap[status]} ({count})
                    </button>
                  );
                })}
              </div>
            </div>

            {/* リスト */}
            <div className="mt-4 border border-slate-200 rounded-xl overflow-hidden bg-white shadow-xs">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 text-xs font-bold">
                    <th className="py-3 px-4">申請書ID</th>
                    <th className="py-3 px-4">申請種別</th>
                    <th className="py-3 px-4">タイトル</th>
                    <th className="py-3 px-4">申請者</th>
                    <th className="py-3 px-4">申請日時</th>
                    <th className="py-3 px-4">状況</th>
                    <th className="py-3 px-4 text-center">操作</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {applications
                    .filter(app => {
                      // ステータス絞り込み
                      if (workflowStatusFilter !== 'all' && app.status !== workflowStatusFilter) {
                        return false;
                      }
                      // 検索クエリ絞り込み
                      if (workflowSearchQuery.trim()) {
                        const query = workflowSearchQuery.toLowerCase();
                        const titleMatch = app.title?.toLowerCase().includes(query);
                        const descMatch = app.description?.toLowerCase().includes(query);
                        const applicantMatch = app.applicant?.name?.toLowerCase().includes(query);
                        const typeMatch = app.type?.toLowerCase().includes(query);
                        return titleMatch || descMatch || applicantMatch || typeMatch;
                      }
                      return true;
                    })
                    .map((app) => {
                      const statusConfig: Record<string, { label: string; bg: string; text: string }> = {
                        approved: { label: '承認済み', bg: 'bg-emerald-50 border-emerald-200', text: 'text-emerald-700' },
                        pending: { label: '申請中', bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700' },
                        rejected: { label: '却下', bg: 'bg-rose-50 border-rose-200', text: 'text-rose-700' },
                        draft: { label: '下書き', bg: 'bg-slate-50 border-slate-200', text: 'text-slate-600' },
                      };
                      const s = statusConfig[app.status] || { label: app.status, bg: 'bg-slate-100', text: 'text-slate-800' };

                      return (
                        <tr key={app.id} className="hover:bg-slate-50/50 text-xs transition-colors">
                          <td className="py-3 px-4 font-mono text-slate-500 font-bold">{app.id}</td>
                          <td className="py-3 px-4 font-bold text-slate-700">{app.type}</td>
                          <td className="py-3 px-4 font-bold text-slate-800">{app.title}</td>
                          <td className="py-3 px-4">
                            <div className="flex items-center gap-2">
                              {app.applicant?.avatarUrl ? (
                                <img src={getAvatarUrl(app.applicant.avatarUrl)} className="w-5 h-5 rounded-full object-cover" />
                              ) : (
                                <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 font-bold">
                                  {app.applicant?.name?.slice(0, 1) || '未'}
                                </div>
                              )}
                              <span className="font-bold text-slate-700">{app.applicant?.name || '不明'}</span>
                            </div>
                          </td>
                          <td className="py-3 px-4 text-slate-500">
                            {new Date(app.createdAt).toLocaleString('ja-JP', {
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-extrabold border ${s.bg} ${s.text}`}>
                              {s.label}
                            </span>
                          </td>
                          <td className="py-3 px-4 text-center">
                            <button
                              type="button"
                              onClick={() => {
                                setConfirmModal({
                                  isOpen: true,
                                  title: '申請ワークフローの削除',
                                  message: `申請「${app.title}」（ID: ${app.id}）を削除してもよろしいですか？この操作は取り消せません。`,
                                  type: 'danger',
                                  confirmText: '削除する',
                                  cancelText: 'キャンセル',
                                  onConfirm: () => {
                                    if (onDeleteApplication) {
                                      onDeleteApplication(app.id);
                                    }
                                  }
                                });
                              }}
                              className="inline-flex items-center gap-1 text-rose-600 hover:bg-rose-50 px-2 py-1 rounded-md transition-all font-bold cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>削除</span>
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  {applications.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-12 text-center text-slate-400 font-medium">
                        登録されている申請データはありません。
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
