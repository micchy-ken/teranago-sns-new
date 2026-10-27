import React, { useState, useMemo, useRef } from 'react';
import { CalendarEvent, User, CalendarViewSettings } from '../types';
import { Site } from '../types/site';
import { 
  HardHat, 
  Clock, 
  Calendar as CalendarIcon, 
  Plus, 
  Search, 
  FileText, 
  ExternalLink, 
  Users, 
  Package, 
  Building2,
  CheckCircle2,
  AlertCircle,
  Filter,
  Sparkles,
  ArrowUpDown,
  ChevronDown,
  Layers
} from 'lucide-react';
import { getLocalDateStr, getJstHourAndMinutes, formatDateJST } from '../utils/dateUtils';
import { API_BASE_URL } from '../config/api';

export interface CalendarConstructionTimelineProps {
  currentDate?: Date;
  onChangeDate?: (date: Date) => void;
  teamMembers?: User[];
  allUsers: User[];
  events: CalendarEvent[];
  sites: Site[];
  onEventClick: (e: React.MouseEvent, event: CalendarEvent) => void;
  onOpenAddEvent: (dateStr?: string, prefillSite?: Site, prefillPhase?: 'new' | 'remaining' | 'shukko') => void;
  onNavigateToSite?: (siteIdOrCode: string) => void;
  calendarSettings?: CalendarViewSettings;
}

interface SiteRow {
  key: string;
  siteId?: string;
  siteCode?: string;
  siteName: string;
  customerName?: string;
  egCount?: number;
  phase: 'new' | 'remaining' | 'shukko';
  site?: Site;
  workers: User[];
  drawings?: string[];
  shukkoStatus?: {
    total: number;
    completed: number;
  };
  events: CalendarEvent[];
  activeDatesSet: Set<string>;
}

interface DateHeaderItem {
  type: 'date';
  dateStr: string;
  dateObj: Date;
  isToday: boolean;
  weekdayJa: string;
}

interface DateGapHeaderItem {
  type: 'gap';
  gapDays: number;
  fromDateStr: string;
  toDateStr: string;
}

type TimelineColumn = DateHeaderItem | DateGapHeaderItem;

