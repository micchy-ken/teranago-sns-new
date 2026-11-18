import React, { useState, useMemo } from 'react';
import {
  AlertOctagon,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ClipboardCheck,
  Gauge,
  Plus,
  Search,
  Trash2,
  Wrench,
  X,
  XCircle
} from 'lucide-react';
import {
  AssetCategory,
  AssetChecklistResult,
  AssetItem,
  AssetLogItem,
  OfficeMaster,
  User
} from '../../types';
import {
  diffDaysFromTodayJst,
  formatAssetDateJa,
  getAssetIconComponent,
  getCategoryTheme,
  getEffectiveAssetMileage,
  getJstTodayStr,
  isConfirmedInspectionLog,
  isScheduledInspectionLog
} from '../../utils/assets';
import { isSameOffice, resolveOfficeName } from '../../utils/masterResolver';

interface AssetInspectionListViewProps {
  assets: AssetItem[];
  categories: AssetCategory[];
  logs: AssetLogItem[];
  users: User[];
  offices: OfficeMaster[];
  currentUser: User;
  onCreateScheduledInspection: (params: {
    assetId: string;
    eventDate: string;
    inspectionType?: string;
    vendor?: string;
    memo?: string;
  }) => Promise<void>;
  onSaveScheduledInspection: (params: {
    assetId: string;
    logId?: string;
    eventDate: string;
    inspectionType?: string;
    vendor?: string;
    memo?: string;
  }) => Promise<void>;
  onCancelScheduledInspection: (assetId: string, logId?: string) => Promise<void>;
  onDeleteTransactionLog: (assetId: string, logId: string) => Promise<void>;
  onOpenConfirmModal: (
    asset: AssetItem,
    options?: { targetLog?: AssetLogItem | null; directMode?: boolean }
  ) => void;
  onOpenDetailModal: (asset: AssetItem, subTab?: 'details' | 'inspections' | 'history') => void;
}

type TransactionFilterTab = 'all' | 'scheduled' | 'due_confirm' | 'completed';
type SortKey = 'default' | 'eventDate' | 'status' | 'assetName' | 'mileage' | 'cost';

interface InspectionTransactionRow {
  txId: string;
  kind: 'scheduled' | 'completed';
  source: 'log' | 'legacy_attribute';
  log?: AssetLogItem;
  asset: AssetItem;
  category?: AssetCategory;
  eventDate: string;
  isDueOrOverdue: boolean;
  daysDiff: number | null;
  inspectionType: string;
  vendor: string;
  memo: string;
  cost?: number;
  mileage: number | null;
  mileageSource: 'record' | 'driving_log' | 'none';
  mileageDate?: string;
  checklistResults: AssetChecklistResult[];
  confirmedByName?: string;
  scheduledDateBefore?: string;
  createdAt: string;
}

const FALLBACK_INSPECTION_TYPE_OPTIONS = [
  'P点検',
  'D点検',
  '3ヶ月点検',
  '6ヶ月点検',
  '12ヶ月点検',
  '車検',
  '定期点検',
  '校正・点検',
  'その他'
];

