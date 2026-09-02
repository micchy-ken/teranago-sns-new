import React, { useState } from 'react';
import { WorkflowApplication, ApplicationType, ApplicationStatus, User as UserType, ApprovalFlowRule, ApprovalStepConfig, ItemMaster, AttachmentFile } from '../types';
import { FileText, CheckCircle2, XCircle, Clock, Plus, ArrowRight, GitMerge, UserCheck, AlertTriangle, Edit3, MessageSquare, Send, X, ShoppingBag, Building2, Hash, ExternalLink, Package, Calendar, RotateCcw, Trash2, Paperclip, ChevronDown, ChevronUp, Zap, Store, CreditCard, UserPlus, Coins } from 'lucide-react';
import { ApplicationModal } from './ApplicationModal';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import { FilePreviewModal } from './FilePreviewModal';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';
import { filterStepsForApplicant, getSupervisorAtLevel, resolveApproverForStep, isDuplicateApproverStep } from '../utils/workflowHelpers';

interface WorkflowProps {
  applications: WorkflowApplication[];
  onAddApplication: (application: Omit<WorkflowApplication, 'id' | 'createdAt' | 'status'> & { status?: ApplicationStatus }) => void;
  onUpdateApplication?: (application: WorkflowApplication) => void;
  onDeleteApplication?: (id: string) => void;
  allUsers: UserType[];
  currentUser: UserType;
  approvalFlows?: ApprovalFlowRule[];
  onWorkflowAction?: (id: string, status: 'approved' | 'rejected', comment?: string) => void;
  itemMasters?: ItemMaster[];
  initialAppId?: string;
}

const typeLabels: Record<string, string> = {
  purchase_order: '発注申請',
  purchase_request: '購入申請',
  inventory_issue: '補充申請',
  business_trip: '出張申請',
  gold_silver_daily_report: '金銀日報',
  other: 'その他',
};

const statusConfig: Record<string, { label: string, color: string, icon: React.ReactNode }> = {
  draft: { label: '下書き', color: 'bg-slate-100 text-slate-700 border-slate-300', icon: <FileText className="w-3.5 h-3.5 text-slate-500" /> },
  pending: { label: '申請中', color: 'bg-amber-100 text-amber-800 border-amber-200', icon: <Clock className="w-3.5 h-3.5" /> },
  approved: { label: '承認済み', color: 'bg-emerald-100 text-emerald-800 border-emerald-200', icon: <CheckCircle2 className="w-3.5 h-3.5" /> },
  rejected: { label: '却下', color: 'bg-red-100 text-red-800 border-red-200', icon: <XCircle className="w-3.5 h-3.5" /> },
};

const getTypeLabel = (type?: string): string => {
  if (type && typeLabels[type]) return typeLabels[type];
  if (type === 'general') return '一般申請';
  return 'その他';
};

const getStatusConfig = (status?: string) => {
  if (status && statusConfig[status]) return statusConfig[status];
  return statusConfig.pending;
};

