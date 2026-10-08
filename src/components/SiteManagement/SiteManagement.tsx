import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { 
  Building2, Plus, Search, Filter, Layers, Calendar, 
  User as UserIcon, RefreshCw, BarChart2, CheckCircle2, 
  Clock, AlertCircle, MapPin, ChevronRight, HardHat, FileSpreadsheet, ExternalLink
} from 'lucide-react';
import { Site, SiteStatus } from '../../types/site';
import { User } from '../../types';
import { API_BASE_URL } from '../../config/api';
import { SiteGanttView } from './SiteGanttView';
import { WorkerScheduleView } from './WorkerScheduleView';
import { SiteFormModal } from './SiteFormModal';
import { SiteDetailModal } from './SiteDetailModal';

interface SiteManagementProps {
  currentUser: User;
  allUsers: User[];
}

export const SiteManagement: React.FC<SiteManagementProps> = ({ currentUser, allUsers }) => {
  const [sites, setSites] = useState<Site[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // アクティブビュー ('list' | 'gantt' | 'worker')
  const [activeView, setActiveView] = useState<'list' | 'gantt' | 'worker'>('list');

  // フィルター
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [workerFilter, setWorkerFilter] = useState<string>('all');

  // モーダルステート
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedSite, setSelectedSite] = useState<Site | null>(null);
  const [isDetailOpen, setIsDetailOpen] = useState(false);

  // 現場データ取得
  const fetchSites = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${API_BASE_URL}/sites`);
      if (!res.ok) {
        throw new Error(`現場データの取得に失敗しました (${res.status})`);
      }
      const data = await res.json();
      setSites(Array.isArray(data.sites) ? data.sites : []);
    } catch (err: any) {
      console.error('Fetch sites error:', err);
      setError(err.message || 'データ取得に失敗しました。');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  // 新規登録成功ハンドラ
  const handleSiteCreated = (newSite: Site) => {
    setSites(prev => [newSite, ...prev]);
    setSelectedSite(newSite);
    setIsDetailOpen(true);
  };

  // 更新ハンドラ
  const handleSiteUpdated = (updatedSite: Site) => {
    setSites(prev => prev.map(s => s.id === updatedSite.id ? updatedSite : s));
    if (selectedSite?.id === updatedSite.id) {
      setSelectedSite(updatedSite);
    }
  };

  // 削除ハンドラ
  const handleSiteDeleted = async (siteId: string) => {
    try {
      const res = await fetch(`${API_BASE_URL}/sites/${siteId}`, { method: 'DELETE' });
      if (res.ok) {
        setSites(prev => prev.filter(s => s.id !== siteId));
        if (selectedSite?.id === siteId) {
          setIsDetailOpen(false);
          setSelectedSite(null);
        }
      }
    } catch (err) {
      console.error('Delete site error:', err);
    }
  };

  // 詳細モーダル表示
  const handleOpenDetail = (site: Site) => {
    setSelectedSite(site);
    setIsDetailOpen(true);
  };

  // 絞り込み
  const filteredSites = useMemo(() => {
    return sites.filter(site => {
      if (statusFilter !== 'all' && site.status !== statusFilter) return false;
      if (workerFilter !== 'all') {
        const matchPrimary = site.primaryWorkerId === workerFilter;
        const matchCo = site.coWorkers?.some(c => c.id === workerFilter);
        const matchParts = site.mainParts.some(p => p.workerId === workerFilter);
        if (!matchPrimary && !matchCo && !matchParts) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchCode = site.siteCode.toLowerCase().includes(q);
        const matchName = site.siteName.toLowerCase().includes(q);
        const matchCust = (site.customerName || '').toLowerCase().includes(q);
        const matchAddr = (site.address || '').toLowerCase().includes(q);
        if (!matchCode && !matchName && !matchCust && !matchAddr) return false;
      }
      return true;
    });
  }, [sites, statusFilter, workerFilter, searchQuery]);

  // KPI 集計
  const stats = useMemo(() => {
    const total = sites.length;
    const inProgress = sites.filter(s => s.status === 'in_progress').length;
    const completed = sites.filter(s => s.status === 'completed').length;
    const notStarted = sites.filter(s => s.status === 'not_started').length;
    return { total, inProgress, completed, notStarted };
  }, [sites]);

  return (
    <div className="flex-1 min-w-0 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">
      {/* ページタイトル & アクションヘッダー */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-indigo-600 text-white rounded-xl shadow-xs">
            <HardHat className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-extrabold text-slate-900 tracking-tight">現場管理</h1>
              <span className="px-2 py-0.5 text-[11px] font-bold text-amber-700 bg-amber-100 rounded-full border border-amber-200">
                開発中
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              在庫データベース連動・部品分割展開・ガントチャート工程管理・施工スケジュール
            </p>
          </div>

        </div>

        <div className="flex items-center gap-2.5">
          <button
            onClick={fetchSites}
            className="p-2 hover:bg-slate-100 text-slate-600 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="最新情報に更新"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setIsFormOpen(true)}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-sm hover:shadow transition-all cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            現場を新規登録
          </button>
        </div>
      </div>

      {/* KPIサマリーカード */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-xs font-semibold text-slate-500">登録現場総数</span>
          <div className="text-2xl font-black text-slate-800 mt-1">{stats.total} <span className="text-xs font-normal text-slate-400">現場</span></div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-blue-200/60 shadow-2xs">
          <span className="text-xs font-semibold text-blue-600">施工進行中</span>
          <div className="text-2xl font-black text-blue-700 mt-1">{stats.inProgress} <span className="text-xs font-normal text-slate-400">現場</span></div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-amber-200/60 shadow-2xs">
          <span className="text-xs font-semibold text-amber-600">未着手・準備中</span>
          <div className="text-2xl font-black text-amber-700 mt-1">{stats.notStarted} <span className="text-xs font-normal text-slate-400">現場</span></div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-emerald-200/60 shadow-2xs">
          <span className="text-xs font-semibold text-emerald-600">完了</span>
          <div className="text-2xl font-black text-emerald-700 mt-1">{stats.completed} <span className="text-xs font-normal text-slate-400">現場</span></div>
        </div>
      </div>

      {/* 表示切替ナビゲーションタブ */}
      <div className="flex border-b border-slate-200 bg-white px-4 rounded-t-xl text-xs font-bold text-slate-600 gap-4 sm:gap-6 shadow-2xs">
        <button
          onClick={() => setActiveView('list')}
          className={`py-3.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeView === 'list'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>現場一覧 ({filteredSites.length})</span>
        </button>

        <button
          onClick={() => setActiveView('gantt')}
          className={`py-3.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeView === 'gantt'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <BarChart2 className="w-4 h-4" />
          <span>ガントチャート（現場別進捗）</span>
        </button>

        <button
          onClick={() => setActiveView('worker')}
          className={`py-3.5 border-b-2 flex items-center gap-1.5 transition-colors cursor-pointer ${
            activeView === 'worker'
              ? 'border-indigo-600 text-indigo-700'
              : 'border-transparent hover:text-slate-900'
          }`}
        >
          <UserIcon className="w-4 h-4" />
          <span>施工者スケジュール（乗り込み現場確認）</span>
        </button>
      </div>

      {/* 1. 現場一覧ビュー */}
      {activeView === 'list' && (
        <div className="space-y-4">
          {/* 検索・絞り込みツールバー */}
          <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs flex flex-wrap items-center justify-between gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="現場コード、現場名、元請名で検索..."
                className="w-full pl-9 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span>状況:</span>
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-white border border-slate-200 text-slate-700 rounded-lg px-2 py-1 text-xs"
                >
                  <option value="all">すべて</option>
                  <option value="not_started">未着手</option>
                  <option value="in_progress">進行中</option>
                  <option value="completed">完了</option>
                  <option value="on_hold">保留</option>
                </select>
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-600">
                <span>担当者:</span>
                <select
                  value={workerFilter}
                  onChange={(e) => setWorkerFilter(e.target.value)}
                  className="bg-white border border-slate-200 text-slate-700 rounded-lg px-2 py-1 text-xs"
                >
                  <option value="all">全員</option>
                  {allUsers.map(u => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* 現場カード一覧 */}
          {filteredSites.length === 0 ? (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-sm">
              該当する現場がありません。
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filteredSites.map(site => {
                const constructedCount = site.mainParts.filter(p => p.status === 'constructed' || p.status === 'inspected').length;
                const totalMain = site.mainParts.length;
                const percent = totalMain > 0 ? Math.round((constructedCount / totalMain) * 100) : 0;

                return (
                  <div
                    key={site.id}
                    onClick={() => handleOpenDetail(site)}
                    className="bg-white rounded-xl border border-slate-200 hover:border-indigo-300 p-4 shadow-2xs hover:shadow-sm transition-all cursor-pointer flex flex-col justify-between gap-3 group"
                  >
                    <div>
                      {/* コード & ステータス */}
                      <div className="flex items-center justify-between gap-2 mb-2">
                        <span className="font-extrabold text-xs text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded shadow-2xs">
                          {site.siteCode}
                        </span>
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                          site.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                          site.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                          site.status === 'on_hold' ? 'bg-rose-100 text-rose-800' :
                          'bg-slate-100 text-slate-700'
                        }`}>
                          {site.status === 'completed' ? '完了' :
                           site.status === 'in_progress' ? '進行中' :
                           site.status === 'on_hold' ? '保留' : '未着手'}
                        </span>
                      </div>

                      {/* 現場名 */}
                      <h3 className="font-bold text-base text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                        {site.siteName}
                      </h3>

                      {/* メタ情報 */}
                      <div className="mt-2 space-y-1 text-xs text-slate-500">
                        <div className="flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                          <span className="truncate">{site.customerName || '元請未定'}</span>
                        </div>
                        {site.address && (
                          <div className="flex items-center gap-1.5">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{site.address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-4 text-[11px] pt-1">
                          <span>EG台数: <strong className="text-slate-800">{site.egCount}台</strong></span>
                          <span>担当: <strong className="text-slate-800">{site.primaryWorkerName || '未定'}</strong></span>
                          <span>施工日: <strong className="text-indigo-600">{site.constructionDate || site.startDate || '未定'}</strong></span>
                        </div>
                      </div>
                    </div>

                    {/* 主要部品進捗バー */}
                    <div className="pt-2 border-t border-slate-100">
                      <div className="flex items-center justify-between text-[11px] mb-1">
                        <span className="text-slate-500 font-medium">主要部品施工進捗:</span>
                        <span className="font-bold text-indigo-700">{constructedCount}/{totalMain}台 ({percent}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 h-2 rounded-full overflow-hidden">
                        <div
                          className="bg-indigo-600 h-full rounded-full transition-all duration-300"
                          style={{ width: `${percent}%` }}
                        />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* 2. ガントチャートビュー */}
      {activeView === 'gantt' && (
        <SiteGanttView sites={sites} onSelectSite={handleOpenDetail} />
      )}

      {/* 3. 施工者スケジュールビュー */}
      {activeView === 'worker' && (
        <WorkerScheduleView
          sites={sites}
          currentUser={currentUser}
          allUsers={allUsers}
          onSelectSite={handleOpenDetail}
        />
      )}

      {/* 新規登録モーダル */}
      {isFormOpen && (
        <SiteFormModal
          isOpen={isFormOpen}
          onClose={() => setIsFormOpen(false)}
          onSuccess={handleSiteCreated}
          currentUser={currentUser}
          allUsers={allUsers}
        />
      )}

      {/* 現場詳細モーダル */}
      {isDetailOpen && selectedSite && (
        <SiteDetailModal
          site={selectedSite}
          isOpen={isDetailOpen}
          onClose={() => {
            setIsDetailOpen(false);
            setSelectedSite(null);
          }}
          onUpdateSite={handleSiteUpdated}
          onDeleteSite={handleSiteDeleted}
          currentUser={currentUser}
          allUsers={allUsers}
        />
      )}
    </div>
  );
};
