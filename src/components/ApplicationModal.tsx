import React, { useState, useEffect } from 'react';
import { X, GitMerge, ArrowRight, CheckCircle2, UserCheck, ShieldCheck, AlertCircle, Plus, Trash2, Building2, ShoppingBag, Calculator, Calendar, Save, Send } from 'lucide-react';
import { ApplicationType, WorkflowApplication, User, ApprovalFlowRule, ApprovalStepConfig, ItemMaster, PurchaseOrderItem, ApplicationStatus } from '../types';

interface ApplicationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (application: Omit<WorkflowApplication, 'id' | 'createdAt' | 'status'> & { id?: string; status?: ApplicationStatus }) => void;
  allUsers: User[];
  currentUser: User;
  approvalFlows?: ApprovalFlowRule[];
  initialData?: WorkflowApplication | null;
  itemMasters?: ItemMaster[];
}

const typeLabels: Record<ApplicationType, string> = {
  business_trip: '出張申請',
  inventory_issue: '補充申請',
  purchase_order: '発注申請',
  other: 'その他',
};

// 申請者から見た N 階層目の上長ユーザーを取得するヘルパー関数
const getSupervisorAtLevel = (applicant: User, targetLevel: number, users: User[]): User | null => {
  let curr: User | undefined = applicant;
  for (let i = 0; i < targetLevel; i++) {
    if (!curr || !curr.supervisorId) break;
    const sup = users.find(u => u.id === curr.supervisorId);
    if (!sup) break;
    curr = sup;
  }
  return (curr && curr.id !== applicant.id) ? curr : null;
};

