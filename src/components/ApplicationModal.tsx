import React, { useState, useEffect, useRef } from 'react';
import { X, GitMerge, ArrowRight, CheckCircle2, UserCheck, ShieldCheck, AlertCircle, Plus, Trash2, Building2, ShoppingBag, Calculator, Calendar, Save, Send, Paperclip, Loader2, UploadCloud, Store, Clock, CreditCard, FileText, UserPlus, Zap } from 'lucide-react';
import { ApplicationType, WorkflowApplication, User, ApprovalFlowRule, ApprovalStepConfig, ItemMaster, PurchaseOrderItem, ApplicationStatus, AttachmentFile } from '../types';
import { filterStepsForApplicant, getSupervisorAtLevel, resolveApproverForStep, resolveApproverForStepDetails } from '../utils/workflowHelpers';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import { uploadMultipleFiles } from '../utils/fileUpload';
import { markWorkflowAsRead } from '../utils/notifications';

interface ApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (application: Omit<WorkflowApplication, 'id' | 'createdAt' | 'status'> & { id?: string; status?: ApplicationStatus }) => void;
  allUsers: User[];
  currentUser: User;
  approvalFlows?: ApprovalFlowRule[];
  initialData?: WorkflowApplication | null;
  itemMasters?: ItemMaster[];
  initialType?: ApplicationType;
  initialTitle?: string;
  initialDescription?: string;
}

const typeLabels: Record<ApplicationType, string> = {
  purchase_order: '購入申請',
  business_trip: '出張申請',
  inventory_issue: '補充申請',
  other: 'その他',
};