export function Workflow({ applications, onAddApplication, onUpdateApplication, onDeleteApplication, allUsers, currentUser, approvalFlows, onWorkflowAction, itemMasters = [], initialAppId }: WorkflowProps) {
  const [filter, setFilter] = useState<'my_applications' | 'pending_approval' | 'approved' | 'draft'>('my_applications');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [highlightedAppId, setHighlightedAppId] = useState<string | null>(null);

  const processedInitialAppIdRef = React.useRef<string | null>(null);

  // 自分が承認済みの申請かどうかを判定する関数
  const isUserApprovedApplication = React.useCallback((app: WorkflowApplication, user: UserType) => {
    if (!user || !app) return false;
    // 申請者本人のものは「自分の申請」に含まれるため除外
    if (app.applicant?.id === user.id) return false;

    // 承認履歴に自分が含まれているか
    if (app.history && app.history.length > 0) {
      return app.history.some(h => (h.approver?.id === user.id || h.approver?.name === user.name) && h.status === 'approved');
    }

    // 単一承認で自分が承認者の場合（ステータスが approved）
    if (app.status === 'approved' && (app.approver?.id === user.id || app.approver?.name === user.name)) {
      return true;
    }

    return false;
  }, []);

  React.useEffect(() => {
    if (initialAppId && processedInitialAppIdRef.current !== initialAppId) {
      const targetApp = applications.find(a => a.id === initialAppId);
      if (targetApp) {
        processedInitialAppIdRef.current = initialAppId;
        if (targetApp.status === 'draft' && targetApp.applicant?.id === currentUser?.id) {
          setFilter('draft');
        } else if (isUserCurrentApprover(targetApp, currentUser)) {
          setFilter('pending_approval');
        } else if (isUserApprovedApplication(targetApp, currentUser)) {
          setFilter('approved');
        } else if (targetApp.applicant?.id === currentUser?.id) {
          setFilter('my_applications');
        } else {
          // 他者が申請し自分が関連している場合
          if (targetApp.status === 'approved' || targetApp.status === 'rejected') {
            setFilter('approved');
          } else {
            setFilter('my_applications');
          }
        }
        setHighlightedAppId(initialAppId);
        setTimeout(() => {
          const el = document.getElementById(`workflow-card-${initialAppId}`);
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }, 150);
      }
    }
  }, [initialAppId, applications, currentUser, isUserApprovedApplication]);

  // 却下ダイアログ用の状態
  const [rejectingAppId, setRejectingAppId] = useState<string | null>(null);
  const [rejectComment, setRejectComment] = useState('');

  // 編集・再申請モーダル用の状態
  const [editingApp, setEditingApp] = useState<WorkflowApplication | null>(null);

  // ファイルプレビュー用ステート
  const [previewFile, setPreviewFile] = useState<AttachmentFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // カスタムダイアログ用の状態
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });

  // 出庫依頼移行モーダル用の状態
  const [transitioningApp, setTransitioningApp] = useState<WorkflowApplication | null>(null);
  const [transTitle, setTransTitle] = useState('');
  const [transNote, setTransNote] = useState('');
  const [transFlowId, setTransFlowId] = useState<string>('manual');
  const [transManualApproverId, setTransManualApproverId] = useState<string>('');

  // 発注No入力ステート
  const [poInputs, setPoInputs] = useState<Record<string, string>>({});

  // 適用フローの開閉ステート (app.id -> boolean)
  const [expandedFlows, setExpandedFlows] = useState<Record<string, boolean>>({});

  const isFlowExpanded = (app: WorkflowApplication) => {
    if (expandedFlows[app.id] !== undefined) {
      return expandedFlows[app.id];
    }
    // デフォルト: 折りたたみ (false)
    return false;
  };

  const toggleFlowExpand = (appId: string, currentStatus?: string) => {
    setExpandedFlows(prev => {
      const currentVal = prev[appId] !== undefined ? prev[appId] : false;
      return { ...prev, [appId]: !currentVal };
    });
  };

  // 発注No保存ハンドラー
  const handleSavePoNumber = (app: WorkflowApplication) => {
    const inputVal = poInputs[app.id] !== undefined ? poInputs[app.id] : (app.purchaseOrderNumber || '');
    const poNum = (inputVal || '').trim();
    if (!poNum) {
      setConfirmModal({
        isOpen: true,
        title: '入力エラー',
        message: '発注Noを入力してください。',
        type: 'warning',
        confirmText: 'OK'
      });
      return;
    }
    if (onUpdateApplication) {
      onUpdateApplication({
        ...app,
        purchaseOrderNumber: poNum
      });
      setConfirmModal({
        isOpen: true,
        title: '保存完了',
        message: `発注No「${poNum}」を保存登録しました。現場確認URLが有効になりました。`,
        type: 'success',
        confirmText: 'OK'
      });
    }
  };

  // 補充依頼モーダルを開く処理
  const handleOpenTransitionModal = (app: WorkflowApplication) => {
    if (app.linkedInventoryIssueId) {
      setConfirmModal({
        isOpen: true,
        title: '作成済み',
        message: '既にこの発注申請からの補充依頼は作成されています。',
        type: 'info',
        confirmText: 'OK'
      });
      return;
    }

    const itemsSummary = app.purchaseItems && app.purchaseItems.length > 0
      ? app.purchaseItems.map(pi => `・${pi.itemName}: ${pi.quantity}個 (単価: ¥${pi.unitPrice.toLocaleString()})`).join('\n')
      : '';

    setTransitioningApp(app);
    setTransTitle(`[補充依頼] ${app.title}`);
    setTransNote(
      `【発注No: ${app.purchaseOrderNumber || '未入力'} 連動補充依頼】\n` +
      `現場名: ${app.title}\n` +
      (app.constructionDate ? `工事予定日: ${app.constructionDate}\n` : '') +
      (itemsSummary ? `\n■補充対象品目:\n${itemsSummary}\n` : '') +
      (app.description ? `\n発注時備考: ${app.description}\n` : '') +
      `\n※配送指定や現場補給に関する特記事項をここに追記・編集できます。`
    );

    // 補充依頼用承認フローを自動マッチング
    const matchedFlow = approvalFlows?.find(f => f.targetApplicationType === 'inventory_issue')
      || approvalFlows?.find(f => f.isDefault)
      || (approvalFlows && approvalFlows.length > 0 ? approvalFlows[0] : undefined);

    if (matchedFlow) {
      setTransFlowId(matchedFlow.id);
    } else {
      setTransFlowId('manual');
    }

    if (currentUser.supervisorId && allUsers.some(u => u.id === currentUser.supervisorId)) {
      setTransManualApproverId(currentUser.supervisorId);
    } else {
      const fallbackUser = allUsers.find(u => u.id !== currentUser.id);
      setTransManualApproverId(fallbackUser ? fallbackUser.id : '');
    }
  };

  // 補充依頼作成送信処理
  const handleSubmitTransition = (e: React.FormEvent) => {
    e.preventDefault();
    if (!transitioningApp || !transTitle) return;

    let initialApprover: UserType | undefined;
    let flowId: string | undefined;
    let flowName: string | undefined;
    let stepsConfig: ApprovalStepConfig[] | undefined;

    const currentFlow = approvalFlows?.find(f => f.id === transFlowId);

    if (transFlowId !== 'manual' && currentFlow) {
      flowId = currentFlow.id;
      flowName = currentFlow.name;
      stepsConfig = currentFlow.steps;
      if (currentFlow.steps && currentFlow.steps.length > 0) {
        const firstStep = currentFlow.steps[0];
        if (firstStep.approverType === 'specific_user' && firstStep.specificUserId) {
          initialApprover = allUsers.find(u => u.id === firstStep.specificUserId);
        } else if (firstStep.approverType === 'supervisor') {
          const supervisorId = getSupervisorIdAtLevel(currentUser.id, firstStep.supervisorLevel || 1, allUsers);
          if (supervisorId) {
            initialApprover = allUsers.find(u => u.id === supervisorId);
          }
        }
      }
    } else {
      initialApprover = allUsers.find(u => u.id === transManualApproverId);
      flowName = '個別承認（補充依頼）';
      stepsConfig = [
        {
          stepNumber: 1,
          approverType: 'specific_user',
          specificUserId: initialApprover?.id,
          stepName: '補充承認'
        }
      ];
    }

    if (!initialApprover) {
      initialApprover = currentUser.supervisorId ? allUsers.find(u => u.id === currentUser.supervisorId) : currentUser;
    }

    const newInventoryAppId = `inv_app_${Date.now()}`;

    // 新規補充申請を追加
    onAddApplication({
      type: 'inventory_issue',
      title: transTitle,
      description: transNote,
      applicant: currentUser,
      approver: initialApprover!,
      flowId,
      flowName: flowName || '補充依頼承認フロー',
      stepsConfig,
      currentStepIndex: 0,
      quantity: transitioningApp.purchaseItems?.reduce((sum, i) => sum + (i.quantity || 0), 0) || 1,
      amount: transitioningApp.amount,
      purchaseItems: transitioningApp.purchaseItems,
      purchaseOrderNumber: transitioningApp.purchaseOrderNumber,
    });

    // 元の発注申請に補充依頼紐付けIDをセット
    if (onUpdateApplication) {
      onUpdateApplication({
        ...transitioningApp,
        linkedInventoryIssueId: newInventoryAppId
      });
    }

    setConfirmModal({
      isOpen: true,
      title: '申請完了',
      message: `補充依頼「${transTitle}」を新規申請しました。承認ルートへ移行します。`,
      type: 'success',
      confirmText: 'OK'
    });
    setTransitioningApp(null);
  };

  // 申請者から N 階層目の上長IDを取得するヘルパー
  const getSupervisorIdAtLevel = (applicantId: string | undefined, level: number, users: UserType[]): string | undefined => {
    if (!applicantId) return undefined;
    let curr = users.find(u => u.id === applicantId);
    for (let i = 0; i < level; i++) {
      if (!curr || !curr.supervisorId) break;
      curr = users.find(u => u.id === curr.supervisorId);
    }
    return (curr && curr.id !== applicantId) ? curr.id : undefined;
  };

  // 各ステップの実際の承認者ユーザー情報を計算
  const resolveStepUserInfo = (
    app: WorkflowApplication,
    stepConfig: ApprovalStepConfig,
    stepIdx: number
  ): { name: string; avatarUrl?: string; roleLabel: string } => {
    // 履歴があれば履歴から
    const hist = app.history?.find(h => h.stepNumber === stepIdx + 1);
    if (hist && hist.approver) {
      return {
        name: hist.approver.name,
        avatarUrl: hist.approver.avatarUrl,
        roleLabel: `${stepIdx + 1}次承認`
      };
    }

    // 現在進行中ステップで approver があれば
    if (app.status === 'pending' && (app.currentStepIndex || 1) === stepIdx + 1 && app.approver) {
      return {
        name: app.approver.name,
        avatarUrl: app.approver.avatarUrl,
        roleLabel: stepConfig.stepName || `${stepIdx + 1}次承認`
      };
    }

    // 特定ユーザー直接指定
    if (stepConfig.approverType === 'specific_user' && stepConfig.specificUserId) {
      const specUser = allUsers.find(u => u.id === stepConfig.specificUserId);
      if (specUser) {
        return { name: specUser.name, avatarUrl: specUser.avatarUrl, roleLabel: '個人指定' };
      }
    }

    // 階層上長
    const lvl = stepConfig.supervisorLevel || (stepConfig.approverType === 'supervisor_2' ? 2 : stepConfig.approverType === 'supervisor_1' ? 1 : stepIdx + 1);
    const supId = getSupervisorIdAtLevel(app.applicant?.id, lvl, allUsers);
    const supUser = supId ? allUsers.find(u => u.id === supId) : null;

    if (supUser) {
      return {
        name: supUser.name,
        avatarUrl: supUser.avatarUrl,
        roleLabel: lvl === 1 ? '直属上長' : `第${lvl}階層上長`
      };
    }

    return { name: app.approver?.name || '全社管理者', roleLabel: '管理者代行' };
  };

  // 動的に現在ログイン中のユーザーが対象申請のステップ承認者かをチェックする関数
  const isUserCurrentApprover = (app: WorkflowApplication, user: UserType) => {
    if (app.status !== 'pending') return false;

    // もし直接指定の approver が居れば判定
    if (app.approver?.id === user.id) return true;

    // 多段階ステップのチェック
    if (app.stepsConfig && app.stepsConfig.length > 0) {
      const currentStepIdx = (app.currentStepIndex || 1) - 1;
      const step = app.stepsConfig[currentStepIdx];
      if (step) {
        if (step.approverType === 'specific_user') {
          return step.specificUserId === user.id;
        }

        const targetLevel = step.supervisorLevel || (step.approverType === 'supervisor_2' ? 2 : step.approverType === 'supervisor_1' ? 1 : currentStepIdx + 1);
        const expectedApproverId = getSupervisorIdAtLevel(app.applicant?.id, targetLevel, allUsers);
        return expectedApproverId === user.id;
      }
    }
    return false;
  };

  // 下書き件数
  const draftCount = applications.filter((app) => app.applicant?.id === currentUser?.id && app.status === 'draft').length;

  // 承認待ちの件数
  const pendingCount = applications.filter((app) => isUserCurrentApprover(app, currentUser)).length;

  // 自分が承認済みの件数 (他者の申請で自分が承認した、または承認履歴に含まれるもの)
  const approvedCount = applications.filter((app) => isUserApprovedApplication(app, currentUser)).length;

  const filteredApps = applications
    .filter((app) => {
      if (filter === 'draft') {
        return app.applicant?.id === currentUser?.id && app.status === 'draft';
      } else if (filter === 'my_applications') {
        return app.applicant?.id === currentUser?.id && app.status !== 'draft';
      } else if (filter === 'pending_approval') {
        return isUserCurrentApprover(app, currentUser);
      } else if (filter === 'approved') {
        return isUserApprovedApplication(app, currentUser);
      }
      return false;
    })
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime());

  const formatCurrency = (amount?: number) => {
    return new Intl.NumberFormat('ja-JP', { style: 'currency', currency: 'JPY' }).format(amount || 0);
  };

  const formatDate = (dateString?: string) => {
    if (!dateString) return '';
    const d = new Date(dateString);
    if (isNaN(d.getTime())) return dateString;
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: 'short', day: 'numeric' });
  };

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-slate-900/5 overflow-hidden flex flex-col min-h-[600px] lg:h-[calc(100vh-8rem)]">
      {/* Header */}
      <div className="p-5 border-b border-slate-200 flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between bg-slate-50 shrink-0">
        <div className="flex flex-wrap gap-1.5 p-1 bg-slate-200/50 rounded-xl">
          <button 
            onClick={() => setFilter('my_applications')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filter === 'my_applications' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            自分の申請
          </button>
          <button 
            onClick={() => setFilter('pending_approval')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer ${
              filter === 'pending_approval' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            承認待ち
            {pendingCount > 0 && (
              <span className="ml-1.5 px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-extrabold">
                {pendingCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setFilter('approved')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              filter === 'approved' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>承認済み</span>
            {approvedCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-800 text-[10px] font-extrabold">
                {approvedCount}
              </span>
            )}
          </button>
          <button 
            onClick={() => setFilter('draft')}
            className={`px-3.5 py-2 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1 ${
              filter === 'draft' 
                ? 'bg-white text-slate-800 shadow-sm' 
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <span>下書き</span>
            {draftCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-slate-200 text-slate-700 text-[10px] font-extrabold">
                {draftCount}
              </span>
            )}
          </button>
        </div>

        <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm w-full sm:w-auto justify-center">
          <Plus className="w-4 h-4"/>
          新規申請
        </button>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/30">
        <div className="w-full space-y-4">
          {filteredApps.length > 0 ? (
            filteredApps.map(app => {
              const isHighlighted = highlightedAppId === app.id;
              return (
                <div
                  key={app.id}
                  id={`workflow-card-${app.id}`}
                  className={`bg-white border rounded-xl p-5 transition-all shadow-sm group ${
                    isHighlighted
                      ? 'border-indigo-500 ring-2 ring-indigo-500/30 bg-indigo-50/20'
                      : 'border-slate-200 hover:border-indigo-200'
                  }`}
                >
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-slate-100 text-slate-600 border border-slate-200">
                        {getTypeLabel(app.type)}
                      </span>
                      <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${getStatusConfig(app.status).color}`}>
                        {getStatusConfig(app.status).icon}
                        {getStatusConfig(app.status).label}
                      </span>
                      {app.type === 'purchase_order' && app.constructionDate && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-indigo-50 text-indigo-800 border border-indigo-200">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                          <span>工事予定日: {app.constructionDate}</span>
                        </span>
                      )}
                      <span className="text-xs text-slate-400">
                        {formatDate(app.createdAt)} 申請
                      </span>
                    </div>
                    <h3 className="text-base font-bold text-slate-900 leading-tight group-hover:text-indigo-600 transition-colors flex items-center gap-1.5">
                      {app.type === 'purchase_order' && <Building2 className="w-4 h-4 text-indigo-600 shrink-0 inline" />}
                      {app.type === 'gold_silver_daily_report' && <Coins className="w-4 h-4 text-amber-600 shrink-0 inline" />}
                      <span>{app.title}</span>
                    </h3>
                  </div>
                  <div className="text-right sm:text-right flex sm:flex-col items-center sm:items-end gap-2 sm:gap-1 bg-slate-50 sm:bg-transparent p-3 sm:p-0 rounded-lg shrink-0">
                    {filter === 'my_applications' ? (
                      <>
                        <span className="text-xs text-slate-500 font-medium">承認者</span>
                        <div className="flex items-center gap-2">
                          <img src={getAvatarUrl(app.approver?.avatarUrl)} alt={app.approver?.name} className="w-6 h-6 rounded-full border border-slate-200 object-cover" />
                          <span className="text-sm font-semibold text-slate-800">{app.approver?.name || '未設定'}</span>
                        </div>
                      </>
                    ) : (
                      <>
                        <span className="text-xs text-slate-500 font-medium">申請者</span>
                        <div className="flex items-center gap-2">
                          <img src={getAvatarUrl(app.applicant?.avatarUrl)} alt={app.applicant?.name} className="w-6 h-6 rounded-full border border-slate-200 object-cover" />
                          <span className="text-sm font-semibold text-slate-800">{app.applicant?.name || '未設定'}</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                {/* 購入申請の詳細情報（購入目的・購入時期・購入元・購入方法） */}
                {app.type === 'purchase_request' && (
                  <div className="mb-3 space-y-2">
                    {app.purchasePurpose && (
                      <div className="p-3 bg-slate-50 border border-slate-200/80 rounded-xl text-xs">
                        <span className="font-bold text-slate-700 block mb-0.5">購入目的:</span>
                        <p className="text-slate-800 leading-relaxed font-medium">{app.purchasePurpose}</p>
                      </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                      {/* 購入時期 */}
                      {app.purchaseTiming === 'urgent' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-rose-100/90 text-rose-800 border border-rose-200 shadow-2xs">
                          <Zap className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          <span>時期: 至急手配</span>
                        </span>
                      )}
                      {app.purchaseTiming === 'by_date' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-indigo-50 text-indigo-900 border border-indigo-200 shadow-2xs">
                          <Calendar className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>期日: {app.purchaseDueDate ? formatDate(app.purchaseDueDate) : '期日指定'} まで</span>
                        </span>
                      )}

                      {/* 購入元 */}
                      {app.purchaseVendor && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 text-slate-800 border border-slate-200 shadow-2xs">
                          <Store className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>購入元: <strong>{app.purchaseVendor}</strong></span>
                        </span>
                      )}

                      {/* 購入方法 */}
                      {app.purchaseMethod === 'self' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 shadow-2xs">
                          <CreditCard className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span>購入方法: <strong>自分で購入</strong></span>
                        </span>
                      )}
                      {app.purchaseMethod === 'delegate' && (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-indigo-50 text-indigo-800 border border-indigo-200 shadow-2xs">
                          <UserPlus className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                          <span>購入依頼先: <strong>{app.purchaserDelegateUser?.name || '指定担当者'}</strong></span>
                        </span>
                      )}
                    </div>

                    {/* 決裁完了時かつ自分が購入依頼先の場合の通知バナー */}
                    {app.status === 'approved' && app.purchaseMethod === 'delegate' && app.purchaserDelegateUserId === currentUser.id && (
                      <div className="p-3 bg-gradient-to-r from-indigo-500 to-blue-600 text-white rounded-xl shadow-xs flex items-center justify-between gap-2 text-xs">
                        <div className="flex items-center gap-2">
                          <UserCheck className="w-4 h-4 text-amber-300 shrink-0" />
                          <div>
                            <span className="font-bold">【あなたへの購入手続き依頼】</span>
                            <p className="text-[11px] text-indigo-100">本申請は決裁が完了しました。備品・機材の手配・購入手続きをお願いいたします。</p>
                          </div>
                        </div>
                        <span className="px-2.5 py-1 bg-white/20 text-white font-bold rounded-lg text-[10px] shrink-0 border border-white/30">
                          手配担当
                        </span>
                      </div>
                    )}
                  </div>
                )}

                {/* 金銀日報の残高報告サマリーカード */}
                {app.type === 'gold_silver_daily_report' && (
                  <div className="mb-3.5 p-3.5 bg-gradient-to-br from-amber-50/80 to-yellow-50/40 border border-amber-200/80 rounded-2xl space-y-2.5">
                    <div className="flex items-center justify-between text-xs font-bold text-amber-950 border-b border-amber-200/50 pb-1.5">
                      <span className="flex items-center gap-1.5">
                        <Coins className="w-4 h-4 text-amber-600" />
                        <span>金銀日報 保管残高 {app.location ? `(${app.location})` : ''}</span>
                      </span>
                      {app.currentBalance !== undefined && app.previousBalance !== undefined && (() => {
                        const diff = app.currentBalance - app.previousBalance;
                        return (
                          <span className={`font-black text-xs ${diff > 0 ? 'text-emerald-700' : diff < 0 ? 'text-rose-700' : 'text-slate-600'}`}>
                            受払増減: {diff > 0 ? `+¥${diff.toLocaleString()}` : diff < 0 ? `-¥${Math.abs(diff).toLocaleString()}` : '±¥0'}
                          </span>
                        );
                      })()}
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-xs">
                      <div className="bg-white/80 p-2.5 rounded-xl border border-amber-100/80">
                        <span className="text-[10px] text-slate-500 font-bold block">前回残高</span>
                        <span className="text-sm font-extrabold text-slate-800">
                          ¥{(app.previousBalance ?? 0).toLocaleString()}
                        </span>
                      </div>
                      <div className="bg-white/90 p-2.5 rounded-xl border border-amber-300 shadow-2xs">
                        <span className="text-[10px] text-amber-700 font-bold block">今回残高</span>
                        <span className="text-sm font-black text-amber-950">
                          ¥{(app.currentBalance ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {app.type !== 'purchase_request' && app.description && (
                  <p className="text-sm text-slate-600 line-clamp-2 mb-3 leading-relaxed">
                    {app.description}
                  </p>
                )}

                {/* 添付ファイルリスト */}
                {app.attachments && app.attachments.length > 0 && (
                  <div className="mb-4 flex flex-wrap gap-2">
                    {app.attachments.map(att => (
                      <div
                        key={att.id}
                        className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100/90 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 transition-all shadow-2xs"
                      >
                        <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[150px]" title={att.name}>{att.name}</span>
                        <span className="text-[10px] text-slate-400">({att.size})</span>
                        <div className="flex items-center gap-1.5 border-l border-slate-200 pl-1.5 ml-1 font-bold shrink-0">
                          {(att.type?.startsWith('image/') || /\.pdf$/i.test(att.name) || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(att.name)) && (
                            <button
                              type="button"
                              onClick={() => {
                                setPreviewFile(att);
                                setIsPreviewOpen(true);
                              }}
                              className="text-emerald-600 hover:text-emerald-800 text-[10px] cursor-pointer"
                            >
                              プレビュー
                            </button>
                          )}
                          <a
                            href={att.url || '#'}
                            download={att.name}
                            onClick={(e) => {
                              if (!att.url) {
                                e.preventDefault();
                                setConfirmModal({
                                  isOpen: true,
                                  title: 'ファイルダウンロード',
                                  message: `ファイル「${att.name}」のダウンロードを開始します。`,
                                  type: 'info',
                                  confirmText: 'OK'
                                });
                              }
                            }}
                            className="text-indigo-600 hover:text-indigo-800 text-[10px] cursor-pointer"
                          >
                            DL
                          </a>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* 発注申請・購入申請・補充申請明細テーブル */}
                {(app.type === 'purchase_order' || app.type === 'purchase_request' || app.type === 'inventory_issue') && app.purchaseItems && app.purchaseItems.length > 0 && (
                  <div className="mb-4 p-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-indigo-950 pb-1.5 border-b border-indigo-100">
                      <span className="flex items-center gap-1.5">
                        <ShoppingBag className="w-3.5 h-3.5 text-indigo-600" />
                        <span>
                          {app.type === 'purchase_order' ? '発注品名・明細内訳' : app.type === 'purchase_request' ? '購入品名・明細内訳' : '補充品名・明細内訳'} ({app.purchaseItems.length}件)
                        </span>
                      </span>
                      <span className="text-xs font-black text-indigo-700">
                        合計: ¥{(app.amount || 0).toLocaleString()}
                      </span>
                    </div>

                    <div className="overflow-x-auto">
                      <table className="w-full text-left text-xs">
                        <thead>
                          <tr className="text-[11px] text-slate-500 border-b border-indigo-100/60">
                            <th className="py-1 px-1 font-bold">品名</th>
                            <th className="py-1 px-1 font-bold text-right">数量</th>
                            <th className="py-1 px-1 font-bold text-right">想定単価</th>
                            <th className="py-1 px-1 font-bold text-right">小計</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-indigo-100/40 text-slate-800">
                          {app.purchaseItems.map((pi, pidx) => (
                            <tr key={pidx} className="hover:bg-indigo-100/30">
                              <td className="py-1.5 px-1 font-medium">
                                {pi.itemName}
                                {pi.note && <span className="block text-[10px] text-slate-500 font-normal">{pi.note}</span>}
                              </td>
                              <td className="py-1.5 px-1 font-bold text-right shrink-0">{pi.quantity}</td>
                              <td className="py-1.5 px-1 font-medium text-right shrink-0">¥{pi.unitPrice?.toLocaleString()}</td>
                              <td className="py-1.5 px-1 font-extrabold text-indigo-900 text-right shrink-0">¥{pi.amount?.toLocaleString()}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* 却下理由表示バナー */}
                {app.status === 'rejected' && (
                  <div className="mb-4 p-3.5 bg-rose-50 border border-rose-200/90 rounded-2xl flex items-start gap-3 text-xs">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-extrabold text-rose-900">【申請が却下されました】</span>
                        {app.applicant?.id === currentUser.id && (
                          <span className="text-[10px] text-rose-800 bg-rose-100 px-2 py-0.5 rounded-full font-bold border border-rose-200 shrink-0">
                            修正・再申請が可能です
                          </span>
                        )}
                      </div>
                      <p className="text-rose-800 mt-1 font-medium leading-relaxed">
                        <strong className="font-bold">却下理由:</strong> {app.rejectReason || '理由未記載'}
                      </p>
                    </div>
                  </div>
                )}

                {app.stepsConfig && app.stepsConfig.length > 0 && (() => {
                  const displaySteps = filterStepsForApplicant(app.applicant, app.stepsConfig, allUsers);
                  const expanded = isFlowExpanded(app);

                  return (
                    <div className="mb-4 p-3.5 bg-slate-50 border border-slate-200/90 rounded-2xl text-xs space-y-3">
                      <div 
                        onClick={() => toggleFlowExpand(app.id, app.status)}
                        className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200/60 pb-2 cursor-pointer select-none hover:opacity-90 transition-opacity"
                      >
                        <div className="flex items-center gap-2">
                          <GitMerge className="w-4 h-4 text-indigo-600 shrink-0" />
                          <span className="font-bold text-slate-700">適用フロー:</span>
                          <span className="font-extrabold text-indigo-800 bg-indigo-100/70 px-2 py-0.5 rounded border border-indigo-200">
                            {app.flowName || '標準承認フロー'} ({displaySteps.length}段階)
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          {app.status === 'pending' && (
                            <div className="flex items-center gap-1.5 font-bold text-amber-900 bg-amber-100/80 px-2.5 py-1 rounded-lg border border-amber-300 animate-pulse">
                              <Clock className="w-3.5 h-3.5 text-amber-700" />
                              <span>
                                確認待ち: 今 <strong className="underline decoration-amber-500 font-extrabold">{app.approver?.name || '承認者'}</strong> さんの承認確認待ちです
                              </span>
                            </div>
                          )}

                          {app.status === 'approved' && (
                            <div className="flex items-center gap-1 font-bold text-emerald-800 bg-emerald-100/80 px-2.5 py-0.5 rounded-lg border border-emerald-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                              <span>全ステップ承認完了</span>
                            </div>
                          )}

                          {app.status === 'rejected' && (
                            <div className="flex items-center gap-1 font-bold text-rose-800 bg-rose-100/80 px-2.5 py-0.5 rounded-lg border border-rose-300">
                              <XCircle className="w-3.5 h-3.5 text-rose-600" />
                              <span>途中却下済み</span>
                            </div>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFlowExpand(app.id, app.status);
                            }}
                            className="flex items-center gap-1 px-2 py-1 rounded-md bg-white border border-slate-200 hover:bg-slate-100 text-slate-600 font-bold text-[11px] transition-all ml-1 cursor-pointer shadow-2xs shrink-0"
                          >
                            {expanded ? <ChevronUp className="w-3.5 h-3.5 text-slate-500" /> : <ChevronDown className="w-3.5 h-3.5 text-slate-500" />}
                            <span>{expanded ? '折りたたむ' : '詳細表示'}</span>
                          </button>
                        </div>
                      </div>

                      {expanded && (
                        <>
                          {/* ステップ進行プログレスルート */}
                          <div className="flex flex-wrap items-center gap-2 pt-1">
                            {/* 申請者 */}
                            <div className="flex items-center gap-1.5 px-2 py-1 bg-white rounded-lg border border-slate-200 text-slate-700 font-medium">
                              <span className="w-4 h-4 rounded-full bg-slate-200 text-slate-700 text-[10px] font-bold flex items-center justify-center shrink-0">発</span>
                              <span className="font-bold text-slate-900">{app.applicant?.name}</span>
                              <span className="text-[10px] text-slate-400">(申請)</span>
                            </div>

                            {displaySteps.map((step, idx) => {
                              const stepNum = idx + 1;
                              const currentStep = app.currentStepIndex || 1;
                              const userInfo = resolveStepUserInfo(app, step, idx);
                              const isDuplicate = isDuplicateApproverStep(app.applicant, displaySteps, idx, allUsers);

                              let stepState: 'completed' | 'current' | 'upcoming' = 'upcoming';
                              if (app.status === 'approved') {
                                stepState = 'completed';
                              } else if (app.status === 'rejected') {
                                if (stepNum < currentStep) stepState = 'completed';
                                else stepState = 'upcoming';
                              } else {
                                if (stepNum < currentStep) stepState = 'completed';
                                else if (stepNum === currentStep) stepState = 'current';
                                else stepState = 'upcoming';
                              }

                              return (
                                <React.Fragment key={idx}>
                                  <ArrowRight className="w-3.5 h-3.5 text-slate-300 shrink-0" />

                                  <div
                                    className={`flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs transition-all ${
                                      isDuplicate
                                        ? 'bg-slate-100/90 border-dashed border-slate-300 text-slate-400 opacity-60'
                                        : stepState === 'completed'
                                        ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                                        : stepState === 'current'
                                        ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-200/80 text-amber-950 font-bold shadow-xs'
                                        : 'bg-white border-slate-200 text-slate-400 opacity-75'
                                    }`}
                                  >
                                    <div
                                      className={`w-5 h-5 rounded-full text-[10px] font-extrabold flex items-center justify-center shrink-0 ${
                                        isDuplicate
                                          ? 'bg-slate-300 text-slate-600'
                                          : stepState === 'completed'
                                          ? 'bg-emerald-600 text-white'
                                          : stepState === 'current'
                                          ? 'bg-amber-600 text-white'
                                          : 'bg-slate-200 text-slate-600'
                                      }`}
                                    >
                                      {stepState === 'completed' ? '✓' : stepNum}
                                    </div>

                                    <div className="flex flex-col">
                                      <div className="flex items-center gap-1">
                                        <span className={`font-bold ${isDuplicate ? 'line-through text-slate-500' : ''}`}>
                                          {userInfo.name}
                                        </span>
                                        {isDuplicate ? (
                                          <span className="text-[9px] font-extrabold bg-slate-200 text-slate-600 px-1 rounded">
                                            自動スキップ
                                          </span>
                                        ) : stepState === 'current' ? (
                                          <span className="text-[9px] font-extrabold bg-amber-200 text-amber-900 px-1 rounded">
                                            確認待ち
                                          </span>
                                        ) : stepState === 'completed' ? (
                                          <span className="text-[9px] font-extrabold bg-emerald-200 text-emerald-900 px-1 rounded">
                                            承認済
                                          </span>
                                        ) : null}
                                      </div>
                                      <span className="text-[9px] text-slate-500 font-normal">
                                        {step.stepName || `${stepNum}次承認`} {isDuplicate ? '(前ステップ重複パス)' : `(${userInfo.roleLabel})`}
                                      </span>
                                    </div>
                                  </div>
                                </React.Fragment>
                              );
                            })}
                          </div>

                          {/* 承認履歴ログの表示 */}
                          {app.history && app.history.length > 0 && (
                            <div className="pt-2 border-t border-slate-200/60 flex flex-wrap items-center gap-2 text-[11px]">
                              <span className="font-bold text-slate-600">進行履歴:</span>
                              {app.history.map((hist, hIdx) => (
                                <span
                                  key={hIdx}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium border ${
                                    hist.status === 'approved'
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                      : 'bg-rose-50 text-rose-800 border-rose-200'
                                  }`}
                                >
                                  {hist.status === 'approved' ? (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                  ) : (
                                    <XCircle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                  )}
                                  <span>
                                    {hist.stepNumber === 0 ? '再申請' : `ステップ${hist.stepNumber}`}: <strong>{hist.approver.name}</strong> {hist.status === 'approved' ? (hist.stepNumber === 0 ? '提出' : '承認') : '却下'}
                                    {hist.comment && <span className="text-slate-600 font-normal ml-1">「{hist.comment}」</span>}
                                  </span>
                                </span>
                              ))}
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  );
                })()}

                {/* 発注申請における管理・発注No付与・現場確認URL・補充連携パネル */}
                {app.type === 'purchase_order' && (
                  <div className="mb-4 p-4 bg-gradient-to-br from-indigo-50/90 via-slate-50 to-blue-50/70 border border-indigo-200/80 rounded-2xl space-y-3 shadow-2xs">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2">
                      <div className="flex items-center gap-2">
                        <span className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-xs">
                          <Building2 className="w-4 h-4" />
                        </span>
                        <div>
                          <h4 className="text-xs font-black text-indigo-950">
                            発注管理・発注No付与 {app.status === 'approved' && '・補充連携'}
                          </h4>
                          <p className="text-[10px] text-slate-500">
                            承認ルート上または決裁後に発注Noを付与できます。付与以降、現場確認URLが有効になります。
                          </p>
                        </div>
                      </div>

                      {/* 補充依頼移行ボタン / ステータスバッジ (決裁完了時のみ) */}
                      {app.status === 'approved' && (
                        app.linkedInventoryIssueId ? (
                          <span className="px-3 py-1 bg-emerald-100/90 text-emerald-800 font-extrabold text-xs rounded-xl border border-emerald-200 flex items-center gap-1.5 shadow-2xs">
                            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                            <span>補充依頼フロー移行済み</span>
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleOpenTransitionModal(app)}
                            className="px-3.5 py-1.5 bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 active:scale-95 text-white text-xs font-bold rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                          >
                            <Package className="w-4 h-4" />
                            <span>補充依頼フローへ移行</span>
                          </button>
                        )
                      )}
                    </div>

                    <div className="p-3 bg-white rounded-xl border border-slate-200/80 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-center gap-2 flex-1 min-w-[260px]">
                        <Hash className="w-4 h-4 text-indigo-600 shrink-0" />
                        <label className="text-xs font-bold text-slate-700 shrink-0">発注No付与:</label>
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="text"
                            name="purchase-order-id-input"
                            autoComplete="off"
                            value={poInputs[app.id] !== undefined ? poInputs[app.id] : (app.purchaseOrderNumber || '')}
                            onChange={e => setPoInputs({ ...poInputs, [app.id]: e.target.value })}
                            placeholder="例: PO-2026-001"
                            className="w-full max-w-[180px] px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                          />
                          <button
                            type="button"
                            onClick={() => handleSavePoNumber(app)}
                            className="px-3 py-1.5 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shrink-0 shadow-2xs"
                          >
                            保存・付与
                          </button>
                        </div>
                      </div>

                      {/* 発注Noが入力されていれば「確認」ボタンを表示、無ければ無効化表示 */}
                      {app.purchaseOrderNumber ? (
                        <a
                          href={`https://sql.teranago.synology.me/genba?code=${encodeURIComponent(app.purchaseOrderNumber)}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="px-4 py-2 bg-gradient-to-r from-sky-600 to-blue-600 hover:from-sky-700 hover:to-blue-700 active:scale-95 text-white text-xs font-black rounded-xl shadow-xs hover:shadow-md transition-all flex items-center gap-2 cursor-pointer shrink-0"
                          title="クリックすると現場確認URLへ移行します"
                        >
                          <ExternalLink className="w-4 h-4" />
                          <span>現場データ確認 (No: {app.purchaseOrderNumber})</span>
                        </a>
                      ) : (
                        <div
                          className="px-3.5 py-1.5 bg-slate-100 text-slate-400 text-xs font-bold rounded-xl border border-slate-200 flex items-center gap-1.5 shrink-0 cursor-not-allowed opacity-80"
                          title="発注Noを保存付与すると確認URLが有効化されます"
                        >
                          <ExternalLink className="w-4 h-4 opacity-50" />
                          <span>現場データ確認 (発注No未付与)</span>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pt-4 border-t border-slate-100">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    {app.amount !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">金額</span>
                        <span className="text-sm font-bold text-slate-800">{formatCurrency(app.amount)}</span>
                      </div>
                    )}
                    {app.quantity !== undefined && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">数量</span>
                        <span className="text-sm font-bold text-slate-800">{app.quantity}</span>
                      </div>
                    )}
                    {app.startDate && app.endDate && (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">期間</span>
                        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                          {formatDate(app.startDate)} <ArrowRight className="w-3 h-3 text-slate-400" /> {formatDate(app.endDate)}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-2 pt-2 sm:pt-0 ml-auto">
                    {/* 本人かつ 承認待ち(pending) の場合: 取り下げボタン（下書きに戻す） */}
                    {app.applicant?.id === currentUser.id && app.status === 'pending' && onUpdateApplication && (
                      <button
                        onClick={() => {
                          setConfirmModal({
                            isOpen: true,
                            title: '申請の取り下げ',
                            message: '申請を取り下げて「下書き」に戻しますか？',
                            type: 'warning',
                            confirmText: '取り下げる',
                            cancelText: 'キャンセル',
                            onConfirm: () => {
                              onUpdateApplication({
                                ...app,
                                status: 'draft'
                              });
                            }
                          });
                        }}
                        className="px-3.5 py-1.5 bg-slate-100 hover:bg-amber-50 hover:text-amber-800 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
                        title="申請を取り下げて下書きにします"
                      >
                        <RotateCcw className="w-3.5 h-3.5 text-amber-600" />
                        <span>取り下げる</span>
                      </button>
                    )}

                    {/* 本人かつ 下書き(draft) の場合: 編集(申請提出へ) & 削除 */}
                    {app.applicant?.id === currentUser.id && app.status === 'draft' && (
                      <>
                        <button
                          onClick={() => setEditingApp(app)}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer hover:shadow-md"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>編集して申請提出</span>
                        </button>
                        {onDeleteApplication && (
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: '下書き申請の削除',
                                message: 'この下書き申請を完全に削除しますか？',
                                type: 'danger',
                                confirmText: '削除する',
                                cancelText: 'キャンセル',
                                onConfirm: () => {
                                  onDeleteApplication(app.id);
                                }
                              });
                            }}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                            title="下書きを削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>削除</span>
                          </button>
                        )}
                      </>
                    )}

                    {/* 本人かつ 却下(rejected) の場合: 再申請 & 削除 */}
                    {app.applicant?.id === currentUser.id && app.status === 'rejected' && (
                      <>
                        <button
                          onClick={() => setEditingApp(app)}
                          className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-1.5 shadow-xs cursor-pointer hover:shadow-md"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>編集して再申請する</span>
                        </button>
                        {onDeleteApplication && (
                          <button
                            onClick={() => {
                              setConfirmModal({
                                isOpen: true,
                                title: '申請の削除',
                                message: 'この却下済み申請を削除しますか？',
                                type: 'danger',
                                confirmText: '削除する',
                                cancelText: 'キャンセル',
                                onConfirm: () => {
                                  onDeleteApplication(app.id);
                                }
                              });
                            }}
                            className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl transition-all flex items-center gap-1 cursor-pointer"
                            title="削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>削除</span>
                          </button>
                        )}
                      </>
                    )}

                    {/* 承認者操作ボタン (承認待ちタブの承認者用) */}
                    {filter === 'pending_approval' && app.status === 'pending' && onWorkflowAction && (
                      <>
                        <button
                          onClick={() => onWorkflowAction(app.id, 'approved')}
                          className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          <span>承認する</span>
                        </button>
                        <button
                          onClick={() => {
                            setRejectingAppId(app.id);
                            setRejectComment('');
                          }}
                          className="px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1 shadow-xs cursor-pointer"
                        >
                          <XCircle className="w-3.5 h-3.5" />
                          <span>却下する</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })
          ) : (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <FileText className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-slate-800 font-semibold mb-1">申請がありません</h3>
              <p className="text-slate-500 text-sm">現在、表示できる申請データはありません。</p>
            </div>
          )}
        </div>
      </div>

      <ApplicationModal 
        isOpen={isModalOpen} 
        onClose={() => setIsModalOpen(false)} 
        onSave={onAddApplication} 
        allUsers={allUsers}
        currentUser={currentUser}
        approvalFlows={approvalFlows}
        itemMasters={itemMasters}
        applications={applications}
      />

      {/* 編集・再申請用モーダル */}
      <ApplicationModal 
        isOpen={!!editingApp} 
        onClose={() => setEditingApp(null)} 
        onSave={(updatedData) => {
          if (onUpdateApplication && editingApp) {
            onUpdateApplication({
              ...editingApp,
              ...updatedData,
              id: editingApp.id
            });
          }
          setEditingApp(null);
        }} 
        allUsers={allUsers}
        currentUser={currentUser}
        approvalFlows={approvalFlows}
        initialData={editingApp}
        itemMasters={itemMasters}
        applications={applications}
      />

      {/* 却下理由入力ダイアログ */}
      {rejectingAppId && (
        <div
          onClick={() => setRejectingAppId(null)}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 ring-1 ring-slate-900/5 space-y-4"
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2 text-rose-600 font-bold text-base">
                <AlertTriangle className="w-5 h-5" />
                <span>申請の却下</span>
              </div>
              <button
                onClick={() => setRejectingAppId(null)}
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              申請者に伝える却下理由（差戻し・修正事項など）を入力してください。
            </p>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1.5">
                却下理由 <span className="text-rose-500">*</span>
              </label>
              <textarea
                value={rejectComment}
                onChange={e => setRejectComment(e.target.value)}
                placeholder="例: 予算超過のため金額を調整してください / 出張期間の目的を詳細に記述してください"
                rows={3}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:ring-2 focus:ring-rose-500 focus:outline-none transition-all"
                autoFocus
              />
            </div>

            <div className="flex justify-end gap-2.5 pt-2">
              <button
                onClick={() => setRejectingAppId(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (onWorkflowAction && rejectingAppId) {
                    onWorkflowAction(rejectingAppId, 'rejected', rejectComment || '理由未記入');
                    setRejectingAppId(null);
                    setRejectComment('');
                  }
                }}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <Send className="w-3.5 h-3.5" />
                <span>確定して却下する</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 補充依頼移行・新規申請モーダル */}
      {transitioningApp && (
        <div
          onClick={() => setTransitioningApp(null)}
          className="fixed inset-0 bg-slate-900/50 flex items-center justify-center z-50 p-4 backdrop-blur-sm animate-fade-in"
        >
          <div
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-xl max-h-[90vh] overflow-y-auto ring-1 ring-slate-900/5"
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
              <div className="flex items-center gap-2">
                <span className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
                  <Package className="w-5 h-5" />
                </span>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    新規補充依頼の作成・承認ルート指定
                  </h3>
                  <p className="text-xs text-slate-500">
                    発注申請 (現場: {transitioningApp.title}) から補充依頼を作成し承認ルートを指定します
                  </p>
                </div>
              </div>
              <button
                onClick={() => setTransitioningApp(null)}
                className="p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmitTransition} className="p-6 space-y-5">
              {/* 現場・発注No連動情報カード */}
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl space-y-1 text-xs">
                <div className="flex items-center justify-between font-bold text-indigo-950">
                  <span>連動発注情報</span>
                  <span className="font-mono bg-indigo-200/80 text-indigo-900 px-2 py-0.5 rounded text-[11px]">
                    発注No: {transitioningApp.purchaseOrderNumber || '未付与'}
                  </span>
                </div>
                <p className="text-indigo-900 font-medium">現場名: {transitioningApp.title}</p>
                {transitioningApp.constructionDate && (
                  <p className="text-indigo-800">工事予定日: {transitioningApp.constructionDate}</p>
                )}
              </div>

              {/* タイトル */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  補充依頼タイトル <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  required
                  autoComplete="off"
                  value={transTitle}
                  onChange={e => setTransTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-bold text-slate-900 focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                />
              </div>

              {/* 備考欄（自動整形 ＋ 自由追記） */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>補充依頼 備考・連絡事項 (自由追記)</span>
                  <span className="text-[10px] text-slate-400 font-normal">追記や修正が可能です</span>
                </label>
                <textarea
                  rows={6}
                  value={transNote}
                  onChange={e => setTransNote(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 font-mono leading-relaxed focus:bg-white focus:ring-2 focus:ring-indigo-500 focus:outline-none transition-all"
                />
              </div>

              {/* 改めて承認ルート（承認フロー）の指定 */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                  <GitMerge className="w-4 h-4 text-indigo-600" />
                  <span>改めて補充依頼の承認ルートを指定</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    適用承認フローを選択
                  </label>
                  <select
                    value={transFlowId}
                    onChange={e => setTransFlowId(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="manual">手動で承認者を1名指定（個別）</option>
                    {approvalFlows?.map(flow => (
                      <option key={flow.id} value={flow.id}>
                        {flow.name} ({flow.targetApplicationType === 'inventory_issue' ? '補充依頼用' : '汎用'} / {flow.steps.length}段階)
                      </option>
                    ))}
                  </select>
                </div>

                {transFlowId === 'manual' && (
                  <div>
                    <label className="block text-xs font-bold text-slate-600 mb-1">
                      一次承認者の指定
                    </label>
                    <select
                      value={transManualApproverId}
                      onChange={e => setTransManualApproverId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                      {allUsers.filter(u => u.id !== currentUser.id).map(u => (
                        <option key={u.id} value={u.id}>
                          {u.name} ({u.office || ''} {u.role || ''})
                        </option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              {/* ボタンエリア */}
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setTransitioningApp(null)}
                  className="px-4 py-2.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 text-xs font-bold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:from-indigo-700 hover:to-blue-700 rounded-xl shadow-md transition-all cursor-pointer flex items-center gap-2"
                >
                  <Send className="w-4 h-4" />
                  <span>補充依頼を申請する</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      <FilePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        file={previewFile}
      />
    </div>
  );
}
