import React, { useState, useEffect } from 'react';
import { 
  WorkflowApplication, 
  User, 
  AttachmentFile,
  PurchaseItem 
} from '../types';
import { 
  FileText, 
  X, 
  CheckCircle2, 
  XCircle, 
  Clock, 
  Calendar, 
  Building2, 
  Coins, 
  Zap, 
  Store, 
  CreditCard, 
  UserPlus, 
  Paperclip, 
  Eye, 
  ExternalLink, 
  AlertTriangle, 
  RotateCcw, 
  Edit3, 
  Send, 
  UserCheck, 
  ArrowRight,
  ShieldAlert
} from 'lucide-react';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';
import { markWorkflowAsRead } from '../utils/notifications';
import { triggerOpenUserModal } from '../utils/userModal';
import { FilePreviewModal } from './FilePreviewModal';
import { isUserCurrentApprover, resolveApproverForStepDetails, isDuplicateApproverStep } from '../utils/workflowHelpers';

export interface GlobalWorkflowDetailModalProps {
  isOpen: boolean;
  application: WorkflowApplication | null;
  currentUser: User;
  allUsers?: User[];
  onClose: () => void;
  onWorkflowAction?: (id: string, status: 'approved' | 'rejected', comment?: string) => Promise<void> | void;
  onUpdateApplication?: (app: WorkflowApplication) => Promise<void> | void;
  onNavigateToWorkflow?: (applicationId: string) => void;
  onOpenEditModal?: (app: WorkflowApplication) => void;
}

const typeLabels: Record<string, string> = {
  purchase_order: '発注申請',
  purchase_request: '購入申請',
  inventory_issue: '補充申請',
  business_trip: '出張申請',
  gold_silver_daily_report: '金銀日報',
  other: 'その他',
};

const statusConfig: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { 
    label: '下書き', 
    color: 'bg-slate-100 text-slate-700 border-slate-300', 
    icon: <FileText className="w-3.5 h-3.5 text-slate-500" /> 
  },
  pending: { 
    label: '申請中', 
    color: 'bg-amber-100 text-amber-800 border-amber-200', 
    icon: <Clock className="w-3.5 h-3.5 text-amber-600" /> 
  },
  approved: { 
    label: '承認済み', 
    color: 'bg-emerald-100 text-emerald-800 border-emerald-200', 
    icon: <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> 
  },
  rejected: { 
    label: '却下', 
    color: 'bg-rose-100 text-rose-800 border-rose-200', 
    icon: <XCircle className="w-3.5 h-3.5 text-rose-600" /> 
  },
};

