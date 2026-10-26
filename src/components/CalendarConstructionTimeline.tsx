import React, { useState, useMemo } from 'react';
import { CalendarEvent, User, CalendarViewSettings } from '../types';
import { Site } from '../types/site';
import { 
  HardHat, 
  Clock, 
  Calendar as CalendarIcon, 
  ChevronLeft, 
  ChevronRight, 
  Plus, 
  Search, 
  FileText, 
  ExternalLink, 
  Users, 
  Package, 
  Building2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { getLocalDateStr, getJstHourAndMinutes, formatDateJST } from '../utils/dateUtils';
import { API_BASE_URL } from '../config/api';

interface CalendarConstructionTimelineProps {
  currentDate: Date;
  onChangeDate: (date: Date) => void;
  teamMembers: User[];
  allUsers: User[];
  events: CalendarEvent[];
  sites: Site[];
  onEventClick: (e: React.MouseEvent, event: CalendarEvent) => void;
  onOpenAddEvent: (dateStr?: string, prefillSite?: Site, prefillPhase?: 'new' | 'remaining' | 'shukko') => void;
  onNavigateToSite?: (siteIdOrCode: string) => void;
  calendarSettings?: CalendarViewSettings;
}

interface ConstructionRowItem {
  key: string;
  siteCode?: string;
  siteName: string;
  customerName?: string;
  egCount?: number;
  phase: 'new' | 'remaining' | 'shukko';
  event?: CalendarEvent;
  site?: Site;
  workers: User[];
  startHour: number;
  startMinute: number;
  endHour: number;
  endMinute: number;
  durationMinutes: number;
  isAllDay: boolean;
  memo?: string;
  shukkoStatus?: {
    total: number;
    completed: number;
    isTodayShukko: boolean;
  };
}

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
  const [searchQuery, setSearchQuery] = useState('');

  const dateStr = useMemo(() => getLocalDateStr(currentDate), [currentDate]);

  // 日付操作
  const handlePrevDay = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() - 1);
    onChangeDate(next);
  };

  const handleNextDay = () => {
    const next = new Date(currentDate);
    next.setDate(next.getDate() + 1);
    onChangeDate(next);
  };

  const handleToday = () => {
    onChangeDate(new Date());
  };

  // タイムライン時間軸の決定 (基本: 8:00〜19:00、設定があればそれを反映)
  const timelineStartHour = calendarSettings?.isTimeFilterActive ? (calendarSettings.workStartHour ?? 8) : 8;
  const timelineEndHour = calendarSettings?.isTimeFilterActive ? (calendarSettings.workEndHour ?? 19) : 19;
  const hoursList = useMemo(() => {
    const list: number[] = [];
    for (let h = timelineStartHour; h <= timelineEndHour; h++) {
      list.push(h);
    }
    return list;
  }, [timelineStartHour, timelineEndHour]);

  const totalTimelineMinutes = useMemo(() => {
    return Math.max(60, (timelineEndHour - timelineStartHour + 1) * 60);
  }, [timelineStartHour, timelineEndHour]);

  // 当日の工事アイテム群の抽出 & 現場情報との結合
  const constructionItems = useMemo(() => {
    const rows: ConstructionRowItem[] = [];
    const processedEventIds = new Set<string>();
    const usersMap = new Map(allUsers.map(u => [String(u.id), u]));
    const sitesMapByCode = new Map(sites.map(s => [s.siteCode?.toLowerCase(), s]));
    const sitesMapById = new Map(sites.map(s => [String(s.id), s]));

    // 1. カレンダー予定の中から当日の「工事」予定を抽出
    events.forEach(ev => {
      const isConstructionType = ev.type === 'construction' || Boolean(ev.constructionPhase) || Boolean(ev.siteId) || Boolean(ev.siteCode);
      const titleHasKeyword = ev.title.includes('工事') || ev.title.includes('出庫') || ev.title.includes('乗り込み') || ev.title.includes('現場');
      
      if (!isConstructionType && !titleHasKeyword) return;

      const evStartDateStr = getLocalDateStr(new Date(ev.start));
      const evEndDateStr = ev.end ? getLocalDateStr(new Date(ev.end)) : evStartDateStr;

      // 日付が合致するか判定
      if (dateStr < evStartDateStr || dateStr > evEndDateStr) return;

      processedEventIds.add(String(ev.id));

      // 現場の特定
      const matchedSite = (ev.siteId && sitesMapById.get(String(ev.siteId))) ||
        (ev.siteCode && sitesMapByCode.get(ev.siteCode.toLowerCase())) ||
        sites.find(s => s.siteName && ev.title.includes(s.siteName));

      // 工事フェーズの判定
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

      // 時間帯の算出 (JST)
      const { hour: sH, minute: sM } = getJstHourAndMinutes(ev.start);
      let eH = sH + 2;
      let eM = sM;
      if (ev.end) {
        const endParts = getJstHourAndMinutes(ev.end);
        eH = endParts.hour;
        eM = endParts.minute;
      }
      if (ev.isAllDay) {
        eH = timelineEndHour;
        eM = 0;
      }

      const durationMinutes = Math.max(30, (eH * 60 + eM) - (sH * 60 + sM));

      // 参加作業員
      const workers: User[] = (ev.attendees || []).map(a => usersMap.get(String(a.id)) || a);

      // 出庫情報
      let shukkoStatus = undefined;
      if (matchedSite && Array.isArray(matchedSite.mainParts)) {
        const total = matchedSite.mainParts.length;
        const completed = matchedSite.mainParts.filter(p => p.status === 'stock_out' || p.status === 'constructed' || p.status === 'inspected' || p.outStockDate).length;
        const isTodayShukko = matchedSite.mainParts.some(p => p.outStockDate === dateStr);
        shukkoStatus = { total, completed, isTodayShukko };
      }

      const siteName = ev.siteName || matchedSite?.siteName || ev.title.replace(/【.*?】/g, '').trim();
      const siteCode = ev.siteCode || matchedSite?.siteCode;
      const customerName = matchedSite?.customerName;
      const egCount = matchedSite?.egCount;

      rows.push({
        key: `ev_${ev.id}`,
        siteCode,
        siteName,
        customerName,
        egCount,
        phase,
        event: ev,
        site: matchedSite,
        workers,
        startHour: ev.isAllDay ? timelineStartHour : sH,
        startMinute: ev.isAllDay ? 0 : sM,
        endHour: ev.isAllDay ? timelineEndHour : eH,
        endMinute: ev.isAllDay ? 0 : eM,
        durationMinutes,
        isAllDay: !!ev.isAllDay,
        memo: ev.memo,
        shukkoStatus,
      });
    });

    // 2. 現場DB（internalSites）で当日が施工日になっているが、カレンダー未登録の案件を補完表示
    sites.forEach(s => {
      const isTodayConstruction = s.constructionDate === dateStr || (s.startDate && s.startDate <= dateStr && s.endDate && s.endDate >= dateStr);
      if (!isTodayConstruction) return;

      // すでに上記カレンダーイベントで取り込み済みかチェック
      const alreadyLinked = rows.some(r => r.site?.id === s.id || (r.siteCode && r.siteCode.toLowerCase() === s.siteCode?.toLowerCase()));
      if (alreadyLinked) return;

      // 担当作業員
      const workers: User[] = [];
      if (s.primaryWorkerId) {
        const u = usersMap.get(String(s.primaryWorkerId));
        if (u) workers.push(u);
      }
      if (Array.isArray(s.coWorkers)) {
        s.coWorkers.forEach(cw => {
          const u = usersMap.get(String(cw.id));
          if (u && !workers.some(w => w.id === u.id)) workers.push(u);
        });
      }

      const totalParts = s.mainParts?.length || s.egCount || 0;
      const completedParts = s.mainParts?.filter(p => p.status === 'stock_out' || p.status === 'constructed' || p.status === 'inspected' || p.outStockDate).length || 0;
      const isTodayShukko = s.mainParts?.some(p => p.outStockDate === dateStr) || false;

      rows.push({
        key: `site_${s.id}`,
        siteCode: s.siteCode,
        siteName: s.siteName,
        customerName: s.customerName,
        egCount: s.egCount,
        phase: completedParts > 0 ? 'remaining' : 'new',
        site: s,
        workers,
        startHour: 9,
        startMinute: 0,
        endHour: 17,
        endMinute: 0,
        durationMinutes: 480,
        isAllDay: true,
        memo: s.notes,
        shukkoStatus: {
          total: totalParts,
          completed: completedParts,
          isTodayShukko,
        },
      });
    });

    return rows;
  }, [events, sites, allUsers, dateStr, timelineStartHour, timelineEndHour]);

  // フィルタリング
  const filteredRows = useMemo(() => {
    return constructionItems.filter(item => {
      if (phaseFilter !== 'all' && item.phase !== phaseFilter) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.trim().toLowerCase();
        const codeMatch = (item.siteCode || '').toLowerCase().includes(q);
        const nameMatch = (item.siteName || '').toLowerCase().includes(q);
        const custMatch = (item.customerName || '').toLowerCase().includes(q);
        const workerMatch = item.workers.some(w => (w.name || '').toLowerCase().includes(q));
        if (!codeMatch && !nameMatch && !custMatch && !workerMatch) return false;
      }

      return true;
    });
  }, [constructionItems, phaseFilter, searchQuery]);

  // 集計サマリー
  const summary = useMemo(() => {
    const total = constructionItems.length;
    const newCount = constructionItems.filter(i => i.phase === 'new').length;
    const remainingCount = constructionItems.filter(i => i.phase === 'remaining').length;
    const shukkoCount = constructionItems.filter(i => i.phase === 'shukko').length;
    const todayShukkoCount = constructionItems.filter(i => i.shukkoStatus?.isTodayShukko).length;

    // 稼働作業員数
    const workerIds = new Set<string>();
    constructionItems.forEach(i => {
      i.workers.forEach(w => workerIds.add(String(w.id)));
    });

    return {
      total,
      newCount,
      remainingCount,
      shukkoCount,
      todayShukkoCount,
      workerCount: workerIds.size,
    };
  }, [constructionItems]);

  // タイムラインバーの座標・幅のパーセント計算
  const getTimelineBarStyles = (item: ConstructionRowItem): React.CSSProperties => {
    const itemStartTotalMinutes = item.startHour * 60 + item.startMinute;
    const timelineStartTotalMinutes = timelineStartHour * 60;
    
    // 開始位置 (分)
    const offsetMinutes = Math.max(0, itemStartTotalMinutes - timelineStartTotalMinutes);
    const leftPercent = (offsetMinutes / totalTimelineMinutes) * 100;
    const widthPercent = Math.min(100 - leftPercent, (item.durationMinutes / totalTimelineMinutes) * 100);

    return {
      left: `${Math.max(0, Math.min(95, leftPercent))}%`,
      width: `${Math.max(4, Math.min(100, widthPercent))}%`,
    };
  };

  return (
    <div className="w-full h-full flex flex-col bg-slate-50 overflow-hidden text-slate-800">
      {/* 1. Header Toolbar */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-2xs">
        {/* Date Selector */}
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200">
            <button
              onClick={handlePrevDay}
              className="p-1 hover:bg-white rounded text-slate-600 transition-colors cursor-pointer"
              title="前日"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              onClick={handleToday}
              className="px-2 py-0.5 text-xs font-bold text-slate-700 hover:bg-white rounded transition-colors cursor-pointer"
            >
              今日
            </button>
            <button
              onClick={handleNextDay}
              className="p-1 hover:bg-white rounded text-slate-600 transition-colors cursor-pointer"
              title="翌日"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex items-center gap-2">
            <CalendarIcon className="w-4 h-4 text-amber-600 shrink-0" />
            <h2 className="text-sm sm:text-base font-extrabold text-slate-800">
              {new Intl.DateTimeFormat('ja-JP', { timeZone: 'Asia/Tokyo', year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(currentDate)}
            </h2>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-amber-50 text-amber-800 border border-amber-200">
              工事タイムライン
            </span>
          </div>
        </div>

        {/* Right CTA & Search */}
        <div className="flex items-center gap-2 flex-1 justify-end">
          {/* 検索入力 */}
          <div className="relative max-w-xs w-full hidden sm:block">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="現場名・現場コード・担当者で絞り込み..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-2.5 py-1 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-amber-500"
            />
          </div>

          <button
            onClick={() => onOpenAddEvent(`${dateStr}T09:00:00`)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-600 hover:bg-amber-700 active:bg-amber-800 text-white text-xs font-bold rounded-lg shadow-2xs transition-colors cursor-pointer shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>工事予定を追加</span>
          </button>
        </div>
      </div>

      {/* 2. Summary KPI Bar & Phase Filter */}
      <div className="bg-white border-b border-slate-200 px-3 sm:px-4 py-2 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
        {/* KPI Counts */}
        <div className="flex items-center gap-1.5 sm:gap-3 text-xs overflow-x-auto py-0.5">
          <div className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded-lg font-bold text-slate-700">
            <HardHat className="w-3.5 h-3.5 text-slate-500" />
            <span>全工事: {summary.total}件</span>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 bg-emerald-50 border border-emerald-200/80 rounded-lg font-bold text-emerald-800">
            <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
            <span>【新規】: {summary.newCount}件</span>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 bg-amber-50 border border-amber-200/80 rounded-lg font-bold text-amber-800">
            <span className="w-2 h-2 rounded-full bg-amber-500"></span>
            <span>【残】: {summary.remainingCount}件</span>
          </div>
          <div className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 border border-indigo-200/80 rounded-lg font-bold text-indigo-800">
            <span className="w-2 h-2 rounded-full bg-indigo-500"></span>
            <span>【出庫有】: {summary.shukkoCount}件</span>
          </div>
          {summary.todayShukkoCount > 0 && (
            <div className="flex items-center gap-1 px-2.5 py-1 bg-rose-50 border border-rose-200 rounded-lg font-bold text-rose-700 animate-pulse">
              <Package className="w-3.5 h-3.5 text-rose-600" />
              <span>本日出庫: {summary.todayShukkoCount}件</span>
            </div>
          )}
          <div className="flex items-center gap-1 px-2.5 py-1 bg-slate-100 rounded-lg font-bold text-slate-600">
            <Users className="w-3.5 h-3.5 text-slate-500" />
            <span>稼働: {summary.workerCount}名</span>
          </div>
        </div>

        {/* Phase Filter Segmented */}
        <div className="flex items-center bg-slate-100 p-0.5 rounded-lg border border-slate-200 text-xs font-bold">
          <button
            onClick={() => setPhaseFilter('all')}
            className={`px-2.5 py-1 rounded transition-colors cursor-pointer ${
              phaseFilter === 'all' ? 'bg-white text-slate-800 shadow-2xs font-extrabold' : 'text-slate-600 hover:text-slate-800'
            }`}
          >
            すべて
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

      {/* 3. Timeline Gantt Grid Container */}
      <div className="flex-1 overflow-auto bg-slate-100 flex flex-col">
        {filteredRows.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center p-8 text-center bg-white m-3 rounded-2xl border border-slate-200">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center mb-3 shadow-inner">
              <HardHat className="w-8 h-8" />
            </div>
            <h3 className="text-sm font-bold text-slate-800 mb-1">
              この日の工事・現場予定はありません
            </h3>
            <p className="text-xs text-slate-500 max-w-sm mb-4 leading-relaxed">
              {phaseFilter !== 'all'
                ? `現在「${phaseFilter === 'new' ? '新規' : phaseFilter === 'remaining' ? '残工事' : '出庫有'}」で絞り込み中です。フィルターを解除するか工事予定を追加してください。`
                : '前後の日付を選択するか、「工事予定を追加」ボタンから現場の乗り込みスケジュールを登録してください。'}
            </p>
            <button
              onClick={() => onOpenAddEvent(`${dateStr}T09:00:00`)}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>工事予定を新規作成</span>
            </button>
          </div>
        ) : (
          <div className="min-w-[900px] bg-white flex flex-col divide-y divide-slate-200">
            {/* Timeline Header Row (Sticky) */}
            <div className="sticky top-0 z-30 bg-slate-100 text-slate-700 text-xs font-bold border-b border-slate-200 flex">
              {/* Left Column Header (現場・案件情報) */}
              <div className="w-[340px] shrink-0 p-2.5 border-r border-slate-200 flex items-center justify-between bg-slate-100 sticky left-0 z-40">
                <span>現場案件 / 取引先 / 担当作業者</span>
                <span className="text-[10px] text-slate-500 font-semibold">{filteredRows.length}件</span>
              </div>

              {/* Right Column Header (時間軸目盛り) */}
              <div className="flex-1 flex relative divide-x divide-slate-200/80 bg-slate-50">
                {hoursList.map(hour => (
                  <div
                    key={hour}
                    className="flex-1 py-2 text-center text-[11px] font-bold text-slate-600 select-none"
                  >
                    <span>{String(hour).padStart(2, '0')}:00</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Timeline Rows */}
            <div className="divide-y divide-slate-100 bg-white">
              {filteredRows.map(item => {
                const phaseBadge = (
                  <span className={`px-2 py-0.5 rounded font-black text-[10px] tracking-tight shrink-0 shadow-2xs ${
                    item.phase === 'new'
                      ? 'bg-emerald-600 text-white'
                      : item.phase === 'remaining'
                      ? 'bg-amber-500 text-white'
                      : 'bg-indigo-600 text-white'
                  }`}>
                    {item.phase === 'new' ? '【新規】' : item.phase === 'remaining' ? '【残】' : '【出庫有】'}
                  </span>
                );

                const hasDrawings = item.site?.drawings && item.site.drawings.length > 0;

                return (
                  <div key={item.key} className="flex hover:bg-slate-50/80 transition-colors group">
                    {/* Left Info Column */}
                    <div className="w-[340px] shrink-0 p-3 border-r border-slate-200 flex flex-col justify-between gap-1.5 bg-white group-hover:bg-slate-50/80 transition-colors sticky left-0 z-20">
                      <div>
                        {/* Site Code & Phase & EG Count */}
                        <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                          {phaseBadge}
                          {item.siteCode && (
                            <span className="font-mono text-[11px] font-bold px-1.5 py-0.2 bg-slate-100 border border-slate-200 rounded text-slate-700">
                              {item.siteCode}
                            </span>
                          )}
                          {item.egCount !== undefined && item.egCount > 0 && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 bg-indigo-50 border border-indigo-200 text-indigo-700 rounded">
                              EG {item.egCount}台
                            </span>
                          )}
                          {item.shukkoStatus?.completed !== undefined && (
                            <span className={`text-[9px] font-bold px-1.5 py-0.2 rounded border ${
                              item.shukkoStatus.completed >= item.shukkoStatus.total
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                            }`}>
                              出庫: {item.shukkoStatus.completed}/{item.shukkoStatus.total}台
                            </span>
                          )}
                        </div>

                        {/* Site Name */}
                        <div className="flex items-start justify-between gap-1">
                          <h4 
                            onClick={(e) => {
                              if (item.event) onEventClick(e, item.event);
                            }}
                            className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1 cursor-pointer"
                            title={item.siteName}
                          >
                            {item.siteName}
                          </h4>

                          {/* 現場詳細遷移リンク */}
                          {item.site && onNavigateToSite && (
                            <button
                              type="button"
                              onClick={() => onNavigateToSite(item.site!.id || item.site!.siteCode)}
                              className="text-slate-400 hover:text-indigo-600 p-0.5 rounded transition-colors shrink-0"
                              title="現場管理の詳細画面へ遷移"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>

                        {/* Customer */}
                        {item.customerName && (
                          <div className="text-[11px] text-slate-500 truncate mt-0.5">
                            取引先: {item.customerName}
                          </div>
                        )}
                      </div>

                      {/* Footer: Workers & Drawings Link */}
                      <div className="flex items-center justify-between gap-1 pt-1 border-t border-slate-100">
                        {/* Worker Avatars & Names */}
                        <div className="flex items-center gap-1.5 min-w-0 flex-1">
                          <div className="flex items-center -space-x-1 shrink-0">
                            {item.workers.slice(0, 3).map((w, idx) => (
                              <div
                                key={w.id || idx}
                                className="w-5 h-5 rounded-full ring-1 ring-white bg-slate-200 overflow-hidden shrink-0"
                                title={w.name}
                              >
                                {w.avatarUrl ? (
                                  <img src={w.avatarUrl} alt={w.name} className="w-full h-full object-cover" />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 text-[8px] font-bold">
                                    {(w.name || '').substring(0, 1)}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                          <span className="text-[10px] text-slate-600 font-semibold truncate">
                            {item.workers.length > 0 ? item.workers.map(w => w.name).join('、') : '担当未設定'}
                          </span>
                        </div>

                        {/* Drawing PDF badge */}
                        {hasDrawings && item.site?.drawings?.[0] && (
                          <a
                            href={`${API_BASE_URL}/files/pdf?path=${encodeURIComponent(item.site.drawings[0])}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 bg-red-50 hover:bg-red-100 text-red-700 border border-red-200 rounded text-[9px] font-bold transition-colors shrink-0"
                            title="施工図PDFを開く"
                          >
                            <FileText className="w-3 h-3 text-red-500" />
                            <span>施工図</span>
                          </a>
                        )}
                      </div>
                    </div>

                    {/* Right Timeline Grid Area */}
                    <div className="flex-1 relative flex divide-x divide-slate-100 py-3 px-2 min-h-[70px] bg-slate-50/40">
                      {/* Hour column background guides */}
                      {hoursList.map(hour => (
                        <div key={hour} className="flex-1 h-full pointer-events-none" />
                      ))}

                      {/* Visual Gantt Bar */}
                      <div
                        style={getTimelineBarStyles(item)}
                        onClick={(e) => {
                          if (item.event) onEventClick(e, item.event);
                        }}
                        className={`absolute top-2.5 bottom-2.5 rounded-xl border flex flex-col justify-center px-3 py-1 cursor-pointer transition-all shadow-2xs hover:shadow-md hover:scale-[1.008] z-10 ${
                          item.phase === 'new'
                            ? 'bg-gradient-to-r from-emerald-500 to-emerald-600 text-white border-emerald-600'
                            : item.phase === 'remaining'
                            ? 'bg-gradient-to-r from-amber-500 to-amber-600 text-white border-amber-600'
                            : 'bg-gradient-to-r from-indigo-500 to-indigo-600 text-white border-indigo-600'
                        }`}
                        title={`クリックで詳細\n${item.siteName} (${String(item.startHour).padStart(2, '0')}:${String(item.startMinute).padStart(2, '0')} ～ ${String(item.endHour).padStart(2, '0')}:${String(item.endMinute).padStart(2, '0')})`}
                      >
                        <div className="flex items-center justify-between gap-1 overflow-hidden">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <Clock className="w-3.5 h-3.5 opacity-90 shrink-0" />
                            <span className="font-extrabold text-[11px] tracking-tight shrink-0">
                              {String(item.startHour).padStart(2, '0')}:{String(item.startMinute).padStart(2, '0')}
                              {!item.isAllDay && ` ～ ${String(item.endHour).padStart(2, '0')}:${String(item.endMinute).padStart(2, '0')}`}
                            </span>
                            <span className="text-xs font-bold truncate">
                              {item.siteName}
                            </span>
                          </div>

                          <span className="text-[10px] px-1.5 py-0.2 rounded-full bg-black/20 font-bold shrink-0">
                            {item.phase === 'new' ? '新規乗り込み' : item.phase === 'remaining' ? '残工事' : '出庫有工事'}
                          </span>
                        </div>

                        {item.memo && (
                          <div className="text-[10px] opacity-90 truncate font-normal mt-0.5">
                            {item.memo}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
