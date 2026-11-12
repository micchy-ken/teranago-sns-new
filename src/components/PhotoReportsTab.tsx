import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Camera,
  Plus,
  Search,
  Filter,
  Calendar,
  Building2,
  MapPin,
  Wrench,
  Link2,
  AlertCircle,
  Edit3,
  Printer,
  Trash2,
  CheckCircle2,
  Clock,
  Layers,
  RefreshCw,
  X,
  Copy,
  UserCheck,
  Users,
  Eye,
  FileCheck2,
  ChevronRight
} from 'lucide-react';
import { User, CalendarEvent } from '../types';
import { InspectionPhotoReport, PhotoReportItem } from '../types/photoReport';
import { InspectionReportRecord } from '../types/inspectionReport';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import { API_BASE_URL } from '../config/api';
import { InspectionPhotoReportModal } from './inspection/InspectionPhotoReportModal';
import { triggerOpenUserModal } from '../utils/userModal';

interface PhotoReportsTabProps {
  currentUser: User;
  allUsers?: User[];
  events?: CalendarEvent[];
}

type ScopeFilter = 'mine' | 'all';
type StatusFilter = 'all' | 'completed' | 'draft' | 'linked' | 'unlinked';
type SortKey = 'newest' | 'oldest' | 'workDate' | 'building';

