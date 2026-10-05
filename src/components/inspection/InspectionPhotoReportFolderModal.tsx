import React, { useState, useMemo } from 'react';
import {
  X,
  FolderOpen,
  Search,
  Plus,
  Filter,
  Camera,
  Calendar,
  Building2,
  MapPin,
  Wrench,
  Link2,
  Unlink,
  Edit3,
  Printer,
  Trash2,
  CheckCircle2,
  Clock,
  Layers,
  FileText,
  AlertCircle
} from 'lucide-react';
import { InspectionPhotoReport } from '../../types/photoReport';
import { InspectionReportRecord } from '../../types/inspectionReport';
import { User } from '../../types';
import { API_BASE_URL } from '../../config/api';

interface InspectionPhotoReportFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  allReports: InspectionPhotoReport[];
  inspectionReportsList: InspectionReportRecord[];
  onOpenCreateNew: () => void;
  onOpenEditReport: (report: InspectionPhotoReport) => void;
  onOpenPreviewReport: (report: InspectionPhotoReport) => void;
  onDeleteReport: (reportId: string) => void;
  onRefresh: () => void;
}

export const InspectionPhotoReportFolderModal: React.FC<InspectionPhotoReportFolderModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  allReports,
  inspectionReportsList,
  onOpenCreateNew,
  onOpenEditReport,
  onOpenPreviewReport,
  onDeleteReport,
  onRefresh,
}) => {
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTab, setFilterTab] = useState<'all' | 'unlinked' | 'linked' | 'draft' | 'completed'>('all');
  const [deletingId, setDeletingId] = useState<string | null>(null);

  // フィルタリング計算
  const filteredReports = useMemo(() => {
    return allReports.filter(rep => {
      // 1. タブフィルター
      const isLinked = !!(rep.inspectionReportId || (rep.jobNo && rep.jobNo.trim()));
      const isDraft = rep.status === 'draft';

      if (filterTab === 'unlinked' && isLinked) return false;
      if (filterTab === 'linked' && !isLinked) return false;
      if (filterTab === 'draft' && !isDraft) return false;
      if (filterTab === 'completed' && isDraft) return false;

      // 2. 検索キーワードフィルター
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const title = (rep.title || '').toLowerCase();
        const building = (rep.buildingName || '').toLowerCase();
        const customer = (rep.customerName || '').toLowerCase();
        const location = (rep.location || '').toLowerCase();
        const subject = (rep.workSubject || '').toLowerCase();
        const jobNo = (rep.jobNo || '').toLowerCase();
        const author = (rep.createdByName || '').toLowerCase();
        const match =
          title.includes(q) ||
          building.includes(q) ||
          customer.includes(q) ||
          location.includes(q) ||
          subject.includes(q) ||
          jobNo.includes(q) ||
          author.includes(q);
        if (!match) return false;
      }

      return true;
    });
  }, [allReports, filterTab, searchQuery]);

  // 各種件数カウント
  const counts = useMemo(() => {
    const total = allReports.length;
    const unlinked = allReports.filter(r => !(r.inspectionReportId || (r.jobNo && r.jobNo.trim()))).length;
    const linked = total - unlinked;
    const draft = allReports.filter(r => r.status === 'draft').length;
    const completed = total - draft;
    return { total, unlinked, linked, draft, completed };
  }, [allReports]);

  // 削除ハンドラー
  const handleDelete = async (reportId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!window.confirm('この写真報告書を削除してもよろしいですか？（削除すると復元できません）')) {
      return;
    }
    try {
      setDeletingId(reportId);
      const res = await fetch(`${API_BASE_URL}/photo-reports/${reportId}`, {
        method: 'DELETE',
      });
      if (res.ok) {
        onDeleteReport(reportId);
        onRefresh();
      } else {
        alert('写真報告書の削除に失敗しました');
      }
    } catch (err) {
      console.error('写真報告書削除エラー:', err);
      alert('写真報告書の削除中に通信エラーが発生しました');
    } finally {
      setDeletingId(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-5xl overflow-hidden flex flex-col max-h-[92vh] border border-slate-200 animate-in fade-in zoom-in-95 duration-150"
        onClick={e => e.stopPropagation()}
      >
        {/* モーダルヘッダー */}
        <div className="px-5 sm:px-7 py-4 bg-gradient-to-r from-slate-900 via-indigo-950 to-slate-900 text-white flex items-center justify-between gap-3 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600/90 text-white flex items-center justify-center shadow-md">
              <FolderOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
                  写真報告書フォルダ
                </h2>
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-indigo-500/30 text-indigo-200 border border-indigo-400/30 font-bold">
                  全 {counts.total} 件
                </span>
              </div>
              <p className="text-[11px] text-slate-300">
                作成済み写真報告書の一覧・検索・下書き管理・点検報告書Noの手動紐付け
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onOpenCreateNew}
              className="flex items-center gap-1.5 px-3.5 py-2 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-xl transition-all shadow-md cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4" />
              <span>新規写真報告書を作成</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-2 text-slate-400 hover:text-white hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title="閉じる"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 検索・フィルターバー */}
        <div className="p-4 sm:px-7 bg-slate-50 border-b border-slate-200 space-y-3">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            {/* 検索ボックス */}
            <div className="relative w-full sm:w-80">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="現場名・管理No・顧客名・件名で検索..."
                className="w-full pl-9 pr-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 placeholder-slate-400 outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition-all"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* タブフィルター */}
            <div className="flex items-center gap-1 overflow-x-auto w-full sm:w-auto bg-slate-200/70 p-1 rounded-xl text-xs border border-slate-300/60 shrink-0">
              <button
                type="button"
                onClick={() => setFilterTab('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap ${
                  filterTab === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                すべて ({counts.total})
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('unlinked')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  filterTab === 'unlinked'
                    ? 'bg-amber-500 text-white shadow-xs'
                    : 'text-amber-700 hover:bg-amber-100/50'
                }`}
                title="親の点検報告書Noが未設定の写真報告書"
              >
                <Unlink className="w-3.5 h-3.5" />
                <span>未紐づけ ({counts.unlinked})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('linked')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  filterTab === 'linked'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Link2 className="w-3.5 h-3.5" />
                <span>紐づけ済 ({counts.linked})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('draft')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  filterTab === 'draft'
                    ? 'bg-slate-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>下書き ({counts.draft})</span>
              </button>
              <button
                type="button"
                onClick={() => setFilterTab('completed')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                  filterTab === 'completed'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>確定済 ({counts.completed})</span>
              </button>
            </div>
          </div>
        </div>

        {/* フォルダ一覧コンテンツ */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-100/70">
          {filteredReports.length === 0 ? (
            <div className="bg-white rounded-2xl border-2 border-dashed border-slate-200 p-12 text-center space-y-4">
              <div className="w-14 h-14 mx-auto rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center">
                <FolderOpen className="w-7 h-7" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-800">
                  該当する写真報告書が見つかりません
                </h3>
                <p className="text-xs text-slate-500">
                  {searchQuery ? '検索条件を変更してお試しください。' : '「新規写真報告書を作成」から写真報告書を作成してください。'}
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenCreateNew}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>新規写真報告書を作成</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredReports.map(rep => {
                const isLinked = !!(rep.inspectionReportId || (rep.jobNo && rep.jobNo.trim()));
                const isDraft = rep.status === 'draft';
                const photoItems = Array.isArray(rep.photos) ? rep.photos : [];
                const photoCountWithImage = photoItems.filter(p => p.imageUrl).length;

                // 紐づく点検報告書を検索
                const linkedInspection = inspectionReportsList.find(
                  r => r.id === rep.inspectionReportId || (rep.jobNo && r.jobNo === rep.jobNo)
                );

                return (
                  <div
                    key={rep.id}
                    onClick={() => onOpenEditReport(rep)}
                    className="bg-white rounded-2xl border border-slate-200/90 hover:border-indigo-300 hover:shadow-md transition-all p-4 flex flex-col justify-between gap-3 group cursor-pointer"
                  >
                    {/* カード上部：タイトル ＆ ステータスバッジ */}
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          {/* 下書き / 完了バッジ */}
                          {isDraft ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-50 text-amber-700 border border-amber-300 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              下書き
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-300 flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3" />
                              確定済
                            </span>
                          )}

                          {/* 紐付け状態バッジ */}
                          {isLinked ? (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1" title={linkedInspection ? `点検報告書: ${linkedInspection.customerName}` : ''}>
                              <Link2 className="w-3 h-3" />
                              <span>No. {rep.jobNo || '紐づけ済'}</span>
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1" title="親Noが未設定です。編集から報告書Noを手打ちして紐付けできます">
                              <AlertCircle className="w-3 h-3" />
                              <span>親No 未設定 (未紐づけ)</span>
                            </span>
                          )}

                          <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-slate-100 text-slate-600">
                            {rep.layoutType === '2_items' ? '2枚構成' : rep.layoutType === '4_items' ? '4枚構成' : '3枚構成'}
                          </span>
                        </div>

                        {/* 写真枚数表示 */}
                        <span className="text-[11px] font-bold text-slate-500 shrink-0 flex items-center gap-1">
                          <Camera className="w-3.5 h-3.5 text-slate-400" />
                          <span>{photoCountWithImage} / {photoItems.length}枚</span>
                        </span>
                      </div>

                      {/* 報告書タイトル */}
                      <h4 className="text-sm font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                        {rep.title || '写真報告書'}
                      </h4>

                      {/* 現場・件名・実施日情報 */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-600 bg-slate-50/70 p-2.5 rounded-xl border border-slate-100">
                        <div className="flex items-center gap-1.5 truncate">
                          <Building2 className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="font-bold text-slate-800 truncate">
                            {rep.buildingName || rep.customerName || '現場名未設定'}
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <MapPin className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                          <span className="truncate">{rep.location || '場所未設定'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <Wrench className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{rep.workSubject || '件名未設定'}</span>
                        </div>
                        <div className="flex items-center gap-1.5 truncate">
                          <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span>{rep.workDate || '実施日未設定'}</span>
                        </div>
                      </div>

                      {/* 写真ミニサムネイルプレビュー (最大4枚横並び) */}
                      <div className="grid grid-cols-4 gap-1.5 pt-1">
                        {photoItems.slice(0, 4).map((p, idx) => (
                          <div
                            key={p.id || idx}
                            className="aspect-4/3 rounded-lg bg-slate-100 border border-slate-200 overflow-hidden flex items-center justify-center relative group/thumb"
                          >
                            {p.imageUrl ? (
                              <img
                                src={p.imageUrl}
                                alt={p.stageTitle || `写真${idx + 1}`}
                                className="w-full h-full object-cover"
                              />
                            ) : (
                              <div className="text-[9px] text-slate-300 font-bold">枠{idx + 1}</div>
                            )}
                            {p.stageTitle && (
                              <span className="absolute bottom-0 inset-x-0 bg-slate-900/70 text-white text-[8px] font-bold text-center py-0.5 truncate px-0.5">
                                {p.stageTitle}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* カード下部：作成者・更新日 ＆ アクションボタン */}
                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-400">
                      <div className="truncate">
                        <span>作成: {rep.createdByName}</span>
                        <span className="mx-1">・</span>
                        <span>{new Date(rep.updatedAt || rep.createdAt).toLocaleDateString('ja-JP')}</span>
                      </div>

                      <div className="flex items-center gap-1 shrink-0" onClick={e => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={() => onOpenEditReport(rep)}
                          className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg font-bold flex items-center gap-1 transition-colors cursor-pointer"
                          title="写真報告書の編集・No手打ち紐付け"
                        >
                          <Edit3 className="w-3 h-3" />
                          <span>編集・紐付け</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => onOpenPreviewReport(rep)}
                          className="p-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg transition-colors cursor-pointer"
                          title="A4帳票印刷・プレビュー"
                        >
                          <Printer className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={e => handleDelete(rep.id, e)}
                          disabled={deletingId === rep.id}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
