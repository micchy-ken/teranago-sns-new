import React, { useState, useMemo } from 'react';
import { DailyReport, User, WorkReportStatus, CalendarEvent } from '../types';
import { 
  FileText, 
  Plus, 
  Calendar, 
  X, 
  Save, 
  Send, 
  CheckCircle2, 
  Clock, 
  UserCheck, 
  Building2, 
  Search, 
  Edit3, 
  Trash2, 
  AlertCircle,
  Lightbulb,
  ArrowRight,
  Bookmark,
  TrendingUp,
  Briefcase,
  ShieldCheck,
  Users,
  Info,
  Copy,
  Wrench,
  Sparkles,
  ChevronRight
} from 'lucide-react';
import { getAvatarUrl } from '../utils/avatar';
import { MaintenanceDailyReportView } from './MaintenanceDailyReport';

interface DailyReportProps {
  reports: DailyReport[];
  calendarEvents?: CalendarEvent[];
  onAddReport?: (reportData: any) => Promise<void> | void;
  onUpdateReport?: (id: string, reportData: Partial<DailyReport>) => Promise<void> | void;
  onReviewReport?: (id: string, feedbackComment?: string) => Promise<void> | void;
  onDeleteReport?: (id: string) => Promise<void> | void;
  currentUser: User;
  allUsers?: User[];
  divisions?: { id: string; name: string }[];
  refetchReports?: () => Promise<void> | void;
}

// ヘルパー: 指定日の週の月曜日（YYYY-MM-DD）を取得
function getMonday(d: Date): string {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(date.setDate(diff));
  return monday.toISOString().split('T')[0];
}

// ヘルパー: 月曜日から「YYYY年M月D日週 (M/D〜M/D)」表記を生成
function formatWeekLabel(mondayStr: string): string {
  if (!mondayStr) return '';
  const monday = new Date(mondayStr);
  const friday = new Date(monday);
  friday.setDate(monday.getDate() + 4);

  const y = monday.getFullYear();
  const m = monday.getMonth() + 1;
  const d = monday.getDate();
  const fm = friday.getMonth() + 1;
  const fd = friday.getDate();

  return `${y}年${m}月${d}日週 (${m}/${d}〜${fm}/${fd})`;
}

// 基準となる週のリスト（現在および過去・未来数週間）
function generateRecentWeeks(baseDateStr: string = '2026-08-17'): { start: string; label: string }[] {
  const base = new Date(baseDateStr);
  const baseMonday = new Date(getMonday(base));
  const weeks = [];

  for (let i = -4; i <= 4; i++) {
    const w = new Date(baseMonday);
    w.setDate(baseMonday.getDate() + (i * 7));
    const mondayStr = w.toISOString().split('T')[0];
    weeks.push({
      start: mondayStr,
      label: formatWeekLabel(mondayStr)
    });
  }
  return weeks;
}

