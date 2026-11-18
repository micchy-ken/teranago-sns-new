import React, { useState, useMemo } from 'react';
import {
  AlertOctagon,
  CalendarClock,
  CheckCircle2,
  ClipboardList,
  Search,
  Gauge,
  Wrench
} from 'lucide-react';
import {
  AssetCategory,
  AssetItem,
  AssetLogItem,
  OfficeMaster,
  User
} from '../../types';
import {
  formatAssetDateJa,
  getActiveScheduledInspection,
  getAssetIconComponent,
  getCategoryTheme,
  getConfirmedInspectionLogs,
  getCategoryInspectionItems,
  getDerivedLastInspectionDate,
  getEffectiveAssetMileage,
  getJstTodayStr
} from '../../utils/assets';
import { isSameOffice, resolveOfficeName } from '../../utils/masterResolver';

interface AssetInspectionListViewProps {
  assets: AssetItem[];
  categories: AssetCategory[];
  logs: AssetLogItem[];
  users: User[];
  offices: OfficeMaster[];
  onSaveScheduledInspection: (params: {
    assetId: string;
    logId?: string;
    eventDate: string;
    inspectionType?: string;
    vendor?: string;
  }) => Promise<void>;
  onSaveAssetInline: (asset: AssetItem, patch: Partial<AssetItem>) => Promise<void>;
  onOpenConfirmModal: (asset: AssetItem) => void;
  onOpenDetailModal: (asset: AssetItem, subTab?: 'details' | 'inspections' | 'history') => void;
  onOpenCategoryEditor?: (category: AssetCategory) => void;
}

type InspectionStatusFilter = 'all' | 'due_confirm' | 'scheduled' | 'unscheduled' | 'has_confirmed';