export function AssetInspectionListView({
  assets,
  categories,
  logs,
  users,
  offices,
  currentUser,
  onCreateScheduledInspection,
  onSaveScheduledInspection,
  onCancelScheduledInspection,
  onDeleteTransactionLog,
  onOpenConfirmModal,
  onOpenDetailModal
}: AssetInspectionListViewProps) {
  const todayStr = getJstTodayStr();
  const [statusFilter, setStatusFilter] = useState<TransactionFilterTab>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [officeFilter, setOfficeFilter] = useState<string>('all');
  const [query, setQuery] = useState<string>('');
  const [sortState, setSortState] = useState<{ key: SortKey; dir: 'asc' | 'desc' }>({
    key: 'default',
    dir: 'asc'
  });

  // Inline edit state (scheduled rows)
  const [editingCell, setEditingCell] = useState<{
    txId: string;
    col: 'eventDate' | 'inspectionType' | 'vendor' | 'memo';
  } | null>(null);
  const [draftVal, setDraftVal] = useState<string>('');
  const [savingTxId, setSavingTxId] = useState<string | null>(null);

  // Two-click confirmation state for cancel / delete
  const [pendingActionConfirm, setPendingActionConfirm] = useState<{
    txId: string;
    action: 'cancel' | 'delete';
  } | null>(null);

  // Expanded checklist detail sub-rows (completed rows)
  const [expandedTxIds, setExpandedTxIds] = useState<Record<string, boolean>>({});

  // Create Scheduled Inspection Modal
  const [createScheduleOpen, setCreateScheduleOpen] = useState(false);
  const [newSchedAssetId, setNewSchedAssetId] = useState('');
  const [newSchedAssetSearch, setNewSchedAssetSearch] = useState('');
  const [newSchedDate, setNewSchedDate] = useState(todayStr);
  const [newSchedType, setNewSchedType] = useState('定期点検');
  const [newSchedVendor, setNewSchedVendor] = useState('');
  const [newSchedMemo, setNewSchedMemo] = useState('');
  const [newSchedSubmitting, setNewSchedSubmitting] = useState(false);
  const [newSchedError, setNewSchedError] = useState('');

  // Asset Picker Modal for direct confirmed inspection recording
  const [recordPickerOpen, setRecordPickerOpen] = useState(false);
  const [recordAssetSearch, setRecordAssetSearch] = useState('');

  const assetMap = useMemo(() => new Map(assets.map((a) => [String(a.id), a])), [assets]);
  const categoryMap = useMemo(() => new Map(categories.map((c) => [c.id, c])), [categories]);
  const userMap = useMemo(() => new Map(users.map((u) => [String(u.id), u])), [users]);

  const activeAssets = useMemo(
    () =>
      assets
        .filter((a) => a.status !== 'retired')
        .sort((a, b) => a.name.localeCompare(b.name, 'ja', { numeric: true })),
    [assets]
  );

  // Build Transaction Rows: all scheduled logs (+ legacy attribute schedule if unmigrated) + all confirmed logs
  const transactions = useMemo<InspectionTransactionRow[]>(() => {
    const rows: InspectionTransactionRow[] = [];
    const assetsWithScheduledLog = new Set<string>();

    for (const log of logs) {
      const asset = assetMap.get(String(log.assetId));
      if (!asset) continue;

      const isSched = isScheduledInspectionLog(log);
      const isConf = isConfirmedInspectionLog(log);
      if (!isSched && !isConf) continue;

      // Active scheduled inspections exclude retired assets; confirmed history remains visible
      if (isSched && asset.status === 'retired') continue;

      const eventDate = String(log.eventDate || '').trim().slice(0, 10);
      if (isSched) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(eventDate)) continue;
        assetsWithScheduledLog.add(String(asset.id));
      }

      const category = categoryMap.get(asset.categoryId);
      const daysDiff = eventDate ? diffDaysFromTodayJst(eventDate, todayStr) : null;
      const isDueOrOverdue = Boolean(isSched && eventDate && eventDate <= todayStr);

      const inspectionType =
        log.detail?.inspectionType ||
        (isSched ? asset.attributes?.inspectionType : '') ||
        log.summary ||
        '定期点検';

      const vendor =
        log.detail?.vendor ||
        (isSched
          ? asset.attributes?.inspectionVendor || asset.attributes?.maintenanceVendor || ''
          : '');

      const memo = log.detail?.memo || '';

      let mileage: number | null = null;
      let mileageSource: 'record' | 'driving_log' | 'none' = 'none';
      let mileageDate: string | undefined;

      if (isConf) {
        if (typeof log.detail?.mileage === 'number' && Number.isFinite(log.detail.mileage)) {
          mileage = log.detail.mileage;
          mileageSource = 'record';
        }
      } else {
        const eff = getEffectiveAssetMileage(asset);
        if (eff.value !== null) {
          mileage = eff.value;
          mileageSource = 'driving_log';
          mileageDate = eff.date;
        }
      }

      rows.push({
        txId: log.id,
        kind: isSched ? 'scheduled' : 'completed',
        source: 'log',
        log,
        asset,
        category,
        eventDate,
        isDueOrOverdue,
        daysDiff,
        inspectionType,
        vendor,
        memo,
        cost:
          typeof log.detail?.cost === 'number' && Number.isFinite(log.detail.cost)
            ? log.detail.cost
            : undefined,
        mileage,
        mileageSource,
        mileageDate,
        checklistResults: Array.isArray(log.detail?.checklistResults)
          ? log.detail.checklistResults
          : [],
        confirmedByName: log.detail?.confirmedByName || (isConf ? log.actorName : undefined),
        scheduledDateBefore: log.detail?.scheduledDateBefore,
        createdAt: log.createdAt || ''
      });
    }

    // Legacy attribute schedule fallback (for imported/legacy assets without a scheduled AssetLog yet)
    for (const asset of assets) {
      if (asset.status === 'retired') continue;
      if (assetsWithScheduledLog.has(String(asset.id))) continue;
      const legacyRaw =
        asset.attributes?.nextInspectionDate ||
        asset.attributes?.nextCheckDate ||
        asset.attributes?.nextCalibrationDate;
      const legacyDate = legacyRaw ? String(legacyRaw).trim().slice(0, 10) : '';
      if (!/^\d{4}-\d{2}-\d{2}$/.test(legacyDate)) continue;

      const category = categoryMap.get(asset.categoryId);
      const eff = getEffectiveAssetMileage(asset);
      rows.push({
        txId: `legacy-${asset.id}`,
        kind: 'scheduled',
        source: 'legacy_attribute',
        asset,
        category,
        eventDate: legacyDate,
        isDueOrOverdue: legacyDate <= todayStr,
        daysDiff: diffDaysFromTodayJst(legacyDate, todayStr),
        inspectionType: asset.attributes?.inspectionType || '定期点検',
        vendor:
          asset.attributes?.inspectionVendor || asset.attributes?.maintenanceVendor || '',
        memo: '',
        mileage: eff.value,
        mileageSource: eff.value !== null ? 'driving_log' : 'none',
        mileageDate: eff.date,
        checklistResults: [],
        createdAt: asset.createdAt || ''
      });
    }

    return rows;
  }, [assets, assetMap, categoryMap, logs, todayStr]);

  // Apply category / office / search filters before computing status counts so counts stay contextual
  const contextFilteredTransactions = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((tx) => {
      if (categoryFilter !== 'all' && tx.asset.categoryId !== categoryFilter) return false;
      if (officeFilter !== 'all') {
        const off = tx.asset.officeId || tx.asset.office || '';
        if (!isSameOffice(off, officeFilter, offices)) return false;
      }
      if (q) {
        const assigneeName = tx.asset.isShared
          ? '共用'
          : (tx.asset.assigneeUserId
              ? userMap.get(String(tx.asset.assigneeUserId))?.name
              : undefined) ||
            tx.asset.assigneeUserName ||
            '';
        const hay = `${tx.asset.name} ${tx.asset.assetCode} ${assigneeName} ${
          tx.inspectionType
        } ${tx.vendor} ${tx.memo} ${tx.confirmedByName || ''}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [transactions, categoryFilter, officeFilter, offices, query, userMap]);

  const counts = useMemo(() => {
    let scheduledCount = 0;
    let dueConfirmCount = 0;
    let completedCount = 0;
    for (const tx of contextFilteredTransactions) {
      if (tx.kind === 'scheduled') {
        scheduledCount++;
        if (tx.isDueOrOverdue) dueConfirmCount++;
      } else {
        completedCount++;
      }
    }
    return {
      all: contextFilteredTransactions.length,
      scheduled: scheduledCount,
      dueConfirm: dueConfirmCount,
      completed: completedCount
    };
  }, [contextFilteredTransactions]);

  const displayedTransactions = useMemo(() => {
    const filtered = contextFilteredTransactions.filter((tx) => {
      if (statusFilter === 'scheduled') return tx.kind === 'scheduled';
      if (statusFilter === 'due_confirm') return tx.kind === 'scheduled' && tx.isDueOrOverdue;
      if (statusFilter === 'completed') return tx.kind === 'completed';
      return true;
    });

    return [...filtered].sort((a, b) => {
      if (sortState.key !== 'default') {
        const dirMul = sortState.dir === 'asc' ? 1 : -1;
        if (sortState.key === 'eventDate') {
          const cmp = (a.eventDate || '').localeCompare(b.eventDate || '');
          if (cmp !== 0) return cmp * dirMul;
        } else if (sortState.key === 'status') {
          const rank = (tx: InspectionTransactionRow) =>
            tx.kind === 'scheduled' ? (tx.isDueOrOverdue ? 0 : 1) : 2;
          const cmp = rank(a) - rank(b);
          if (cmp !== 0) return cmp * dirMul;
        } else if (sortState.key === 'assetName') {
          const cmp = a.asset.name.localeCompare(b.asset.name, 'ja', { numeric: true });
          if (cmp !== 0) return cmp * dirMul;
        } else if (sortState.key === 'mileage') {
          if (a.mileage === null && b.mileage === null) return 0;
          if (a.mileage === null) return 1;
          if (b.mileage === null) return -1;
          if (a.mileage !== b.mileage) return (a.mileage - b.mileage) * dirMul;
        } else if (sortState.key === 'cost') {
          if (a.cost === undefined && b.cost === undefined) return 0;
          if (a.cost === undefined) return 1;
          if (b.cost === undefined) return -1;
          if (a.cost !== b.cost) return (a.cost - b.cost) * dirMul;
        }
      }

      // Default transaction order:
      // 1) Due/overdue scheduled (earliest first)
      // 2) Upcoming scheduled (earliest first)
      // 3) Confirmed completed inspections (newest first)
      const rankA = a.kind === 'scheduled' ? (a.isDueOrOverdue ? 0 : 1) : 2;
      const rankB = b.kind === 'scheduled' ? (b.isDueOrOverdue ? 0 : 1) : 2;
      if (rankA !== rankB) return rankA - rankB;

      if (a.kind === 'scheduled' && b.kind === 'scheduled') {
        const cmp = a.eventDate.localeCompare(b.eventDate);
        if (cmp !== 0) return cmp;
      } else if (a.kind === 'completed' && b.kind === 'completed') {
        const cmp = b.eventDate.localeCompare(a.eventDate);
        if (cmp !== 0) return cmp;
        const cCmp = (b.createdAt || '').localeCompare(a.createdAt || '');
        if (cCmp !== 0) return cCmp;
      }
      return a.asset.name.localeCompare(b.asset.name, 'ja', { numeric: true });
    });
  }, [contextFilteredTransactions, statusFilter, sortState]);

  const toggleSort = (key: SortKey) => {
    setSortState((prev) => {
      if (prev.key === key) {
        if (prev.dir === 'asc') return { key, dir: 'desc' };
        return { key: 'default', dir: 'asc' };
      }
      return { key, dir: key === 'eventDate' || key === 'cost' || key === 'mileage' ? 'desc' : 'asc' };
    });
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortState.key !== key) return <ArrowUpDown className="w-3 h-3 text-slate-300" />;
    return sortState.dir === 'asc' ? (
      <ArrowUp className="w-3 h-3 text-indigo-600" />
    ) : (
      <ArrowDown className="w-3 h-3 text-indigo-600" />
    );
  };

  const commitInlineEdit = async (
    tx: InspectionTransactionRow,
    col: 'eventDate' | 'inspectionType' | 'vendor' | 'memo',
    nextValue: string
  ) => {
    setEditingCell(null);
    if (tx.kind !== 'scheduled') return;
    const trimmed = nextValue.trim();

    if (col === 'eventDate') {
      if (!trimmed || trimmed === tx.eventDate) return;
    } else if (col === 'inspectionType') {
      if (trimmed === tx.inspectionType) return;
    } else if (col === 'vendor') {
      if (trimmed === tx.vendor) return;
    } else if (col === 'memo') {
      if (trimmed === tx.memo) return;
    }

    setSavingTxId(tx.txId);
    try {
      await onSaveScheduledInspection({
        assetId: tx.asset.id,
        logId: tx.log?.id,
        eventDate: col === 'eventDate' ? trimmed : tx.eventDate,
        inspectionType: col === 'inspectionType' ? trimmed : tx.inspectionType,
        vendor: col === 'vendor' ? trimmed : tx.vendor,
        memo: col === 'memo' ? trimmed : tx.memo
      });
    } finally {
      setSavingTxId(null);
    }
  };

  const openCreateScheduleModal = () => {
    const firstAsset =
      activeAssets.find((a) => categoryFilter === 'all' || a.categoryId === categoryFilter) ||
      activeAssets[0];
    setNewSchedError('');
    setNewSchedAssetSearch('');
    setNewSchedDate(todayStr);
    setNewSchedMemo('');
    if (firstAsset) {
      setNewSchedAssetId(firstAsset.id);
      const cat = categoryMap.get(firstAsset.categoryId);
      const opts = cat?.fields?.find((f) => f.key === 'inspectionType')?.options;
      setNewSchedType(
        firstAsset.attributes?.inspectionType || opts?.[0] || '定期点検'
      );
      setNewSchedVendor(
        firstAsset.attributes?.inspectionVendor ||
          firstAsset.attributes?.maintenanceVendor ||
          ''
      );
    } else {
      setNewSchedAssetId('');
      setNewSchedType('定期点検');
      setNewSchedVendor('');
    }
    setCreateScheduleOpen(true);
  };

  const handleSelectAssetForNewSchedule = (assetId: string) => {
    setNewSchedAssetId(assetId);
    const target = assetMap.get(String(assetId));
    if (target) {
      const cat = categoryMap.get(target.categoryId);
      const opts = cat?.fields?.find((f) => f.key === 'inspectionType')?.options;
      setNewSchedType(target.attributes?.inspectionType || opts?.[0] || '定期点検');
      setNewSchedVendor(
        target.attributes?.inspectionVendor ||
          target.attributes?.maintenanceVendor ||
          ''
      );
    }
  };

  const handleSubmitNewSchedule = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newSchedAssetId) {
      setNewSchedError('対象の資産を選択してください');
      return;
    }
    if (!newSchedDate) {
      setNewSchedError('点検予定日を入力してください');
      return;
    }
    setNewSchedSubmitting(true);
    setNewSchedError('');
    try {
      await onCreateScheduledInspection({
        assetId: newSchedAssetId,
        eventDate: newSchedDate,
        inspectionType: newSchedType.trim() || '定期点検',
        vendor: newSchedVendor.trim() || undefined,
        memo: newSchedMemo.trim() || undefined
      });
      setCreateScheduleOpen(false);
    } catch (err: any) {
      setNewSchedError(err?.message || '点検予定の登録に失敗しました');
    } finally {
      setNewSchedSubmitting(false);
    }
  };

  const newSchedFilteredAssets = useMemo(() => {
    const q = newSchedAssetSearch.trim().toLowerCase();
    return activeAssets.filter((a) => {
      if (!q) return true;
      const catName = categoryMap.get(a.categoryId)?.name || '';
      const offName = a.officeId ? resolveOfficeName(a.officeId, offices) : a.office || '';
      const hay = `${a.name} ${a.assetCode} ${catName} ${offName} ${a.assigneeUserName || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [activeAssets, newSchedAssetSearch, categoryMap, offices]);

  const newSchedSelectedCategory = useMemo(() => {
    const a = assetMap.get(String(newSchedAssetId));
    return a ? categoryMap.get(a.categoryId) : undefined;
  }, [assetMap, newSchedAssetId, categoryMap]);

  const newSchedTypeOptions = useMemo(() => {
    return (
      newSchedSelectedCategory?.fields?.find((f) => f.key === 'inspectionType')?.options ||
      FALLBACK_INSPECTION_TYPE_OPTIONS
    );
  }, [newSchedSelectedCategory]);

  const recordFilteredAssets = useMemo(() => {
    const q = recordAssetSearch.trim().toLowerCase();
    return activeAssets.filter((a) => {
      if (!q) return true;
      const catName = categoryMap.get(a.categoryId)?.name || '';
      const offName = a.officeId ? resolveOfficeName(a.officeId, offices) : a.office || '';
      const hay = `${a.name} ${a.assetCode} ${catName} ${offName} ${a.assigneeUserName || ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [activeAssets, recordAssetSearch, categoryMap, offices]);

  const isAdminUser = Boolean(currentUser.isAdmin || currentUser.role === 'admin');

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden min-w-0 w-full">
      {/* Top Bar: Transaction Status Tabs + Filters + Create Actions */}
      <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/70 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { id: 'all', label: `すべて (${counts.all})` },
              { id: 'scheduled', label: `実施予定 (${counts.scheduled})` },
              {
                id: 'due_confirm',
                label: `要実施確認 (${counts.dueConfirm})`,
                urgent: counts.dueConfirm > 0
              },
              { id: 'completed', label: `確定済 (${counts.completed})` }
            ] as Array<{ id: TransactionFilterTab; label: string; urgent?: boolean }>
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
                      : f.id === 'completed'
                      ? 'bg-emerald-600 text-white border-emerald-600'
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
              placeholder="資産名・内容・業者・メモ検索"
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

          <button
            type="button"
            onClick={openCreateScheduleModal}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xs cursor-pointer whitespace-nowrap"
          >
            <CalendarPlus className="w-3.5 h-3.5" />
            点検予定を登録
          </button>
          <button
            type="button"
            onClick={() => {
              setRecordAssetSearch('');
              setRecordPickerOpen(true);
            }}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 shadow-2xs cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            点検実績を記録
          </button>
        </div>
      </div>

      {/* Info strip */}
      <div className="px-4 py-2 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          「実施予定」と「確定済」の点検トランザクションを時系列で一覧表示します。予定行は予定日・内容・業者・メモを直接編集でき、「実施確認」から確定点検へ移行します。
        </span>
        <div className="flex items-center gap-3 font-semibold text-slate-600 tabular-nums">
          <span>
            予定: {counts.scheduled}件 / 確定済: {counts.completed}件 / 表示: {displayedTransactions.length}件
          </span>
          {sortState.key !== 'default' && (
            <button
              type="button"
              onClick={() => setSortState({ key: 'default', dir: 'asc' })}
              className="text-indigo-600 hover:underline cursor-pointer"
            >
              標準順に戻す
            </button>
          )}
        </div>
      </div>

      {/* Transaction Table */}
      <div className="w-full overflow-x-auto">
        <table className="w-full min-w-max text-left border-collapse">
          <thead>
            <tr className="border-b border-slate-200 bg-slate-50/95 text-[11px] font-bold text-slate-500">
              <th
                onClick={() => toggleSort('status')}
                className="sticky left-0 z-20 bg-slate-50 py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap cursor-pointer hover:text-slate-800 shadow-[2px_0_5px_-2px_rgba(15,23,42,0.06)]"
              >
                <span className="inline-flex items-center gap-1">
                  状態
                  {renderSortIcon('status')}
                </span>
              </th>
              <th
                onClick={() => toggleSort('eventDate')}
                className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap cursor-pointer hover:text-slate-800"
              >
                <span className="inline-flex items-center gap-1">
                  予定日 / 実施日
                  {renderSortIcon('eventDate')}
                </span>
              </th>
              <th
                onClick={() => toggleSort('assetName')}
                className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap cursor-pointer hover:text-slate-800"
              >
                <span className="inline-flex items-center gap-1">
                  資産名 / 登録番号
                  {renderSortIcon('assetName')}
                </span>
              </th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">種類</th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">拠点 / 使用者</th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">点検内容</th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">点検業者</th>
              <th
                onClick={() => toggleSort('mileage')}
                className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap cursor-pointer hover:text-slate-800"
              >
                <span className="inline-flex items-center gap-1">
                  走行距離
                  {renderSortIcon('mileage')}
                </span>
              </th>
              <th
                onClick={() => toggleSort('cost')}
                className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap text-right cursor-pointer hover:text-slate-800"
              >
                <span className="inline-flex items-center justify-end gap-1">
                  費用
                  {renderSortIcon('cost')}
                </span>
              </th>
              <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">
                チェック結果 / メモ
              </th>
              <th className="py-2.5 px-3 whitespace-nowrap text-right">操作</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-200/80 text-xs">
            {displayedTransactions.map((tx) => {
              const { asset, category } = tx;
              const CatIcon = getAssetIconComponent(category?.icon);
              const catTheme = getCategoryTheme(category?.color);
              const assigneeName = asset.isShared
                ? '共用'
                : (asset.assigneeUserId
                    ? userMap.get(String(asset.assigneeUserId))?.name
                    : undefined) ||
                  asset.assigneeUserName ||
                  '未割当';
              const officeLabel = asset.officeId
                ? resolveOfficeName(asset.officeId, offices) || asset.office || ''
                : asset.office || '';

              const isScheduled = tx.kind === 'scheduled';
              const isEditingDate =
                isScheduled &&
                editingCell?.txId === tx.txId &&
                editingCell.col === 'eventDate';
              const isEditingType =
                isScheduled &&
                editingCell?.txId === tx.txId &&
                editingCell.col === 'inspectionType';
              const isEditingVendor =
                isScheduled &&
                editingCell?.txId === tx.txId &&
                editingCell.col === 'vendor';
              const isEditingMemo =
                isScheduled &&
                editingCell?.txId === tx.txId &&
                editingCell.col === 'memo';

              const typeOptions =
                category?.fields?.find((f) => f.key === 'inspectionType')?.options ||
                FALLBACK_INSPECTION_TYPE_OPTIONS;

              const ngCount = tx.checklistResults.filter((r) => r.status === 'ng').length;
              const cautionCount = tx.checklistResults.filter((r) => r.status === 'caution').length;
              const okCount = tx.checklistResults.filter((r) => r.status === 'ok').length;
              const isExpanded = Boolean(expandedTxIds[tx.txId]);
              const isConfirmingCancel =
                pendingActionConfirm?.txId === tx.txId &&
                pendingActionConfirm.action === 'cancel';
              const isConfirmingDelete =
                pendingActionConfirm?.txId === tx.txId &&
                pendingActionConfirm.action === 'delete';
              const canDelete =
                tx.source === 'log' &&
                Boolean(tx.log?.id) &&
                (isAdminUser || tx.log?.actorId === currentUser.id);

              return (
                <React.Fragment key={tx.txId}>
                  <tr
                    className={`transition-colors ${
                      tx.kind === 'completed'
                        ? 'bg-white hover:bg-slate-50/70'
                        : tx.isDueOrOverdue
                        ? 'bg-rose-50/35 hover:bg-rose-50/60'
                        : 'bg-amber-50/20 hover:bg-amber-50/45'
                    } ${savingTxId === tx.txId ? 'opacity-60' : ''}`}
                  >
                    {/* 状態 */}
                    <td
                      className={`sticky left-0 z-10 py-2.5 px-3 border-r border-slate-200/70 whitespace-nowrap shadow-[2px_0_5px_-2px_rgba(15,23,42,0.06)] ${
                        tx.kind === 'completed'
                          ? 'bg-white'
                          : tx.isDueOrOverdue
                          ? 'bg-rose-50/90'
                          : 'bg-amber-50/80'
                      }`}
                    >
                      {tx.kind === 'completed' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          確定済
                        </span>
                      ) : tx.isDueOrOverdue ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                          <AlertOctagon className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                          要実施確認
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                          <CalendarClock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          実施予定
                        </span>
                      )}
                    </td>

                    {/* 予定日 / 実施日 */}
                    <td
                      className={`py-2 px-3 border-r border-slate-200/70 whitespace-nowrap ${
                        isScheduled ? 'cursor-pointer hover:bg-indigo-50/40' : ''
                      }`}
                      onClick={() => {
                        if (isScheduled && !isEditingDate) {
                          setEditingCell({ txId: tx.txId, col: 'eventDate' });
                          setDraftVal(tx.eventDate);
                        }
                      }}
                      title={isScheduled ? 'クリックして点検予定日を直接編集' : undefined}
                    >
                      {isEditingDate ? (
                        <input
                          type="date"
                          autoFocus
                          value={draftVal}
                          onChange={(e) => setDraftVal(e.target.value)}
                          onBlur={() => commitInlineEdit(tx, 'eventDate', draftVal)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitInlineEdit(tx, 'eventDate', draftVal);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="px-2 py-1 text-xs border border-indigo-400 rounded bg-white tabular-nums focus:outline-none"
                        />
                      ) : (
                        <div className="flex flex-col">
                          <span
                            className={`tabular-nums font-semibold ${
                              isScheduled && tx.isDueOrOverdue
                                ? 'text-rose-700 font-bold'
                                : 'text-slate-800'
                            }`}
                          >
                            {formatAssetDateJa(tx.eventDate)}
                          </span>
                          {isScheduled && tx.daysDiff !== null && (
                            <span
                              className={`text-[10px] tabular-nums ${
                                tx.daysDiff < 0
                                  ? 'text-rose-600 font-bold'
                                  : tx.daysDiff === 0
                                  ? 'text-rose-600 font-bold'
                                  : tx.daysDiff <= 30
                                  ? 'text-amber-700 font-semibold'
                                  : 'text-slate-400'
                              }`}
                            >
                              {tx.daysDiff < 0
                                ? `${Math.abs(tx.daysDiff)}日超過`
                                : tx.daysDiff === 0
                                ? '本日予定'
                                : `あと${tx.daysDiff}日`}
                            </span>
                          )}
                          {!isScheduled &&
                            tx.scheduledDateBefore &&
                            tx.scheduledDateBefore !== tx.eventDate && (
                              <span className="text-[10px] text-slate-400 tabular-nums">
                                当初予定: {formatAssetDateJa(tx.scheduledDateBefore)}
                              </span>
                            )}
                        </div>
                      )}
                    </td>

                    {/* 資産名 */}
                    <td className="py-2.5 px-3 border-r border-slate-200/70 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => onOpenDetailModal(asset, 'inspections')}
                        className="flex items-center gap-1.5 font-bold text-slate-900 hover:text-indigo-700 cursor-pointer text-left"
                      >
                        <CatIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="truncate max-w-[180px]">{asset.name}</span>
                        {asset.status === 'retired' && (
                          <span className="px-1.5 py-0.2 rounded text-[10px] bg-slate-100 text-slate-500 border border-slate-200 font-medium">
                            廃棄済
                          </span>
                        )}
                      </button>
                    </td>

                    {/* 種類 */}
                    <td className="py-2.5 px-3 border-r border-slate-200/70 whitespace-nowrap">
                      <span className={`text-[11px] font-bold ${catTheme.text}`}>
                        {category?.name || '資産'}
                      </span>
                    </td>

                    {/* 拠点 / 使用者 */}
                    <td className="py-2.5 px-3 border-r border-slate-200/70 whitespace-nowrap text-slate-700">
                      <span>{officeLabel || '-'}</span>
                      <span className="text-slate-400 mx-1">·</span>
                      <span>{assigneeName}</span>
                    </td>

                    {/* 点検内容 */}
                    <td
                      className={`py-2 px-3 border-r border-slate-200/70 whitespace-nowrap ${
                        isScheduled ? 'cursor-pointer hover:bg-indigo-50/40' : ''
                      }`}
                      onClick={() => {
                        if (isScheduled && !isEditingType) {
                          setEditingCell({ txId: tx.txId, col: 'inspectionType' });
                          setDraftVal(tx.inspectionType);
                        }
                      }}
                      title={isScheduled ? 'クリックして点検内容を直接選択' : undefined}
                    >
                      {isEditingType ? (
                        <select
                          autoFocus
                          value={draftVal}
                          onChange={(e) => commitInlineEdit(tx, 'inspectionType', e.target.value)}
                          onBlur={() => setEditingCell(null)}
                          className="px-2 py-1 text-xs border border-indigo-400 rounded bg-white focus:outline-none"
                        >
                          {typeOptions.map((opt) => (
                            <option key={opt} value={opt}>
                              {opt}
                            </option>
                          ))}
                          {draftVal && !typeOptions.includes(draftVal) && (
                            <option value={draftVal}>{draftVal}</option>
                          )}
                        </select>
                      ) : (
                        <span className="font-medium text-slate-800">{tx.inspectionType}</span>
                      )}
                    </td>

                    {/* 点検業者 */}
                    <td
                      className={`py-2 px-3 border-r border-slate-200/70 whitespace-nowrap ${
                        isScheduled ? 'cursor-pointer hover:bg-indigo-50/40' : ''
                      }`}
                      onClick={() => {
                        if (isScheduled && !isEditingVendor) {
                          setEditingCell({ txId: tx.txId, col: 'vendor' });
                          setDraftVal(tx.vendor);
                        }
                      }}
                      title={isScheduled ? 'クリックして点検業者を直接編集' : undefined}
                    >
                      {isEditingVendor ? (
                        <input
                          type="text"
                          autoFocus
                          value={draftVal}
                          onChange={(e) => setDraftVal(e.target.value)}
                          onBlur={() => commitInlineEdit(tx, 'vendor', draftVal)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitInlineEdit(tx, 'vendor', draftVal);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-36 px-2 py-1 text-xs border border-indigo-400 rounded bg-white focus:outline-none"
                        />
                      ) : tx.vendor ? (
                        <span className="inline-flex items-center gap-1 text-slate-700">
                          <Wrench className="w-3 h-3 text-slate-400 shrink-0" />
                          <span className="truncate max-w-[160px]">{tx.vendor}</span>
                        </span>
                      ) : isScheduled ? (
                        <span className="text-slate-300 text-[11px]">入力...</span>
                      ) : null}
                    </td>

                    {/* 走行距離 (確定時は実施時記録・予定時は運転記録簿最新・未記録なら完全空白) */}
                    <td
                      className="py-2.5 px-3 border-r border-slate-200/70 whitespace-nowrap tabular-nums"
                      title={
                        tx.mileage !== null && tx.mileageSource === 'driving_log' && tx.mileageDate
                          ? `運転記録簿（${tx.mileageDate}時点）から自動取得`
                          : tx.mileage !== null && tx.mileageSource === 'record'
                          ? '点検確定時の走行距離'
                          : undefined
                      }
                    >
                      {tx.mileage !== null ? (
                        <div className="flex items-center gap-1.5">
                          <span className="font-medium text-slate-800">
                            {tx.mileage.toLocaleString()} km
                          </span>
                          {tx.mileageSource === 'driving_log' && (
                            <span className="text-[10px] text-sky-700 font-semibold flex items-center gap-0.5">
                              <Gauge className="w-3 h-3" />
                              運転記録簿
                            </span>
                          )}
                        </div>
                      ) : null}
                    </td>

                    {/* 費用 */}
                    <td className="py-2.5 px-3 border-r border-slate-200/70 whitespace-nowrap text-right tabular-nums text-slate-700 font-medium">
                      {tx.cost !== undefined ? `¥${tx.cost.toLocaleString()}` : ''}
                    </td>

                    {/* チェック結果 / メモ */}
                    <td
                      className={`py-2 px-3 border-r border-slate-200/70 max-w-[260px] ${
                        isScheduled ? 'cursor-pointer hover:bg-indigo-50/40' : ''
                      }`}
                      onClick={() => {
                        if (isScheduled && !isEditingMemo) {
                          setEditingCell({ txId: tx.txId, col: 'memo' });
                          setDraftVal(tx.memo);
                        }
                      }}
                      title={isScheduled ? 'クリックしてメモを直接編集' : undefined}
                    >
                      {isEditingMemo ? (
                        <input
                          type="text"
                          autoFocus
                          value={draftVal}
                          onChange={(e) => setDraftVal(e.target.value)}
                          onBlur={() => commitInlineEdit(tx, 'memo', draftVal)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') commitInlineEdit(tx, 'memo', draftVal);
                            if (e.key === 'Escape') setEditingCell(null);
                          }}
                          className="w-44 px-2 py-1 text-xs border border-indigo-400 rounded bg-white focus:outline-none"
                        />
                      ) : (
                        <div className="flex flex-wrap items-center gap-1.5">
                          {tx.kind === 'completed' && tx.checklistResults.length > 0 && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedTxIds((p) => ({ ...p, [tx.txId]: !p[tx.txId] }))
                              }
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded border text-[11px] font-bold cursor-pointer whitespace-nowrap ${
                                ngCount > 0
                                  ? 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                                  : cautionCount > 0
                                  ? 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                                  : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                              }`}
                            >
                              <ClipboardCheck className="w-3 h-3" />
                              {ngCount > 0 || cautionCount > 0
                                ? `要注意${cautionCount} / 不良${ngCount}`
                                : `良好 ${okCount}/${tx.checklistResults.length}`}
                              {isExpanded ? (
                                <ChevronUp className="w-3 h-3" />
                              ) : (
                                <ChevronDown className="w-3 h-3" />
                              )}
                            </button>
                          )}
                          {tx.memo ? (
                            <span className="text-slate-600 truncate block max-w-[200px]" title={tx.memo}>
                              {tx.memo}
                            </span>
                          ) : isScheduled ? (
                            <span className="text-slate-300 text-[11px]">メモを入力...</span>
                          ) : null}
                          {tx.kind === 'completed' && tx.confirmedByName && (
                            <span className="text-[10px] text-slate-400 whitespace-nowrap">
                              確認: {tx.confirmedByName}
                            </span>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 操作 */}
                    <td className="py-2 px-3 whitespace-nowrap text-right">
                      <div className="inline-flex items-center justify-end gap-1.5">
                        {isScheduled ? (
                          <>
                            <button
                              type="button"
                              onClick={() =>
                                onOpenConfirmModal(asset, {
                                  targetLog: tx.log || null
                                })
                              }
                              className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                                tx.isDueOrOverdue
                                  ? 'bg-rose-600 text-white border-rose-600 hover:bg-rose-700 shadow-2xs'
                                  : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                              }`}
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              実施確認
                            </button>

                            {isConfirmingCancel ? (
                              <div className="inline-flex items-center gap-1">
                                <button
                                  type="button"
                                  onClick={async () => {
                                    setPendingActionConfirm(null);
                                    setSavingTxId(tx.txId);
                                    try {
                                      await onCancelScheduledInspection(asset.id, tx.log?.id);
                                    } finally {
                                      setSavingTxId(null);
                                    }
                                  }}
                                  className="px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                                >
                                  取消実行
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setPendingActionConfirm(null)}
                                  className="px-1.5 py-1 rounded-lg text-[11px] text-slate-500 hover:bg-slate-100 cursor-pointer"
                                >
                                  戻す
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() =>
                                  setPendingActionConfirm({ txId: tx.txId, action: 'cancel' })
                                }
                                title="この点検予定を取り消す"
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              >
                                <XCircle className="w-4 h-4" />
                              </button>
                            )}
                          </>
                        ) : (
                          <>
                            <button
                              type="button"
                              onClick={() => onOpenDetailModal(asset, 'inspections')}
                              className="px-2.5 py-1 rounded-lg text-[11px] font-semibold bg-white border border-slate-200 text-slate-700 hover:bg-slate-100 cursor-pointer whitespace-nowrap"
                            >
                              資産詳細
                            </button>
                            {canDelete && (
                              isConfirmingDelete ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={async () => {
                                      setPendingActionConfirm(null);
                                      if (!tx.log?.id) return;
                                      setSavingTxId(tx.txId);
                                      try {
                                        await onDeleteTransactionLog(asset.id, tx.log.id);
                                      } finally {
                                        setSavingTxId(null);
                                      }
                                    }}
                                    className="px-2 py-1 rounded-lg text-[11px] font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer"
                                  >
                                    削除確定
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setPendingActionConfirm(null)}
                                    className="px-1.5 py-1 rounded-lg text-[11px] text-slate-500 hover:bg-slate-100 cursor-pointer"
                                  >
                                    戻す
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setPendingActionConfirm({ txId: tx.txId, action: 'delete' })
                                  }
                                  title="この確定点検レコードを削除"
                                  className="p-1.5 rounded-lg text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </tr>

                  {/* Expandable Checklist Result Sub-Row for Completed Inspections */}
                  {isExpanded && tx.checklistResults.length > 0 && (
                    <tr className="bg-slate-50/90">
                      <td colSpan={11} className="px-6 py-3 border-b border-slate-200">
                        <div className="text-[11px] font-bold text-slate-700 mb-2 flex items-center gap-2">
                          <ClipboardCheck className="w-3.5 h-3.5 text-emerald-600" />
                          <span>
                            {asset.name} — {formatAssetDateJa(tx.eventDate)} {tx.inspectionType}{' '}
                            点検チェック結果 ({tx.checklistResults.length}項目)
                          </span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-1.5 text-[11px]">
                          {tx.checklistResults.map((r, rIdx) => (
                            <div
                              key={r.itemId || rIdx}
                              className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200/80"
                            >
                              <span className="truncate text-slate-700">
                                {rIdx + 1}. {r.label}
                              </span>
                              <span
                                className={`font-bold shrink-0 ${
                                  r.status === 'ok'
                                    ? 'text-emerald-700'
                                    : r.status === 'caution'
                                    ? 'text-amber-700'
                                    : r.status === 'ng'
                                    ? 'text-rose-700'
                                    : 'text-slate-500'
                                }`}
                              >
                                {r.status === 'ok'
                                  ? '良好'
                                  : r.status === 'caution'
                                  ? '要注意'
                                  : r.status === 'ng'
                                  ? '不良'
                                  : '対象外'}
                                {r.note ? ` (${r.note})` : ''}
                              </span>
                            </div>
                          ))}
                        </div>
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              );
            })}

            {displayedTransactions.length === 0 && (
              <tr>
                <td colSpan={11} className="py-12 text-center text-xs text-slate-400">
                  該当する点検予定または確定済みの点検記録はありません。「+ 点検予定を登録」または「+ 点検実績を記録」から追加できます。
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* Modal 1: 新規点検予定の登録 */}
      {createScheduleOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setCreateScheduleOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CalendarPlus className="w-5 h-5 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900">新しい点検予定を登録</h3>
              </div>
              <button
                type="button"
                onClick={() => setCreateScheduleOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitNewSchedule} className="p-5 space-y-4">
              {newSchedError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                  {newSchedError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  対象資産 <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  value={newSchedAssetSearch}
                  onChange={(e) => setNewSchedAssetSearch(e.target.value)}
                  placeholder="登録番号・資産名・拠点で絞り込み..."
                  className="w-full px-3 py-1.5 mb-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
                <select
                  value={newSchedAssetId}
                  onChange={(e) => handleSelectAssetForNewSchedule(e.target.value)}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">-- 資産を選択 --</option>
                  {newSchedFilteredAssets.map((a) => {
                    const catName = categoryMap.get(a.categoryId)?.name || '資産';
                    const offName = a.officeId
                      ? resolveOfficeName(a.officeId, offices)
                      : a.office || '';
                    return (
                      <option key={a.id} value={a.id}>
                        [{catName}] {a.name}
                        {offName ? ` (${offName})` : ''}
                        {a.assigneeUserName ? ` · ${a.assigneeUserName}` : a.isShared ? ' · 共用' : ''}
                      </option>
                    );
                  })}
                </select>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    点検予定日 (JST) <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={newSchedDate}
                    onChange={(e) => setNewSchedDate(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg tabular-nums focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">点検内容・種別</label>
                  <select
                    value={newSchedType}
                    onChange={(e) => setNewSchedType(e.target.value)}
                    className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  >
                    {newSchedTypeOptions.map((opt) => (
                      <option key={opt} value={opt}>
                        {opt}
                      </option>
                    ))}
                    {newSchedType && !newSchedTypeOptions.includes(newSchedType) && (
                      <option value={newSchedType}>{newSchedType}</option>
                    )}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">点検業者・対応先</label>
                <input
                  type="text"
                  value={newSchedVendor}
                  onChange={(e) => setNewSchedVendor(e.target.value)}
                  placeholder="例: トヨタレンタリース名古屋 / 担当者"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">予定メモ（任意）</label>
                <input
                  type="text"
                  value={newSchedMemo}
                  onChange={(e) => setNewSchedMemo(e.target.value)}
                  placeholder="例: オイル交換・タイヤ空気圧も確認依頼"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setCreateScheduleOpen(false)}
                  className="px-4 py-2 rounded-lg text-xs font-bold text-slate-600 hover:bg-slate-100 cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={newSchedSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  <CalendarPlus className="w-4 h-4" />
                  {newSchedSubmitting ? '登録中...' : '予定を登録'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: 確定点検記録用の資産選択 */}
      {recordPickerOpen && (
        <div
          className="fixed inset-0 z-[70] bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setRecordPickerOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                <h3 className="text-sm font-bold text-slate-900">点検実績を記録する資産を選択</h3>
              </div>
              <button
                type="button"
                onClick={() => setRecordPickerOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 border-b border-slate-100">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  autoFocus
                  value={recordAssetSearch}
                  onChange={(e) => setRecordAssetSearch(e.target.value)}
                  placeholder="登録番号・資産名・拠点・使用者で検索"
                  className="w-full pl-8 pr-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
              {recordFilteredAssets.map((a) => {
                const cat = categoryMap.get(a.categoryId);
                const CatIcon = getAssetIconComponent(cat?.icon);
                const offName = a.officeId
                  ? resolveOfficeName(a.officeId, offices)
                  : a.office || '';
                return (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => {
                      setRecordPickerOpen(false);
                      onOpenConfirmModal(a, { directMode: true });
                    }}
                    className="w-full px-4 py-2.5 text-left hover:bg-emerald-50/70 transition-colors flex items-center justify-between gap-3 cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <CatIcon className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-900 truncate">{a.name}</div>
                        <div className="text-[11px] text-slate-500 truncate">
                          {cat?.name || '資産'}
                          {offName ? ` · ${offName}` : ''}
                          {a.isShared
                            ? ' · 共用'
                            : a.assigneeUserName
                            ? ` · ${a.assigneeUserName}`
                            : ''}
                        </div>
                      </div>
                    </div>
                    <span className="text-[11px] font-bold text-emerald-700 shrink-0">選択 →</span>
                  </button>
                );
              })}
              {recordFilteredAssets.length === 0 && (
                <div className="py-10 text-center text-xs text-slate-400">
                  一致する資産がありません
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
