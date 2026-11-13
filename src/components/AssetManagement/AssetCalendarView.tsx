import React, { useState, useMemo } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  CheckCircle2,
  Filter
} from 'lucide-react';
import {
  AssetAlertInfo,
  AssetCategory,
  AssetItem,
  AssetLogItem,
  OfficeMaster
} from '../../types';
import {
  computeAssetAlerts,
  formatAssetDateJa,
  getAssetIconComponent,
  getJstTodayStr
} from '../../utils/assets';

interface AssetCalendarViewProps {
  assets: AssetItem[];
  categories: AssetCategory[];
  logs: AssetLogItem[];
  offices: OfficeMaster[];
  onSelectAsset: (asset: AssetItem) => void;
}

interface CalendarPlotItem {
  id: string;
  dateStr: string;
  asset: AssetItem;
  category?: AssetCategory;
  title: string;
  badgeType: 'inspection' | 'replacement' | 'history' | 'other_date';
  overdue?: boolean;
}

const WEEKDAYS_JA = ['日', '月', '火', '水', '木', '金', '土'];

export function AssetCalendarView({
  assets,
  categories,
  logs,
  offices,
  onSelectAsset
}: AssetCalendarViewProps) {
  const todayStr = getJstTodayStr();
  const [currentYear, setCurrentYear] = useState<number>(() =>
    parseInt(todayStr.slice(0, 4), 10)
  );
  const [currentMonth, setCurrentMonth] = useState<number>(() =>
    parseInt(todayStr.slice(5, 7), 10)
  );
  const [filterCategoryId, setFilterCategoryId] = useState<string>('all');
  const [filterOfficeId, setFilterOfficeId] = useState<string>('all');
  const [showHistoryLogs, setShowHistoryLogs] = useState<boolean>(true);
  const [selectedDayStr, setSelectedDayStr] = useState<string | null>(null);

  const handlePrevMonth = () => {
    if (currentMonth === 1) {
      setCurrentYear((y) => y - 1);
      setCurrentMonth(12);
    } else {
      setCurrentMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (currentMonth === 12) {
      setCurrentYear((y) => y + 1);
      setCurrentMonth(1);
    } else {
      setCurrentMonth((m) => m + 1);
    }
  };

  const handleToday = () => {
    setCurrentYear(parseInt(todayStr.slice(0, 4), 10));
    setCurrentMonth(parseInt(todayStr.slice(5, 7), 10));
    setSelectedDayStr(todayStr);
  };

  // Filter active assets
  const filteredAssets = useMemo(() => {
    return assets.filter((a) => {
      if (a.status === 'retired') return false;
      if (filterCategoryId !== 'all' && a.categoryId !== filterCategoryId) return false;
      if (filterOfficeId !== 'all' && a.officeId !== filterOfficeId && a.office !== filterOfficeId) {
        return false;
      }
      return true;
    });
  }, [assets, filterCategoryId, filterOfficeId]);

  const filteredAssetMap = useMemo(() => {
    const map = new Map<string, AssetItem>();
    filteredAssets.forEach((a) => map.set(a.id, a));
    return map;
  }, [filteredAssets]);

  // All alerts sorted by urgency
  const allAlerts = useMemo(() => {
    const items: Array<{ alert: AssetAlertInfo; asset: AssetItem; category?: AssetCategory }> = [];
    for (const asset of filteredAssets) {
      const cat = categories.find((c) => c.id === asset.categoryId);
      const alerts = computeAssetAlerts(asset, cat, todayStr);
      for (const alert of alerts) {
        items.push({ alert, asset, category: cat });
      }
    }
    return items.sort((a, b) => a.alert.daysRemaining - b.alert.daysRemaining);
  }, [filteredAssets, categories, todayStr]);

  // Build calendar plot items keyed by YYYY-MM-DD
  const plotsByDate = useMemo(() => {
    const map: Record<string, CalendarPlotItem[]> = {};
    const addPlot = (item: CalendarPlotItem) => {
      if (!map[item.dateStr]) map[item.dateStr] = [];
      map[item.dateStr].push(item);
    };

    for (const asset of filteredAssets) {
      const cat = categories.find((c) => c.id === asset.categoryId);
      if (!cat) continue;
      for (const field of cat.fields || []) {
        if (field.type !== 'date') continue;
        const rawDate = asset.attributes?.[field.key];
        if (!rawDate) continue;
        const dStr = String(rawDate).slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) continue;

        // 納車日・購入日・支給日・最終点検日はスキップしてカレンダーを見やすく保つ（予定・期限中心）
        const isScheduleOrExpiry =
          Boolean(field.alertRule) ||
          field.label.includes('予定') ||
          field.label.includes('満期') ||
          field.label.includes('満了') ||
          field.label.includes('期限');
        if (!isScheduleOrExpiry) continue;

        const badgeType: CalendarPlotItem['badgeType'] =
          field.alertRule?.kind === 'replacement' || field.label.includes('リース')
            ? 'replacement'
            : field.alertRule?.kind === 'inspection' ||
              field.label.includes('点検') ||
              field.label.includes('車検') ||
              field.label.includes('校正')
            ? 'inspection'
            : 'other_date';

        addPlot({
          id: `${asset.id}-${field.key}`,
          dateStr: dStr,
          asset,
          category: cat,
          title: `${asset.name} (${field.label})`,
          badgeType,
          overdue: dStr < todayStr
        });
      }
    }

    if (showHistoryLogs) {
      for (const log of logs) {
        if (
          log.actionType !== 'inspection' &&
          log.actionType !== 'repair' &&
          log.actionType !== 'replacement'
        ) {
          continue;
        }
        const asset = filteredAssetMap.get(log.assetId);
        if (!asset) continue;
        const dStr = (log.eventDate || '').slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(dStr)) continue;
        const cat = categories.find((c) => c.id === asset.categoryId);
        addPlot({
          id: `log-${log.id}`,
          dateStr: dStr,
          asset,
          category: cat,
          title: `${asset.name} [${log.actionType === 'repair' ? '修理' : '実施'}] ${log.summary}`,
          badgeType: 'history'
        });
      }
    }

    return map;
  }, [filteredAssets, filteredAssetMap, categories, logs, showHistoryLogs, todayStr]);

  // Build JST Month Grid (Sunday start)
  const calendarDays = useMemo(() => {
    const firstDayJst = new Date(
      `${currentYear}-${String(currentMonth).padStart(2, '0')}-01T00:00:00+09:00`
    );
    const startWeekday = new Date(firstDayJst.getTime() + 9 * 60 * 60 * 1000).getUTCDay();
    const daysInMonth = new Date(Date.UTC(currentYear, currentMonth, 0)).getUTCDate();

    const cells: Array<{ dateStr: string; dayNum: number; isCurrentMonth: boolean }> = [];

    // Prev month padding
    const prevMonthYear = currentMonth === 1 ? currentYear - 1 : currentYear;
    const prevMonth = currentMonth === 1 ? 12 : currentMonth - 1;
    const daysInPrev = new Date(Date.UTC(prevMonthYear, prevMonth, 0)).getUTCDate();
    for (let i = startWeekday - 1; i >= 0; i--) {
      const d = daysInPrev - i;
      cells.push({
        dateStr: `${prevMonthYear}-${String(prevMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dayNum: d,
        isCurrentMonth: false
      });
    }

    // Current month
    for (let d = 1; d <= daysInMonth; d++) {
      cells.push({
        dateStr: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        dayNum: d,
        isCurrentMonth: true
      });
    }

    // Next month padding to 35 or 42 cells
    const nextMonthYear = currentMonth === 12 ? currentYear + 1 : currentYear;
    const nextMonth = currentMonth === 12 ? 1 : currentMonth + 1;
    let nextDay = 1;
    while (cells.length % 7 !== 0) {
      cells.push({
        dateStr: `${nextMonthYear}-${String(nextMonth).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`,
        dayNum: nextDay,
        isCurrentMonth: false
      });
      nextDay++;
    }

    return cells;
  }, [currentYear, currentMonth]);

  const selectedDayPlots = selectedDayStr ? plotsByDate[selectedDayStr] || [] : [];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-5">
      {/* Main Calendar */}
      <div className="xl:col-span-8 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
        {/* Toolbar */}
        <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <h3 className="text-base font-bold text-slate-900 min-w-[120px] text-center">
              {currentYear}年 {currentMonth}月
            </h3>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-slate-600 cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="px-2.5 py-1 rounded-lg text-xs font-bold border border-slate-200 bg-white hover:bg-slate-100 text-slate-700 cursor-pointer ml-1"
            >
              今日 (JST)
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-1 text-xs text-slate-500">
              <Filter className="w-3.5 h-3.5" />
            </div>
            <select
              value={filterCategoryId}
              onChange={(e) => setFilterCategoryId(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="all">すべての資産種類</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              value={filterOfficeId}
              onChange={(e) => setFilterOfficeId(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
            >
              <option value="all">すべての拠点</option>
              {offices.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
            <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs bg-white border border-slate-200 text-slate-700 cursor-pointer whitespace-nowrap">
              <input
                type="checkbox"
                checked={showHistoryLogs}
                onChange={(e) => setShowHistoryLogs(e.target.checked)}
                className="rounded border-slate-300 text-emerald-600"
              />
              実施履歴を表示
            </label>
          </div>
        </div>

        {/* Legend */}
        <div className="px-4 py-2 bg-white border-b border-slate-100 flex flex-wrap items-center gap-4 text-[11px] text-slate-600">
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-amber-400" />
            点検・車検・校正予定
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-purple-500" />
            リース満了・入替期限
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-rose-500" />
            期限超過
          </span>
          <span className="inline-flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-xs bg-emerald-500" />
            実施済み点検・修理履歴
          </span>
        </div>

        {/* Grid Header */}
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50">
          {WEEKDAYS_JA.map((day, idx) => (
            <div
              key={day}
              className={`py-2 text-center text-xs font-bold ${
                idx === 0
                  ? 'text-rose-600'
                  : idx === 6
                  ? 'text-sky-600'
                  : 'text-slate-600'
              }`}
            >
              {day}
            </div>
          ))}
        </div>

        {/* Calendar Cells */}
        <div className="grid grid-cols-7 divide-x divide-y divide-slate-200">
          {calendarDays.map((cell) => {
            const plots = plotsByDate[cell.dateStr] || [];
            const isToday = cell.dateStr === todayStr;
            const isSelected = cell.dateStr === selectedDayStr;

            return (
              <div
                key={cell.dateStr}
                onClick={() => setSelectedDayStr(cell.dateStr)}
                className={`min-h-[92px] p-1.5 transition-colors cursor-pointer ${
                  !cell.isCurrentMonth
                    ? 'bg-slate-50/70 text-slate-400'
                    : isSelected
                    ? 'bg-indigo-50/60'
                    : 'bg-white hover:bg-slate-50/60'
                }`}
              >
                <div className="flex items-center justify-between mb-1">
                  <span
                    className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                      isToday
                        ? 'bg-indigo-600 text-white'
                        : cell.isCurrentMonth
                        ? 'text-slate-700'
                        : 'text-slate-400'
                    }`}
                  >
                    {cell.dayNum}
                  </span>
                  {plots.length > 0 && (
                    <span className="text-[10px] font-semibold text-slate-400">
                      {plots.length}件
                    </span>
                  )}
                </div>

                <div className="space-y-1">
                  {plots.slice(0, 3).map((item) => {
                    const cls =
                      item.badgeType === 'history'
                        ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                        : item.overdue
                        ? 'bg-rose-50 text-rose-800 border-rose-200 font-bold'
                        : item.badgeType === 'replacement'
                        ? 'bg-purple-50 text-purple-800 border-purple-200'
                        : 'bg-amber-50 text-amber-900 border-amber-200';
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectAsset(item.asset);
                        }}
                        title={item.title}
                        className={`w-full text-left px-1.5 py-0.5 rounded border text-[10px] truncate cursor-pointer hover:opacity-80 ${cls}`}
                      >
                        {item.title}
                      </button>
                    );
                  })}
                  {plots.length > 3 && (
                    <div className="text-[10px] text-indigo-600 font-semibold pl-1">
                      +{plots.length - 3}件
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Selected day detail strip */}
        {selectedDayStr && (
          <div className="p-3.5 bg-slate-50 border-t border-slate-200">
            <div className="text-xs font-bold text-slate-700 mb-2">
              {formatAssetDateJa(selectedDayStr)} の予定・履歴（{selectedDayPlots.length}件）
            </div>
            {selectedDayPlots.length === 0 ? (
              <div className="text-xs text-slate-400">この日の予定・履歴はありません</div>
            ) : (
              <div className="flex flex-wrap gap-2">
                {selectedDayPlots.map((item) => {
                  const IconComp = getAssetIconComponent(item.category?.icon);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => onSelectAsset(item.asset)}
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:border-indigo-300 text-xs text-slate-800 shadow-2xs cursor-pointer"
                    >
                      <IconComp className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                      <span className="font-medium">{item.title}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Right Sidebar: Active Alerts List */}
      <div className="xl:col-span-4 bg-white rounded-2xl border border-slate-200 shadow-xs flex flex-col overflow-hidden max-h-[720px]">
        <div className="p-4 border-b border-slate-200 bg-slate-50/70">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              点検・入替アラート一覧
            </h3>
            <span className="px-2 py-0.5 text-xs font-bold rounded-full bg-amber-100 text-amber-800">
              {allAlerts.length}件
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-1">
            点検・車検（1ヶ月前）とリース満了入替（6ヶ月前）を自動検知します
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-3 space-y-2">
          {allAlerts.length === 0 ? (
            <div className="text-center py-12 text-xs text-slate-400 space-y-2">
              <CheckCircle2 className="w-8 h-8 text-emerald-400 mx-auto" />
              <div>現在アラート対象の資産はありません</div>
            </div>
          ) : (
            allAlerts.map(({ alert, asset, category }) => {
              const IconComp = getAssetIconComponent(category?.icon);
              const badgeCls =
                alert.severity === 'overdue'
                  ? 'bg-rose-50 border-rose-200 text-rose-900'
                  : alert.severity === 'warning'
                  ? 'bg-amber-50 border-amber-200 text-amber-900'
                  : 'bg-purple-50 border-purple-200 text-purple-900';

              return (
                <button
                  key={`${asset.id}-${alert.fieldKey}`}
                  type="button"
                  onClick={() => onSelectAsset(asset)}
                  className={`w-full text-left p-3 rounded-xl border transition-all hover:shadow-xs cursor-pointer space-y-1 ${badgeCls}`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold truncate">
                      {alert.severity === 'overdue' ? (
                        <AlertOctagon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                      ) : (
                        <CalendarClock className="w-3.5 h-3.5 shrink-0" />
                      )}
                      {alert.ruleLabel}
                    </span>
                    <span
                      className={`px-1.5 py-0.5 rounded text-[10px] font-extrabold whitespace-nowrap ${
                        alert.severity === 'overdue'
                          ? 'bg-rose-600 text-white'
                          : alert.severity === 'warning'
                          ? 'bg-amber-500 text-white'
                          : 'bg-purple-600 text-white'
                      }`}
                    >
                      {alert.daysRemaining < 0
                        ? `${Math.abs(alert.daysRemaining)}日超過`
                        : `あと${alert.daysRemaining}日`}
                    </span>
                  </div>

                  <div className="flex items-center gap-1.5 text-sm font-bold text-slate-900 truncate">
                    <IconComp className="w-3.5 h-3.5 text-slate-600 shrink-0" />
                    <span className="truncate">{asset.name}</span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] opacity-85">
                    <span>
                      {alert.fieldLabel}: {formatAssetDateJa(alert.targetDate)}
                    </span>
                    <span>
                      {asset.isShared
                        ? '共用'
                        : asset.assigneeUserName || '未割当'}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
