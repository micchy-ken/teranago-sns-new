import React, { useState } from 'react';
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
  Package
} from 'lucide-react';
import { User, OfficeMaster, DivisionMaster, PositionMaster, OfficeType, ApprovalFlowRule, ApprovalStepConfig, ApplicationType, ApproverType, ItemMaster } from '../types';

interface AdminPanelProps {
  currentUser: User;
  allUsers: User[];
  offices: OfficeMaster[];
  divisions: DivisionMaster[];
  positions?: PositionMaster[];
  approvalFlows?: ApprovalFlowRule[];
  itemMasters?: ItemMaster[];
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
  const [activeSubTab, setActiveSubTab] = useState<'users' | 'offices' | 'divisions' | 'positions' | 'items' | 'approval_flows' | 'system'>('users');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedOfficeFilter, setSelectedOfficeFilter] = useState<string>('all');

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
  const [editingUser, setEditingUser] = useState<User | null>(null);
  const [userFormData, setUserFormData] = useState({
    name: '',
    kanaName: '',
    loginId: '',
    password: 'test',
    office: offices[0]?.name || '名古屋',
    division: divisions[0]?.name || '総務',
    position: positions[0]?.name || '課長補佐',
    email: '',
    mobileEmail: '',
    phoneOutside: '',
    phoneExtension: '',
    mobilePhone: '',
    isAdmin: false,
    supervisorId: '',
  });
  const [userFormError, setUserFormError] = useState<string | null>(null);

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
                  <img src={user.avatarUrl} alt={user.name} className="w-5 h-5 rounded-full object-cover" />
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
      office: offices[0]?.name || '名古屋',
      division: divisions[0]?.name || '総務',
      position: positions[0]?.name || '課長補佐',
      email: '',
      mobileEmail: '',
      phoneOutside: '',
      phoneExtension: '',
      mobilePhone: '',
      isAdmin: false,
      supervisorId: '',
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
      office: user.office || offices[0]?.name || '名古屋',
      division: user.division || divisions[0]?.name || '総務',
      position: user.position || positions[0]?.name || '課長補佐',
      email: user.email || '',
      mobileEmail: user.mobileEmail || '',
      phoneOutside: user.phoneOutside || '',
      phoneExtension: user.phoneExtension || '',
      mobilePhone: user.mobilePhone || user.phone || '',
      isAdmin: !!user.isAdmin,
      supervisorId: user.supervisorId || '',
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

    const deptString = `${userFormData.office || ''} ${userFormData.division || ''} ${userFormData.position || ''}`.trim();
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
        email: (userFormData.email || '').trim(),
        mobileEmail: (userFormData.mobileEmail || '').trim(),
        phoneOutside: (userFormData.phoneOutside || '').trim(),
        phoneExtension: (userFormData.phoneExtension || '').trim(),
        mobilePhone: (userFormData.mobilePhone || '').trim(),
        phone: (userFormData.mobilePhone || '').trim() || (userFormData.phoneOutside || '').trim() || editingUser.phone,
        isAdmin: userFormData.isAdmin,
        role: userFormData.isAdmin ? 'admin' : 'user',
        supervisorId: userFormData.supervisorId || undefined,
      });
    } else {
      const newId = `u-${Date.now()}`;
      onAddUser({
        name: (userFormData.name || '').trim(),
        kanaName: (userFormData.kanaName || '').trim(),
        loginId: finalLoginId,
        password: (userFormData.password || '').trim() || 'test',
        office: userFormData.office,
        division: userFormData.division,
        position: userFormData.position,
        department: deptString,
        avatarUrl: `https://i.pravatar.cc/150?u=${newId}`,
        email: (userFormData.email || '').trim(),
        mobileEmail: (userFormData.mobileEmail || '').trim(),
        phoneOutside: (userFormData.phoneOutside || '').trim(),
        phoneExtension: (userFormData.phoneExtension || '').trim(),
        mobilePhone: (userFormData.mobilePhone || '').trim(),
        phone: (userFormData.mobilePhone || '').trim() || (userFormData.phoneOutside || '').trim(),
        isAdmin: userFormData.isAdmin,
        role: userFormData.isAdmin ? 'admin' : 'user',
        supervisorId: userFormData.supervisorId || undefined,
      });
    }

    setIsUserModalOpen(false);
  };

  const handleDeleteUserClick = (user: User) => {
    if (user.id === currentUser.id) {
      alert('自分自身のアカウントを削除することはできません。');
      return;
    }
    if (window.confirm(`メンバー「${user.name}」を削除してもよろしいですか？`)) {
      onDeleteUser(user.id);
    }
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
    if (window.confirm(`品名「${item.name}」をマスターから削除してもよろしいですか？`)) {
      if (onDeleteItemMaster) {
        onDeleteItemMaster(item.id);
      }
    }
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
            src={currentUser.avatarUrl}
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
            <div className="px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs font-bold text-slate-600">
              <span className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600" />
                登録メンバー一覧 ({filteredUsers.length}名)
              </span>
              <span className="text-slate-400 font-normal">メンバー登録・編集時に「拠点」と「部署」をマスターからドロップダウン選択できます</span>
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
                      src={user.avatarUrl}
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
                      </div>

                      <div className="flex flex-wrap items-center gap-x-4 text-xs text-slate-500 pt-1">
                        {user.email && (
                          <span className="flex items-center gap-1">
                            <Mail className="w-3 h-3 text-slate-400" />
                            {user.email}
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
                  <div className="flex items-center gap-2 self-end md:self-center shrink-0">
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
                            if (window.confirm(`拠点マスター「${off.name}」を削除してもよろしいですか？`)) {
                              onDeleteOffice(off.id);
                            }
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
                            if (window.confirm(`部署マスター「${div.name}」を削除してもよろしいですか？`)) {
                              onDeleteDivision(div.id);
                            }
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
                  役職マスター（社長・部長・課長・課長補佐・主任・一般 等）一覧
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  全社共通の役職定義です。ここで登録された役職がメンバー登録や名刺プロフィールに反映されます。
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
                            if (window.confirm(`役職マスター「${pos.name}」を削除してもよろしいですか？`)) {
                              if (onDeletePosition) onDeletePosition(pos.id);
                            }
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
                  purchase_order: '物品購入申請',
                  other: 'その他申請',
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
                              if (confirm(`承認フロー「${flow.name}」を削除しますか？`)) {
                                onDeleteApprovalFlow(flow.id);
                              }
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
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-6">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-600" />
              システム設定 & 組織データ状態
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              KnowledgeSyncの組織マスター管理およびメンバー構成状況です。
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-700">全社マスターデータ構成</div>
              <div className="text-xs text-slate-600 space-y-1">
                <div className="flex justify-between"><span>ステータス:</span> <span className="font-bold text-emerald-600">正常稼働中 (Normal)</span></div>
                <div className="flex justify-between"><span>拠点マスター登録数:</span> <span className="font-bold">{offices.length} 件</span></div>
                <div className="flex justify-between"><span>部署マスター登録数:</span> <span className="font-bold">{divisions.length} 件</span></div>
                <div className="flex justify-between"><span>全登録メンバー数:</span> <span className="font-bold">{allUsers.length} 名</span></div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-2">
              <div className="text-xs font-bold text-slate-700">セキュリティ & 権限設定</div>
              <div className="text-xs text-slate-600 space-y-1">
                <div className="flex justify-between"><span>アクセス制御:</span> <span className="font-bold text-indigo-600">RBAC (健介 操作可能)</span></div>
                <div className="flex justify-between"><span>主要拠点:</span> <span className="font-bold">名古屋支店, 浜松営業所, 静岡営業所, 本社</span></div>
                <div className="flex justify-between"><span>最終更新:</span> <span className="font-bold">{new Date().toLocaleDateString('ja-JP')}</span></div>
              </div>
            </div>
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

            <form onSubmit={handleSaveUser} className="p-6 space-y-4">
              {userFormError && (
                <div className="p-3 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-red-500" />
                  <span>{userFormError}</span>
                </div>
              )}

              {/* Name & Kana */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    氏名 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    required
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
                    <option value="名古屋">名古屋</option>
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
                    <option value="総務">総務</option>
                    {divisions.map((div) => (
                      <option key={div.id} value={div.name}>
                        {div.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    役職マスター <span className="text-red-500">*</span>
                  </label>
                  <select
                    value={userFormData.position}
                    onChange={(e) => setUserFormData({ ...userFormData, position: e.target.value })}
                    className="w-full px-3 py-2 bg-indigo-50 border border-indigo-200 rounded-lg text-xs font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
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

              {/* Preview */}
              <div className="p-3 bg-indigo-50 rounded-xl border border-indigo-100 flex items-center justify-between text-xs">
                <span className="text-slate-600 font-medium">登録表記プレビュー:</span>
                <span className="font-extrabold text-indigo-900 text-xs bg-white px-3 py-1 rounded-lg border border-indigo-200 shadow-2xs">
                  {userFormData.office} / {userFormData.division} / {userFormData.position}
                </span>
              </div>

              {/* Emails */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">メールアドレス</label>
                  <input
                    type="email"
                    placeholder="yamamichi@teraoka-ads.co.jp"
                    value={userFormData.email}
                    onChange={(e) => setUserFormData({ ...userFormData, email: e.target.value })}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">携帯メールアドレス</label>
                  <input
                    type="email"
                    placeholder="micchy.k@gmail.com"
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
                <span className="text-xs font-bold text-slate-700">管理者権限を付与する</span>
                <input
                  type="checkbox"
                  checked={userFormData.isAdmin}
                  onChange={(e) => setUserFormData({ ...userFormData, isAdmin: e.target.checked })}
                  className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
                />
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

            <form onSubmit={handleSaveOffice} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  拠点名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
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

            <form onSubmit={handleSaveDivision} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  部署名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
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

            <form onSubmit={handleSavePosition} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  役職名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  placeholder="例: 社長, 部長, 課長, 課長補佐, 主任, 一般"
                  value={positionFormData.name}
                  onChange={(e) => setPositionFormData({ ...positionFormData, name: e.target.value })}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm font-bold text-indigo-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">識別コード</label>
                <input
                  type="text"
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

            <form onSubmit={handleSaveFlow} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  フロー名 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  required
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
                    <option value="purchase_order">物品購入申請</option>
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

            <form onSubmit={handleSaveItem} className="p-6 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  品名 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
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
    </div>
  );
}
