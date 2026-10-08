import React, { useState, useMemo } from 'react';
import { User as UserIcon, Calendar, MapPin, Building, Wrench, CheckCircle2, Clock, ChevronLeft, ChevronRight, Layers, Phone } from 'lucide-react';
import { Site, SiteMainPart } from '../../types/site';
import { User } from '../../types';

interface WorkerScheduleViewProps {
  sites: Site[];
  currentUser: User;
  allUsers: User[];
  onSelectSite: (site: Site) => void;
}

export const WorkerScheduleView: React.FC<WorkerScheduleViewProps> = ({
  sites,
  currentUser,
  allUsers,
  onSelectSite
}) => {
  // 選択施工者 (デフォルトはログインユーザー)
  const [selectedWorkerId, setSelectedWorkerId] = useState<string>(currentUser.id);
  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');

  // 表示対象のユーザーオブジェクト
  const selectedUser = useMemo(() => {
    return allUsers.find(u => u.id === selectedWorkerId) || currentUser;
  }, [allUsers, selectedWorkerId, currentUser]);

  // 選択施工者が担当している「現場」および「部品施工予定」を抽出
  const myAssignments = useMemo(() => {
    const list: Array<{
      site: Site;
      part?: SiteMainPart;
      date: string;
      role: 'primary' | 'coworker' | 'part_worker';
    }> = [];

    sites.forEach(site => {
      const isPrimary = site.primaryWorkerId === selectedWorkerId;
      const isCoWorker = site.coWorkers?.some(c => c.id === selectedWorkerId);

      // 主要部品で個別アサインされているか
      site.mainParts.forEach(part => {
        if (part.workerId === selectedWorkerId && part.constructionDate) {
          list.push({
            site,
            part,
            date: part.constructionDate,
            role: 'part_worker'
          });
        }
      });

      // 現場全体の主担当または同行者としてのアサイン
      if (isPrimary && site.constructionDate) {
        // すでに部品で同一日の重複がなければ追加
        const alreadyHasPart = list.some(item => item.site.id === site.id && item.date === site.constructionDate);
        if (!alreadyHasPart) {
          list.push({
            site,
            date: site.constructionDate,
            role: 'primary'
          });
        }
      } else if (isCoWorker && site.constructionDate) {
        const alreadyHas = list.some(item => item.site.id === site.id && item.date === site.constructionDate);
        if (!alreadyHas) {
          list.push({
            site,
            date: site.constructionDate,
            role: 'coworker'
          });
        }
      }
    });

    // 日付順ソート (未来〜直近)
    return list.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  }, [sites, selectedWorkerId]);

  // 月間カレンダー用ステート
  const [calendarMonth, setCalendarMonth] = useState<string>(() => {
    const today = new Date();
    return `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
  });

  const { monthGrid, currentYear, currentMonth } = useMemo(() => {
    const [yStr, mStr] = calendarMonth.split('-');
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10);
    const firstDay = new Date(y, m - 1, 1);
    const lastDay = new Date(y, m, 0);

    const startDayOfWeek = firstDay.getDay(); // 0: 日曜
    const totalDays = lastDay.getDate();

    const cells: Array<{ dateStr: string; day: number; isCurrentMonth: boolean }> = [];

    // 前月の余白
    const prevMonthLastDay = new Date(y, m - 1, 0).getDate();
    for (let i = startDayOfWeek - 1; i >= 0; i--) {
      const d = prevMonthLastDay - i;
      const prevM = m === 1 ? 12 : m - 1;
      const prevY = m === 1 ? y - 1 : y;
      cells.push({
        dateStr: `${prevY}-${String(prevM).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        isCurrentMonth: false
      });
    }

    // 当月の日付
    for (let d = 1; d <= totalDays; d++) {
      cells.push({
        dateStr: `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        isCurrentMonth: true
      });
    }

    // 翌月の余白 (7の倍数にする)
    const remainder = (7 - (cells.length % 7)) % 7;
    for (let d = 1; d <= remainder; d++) {
      const nextM = m === 12 ? 1 : m + 1;
      const nextY = m === 12 ? y + 1 : y;
      cells.push({
        dateStr: `${nextY}-${String(nextM).padStart(2, '0')}-${String(d).padStart(2, '0')}`,
        day: d,
        isCurrentMonth: false
      });
    }

    return { monthGrid: cells, currentYear: y, currentMonth: m };
  }, [calendarMonth]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
      {/* 施工者選択ヘッダー */}
      <div className="p-4 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200 shadow-2xs">
            <UserIcon className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-semibold text-slate-600">施工者:</span>
            <select
              value={selectedWorkerId}
              onChange={(e) => setSelectedWorkerId(e.target.value)}
              className="font-bold text-sm text-slate-800 bg-transparent border-none focus:outline-none focus:ring-0 cursor-pointer"
            >
              {allUsers.map(user => (
                <option key={user.id} value={user.id}>
                  {user.name} {user.id === currentUser.id ? '(自分)' : ''}
                </option>
              ))}
            </select>
          </div>

          <span className="text-xs text-slate-500">
            乗り込み予定: <strong className="text-indigo-600 text-sm">{myAssignments.length}</strong> 件
          </span>
        </div>

        {/* 表示切替 (リスト / カレンダー) */}
        <div className="flex items-center bg-slate-200/60 p-0.5 rounded-lg text-xs font-semibold">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
              viewMode === 'list'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            スケジュール一覧
          </button>
          <button
            onClick={() => setViewMode('calendar')}
            className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
              viewMode === 'calendar'
                ? 'bg-white text-indigo-700 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            カレンダー表示
          </button>
        </div>
      </div>

      {/* リストビュー */}
      {viewMode === 'list' && (
        <div className="p-4 divide-y divide-slate-100">
          {myAssignments.length === 0 ? (
            <div className="p-12 text-center text-slate-400">
              現在、{selectedUser.name} さんがアサインされている現場・施工予定はありません。
            </div>
          ) : (
            myAssignments.map((item, idx) => {
              const { site, part, date, role } = item;
              const isPast = new Date(date).getTime() < new Date().setHours(0, 0, 0, 0);

              return (
                <div
                  key={`${site.id}-${part?.id || 'site'}-${idx}`}
                  onClick={() => onSelectSite(site)}
                  className="py-3.5 px-2 hover:bg-slate-50 rounded-lg transition-colors cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 group"
                >
                  <div className="flex items-start gap-3 min-w-0">
                    {/* 日付バッジ */}
                    <div className={`shrink-0 w-16 text-center py-2 px-1 rounded-lg border flex flex-col items-center justify-center ${
                      isPast
                        ? 'bg-slate-50 border-slate-200 text-slate-500'
                        : 'bg-indigo-50 border-indigo-200 text-indigo-700 font-bold'
                    }`}>
                      <span className="text-[10px] uppercase font-semibold leading-none">
                        {new Date(date).toLocaleDateString('ja-JP', { month: 'short' })}
                      </span>
                      <span className="text-lg font-extrabold leading-tight">
                        {new Date(date).getDate()}
                      </span>
                      <span className="text-[9px] text-slate-500">
                        {['(日)', '(月)', '(火)', '(水)', '(木)', '(金)', '(土)'][new Date(date).getDay()]}
                      </span>
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-1.5 py-0.5 rounded">
                          {site.siteCode}
                        </span>
                        <h4 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 truncate">
                          {site.siteName}
                        </h4>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                          role === 'primary' ? 'bg-blue-100 text-blue-700' :
                          role === 'part_worker' ? 'bg-purple-100 text-purple-700' :
                          'bg-slate-100 text-slate-600'
                        }`}>
                          {role === 'primary' ? '主担当' : role === 'part_worker' ? '部品施工担当' : '同行'}
                        </span>
                      </div>

                      <div className="flex items-center gap-4 text-xs text-slate-500 mt-1 flex-wrap">
                        <div className="flex items-center gap-1">
                          <Building className="w-3.5 h-3.5 text-slate-400" />
                          <span>{site.customerName || '元請未定'}</span>
                        </div>
                        {site.address && (
                          <div className="flex items-center gap-1 truncate max-w-xs">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="truncate">{site.address}</span>
                          </div>
                        )}
                        <div className="flex items-center gap-1">
                          <Layers className="w-3.5 h-3.5 text-slate-400" />
                          <span>EG: {site.egCount}台</span>
                        </div>
                      </div>

                      {/* 担当部品情報 */}
                      {part && (
                        <div className="mt-2 inline-flex items-center gap-2 bg-amber-50/80 border border-amber-200/70 text-amber-900 text-xs px-2.5 py-1 rounded-md font-medium">
                          <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span>施工対象: <strong>{part.partCode}</strong> ({part.partName})</span>
                          {part.originalQuantity && part.originalQuantity > 1 && (
                            <span className="bg-amber-200/80 text-amber-800 text-[10px] px-1 py-0.5 rounded font-bold">
                              {part.unitIndex}/{part.originalQuantity}台目
                            </span>
                          )}
                          <span className="text-[10px] text-amber-700 ml-1">
                            状況: {part.status === 'constructed' ? '施工済' : '予定'}
                          </span>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <span className="text-xs text-indigo-600 font-semibold group-hover:underline">
                      詳細を確認 →
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* カレンダービュー */}
      {viewMode === 'calendar' && (
        <div className="p-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const [y, m] = calendarMonth.split('-').map(Number);
                  const prev = new Date(y, m - 2, 1);
                  setCalendarMonth(`${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, '0')}`);
                }}
                className="p-1.5 hover:bg-slate-100 rounded border border-slate-200 text-slate-600 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <span className="font-bold text-slate-800 text-sm">
                {currentYear}年 {currentMonth}月
              </span>
              <button
                onClick={() => {
                  const [y, m] = calendarMonth.split('-').map(Number);
                  const next = new Date(y, m, 1);
                  setCalendarMonth(`${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`);
                }}
                className="p-1.5 hover:bg-slate-100 rounded border border-slate-200 text-slate-600 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
            <div className="text-xs text-slate-500">
              ※ クリックすると該当現場の詳細画面を開きます
            </div>
          </div>

          <div className="border border-slate-200 rounded-lg overflow-hidden grid grid-cols-7 bg-slate-100 gap-px">
            {['日', '月', '火', '水', '木', '金', '土'].map((dw, i) => (
              <div
                key={dw}
                className={`p-2 text-center text-xs font-bold bg-slate-50 ${
                  i === 0 ? 'text-rose-600' : i === 6 ? 'text-sky-600' : 'text-slate-700'
                }`}
              >
                {dw}
              </div>
            ))}

            {monthGrid.map((cell, idx) => {
              const dayAssignments = myAssignments.filter(a => a.date === cell.dateStr);
              const isToday = new Date().toISOString().slice(0, 10) === cell.dateStr;

              return (
                <div
                  key={cell.dateStr + idx}
                  className={`min-h-[90px] p-1.5 bg-white flex flex-col justify-between ${
                    !cell.isCurrentMonth ? 'bg-slate-50/50 text-slate-300' : ''
                  } ${isToday ? 'ring-2 ring-indigo-500 ring-inset bg-indigo-50/20' : ''}`}
                >
                  <div className="text-right">
                    <span className={`text-xs font-bold inline-block px-1 rounded ${
                      isToday ? 'bg-indigo-600 text-white' : 'text-slate-700'
                    }`}>
                      {cell.day}
                    </span>
                  </div>

                  <div className="space-y-1 mt-1 overflow-y-auto max-h-[70px]">
                    {dayAssignments.map((asg, i) => (
                      <div
                        key={i}
                        onClick={() => onSelectSite(asg.site)}
                        className="text-[10px] p-1 rounded bg-indigo-50 border border-indigo-200 hover:bg-indigo-100 text-indigo-900 font-medium cursor-pointer truncate transition-colors shadow-2xs"
                        title={`${asg.site.siteName} (${asg.part ? asg.part.partCode : '全体施工'})`}
                      >
                        <span className="font-bold text-indigo-700">[{asg.site.siteCode}]</span> {asg.site.siteName}
                        {asg.part && <span className="block text-slate-500 truncate text-[9px]">{asg.part.partCode}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
