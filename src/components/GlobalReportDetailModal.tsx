import React, { useState, useEffect } from 'react';
import { DailyReport, User } from '../types';
import { 
  FileText, 
  X, 
  CheckCircle2, 
  Edit3, 
  UserCheck, 
  Briefcase, 
  Lightbulb, 
  AlertCircle, 
  Bookmark, 
  TrendingUp, 
  ExternalLink,
  Wrench,
  Clock
} from 'lucide-react';
import { markReportAsRead } from '../utils/notifications';
import { triggerOpenUserModal } from '../utils/userModal';

interface GlobalReportDetailModalProps {
  report: DailyReport | null;
  currentUser: User;
  allUsers?: User[];
  onClose: () => void;
  onReviewReport?: (id: string, feedbackComment?: string) => Promise<void> | void;
  onNavigateToEdit?: (reportId: string) => void;
  onOpenFullTab?: (reportId: string) => void;
}

export const GlobalReportDetailModal: React.FC<GlobalReportDetailModalProps> = ({
  report,
  currentUser,
  allUsers = [],
  onClose,
  onReviewReport,
  onNavigateToEdit,
  onOpenFullTab
}) => {
  const [feedbackInput, setFeedbackInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (report && currentUser?.id) {
      markReportAsRead(currentUser.id, report.id);
      setFeedbackInput(report.feedbackComment || '');
    }
  }, [report, currentUser?.id]);

  if (!report) return null;

  const isAuthor = (report.author?.id || (report as any).authorId) === currentUser.id;
  const isSupervisor = (report.supervisorId || report.supervisor?.id) === currentUser.id || currentUser.isAdmin;
  const isWeekly = report.reportType === 'weekly';
  const isMaintenance = report.reportType === 'maintenance_daily';
  
  const typeLabel = isMaintenance 
    ? '保守日報' 
    : (report.reportType === 'sales_daily' 
      ? '営業日報' 
      : (report.reportType === 'construction_daily' 
        ? '工務日報' 
        : (isWeekly ? '週報' : '日報')));

  const title = report.weekLabel || (isWeekly ? `週報 (${report.weekStartDate || ''}~)` : `${typeLabel} (${report.date || ''})`);
  const supervisorName = report.supervisor?.name || (allUsers.find(u => u.id === report.supervisorId)?.name) || '指定なし';

  const handleReview = async () => {
    if (!onReviewReport) return;
    setIsSubmitting(true);
    try {
      await onReviewReport(report.id, feedbackInput);
      onClose();
    } catch (err) {
      console.error('Review submission error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white shadow-xs ${
              isMaintenance ? 'bg-amber-600' : (isWeekly ? 'bg-indigo-600' : 'bg-teal-600')
            }`}>
              {isMaintenance ? <Wrench className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-900 text-base">{title}</h3>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  isMaintenance 
                    ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                    : 'bg-indigo-100 text-indigo-800 border border-indigo-300'
                }`}>
                  {typeLabel}
                </span>
                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                  report.status === 'reviewed'
                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                    : report.status === 'draft'
                    ? 'bg-slate-100 text-slate-700 border border-slate-200'
                    : 'bg-amber-100 text-amber-800 border border-amber-200'
                }`}>
                  {report.status === 'reviewed' ? '確認済' : report.status === 'draft' ? '下書き' : '確認待ち'}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                作成者:{' '}
                <button
                  type="button"
                  onClick={() => report.author && triggerOpenUserModal(report.author)}
                  className="text-slate-800 font-bold hover:text-indigo-600 cursor-pointer underline transition-colors"
                  title="プロフィールを表示"
                >
                  {report.author?.name || (report as any).authorName || '不明'}
                </button>
                {report.department ? ` (${report.department})` : ''}
              </p>
            </div>
          </div>
          <button 
            onClick={onClose} 
            className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {/* Meta Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
            <div>
              <span className="text-slate-500 block text-[11px]">提出・登録日時:</span>
              <span className="font-bold text-slate-800">
                {report.submittedAt || report.createdAt ? new Date(report.submittedAt || report.createdAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未提出'}
              </span>
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">報告先上長:</span>
              {report.supervisor ? (
                <button
                  type="button"
                  onClick={() => report.supervisor && triggerOpenUserModal(report.supervisor)}
                  className="font-bold text-indigo-900 hover:text-indigo-600 cursor-pointer underline transition-colors"
                  title="プロフィールを表示"
                >
                  {supervisorName}
                </button>
              ) : (
                <span className="font-bold text-indigo-900">{supervisorName}</span>
              )}
            </div>
            <div>
              <span className="text-slate-500 block text-[11px]">確認日時:</span>
              <span className="font-bold text-emerald-800">
                {report.reviewedAt ? new Date(report.reviewedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '未確認'}
              </span>
            </div>
          </div>

          {/* 今週/本日の業務内容 */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <Briefcase className="w-4 h-4 text-indigo-600" />
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                {isWeekly ? '今週の業務内容' : '本日の業務内容'}
              </h4>
            </div>
            <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50/80 p-4 rounded-xl border border-slate-200/70 font-sans">
              {report.tasks || (report as any).content || (report as any).summary || '記載なし'}
            </div>
          </div>

          {/* 保守日報・障害対応等の特定項目 */}
          {isMaintenance && (
            <div className="space-y-4">
              {(report as any).systemName && (
                <div>
                  <span className="text-xs font-bold text-slate-500 block mb-1">対象システム/設備:</span>
                  <div className="text-sm text-slate-800 bg-amber-50/40 p-3 rounded-xl border border-amber-200/60 font-medium">
                    {(report as any).systemName}
                  </div>
                </div>
              )}
              {(report as any).incidentDetails && (
                <div>
                  <span className="text-xs font-bold text-rose-700 block mb-1">障害・インシデント詳細:</span>
                  <div className="text-sm text-slate-800 bg-rose-50/40 p-3 rounded-xl border border-rose-200/60 whitespace-pre-wrap">
                    {(report as any).incidentDetails}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 成果・気づき & 課題・問題点 */}
          {(report.results || report.issues) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.results && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Lightbulb className="w-4 h-4 text-emerald-600" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      成果・気づき
                    </h4>
                  </div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed bg-emerald-50/40 p-3.5 rounded-xl border border-emerald-200/60 min-h-[64px]">
                    {report.results}
                  </div>
                </div>
              )}

              {report.issues && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      課題・問題点
                    </h4>
                  </div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed bg-rose-50/40 p-3.5 rounded-xl border border-rose-200/60 min-h-[64px]">
                    {report.issues}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 継続案件 & 来週/明日の予定 */}
          {(report.ongoingProjects || report.tomorrowPlan) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {report.ongoingProjects && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <Bookmark className="w-4 h-4 text-sky-600" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      継続案件
                    </h4>
                  </div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed bg-sky-50/40 p-3.5 rounded-xl border border-sky-200/60 min-h-[56px]">
                    {report.ongoingProjects}
                  </div>
                </div>
              )}

              {report.tomorrowPlan && (
                <div>
                  <div className="flex items-center gap-2 mb-2">
                    <TrendingUp className="w-4 h-4 text-violet-600" />
                    <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                      {isWeekly ? '来週の予定' : '明日の予定'}
                    </h4>
                  </div>
                  <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed bg-violet-50/40 p-3.5 rounded-xl border border-violet-200/60 min-h-[56px]">
                    {report.tomorrowPlan}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* 既存の上長フィードバック */}
          {report.feedbackComment && (
            <div className="p-4 bg-emerald-50/70 border border-emerald-200 rounded-xl">
              <div className="flex items-center gap-2 mb-1.5">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                <span className="text-xs font-bold text-emerald-900">
                  上長フィードバック・確認コメント
                </span>
                {report.reviewedAt && (
                  <span className="text-[10px] text-emerald-600 font-medium ml-auto">
                    {new Date(report.reviewedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </span>
                )}
              </div>
              <div className="text-sm text-emerald-950 whitespace-pre-wrap leading-relaxed">
                {report.feedbackComment}
              </div>
            </div>
          )}

          {/* 上長コメント入力フォーム (上長かつ確認待ちの場合) */}
          {isSupervisor && report.status === 'submitted' && onReviewReport && (
            <div className="p-4 bg-amber-50/70 border border-amber-200 rounded-xl space-y-3">
              <div className="flex items-center gap-2 text-amber-950 font-bold text-xs">
                <UserCheck className="w-4 h-4 text-amber-600" />
                <span>上長確認・コメント入力</span>
              </div>
              <textarea
                value={feedbackInput}
                onChange={(e) => setFeedbackInput(e.target.value)}
                placeholder="確認コメントや指導・アドバイスを入力（任意）"
                rows={3}
                className="w-full text-xs p-3 border border-amber-300 rounded-lg focus:ring-2 focus:ring-amber-500 bg-white"
              />
              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={handleReview}
                  disabled={isSubmitting}
                  className="flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:opacity-50"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  {isSubmitting ? '処理中...' : '確認済にして返信する'}
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs sm:text-sm font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
          >
            閉じる
          </button>

          <div className="flex items-center gap-2.5">
            {isAuthor && onNavigateToEdit && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onNavigateToEdit(report.id);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs sm:text-sm font-bold transition-colors shadow-xs cursor-pointer"
              >
                <Edit3 className="w-4 h-4" />
                編集する
              </button>
            )}

            {onOpenFullTab && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenFullTab(report.id);
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs sm:text-sm font-semibold hover:bg-slate-100 transition-colors shadow-xs cursor-pointer"
              >
                <ExternalLink className="w-4 h-4 text-slate-500" />
                日報・週報一覧で見る
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