export const PhotoReportsTab: React.FC<PhotoReportsTabProps> = ({
  currentUser,
  allUsers = [],
  events = [],
}) => {
  // レポート一覧 & 読み込み状態
  const [reports, setReports] = useState<InspectionPhotoReport[]>([]);
  const [inspectionReports, setInspectionReports] = useState<InspectionReportRecord[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // フィルター・検索状態 (デフォルトは「自分が作成した報告書」)
  const [scopeFilter, setScopeFilter] = useState<ScopeFilter>('mine');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [sortKey, setSortKey] = useState<SortKey>('newest');
  const [visiblePhotoCount, setVisiblePhotoCount] = useState<number>(24);

  useEffect(() => {
    setVisiblePhotoCount(24);
  }, [scopeFilter, statusFilter, searchQuery, sortKey]);

  // モーダル操作ステート
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [modalMode, setModalMode] = useState<'edit' | 'preview'>('edit');
  const [selectedReport, setSelectedReport] = useState<InspectionPhotoReport | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });

  // トースト通知
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // 写真報告書一覧の取得
  const fetchReports = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setIsRefreshing(true);
    setFetchError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/photo-reports`);
      if (!res.ok) {
        throw new Error(`写真報告書の取得に失敗しました (${res.status})`);
      }
      const data: InspectionPhotoReport[] = await res.json();
      setReports(Array.isArray(data) ? data : []);
    } catch (err: any) {
      console.error('写真報告書取得エラー:', err);
      setFetchError(err.message || 'データ取得中にエラーが発生しました');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  // 連動用点検報告書一覧の取得（バックグラウンドで取得）
  const fetchInspectionReports = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/inspection-reports`);
      if (res.ok) {
        const data = await res.json();
        setInspectionReports(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      // オプションのため失敗してもエラー表示はしない
      console.warn('点検報告書一覧取得失敗 (フォールバック継続):', err);
    }
  }, []);

  useEffect(() => {
    fetchReports();
    fetchInspectionReports();
  }, [fetchReports, fetchInspectionReports]);

  // 新規作成モーダルを開く
  const handleOpenCreateModal = () => {
    setSelectedReport(null);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  // 編集モーダルを開く
  const handleOpenEdit = (report: InspectionPhotoReport) => {
    setSelectedReport(report);
    setModalMode('edit');
    setIsModalOpen(true);
  };

  // プレビュー/印刷モーダルを開く
  const handleOpenPreview = (report: InspectionPhotoReport) => {
    setSelectedReport(report);
    setModalMode('preview');
    setIsModalOpen(true);
  };

  // 複製して新規作成
  const handleDuplicate = (report: InspectionPhotoReport, e: React.MouseEvent) => {
    e.stopPropagation();
    const duplicated: InspectionPhotoReport = {
      ...report,
      id: '',
      title: `${report.buildingName || ''} 写真報告書（コピー）`,
      status: 'draft',
      createdById: currentUser.id,
      createdByName: currentUser.name,
      createdAt: '',
      updatedAt: '',
      // 写真はそのまま流用しIDを再採番
      photos: (report.photos || []).map((p, idx) => ({
        ...p,
        id: `p_${Date.now()}_${idx + 1}`,
      })),
    };
    setSelectedReport(duplicated);
    setModalMode('edit');
    setIsModalOpen(true);
    showToast('既存の写真報告書から内容を複製しました');
  };

  // 保存完了コールバック
  const handleSaved = (savedReport: InspectionPhotoReport) => {
    setReports(prev => {
      const idx = prev.findIndex(r => r.id === savedReport.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = savedReport;
        return next;
      }
      return [savedReport, ...prev];
    });
    showToast('写真報告書を保存しました');
  };

  // 削除ハンドラー
  const handleDelete = (reportId: string, title: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setConfirmModal({
      isOpen: true,
      title: '写真報告書の削除',
      message: `「${title || '写真報告書'}」を削除してもよろしいですか？\n※この操作は取り消せません。`,
      confirmText: '削除する',
      cancelText: 'キャンセル',
      type: 'danger',
      onConfirm: async () => {
        try {
          setDeletingId(reportId);
          const res = await fetch(`${API_BASE_URL}/photo-reports/${reportId}`, {
            method: 'DELETE',
          });
          if (res.ok) {
            setReports(prev => prev.filter(r => r.id !== reportId));
            showToast('写真報告書を削除しました');
          } else {
            alert('写真報告書の削除に失敗しました');
          }
        } catch (err) {
          console.error('写真報告書削除エラー:', err);
          alert('通信エラーにより削除できませんでした');
        } finally {
          setDeletingId(null);
        }
      }
    });
  };

  // 統計カウンター計算
  const stats = useMemo(() => {
    const myReports = reports.filter(r => String(r.createdById) === String(currentUser.id));
    const total = reports.length;
    const completed = reports.filter(r => r.status !== 'draft').length;
    const draft = reports.filter(r => r.status === 'draft').length;
    const linked = reports.filter(r => !!(r.inspectionReportId || (r.jobNo && r.jobNo.trim()))).length;
    return {
      total,
      myTotal: myReports.length,
      completed,
      draft,
      linked,
    };
  }, [reports, currentUser.id]);

  // フィルタリング ＆ ソート
  const filteredReports = useMemo(() => {
    let list = [...reports];

    // 1. スコープフィルター (自分が作成したもの vs 全体)
    if (scopeFilter === 'mine') {
      list = list.filter(r => String(r.createdById) === String(currentUser.id));
    }

    // 2. ステータス・紐付けフィルター
    if (statusFilter === 'completed') {
      list = list.filter(r => r.status !== 'draft');
    } else if (statusFilter === 'draft') {
      list = list.filter(r => r.status === 'draft');
    } else if (statusFilter === 'linked') {
      list = list.filter(r => !!(r.inspectionReportId || (r.jobNo && r.jobNo.trim())));
    } else if (statusFilter === 'unlinked') {
      list = list.filter(r => !(r.inspectionReportId || (r.jobNo && r.jobNo.trim())));
    }

    // 3. 検索キーワードフィルター
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r => {
        const title = (r.title || '').toLowerCase();
        const bName = (r.buildingName || '').toLowerCase();
        const cName = (r.customerName || '').toLowerCase();
        const loc = (r.location || '').toLowerCase();
        const subj = (r.workSubject || '').toLowerCase();
        const job = (r.jobNo || '').toLowerCase();
        const author = (r.createdByName || '').toLowerCase();
        const date = (r.workDate || '').toLowerCase();
        return (
          title.includes(q) ||
          bName.includes(q) ||
          cName.includes(q) ||
          loc.includes(q) ||
          subj.includes(q) ||
          job.includes(q) ||
          author.includes(q) ||
          date.includes(q)
        );
      });
    }

    // 4. ソート
    list.sort((a, b) => {
      if (sortKey === 'newest') {
        return new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime();
      }
      if (sortKey === 'oldest') {
        return new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime();
      }
      if (sortKey === 'workDate') {
        return (b.workDate || '').localeCompare(a.workDate || '');
      }
      if (sortKey === 'building') {
        return (a.buildingName || '').localeCompare(b.buildingName || '');
      }
      return 0;
    });

    return list;
  }, [reports, scopeFilter, statusFilter, searchQuery, sortKey, currentUser.id]);

  return (
    <div className="flex-1 w-full min-w-0 max-w-7xl mx-auto space-y-3.5 sm:space-y-6 pb-16 overflow-x-hidden">
      {/* トースト通知 */}
      {toastMessage && (
        <div className="fixed bottom-4 right-4 left-4 sm:left-auto sm:bottom-6 sm:right-6 z-50 bg-slate-900 text-white text-xs font-bold px-4 py-3 sm:py-2.5 rounded-xl shadow-xl flex items-center justify-center sm:justify-start gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* ページヘッダー */}
      <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200/90 p-3.5 sm:p-6 shadow-xs overflow-hidden">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4 min-w-0">
          <div className="flex items-start gap-2.5 sm:gap-4 min-w-0">
            <div className="w-9 h-9 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-gradient-to-br from-indigo-500 to-indigo-700 text-white flex items-center justify-center shadow-md shrink-0">
              <Camera className="w-4 h-4 sm:w-6 sm:h-6" />
            </div>
            <div className="space-y-1 min-w-0 flex-1">
              <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                <span className="text-[10px] sm:text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-md border border-indigo-200 whitespace-nowrap">
                  ユーティリティー
                </span>
                <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0 hidden sm:inline" />
                <h1 className="text-base sm:text-2xl font-black text-slate-900 tracking-tight whitespace-nowrap">
                  写真報告書
                </h1>
                <span className="text-[10px] sm:text-xs px-2 sm:px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 font-extrabold border border-slate-200 whitespace-nowrap tabular-nums">
                  {scopeFilter === 'mine' ? `自分の報告書 ${stats.myTotal}件` : `全社 ${stats.total}件`}
                </span>
              </div>
              <p className="text-[11px] sm:text-xs text-slate-500 leading-relaxed break-words">
                現場で撮影した写真（2〜4枚構成）を整理・報告書化。点検報告書No連携やA4印刷・PDF出力に対応しています。
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto shrink-0 min-w-0">
            <button
              type="button"
              onClick={() => fetchReports(true)}
              disabled={isRefreshing}
              className="p-2.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl border border-slate-200 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
              title="最新の一覧に更新"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            </button>

            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="flex-1 sm:flex-initial min-w-0 flex items-center justify-center gap-1.5 sm:gap-2 px-3.5 sm:px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-indigo-700 hover:from-indigo-500 hover:to-indigo-600 text-white text-xs font-bold rounded-xl shadow-md hover:shadow-lg transition-all cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4 shrink-0" />
              <span className="truncate">新規写真報告書を作成</span>
            </button>
          </div>
        </div>

        {/* クイック統計カード */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mt-3.5 sm:mt-5 pt-3.5 sm:pt-5 border-t border-slate-100 min-w-0">
          <div
            onClick={() => {
              setScopeFilter('mine');
              setStatusFilter('all');
            }}
            className={`min-w-0 p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer overflow-hidden ${
              scopeFilter === 'mine' && statusFilter === 'all'
                ? 'bg-indigo-50/70 border-indigo-300 ring-1 ring-indigo-200'
                : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between gap-1 text-slate-500 text-[10px] sm:text-[11px] font-semibold mb-1 min-w-0">
              <span className="flex items-center gap-1 whitespace-nowrap truncate min-w-0">
                <UserCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span className="truncate">自分の報告書</span>
              </span>
              <span className="hidden sm:inline-block text-[10px] font-bold text-indigo-600 bg-indigo-100/70 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                作成者
              </span>
            </div>
            <div className="text-base sm:text-xl font-black text-slate-800 tabular-nums">
              {stats.myTotal}
              <span className="text-[11px] sm:text-xs font-bold text-slate-400 ml-1">件</span>
            </div>
          </div>

          <div
            onClick={() => setStatusFilter('completed')}
            className={`min-w-0 p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer overflow-hidden ${
              statusFilter === 'completed'
                ? 'bg-emerald-50/70 border-emerald-300 ring-1 ring-emerald-200'
                : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between gap-1 text-slate-500 text-[10px] sm:text-[11px] font-semibold mb-1 min-w-0">
              <span className="flex items-center gap-1 whitespace-nowrap truncate min-w-0">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="truncate">確定保存済</span>
              </span>
              <span className="hidden sm:inline-block text-[10px] font-bold text-emerald-700 bg-emerald-100/70 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                完了
              </span>
            </div>
            <div className="text-base sm:text-xl font-black text-slate-800 tabular-nums">
              {stats.completed}
              <span className="text-[11px] sm:text-xs font-bold text-slate-400 ml-1">件</span>
            </div>
          </div>

          <div
            onClick={() => setStatusFilter('draft')}
            className={`min-w-0 p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer overflow-hidden ${
              statusFilter === 'draft'
                ? 'bg-amber-50/70 border-amber-300 ring-1 ring-amber-200'
                : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between gap-1 text-slate-500 text-[10px] sm:text-[11px] font-semibold mb-1 min-w-0">
              <span className="flex items-center gap-1 whitespace-nowrap truncate min-w-0">
                <Clock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="truncate">下書き</span>
              </span>
              <span className="hidden sm:inline-block text-[10px] font-bold text-amber-700 bg-amber-100/70 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                編集中
              </span>
            </div>
            <div className="text-base sm:text-xl font-black text-slate-800 tabular-nums">
              {stats.draft}
              <span className="text-[11px] sm:text-xs font-bold text-slate-400 ml-1">件</span>
            </div>
          </div>

          <div
            onClick={() => setStatusFilter('linked')}
            className={`min-w-0 p-2.5 sm:p-3 rounded-xl border transition-all cursor-pointer overflow-hidden ${
              statusFilter === 'linked'
                ? 'bg-purple-50/70 border-purple-300 ring-1 ring-purple-200'
                : 'bg-slate-50/60 border-slate-200/80 hover:bg-slate-100/70'
            }`}
          >
            <div className="flex items-center justify-between gap-1 text-slate-500 text-[10px] sm:text-[11px] font-semibold mb-1 min-w-0">
              <span className="flex items-center gap-1 whitespace-nowrap truncate min-w-0">
                <Link2 className="w-3.5 h-3.5 text-purple-600 shrink-0" />
                <span className="truncate">点検No連携済</span>
              </span>
              <span className="hidden sm:inline-block text-[10px] font-bold text-purple-700 bg-purple-100/70 px-1.5 py-0.5 rounded whitespace-nowrap shrink-0">
                紐づけ
              </span>
            </div>
            <div className="text-base sm:text-xl font-black text-slate-800 tabular-nums">
              {stats.linked}
              <span className="text-[11px] sm:text-xs font-bold text-slate-400 ml-1">件</span>
            </div>
          </div>
        </div>
      </div>

      {/* コントロール・フィルターバー */}
      <div className="w-full min-w-0 bg-white rounded-2xl border border-slate-200/90 p-3 sm:p-4 space-y-2.5 sm:space-y-3.5 shadow-xs overflow-hidden">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5 sm:gap-3 min-w-0">
          {/* スコープ切替 (自分が作成した報告書 / 全社の報告書) */}
          <div className="grid grid-cols-2 sm:flex items-center p-1 bg-slate-100 rounded-xl text-xs font-bold border border-slate-200/80 w-full sm:w-auto min-w-0">
            <button
              type="button"
              onClick={() => setScopeFilter('mine')}
              className={`min-w-0 flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-2 sm:py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                scopeFilter === 'mine'
                  ? 'bg-white text-indigo-700 shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
              <span className="sm:hidden truncate">自分の報告書</span>
              <span className="hidden sm:inline">自分が作成した写真報告書</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full tabular-nums shrink-0 ${scopeFilter === 'mine' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-600'}`}>
                {stats.myTotal}
              </span>
            </button>

            <button
              type="button"
              onClick={() => setScopeFilter('all')}
              className={`min-w-0 flex items-center justify-center gap-1 sm:gap-1.5 px-2 sm:px-3.5 py-2 sm:py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap ${
                scopeFilter === 'all'
                  ? 'bg-white text-indigo-700 shadow-xs font-extrabold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="sm:hidden truncate">全社の報告書</span>
              <span className="hidden sm:inline">全社・全メンバーの報告書</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full tabular-nums shrink-0 ${scopeFilter === 'all' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-600'}`}>
                {stats.total}
              </span>
            </button>
          </div>

          {/* 検索ボックス & ソート */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-2.5 flex-1 lg:max-w-xl min-w-0 w-full">
            <div className="relative flex-1 min-w-0">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="現場名・件名・顧客名・取付場所・Noで検索..."
                className="w-full min-w-0 pl-9 pr-8 py-2 bg-slate-50 hover:bg-white focus:bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <select
              value={sortKey}
              onChange={e => setSortKey(e.target.value as SortKey)}
              aria-label="並び順"
              className="w-full sm:w-auto px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-bold text-slate-700 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 shrink-0 cursor-pointer"
            >
              <option value="newest">作成日 (最新順)</option>
              <option value="oldest">作成日 (古い順)</option>
              <option value="workDate">実施日順</option>
              <option value="building">現場名順</option>
            </select>
          </div>
        </div>

        {/* ステータス絞り込みタブ */}
        <div className="flex items-center gap-1 overflow-x-auto w-full min-w-0 bg-slate-100/80 p-1 rounded-xl text-xs font-bold border border-slate-200/60">
          <button
            type="button"
            onClick={() => setStatusFilter('all')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 ${
              statusFilter === 'all'
                ? 'bg-slate-800 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white/70'
            }`}
          >
            すべて
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('completed')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
              statusFilter === 'completed'
                ? 'bg-emerald-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white/70'
            }`}
          >
            <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
            <span>確定済</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('draft')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
              statusFilter === 'draft'
                ? 'bg-amber-500 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white/70'
            }`}
          >
            <Clock className="w-3.5 h-3.5 shrink-0" />
            <span>下書き</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('linked')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
              statusFilter === 'linked'
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white/70'
            }`}
          >
            <Link2 className="w-3.5 h-3.5 shrink-0" />
            <span>点検No紐づけ済</span>
          </button>
          <button
            type="button"
            onClick={() => setStatusFilter('unlinked')}
            className={`px-3 py-1.5 rounded-lg transition-all cursor-pointer whitespace-nowrap shrink-0 flex items-center gap-1 ${
              statusFilter === 'unlinked'
                ? 'bg-slate-600 text-white shadow-xs'
                : 'text-slate-600 hover:bg-white/70'
            }`}
          >
            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
            <span>親No未設定</span>
          </button>

          {(searchQuery || statusFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setStatusFilter('all');
              }}
              className="ml-auto text-[11px] text-indigo-600 hover:text-indigo-800 underline font-bold px-2 py-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              解除
            </button>
          )}
        </div>
      </div>

      {/* エラー表示 */}
      {fetchError && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0" />
            <span>{fetchError}</span>
          </div>
          <button
            type="button"
            onClick={() => fetchReports()}
            className="px-3 py-1 bg-rose-600 text-white rounded-lg font-bold hover:bg-rose-700 transition-colors cursor-pointer shrink-0"
          >
            再試行
          </button>
        </div>
      )}

      {/* 写真報告書カードグリッド */}
      {isLoading ? (
        <div className="py-20 text-center space-y-3 bg-white rounded-2xl border border-slate-200">
          <div className="w-10 h-10 mx-auto border-3 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          <p className="text-xs text-slate-500 font-bold">写真報告書を読み込み中...</p>
        </div>
      ) : filteredReports.length === 0 ? (
        <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center space-y-4 shadow-xs">
          <div className="w-16 h-16 mx-auto rounded-3xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-xs">
            <Camera className="w-8 h-8" />
          </div>
          <div className="space-y-1.5 max-w-md mx-auto">
            <h3 className="text-base font-bold text-slate-800">
              {scopeFilter === 'mine' ? '自分が作成した写真報告書がありません' : '写真報告書が見つかりません'}
            </h3>
            <p className="text-xs text-slate-500 leading-relaxed">
              {searchQuery || statusFilter !== 'all'
                ? '検索キーワードまたはステータスフィルターを変更してお試しください。'
                : scopeFilter === 'mine'
                ? '現場の写真を整理して、取替前・取替後のきれいな写真報告書（2〜4枚構成）を作成できます。'
                : 'まだ登録されている写真報告書がありません。'}
            </p>
          </div>
          <div className="pt-2">
            <button
              type="button"
              onClick={handleOpenCreateModal}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>新規写真報告書を作成する</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-5 w-full min-w-0">
            {filteredReports.slice(0, visiblePhotoCount).map(rep => {
            const isMine = String(rep.createdById) === String(currentUser.id);
            const isDraft = rep.status === 'draft';
            const isLinked = !!(rep.inspectionReportId || (rep.jobNo && rep.jobNo.trim()));
            const photos = Array.isArray(rep.photos) ? rep.photos : [];
            const photosWithImage = photos.filter(p => p.imageUrl && p.imageUrl.trim());
            const layoutLabel =
              rep.layoutType === '2_items' ? '2枚構成' : rep.layoutType === '4_items' ? '4枚構成' : '3枚構成';

            // 紐づく点検報告書レコード（もしあれば）
            const matchedInspection = inspectionReports.find(
              ir => ir.id === rep.inspectionReportId || (rep.jobNo && ir.jobNo === rep.jobNo)
            );

            return (
              <div
                key={rep.id}
                onClick={() => handleOpenEdit(rep)}
                className="w-full min-w-0 bg-white rounded-2xl border border-slate-200 hover:border-indigo-400 hover:shadow-lg transition-all flex flex-col justify-between overflow-hidden group cursor-pointer"
              >
                {/* カード上部：写真サムネイルプレビュー帯 */}
                <div className="bg-slate-900 p-2.5 sm:p-3 relative">
                  <div className="grid grid-cols-3 gap-1.5 h-24 sm:h-32">
                    {(photos.length > 0 ? photos.slice(0, 3) : [null, null, null]).map((photo, pIdx) => {
                      const item = photo as PhotoReportItem | null;
                      return (
                        <div
                          key={pIdx}
                          className="relative bg-slate-800 rounded-lg overflow-hidden border border-slate-700/80 flex items-center justify-center group/photo min-w-0"
                        >
                          {item && item.imageUrl ? (
                            <>
                              <img
                                src={item.imageUrl}
                                alt={item.stageTitle || `写真${pIdx + 1}`}
                                className="w-full h-full object-cover group-hover/photo:scale-105 transition-transform duration-300"
                                loading="lazy"
                              />
                              {item.stageTitle && (
                                <span className="absolute bottom-1 left-1 right-1 bg-slate-900/80 backdrop-blur-xs text-[9px] font-bold text-white px-1 py-0.5 rounded text-center truncate">
                                  {item.stageTitle}
                                </span>
                              )}
                            </>
                          ) : (
                            <div className="text-center p-2 text-slate-500">
                              <Camera className="w-4 h-4 mx-auto mb-1 opacity-50" />
                              <span className="text-[9px] block">未登録</span>
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  {/* 枚数カウントオーバーレイ */}
                  <div className="absolute top-3.5 right-3.5 sm:top-4 sm:right-4 flex items-center gap-1.5">
                    <span className="bg-slate-900/85 backdrop-blur-xs text-white text-[10px] font-extrabold px-2 py-0.5 rounded-full border border-slate-700/80 flex items-center gap-1 shadow-xs whitespace-nowrap tabular-nums">
                      <Camera className="w-3 h-3 text-indigo-400 shrink-0" />
                      <span>{photosWithImage.length} / {photos.length}枚</span>
                    </span>
                  </div>
                </div>

                {/* カード本文 */}
                <div className="p-3.5 sm:p-5 flex-1 flex flex-col justify-between space-y-3 sm:space-y-3.5 min-w-0">
                  <div className="space-y-2.5 min-w-0">
                    {/* バッジ行 */}
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {isDraft ? (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-amber-50 text-amber-700 border border-amber-300 flex items-center gap-1 whitespace-nowrap">
                          <Clock className="w-3 h-3 shrink-0" />
                          下書き
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1 whitespace-nowrap">
                          <CheckCircle2 className="w-3 h-3 shrink-0" />
                          確定済
                        </span>
                      )}

                      {isLinked ? (
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-extrabold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1 whitespace-nowrap"
                          title={matchedInspection ? `点検報告書: ${matchedInspection.customerName}` : ''}
                        >
                          <Link2 className="w-3 h-3 text-indigo-600 shrink-0" />
                          <span>No. {rep.jobNo || '紐づけ済'}</span>
                        </span>
                      ) : (
                        <span
                          className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1 whitespace-nowrap"
                          title="親点検報告書Noが未設定です。編集から手動紐付けできます"
                        >
                          <AlertCircle className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>親No未設定</span>
                        </span>
                      )}

                      <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600 flex items-center gap-1 whitespace-nowrap">
                        <Layers className="w-3 h-3 text-slate-500 shrink-0" />
                        <span>{layoutLabel}</span>
                      </span>

                      {isMine && (
                        <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100/80 text-indigo-800 ml-auto flex items-center gap-1 whitespace-nowrap">
                          <UserCheck className="w-3 h-3 text-indigo-600 shrink-0" />
                          あなた
                        </span>
                      )}
                    </div>

                    {/* タイトル & 現場名 */}
                    <div className="min-w-0">
                      <h3 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                        {rep.title || '写真報告書'}
                      </h3>
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold mt-1 min-w-0">
                        <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate">{rep.buildingName || '現場名未設定'}</span>
                      </div>
                    </div>

                    {/* メタ情報 */}
                    <div className="space-y-1 text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-xl border border-slate-100 min-w-0">
                      {rep.workSubject && (
                        <div className="flex items-center gap-1.5 truncate">
                          <Wrench className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="text-slate-700 font-medium truncate">{rep.workSubject}</span>
                        </div>
                      )}
                      {rep.location && (
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate">{rep.location}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between gap-2 text-[10px] text-slate-400 pt-1 border-t border-slate-200/60 mt-1 min-w-0">
                        <span className="flex items-center gap-1 whitespace-nowrap shrink-0">
                          <Calendar className="w-3 h-3 shrink-0" />
                          実施: {rep.workDate || '未設定'}
                        </span>
                        <span
                          onClick={(e) => {
                            e.stopPropagation();
                            triggerOpenUserModal(rep.createdById || rep.createdByName);
                          }}
                          className="truncate hover:text-indigo-600 hover:underline cursor-pointer transition-colors"
                          title="作成者の社員詳細を表示"
                        >
                          作成: {rep.createdByName}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* カードアクションボタン */}
                  <div className="pt-2 border-t border-slate-100 flex items-center justify-between gap-1.5 min-w-0" onClick={e => e.stopPropagation()}>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleOpenEdit(rep)}
                        className="px-3 py-2 sm:px-2.5 sm:py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        title="報告書を編集"
                      >
                        <Edit3 className="w-3.5 h-3.5 shrink-0" />
                        <span>編集</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenPreview(rep)}
                        className="px-3 py-2 sm:px-2.5 sm:py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors flex items-center gap-1 cursor-pointer whitespace-nowrap"
                        title="A4プレビュー・印刷画面を開く"
                      >
                        <Printer className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                        <span>印刷</span>
                      </button>

                      <button
                        type="button"
                        onClick={e => handleDuplicate(rep, e)}
                        className="p-2 sm:p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                        title="この報告書を複製して新規作成"
                      >
                        <Copy className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                      </button>
                    </div>

                    <button
                      type="button"
                      onClick={e => handleDelete(rep.id, rep.title, e)}
                      disabled={deletingId === rep.id}
                      className="p-2 sm:p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                      title="削除"
                    >
                      <Trash2 className="w-4 h-4 sm:w-3.5 sm:h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
          </div>
          {filteredReports.length > visiblePhotoCount && (
            <div className="pt-2 pb-4 text-center">
              <button
                type="button"
                onClick={() => setVisiblePhotoCount(prev => prev + 24)}
                className="px-6 py-2.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold shadow-xs transition-all cursor-pointer"
              >
                さらに表示する（残り {filteredReports.length - visiblePhotoCount} 件）
              </button>
            </div>
          )}
        </div>
      )}

      {/* 写真報告書 作成・編集・プレビューモーダル */}
      <InspectionPhotoReportModal
        isOpen={isModalOpen}
        onClose={() => {
          setIsModalOpen(false);
          setSelectedReport(null);
        }}
        currentUser={currentUser}
        existingPhotoReport={selectedReport}
        initialInspectionReport={null}
        inspectionReportsList={inspectionReports}
        onSaved={handleSaved}
        initialTab={modalMode}
      />

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