export function CalendarConstructionTimeline({
  currentDate,
  onChangeDate,
  teamMembers,
  allUsers,
  events,
  sites,
  onEventClick,
  onOpenAddEvent,
  onNavigateToSite,
  calendarSettings,
}: CalendarConstructionTimelineProps) {
  const [phaseFilter, setPhaseFilter] = useState<'all' | 'new' | 'remaining' | 'shukko'>('all');
  const [dateRangeFilter, setDateRangeFilter] = useState<'all' | 'recent_30' | 'future' | 'this_month'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const leftPaneScrollRef = useRef<HTMLDivElement>(null);

  const usersMap = useMemo(() => new Map(allUsers.map(u => [String(u.id), u])), [allUsers]);
  const todayStr = useMemo(() => getLocalDateStr(new Date()), []);

  // 1. 全現場・新規乗り込み済み現場の抽出 & イベント関連付け (縦軸 = 現場)
  const siteRows = useMemo(() => {
    const rowsMap = new Map<string, SiteRow>();
    const processedEventIds = new Set<string>();

    const sitesMapByCode = new Map(sites.map(s => [s.siteCode?.toLowerCase(), s]));
    const sitesMapById = new Map(sites.map(s => [String(s.id), s]));

    // A. カレンダー内の全工事イベントを解析して現場ごとにグループ化
    events.forEach(ev => {
      const isConstructionType = ev.type === 'construction' || Boolean(ev.constructionPhase) || Boolean(ev.siteId) || Boolean(ev.siteCode);
      const titleHasKeyword = ev.title.includes('工事') || ev.title.includes('出庫') || ev.title.includes('乗り込み') || ev.title.includes('現場');

      if (!isConstructionType && !titleHasKeyword) return;

      processedEventIds.add(String(ev.id));

      const matchedSite = (ev.siteId && sitesMapById.get(String(ev.siteId))) ||
        (ev.siteCode && sitesMapByCode.get(ev.siteCode.toLowerCase())) ||
        sites.find(s => s.siteName && ev.title.includes(s.siteName));

      const siteKey = matchedSite?.id ? `site_${matchedSite.id}` : (ev.siteCode ? `code_${ev.siteCode}` : `title_${ev.siteName || ev.title}`);
      const siteName = ev.siteName || matchedSite?.siteName || ev.title.replace(/【.*?】/g, '').trim();
      const siteCode = ev.siteCode || matchedSite?.siteCode;
      const customerName = matchedSite?.customerName;
      const egCount = matchedSite?.egCount;

      let phase: 'new' | 'remaining' | 'shukko' = ev.constructionPhase || 'new';
      if (!ev.constructionPhase) {
        if (ev.title.includes('新規') || ev.title.includes('【新規】')) {
          phase = 'new';
        } else if (ev.title.includes('残') || ev.title.includes('【残】')) {
          phase = 'remaining';
        } else if (ev.title.includes('出庫') || ev.title.includes('【出庫有】')) {
          phase = 'shukko';
        }
      }

      // 参加作業員
      const workers: User[] = (ev.attendees || []).map(a => usersMap.get(String(a.id)) || a);

      // イベントの該当全日付（複数日対応）
      const evStartDateStr = getLocalDateStr(new Date(ev.start));
      const evEndDateStr = ev.end ? getLocalDateStr(new Date(ev.end)) : evStartDateStr;

      if (!rowsMap.has(siteKey)) {
        let shukkoStatus = undefined;
        if (matchedSite && Array.isArray(matchedSite.mainParts)) {
          const total = matchedSite.mainParts.length;
          const completed = matchedSite.mainParts.filter(p => p.status === 'stock_out' || p.status === 'constructed' || p.status === 'inspected' || p.outStockDate).length;
          shukkoStatus = { total, completed };
        }

        rowsMap.set(siteKey, {
          key: siteKey,
          siteId: matchedSite?.id,
          siteCode,
          siteName,
          customerName,
          egCount,
          phase,
          site: matchedSite,
          workers,
          drawings: matchedSite?.drawings,
          shukkoStatus,
          events: [],
          activeDatesSet: new Set<string>(),
        });
      }

      const row = rowsMap.get(siteKey)!;
      row.events.push(ev);

      // 担当作業者の統合
      workers.forEach(w => {
        if (w && !row.workers.some(existing => String(existing.id) === String(w.id))) {
          row.workers.push(w);
        }
      });

      // 日付範囲の記録
      let cur = new Date(evStartDateStr);
      const endDateObj = new Date(evEndDateStr);
      while (cur <= endDateObj) {
        row.activeDatesSet.add(getLocalDateStr(cur));
        cur.setDate(cur.getDate() + 1);
      }
    });

    // B. 現場マスタ (sites) で着工中・乗り込み済みの案件を補完
    sites.forEach(s => {
      const siteKey = `site_${s.id}`;
      const totalParts = s.mainParts?.length || s.egCount || 0;
      const completedParts = s.mainParts?.filter(p => p.status === 'stock_out' || p.status === 'constructed' || p.status === 'inspected' || p.outStockDate).length || 0;

      if (!rowsMap.has(siteKey)) {
        const workers: User[] = [];
        if (s.primaryWorkerId) {
          const u = usersMap.get(String(s.primaryWorkerId));
          if (u) workers.push(u);
        }
        if (Array.isArray(s.coWorkers)) {
          s.coWorkers.forEach(cw => {
            const u = usersMap.get(String(cw.id));
            if (u && !workers.some(w => String(w.id) === String(u.id))) workers.push(u);
          });
        }

        const activeDatesSet = new Set<string>();
        if (s.constructionDate) activeDatesSet.add(s.constructionDate);
        if (s.startDate) activeDatesSet.add(s.startDate);
        if (s.endDate) activeDatesSet.add(s.endDate);

        rowsMap.set(siteKey, {
          key: siteKey,
          siteId: s.id,
          siteCode: s.siteCode,
          siteName: s.siteName,
          customerName: s.customerName,
          egCount: s.egCount,
          phase: completedParts > 0 ? 'remaining' : 'new',
          site: s,
          workers,
          drawings: s.drawings,
          shukkoStatus: totalParts > 0 ? { total: totalParts, completed: completedParts } : undefined,
          events: [],
          activeDatesSet,
        });
      } else {
        const row = rowsMap.get(siteKey)!;
        if (!row.site) row.site = s;
        if (s.constructionDate) row.activeDatesSet.add(s.constructionDate);
        if (s.startDate) row.activeDatesSet.add(s.startDate);
        if (s.endDate) row.activeDatesSet.add(s.endDate);
      }
    });

    return Array.from(rowsMap.values());
  }, [events, sites, usersMap]);

  // 検索・フェーズによる現場行の絞り込み
  const filteredSiteRows = useMemo(() => {
    return siteRows.filter(row => {
      if (phaseFilter !== 'all' && row.phase !== phaseFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const codeMatch = (row.siteCode || '').toLowerCase().includes(q);
        const nameMatch = (row.siteName || '').toLowerCase().includes(q);
        const custMatch = (row.customerName || '').toLowerCase().includes(q);
        const workerMatch = row.workers.some(w => (w.name || '').toLowerCase().includes(q));
        if (!codeMatch && !nameMatch && !custMatch && !workerMatch) return false;
      }

      return true;
    });
  }, [siteRows, phaseFilter, searchQuery]);

  // 2. 工事・作業が存在する「稼働日」のみを抽出（横軸 = 工事日のみ & 空白日付は自動省略）
  const timelineColumns = useMemo(() => {
    const rawDatesSet = new Set<string>();

    filteredSiteRows.forEach(row => {
      row.activeDatesSet.forEach(d => rawDatesSet.add(d));
    });

    if (rawDatesSet.size === 0) return [];

    let sortedDateStrs = Array.from(rawDatesSet).sort((a, b) => a.localeCompare(b));

    // 期間フィルター
    if (dateRangeFilter === 'recent_30') {
      const past30Str = getLocalDateStr(new Date(Date.now() - 30 * 24 * 60 * 60 * 1000));
      sortedDateStrs = sortedDateStrs.filter(d => d >= past30Str);
    } else if (dateRangeFilter === 'future') {
      sortedDateStrs = sortedDateStrs.filter(d => d >= todayStr);
    } else if (dateRangeFilter === 'this_month') {
      const now = new Date();
      const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      sortedDateStrs = sortedDateStrs.filter(d => d.startsWith(monthPrefix));
    }

    const columns: TimelineColumn[] = [];
    const weekdaysJa = ['日', '月', '火', '水', '木', '金', '土'];

    for (let i = 0; i < sortedDateStrs.length; i++) {
      const dateStr = sortedDateStrs[i];
      const dateObj = new Date(`${dateStr}T00:00:00`);

      // 前の日付との間隔を判定（1日以上空いている場合は日付省略カラムを挿入）
      if (i > 0) {
        const prevDateStr = sortedDateStrs[i - 1];
        const prevDateObj = new Date(`${prevDateStr}T00:00:00`);
        const diffMs = dateObj.getTime() - prevDateObj.getTime();
        const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24)) - 1;

        if (diffDays > 0) {
          columns.push({
            type: 'gap',
            gapDays: diffDays,
            fromDateStr: prevDateStr,
            toDateStr: dateStr,
          });
        }
      }

      columns.push({
        type: 'date',
        dateStr,
        dateObj,
        isToday: dateStr === todayStr,
        weekdayJa: weekdaysJa[dateObj.getDay()],
      });
    }

    return columns;
  }, [filteredSiteRows, dateRangeFilter, todayStr]);

  // 集計サマリー (KPI)
  const summary = useMemo(() => {
    const totalSites = filteredSiteRows.length;
    const newCount = filteredSiteRows.filter(r => r.phase === 'new').length;
    const remainingCount = filteredSiteRows.filter(r => r.phase === 'remaining').length;
    const shukkoCount = filteredSiteRows.filter(r => r.phase === 'shukko').length;

    const workerIds = new Set<string>();
    filteredSiteRows.forEach(r => r.workers.forEach(w => workerIds.add(String(w.id))));

    const dateCount = timelineColumns.filter(c => c.type === 'date').length;

    return {
      totalSites,
      newCount,
      remainingCount,
      shukkoCount,
      workerCount: workerIds.size,
      dateCount,
    };
  }, [filteredSiteRows, timelineColumns]);

  // 縦スクロール同期ハンドラー
  const handleRightBodyScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (leftPaneScrollRef.current) {
      leftPaneScrollRef.current.scrollTop = e.currentTarget.scrollTop;
    }
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-100 overflow-hidden text-slate-800">
      {/* 1. Header Control Bar (単体表示で成立するツールバー) */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-3 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        {/* Title & Badge */}
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
            <Building2 className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900 tracking-tight">
                現場ガントタイムライン
              </h2>
              <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
                工事稼働日のみ表示 (日付省略対応)
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium hidden sm:block">
              縦軸：現場一覧（スクロール時も左端固定） ／ 横軸：実際の工事稼働日（工事予定のない長期間は自動省略）
            </p>
          </div>
        </div>

        {/* Right CTA & Controls */}
        <div className="flex items-center gap-2 flex-1 justify-end flex-wrap sm:flex-nowrap">
          {/* 検索フィルター */}
          <div className="relative max-w-xs w-full">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="現場名・現場コード・作業者で検索..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          {/* 期間範囲セレクト */}
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold shrink-0">
            <button
              onClick={() => setDateRangeFilter('all')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                dateRangeFilter === 'all' ? 'bg-white text-slate-900 shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              全期間
            </button>
            <button
              onClick={() => setDateRangeFilter('this_month')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                dateRangeFilter === 'this_month' ? 'bg-white text-slate-900 shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              今月
            </button>
            <button
              onClick={() => setDateRangeFilter('future')}
              className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
                dateRangeFilter === 'future' ? 'bg-white text-slate-900 shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              本日以降
            </button>
          </div>

          {/* 工事追加ボタン */}
          <button
            onClick={() => onOpenAddEvent(`${todayStr}T09:00:00`)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-extrabold rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>新規工事予定</span>
          </button>
        </div>
      </div>

      {/* 2. KPI Summary Bar & Phase Filter Segment */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        {/* KPI Counts */}
        <div className="flex items-center gap-2 text-xs overflow-x-auto py-0.5">
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg font-bold text-slate-700 shrink-0">
            <Building2 className="w-3.5 h-3.5 text-slate-500" />
            <span>対象現場: {summary.totalSites}件</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-emerald-50 border border-emerald-200/80 rounded-lg font-bold text-emerald-800 shrink-0">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>【新規】: {summary.newCount}件</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-50 border border-amber-200/80 rounded-lg font-bold text-amber-800 shrink-0">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>【残工事】: {summary.remainingCount}件</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-indigo-50 border border-indigo-200/80 rounded-lg font-bold text-indigo-800 shrink-0">
            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
            <span>【出庫有】: {summary.shukkoCount}件</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg font-bold text-slate-600 shrink-0">
            <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
            <span>稼働日数: {summary.dateCount}日</span>
          </div>
          <div className="flex items-center gap-1.5 px-2.5 py-1 bg-slate-100 rounded-lg font-bold text-slate-600 shrink-0">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>作業員: {summary.workerCount}名</span>
          </div>
        </div>

        {/* Phase Segmented Filter */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
          <button
            onClick={() => setPhaseFilter('all')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              phaseFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            全種別
          </button>
          <button
            onClick={() => setPhaseFilter('new')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${
              phaseFilter === 'new' ? 'bg-emerald-600 text-white shadow-2xs font-extrabold' : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
            <span>新規</span>
          </button>
          <button
            onClick={() => setPhaseFilter('remaining')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${
              phaseFilter === 'remaining' ? 'bg-amber-600 text-white shadow-2xs font-extrabold' : 'text-amber-700 hover:bg-amber-50'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span>
            <span>残工事</span>
          </button>
          <button
            onClick={() => setPhaseFilter('shukko')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1 ${
              phaseFilter === 'shukko' ? 'bg-indigo-600 text-white shadow-2xs font-extrabold' : 'text-indigo-700 hover:bg-indigo-50'
            }`}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
            <span>出庫有</span>
          </button>
        </div>
      </div>

      {/* 3. Gantt Split Pane Container (★左ペイン: 100%完全固定現場名列 ／ 右ペイン: 日付スクロール領域) */}
      <div className="flex-1 overflow-hidden p-2 sm:p-3 flex flex-col">
        {filteredSiteRows.length === 0 || timelineColumns.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white rounded-2xl border border-slate-200 shadow-2xs">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 shadow-inner">
              <HardHat className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">
              対象の工事・現場予定が見つかりません
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">
              フィルター条件を変更するか、右上の「新規工事予定」ボタンから乗り込みスケジュールを追加してください。
            </p>
            <button
              onClick={() => onOpenAddEvent(`${todayStr}T09:00:00`)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-extrabold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>工事予定を新規追加</span>
            </button>
          </div>
        ) : (
          <div className="flex-1 flex overflow-hidden bg-white rounded-2xl border border-slate-200 shadow-sm">
            
            {/* ★ 左ペイン (現場名固定列): 右にスクロールしても絶対に動かない100%完全固定ペイン! */}
            <div className="w-[320px] sm:w-[360px] shrink-0 border-r border-slate-200 flex flex-col bg-white z-20 shadow-md">
              {/* 左上ヘッダー角 */}
              <div className="h-[52px] p-3 bg-slate-100 border-b border-slate-200 flex flex-col justify-center shrink-0">
                <span className="text-slate-900 font-extrabold text-xs">現場案件 ／ 取引先 ／ 担当作業者</span>
                <span className="text-[10px] text-slate-500 font-semibold mt-0.5">
                  全{summary.totalSites}現場 (稼働{summary.dateCount}日分)
                </span>
              </div>

              {/* 現場カード一覧 (右ペインの縦スクロールと同期) */}
              <div 
                ref={leftPaneScrollRef} 
                className="flex-1 overflow-y-hidden overflow-x-hidden divide-y divide-slate-200 bg-white"
              >
                {filteredSiteRows.map(siteRow => {
                  const hasDrawings = siteRow.drawings && siteRow.drawings.length > 0;

                  return (
                    <div
                      key={`left_${siteRow.key}`}
                      className="h-[104px] p-3 flex flex-col justify-between gap-1 bg-white hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        {/* Phase & Code */}
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          <span className={`px-2 py-0.5 rounded font-black text-[10px] shadow-2xs ${
                            siteRow.phase === 'new'
                              ? 'bg-emerald-600 text-white'
                              : siteRow.phase === 'remaining'
                              ? 'bg-amber-500 text-white'
                              : 'bg-indigo-600 text-white'
                          }`}>
                            {siteRow.phase === 'new' ? '【新規】' : siteRow.phase === 'remaining' ? '【残】' : '【出庫有】'}
                          </span>

                          {siteRow.siteCode && (
                            <span className="font-mono text-[10px] font-bold px-1.5 py-0.2 bg-slate-100 border border-slate-200 rounded text-slate-700">
                              {siteRow.siteCode}
                            </span>
                          )}

                          {siteRow.egCount !== undefined && siteRow.egCount > 0 && (
                            <span className="text-[9px] font-bold px-1.5 py-0.2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded">
                              EG {siteRow.egCount}台
                            </span>
                          )}

                          {siteRow.shukkoStatus && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                              siteRow.shukkoStatus.completed >= siteRow.shukkoStatus.total
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              出庫: {siteRow.shukkoStatus.completed}/{siteRow.shukkoStatus.total}台
                            </span>
                          )}
                        </div>

                        {/* Site Name & Link */}
                        <div className="flex items-start justify-between gap-1">
                          <h4 
                            className="text-xs sm:text-sm font-extrabold text-slate-900 hover:text-amber-600 transition-colors line-clamp-1 cursor-pointer"
                            title={siteRow.siteName}
                            onClick={() => {
                              if (siteRow.site && onNavigateToSite) {
                                onNavigateToSite(siteRow.site.id || siteRow.site.siteCode);
                              }
                            }}
                          >
                            {siteRow.siteName}
                          </h4>

                          {siteRow.site && onNavigateToSite && (
                            <button
                              type="button"
                              onClick={() => onNavigateToSite(siteRow.site!.id || siteRow.site!.siteCode)}
                              className="text-slate-400 hover:text-amber-600 p-0.5 rounded transition-colors shrink-0"
                              title="現場詳細へ移動"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Customer */}
                        {siteRow.customerName && (
                          <div className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                            {siteRow.customerName}
                          </div>
                        )}
                      </div>

                      {/* Workers & Drawings */}
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100 text-[10px]">
                        <div className="flex items-center gap-1 min-w-0 flex-1">
                          <div className="flex items-center -space-x-1 shrink-0">
                            {siteRow.workers.slice(0, 3).map((w, idx) => (
                              <div
                                key={w.id || idx}
                                className="w-4.5 h-4.5 rounded-full ring-1 ring-white bg-slate-200 overflow-hidden shrink-0"
                                title={w.name}
                              >
                                {w.avatarUrl ? (
                                  <img src={w.avatarUrl} alt={w.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 text-[7px] font-bold">
                                    {(w.name || '').substring(0, 1)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          <span className="text-[10px] text-slate-600 font-semibold truncate">
                            {siteRow.workers.length > 0 ? siteRow.workers.map(w => w.name).join('、') : '担当未設定'}
                          </span>
                        </div>

                        {hasDrawings && siteRow.drawings?.[0] && (
                          <a
                            href={`${API_BASE_URL}/files/pdf?path=${encodeURIComponent(siteRow.drawings[0])}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.2 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-[9px] font-bold transition-colors shrink-0"
                            title="施工図PDFを開く"
                          >
                            <FileText className="w-3 h-3 text-red-500" />
                            <span>施工図</span>
                          </a>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* ★ 右ペイン (横スクロール日付グリッド): 横スクロール時はこの領域だけがスライド! */}
            <div className="flex-1 overflow-x-auto overflow-y-hidden flex flex-col bg-slate-50">
              
              {/* 日付ヘッダー行 */}
              <div className="h-[52px] bg-slate-100 border-b border-slate-200 flex divide-x divide-slate-200 shrink-0 text-xs font-bold min-w-max">
                {timelineColumns.map((col, colIdx) => {
                  if (col.type === 'gap') {
                    // 日付省略インジケーター (横軸)
                    return (
                      <div
                        key={`gap_col_${colIdx}`}
                        className="w-16 shrink-0 py-2 px-1 bg-slate-100/90 flex flex-col items-center justify-center text-[10px] text-slate-500 font-bold border-x border-dashed border-slate-300"
                        title={`${col.gapDays}日間の工事予定がないため表示を自動省略しています`}
                      >
                        <span className="text-[9px] font-extrabold text-slate-400">⋮</span>
                        <span className="text-[9px] text-slate-500 font-extrabold">{col.gapDays}日</span>
                        <span className="text-[9px] text-slate-400">省略</span>
                      </div>
                    );
                  }

                  const isWeekend = col.dateObj.getDay() === 0 || col.dateObj.getDay() === 6;
                  const weekendColor = col.dateObj.getDay() === 0 ? 'text-rose-600' : col.dateObj.getDay() === 6 ? 'text-blue-600' : 'text-slate-800';

                  return (
                    <div
                      key={col.dateStr}
                      className={`w-48 sm:w-56 shrink-0 p-2 flex flex-col items-center justify-center gap-0.5 text-center transition-colors ${
                        col.isToday
                          ? 'bg-amber-100/80 font-extrabold text-amber-950 border-b-2 border-b-amber-500'
                          : 'bg-slate-50 hover:bg-slate-100'
                      }`}
                    >
                      <div className="flex items-center gap-1.5">
                        <span className={`text-xs font-extrabold ${weekendColor}`}>
                          {col.dateObj.getMonth() + 1}/{col.dateObj.getDate()} ({col.weekdayJa})
                        </span>
                        {col.isToday && (
                          <span className="text-[9px] font-extrabold px-1.5 py-0.2 rounded-full bg-amber-600 text-white shadow-2xs">
                            今日
                          </span>
                        )}
                      </div>
                      <span className="text-[9px] text-slate-400 font-mono">
                        {col.dateStr}
                      </span>
                    </div>
                  );
                })}
              </div>

              {/* 日付セルグリッド (縦スクロール時に左ペインと同期) */}
              <div 
                onScroll={handleRightBodyScroll}
                className="flex-1 overflow-y-auto divide-y divide-slate-200 bg-white min-w-max"
              >
                {filteredSiteRows.map(siteRow => (
                  <div
                    key={`right_${siteRow.key}`}
                    className="h-[104px] flex divide-x divide-slate-200 hover:bg-slate-50/70 transition-colors"
                  >
                    {timelineColumns.map((col, colIdx) => {
                      if (col.type === 'gap') {
                        return (
                          <div
                            key={`gap_cell_${siteRow.key}_${colIdx}`}
                            className="w-16 shrink-0 bg-slate-100/60 flex items-center justify-center text-[10px] text-slate-400 font-bold border-x border-dashed border-slate-200 select-none"
                          >
                            <span>⋮</span>
                          </div>
                        );
                      }

                      // 当日のイベント抽出
                      const dayEvs = siteRow.events.filter(e => {
                        const evStartStr = getLocalDateStr(new Date(e.start));
                        const evEndStr = e.end ? getLocalDateStr(new Date(e.end)) : evStartStr;
                        return col.dateStr >= evStartStr && col.dateStr <= evEndStr;
                      });

                      const isSiteActiveOnDate = siteRow.activeDatesSet.has(col.dateStr);

                      return (
                        <div
                          key={`${siteRow.key}_${col.dateStr}`}
                          className={`w-48 sm:w-56 shrink-0 p-2 h-[104px] flex flex-col justify-center relative group/cell transition-colors ${
                            dayEvs.length > 0
                              ? 'bg-white'
                              : isSiteActiveOnDate
                              ? 'bg-amber-50/20'
                              : 'bg-slate-50/30'
                          }`}
                        >
                          {dayEvs.length > 0 ? (
                            <div className="space-y-1 w-full max-h-full overflow-y-auto pr-0.5">
                              {dayEvs.map(ev => {
                                const { hour: sH, minute: sM } = getJstHourAndMinutes(ev.start);
                                const timeStr = ev.isAllDay ? '終日' : `${String(sH).padStart(2, '0')}:${String(sM).padStart(2, '0')}`;
                                
                                let phase = ev.constructionPhase || siteRow.phase;

                                return (
                                  <div
                                    key={ev.id}
                                    onClick={(e) => onEventClick(e, ev)}
                                    className={`p-1.5 rounded-xl border flex flex-col gap-0.5 cursor-pointer transition-all shadow-2xs hover:shadow-md hover:scale-[1.01] ${
                                      phase === 'new'
                                        ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-emerald-600'
                                        : phase === 'remaining'
                                        ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white border-amber-600'
                                        : 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white border-indigo-600'
                                    }`}
                                    title={`クリックで工事詳細を表示\n${ev.title} (${timeStr})`}
                                  >
                                    <div className="flex items-center justify-between gap-1">
                                      <div className="flex items-center gap-1 text-[10px] font-extrabold opacity-95">
                                        <Clock className="w-3 h-3 shrink-0" />
                                        <span>{timeStr}</span>
                                      </div>
                                      <span className="text-[8px] px-1 py-0.1 rounded bg-black/20 font-bold shrink-0">
                                        {phase === 'new' ? '新規' : phase === 'remaining' ? '残' : '出庫有'}
                                      </span>
                                    </div>

                                    <div className="text-[11px] font-bold leading-snug line-clamp-1">
                                      {ev.title}
                                    </div>

                                    {/* Workers */}
                                    {ev.attendees && ev.attendees.length > 0 && (
                                      <div className="text-[9px] font-semibold opacity-90 truncate flex items-center gap-1">
                                        <Users className="w-2.5 h-2.5 shrink-0" />
                                        <span>{ev.attendees.map(a => a.name).join('、')}</span>
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            /* 空セル時の「予定追加」ホバーボタン */
                            <button
                              type="button"
                              onClick={() => onOpenAddEvent(`${col.dateStr}T09:00:00`, siteRow.site, siteRow.phase)}
                              className="w-full h-full rounded-lg border border-dashed border-transparent group-hover/cell:border-slate-300 group-hover/cell:bg-indigo-50/40 text-slate-400 opacity-0 group-hover/cell:opacity-100 transition-all flex items-center justify-center gap-1 text-xs font-bold cursor-pointer"
                              title={`${siteRow.siteName} に ${col.dateStr} の工事予定を追加`}
                            >
                              <Plus className="w-3.5 h-3.5 text-indigo-600" />
                              <span className="text-indigo-600 text-[11px]">予定追加</span>
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>

          </div>
        )}
      </div>
    </div>
  );
}