export function AssetInspectionListView({
  assets,
  categories,
  logs,
  users,
  offices,
  onSaveScheduledInspection,
  onSaveAssetInline,
  onOpenConfirmModal,
  onOpenDetailModal,
  onOpenCategoryEditor
}: AssetInspectionListViewProps) {
  const todayStr = getJstTodayStr();
  const [statusFilter, setStatusFilter] = useState<InspectionStatusFilter>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [query, setQuery] = useState<string>('');
  const [editingCell, setEditingCell] = useState<{
    assetId: string;
    col: 'scheduleDate' | 'inspectionType' | 'vendor';
  } | null>(null);
  const [draftVal, setDraftVal] = useState<string>('');
  const [savingId, setSavingId] = useState<string | null>(null);

  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const userMap = useMemo(() => new Map(users.map((u) => [String(u.id), u])), [users]);

  const enrichedRows = useMemo(() => {
    return assets
      .filter((a) => a.status !== 'retired')
      .map((asset) => {
        const category = categoryMap.get(asset.categoryId);
        const scheduled = getActiveScheduledInspection(asset, logs, todayStr);
        const confirmedLogs = getConfirmedInspectionLogs(asset.id, logs);
        const lastInspectionDate = getDerivedLastInspectionDate(asset, logs);
        const mileageInfo = getEffectiveAssetMileage(asset);
        const checklistCount = getCategoryInspectionItems(category).length;
        return {
          asset,
          category,
          scheduled,
          confirmedLogs,
          lastInspectionDate,
          mileageInfo,
          checklistCount
        };
      });
  }, [assets, categoryMap, logs, todayStr]);

  const counts = useMemo(() => {
    let dueConfirm = 0;
    let scheduledCount = 0;
    let unscheduled = 0;
    let hasConfirmed = 0;
    for (const r of enrichedRows) {
      if (r.scheduled) {
        scheduledCount++;
        if (r.scheduled.isDueOrOverdue) dueConfirm++;
      } else {
        unscheduled++;
      }
      if (r.confirmedLogs.length > 0) hasConfirmed++;
    }
    return {
      all: enrichedRows.length,
      dueConfirm,
      scheduledCount,
      unscheduled,
      hasConfirmed
    };
  }, [enrichedRows]);

  const filteredRows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return enrichedRows
      .filter((r) => {
        if (statusFilter === 'due_confirm' && (!r.scheduled || !r.scheduled.isDueOrOverdue)) {
          return false;
        }
        if (statusFilter === 'scheduled' && !r.scheduled) return false;
        if (statusFilter === 'unscheduled' && r.scheduled) return false;
        if (statusFilter === 'has_confirmed' && r.confirmedLogs.length === 0) return false;

        if (categoryFilter !== 'all' && r.asset.categoryId !== categoryFilter) return false;
        if (officeFilter !== 'all') {
          const off = r.asset.officeId || r.asset.office || '';
          if (!isSameOffice(off, officeFilter, offices)) return false;
        }
        if (q) {
          const hay = `${r.asset.name} ${r.asset.assetCode} ${r.asset.assigneeUserName || ''} ${
            r.scheduled?.vendor || r.asset.attributes?.inspectionVendor || ''
          } ${r.scheduled?.inspectionType || r.asset.attributes?.inspectionType || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        // 要確認 -> 予定中(日付昇順) -> 未予定
        const rankA = a.scheduled ? (a.scheduled.isDueOrOverdue ? 0 : 1) : 2;
        const rankB = b.scheduled ? (b.scheduled.isDueOrOverdue ? 0 : 1) : 2;
        if (rankA !== rankB) return rankA - rankB;
        if (a.scheduled && b.scheduled) {
          const cmp = a.scheduled.eventDate.localeCompare(b.scheduled.eventDate);
          if (cmp !== 0) return cmp;
        }
        return a.asset.name.localeCompare(b.asset.name, 'ja', { numeric: true });
      });
  }, [enrichedRows, statusFilter, categoryFilter, officeFilter, offices, query]);

  const commitInlineEdit = async (
    row: (typeof enrichedRows)[number],
    col: 'scheduleDate' | 'inspectionType' | 'vendor',
    nextValue: string
  ) => {
    setEditingCell(null);
    const trimmed = nextValue.trim();
    const { asset, scheduled, category } = row;

    setSavingId(asset.id);
    try {
      if (col === 'scheduleDate') {
        if ((scheduled?.eventDate || '') === trimmed) return;
        await onSaveScheduledInspection({
          assetId: asset.id,
          logId: scheduled?.logId,
          eventDate: trimmed,
          inspectionType: scheduled?.inspectionType || asset.attributes?.inspectionType,
          vendor:
            scheduled?.vendor ||
            asset.attributes?.inspectionVendor ||
            asset.attributes?.maintenanceVendor
        });
      } else if (col === 'inspectionType') {
        if ((scheduled?.inspectionType || asset.attributes?.inspectionType || '') === trimmed) return;
        if (scheduled?.eventDate) {
          await onSaveScheduledInspection({
            assetId: asset.id,
            logId: scheduled.logId,
            eventDate: scheduled.eventDate,
            inspectionType: trimmed,
            vendor: scheduled.vendor
          });
        } else {
          await onSaveAssetInline(asset, {
            attributes: { ...(asset.attributes || {}), inspectionType: trimmed }
          });
        }
      } else if (col === 'vendor') {
        const curVendor =
          scheduled?.vendor ||
          asset.attributes?.inspectionVendor ||
          asset.attributes?.maintenanceVendor ||
          '';
        if (curVendor === trimmed) return;
        if (scheduled?.eventDate) {
          await onSaveScheduledInspection({
            assetId: asset.id,
            logId: scheduled.logId,
            eventDate: scheduled.eventDate,
            inspectionType: scheduled.inspectionType,
            vendor: trimmed
          });
        } else {
          const hasMaint = category?.fields?.some((f) => f.key === 'maintenanceVendor');
          const hasInsp = category?.fields?.some((f) => f.key === 'inspectionVendor');
          const attrKey = hasMaint && !hasInsp ? 'maintenanceVendor' : 'inspectionVendor';
          await onSaveAssetInline(asset, {
            attributes: { ...(asset.attributes || {}), [attrKey]: trimmed }
          });
        }
      }
    } finally {
      setSavingId(null);
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden min-w-0 w-full">
      {/* Top Bar: Status Tabs + Filters */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: `すべて (${counts.all})` },
              {
                id: 'due_confirm',
                label: `要実施確認 (${counts.dueConfirm})`,
                urgent: counts.dueConfirm > 0
              },
              { id: 'scheduled', label: `予定中 (${counts.scheduledCount})` },
              { id: 'unscheduled', label: `未予定 (${counts.unscheduled})` },
              { id: 'has_confirmed', label: `確定履歴あり (${counts.hasConfirmed})` }
            ] as Array<{ id: InspectionStatusFilter; label: string; urgent?: boolean }>
          ).map((f) => {
            const active = statusFilter === f.id;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setStatusFilter(f.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap tabular-nums ${
                  active
                    ? f.urgent
                      ? 'bg-rose-600 text-white border-rose-600'
                      : 'bg-indigo-600 text-white border-indigo-600'
                    : f.urgent
                    ? 'bg-rose-50 text-rose-800 border-rose-200 hover:bg-rose-100'
                    : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {f.label}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="車両・PC名・業者で検索"
              className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg w-48 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">種類: すべて</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select
            value={officeFilter}
            onChange={(e) => setOfficeFilter(e.target.value)}
            className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
          >
            <option value="all">拠点: すべて</option>
            {offices.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Info strip */}
      <div className="px-4 py-2 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          「点検予定日」「点検内容」「業者」のセルをクリックすると表のまま直接編集できます。走行距離は「運転記録簿」の最新記録から自動取得されます。予定日到来時は「実施確認」から確定履歴へ登録してください。
        </span>
        <span className="font-semibold text-slate-600 tabular-nums">
          表示: {filteredRows.length}件
        </span>
      </div>

      {/* Spreadsheet Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-max text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/95 text-[11px] font-bold text-slate-500">
              <th className="sticky left-0 z-20 bg-slate-50 py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(15,23,42,0.08)]">
                資産名 / 登録番号
              </th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">種類</th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">使用者 / 拠点</th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">点検状態</th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">点検予定日 (直編集)</th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">点検内容 (直編集)</th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">点検業者 (直編集)</th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">最終点検日</th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">走行距離</th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap text-center">点検項目</th>
              <th className="py-2.5 px-3 whitespace-nowrap text-right">操作</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200/80 text-xs">
            {filteredRows.map((row) => {
              const {
                asset,
                category,
                scheduled,
                confirmedLogs,
                lastInspectionDate,
                mileageInfo,
                checklistCount
              } = row;
              const CatIcon = getAssetIconComponent(category?.icon);
              const catTheme = getCategoryTheme(category?.color);
              const assigneeName = asset.isShared
                ? '共用'
                : (asset.assigneeUserId ? userMap.get(String(asset.assigneeUserId))?.name : undefined) ||
                  asset.assigneeUserName ||
                  '未割当';
              const officeLabel = asset.officeId
                ? resolveOfficeName(asset.officeId, offices) || asset.office || ''
                : asset.office || '';

              const isEditingSchedule =
                editingCell?.assetId === asset.id && editingCell.col === 'scheduleDate';
              const isEditingType =
                editingCell?.assetId === asset.id && editingCell.col === 'inspectionType';
              const isEditingVendor =
                editingCell?.assetId === asset.id && editingCell.col === 'vendor';

              const inspectionTypeVal =
                scheduled?.inspectionType || asset.attributes?.inspectionType || '';
              const vendorVal =
                scheduled?.vendor ||
                asset.attributes?.inspectionVendor ||
                asset.attributes?.maintenanceVendor ||
                '';

              const typeOptions = category?.fields?.find((f) => f.key === 'inspectionType')?.options || [
                'P点検',
                'D点検',
                '3ヶ月点検',
                '6ヶ月点検',
                '12ヶ月点検',
                '車検',
                '定期点検',
                'その他'
              ];

              return (
                <tr
                  key={asset.id}
                  className={`hover:bg-slate-50/80 transition-colors ${
                    savingId === asset.id ? 'opacity-60' : ''
                  }`}
                >
                  {/* 資産名 */}
                  <td className="sticky left-0 z-10 bg-white py-2.5 px-3 border-r border-slate-200/70 shadow-[2px_0_5px_-2px_rgba(15,23,42,0.06)]">
                    <button
                      type="button"
                      onClick={() => onOpenDetailModal(asset, 'inspections')}
                      className="flex items-center gap-1.5 font-bold text-slate-900 hover:text-indigo-700 cursor-pointer text-left"
                    >
                      <CatIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="truncate max-w-[180px]">{asset.name}</span>
                    </button>
                  </td>

                  {/* 種類 */}
                  <td className="py-2.5 px-3 border-r border-slate-200/70 whitespace-nowrap">
                    <span className={`text-[11px] font-bold ${catTheme.text}`}>
                      {category?.name || '資産'}
                    </span>
                  </td>

                  {/* 使用者・拠点 */}
                  <td className="py-2.5 px-3 border-r border-slate-200/70 whitespace-nowrap text-slate-700">
                    <span>{assigneeName}</span>
                    {officeLabel && (
                      <span className="text-slate-400 ml-1">· {officeLabel}</span>
                    )}
                  </td>

                  {/* 点検状態 */}
                  <td className="py-2.5 px-3 border-r border-slate-200/70 whitespace-nowrap">
                    {scheduled ? (
                      scheduled.isDueOrOverdue ? (
                        <span className="inline-flex items-center gap-1 text-rose-700 font-bold">
                          <AlertOctagon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          要実施確認
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-amber-800 font-semibold">
                          <CalendarClock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          予定中
                        </span>
                      )
                    ) : (
                      <span className="text-slate-400">未予定</span>
                    )}
                  </td>

                  {/* 点検予定日 (インライン) */}
                  <td
                    className="py-2 px-3 border-r border-slate-200/70 whitespace-nowrap cursor-pointer hover:bg-indigo-50/40"
                    onClick={() => {
                      if (!isEditingSchedule) {
                        setEditingCell({ assetId: asset.id, col: 'scheduleDate' });
                        setDraftVal(scheduled?.eventDate || '');
                      }
                    }}
                    title="クリックして点検予定日を直接編集"
                  >
                    {isEditingSchedule ? (
                      <input
                        type="date"
                        autoFocus
                        value={draftVal}
                        onChange={(e) => setDraftVal(e.target.value)}
                        onBlur={() => commitInlineEdit(row, 'scheduleDate', draftVal)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitInlineEdit(row, 'scheduleDate', draftVal);
                          if (e.key === 'Escape') setEditingCell(null);
                        }}
                        className="px-2 py-1 text-xs border border-indigo-400 rounded bg-white tabular-nums focus:outline-none"
                      />
                    ) : scheduled ? (
                      <span
                        className={`tabular-nums font-medium ${
                          scheduled.isDueOrOverdue ? 'text-rose-700 font-bold' : 'text-slate-800'
                        }`}
                      >
                        {formatAssetDateJa(scheduled.eventDate)}
                      </span>
                    ) : (
                      <span className="text-slate-300 hover:text-indigo-500 text-[11px]">
                        + 予定を設定
                      </span>
                    )}
                  </td>

                  {/* 点検内容 (インライン) */}
                  <td
                    className="py-2 px-3 border-r border-slate-200/70 whitespace-nowrap cursor-pointer hover:bg-indigo-50/40"
                    onClick={() => {
                      if (!isEditingType) {
                        setEditingCell({ assetId: asset.id, col: 'inspectionType' });
                        setDraftVal(inspectionTypeVal);
                      }
                    }}
                    title="クリックして点検内容を直接選択"
                  >
                    {isEditingType ? (
                      <select
                        autoFocus
                        value={draftVal}
                        onChange={(e) => commitInlineEdit(row, 'inspectionType', e.target.value)}
                        onBlur={() => setEditingCell(null)}
                        className="px-2 py-1 text-xs border border-indigo-400 rounded bg-white focus:outline-none"
                      >
                        <option value="">-- 選択 --</option>
                        {typeOptions.map((opt) => (
                          <option key={opt} value={opt}>
                            {opt}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className={inspectionTypeVal ? 'text-slate-800 font-medium' : 'text-slate-300'}>
                        {inspectionTypeVal || '未指定'}
                      </span>
                    )}
                  </td>

                  {/* 点検業者 (インライン) */}
                  <td
                    className="py-2 px-3 border-r border-slate-200/70 whitespace-nowrap cursor-pointer hover:bg-indigo-50/40"
                    onClick={() => {
                      if (!isEditingVendor) {
                        setEditingCell({ assetId: asset.id, col: 'vendor' });
                        setDraftVal(vendorVal);
                      }
                    }}
                    title="クリックして点検業者を直接編集"
                  >
                    {isEditingVendor ? (
                      <input
                        type="text"
                        autoFocus
                        value={draftVal}
                        onChange={(e) => setDraftVal(e.target.value)}
                        onBlur={() => commitInlineEdit(row, 'vendor', draftVal)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') commitInlineEdit(row, 'vendor', draftVal);
                          if (e.key === 'Escape') setEditingCell(null);
                        }}
                        className="w-36 px-2 py-1 text-xs border border-indigo-400 rounded bg-white focus:outline-none"
                      />
                    ) : vendorVal ? (
                      <span className="inline-flex items-center gap-1 text-slate-700">
                        <Wrench className="w-3 h-3 text-slate-400" />
                        {vendorVal}
                      </span>
                    ) : (
                      <span className="text-slate-300 text-[11px]">入力...</span>
                    )}
                  </td>

                  {/* 最終点検日 (SSOT: 確定履歴なしなら完全空白) */}
                  <td className="py-2.5 px-3 border-r border-slate-200/70 whitespace-nowrap tabular-nums text-slate-800 font-medium">
                    {lastInspectionDate ? formatAssetDateJa(lastInspectionDate) : ''}
                    {confirmedLogs.length > 0 && (
                      <span className="ml-1.5 text-[10px] text-slate-400 font-normal">
                        ({confirmedLogs.length}件)
                      </span>
                    )}
                  </td>

                  {/* 走行距離 (運転記録簿の最新から自動取得・未記録時は完全空白) */}
                  <td
                    className="py-2.5 px-3 border-r border-slate-200/70 whitespace-nowrap tabular-nums"
                    title={
                      mileageInfo.value !== null && mileageInfo.date
                        ? `運転記録簿（${mileageInfo.date}時点）から自動取得`
                        : undefined
                    }
                  >
                    {mileageInfo.value !== null ? (
                      <div className="flex items-center gap-1.5">
                        <span className="font-medium text-slate-800">
                          {mileageInfo.value.toLocaleString()} km
                        </span>
                        <span className="text-[10px] text-sky-700 font-semibold flex items-center gap-0.5">
                          <Gauge className="w-3 h-3" />
                          運転記録簿
                        </span>
                      </div>
                    ) : null}
                  </td>

                  {/* 点検項目（種類別共通） */}
                  <td className="py-2.5 px-3 border-r border-slate-200/70 whitespace-nowrap text-center">
                    <button
                      type="button"
                      onClick={() => {
                        if (category && onOpenCategoryEditor) {
                          onOpenCategoryEditor(category);
                        } else {
                          onOpenDetailModal(asset, 'inspections');
                        }
                      }}
                      className="inline-flex items-center gap-1 text-[11px] font-semibold text-indigo-700 hover:underline cursor-pointer tabular-nums"
                      title={`「${category?.name || '資産種類'}」共通の点検項目を設定・確認`}
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      {checklistCount}項目
                    </button>
                  </td>

                  {/* 操作 */}
                  <td className="py-2 px-3 whitespace-nowrap text-right">
                    <button
                      type="button"
                      onClick={() => onOpenConfirmModal(asset)}
                      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                        scheduled?.isDueOrOverdue
                          ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700 shadow-2xs'
                          : scheduled
                          ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                          : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-100'
                      }`}
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      {scheduled ? '実施確認' : '点検記録'}
                    </button>
                  </td>
                </tr>
              );
            })}

            {filteredRows.length === 0 && (
              <tr>
                <td colSpan={11} className="py-12 text-center text-xs text-slate-400">
                  条件に一致する資産はありません
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
