import React, { useState, useMemo } from 'react';
import { Calendar, ChevronLeft, ChevronRight, Layers, Clock, CheckCircle2, AlertCircle } from 'lucide-react';
import { Site, SiteMainPart } from '../../types/site';

interface SiteGanttViewProps {
  sites: Site[];
  onSelectSite: (site: Site) => void;
}

export const SiteGanttView: React.FC<SiteGanttViewProps> = ({ sites, onSelectSite }) => {
  // 表示基準月 (YYYY-MM)
  const [currentMonth, setCurrentMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  const [filterWorker, setFilterWorker] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // 当月の開始日・終了日・日数
  const { daysInMonth, monthDates, year, month } = useMemo(() => {
    const [yStr, mStr] = currentMonth.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const lastDay = new Date(y, m, 0).getDate();
    const dates: Array<{ dateStr: string; day: number; dayOfWeek: number }> = [];

    for (let d = 1; d <= lastDay; d++) {
      const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const dt = new Date(y, m - 1, d);
      dates.push({
        dateStr,
        day: d,
        dayOfWeek: dt.getDay() // 0: Sun, 6: Sat
      });
    }

    return { daysInMonth: lastDay, monthDates: dates, year: y, month: m };
  }, [currentMonth]);

  // 前月・翌月移動
  const handlePrevMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const prev = new Date(y, m - 2, 1);
    setCurrentMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleNextMonth = () => {
    const [y, m] = currentMonth.split('-').map(Number);
    const next = new Date(y, m, 1);
    setCurrentMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
  };

  const handleCurrentMonth = () => {
    const today = new Date();
    setCurrentMonth(`${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`);
  };

  // 施工者のユニーク一覧
  const workers = useMemo(() => {
    const set = new Map<string, string>();
    sites.forEach(s => {
      if (s.primaryWorkerId && s.primaryWorkerName) {
        set.set(s.primaryWorkerId, s.primaryWorkerName);
      }
      s.mainParts.forEach(p => {
        if (p.workerId && p.workerName) {
          set.set(p.workerId, p.workerName);
        }
      });
    });
    return Array.from(set.entries()).map(([id, name]) => ({ id, name }));
  }, [sites]);

  // フィルタリングされた現場
  const filteredSites = useMemo(() => {
    return sites.filter(site => {
      if (filterStatus !== 'all' && site.status !== filterStatus) return false;
      if (filterWorker !== 'all') {
        const matchesPrimary = site.primaryWorkerId === filterWorker;
        const matchesCo = site.coWorkers?.some(c => c.id === filterWorker);
        const matchesPart = site.mainParts.some(p => p.workerId === filterWorker);
        if (!matchesPrimary && !matchesCo && !matchesPart) return false;
      }
      return true;
    });
  }, [sites, filterWorker, filterStatus]);

  // 日付のパーセンテージ計算 (グリッド内)
  const getColOffsetAndSpan = (startDateStr?: string, endDateStr?: string) => {
    if (!startDateStr) return null;
    const startD = new Date(startDateStr);
    const endD = endDateStr ? new Date(endDateStr) : startD;

    const startY = startD.getFullYear();
    const startM = startD.getMonth() + 1;
    const endY = endD.getFullYear();
    const endM = endD.getMonth() + 1;

    // 月跨ぎ対応
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd = new Date(year, month, 0);

    if (endD < monthStart || startD > monthEnd) {
      return null; // 当月範囲外
    }

    const effectiveStart = startD < monthStart ? 1 : startD.getDate();
    const effectiveEnd = endD > monthEnd ? daysInMonth : endD.getDate();

    return {
      startCol: effectiveStart,
      span: Math.max(1, effectiveEnd - effectiveStart + 1)
    };
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
      {/* ツールバー */}
      <div className="p-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-slate-50/60">
        <div className="flex items-center gap-2">
          <div className="flex items-center bg-white border border-slate-200 rounded-lg shadow-2xs">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 hover:bg-slate-50 text-slate-600 rounded-l-lg transition-colors cursor-pointer"
              title="前月"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="px-3 py-1 font-bold text-slate-800 text-sm">
              {year}年 {month}月
            </span>
            <button
              onClick={handleNextMonth}
              className="p-1.5 hover:bg-slate-50 text-slate-600 rounded-r-lg transition-colors cursor-pointer"
              title="翌月"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
          <button
            onClick={handleCurrentMonth}
            className="px-2.5 py-1 text-xs font-semibold text-slate-600 hover:text-indigo-600 bg-white border border-slate-200 rounded-lg hover:border-indigo-300 transition-colors cursor-pointer shadow-2xs"
          >
            今月
          </button>
        </div>

        <div className="flex items-center gap-3">
          {/* 施工者絞り込み */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>担当者:</span>
            <select
              value={filterWorker}
              onChange={(e) => setFilterWorker(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 shadow-2xs"
            >
              <option value="all">全員</option>
              {workers.map(w => (
                <option key={w.id} value={w.id}>{w.name}</option>
              ))}
            </select>
          </div>

          {/* ステータス絞り込み */}
          <div className="flex items-center gap-1.5 text-xs text-slate-600">
            <span>状況:</span>
            <select
              value={filterStatus}
              onChange={(e) => setFilterStatus(e.target.value)}
              className="bg-white border border-slate-200 text-slate-700 rounded-lg px-2 py-1 text-xs focus:ring-1 focus:ring-indigo-500 shadow-2xs"
            >
              <option value="all">すべて</option>
              <option value="not_started">未着手</option>
              <option value="in_progress">進行中</option>
              <option value="completed">完了</option>
              <option value="on_hold">保留</option>
            </select>
          </div>

          {/* 凡例 */}
          <div className="hidden sm:flex items-center gap-3 text-[11px] text-slate-500 border-l border-slate-200 pl-3">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-blue-500 inline-block"></span> 現場工期
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-indigo-500 inline-block"></span> 施工日
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span> 出庫
            </span>
          </div>
        </div>
      </div>

      {/* ガントチャート本体 */}
      <div className="overflow-x-auto">
        <div className="min-w-[950px]">
          {/* ヘッダー行 (日付) */}
          <div className="flex border-b border-slate-200 bg-slate-100/70 text-xs text-slate-600 select-none">
            {/* 左側固定列 */}
            <div className="w-72 shrink-0 p-2.5 font-bold border-r border-slate-200 bg-slate-100 flex items-center justify-between">
              <span>現場 / 主要部品</span>
              <span className="text-[10px] text-slate-400 font-normal">台数 / 施工者</span>
            </div>
            {/* カレンダー列 */}
            <div
              className="flex-1 grid"
              style={{ gridTemplateColumns: `repeat(${daysInMonth}, minmax(28px, 1fr))` }}
            >
              {monthDates.map(item => {
                const isSun = item.dayOfWeek === 0;
                const isSat = item.dayOfWeek === 6;
                const isToday = 
                  new Date().getFullYear() === year &&
                  new Date().getMonth() + 1 === month &&
                  new Date().getDate() === item.day;

                return (
                  <div
                    key={item.day}
                    className={`py-1.5 text-center border-r border-slate-200/60 flex flex-col items-center justify-center ${
                      isToday ? 'bg-amber-100/80 font-bold text-amber-900 ring-1 ring-amber-400 inset-0' :
                      isSun ? 'bg-rose-50/70 text-rose-600' :
                      isSat ? 'bg-sky-50/70 text-sky-600' : ''
                    }`}
                  >
                    <span className="text-[11px] leading-tight font-medium">{item.day}</span>
                    <span className="text-[9px] text-slate-400">
                      {['日', '月', '火', '水', '木', '金', '土'][item.dayOfWeek]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* 現場行リスト */}
          {filteredSites.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-sm">
              該当する現場データがありません。
            </div>
          ) : (
            filteredSites.map(site => {
              const sitePos = getColOffsetAndSpan(site.startDate || site.constructionDate, site.endDate || site.constructionDate);

              return (
                <div key={site.id} className="border-b border-slate-200/80 hover:bg-slate-50/50 transition-colors">
                  {/* 現場 親行 */}
                  <div className="flex items-center min-h-[44px] bg-slate-50/30">
                    {/* 現場名セル */}
                    <div
                      onClick={() => onSelectSite(site)}
                      className="w-72 shrink-0 p-2.5 border-r border-slate-200 flex items-center justify-between cursor-pointer hover:bg-indigo-50/30 group"
                    >
                      <div className="min-w-0 pr-1">
                        <div className="flex items-center gap-1.5">
                          <span className="font-bold text-xs text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded border border-indigo-200/60 shrink-0">
                            {site.siteCode}
                          </span>
                          <span className="font-bold text-xs text-slate-800 truncate group-hover:text-indigo-600">
                            {site.siteName}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 truncate mt-0.5">
                          {site.customerName || '取引先未設定'}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">
                          {site.egCount}台
                        </span>
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          {site.primaryWorkerName || '担当未設定'}
                        </div>
                      </div>
                    </div>

                    {/* 現場ガントバー グリッド */}
                    <div
                      className="flex-1 grid relative h-full py-1.5"
                      style={{ gridTemplateColumns: `repeat(${daysInMonth}, minmax(28px, 1fr))` }}
                    >
                      {/* 背景グリッド線 */}
                      {monthDates.map(item => (
                        <div
                          key={item.day}
                          className={`border-r border-slate-100/80 pointer-events-none h-full ${
                            item.dayOfWeek === 0 ? 'bg-rose-50/20' : item.dayOfWeek === 6 ? 'bg-sky-50/20' : ''
                          }`}
                        />
                      ))}

                      {/* 現場全体の工期バー */}
                      {sitePos && (
                        <div
                          onClick={() => onSelectSite(site)}
                          className="absolute top-2 h-7 bg-blue-500 hover:bg-blue-600 text-white rounded-md shadow-xs px-2 flex items-center text-xs font-semibold overflow-hidden cursor-pointer transition-all z-10"
                          style={{
                            left: `${((sitePos.startCol - 1) / daysInMonth) * 100}%`,
                            width: `${(sitePos.span / daysInMonth) * 100}%`,
                          }}
                          title={`${site.siteName} (${site.startDate || ''} 〜 ${site.endDate || ''})`}
                        >
                          <span className="truncate">{site.siteName} ({site.egCount}台)</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* 主要部品 子行 (1台ずつ展開されたパーツ) */}
                  {site.mainParts.map((part, idx) => {
                    const partPos = getColOffsetAndSpan(part.constructionDate, part.constructionDate);
                    const outPos = getColOffsetAndSpan(part.outStockDate, part.outStockDate);

                    return (
                      <div key={part.id || idx} className="flex items-center min-h-[34px] border-t border-slate-100 bg-white">
                        {/* 部品名セル */}
                        <div className="w-72 shrink-0 py-1.5 px-3 pl-6 border-r border-slate-200 flex items-center justify-between text-xs">
                          <div className="flex items-center gap-1.5 truncate">
                            <Layers className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-medium text-slate-700 truncate">
                              {part.partCode}
                            </span>
                            {part.originalQuantity && part.originalQuantity > 1 && (
                              <span className="text-[10px] px-1 bg-amber-50 text-amber-700 border border-amber-200 rounded font-semibold shrink-0">
                                {part.unitIndex}/{part.originalQuantity}台目
                              </span>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="text-[11px] text-slate-500">
                              {part.workerName || site.primaryWorkerName || '未割当'}
                            </span>
                          </div>
                        </div>

                        {/* 部品ガントバー グリッド */}
                        <div
                          className="flex-1 grid relative h-full py-1"
                          style={{ gridTemplateColumns: `repeat(${daysInMonth}, minmax(28px, 1fr))` }}
                        >
                          {/* 背景グリッド線 */}
                          {monthDates.map(item => (
                            <div
                              key={item.day}
                              className={`border-r border-slate-100/60 pointer-events-none h-full ${
                                item.dayOfWeek === 0 ? 'bg-rose-50/20' : item.dayOfWeek === 6 ? 'bg-sky-50/20' : ''
                              }`}
                            />
                          ))}

                          {/* 出庫日マーカー */}
                          {outPos && (
                            <div
                              className="absolute top-1.5 h-5 bg-emerald-500 text-white rounded text-[10px] px-1 flex items-center justify-center font-bold shadow-2xs z-10"
                              style={{
                                left: `${((outPos.startCol - 1) / daysInMonth) * 100}%`,
                                width: `${(1 / daysInMonth) * 100}%`,
                              }}
                              title={`出庫予定日: ${part.outStockDate}`}
                            >
                              出
                            </div>
                          )}

                          {/* 施工日マーカー */}
                          {partPos && (
                            <div
                              onClick={() => onSelectSite(site)}
                              className="absolute top-1 h-5.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded shadow-xs px-1.5 flex items-center justify-center text-[10px] font-bold overflow-hidden cursor-pointer z-20"
                              style={{
                                left: `${((partPos.startCol - 1) / daysInMonth) * 100}%`,
                                width: `${Math.max(1, partPos.span) / daysInMonth * 100}%`,
                              }}
                              title={`施工予定日: ${part.constructionDate} / 担当: ${part.workerName || '未割当'}`}
                            >
                              <span className="truncate">施工</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