export const GlobalWorkflowDetailModal: React.FC<GlobalWorkflowDetailModalProps> = ({
  isOpen,
  application,
  currentUser,
  allUsers = [],
  onClose,
  onWorkflowAction,
  onUpdateApplication,
  onNavigateToWorkflow,
  onOpenEditModal,
}) => {
  // プレビューモーダル状態
  const [previewFile, setPreviewFile] = useState<AttachmentFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // 却下コメント入力状態
  const [isRejecting, setIsRejecting] = useState(false);
  const [rejectComment, setRejectComment] = useState('');
  const [isSubmittingAction, setIsSubmittingAction] = useState(false);

  useEffect(() => {
    if (application && currentUser?.id) {
      markWorkflowAsRead(currentUser.id, application.id);
    }
    setIsRejecting(false);
    setRejectComment('');
  }, [application?.id, currentUser?.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !isPreviewOpen) {
        onClose();
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isPreviewOpen, onClose]);

  if (!isOpen || !application) return null;

  const typeLabel = typeLabels[application.type] || (application.type === 'general' ? '一般申請' : 'その他');
  const currentStatus = statusConfig[application.status] || statusConfig.pending;

  const isAuthor = application.applicant?.id === currentUser?.id;
  const canApprove = isUserCurrentApprover(application, currentUser, allUsers);

  // 金額のフォーマット
  const formatCurrency = (amount?: number) => {
    if (amount === undefined || amount === null) return '0円';
    return `${Number(amount).toLocaleString()}円`;
  };

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleDateString('ja-JP', { year: 'numeric', month: '2-digit', day: '2-digit' });
  };

  const formatDateTime = (dateStr?: string) => {
    if (!dateStr) return '';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return d.toLocaleString('ja-JP', { 
      year: 'numeric', 
      month: '2-digit', 
      day: '2-digit', 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // 承認実行
  const handleApprove = async () => {
    if (!onWorkflowAction) return;
    setIsSubmittingAction(true);
    try {
      await onWorkflowAction(application.id, 'approved');
      onClose();
    } catch (e) {
      console.error('Approval failed:', e);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // 却下実行
  const handleReject = async () => {
    if (!onWorkflowAction) return;
    setIsSubmittingAction(true);
    try {
      await onWorkflowAction(application.id, 'rejected', rejectComment.trim() || undefined);
      setIsRejecting(false);
      onClose();
    } catch (e) {
      console.error('Rejection failed:', e);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  // 取り下げ実行（下書きに戻す）
  const handleWithdraw = async () => {
    if (!onUpdateApplication) return;
    if (!window.confirm('この申請を取り下げて下書きに戻しますか？')) return;
    setIsSubmittingAction(true);
    try {
      await onUpdateApplication({
        ...application,
        status: 'draft',
      });
      onClose();
    } catch (e) {
      console.error('Withdraw failed:', e);
    } finally {
      setIsSubmittingAction(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-3xl border border-slate-200 shadow-2xl max-w-3xl w-full overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div className="p-5 sm:p-6 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between shrink-0 shadow-md">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="p-2.5 rounded-2xl bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 shrink-0">
              {application.type === 'purchase_order' && <Building2 className="w-5 h-5" />}
              {application.type === 'gold_silver_daily_report' && <Coins className="w-5 h-5 text-amber-400" />}
              {application.type !== 'purchase_order' && application.type !== 'gold_silver_daily_report' && (
                <FileText className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap mb-0.5">
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-white/10 text-indigo-200 border border-white/10">
                  {typeLabel}
                </span>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${currentStatus.color}`}>
                  {currentStatus.icon}
                  <span>{currentStatus.label}</span>
                </span>
                {application.amount !== undefined && application.amount > 0 && (
                  <span className="px-2 py-0.5 rounded-md text-xs font-black bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                    {formatCurrency(application.amount)}
                  </span>
                )}
              </div>
              <h2 className="text-base sm:text-lg font-bold text-white truncate">
                {application.title}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-slate-400 hover:text-white rounded-xl hover:bg-white/10 transition-colors cursor-pointer shrink-0"
            title="閉じる (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* モーダル本文（スクロール可能） */}
        <div className="p-5 sm:p-6 overflow-y-auto space-y-5 flex-1">
          {/* 却下理由のアラート（却下時） */}
          {application.status === 'rejected' && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 shadow-xs">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0">
                  <h4 className="text-sm font-bold text-rose-900">この申請は却下されました</h4>
                  {application.rejectionReason ? (
                    <p className="text-xs text-rose-800 leading-relaxed font-medium bg-white/80 p-3 rounded-xl border border-rose-200/80">
                      {application.rejectionReason}
                    </p>
                  ) : (
                    <p className="text-xs text-rose-700">却下理由のコメントは記入されていません。</p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* 申請者・基本情報カード */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => application.applicant && triggerOpenUserModal(application.applicant)}
                className="group flex items-center gap-2.5 text-left cursor-pointer"
                title="申請者の社員詳細を表示"
              >
                <img
                  src={getAvatarUrl(application.applicant?.avatarUrl)}
                  alt={application.applicant?.name}
                  onError={handleAvatarError}
                  className="w-11 h-11 rounded-full border-2 border-white shadow-xs object-cover group-hover:ring-2 group-hover:ring-indigo-500 transition-all"
                />
                <div>
                  <div className="text-[11px] font-bold text-slate-400">申請者</div>
                  <div className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors flex items-center gap-1">
                    <span>{application.applicant?.name || '未設定'}</span>
                    <span className="text-[10px] text-slate-400 font-normal">
                      ({application.applicant?.office || '全社'} / {application.applicant?.division || '所属'})
                    </span>
                  </div>
                </div>
              </button>
            </div>

            <div className="flex items-center gap-4 text-xs text-slate-500">
              <div>
                <span className="block text-[10px] text-slate-400 font-bold">申請日時</span>
                <span className="font-semibold text-slate-700">{formatDateTime(application.createdAt)}</span>
              </div>
              {application.constructionDate && (
                <div className="pl-4 border-l border-slate-200">
                  <span className="block text-[10px] text-indigo-600 font-bold">工事予定日</span>
                  <span className="font-bold text-indigo-900">{application.constructionDate}</span>
                </div>
              )}
            </div>
          </div>

          {/* 申請内容・説明 */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-slate-700 block">申請概要・内容</label>
            <div className="p-4 rounded-2xl bg-white border border-slate-200 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
              {application.description || '（概要の記載はありません）'}
            </div>
          </div>

          {/* 申請理由（あれば） */}
          {application.reason && (
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700 block">申請理由・目的</label>
              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 text-sm text-slate-800 leading-relaxed whitespace-pre-wrap">
                {application.reason}
              </div>
            </div>
          )}

          {/* 購入申請の詳細情報 */}
          {application.type === 'purchase_request' && (
            <div className="p-4 rounded-2xl bg-indigo-50/50 border border-indigo-100 space-y-3">
              <h4 className="text-xs font-bold text-indigo-950 flex items-center gap-1.5">
                <Store className="w-4 h-4 text-indigo-600" />
                <span>購入手配に関する詳細</span>
              </h4>

              {application.purchasePurpose && (
                <div className="text-xs text-slate-700">
                  <span className="font-bold text-slate-600 block mb-0.5">購入目的:</span>
                  <p className="bg-white p-2.5 rounded-xl border border-indigo-100 font-medium">{application.purchasePurpose}</p>
                </div>
              )}

              <div className="flex flex-wrap items-center gap-2 pt-1 text-xs">
                {application.purchaseTiming === 'urgent' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold bg-rose-100 text-rose-800 border border-rose-200">
                    <Zap className="w-3.5 h-3.5 text-rose-600" />
                    <span>時期: 至急手配</span>
                  </span>
                )}
                {application.purchaseTiming === 'by_date' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-bold bg-indigo-100 text-indigo-900 border border-indigo-200">
                    <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                    <span>期日: {application.purchaseDueDate ? formatDate(application.purchaseDueDate) : '期日指定'} まで</span>
                  </span>
                )}
                {application.purchaseVendor && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium bg-white text-slate-800 border border-slate-200">
                    <Store className="w-3.5 h-3.5 text-slate-500" />
                    <span>購入先: <strong>{application.purchaseVendor}</strong></span>
                  </span>
                )}
                {application.purchaseMethod === 'self' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium bg-emerald-100 text-emerald-800 border border-emerald-200">
                    <CreditCard className="w-3.5 h-3.5 text-emerald-600" />
                    <span>購入方法: <strong>自分で購入</strong></span>
                  </span>
                )}
                {application.purchaseMethod === 'delegate' && (
                  <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg font-medium bg-indigo-100 text-indigo-800 border border-indigo-200">
                    <UserPlus className="w-3.5 h-3.5 text-indigo-600" />
                    <span>購入依頼先: <strong>{application.purchaserDelegateUser?.name || '指定担当者'}</strong></span>
                  </span>
                )}
              </div>
            </div>
          )}

          {/* 金銀日報の詳細情報 */}
          {application.type === 'gold_silver_daily_report' && (
            <div className="p-4 rounded-2xl bg-amber-50/60 border border-amber-200/80 space-y-3">
              <h4 className="text-xs font-bold text-amber-950 flex items-center gap-1.5">
                <Coins className="w-4 h-4 text-amber-600" />
                <span>金銀保有量・日報データ</span>
              </h4>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="p-3 bg-white rounded-xl border border-amber-200">
                  <div className="font-bold text-amber-800 mb-1">【金】の保有量</div>
                  <div>前日: <span className="font-semibold">{application.goldPreviousAmount ?? 0}g</span></div>
                  <div>当日: <span className="font-bold text-amber-700">{application.goldCurrentAmount ?? 0}g</span></div>
                  <div className="text-[11px] text-slate-500 mt-0.5">差分: {((application.goldCurrentAmount ?? 0) - (application.goldPreviousAmount ?? 0)).toFixed(2)}g</div>
                </div>
                <div className="p-3 bg-white rounded-xl border border-slate-200">
                  <div className="font-bold text-slate-800 mb-1">【銀】の保有量</div>
                  <div>前日: <span className="font-semibold">{application.silverPreviousAmount ?? 0}g</span></div>
                  <div>当日: <span className="font-bold text-slate-700">{application.silverCurrentAmount ?? 0}g</span></div>
                  <div className="text-[11px] text-slate-500 mt-0.5">差分: {((application.silverCurrentAmount ?? 0) - (application.silverPreviousAmount ?? 0)).toFixed(2)}g</div>
                </div>
              </div>
            </div>
          )}

          {/* 購入・品目一覧（テーブル表示） */}
          {application.purchaseItems && application.purchaseItems.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-700">申請品目一覧 ({application.purchaseItems.length}件)</label>
                {application.amount !== undefined && (
                  <span className="text-xs font-black text-indigo-700">
                    合計金額: {formatCurrency(application.amount)}
                  </span>
                )}
              </div>
              <div className="border border-slate-200 rounded-2xl overflow-hidden shadow-2xs">
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-slate-600 font-bold border-b border-slate-200">
                        <th className="p-2.5">品目・名称</th>
                        <th className="p-2.5">規格・型番</th>
                        <th className="p-2.5 text-center">数量</th>
                        <th className="p-2.5 text-right">単価</th>
                        <th className="p-2.5 text-right">小計</th>
                        <th className="p-2.5">備考</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 bg-white">
                      {application.purchaseItems.map((item: PurchaseItem, idx: number) => {
                        const itemSubtotal = (item.quantity || 0) * (item.unitPrice || 0);
                        return (
                          <tr key={idx} className="hover:bg-slate-50/80 transition-colors">
                            <td className="p-2.5 font-bold text-slate-800">{item.name}</td>
                            <td className="p-2.5 text-slate-500 font-mono text-[11px]">{item.specification || item.code || '-'}</td>
                            <td className="p-2.5 text-center font-bold text-slate-700">{item.quantity} {item.unit || '個'}</td>
                            <td className="p-2.5 text-right font-medium text-slate-600">{formatCurrency(item.unitPrice)}</td>
                            <td className="p-2.5 text-right font-bold text-indigo-900">{formatCurrency(itemSubtotal)}</td>
                            <td className="p-2.5 text-slate-400 text-[11px]">{item.remark || '-'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* 添付ファイル一覧 */}
          {application.attachments && application.attachments.length > 0 && (
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                <span>添付ファイル ({application.attachments.length}件)</span>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {application.attachments.map((file, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-white transition-all flex items-center justify-between gap-2 shadow-2xs group"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <FileText className="w-4 h-4 text-indigo-600 shrink-0" />
                      <span className="text-xs font-bold text-slate-800 truncate" title={file.name}>
                        {file.name}
                      </span>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          setPreviewFile(file);
                          setIsPreviewOpen(true);
                        }}
                        className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                      >
                        <Eye className="w-3 h-3" />
                        プレビュー
                      </button>
                      <a
                        href={file.url}
                        download={file.name}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                        title="ダウンロード"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* 承認進捗・フロー情報 */}
          <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200/90 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <span>承認ステップ・進捗状況</span>
            </h4>

            {application.stepsConfig && application.stepsConfig.length > 0 ? (
              <div className="space-y-2.5">
                {application.stepsConfig.map((step, idx) => {
                  const stepNum = idx + 1;
                  const currentStepIdx = (application.currentStepIndex || 1) - 1;
                  const isCurrent = application.status === 'pending' && currentStepIdx === idx;
                  const isPast = (application.currentStepIndex || 1) - 1 > idx || application.status === 'approved';
                  const isDuplicate = isDuplicateApproverStep(application.applicant, application.stepsConfig, idx, allUsers);
                  const { user: approverUser, label } = resolveApproverForStepDetails(application.applicant, step, idx, allUsers);

                  // 履歴からこのステップの承認結果を探す
                  const stepHistory = application.history?.find(h => h.stepNumber === stepNum);

                  return (
                    <div
                      key={idx}
                      className={`p-3 rounded-xl border transition-all flex items-center justify-between gap-3 ${
                        isCurrent
                          ? 'bg-amber-50/80 border-amber-300 ring-2 ring-amber-500/20 shadow-xs'
                          : isPast
                          ? 'bg-emerald-50/60 border-emerald-200'
                          : 'bg-white border-slate-200'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${
                            isPast
                              ? 'bg-emerald-600 text-white'
                              : isCurrent
                              ? 'bg-amber-500 text-white animate-pulse'
                              : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {isPast ? <CheckCircle2 className="w-4 h-4" /> : stepNum}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-800 truncate">
                              {step.name || `${stepNum}次承認`}
                            </span>
                            {isCurrent && (
                              <span className="px-1.5 py-0.2 rounded text-[10px] font-black bg-amber-500 text-white">
                                現在の承認ステップ
                              </span>
                            )}
                            {isDuplicate && (
                              <span className="text-[10px] text-slate-400">（自動承認対象）</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 flex items-center gap-1.5 mt-0.5">
                            <img
                              src={getAvatarUrl(approverUser?.avatarUrl)}
                              alt={approverUser?.name}
                              onError={handleAvatarError}
                              className="w-4 h-4 rounded-full border border-slate-200 object-cover"
                            />
                            <span>{approverUser?.name || '承認者未定'}</span>
                            <span className="text-slate-400">({label})</span>
                          </div>
                        </div>
                      </div>

                      <div className="shrink-0 text-right">
                        {stepHistory ? (
                          <div>
                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border ${
                              stepHistory.status === 'approved'
                                ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                                : 'bg-rose-100 text-rose-800 border-rose-300'
                            }`}>
                              {stepHistory.status === 'approved' ? '承認済' : '却下'}
                            </span>
                            {stepHistory.timestamp && (
                              <div className="text-[9px] text-slate-400 mt-0.5">
                                {formatDateTime(stepHistory.timestamp)}
                              </div>
                            )}
                          </div>
                        ) : isCurrent ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 animate-pulse">
                            <Clock className="w-3 h-3" />
                            承認待ち
                          </span>
                        ) : isPast ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300">
                            承認済
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 font-medium">前ステップ待ち</span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              /* 単一承認フローの場合 */
              <div className="p-3 rounded-xl bg-white border border-slate-200 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <img
                    src={getAvatarUrl(application.approver?.avatarUrl)}
                    alt={application.approver?.name}
                    onError={handleAvatarError}
                    className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                  />
                  <div>
                    <span className="text-xs font-bold text-slate-800 block">
                      {application.approver?.name || '承認者未設定'}
                    </span>
                    <span className="text-[10px] text-slate-400">担当承認者</span>
                  </div>
                </div>
                <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold border ${currentStatus.color}`}>
                  {currentStatus.icon}
                  <span>{currentStatus.label}</span>
                </span>
              </div>
            )}

            {/* 承認履歴リスト */}
            {application.history && application.history.length > 0 && (
              <div className="pt-2 border-t border-slate-200/80 space-y-1.5">
                <span className="text-[11px] font-bold text-slate-500 block">承認ログ・履歴</span>
                <div className="space-y-1.5">
                  {application.history.map((h, hIdx) => (
                    <div key={hIdx} className="p-2.5 rounded-xl bg-white border border-slate-200 text-xs flex items-start justify-between gap-2">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">{h.approver?.name || '承認者'}</span>
                          <span className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                            h.status === 'approved' ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                          }`}>
                            {h.status === 'approved' ? '承認' : '却下'}
                          </span>
                        </div>
                        {h.comment && (
                          <p className="text-slate-600 font-medium mt-0.5 bg-slate-50 p-1.5 rounded-lg border border-slate-100">
                            {h.comment}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-slate-400 whitespace-nowrap">
                        {formatDateTime(h.timestamp)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* 却下コメント入力エリア (承認者が却下を選択時) */}
          {isRejecting && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 space-y-3 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="flex items-center gap-2 text-rose-800 font-bold text-xs">
                <ShieldAlert className="w-4 h-4 text-rose-600" />
                <span>却下理由を入力してください（申請者に通知されます）</span>
              </div>
              <textarea
                value={rejectComment}
                onChange={(e) => setRejectComment(e.target.value)}
                placeholder="却下の理由、再提出に必要な修正事項などを入力してください..."
                className="w-full h-24 p-3 text-xs bg-white border border-rose-300 rounded-xl focus:ring-2 focus:ring-rose-500 focus:outline-none"
              />
              <div className="flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsRejecting(false);
                    setRejectComment('');
                  }}
                  className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="button"
                  onClick={handleReject}
                  disabled={isSubmittingAction}
                  className="px-4 py-1.5 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4" />
                  <span>却下を確定する</span>
                </button>
              </div>
            </div>
          )}
        </div>

        {/* モーダルフッター（アクションボタン） */}
        <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            {onNavigateToWorkflow && (
              <button
                type="button"
                onClick={() => onNavigateToWorkflow(application.id)}
                className="px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors border border-indigo-200 flex items-center gap-1.5 cursor-pointer"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                <span>ワークフロー画面で開く</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {/* 申請者用アクション */}
            {isAuthor && application.status === 'pending' && onUpdateApplication && (
              <button
                type="button"
                onClick={handleWithdraw}
                disabled={isSubmittingAction}
                className="px-3.5 py-2 text-xs font-bold text-slate-700 bg-white hover:bg-slate-100 rounded-xl transition-colors border border-slate-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw className="w-3.5 h-3.5 text-slate-500" />
                <span>取り下げる</span>
              </button>
            )}

            {isAuthor && (application.status === 'draft' || application.status === 'rejected') && onOpenEditModal && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenEditModal(application);
                }}
                className="px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-xl transition-colors border border-indigo-200 flex items-center gap-1.5 cursor-pointer"
              >
                <Edit3 className="w-3.5 h-3.5 text-indigo-600" />
                <span>編集して再申請</span>
              </button>
            )}

            {/* 承認者用アクション（承認・却下） */}
            {canApprove && !isRejecting && (
              <>
                <button
                  type="button"
                  onClick={() => setIsRejecting(true)}
                  disabled={isSubmittingAction}
                  className="px-3.5 py-2 text-xs font-bold text-rose-700 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors border border-rose-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <XCircle className="w-4 h-4 text-rose-600" />
                  <span>却下する</span>
                </button>
                <button
                  type="button"
                  onClick={handleApprove}
                  disabled={isSubmittingAction}
                  className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>承認する</span>
                </button>
              </>
            )}

            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 bg-white hover:bg-slate-100 rounded-xl transition-colors border border-slate-200 cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>

      {/* ファイルプレビューモーダル */}
      {previewFile && (
        <FilePreviewModal
          isOpen={isPreviewOpen}
          onClose={() => setIsPreviewOpen(false)}
          file={previewFile}
        />
      )}
    </div>
  );
};