// ステップ設定に基づき実際の承認者とラベルを算出するヘルパー
const resolveApproverForStep = (
  applicant: User,
  stepConfig: ApprovalStepConfig,
  index: number,
  users: User[]
): { user: User; label: string; isFallback: boolean } => {
  if (stepConfig.approverType === 'specific_user' && stepConfig.specificUserId) {
    const specUser = users.find(u => u.id === stepConfig.specificUserId);
    if (specUser) {
      return { user: specUser, label: `${specUser.name}（個人指定）`, isFallback: false };
    }
  }

  let targetLevel = stepConfig.supervisorLevel;
  if (!targetLevel) {
    if (stepConfig.approverType === 'supervisor_1') targetLevel = 1;
    else if (stepConfig.approverType === 'supervisor_2') targetLevel = 2;
    else targetLevel = index + 1;
  }

  const sup = getSupervisorAtLevel(applicant, targetLevel, users);
  if (sup) {
    return {
      user: sup,
      label: `${sup.name} (${targetLevel === 1 ? '直属上長' : `第${targetLevel}階層上長`})`,
      isFallback: false
    };
  }

  // 上長が登録されていない場合フォールバック
  const fallback1 = getSupervisorAtLevel(applicant, 1, users);
  if (fallback1) {
    return {
      user: fallback1,
      label: `${fallback1.name} (直属上長 ※${targetLevel}次上長未設定のため代行)`,
      isFallback: true
    };
  }

  const adminUser = users.find(u => u.id === 'u4' || u.isAdmin) || users[0];
  return {
    user: adminUser,
    label: `${adminUser.name} (全社管理者 ※上長未設定代行)`,
    isFallback: true
  };
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
}: ApplicationModalProps) {
  const [type, setType] = useState<ApplicationType>('business_trip');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState<number | ''>('');
  const [quantity, setQuantity] = useState<number | ''>('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [constructionDate, setConstructionDate] = useState('');

  // 発注申請用の明細リスト
  const [purchaseItems, setPurchaseItems] = useState<PurchaseOrderItem[]>([
    { itemName: '', quantity: 1, unitPrice: 0, amount: 0 }
  ]);

  // 承認フロー選択 ('manual' または 承認フローID)
  const [selectedFlowId, setSelectedFlowId] = useState<string>('manual');
  const [manualApproverId, setManualApproverId] = useState<string>('');

  // モーダルが開いたとき、initialData があればそのデータをセット、無ければデフォルト設定
  useEffect(() => {
    if (isOpen) {
      if (initialData) {
        setType(initialData.type);
        setTitle(initialData.title);
        setDescription(initialData.description);
        setAmount(initialData.amount !== undefined ? initialData.amount : '');
        setQuantity(initialData.quantity !== undefined ? initialData.quantity : '');
        setStartDate(initialData.startDate ? initialData.startDate.substring(0, 10) : '');
        setEndDate(initialData.endDate ? initialData.endDate.substring(0, 10) : '');
        setConstructionDate(initialData.constructionDate ? initialData.constructionDate.substring(0, 10) : '');
        setSelectedFlowId(initialData.flowId || 'manual');
        if (initialData.approver) {
          setManualApproverId(initialData.approver.id);
        }
        if (initialData.purchaseItems && initialData.purchaseItems.length > 0) {
          setPurchaseItems(initialData.purchaseItems);
        } else {
          setPurchaseItems([{ itemName: '', quantity: 1, unitPrice: 0, amount: 0 }]);
        }
      } else {
        const defaultType: ApplicationType = 'business_trip';
        setType(defaultType);
        setTitle('');
        setDescription('');
        setAmount('');
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
  }, [isOpen, initialData]);

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
        targetItem.amount = (targetItem.quantity || 1) * matchedMaster.defaultUnitPrice;
      } else {
        targetItem.amount = (targetItem.quantity || 0) * (targetItem.unitPrice || 0);
      }
    } else if (field === 'quantity') {
      const qtyNum = Math.max(0, Number(value));
      targetItem.quantity = qtyNum;
      targetItem.amount = qtyNum * (targetItem.unitPrice || 0);
    } else if (field === 'unitPrice') {
      const priceNum = Math.max(0, Number(value));
      targetItem.unitPrice = priceNum;
      targetItem.amount = (targetItem.quantity || 0) * priceNum;
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

  // 現在選択中の承認フロー設定を取得
  const currentFlow = approvalFlows.find(f => f.id === selectedFlowId);

  // 申請者(currentUser)の実際の承認ルートを計算
  const actualRoute = currentFlow
    ? currentFlow.steps.map((step, idx) => ({
        stepNumber: idx + 1,
        stepName: step.stepName || `${idx + 1}次承認`,
        ...resolveApproverForStep(currentUser, step, idx, allUsers)
      }))
    : [];

  const handleSaveDraft = () => {
    const draftTitle = title.trim() || '(無題の下書き)';

    let initialApprover: User | undefined;
    let stepsConfig: ApprovalStepConfig[] | undefined;
    let flowName: string | undefined;

    if (selectedFlowId !== 'manual' && currentFlow) {
      flowName = currentFlow.name;
      stepsConfig = currentFlow.steps;
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

    const finalAmount = (type === 'purchase_order' || type === 'inventory_issue') 
      ? totalPurchaseAmount 
      : (amount !== '' ? Number(amount) : undefined);

    onSave({
      id: initialData?.id,
      type,
      title: draftTitle,
      description,
      status: 'draft',
      amount: finalAmount,
      quantity: quantity !== '' ? Number(quantity) : undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(endDate).toISOString() : undefined,
      constructionDate: type === 'purchase_order' && constructionDate ? constructionDate : undefined,
      purchaseItems: (type === 'purchase_order' || type === 'inventory_issue') ? purchaseItems : undefined,
      applicant: initialData?.applicant || currentUser,
      approver: initialApprover!,
      flowId: selectedFlowId !== 'manual' ? selectedFlowId : undefined,
      flowName: flowName,
      stepsConfig: stepsConfig
    });

    alert('申請を「下書き」として保存しました。');
    onClose();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title) return;
    if (type !== 'purchase_order' && type !== 'inventory_issue' && !description) return;

    let initialApprover: User | undefined;
    let stepsConfig: ApprovalStepConfig[] | undefined;
    let flowName: string | undefined;

    if (selectedFlowId !== 'manual' && currentFlow) {
      flowName = currentFlow.name;
      stepsConfig = currentFlow.steps;
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

    // 発注申請・補充申請の場合は明細の合計額を amount に設定し、purchaseItems を格納
    const finalAmount = (type === 'purchase_order' || type === 'inventory_issue') 
      ? totalPurchaseAmount 
      : (amount !== '' ? Number(amount) : undefined);

    onSave({
      id: initialData?.id,
      type,
      title,
      description,
      status: 'pending',
      amount: finalAmount,
      quantity: quantity !== '' ? Number(quantity) : undefined,
      startDate: startDate ? new Date(startDate).toISOString() : undefined,
      endDate: endDate ? new Date(endDate).toISOString() : undefined,
      constructionDate: type === 'purchase_order' && constructionDate ? constructionDate : undefined,
      purchaseItems: (type === 'purchase_order' || type === 'inventory_issue') ? purchaseItems : undefined,
      applicant: initialData?.applicant || currentUser,
      approver: initialApprover,
      flowId: selectedFlowId !== 'manual' ? selectedFlowId : undefined,
      flowName: flowName,
      stepsConfig: stepsConfig
    });

    onClose();
    // Reset form
    setType('business_trip');
    setTitle('');
    setDescription('');
    setAmount('');
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

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
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

          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              {(type === 'purchase_order' || type === 'inventory_issue') ? (
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
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium text-slate-800 transition-colors"
              placeholder={(type === 'purchase_order' || type === 'inventory_issue') ? '例: 名駅一丁目ビル新築工事現場' : '例: 関西営業所出張（顧客訪問）'}
            />
            {(type === 'purchase_order' || type === 'inventory_issue') && (
              <p className="text-[11px] text-slate-500 mt-1">※対象となる現場名や工事名を入力してください。</p>
            )}
          </div>

          {/* 工事予定日 (発注申請時) */}
          {type === 'purchase_order' && (
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-indigo-600" />
                <span>工事予定日</span>
              </label>
              <input
                type="date"
                value={constructionDate}
                onChange={e => setConstructionDate(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white font-medium text-slate-800 transition-colors"
              />
            </div>
          )}

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

          {/* 発注申請・補充申請の場合は明細リスト編集フォームを表示 */}
          {(type === 'purchase_order' || type === 'inventory_issue') ? (
            <div className="space-y-3 pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between">
                <label className="block text-sm font-bold text-slate-800 flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-indigo-600" />
                  <span>{type === 'purchase_order' ? '発注品名・明細内訳' : '補充品名・明細内訳'}</span>
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
                          品名 <span className="text-slate-400 font-normal">(マスタサジェスト/ベタ打ち可)</span>
                        </label>
                        <input
                          type="text"
                          list="item-master-list"
                          required
                          value={item.itemName}
                          onChange={e => handlePurchaseItemChange(idx, 'itemName', e.target.value)}
                          placeholder="例: M3戸車セット"
                          className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
                        />
                      </div>

                      <div className="col-span-4 sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">数量</label>
                        <input
                          type="number"
                          min="1"
                          required
                          value={item.quantity || ''}
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
                          value={item.unitPrice || ''}
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
                        value={item.note || ''}
                        onChange={e => handlePurchaseItemChange(idx, 'note', e.target.value)}
                        placeholder="備考（例: A棟2階設置用、規格指定あり等）"
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
                  <span>{type === 'purchase_order' ? '発注' : '補充'}想定合計額 （数量 × 単価）</span>
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
                  value={startDate}
                  onChange={e => setStartDate(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white text-xs font-semibold"
                />
              </div>
              <div>
                <label className="block text-sm font-bold text-slate-700 mb-1.5">終了日</label>
                <input
                  type="date"
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
                className="px-4 py-2.5 text-xs font-bold text-slate-700 bg-slate-100 hover:bg-slate-200 active:scale-95 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer border border-slate-200/80 shadow-2xs"
              >
                <Save className="w-4 h-4 text-slate-500" />
                <span>一時保存 (下書き)</span>
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:scale-95 rounded-xl transition-all shadow-sm cursor-pointer flex items-center gap-1.5"
              >
                <Send className="w-4 h-4" />
                <span>{initialData && initialData.status !== 'draft' ? '修正して再申請する' : '申請を提出する'}</span>
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