export function ApplicationModal({
  isOpen,
  onClose,
  onSave,
  allUsers,
  currentUser,
  approvalFlows = [],
  initialData,
  itemMasters = [],
  initialType,
  initialTitle,
  initialDescription,
}: ApplicationModalProps) {
  const [type, setType] = useState<ApplicationType>('purchase_order');
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [constructionDate, setConstructionDate] = useState('');

  // 購入申請用拡張ステート
  const [purchasePurpose, setPurchasePurpose] = useState('');
  const [purchaseTiming, setPurchaseTiming] = useState<'urgent' | 'by_date'>('urgent');
  const [purchaseDueDate, setPurchaseDueDate] = useState('');
  const [purchaseVendor, setPurchaseVendor] = useState('');
  const [purchaseMethod, setPurchaseMethod] = useState<'self' | 'delegate'>('self');
  const [purchaserDelegateUserId, setPurchaserDelegateUserId] = useState('');

  // 購入申請・補充申請用の明細リスト
  const [purchaseItems, setPurchaseItems] = useState<PurchaseOrderItem[]>([
    { itemName: '', quantity: 1, unitPrice: 0, amount: 0 }
  ]);

  // 承認フロー選択 ('manual' または 承認フローID)
  const [selectedFlowId, setSelectedFlowId] = useState<string>('manual');
  const [manualApproverId, setManualApproverId] = useState<string>('');

  // 添付ファイル関連ステート
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processUploadedFiles = async (files: FileList | File[]) => {
    if (files && files.length > 0) {
      setIsUploading(true);
      try {
        const uploaded = await uploadMultipleFiles(files);
        setAttachments(prev => [...prev, ...uploaded]);
      } catch (err) {
        console.error(err);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processUploadedFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processUploadedFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(attachments.filter(att => att.id !== id));
  };

  // モーダルが開いたとき、initialData があればそのデータをセット、無ければデフォルト設定
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        if (currentUser?.id && initialData.id) {
          markWorkflowAsRead(currentUser.id, initialData.id);
        }
        setType(initialData.type);
        setTitle(initialData.title);
        setDescription(initialData.description);
        setPurchasePurpose(initialData.purchasePurpose || '');
        setPurchaseTiming(initialData.purchaseTiming || 'urgent');
        setPurchaseDueDate(initialData.purchaseDueDate ? initialData.purchaseDueDate.substring(0, 10) : '');
        setPurchaseVendor(initialData.purchaseVendor || '');
        setPurchaseMethod(initialData.purchaseMethod || 'self');
        setPurchaserDelegateUserId(initialData.purchaserDelegateUserId || '');
        setAmount(initialData.amount !== undefined ? initialData.amount : '');
        setQuantity(initialData.quantity !== undefined ? initialData.quantity : '');
        setStartDate(initialData.startDate ? initialData.startDate.substring(0, 10) : '');
        setEndDate(initialData.endDate ? initialData.endDate.substring(0, 10) : '');
        setConstructionDate(initialData.constructionDate ? initialData.constructionDate.substring(0, 10) : '');
        setSelectedFlowId(initialData.flowId || 'manual');
        setAttachments(initialData.attachments || []);
        if (initialData.approver) {
          setManualApproverId(initialData.approver.id);
        }
        if (initialData.purchaseItems && initialData.purchaseItems.length > 0) {
          setPurchaseItems(initialData.purchaseItems);
        } else {
          setPurchaseItems([{ itemName: '', quantity: 1, unitPrice: 0, amount: 0 }]);
        }
      } else {
        const defaultType: ApplicationType = initialType || 'purchase_order';
        setType(defaultType);
        setTitle(initialTitle || '');
        setDescription(initialDescription || '');
        setPurchasePurpose('');
        setPurchaseTiming('urgent');
        setPurchaseDueDate('');
        setPurchaseVendor('');
        setPurchaseMethod('self');
        setPurchaserDelegateUserId('');
        setAmount('');
        setAttachments([]);
        setQuantity('');
        setStartDate('');
        setEndDate('');
        setConstructionDate('');
        setPurchaseItems([{ itemName: '', quantity: 1, unitPrice: 0, amount: 0 }]);

        if (approvalFlows.length > 0) {
          const matched =
            approvalFlows.find(f => f.targetApplicationType === defaultType) ||
            approvalFlows.find(f => f.isDefault) ||
            approvalFlows[0];
          if (matched) {
            setSelectedFlowId(matched.id);
          } else {
            setSelectedFlowId('manual');
          }
        } else {
          setSelectedFlowId('manual');
        }

        // 直属上長を手動初期値に
        if (currentUser.supervisorId && allUsers.some(u => u.id === currentUser.supervisorId)) {
          setManualApproverId(currentUser.supervisorId);
        } else {
          const fallbackUser = allUsers.find(u => u.id !== currentUser.id);
          setManualApproverId(fallbackUser ? fallbackUser.id : '');
        }
      }
    }
  }, [isOpen, initialData, initialType, initialTitle, initialDescription]);

  // 明細行の更新
  const handlePurchaseItemChange = (
    index: number,
    field: keyof PurchaseOrderItem,
    value: string | number
  ) => {
    const updated = [...purchaseItems];
    const targetItem = { ...updated[index] };

    if (field === 'itemName') {
      const nameVal = String(value);
      targetItem.itemName = nameVal;
      // 品名マスタと一致するものがあれば標準単価を自動補完
      const matchedMaster = itemMasters.find(m => m.name === nameVal);
      if (matchedMaster && matchedMaster.defaultUnitPrice !== undefined) {
        targetItem.unitPrice = matchedMaster.defaultUnitPrice;
        targetItem.amount = (Number(targetItem.quantity) || 1) * matchedMaster.defaultUnitPrice;
      } else {
        const p = Number(targetItem.unitPrice) || 0;
        targetItem.amount = (Number(targetItem.quantity) || 0) * p;
      }
    } else if (field === 'quantity') {
      if (value === '') {
        (targetItem as any).quantity = '';
        targetItem.amount = 0;
      } else {
        const qtyNum = Math.max(0, Number(value));
        targetItem.quantity = qtyNum;
        const p = Number(targetItem.unitPrice) || 0;
        targetItem.amount = qtyNum * p;
      }
    } else if (field === 'unitPrice') {
      if (value === '') {
        (targetItem as any).unitPrice = '';
        targetItem.amount = 0;
      } else {
        const priceNum = Math.max(0, Number(value));
        targetItem.unitPrice = priceNum;
        const q = Number(targetItem.quantity) || 0;
        targetItem.amount = q * priceNum;
      }
    } else if (field === 'note') {
      targetItem.note = String(value);
    }

    updated[index] = targetItem;
    setPurchaseItems(updated);
  };

  // 明細行の追加
  const addPurchaseItem = () => {
    setPurchaseItems([
      ...purchaseItems,
      { itemName: '', quantity: 1, unitPrice: 0, amount: 0 }
    ]);
  };

  // 明細行の削除
  const removePurchaseItem = (index: number) => {
    if (purchaseItems.length <= 1) return;
    setPurchaseItems(purchaseItems.filter((_, i) => i !== index));
  };

  // 明細の小計合計計算
  const totalPurchaseAmount = purchaseItems.reduce((sum, item) => sum + (item.amount || 0), 0);

  // 申請種別変更ハンドラー（対応するフローを自動マッチング）
  const handleTypeChange = (newType: ApplicationType) => {
    setType(newType);
    if (!initialData && approvalFlows.length > 0) {
      const matched =
        approvalFlows.find(f => f.targetApplicationType === newType) ||
        approvalFlows.find(f => f.isDefault) ||
        approvalFlows[0];
      if (matched) {
        setSelectedFlowId(matched.id);
      }
    }
  };

  if (!isOpen) return null;

  // 現在選択中の承認フロー設定を取得し、申請者に応じてステップをフィルタリング (2次上長不在の場合は1次のみ)
  const currentFlow = approvalFlows.find(f => f.id === selectedFlowId);
  const activeStepsConfig = currentFlow ? filterStepsForApplicant(currentUser, currentFlow.steps, allUsers) : [];

  // 申請者(currentUser)の実際の承認ルートを計算
  const actualRoute = activeStepsConfig.map((step, idx) => ({
    stepNumber: idx + 1,
    stepName: step.stepName || `${idx + 1}次承認`,
    ...resolveApproverForStepDetails(currentUser, step, idx, allUsers)
  }));

  const handleSaveDraft = () => {
    const draftTitle = (title || '').trim() || '(無題の下書き)';

    let initialApprover: User | undefined;
    let stepsConfig: ApprovalStepConfig[] | undefined;
    let flowName: string | undefined;

    if (selectedFlowId !== 'manual' && currentFlow) {
      flowName = currentFlow.name;
      stepsConfig = activeStepsConfig;
      if (actualRoute.length > 0) {
        initialApprover = actualRoute[0].user;
      }
    } else {
      initialApprover = allUsers.find(u => u.id === manualApproverId);
      flowName = '個別承認（1段階）';
      stepsConfig = [
        {
          stepNumber: 1,
          approverType: 'specific_user',
          specificUserId: initialApprover?.id,
          stepName: '承認確認'
        }
      ];
    }

    if (!initialApprover) {
      initialApprover = currentUser.supervisorId 
        ? allUsers.find(u => u.id === currentUser.supervisorId) 
        : currentUser;
    }

    const sanitizedPurchaseItems = (type === 'purchase_order' || type === 'inventory_issue')
      ? purchaseItems.map(pi => {
          const qty = Math.max(1, Number(pi.quantity) || 1);
          const price = Math.max(0, Number(pi.unitPrice) || 0);
          return {
            ...pi,
            quantity: qty,
            unitPrice: price,
            amount: qty * price
          };
        })
      : undefined;

    const finalAmount = (type === 'purchase_order' || type === 'inventory_issue') 
      ? (sanitizedPurchaseItems?.reduce((sum, item) => sum + item.amount, 0) ?? totalPurchaseAmount)
      : (amount !== '' ? Number(amount) : undefined);

    onSave({
      id: initialData?.id,
      type,
      title: draftTitle,
      description,
      status: 'draft',
      amount: finalAmount,
      purchasePurpose: type === 'purchase_order' ? purchasePurpose : undefined,
      purchaseTiming: type === 'purchase_order' ? purchaseTiming : undefined,
      purchaseDueDate: (type === 'purchase_order' && purchaseTiming === 'by_date' && purchaseDueDate) ? purchaseDueDate : undefined,
      purchaseVendor: type === 'purchase_order' ? purchaseVendor : undefined,
      purchaseMethod: type === 'purchase_order' ? purchaseMethod : undefined,
      purchaserDelegateUserId: (type === 'purchase_order' && purchaseMethod === 'delegate' && purchaserDelegateUserId) ? purchaserDelegateUserId : undefined,
      purchaserDelegateUser: (type === 'purchase_order' && purchaseMethod === 'delegate' && purchaserDelegateUserId) ? allUsers.find(u => u.id === purchaserDelegateUserId) : undefined,
      quantity: quantity !== '' ? Number(quantity) : undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(endDate).toISOString() : undefined,
      constructionDate: type === 'purchase_order' && constructionDate ? constructionDate : undefined,
      purchaseItems: sanitizedPurchaseItems,
      applicant: initialData?.applicant || currentUser,
      approver: initialApprover!,
      flowId: selectedFlowId !== 'manual' ? selectedFlowId : undefined,
      flowName: flowName,
      stepsConfig: stepsConfig,
      attachments: attachments
    });

    setConfirmModal({
      isOpen: true,
      title: '下書き保存',
      message: '申請を「下書き」として保存しました。',
      type: 'success',
      confirmText: '閉じる',
      onConfirm: () => {
        onClose();
      }
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    if (type === 'purchase_order' && !purchasePurpose) return;
    if (type !== 'purchase_order' && type !== 'inventory_issue' && !description) return;
    if (type === 'purchase_order' && purchaseMethod === 'delegate' && !purchaserDelegateUserId) {
      setConfirmModal({
        isOpen: true,
        title: '購入依頼先の指定',
        message: '購入を依頼する担当者を選択してください。',
        type: 'warning',
        confirmText: '確認',
      });
      return;
    }

    let initialApprover: User | undefined;
    let stepsConfig: ApprovalStepConfig[] | undefined;
    let flowName: string | undefined;

    if (selectedFlowId !== 'manual' && currentFlow) {
      flowName = currentFlow.name;
      stepsConfig = activeStepsConfig;
      if (actualRoute.length > 0) {
        initialApprover = actualRoute[0].user;
      }
    } else {
      initialApprover = allUsers.find(u => u.id === manualApproverId);
      if (!initialApprover) return;
      flowName = '個別承認（1段階）';
      stepsConfig = [
        {
          stepNumber: 1,
          approverType: 'specific_user',
          specificUserId: initialApprover.id,
          stepName: '承認確認'
        }
      ];
    }

    if (!initialApprover) return;

    // 購入申請・補充申請の場合は明細の合計額を amount に設定し、purchaseItems を格納
    const sanitizedPurchaseItems = (type === 'purchase_order' || type === 'inventory_issue')
      ? purchaseItems.map(pi => {
          const qty = Math.max(1, Number(pi.quantity) || 1);
          const price = Math.max(0, Number(pi.unitPrice) || 0);
          return {
            ...pi,
            quantity: qty,
            unitPrice: price,
            amount: qty * price
          };
        })
      : undefined;

    const finalAmount = (type === 'purchase_order' || type === 'inventory_issue') 
      ? (sanitizedPurchaseItems?.reduce((sum, item) => sum + item.amount, 0) ?? totalPurchaseAmount)
      : (amount !== '' ? Number(amount) : undefined);

    onSave({
      id: initialData?.id,
      type,
      title,
      description: type === 'purchase_order' ? (purchasePurpose || description) : description,
      status: 'pending',
      amount: finalAmount,
      purchasePurpose: type === 'purchase_order' ? purchasePurpose : undefined,
      purchaseTiming: type === 'purchase_order' ? purchaseTiming : undefined,
      purchaseDueDate: (type === 'purchase_order' && purchaseTiming === 'by_date' && purchaseDueDate) ? purchaseDueDate : undefined,
      purchaseVendor: type === 'purchase_order' ? purchaseVendor : undefined,
      purchaseMethod: type === 'purchase_order' ? purchaseMethod : undefined,
      purchaserDelegateUserId: (type === 'purchase_order' && purchaseMethod === 'delegate' && purchaserDelegateUserId) ? purchaserDelegateUserId : undefined,
      purchaserDelegateUser: (type === 'purchase_order' && purchaseMethod === 'delegate' && purchaserDelegateUserId) ? allUsers.find(u => u.id === purchaserDelegateUserId) : undefined,
      quantity: quantity !== '' ? Number(quantity) : undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(endDate).toISOString() : undefined,
      constructionDate: type === 'purchase_order' && constructionDate ? constructionDate : undefined,
      purchaseItems: sanitizedPurchaseItems,
      applicant: initialData?.applicant || currentUser,
      approver: initialApprover,
      flowId: selectedFlowId !== 'manual' ? selectedFlowId : undefined,
      flowName: flowName,
      stepsConfig: stepsConfig,
      attachments: attachments
    });

    onClose();
    // Reset form
    setType('purchase_order');
    setTitle('');
    setDescription('');
    setPurchasePurpose('');
    setPurchaseTiming('urgent');
    setPurchaseDueDate('');
    setPurchaseVendor('');
    setPurchaseMethod('self');
    setPurchaserDelegateUserId('');
    setAmount('');
    setAttachments([]);
    setQuantity('');
    setStartDate('');
    setEndDate('');
    setPurchaseItems([{ itemName: '', quantity: 1, unitPrice: 0, amount: 0 }]);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm"
    >
      {/* 品名マスタのサジェストリスト */}
      <datalist id="item-master-list">
        {itemMasters.map(m => (
          <option key={m.id} value={m.name}>
            {m.code ? `[品番: ${m.code}] ` : ''}{m.category ? `[${m.category}] ` : ''}{m.defaultUnitPrice !== undefined ? `単価: ¥${m.defaultUnitPrice.toLocaleString()}` : ''}
          </option>
        ))}
      </datalist>

      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[92vh] overflow-y-auto ring-1 ring-slate-900/5 my-4"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100 bg-slate-50">
          <div>
            <h2 className="text-lg font-bold text-slate-800">
              {initialData ? '申請内容の編集・再申請' : '新規申請'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              申請者: <span className="font-bold text-slate-700">{initialData?.applicant.name || currentUser.name}</span> ({currentUser.office || ''} / {currentUser.division || ''})
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:bg-slate-200 hover:text-slate-600 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} autoComplete="off" className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5">申請種別</label>
            <select
              value={type}
              onChange={e => handleTypeChange(e.target.value as ApplicationType)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium text-slate-800 transition-colors cursor-pointer"
            >
              {(Object.keys(typeLabels) as ApplicationType[]).map(key => (
                <option key={key} value={key}>
                  {typeLabels[key]}
                </option>
              ))}
            </select>
          </div>

          {/* タイトル / 現場名 */}
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              {type === 'inventory_issue' ? (
                <>
                  <Building2 className="w-4 h-4 text-indigo-600" />
                  <span>現場名 <span className="text-rose-500">*</span></span>
                </>
              ) : (
                <span>タイトル <span className="text-rose-500">*</span></span>
              )}
            </label>
            <input
              type="text"
              required
              autoComplete="off"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium text-slate-800 transition-colors"
              placeholder={
                type === 'purchase_order' 
                  ? '例: 4K 27インチモニター・開発備品購入' 
                  : type === 'inventory_issue' 
                    ? '例: 名駅一丁目ビル新築工事現場' 
                    : '例: 関西営業所出張（顧客訪問）'
              }
            />
            {type === 'inventory_issue' && (
              <p className="text-[11px] text-slate-500 mt-1">※対象となる現場名や工事名を入力してください。</p>
            )}
          </div>

          {/* 購入申請 専用フィールド群 */}
          {type === 'purchase_order' && (
            <div className="space-y-4 pt-1">
              {/* 購入目的 */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-indigo-600" />
                  <span>購入目的 <span className="text-rose-500">*</span></span>
                </label>
                <textarea
                  required
                  value={purchasePurpose}
                  onChange={e => setPurchasePurpose(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs leading-relaxed resize-none h-20"
                  placeholder="例: 業務効率化および開発環境の整備のため、高解像度モニターと周辺機器を導入したく申請いたします。"
                />
              </div>

              {/* 購入時期 (至急 / 期日指定) */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Clock className="w-4 h-4 text-indigo-600" />
                  <span>購入時期 <span className="text-rose-500">*</span></span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPurchaseTiming('urgent')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      purchaseTiming === 'urgent'
                        ? 'border-rose-300 bg-rose-50/80 ring-2 ring-rose-200 text-rose-900 font-bold'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-700 font-medium'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      purchaseTiming === 'urgent' ? 'bg-rose-500 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      <Zap className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">至急</div>
                      <div className="text-[10px] text-slate-500">直ちに手配・購入が必要</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPurchaseTiming('by_date')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      purchaseTiming === 'by_date'
                        ? 'border-indigo-300 bg-indigo-50/80 ring-2 ring-indigo-200 text-indigo-900 font-bold'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-700 font-medium'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      purchaseTiming === 'by_date' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      <Calendar className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">期日指定</div>
                      <div className="text-[10px] text-slate-500">◯日までに必要</div>
                    </div>
                  </button>
                </div>

                {purchaseTiming === 'by_date' && (
                  <div className="mt-2.5 p-3 bg-indigo-50/50 border border-indigo-100 rounded-xl space-y-1">
                    <label className="block text-[11px] font-bold text-indigo-900">
                      必要期日（◯日までに必要） <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="date"
                      required
                      value={purchaseDueDate}
                      onChange={e => setPurchaseDueDate(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                    />
                  </div>
                )}
              </div>

              {/* 購入元 */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <Store className="w-4 h-4 text-indigo-600" />
                  <span>購入元 <span className="text-slate-400 font-normal">(店舗・ECサイト・取引先名)</span></span>
                </label>
                <input
                  type="text"
                  value={purchaseVendor}
                  onChange={e => setPurchaseVendor(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium text-slate-800 transition-colors"
                  placeholder="例: Amazon, アスクル, モノタロウ, 〇〇商事など"
                />
              </div>

              {/* 購入方法 (自分で購入 / ◯さんに購入を依頼) */}
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                  <CreditCard className="w-4 h-4 text-indigo-600" />
                  <span>購入方法 <span className="text-rose-500">*</span></span>
                </label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={() => setPurchaseMethod('self')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      purchaseMethod === 'self'
                        ? 'border-emerald-300 bg-emerald-50/80 ring-2 ring-emerald-200 text-emerald-900 font-bold'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-700 font-medium'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      purchaseMethod === 'self' ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">自分で購入</div>
                      <div className="text-[10px] text-slate-500">立替精算 / 自社カード等</div>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPurchaseMethod('delegate')}
                    className={`p-3 rounded-xl border text-left flex items-center gap-2.5 transition-all cursor-pointer ${
                      purchaseMethod === 'delegate'
                        ? 'border-indigo-300 bg-indigo-50/80 ring-2 ring-indigo-200 text-indigo-900 font-bold'
                        : 'border-slate-200 bg-slate-50/60 hover:bg-slate-100 text-slate-700 font-medium'
                    }`}
                  >
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      purchaseMethod === 'delegate' ? 'bg-indigo-600 text-white' : 'bg-slate-200 text-slate-600'
                    }`}>
                      <UserPlus className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-xs font-bold">◯さんに購入を依頼</div>
                      <div className="text-[10px] text-slate-500">決裁後、担当者へ発注依頼</div>
                    </div>
                  </button>
                </div>

                {/* 依頼先ユーザー選択 */}
                {purchaseMethod === 'delegate' && (
                  <div className="mt-2.5 p-3.5 bg-indigo-50/70 border border-indigo-200 rounded-xl space-y-2">
                    <label className="block text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                      <UserCheck className="w-4 h-4 text-indigo-600" />
                      <span>購入を依頼する担当者 <span className="text-rose-500">*</span></span>
                    </label>
                    <select
                      required
                      value={purchaserDelegateUserId}
                      onChange={e => setPurchaserDelegateUserId(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none cursor-pointer"
                    >
                      <option value="">-- 購入依頼先を選択してください (総務・購買担当など) --</option>
                      {allUsers
                        .filter(u => u.id !== currentUser.id)
                        .map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.office || ''} / {u.division || ''} / {u.position || ''})
                          </option>
                        ))}
                    </select>
                    <div className="flex items-start gap-1.5 text-[11px] text-indigo-800 bg-white/80 p-2 rounded-lg border border-indigo-100">
                      <ShieldCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0 mt-0.5" />
                      <span>
                        ※決裁（最終承認）が完了した時点で、指定された担当者様へ自動的に<strong>「購入手続き依頼」</strong>のプッシュ通知およびメールが送信されます。
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 出張申請・その他の詳細説明 */}
          {type !== 'purchase_order' && type !== 'inventory_issue' && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5">
                詳細説明 <span className="text-rose-500">*</span>
              </label>
              <textarea
                required
                value={description}
                onChange={e => setDescription(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs leading-relaxed resize-none h-20"
                placeholder="申請の目的、背景、具体的な依頼事項..."
              />
            </div>
          )}

          {/* 添付ファイル設定 (共通) */}
          <div className="pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-indigo-500" />
                <span>添付ファイル（領収書・図面・見積書等）</span>
              </label>
              <button
                type="button"
                disabled={isUploading}
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>追加</span>
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />

            {/* D&D ドロップエリア */}
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => !isUploading && fileInputRef.current?.click()}
              className={`p-3.5 border-2 border-dashed rounded-xl text-center cursor-pointer transition-all ${
                isDraggingOver
                  ? 'border-indigo-500 bg-indigo-50/90 ring-2 ring-indigo-300'
                  : 'border-slate-200 hover:border-indigo-300 bg-slate-50/50 hover:bg-slate-50'
              }`}
            >
              {isDraggingOver ? (
                <div className="flex items-center justify-center gap-2 text-indigo-700 pointer-events-none py-1">
                  <UploadCloud className="w-5 h-5 animate-bounce text-indigo-600" />
                  <p className="text-xs font-bold">ここにファイルをドロップして添付</p>
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-1 pointer-events-none">
                  <UploadCloud className="w-5 h-5 text-slate-400" />
                  <p className="text-xs text-slate-600 font-semibold">
                    ファイルをドラッグ＆ドロップ、または<span className="text-indigo-600 underline ml-1">クリックして選択</span>
                  </p>
                  <p className="text-[10px] text-slate-400">見積書、領収書、現場写真、PDF、画像など</p>
                </div>
              )}
            </div>

            {isUploading && (
              <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-500 mt-2">
                <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                <span>アップロード中...</span>
              </div>
            )}

            {attachments.length > 0 && (
              <div className="space-y-1.5 max-h-36 overflow-y-auto mt-2">
                {attachments.map(att => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-700 truncate">{att.name}</span>
                      <span className="text-[10px] text-slate-400">({att.size})</span>
                    </div>
                    <button
                      type="button"
                      disabled={isUploading}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleRemoveAttachment(att.id);
                      }}
                      className="text-slate-400 hover:text-rose-600 p-0.5 rounded transition-colors disabled:opacity-50 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 購入申請・補充申請の場合は明細リスト編集フォームを表示 */}
          {(type === 'purchase_order' || type === 'inventory_issue') ? (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-slate-800 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-indigo-600" />
                  <span>{type === 'purchase_order' ? '購入品明細' : '補充品名・明細内訳'}</span>
                </label>
                <button
                  type="button"
                  onClick={addPurchaseItem}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>明細行を追加</span>
                </button>
              </div>

              <div className="space-y-2.5">
                {purchaseItems.map((item, idx) => (
                  <div key={idx} className="p-3 bg-slate-50/80 border border-slate-200/80 rounded-xl space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-slate-500 border-b border-slate-200/50 pb-1.5 mb-1.5">
                      <span>明細 #{idx + 1}</span>
                      {purchaseItems.length > 1 && (
                        <button
                          type="button"
                          onClick={() => removePurchaseItem(idx)}
                          className="text-rose-500 hover:text-rose-700 p-1 hover:bg-rose-50 rounded transition-colors cursor-pointer flex items-center gap-1 text-[11px]"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                          <span>削除</span>
                        </button>
                      )}
                    </div>

                    <div className="grid grid-cols-12 gap-2">
                      <div className="col-span-12 sm:col-span-5">
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                          品名 <span className="text-slate-400 font-normal">(マスタサジェスト/直接入力)</span>
                        </label>
                        <input
                          type="text"
                          list="item-master-list"
                          required
                          autoComplete="off"
                          value={item.itemName}
                          onChange={e => handlePurchaseItemChange(idx, 'itemName', e.target.value)}
                          placeholder="例: 27インチ4Kモニター、ワイヤレスマウス等"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">数量</label>
                        <input
                          type="number"
                          min="1"
                          required
                          autoComplete="off"
                          value={item.quantity !== undefined ? item.quantity : ''}
                          onChange={e => handlePurchaseItemChange(idx, 'quantity', e.target.value)}
                          placeholder="1"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-right"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2.5">
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">単価 (円)</label>
                        <input
                          type="number"
                          min="0"
                          required
                          autoComplete="off"
                          value={item.unitPrice !== undefined ? item.unitPrice : ''}
                          onChange={e => handlePurchaseItemChange(idx, 'unitPrice', e.target.value)}
                          placeholder="0"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none text-right"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2.5">
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">小計 (自動計算)</label>
                        <div className="px-2.5 py-1.5 bg-slate-100/80 border border-slate-200/80 rounded-lg text-xs font-extrabold text-slate-800 text-right truncate">
                          ¥{(item.amount || 0).toLocaleString()}
                        </div>
                      </div>
                    </div>

                    <div>
                      <input
                        type="text"
                        autoComplete="off"
                        value={item.note || ''}
                        onChange={e => handlePurchaseItemChange(idx, 'note', e.target.value)}
                        placeholder="備考（例: 型番指定、色指定、納品先指定等）"
                        className="w-full px-2.5 py-1 bg-white/80 border border-slate-200 rounded-lg text-[11px] text-slate-600 focus:ring-1 focus:ring-indigo-500 focus:outline-none"
                      />
                    </div>
                  </div>
                ))}
              </div>

              {/* 合計計算カード */}
              <div className="p-3.5 bg-indigo-50/70 border border-indigo-100 rounded-xl flex items-center justify-between">
                <div className="flex items-center gap-2 text-indigo-900 font-bold text-xs">
                  <Calculator className="w-4 h-4 text-indigo-600" />
                  <span>合計金額 （数量 × 単価）</span>
                </div>
                <div className="text-base font-black text-indigo-700">
                  ¥{totalPurchaseAmount.toLocaleString()}
                </div>
              </div>

              {/* 明細の下に「備考（任意）」を表示 */}
              <div className="pt-2">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  備考 <span className="text-slate-400 font-normal">(任意)</span>
                </label>
                <textarea
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs leading-relaxed resize-none h-16"
                  placeholder="その他特記事項や納品・補給時の注意事項など（任意）..."
                />
              </div>
            </div>
          ) : (
            (type === 'business_trip' || type === 'other') && (
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">金額（円）</label>
                <input
                  type="number"
                  autoComplete="off"
                  value={amount}
                  onChange={e => setAmount(e.target.value ? Number(e.target.value) : '')}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-bold text-slate-800 transition-colors"
                  placeholder="0"
                  min="0"
                />
              </div>
            )
          )}

          {type === 'business_trip' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">開始日</label>
                <input
                  type="date"
                  autoComplete="off"
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">終了日</label>
                <input
                  type="date"
                  autoComplete="off"
                  value={endDate}
                  onChange={e => setEndDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs font-semibold"
                />
              </div>
            </div>
          )}

          {/* 承認フローの選択 */}
          <div className="pt-3 border-t border-slate-100 space-y-3">
            <div>
              <label className="block text-sm font-bold text-slate-800 mb-1.5 flex items-center gap-2">
                <GitMerge className="w-4 h-4 text-indigo-600" />
                <span>適用する承認フロー・承認者</span>
              </label>

              <select
                value={selectedFlowId}
                onChange={e => setSelectedFlowId(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-indigo-50/60 border border-indigo-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-indigo-950 transition-colors cursor-pointer"
              >
                {approvalFlows.map(flow => (
                  <option key={flow.id} value={flow.id}>
                    {flow.name} ({flow.steps.length}段階承認)
                    {flow.targetApplicationType === type ? ' ★おすすめ' : flow.isDefault ? ' (デフォルト)' : ''}
                  </option>
                ))}
                <option value="manual">-- 手動で承認者を直接1名指定 --</option>
              </select>
            </div>

            {/* 手動指定の場合 */}
            {selectedFlowId === 'manual' && (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">承認者を選択</label>
                <select
                  value={manualApproverId}
                  onChange={e => setManualApproverId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-800"
                >
                  <option value="">-- 選択してください --</option>
                  {allUsers
                    .filter(u => u.id !== currentUser.id)
                    .map(u => (
                      <option key={u.id} value={u.id}>
                        {u.name} ({u.office || ''} / {u.division || ''} / {u.position || ''})
                      </option>
                    ))}
                </select>
              </div>
            )}

            {/* 選択した承認フローにおける実際の承認ルート（プレビュー） */}
            {selectedFlowId !== 'manual' && currentFlow && (
              <div className="p-4 bg-slate-50 border border-indigo-100 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <UserCheck className="w-4 h-4 text-indigo-600" />
                    <span>実際の承認ルート (あなたの組織階層を展開):</span>
                  </span>
                  <span className="text-[10px] font-extrabold text-indigo-700 bg-indigo-100 px-2 py-0.5 rounded border border-indigo-200">
                    {actualRoute.length}段階ルート
                  </span>
                </div>

                <div className="space-y-2">
                  {/* 申請者自身 */}
                  <div className="flex items-center gap-2 text-xs">
                    <div className="w-6 h-6 rounded-full bg-slate-200 text-slate-700 font-bold flex items-center justify-center text-[10px] shrink-0">
                      発
                    </div>
                    <div className="flex-1 min-w-0">
                      <span className="font-bold text-slate-800">{currentUser.name}</span>
                      <span className="text-slate-400 text-[10px] ml-1.5">(あなた / 申請者)</span>
                    </div>
                  </div>

                  {/* ステップ順序展開 */}
                  {actualRoute.map((rt, idx) => (
                    <React.Fragment key={idx}>
                      <div className="pl-2.5 border-l-2 border-indigo-200 ml-3 py-1">
                        <div className="flex items-center gap-2.5 bg-white p-2.5 rounded-xl border border-slate-200 shadow-2xs">
                          <div className={`w-6 h-6 rounded-full font-bold text-[11px] flex items-center justify-center shrink-0 ${
                            idx === 0 ? 'bg-indigo-600 text-white ring-2 ring-indigo-200' : 'bg-slate-100 text-slate-700'
                          }`}>
                            {rt.stepNumber}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-extrabold text-xs text-slate-900">{rt.user.name}</span>
                              <span className="text-[10px] font-bold text-indigo-700 bg-indigo-50 px-1.5 py-0.2 rounded border border-indigo-100">
                                {rt.stepName}
                              </span>
                            </div>
                            <p className="text-[10px] text-slate-500 truncate mt-0.5">
                              {rt.user.office || ''} / {rt.user.division || ''} / {rt.user.position || ''}
                            </p>
                          </div>
                        </div>
                      </div>
                    </React.Fragment>
                  ))}

                  {/* 完了 */}
                  <div className="pl-2.5 border-l-2 border-emerald-300 ml-3 py-1">
                    <div className="flex items-center gap-2 text-xs text-emerald-800 bg-emerald-50/80 p-2 rounded-xl border border-emerald-200 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>最終承認完了 (決裁完了)</span>
                    </div>
                  </div>
                </div>

                {/* 初回確認待ちの注意アナウンス */}
                {actualRoute.length > 0 && (
                  <div className="pt-2 border-t border-slate-200/60 flex items-start gap-1.5 text-[11px] text-indigo-900">
                    <ShieldCheck className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                    <span>
                      申請提出後は、まず 1次承認者の <strong className="font-extrabold underline text-indigo-700">{actualRoute[0].user.name}</strong> さんに承認依頼が届きます。
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleSaveDraft}
                disabled={isUploading}
                className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200/80 shadow-2xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 text-slate-500 animate-pulse-slow" />
                <span>一時保存 (下書き)</span>
              </button>
              <button
                type="submit"
                disabled={isUploading}
                className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Send className="w-4 h-4" />
                <span>{initialData && initialData.status !== 'draft' ? (isUploading ? 'アップロード中...' : '修正して再申請する') : (isUploading ? 'アップロード中...' : '申請を提出する')}</span>
              </button>
            </div>
          </div>
        </form>
      </div>

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