export function DailyReportView({ 
  reports = [], 
  calendarEvents = [],
  onAddReport, 
  onUpdateReport, 
  onReviewReport, 
  onDeleteReport, 
  currentUser,
  allUsers = [],
  divisions = []
}: DailyReportProps) {
  // モード切り替え: 'weekly' (週報) | 'maintenance' (保守日報)
  const [reportMode, setReportMode] = useState<'weekly' | 'maintenance'>(() => {
    const isMaintenanceUser = 
      (currentUser.department && currentUser.department.includes('保守')) || 
      (currentUser.division && currentUser.division.includes('保守'));
    return isMaintenanceUser ? 'maintenance' : 'weekly';
  });

  // 保守日報編集・表示用ステート
  const [activeMaintenanceReport, setActiveMaintenanceReport] = useState<DailyReport | null>(null);
  const [isEditingMaintenance, setIsEditingMaintenance] = useState<boolean>(false);

  // フィルタタブ: 'all' (自分+部下) | 'my' (自分) | 'subordinates' (部下) | 'pending_review' (自分宛て未確認)
  const [activeFilter, setActiveFilter] = useState<'all' | 'my' | 'subordinates' | 'pending_review'>('all');
  const [selectedWeek, setSelectedWeek] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // モーダル状態
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingReportId, setEditingReportId] = useState<string | null>(null);

  // フォームステート (週報専用)
  const [formWeekStart, setFormWeekStart] = useState<string>('2026-08-17');
  const [formDepartment, setFormDepartment] = useState<string>(currentUser.department || currentUser.division || '総務');
  const [formSupervisorId, setFormSupervisorId] = useState<string>(currentUser.supervisorId || '');
  const [formTasks, setFormTasks] = useState<string>('');
  const [formResults, setFormResults] = useState<string>('');
  const [formIssues, setFormIssues] = useState<string>('');
  const [formOngoingProjects, setFormOngoingProjects] = useState<string>('');
  const [formTomorrowPlan, setFormTomorrowPlan] = useState<string>('');

  // 上長レビューモーダル
  const [reviewingReport, setReviewingReport] = useState<DailyReport | null>(null);
  const [reviewFeedback, setReviewFeedback] = useState<string>('');
  const [isSubmittingReview, setIsSubmittingReview] = useState<boolean>(false);

  // 削除確認モーダル
  const [deletingReport, setDeletingReport] = useState<DailyReport | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // 上長候補リスト (自分以外のユーザー)
  const supervisorCandidates = useMemo(() => {
    return allUsers.filter(u => u.id !== currentUser.id);
  }, [allUsers, currentUser.id]);

  // 週の選択肢
  const weekOptions = useMemo(() => {
    return generateRecentWeeks('2026-08-17');
  }, []);

  // 【厳格な可視性ルール】週報は基本的に「自分」と「自分の部下」のものしか見えない
  const accessibleWeeklyReports = useMemo(() => {
    return reports.filter(report => {
      if (report.reportType === 'maintenance_daily') return false;
      const authorId = report.author?.id || (report as any).authorId;
      const supervisorId = report.supervisorId || report.supervisor?.id || (report.author as any)?.supervisorId;
      
      const isMine = authorId === currentUser.id;
      const isMySubordinate = supervisorId === currentUser.id;

      // 自分自身または自分が上長として指定されている部下の週報のみ
      return isMine || isMySubordinate;
    });
  }, [reports, currentUser.id]);

  // 保守日報リストの抽出
  const accessibleMaintenanceReports = useMemo(() => {
    return reports.filter(report => {
      if (report.reportType !== 'maintenance_daily') return false;
      const authorId = report.author?.id || (report as any).authorId;
      const supervisorId = report.supervisorId || report.supervisor?.id || (report.author as any)?.supervisorId;
      const isMine = authorId === currentUser.id;
      const isMySubordinate = supervisorId === currentUser.id;
      const isMaintenanceDept = (currentUser.department || currentUser.division || '').includes('保守');
      return isMine || isMySubordinate || isMaintenanceDept;
    });
  }, [reports, currentUser.id, currentUser.department, currentUser.division]);

  // 自分宛の承認待ち件数
  const pendingReviewCount = useMemo(() => {
    return accessibleWeeklyReports.filter(r => {
      const supervisorId = r.supervisorId || r.supervisor?.id;
      return supervisorId === currentUser.id && r.status === 'submitted';
    }).length;
  }, [accessibleWeeklyReports, currentUser.id]);

  // フィルタリング適用後の週報リスト
  const filteredReports = useMemo(() => {
    return accessibleWeeklyReports.filter(report => {
      const authorId = report.author?.id || (report as any).authorId;
      const supervisorId = report.supervisorId || report.supervisor?.id;
      const isMine = authorId === currentUser.id;
      const isSubordinate = supervisorId === currentUser.id;

      // 1. タブフィルタ
      if (activeFilter === 'my' && !isMine) return false;
      if (activeFilter === 'subordinates' && !isSubordinate) return false;
      if (activeFilter === 'pending_review' && (!isSubordinate || report.status !== 'submitted')) return false;

      // 2. 週フィルタ
      if (selectedWeek !== 'all') {
        const repWeek = report.weekStartDate || (report.weekLabel ? report.weekLabel : '');
        if (!repWeek.includes(selectedWeek)) return false;
      }

      // 3. 検索キーワード
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const authorName = (report.author?.name || (report as any).authorName || '').toLowerCase();
        const tasks = (report.tasks || '').toLowerCase();
        const results = (report.results || '').toLowerCase();
        const issues = (report.issues || '').toLowerCase();
        const ongoing = (report.ongoingProjects || '').toLowerCase();
        const week = (report.weekLabel || '').toLowerCase();
        const dept = (report.department || '').toLowerCase();
        if (
          !authorName.includes(q) &&
          !tasks.includes(q) &&
          !results.includes(q) &&
          !issues.includes(q) &&
          !ongoing.includes(q) &&
          !week.includes(q) &&
          !dept.includes(q)
        ) {
          return false;
        }
      }

      return true;
    });
  }, [accessibleWeeklyReports, activeFilter, selectedWeek, searchQuery, currentUser.id]);

  // 新規週報作成モーダルオープン
  const handleOpenCreateModal = () => {
    setEditingReportId(null);
    setFormWeekStart(getMonday(new Date()));
    setFormDepartment(currentUser.department || currentUser.division || '総務');
    setFormSupervisorId(currentUser.supervisorId || (supervisorCandidates[0]?.id || ''));
    setFormTasks('');
    setFormResults('');
    setFormIssues('');
    setFormOngoingProjects('');
    setFormTomorrowPlan('');
    setIsModalOpen(true);
  };

  // 編集モーダルオープン
  const handleOpenEditModal = (report: DailyReport) => {
    setEditingReportId(report.id);
    setFormWeekStart(report.weekStartDate || getMonday(new Date()));
    setFormDepartment(report.department || report.author?.department || currentUser.department || '総務');
    setFormSupervisorId(report.supervisorId || report.supervisor?.id || '');
    setFormTasks(report.tasks || '');
    setFormResults(report.results || '');
    setFormIssues(report.issues || '');
    setFormOngoingProjects(report.ongoingProjects || '');
    setFormTomorrowPlan(report.tomorrowPlan || '');
    setIsModalOpen(true);
  };

  // 週報を元にコピーして新規作成
  const handleDuplicateReport = (report: DailyReport) => {
    setEditingReportId(null); // 新規作成として扱う
    setFormWeekStart(getMonday(new Date()));
    setFormDepartment(report.department || report.author?.department || currentUser.department || '総務');
    setFormSupervisorId(report.supervisorId || report.supervisor?.id || '');
    setFormTasks(report.tasks || '');
    setFormResults(report.results || '');
    setFormIssues(report.issues || '');
    setFormOngoingProjects(report.ongoingProjects || '');
    setFormTomorrowPlan(report.tomorrowPlan || '');
    setIsModalOpen(true);
  };

  // フォーム送信処理 (下書き上書き / コピーを保存 / 提出)
  const handleSaveReport = async (submitStatus: WorkReportStatus, asCopy: boolean = false) => {
    if (!formTasks.trim()) {
      alert('「今週の業務内容」は必須入力です。');
      return;
    }

    const payload = {
      reportType: 'weekly' as const,
      weekStartDate: formWeekStart,
      weekLabel: formatWeekLabel(formWeekStart),
      department: formDepartment,
      tasks: formTasks,
      results: formResults,
      issues: formIssues,
      ongoingProjects: formOngoingProjects,
      tomorrowPlan: formTomorrowPlan,
      supervisorId: formSupervisorId || undefined,
      status: submitStatus,
    };

    if (editingReportId && !asCopy && onUpdateReport) {
      // 既存の週報を上書き保存
      await onUpdateReport(editingReportId, payload);
    } else if (onAddReport) {
      // 新規保存、または「コピーを保存」として新規作成
      await onAddReport(payload);
    }

    setIsModalOpen(false);
  };

  // 上長レビュー実行
  const handleExecuteReview = async () => {
    if (!reviewingReport || !onReviewReport) return;
    setIsSubmittingReview(true);
    try {
      await onReviewReport(reviewingReport.id, reviewFeedback);
      setReviewingReport(null);
      setReviewFeedback('');
    } catch (err) {
      console.error('Review error:', err);
    } finally {
      setIsSubmittingReview(false);
    }
  };

  // 保守日報の編集画面表示ハンドラ
  if (reportMode === 'maintenance' && isEditingMaintenance) {
    return (
      <MaintenanceDailyReportView
        report={activeMaintenanceReport}
        currentUser={currentUser}
        allUsers={allUsers}
        calendarEvents={calendarEvents}
        onSaveReport={async (reportData) => {
          if (activeMaintenanceReport?.id && onUpdateReport) {
            await onUpdateReport(activeMaintenanceReport.id, reportData);
          } else if (onAddReport) {
            await onAddReport(reportData);
          }
          setIsEditingMaintenance(false);
          setActiveMaintenanceReport(null);
        }}
        onReviewReport={async (id, comment) => {
          if (onReviewReport) {
            await onReviewReport(id, comment);
          }
          setIsEditingMaintenance(false);
          setActiveMaintenanceReport(null);
        }}
        onBack={() => {
          setIsEditingMaintenance(false);
          setActiveMaintenanceReport(null);
        }}
      />
    );
  }

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-8rem)]">
      {/* Header Bar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50 shrink-0">
        {/* レポート種類切り替えタブ (週報 ↔ 保守日報) */}
        <div className="flex items-center gap-2 mb-3 bg-slate-200/80 p-1 rounded-xl w-fit">
          <button
            onClick={() => setReportMode('weekly')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              reportMode === 'weekly'
                ? 'bg-white text-indigo-700 shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <FileText className="w-4 h-4 text-indigo-600" />
            週報 (全社・営業・総務)
          </button>
          <button
            onClick={() => setReportMode('maintenance')}
            className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
              reportMode === 'maintenance'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Wrench className="w-4 h-4 text-amber-100" />
            保守日報 (平日月〜金・保守部)
          </button>
        </div>

        {reportMode === 'maintenance' ? (
          /* 保守日報 一覧ヘッダー */
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-white shadow-sm shadow-amber-200">
                  <Wrench className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    平日（月～金）保守日報
                    <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                      保守部署専用
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    スケジュール連動・Excel再現デザインによる現場作業・点検・取替・点数自動集計
                  </p>
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => {
                  setActiveMaintenanceReport(null);
                  setIsEditingMaintenance(true);
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs sm:text-sm font-bold rounded-lg transition-colors shadow-sm shadow-amber-200 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                新規 保守日報を作成
              </button>
            </div>
          </div>
        ) : (
          /* 週報 ヘッダー */
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-sm shadow-indigo-200">
                  <FileText className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                    週報
                    <span className="text-xs font-medium px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/60 flex items-center gap-1">
                      <ShieldCheck className="w-3 h-3 text-indigo-600" />
                      自分・部下限定公開
                    </span>
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    今週の業務内容・成果・気づき・課題・継続案件をまとめ、上長へ報告・確認を行います
                  </p>
                </div>
              </div>
            </div>

            {/* Action Button */}
            <div className="flex items-center gap-2 shrink-0">
              <button 
                onClick={handleOpenCreateModal}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs sm:text-sm font-semibold rounded-lg transition-colors shadow-sm shadow-indigo-100 cursor-pointer"
                title="2026年8月17日週などの週報を作成します"
              >
                <Plus className="w-4 h-4" />
                週報を作成
              </button>
            </div>
          </div>
        )}

        {/* Filter Navigation Tabs */}
        <div className="mt-4 pt-4 border-t border-slate-200/80 flex flex-wrap items-center justify-between gap-3">
          {/* Main Category Tabs */}
          <div className="flex items-center gap-1 bg-slate-200/70 p-1 rounded-xl">
            <button
              onClick={() => setActiveFilter('all')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeFilter === 'all' 
                  ? 'bg-white text-indigo-700 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              すべて ({accessibleWeeklyReports.length})
            </button>
            <button
              onClick={() => setActiveFilter('my')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                activeFilter === 'my' 
                  ? 'bg-white text-indigo-700 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              自分の週報
            </button>
            <button
              onClick={() => setActiveFilter('subordinates')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeFilter === 'subordinates' 
                  ? 'bg-white text-indigo-700 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              部下の週報
            </button>
            <button
              onClick={() => setActiveFilter('pending_review')}
              className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                activeFilter === 'pending_review' 
                  ? 'bg-amber-500 text-white shadow-xs' 
                  : 'text-slate-700 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              未確認
              {pendingReviewCount > 0 && (
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                  activeFilter === 'pending_review' ? 'bg-white text-amber-600' : 'bg-amber-500 text-white'
                }`}>
                  {pendingReviewCount}
                </span>
              )}
            </button>
          </div>

          {/* Sub Controls (Week Selector & Search) */}
          <div className="flex items-center gap-2 flex-1 max-w-md justify-end">
            <div className="flex items-center gap-1.5 bg-white px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <select 
                value={selectedWeek}
                onChange={e => setSelectedWeek(e.target.value)}
                className="bg-transparent font-medium text-slate-700 focus:outline-none cursor-pointer"
              >
                <option value="all">すべての週</option>
                {weekOptions.map(w => (
                  <option key={w.start} value={w.start}>{w.label}</option>
                ))}
              </select>
            </div>

            <div className="relative flex-1 min-w-[140px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="週報内容や氏名で検索..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>
        </div>
      </div>

      {/* Reports List Feed */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
        <div className="max-w-4xl mx-auto space-y-6">
          {reportMode === 'maintenance' ? (
            /* ================= 保守日報リスト表示 ================= */
            accessibleMaintenanceReports.length === 0 ? (
              <div className="text-center py-16 bg-white border border-amber-200/80 rounded-2xl p-8 shadow-xs">
                <div className="w-14 h-14 rounded-full bg-amber-50 text-amber-600 flex items-center justify-center mx-auto mb-3 shadow-xs">
                  <Wrench className="w-7 h-7" />
                </div>
                <h3 className="text-base font-bold text-slate-800">保守日報のデータがありません</h3>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                  当日の修理・保守・取替スケジュールを取得し、Excel風画面で手入力を極力抑えた保守専用の日報を作成できます。
                </p>
                <div className="flex items-center justify-center gap-3 mt-5">
                  <button
                    onClick={() => {
                      setActiveMaintenanceReport(null);
                      setIsEditingMaintenance(true);
                    }}
                    className="px-5 py-2.5 bg-amber-500 text-white text-xs font-bold rounded-xl hover:bg-amber-600 transition-all shadow-sm shadow-amber-200 cursor-pointer flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    新規 保守日報を作成する
                  </button>
                </div>
              </div>
            ) : (
              accessibleMaintenanceReports.map(mReport => {
                const mData = mReport.maintenanceData;
                const authorName = mReport.author?.name || '作成者未設定';

                return (
                  <div
                    key={mReport.id}
                    className="bg-white border border-slate-200 hover:border-amber-300 rounded-2xl overflow-hidden shadow-xs transition-all p-5 space-y-4"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 font-bold flex items-center justify-center text-xs">
                          <Wrench className="w-5 h-5 text-amber-600" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-bold text-slate-900">
                              {mReport.date || '日付未設定'} 日報
                            </span>
                            <span
                              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                mReport.status === 'reviewed'
                                  ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                                  : mReport.status === 'submitted'
                                  ? 'bg-amber-100 text-amber-800 border border-amber-200'
                                  : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}
                            >
                              {mReport.status === 'reviewed'
                                ? '確認済'
                                : mReport.status === 'submitted'
                                ? '提出済（確認待ち）'
                                : '下書き'}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            担当者: <strong className="text-slate-800 font-semibold">{authorName}</strong>
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => {
                            setActiveMaintenanceReport(mReport);
                            setIsEditingMaintenance(true);
                          }}
                          className="px-3 py-1.5 bg-amber-50 text-amber-800 border border-amber-200 hover:bg-amber-100 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          開く・編集
                        </button>
                        {onDeleteReport && (
                          <button
                            onClick={() => onDeleteReport(mReport.id)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                            title="削除"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 日報サマリー数値 */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-amber-50/50 p-3 rounded-xl border border-amber-100 text-xs">
                      <div>
                        <span className="text-slate-500 text-[11px] block">当日数値合計:</span>
                        <strong className="text-amber-800 text-sm font-extrabold">
                          {mData?.dailyTotalValue ? `${mData.dailyTotalValue} pt` : '未算出'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">合計時間:</span>
                        <strong className="text-slate-800 text-sm font-bold">
                          {mData?.totalHours || '0:00'}
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">対象現場数:</span>
                        <strong className="text-slate-800 text-sm font-bold">
                          {mData?.mainWorkRows?.filter(r => r.siteName).length || 0} 件
                        </strong>
                      </div>
                      <div>
                        <span className="text-slate-500 text-[11px] block">当月累計:</span>
                        <strong className="text-amber-900 text-sm font-extrabold">
                          {mData?.monthlyTotalValue ? `${mData.monthlyTotalValue.toLocaleString()} pt` : '24,391 pt'}
                        </strong>
                      </div>
                    </div>

                    {/* 作業タスクの抜粋 */}
                    {mReport.tasks && (
                      <div className="text-xs text-slate-600 whitespace-pre-wrap bg-slate-50 p-3 rounded-lg border border-slate-200/80">
                        {mReport.tasks}
                      </div>
                    )}
                  </div>
                );
              })
            )
          ) : (
            /* ================= 週報リスト表示 ================= */
            filteredReports.length === 0 ? (
            <div className="text-center py-16 bg-white border border-slate-200 rounded-2xl p-8 shadow-xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">表示できる週報がありません</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto leading-relaxed">
                週報は「自分」および「自分の部下（あなたが報告先上長に指定されている部下）」の週報のみ表示されます。
                右上の「週報を作成」ボタンから今週の業務報告を登録・提出できます。
              </p>
              <div className="flex items-center justify-center gap-3 mt-5">
                <button
                  onClick={handleOpenCreateModal}
                  className="px-4 py-2 bg-indigo-600 text-white text-xs font-semibold rounded-lg hover:bg-indigo-700 transition-colors cursor-pointer"
                >
                  週報を作成する
                </button>
              </div>
            </div>
          ) : (
            filteredReports.map(report => {
              const isAuthor = (report.author?.id || (report as any).authorId) === currentUser.id;
              const isAssignedSupervisor = (report.supervisorId || report.supervisor?.id) === currentUser.id;
              const isPendingMyReview = isAssignedSupervisor && report.status === 'submitted';

              return (
                <div 
                  key={report.id} 
                  className={`bg-white border rounded-2xl overflow-hidden shadow-xs transition-all ${
                    isPendingMyReview 
                      ? 'border-amber-300 ring-2 ring-amber-100 shadow-md' 
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
                >
                  {/* Card Header */}
                  <div className="px-5 py-4 border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 bg-slate-50/80">
                    <div className="flex items-center gap-3">
                      <img 
                        src={getAvatarUrl(report.author?.avatarUrl)} 
                        alt={report.author?.name || (report as any).authorName} 
                        className="w-10 h-10 rounded-full border border-slate-200 object-cover shadow-xs" 
                      />
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-bold text-slate-900">
                            {report.author?.name || (report as any).authorName || '氏名未設定'}
                          </span>
                          
                          {/* Department Badge */}
                          <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-slate-100 text-slate-600 border border-slate-200">
                            {report.department || report.author?.department || '全社'}
                          </span>

                          {isAuthor && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 border border-indigo-200">
                              本人
                            </span>
                          )}
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                          <span>{report.author?.office || ''} {report.author?.position || ''}</span>
                          {(report.supervisor || (report as any).supervisorName) && (
                            <span className="flex items-center gap-1 text-slate-400">
                              <ArrowRight className="w-3 h-3" />
                              上長: <strong className="text-slate-600 font-semibold">{report.supervisor?.name || (report as any).supervisorName}</strong>
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Period / Date Badge & Status */}
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-xs">
                        <Calendar className="w-3.5 h-3.5 text-indigo-500" />
                        {report.weekLabel || (report.weekStartDate ? `${report.weekStartDate}週` : '週報')}
                      </div>

                      {/* Status Badge */}
                      {report.status === 'reviewed' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          確認済
                        </span>
                      ) : report.status === 'submitted' ? (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="w-3.5 h-3.5 text-amber-500" />
                          確認待ち
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-slate-100 text-slate-600 border border-slate-200">
                          下書き
                        </span>
                      )}

                      {/* Author Edit/Copy/Delete Actions */}
                      {isAuthor && report.status !== 'reviewed' && (
                        <button
                          onClick={() => handleOpenEditModal(report)}
                          className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="編集する"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                      )}
                      {isAuthor && (
                        <button
                          onClick={() => handleDuplicateReport(report)}
                          className="p-1.5 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors cursor-pointer"
                          title="この週報を元にコピーして新規作成"
                        >
                          <Copy className="w-4 h-4" />
                        </button>
                      )}
                      {(isAuthor || currentUser.isAdmin) && onDeleteReport && (
                        <button
                          onClick={() => setDeletingReport(report)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="削除する"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Card Content Grid */}
                  <div className="p-5 sm:p-6 space-y-5">
                    {/* 1. 今週の業務内容 */}
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <Briefcase className="w-4 h-4 text-indigo-600" />
                        <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                          今週の業務内容
                        </h4>
                      </div>
                      <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed bg-slate-50/80 p-4 rounded-xl border border-slate-200/70 font-sans">
                        {report.tasks || '業務内容の記載なし'}
                      </div>
                    </div>

                    {/* 2. 成果・気づき & 課題・問題点 (2カラムグリッド) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Lightbulb className="w-4 h-4 text-emerald-600" />
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            成果・気づき
                          </h4>
                        </div>
                        <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed bg-emerald-50/40 p-3.5 rounded-xl border border-emerald-200/60 min-h-[72px]">
                          {report.results || '特になし'}
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <AlertCircle className="w-4 h-4 text-rose-600" />
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            課題・問題点
                          </h4>
                        </div>
                        <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed bg-rose-50/40 p-3.5 rounded-xl border border-rose-200/60 min-h-[72px]">
                          {report.issues || '特になし'}
                        </div>
                      </div>
                    </div>

                    {/* 3. 継続案件 & 来週の予定 (2カラムグリッド) */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {/* 継続案件 */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <Bookmark className="w-4 h-4 text-sky-600" />
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            継続案件
                          </h4>
                        </div>
                        <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed bg-sky-50/40 p-3.5 rounded-xl border border-sky-200/60 min-h-[64px]">
                          {report.ongoingProjects || '特になし'}
                        </div>
                      </div>

                      {/* 来週の予定 */}
                      <div>
                        <div className="flex items-center gap-2 mb-2">
                          <TrendingUp className="w-4 h-4 text-violet-600" />
                          <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                            来週の予定
                          </h4>
                        </div>
                        <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed bg-violet-50/40 p-3.5 rounded-xl border border-violet-200/60 min-h-[64px]">
                          {report.tomorrowPlan || '特になし'}
                        </div>
                      </div>
                    </div>

                    {/* 上長確認・フィードバック欄 */}
                    {report.status === 'reviewed' && report.feedbackComment && (
                      <div className="mt-4 p-4 bg-emerald-50/60 border border-emerald-200 rounded-xl">
                        <div className="flex items-center gap-2 mb-1.5">
                          <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                          <span className="text-xs font-bold text-emerald-900">
                            上長フィードバック・確認済
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

                    {/* 上長確認アクションボタン (要確認の場合) */}
                    {isPendingMyReview && (
                      <div className="mt-4 p-4 bg-amber-50/80 border border-amber-200 rounded-xl flex items-center justify-between gap-4">
                        <div className="flex items-center gap-2 text-amber-900 text-xs font-medium">
                          <UserCheck className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>部下から提出された週報です。確認とコメントを行ってください。</span>
                        </div>
                        <button
                          onClick={() => {
                            setReviewingReport(report);
                            setReviewFeedback('');
                          }}
                          className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs shrink-0 flex items-center gap-1.5 cursor-pointer"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                          確認・コメントする
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ))}
        </div>
      </div>

      {/* Creation & Edit Modal (週報専用) */}
      {isModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh]">
            {/* Modal Header */}
            <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {editingReportId ? '週報の編集' : '新規 週報の作成'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    今週の業務成果や課題、継続案件をまとめ、上長へ報告・提出します
                  </p>
                </div>
              </div>
              <button 
                onClick={() => setIsModalOpen(false)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <div className="p-6 overflow-y-auto space-y-5">
              {/* Meta Selector Grid (対象週・部署) */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-200">
                {/* 1. 対象週 */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    対象週 <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formWeekStart}
                    onChange={e => setFormWeekStart(e.target.value)}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                  >
                    {weekOptions.map(w => (
                      <option key={w.start} value={w.start}>
                        {w.label}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. 所属部署 */}
                <div>
                  <label className="block text-xs font-bold text-slate-600 mb-1">
                    部署 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formDepartment}
                    onChange={e => setFormDepartment(e.target.value)}
                    placeholder="例: 総務、営業、保守、工務"
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-semibold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  />
                </div>
              </div>

              {/* 報告先上長選択 */}
              <div className="bg-indigo-50/50 p-4 rounded-xl border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <UserCheck className="w-5 h-5 text-indigo-600" />
                  <div>
                    <div className="text-xs font-bold text-indigo-950">報告先上長</div>
                    <div className="text-[11px] text-indigo-600">提出時に選択した上司へ通知が届き、確認・フィードバックが行われます</div>
                  </div>
                </div>
                <select
                  value={formSupervisorId}
                  onChange={e => setFormSupervisorId(e.target.value)}
                  className="px-3 py-2 bg-white border border-indigo-200 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 min-w-[200px] cursor-pointer"
                >
                  <option value="">（上長を選択）</option>
                  {supervisorCandidates.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.department || u.division || '所属'} / {u.position || '役職なし'})
                    </option>
                  ))}
                </select>
              </div>

              {/* 1. 今週の業務内容 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
                  <span>今週の業務内容 <span className="text-rose-500">*</span></span>
                  <span className="text-[11px] text-slate-400 font-normal">箇条書きで実施事項・進捗を記入</span>
                </label>
                <textarea 
                  rows={4} 
                  value={formTasks} 
                  onChange={e => setFormTasks(e.target.value)} 
                  placeholder="・〇〇案件の提案書作成および顧客訪問&#10;・定期点検スケジューラーの確認・調整（3件）&#10;・全社月次報告資料のとりまとめ" 
                  required
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm font-sans"
                />
              </div>

              {/* 2. 成果・気づき & 課題・問題点 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    成果・気づき
                  </label>
                  <textarea 
                    rows={3} 
                    value={formResults} 
                    onChange={e => setFormResults(e.target.value)} 
                    placeholder="今週得られた成果、改善点、工夫したポイントなど" 
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    課題・問題点
                  </label>
                  <textarea 
                    rows={3} 
                    value={formIssues} 
                    onChange={e => setFormIssues(e.target.value)} 
                    placeholder="直面している課題、上長のサポートが必要な事項など" 
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>

              {/* 3. 継続案件 & 来週の予定 */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    継続案件
                  </label>
                  <textarea 
                    rows={2} 
                    value={formOngoingProjects} 
                    onChange={e => setFormOngoingProjects(e.target.value)} 
                    placeholder="進行中のプロジェクトや来週以降も続く継続タスク" 
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1.5">
                    来週の予定
                  </label>
                  <textarea 
                    rows={2} 
                    value={formTomorrowPlan} 
                    onChange={e => setFormTomorrowPlan(e.target.value)} 
                    placeholder="来週予定している主要なタスクや目標" 
                    className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 text-sm"
                  />
                </div>
              </div>
            </div>

            {/* Modal Actions */}
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <button 
                type="button" 
                onClick={() => setIsModalOpen(false)} 
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs sm:text-sm font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
              >
                キャンセル
              </button>

              <div className="flex flex-wrap items-center gap-2.5">
                {editingReportId && (
                  <button 
                    type="button" 
                    onClick={() => handleSaveReport('draft', true)}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 border border-amber-300 text-amber-900 rounded-lg text-xs sm:text-sm font-semibold hover:bg-amber-100 transition-colors shadow-xs cursor-pointer"
                    title="現在の入力内容をもとに、別の新しい下書きとして複製保存します"
                  >
                    <Copy className="w-4 h-4 text-amber-700" />
                    コピーを保存
                  </button>
                )}
                <button 
                  type="button" 
                  onClick={() => handleSaveReport('draft', false)}
                  className="flex items-center gap-1.5 px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-lg text-xs sm:text-sm font-semibold hover:bg-slate-50 transition-colors shadow-xs cursor-pointer"
                  title={editingReportId ? "現在の週報を上書き保存します" : "下書きとして新規保存します"}
                >
                  <Save className="w-4 h-4 text-slate-500" />
                  下書き保存
                </button>
                <button 
                  type="button" 
                  onClick={() => handleSaveReport('submitted', false)}
                  className="flex items-center gap-1.5 px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs sm:text-sm font-bold transition-colors shadow-sm shadow-indigo-200 cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  上長に提出
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Review Modal for Supervisor */}
      {reviewingReport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-lg shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-amber-50 border-b border-amber-200 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserCheck className="w-5 h-5 text-amber-600" />
                <h3 className="font-bold text-amber-950 text-base">
                  週報の確認とフィードバック
                </h3>
              </div>
              <button 
                onClick={() => setReviewingReport(null)} 
                className="text-amber-800/60 hover:text-amber-950 p-1 rounded-lg hover:bg-amber-100 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4">
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs space-y-1">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">提出者:</span>
                  <span className="font-bold text-slate-800">{reviewingReport.author?.name || (reviewingReport as any).authorName} ({reviewingReport.department || reviewingReport.author?.department})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500">対象週:</span>
                  <span className="font-bold text-slate-800">{reviewingReport.weekLabel || reviewingReport.weekStartDate}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  上長コメント・指示事項 (任意)
                </label>
                <textarea
                  rows={4}
                  value={reviewFeedback}
                  onChange={e => setReviewFeedback(e.target.value)}
                  placeholder="労いの言葉や指示事項、アドバイスを入力してください（提出者へ通知されます）"
                  className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-sm font-sans"
                />
              </div>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button 
                type="button" 
                onClick={() => setReviewingReport(null)} 
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 cursor-pointer"
              >
                キャンセル
              </button>
              <button 
                type="button" 
                disabled={isSubmittingReview}
                onClick={handleExecuteReview}
                className="flex items-center gap-1.5 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-colors shadow-xs cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                {isSubmittingReview ? '送信中...' : '確認済にして返信する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingReport && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl w-full max-w-md shadow-2xl border border-slate-200 overflow-hidden flex flex-col">
            <div className="px-6 py-4 bg-rose-50 border-b border-rose-100 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-rose-600 flex items-center justify-center text-white">
                  <Trash2 className="w-4 h-4" />
                </div>
                <h3 className="font-bold text-rose-950 text-base">
                  週報の削除確認
                </h3>
              </div>
              <button 
                onClick={() => setDeletingReport(null)} 
                className="text-slate-400 hover:text-slate-600 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-3">
              <p className="text-sm font-semibold text-slate-800">
                この週報を削除してもよろしいですか？
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-600 space-y-1">
                <div><span className="font-semibold text-slate-500">対象週:</span> {deletingReport.weekLabel || deletingReport.weekStartDate || '週報'}</div>
                <div><span className="font-semibold text-slate-500">投稿者:</span> {deletingReport.author?.name || (deletingReport as any).authorName || '不明'}</div>
                <div className="line-clamp-2 text-slate-500 mt-1"><span className="font-semibold text-slate-500">内容:</span> {deletingReport.tasks}</div>
              </div>
              <p className="text-xs text-rose-600 font-medium">
                ※この操作は取り消せません。サーバーおよび画面から完全に消去されます。
              </p>
            </div>

            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-3">
              <button 
                type="button" 
                onClick={() => setDeletingReport(null)} 
                className="px-4 py-2 border border-slate-300 text-slate-700 rounded-lg text-xs font-semibold hover:bg-slate-100 transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button 
                type="button" 
                disabled={isDeleting}
                onClick={async () => {
                  if (!onDeleteReport || !deletingReport) return;
                  setIsDeleting(true);
                  try {
                    await onDeleteReport(deletingReport.id);
                  } catch (err) {
                    console.error('Delete error:', err);
                  } finally {
                    setIsDeleting(false);
                    setDeletingReport(null);
                  }
                }}
                className="flex items-center gap-1.5 px-5 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-colors shadow-sm shadow-rose-200 cursor-pointer"
              >
                <Trash2 className="w-4 h-4" />
                {isDeleting ? '削除中...' : '削除する'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
