import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Plus,
  Download,
  Upload,
  Settings2,
  Calendar as CalendarIcon,
  User as UserIcon,
  Users,
  Search,
  AlertOctagon,
  AlertTriangle,
  CalendarClock,
  Paperclip,
  Layers,
  RefreshCw,
  FolderPlus,
  ExternalLink,
  Check
} from 'lucide-react';
import { API_BASE_URL } from '../../config/api';
import {
  AssetAlertInfo,
  AssetCategory,
  AssetFieldDefinition,
  AssetItem,
  AssetLogActionType,
  AssetLogItem,
  DivisionMaster,
  OfficeMaster,
  User
} from '../../types';
import {
  ASSET_STATUS_META,
  computeAssetAlerts,
  exportAssetsToCsv,
  formatAssetDateJa,
  getAssetIconComponent,
  getCategoryTheme,
  getJstTodayStr,
  getSelectChipStyle
} from '../../utils/assets';
import { isSameOffice, resolveOfficeName } from '../../utils/masterResolver';
import { getAvatarUrl } from '../../utils/avatar';
import { AssetDetailModal } from './AssetDetailModal';
import { AssetCategoryEditorModal } from './AssetCategoryEditorModal';
import { AssetCsvImportModal } from './AssetCsvImportModal';
import { AssetCalendarView } from './AssetCalendarView';

interface AssetManagementProps {
  currentUser: User;
  allUsers: User[];
  offices: OfficeMaster[];
  divisions: DivisionMaster[];
  initialAssetId?: string;
  onClearInitialAssetId?: () => void;
}

type MainMode = 'my' | 'catalog' | 'shared' | 'calendar';
type SubLens = 'all' | 'inspection_due' | 'last_inspection' | 'attachments' | 'lease_alert';
type AlertFilterType = 'none' | 'all_alerts' | 'overdue' | 'inspection_1m' | 'replacement_6m';

export function AssetManagement({
  currentUser,
  allUsers,
  offices,
  divisions,
  initialAssetId,
  onClearInitialAssetId
}: AssetManagementProps) {
  const [categories, setCategories] = useState<AssetCategory[]>([]);
  const [assets, setAssets] = useState<AssetItem[]>([]);
  const [logs, setLogs] = useState<AssetLogItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string>('');

  // Navigation / Filter states
  const [mainMode, setMainMode] = useState<MainMode>('my');
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('all');
  const [selectedOfficeFilter, setSelectedOfficeFilter] = useState<string>('all');
  const [subLens, setSubLens] = useState<SubLens>('all');
  const [alertFilter, setAlertFilter] = useState<AlertFilterType>('none');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [assigneeFilter, setAssigneeFilter] = useState<string>('all');
  const [showRetired, setShowRetired] = useState<boolean>(false);

  // Modals
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
  const [categoryModalOpen, setCategoryModalOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<AssetCategory | null>(null);
  const [csvImportModalOpen, setCsvImportModalOpen] = useState<boolean>(false);

  const todayStr = getJstTodayStr();

  const fetchAllData = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [catRes, assetRes, logRes] = await Promise.all([
        fetch(`${API_BASE_URL}/assets/categories`),
        fetch(`${API_BASE_URL}/assets/items`),
        fetch(`${API_BASE_URL}/assets/logs`)
      ]);
      if (!catRes.ok || !assetRes.ok) {
        const failedPart = !catRes.ok ? `categories:${catRes.status}` : `items:${assetRes.status}`;
        throw new Error(`資産データの取得に失敗しました (${failedPart})`);
      }
      const [catData, assetData, logData] = await Promise.all([
        catRes.json(),
        assetRes.json(),
        logRes.ok ? logRes.json() : Promise.resolve([])
      ]);
      const cats: AssetCategory[] = Array.isArray(catData) ? catData : [];
      const asts: AssetItem[] = Array.isArray(assetData) ? assetData : [];
      const lgs: AssetLogItem[] = Array.isArray(logData) ? logData : [];
      setCategories(cats);
      setAssets(asts);
      setLogs(lgs);
    } catch (err: any) {
      setError(err?.message || '資産データの読み込みに失敗しました');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  // Deep link handler (?tab=assets&assetId=...)
  useEffect(() => {
    if (!initialAssetId || assets.length === 0) return;
    const found = assets.find((a) => String(a.id) === String(initialAssetId));
    if (found) {
      setEditingAsset(found);
      setDetailModalOpen(true);
      onClearInitialAssetId?.();
    }
  }, [initialAssetId, assets, onClearInitialAssetId]);

  // Switch to first category automatically when entering catalog mode with 'all' selected
  const handleChangeMainMode = (mode: MainMode) => {
    setMainMode(mode);
    setAlertFilter('none');
    if (mode === 'catalog' && selectedCategoryId === 'all' && categories.length > 0) {
      setSelectedCategoryId(categories[0].id);
    }
  };

  const categoryMap = useMemo(() => {
    const map = new Map<string, AssetCategory>();
    categories.forEach((c) => map.set(c.id, c));
    return map;
  }, [categories]);

  const userMap = useMemo(() => {
    const map = new Map<string, User>();
    allUsers.forEach((u) => map.set(String(u.id), u));
    return map;
  }, [allUsers]);

  // Pre-compute alerts per asset
  const assetAlertsMap = useMemo(() => {
    const map = new Map<string, AssetAlertInfo[]>();
    for (const a of assets) {
      const cat = categoryMap.get(a.categoryId);
      map.set(a.id, computeAssetAlerts(a, cat, todayStr));
    }
    return map;
  }, [assets, categoryMap, todayStr]);

  // Global summary counts
  const summaryStats = useMemo(() => {
    let myCount = 0;
    let sharedCount = 0;
    let overdueCount = 0;
    let inspection1mCount = 0;
    let replacement6mCount = 0;

    for (const a of assets) {
      if (a.status === 'retired') continue;
      if (a.isShared) sharedCount++;
      if (!a.isShared && String(a.assigneeUserId) === String(currentUser.id)) {
        myCount++;
      }
      const alerts = assetAlertsMap.get(a.id) || [];
      if (alerts.some((al) => al.severity === 'overdue')) overdueCount++;
      if (alerts.some((al) => al.kind === 'inspection' && al.severity !== 'overdue')) {
        inspection1mCount++;
      }
      if (alerts.some((al) => al.kind === 'replacement' && al.severity !== 'overdue')) {
        replacement6mCount++;
      }
    }
    return {
      totalActive: assets.filter((a) => a.status !== 'retired').length,
      myCount,
      sharedCount,
      overdueCount,
      inspection1mCount,
      replacement6mCount
    };
  }, [assets, assetAlertsMap, currentUser.id]);

  // Active category in catalog mode
  const activeCategory = useMemo(() => {
    if (selectedCategoryId === 'all') return null;
    return categoryMap.get(selectedCategoryId) || categories[0] || null;
  }, [selectedCategoryId, categoryMap, categories]);

  // Filtered & sorted asset list
  const displayedAssets = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    let list = assets.filter((a) => {
      if (!showRetired && a.status === 'retired') return false;

      if (mainMode === 'my') {
        if (a.isShared || String(a.assigneeUserId) !== String(currentUser.id)) {
          return false;
        }
      } else if (mainMode === 'shared') {
        if (!a.isShared) return false;
      }

      if (selectedCategoryId !== 'all' && a.categoryId !== selectedCategoryId) {
        return false;
      }

      if (selectedOfficeFilter !== 'all') {
        const assetOffice = a.officeId || a.office || '';
        if (!isSameOffice(assetOffice, selectedOfficeFilter, offices)) {
          return false;
        }
      }

      if (mainMode === 'catalog' && assigneeFilter !== 'all') {
        if (assigneeFilter === '__shared__') {
          if (!a.isShared) return false;
        } else if (assigneeFilter === '__unassigned__') {
          if (a.isShared || a.assigneeUserId) return false;
        } else if (String(a.assigneeUserId) !== String(assigneeFilter)) {
          return false;
        }
      }

      const alerts = assetAlertsMap.get(a.id) || [];
      if (alertFilter === 'all_alerts' && alerts.length === 0) return false;
      if (alertFilter === 'overdue' && !alerts.some((al) => al.severity === 'overdue')) {
        return false;
      }
      if (
        alertFilter === 'inspection_1m' &&
        !alerts.some((al) => al.kind === 'inspection')
      ) {
        return false;
      }
      if (
        alertFilter === 'replacement_6m' &&
        !alerts.some((al) => al.kind === 'replacement')
      ) {
        return false;
      }

      if (subLens === 'attachments' && (!a.attachments || a.attachments.length === 0)) {
        return false;
      }
      if (subLens === 'lease_alert' && alerts.length === 0) {
        return false;
      }
      if (subLens === 'inspection_due') {
        const hasInspectionDate =
          Boolean(a.attributes?.nextInspectionDate) ||
          Boolean(a.attributes?.shakenExpiryDate) ||
          Boolean(a.attributes?.nextCalibrationDate) ||
          Boolean(a.attributes?.nextCheckDate);
        if (!hasInspectionDate) return false;
      }

      if (q) {
        const attrValues = Object.values(a.attributes || {})
          .map((v) => String(v ?? ''))
          .join(' ');
        const haystack = `${a.name} ${a.assetCode} ${a.assigneeUserName || ''} ${a.office || ''} ${a.notes || ''} ${attrValues}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    // SubLens sorting
    if (subLens === 'inspection_due') {
      list = [...list].sort((a, b) => {
        const da =
          a.attributes?.nextInspectionDate ||
          a.attributes?.shakenExpiryDate ||
          a.attributes?.nextCalibrationDate ||
          '9999-99-99';
        const db =
          b.attributes?.nextInspectionDate ||
          b.attributes?.shakenExpiryDate ||
          b.attributes?.nextCalibrationDate ||
          '9999-99-99';
        return String(da).localeCompare(String(db));
      });
    } else if (subLens === 'last_inspection') {
      list = [...list].sort((a, b) => {
        const da =
          a.attributes?.lastInspectionDate ||
          a.attributes?.lastCalibrationDate ||
          '0000-00-00';
        const db =
          b.attributes?.lastInspectionDate ||
          b.attributes?.lastCalibrationDate ||
          '0000-00-00';
        return String(db).localeCompare(String(da));
      });
    } else if (subLens === 'lease_alert' || alertFilter !== 'none') {
      list = [...list].sort((a, b) => {
        const minA = (assetAlertsMap.get(a.id) || [])[0]?.daysRemaining ?? 99999;
        const minB = (assetAlertsMap.get(b.id) || [])[0]?.daysRemaining ?? 99999;
        return minA - minB;
      });
    }

    return list;
  }, [
    assets,
    showRetired,
    mainMode,
    currentUser.id,
    selectedCategoryId,
    selectedOfficeFilter,
    offices,
    assigneeFilter,
    alertFilter,
    subLens,
    searchQuery,
    assetAlertsMap
  ]);

  // CRUD Handlers
  const handleSaveCategory = async (
    data: Partial<AssetCategory> & { id?: string }
  ) => {
    const isEdit = Boolean(data.id);
    const url = isEdit
      ? `${API_BASE_URL}/assets/categories/${encodeURIComponent(data.id!)}`
      : `${API_BASE_URL}/assets/categories`;
    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '種類の保存に失敗しました');
    }
    const saved: AssetCategory = await res.json();
    setCategories((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      return exists
        ? prev.map((c) => (c.id === saved.id ? saved : c))
        : [...prev, saved];
    });
    if (!isEdit && mainMode === 'catalog') {
      setSelectedCategoryId(saved.id);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    const res = await fetch(
      `${API_BASE_URL}/assets/categories/${encodeURIComponent(catId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) throw new Error('種類の削除に失敗しました');
    setCategories((prev) => prev.filter((c) => c.id !== catId));
    if (selectedCategoryId === catId) {
      setSelectedCategoryId('all');
    }
  };

  const handleSaveAsset = async (
    payload: Partial<AssetItem> & { id?: string }
  ): Promise<AssetItem> => {
    const isEdit = Boolean(payload.id);
    const url = isEdit
      ? `${API_BASE_URL}/assets/${encodeURIComponent(payload.id!)}`
      : `${API_BASE_URL}/assets`;
    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        actorId: currentUser.id,
        actorName: currentUser.name,
        createdBy: currentUser.id,
        createdByName: currentUser.name
      })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '資産の保存に失敗しました');
    }
    const saved: AssetItem = await res.json();
    setAssets((prev) => {
      const exists = prev.some((a) => a.id === saved.id);
      return exists ? prev.map((a) => (a.id === saved.id ? saved : a)) : [saved, ...prev];
    });
    // 最新の自動記録ログも反映
    fetch(`${API_BASE_URL}/assets/logs`)
      .then((r) => (r.ok ? r.json() : null))
      .then((lgs) => {
        if (Array.isArray(lgs)) setLogs(lgs);
      })
      .catch(() => {});
    return saved;
  };

  const handleDeleteAsset = async (assetId: string) => {
    const res = await fetch(`${API_BASE_URL}/assets/${encodeURIComponent(assetId)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('資産の削除に失敗しました');
    setAssets((prev) => prev.filter((a) => a.id !== assetId));
    setLogs((prev) => prev.filter((l) => l.assetId !== assetId));
  };

  const handleAddLog = async (
    assetId: string,
    payload: {
      actionType: AssetLogActionType;
      eventDate: string;
      summary: string;
      detail?: Record<string, any>;
      updateAssetAttributes?: Record<string, any>;
    }
  ) => {
    const res = await fetch(
      `${API_BASE_URL}/assets/${encodeURIComponent(assetId)}/logs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...payload,
          actorId: currentUser.id,
          actorName: currentUser.name
        })
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '履歴の追加に失敗しました');
    }
    const created: AssetLogItem = await res.json();
    setLogs((prev) => [created, ...prev]);

    if (payload.updateAssetAttributes) {
      setAssets((prev) =>
        prev.map((a) =>
          a.id === assetId
            ? {
                ...a,
                attributes: { ...a.attributes, ...payload.updateAssetAttributes }
              }
            : a
        )
      );
    }
  };

  const handleDeleteLog = async (_assetId: string, logId: string) => {
    const res = await fetch(
      `${API_BASE_URL}/assets/logs/${encodeURIComponent(logId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) return;
    setLogs((prev) => prev.filter((l) => l.id !== logId));
  };

  const handleExportCsv = () => {
    exportAssetsToCsv({
      assets: displayedAssets,
      categories,
      users: allUsers,
      offices,
      divisions,
      selectedCategory: activeCategory
    });
  };

  const openCreateModal = () => {
    setEditingAsset(null);
    setDetailModalOpen(true);
  };

  const openEditModal = (asset: AssetItem) => {
    setEditingAsset(asset);
    setDetailModalOpen(true);
  };

  // Visible columns when in specific category view
  const listColumns: AssetFieldDefinition[] = useMemo(() => {
    if (!activeCategory) return [];
    return [...(activeCategory.fields || [])]
      .filter((f) => f.showInList !== false)
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
  }, [activeCategory]);

  const renderFieldCell = (asset: AssetItem, field: AssetFieldDefinition) => {
    const val = asset.attributes?.[field.key];
    if (val === undefined || val === null || val === '') {
      return <span className="text-slate-300">-</span>;
    }
    if (field.type === 'select') {
      return (
        <span
          className={`inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-semibold border whitespace-nowrap ${getSelectChipStyle(
            String(val)
          )}`}
        >
          {String(val)}
        </span>
      );
    }
    if (field.type === 'date') {
      const alerts = assetAlertsMap.get(asset.id) || [];
      const fieldAlert = alerts.find((al) => al.fieldKey === field.key);
      return (
        <span
          className={`whitespace-nowrap text-xs ${
            fieldAlert?.severity === 'overdue'
              ? 'text-rose-700 font-bold'
              : fieldAlert?.severity === 'warning'
              ? 'text-amber-800 font-bold'
              : fieldAlert?.severity === 'upcoming'
              ? 'text-purple-700 font-bold'
              : 'text-slate-700'
          }`}
        >
          {formatAssetDateJa(String(val))}
        </span>
      );
    }
    if (field.type === 'checkbox') {
      return val ? (
        <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold whitespace-nowrap">
          <Check className="w-3.5 h-3.5" />
          対象
        </span>
      ) : (
        <span className="text-slate-400 text-xs">-</span>
      );
    }
    if (field.type === 'number') {
      return (
        <span className="whitespace-nowrap text-xs text-slate-700 font-medium">
          {Number(val).toLocaleString()}
          {field.unit ? ` ${field.unit}` : ''}
        </span>
      );
    }
    if (field.type === 'url') {
      return (
        <a
          href={String(val)}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => e.stopPropagation()}
          className="inline-flex items-center gap-1 text-xs text-indigo-600 hover:underline whitespace-nowrap"
        >
          <ExternalLink className="w-3 h-3" />
          リンク
        </a>
      );
    }
    return (
      <span className="text-xs text-slate-700 truncate max-w-[180px] block" title={String(val)}>
        {String(val)}
      </span>
    );
  };

  const renderAlertIconCell = (assetId: string) => {
    const alerts = assetAlertsMap.get(assetId) || [];
    if (alerts.length === 0) return null;
    const top = alerts[0];
    const tooltip = alerts
      .map(
        (al) =>
          `${al.ruleLabel}(${al.fieldLabel}): ${al.targetDate} [${
            al.daysRemaining < 0 ? `${Math.abs(al.daysRemaining)}日超過` : `あと${al.daysRemaining}日`
          }]`
      )
      .join('\n');

    if (top.severity === 'overdue') {
      return (
        <span title={tooltip} className="inline-flex items-center gap-1 text-rose-600">
          <AlertOctagon className="w-4 h-4 fill-rose-100" />
          <span className="text-[10px] font-extrabold whitespace-nowrap">超過</span>
        </span>
      );
    }
    if (top.severity === 'warning') {
      return (
        <span title={tooltip} className="inline-flex items-center gap-1 text-amber-600">
          <AlertTriangle className="w-4 h-4 fill-amber-100" />
          <span className="text-[10px] font-bold whitespace-nowrap">
            {top.daysRemaining}日
          </span>
        </span>
      );
    }
    return (
      <span title={tooltip} className="inline-flex items-center gap-1 text-purple-600">
        <CalendarClock className="w-4 h-4" />
        <span className="text-[10px] font-bold whitespace-nowrap">入替</span>
      </span>
    );
  };

  return (
    <div className="space-y-5">
      {/* Header & Main Mode Switcher */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <Layers className="w-6 h-6 text-indigo-600" />
              <span>資産管理</span>
              <span className="px-2 py-0.5 text-[11px] font-bold text-amber-700 bg-amber-100 rounded-full border border-amber-200 whitespace-nowrap">
                開発中
              </span>
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              車両・PC・工具・共用機器を一元管理し、点検（1ヶ月前）・リース満了入替（6ヶ月前）を自動検知します
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={fetchAllData}
              className="p-2 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-slate-800 hover:bg-slate-50 cursor-pointer"
              title="最新データに更新"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCategory(activeCategory || null);
                setCategoryModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 cursor-pointer whitespace-nowrap"
            >
              <Settings2 className="w-3.5 h-3.5 text-indigo-600" />
              {activeCategory ? `「${activeCategory.name}」項目設定` : '資産種類を追加'}
            </button>
            {mainMode !== 'calendar' && (
              <>
                <button
                  type="button"
                  onClick={() => setCsvImportModalOpen(true)}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-indigo-200 bg-indigo-50/70 text-indigo-700 hover:bg-indigo-100 cursor-pointer whitespace-nowrap"
                >
                  <Upload className="w-3.5 h-3.5 text-indigo-600" />
                  CSVインポート
                </button>
                <button
                  type="button"
                  onClick={handleExportCsv}
                  disabled={displayedAssets.length === 0}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  <Download className="w-3.5 h-3.5 text-emerald-600" />
                  CSV出力
                </button>
              </>
            )}
            <button
              type="button"
              onClick={openCreateModal}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold bg-sky-600 hover:bg-sky-700 text-white shadow-xs cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-4 h-4" />
              新規
            </button>
          </div>
        </div>

        {/* Mode Tabs + Alert KPI Badges */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1 border-t border-slate-100">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => handleChangeMainMode('my')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                mainMode === 'my'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <UserIcon className="w-3.5 h-3.5" />
              自分の資産
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  mainMode === 'my'
                    ? 'bg-white/20 text-white'
                    : 'bg-white text-slate-700'
                }`}
              >
                {summaryStats.myCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleChangeMainMode('catalog')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                mainMode === 'catalog'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              資産台帳（種類別）
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  mainMode === 'catalog'
                    ? 'bg-white/20 text-white'
                    : 'bg-white text-slate-700'
                }`}
              >
                {summaryStats.totalActive}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleChangeMainMode('shared')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                mainMode === 'shared'
                  ? 'bg-emerald-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Users className="w-3.5 h-3.5" />
              共用資産（限定なし）
              <span
                className={`px-1.5 py-0.2 rounded-full text-[10px] ${
                  mainMode === 'shared'
                    ? 'bg-white/20 text-white'
                    : 'bg-white text-slate-700'
                }`}
              >
                {summaryStats.sharedCount}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleChangeMainMode('calendar')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                mainMode === 'calendar'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              資産カレンダー
            </button>
          </div>

          {/* Clickable Alert KPI Chips */}
          {mainMode !== 'calendar' && (
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() =>
                  setAlertFilter((prev) => (prev === 'overdue' ? 'none' : 'overdue'))
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer whitespace-nowrap ${
                  alertFilter === 'overdue'
                    ? 'bg-rose-600 text-white border-rose-600'
                    : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100'
                }`}
              >
                <AlertOctagon className="w-3.5 h-3.5" />
                期限超過: {summaryStats.overdueCount}
              </button>

              <button
                type="button"
                onClick={() =>
                  setAlertFilter((prev) =>
                    prev === 'inspection_1m' ? 'none' : 'inspection_1m'
                  )
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer whitespace-nowrap ${
                  alertFilter === 'inspection_1m'
                    ? 'bg-amber-500 text-white border-amber-500'
                    : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100'
                }`}
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                点検アラート(1ヶ月前): {summaryStats.inspection1mCount}
              </button>

              <button
                type="button"
                onClick={() =>
                  setAlertFilter((prev) =>
                    prev === 'replacement_6m' ? 'none' : 'replacement_6m'
                  )
                }
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-all cursor-pointer whitespace-nowrap ${
                  alertFilter === 'replacement_6m'
                    ? 'bg-purple-600 text-white border-purple-600'
                    : 'bg-purple-50 text-purple-800 border-purple-200 hover:bg-purple-100'
                }`}
              >
                <CalendarClock className="w-3.5 h-3.5" />
                入替アラート(6ヶ月前): {summaryStats.replacement6mCount}
              </button>
            </div>
          )}
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Main Content */}
      {mainMode === 'calendar' ? (
        <AssetCalendarView
          assets={assets}
          categories={categories}
          logs={logs}
          offices={offices}
          onSelectAsset={openEditModal}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
          {/* Category Pills Bar */}
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(mainMode === 'my' || mainMode === 'shared') && (
                <button
                  type="button"
                  onClick={() => setSelectedCategoryId('all')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                    selectedCategoryId === 'all'
                      ? 'bg-slate-900 text-white'
                      : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  すべて
                </button>
              )}

              {categories.map((cat) => {
                const IconComp = getAssetIconComponent(cat.icon);
                const theme = getCategoryTheme(cat.color);
                const active = selectedCategoryId === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => setSelectedCategoryId(cat.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                      active
                        ? `${theme.pill} border-transparent shadow-2xs`
                        : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <IconComp className="w-3.5 h-3.5" />
                    <span>{cat.name}</span>
                  </button>
                );
              })}

              <button
                type="button"
                onClick={() => {
                  setEditingCategory(null);
                  setCategoryModalOpen(true);
                }}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-bold border border-dashed border-slate-300 text-slate-500 hover:text-indigo-700 hover:border-indigo-400 hover:bg-indigo-50/40 cursor-pointer whitespace-nowrap"
              >
                <FolderPlus className="w-3.5 h-3.5" />
                種類追加
              </button>
            </div>

            {/* Search & Filters */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="番号・使用者・型番で検索"
                  className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
                />
              </div>

              {mainMode === 'catalog' && (
                <select
                  value={assigneeFilter}
                  onChange={(e) => setAssigneeFilter(e.target.value)}
                  className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
                >
                  <option value="all">使用者: すべて</option>
                  <option value="__shared__">共用（限定なし）</option>
                  <option value="__unassigned__">未割当</option>
                  {allUsers.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              )}

              <label className="inline-flex items-center gap-1 text-[11px] text-slate-500 cursor-pointer whitespace-nowrap px-2">
                <input
                  type="checkbox"
                  checked={showRetired}
                  onChange={(e) => setShowRetired(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600"
                />
                廃棄済も表示
              </label>
            </div>
          </div>

          {/* Notion-Style Sub-View Pills (拠点フィルタ & ビューレンズ) */}
          <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                setSelectedOfficeFilter('all');
                setSubLens('all');
              }}
              className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                selectedOfficeFilter === 'all' && subLens === 'all'
                  ? 'bg-slate-200 text-slate-900 font-bold'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              すべて
            </button>

            {offices.map((off) => (
              <button
                key={off.id}
                type="button"
                onClick={() =>
                  setSelectedOfficeFilter((prev) =>
                    prev === off.id ? 'all' : off.id
                  )
                }
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  selectedOfficeFilter === off.id
                    ? 'bg-indigo-100 text-indigo-800 font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {off.name}
              </button>
            ))}

            <span className="h-4 w-px bg-slate-200 mx-1" />

            {(
              [
                { id: 'inspection_due', label: '点検予定' },
                { id: 'last_inspection', label: '前回点検日' },
                { id: 'attachments', label: '資料添付' },
                { id: 'lease_alert', label: 'リースアップ・アラート' }
              ] as const
            ).map((lens) => (
              <button
                key={lens.id}
                type="button"
                onClick={() =>
                  setSubLens((prev) => (prev === lens.id ? 'all' : lens.id))
                }
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  subLens === lens.id
                    ? 'bg-amber-100 text-amber-900 font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                {lens.label}
              </button>
            ))}
          </div>

          {/* Notion-Style Spreadsheet Table */}
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/80 text-[11px] font-bold text-slate-500">
                  <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap min-w-[170px]">
                    {activeCategory?.id === 'cat-vehicle' ? '登録番号' : '管理番号 / 資産名'}
                  </th>
                  {!activeCategory && (
                    <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">
                      種類
                    </th>
                  )}
                  <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap min-w-[130px]">
                    使用者
                  </th>
                  <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">
                    拠点
                  </th>
                  <th className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap">
                    警告
                  </th>

                  {activeCategory ? (
                    listColumns.map((col) => (
                      <th
                        key={col.key}
                        className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap"
                      >
                        {col.label}
                      </th>
                    ))
                  ) : (
                    <>
                      <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">
                        車種・型番 / 主要情報
                      </th>
                      <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">
                        点検予定 / 期限
                      </th>
                      <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap">
                        リース満了
                      </th>
                    </>
                  )}

                  <th className="py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap min-w-[140px]">
                    備考
                  </th>
                  <th className="py-2.5 px-2.5 border-r border-slate-200/80 whitespace-nowrap text-center">
                    資料
                  </th>
                  {activeCategory && (
                    <th className="py-2.5 px-2 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          setEditingCategory(activeCategory);
                          setCategoryModalOpen(true);
                        }}
                        title="項目（パラメータ）を追加・編集"
                        className="p-1 rounded hover:bg-slate-200 text-slate-500 hover:text-indigo-700 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                      </button>
                    </th>
                  )}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-200/80 text-xs">
                {displayedAssets.map((asset) => {
                  const cat = categoryMap.get(asset.categoryId);
                  const CatIcon = getAssetIconComponent(cat?.icon);
                  const catTheme = getCategoryTheme(cat?.color);
                  const assignee = asset.assigneeUserId
                    ? userMap.get(String(asset.assigneeUserId))
                    : undefined;
                  const assigneeAvatar = assignee ? getAvatarUrl(assignee.avatarUrl) : '';
                  const officeLabel = asset.officeId
                    ? resolveOfficeName(asset.officeId, offices) || asset.office || ''
                    : asset.office || '';

                  // Summary fields for mixed-category view ('自分の資産' / '共用資産')
                  const summaryText =
                    asset.attributes?.vehicleModel ||
                    asset.attributes?.makerModel ||
                    asset.attributes?.equipmentType ||
                    asset.attributes?.toolType ||
                    asset.assetCode ||
                    '-';
                  const nextDate =
                    asset.attributes?.nextInspectionDate ||
                    asset.attributes?.shakenExpiryDate ||
                    asset.attributes?.nextCalibrationDate ||
                    asset.attributes?.nextCheckDate ||
                    '';
                  const leaseDate = asset.attributes?.leaseEndDate || '';

                  return (
                    <tr
                      key={asset.id}
                      onClick={() => openEditModal(asset)}
                      className={`group hover:bg-indigo-50/40 transition-colors cursor-pointer ${
                        asset.status === 'retired' ? 'opacity-50 bg-slate-50' : ''
                      }`}
                    >
                      {/* 登録番号 / 名称 + Hover 開く */}
                      <td className="py-2 px-3 border-r border-slate-200/70">
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <CatIcon className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span className="font-bold text-slate-900 truncate">
                              {asset.name}
                            </span>
                            {asset.status !== 'active' && (
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold border whitespace-nowrap ${
                                  ASSET_STATUS_META[asset.status]?.badgeClass || ''
                                }`}
                              >
                                {ASSET_STATUS_META[asset.status]?.label}
                              </span>
                            )}
                          </div>
                          <span className="opacity-0 group-hover:opacity-100 px-1.5 py-0.5 rounded bg-white border border-slate-300 text-[10px] font-bold text-slate-600 shadow-2xs shrink-0 transition-opacity">
                            開く
                          </span>
                        </div>
                      </td>

                      {/* 種類 (mixed view only) */}
                      {!activeCategory && (
                        <td className="py-2 px-3 border-r border-slate-200/70 whitespace-nowrap">
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${catTheme.badge}`}
                          >
                            <CatIcon className="w-3 h-3" />
                            {cat?.name || '資産'}
                          </span>
                        </td>
                      )}

                      {/* 使用者 */}
                      <td className="py-2 px-3 border-r border-slate-200/70 whitespace-nowrap">
                        {asset.isShared ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Users className="w-3 h-3" />
                            共用（限定なし）
                          </span>
                        ) : assignee || asset.assigneeUserName ? (
                          <div className="flex items-center gap-1.5">
                            {assigneeAvatar ? (
                              <img
                                src={assigneeAvatar}
                                alt={assignee?.name || asset.assigneeUserName}
                                className="w-5 h-5 rounded-full object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-600 flex items-center justify-center text-[10px] font-bold shrink-0">
                                {(assignee?.name || asset.assigneeUserName || '?').slice(0, 1)}
                              </span>
                            )}
                            <span className="font-medium text-slate-800">
                              {assignee?.name || asset.assigneeUserName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">未割当</span>
                        )}
                      </td>

                      {/* 拠点 */}
                      <td className="py-2 px-3 border-r border-slate-200/70 whitespace-nowrap text-slate-600">
                        {officeLabel || '-'}
                      </td>

                      {/* 警告 */}
                      <td className="py-2 px-2.5 border-r border-slate-200/70 whitespace-nowrap">
                        {renderAlertIconCell(asset.id)}
                      </td>

                      {/* 動的列 or 混合サマリー列 */}
                      {activeCategory ? (
                        listColumns.map((col) => (
                          <td
                            key={col.key}
                            className="py-2 px-3 border-r border-slate-200/70"
                          >
                            {renderFieldCell(asset, col)}
                          </td>
                        ))
                      ) : (
                        <>
                          <td className="py-2 px-3 border-r border-slate-200/70 text-slate-700 whitespace-nowrap">
                            {summaryText}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200/70 whitespace-nowrap">
                            {nextDate ? formatAssetDateJa(nextDate) : '-'}
                          </td>
                          <td className="py-2 px-3 border-r border-slate-200/70 whitespace-nowrap">
                            {leaseDate ? formatAssetDateJa(leaseDate) : '-'}
                          </td>
                        </>
                      )}

                      {/* 備考 */}
                      <td className="py-2 px-3 border-r border-slate-200/70 max-w-[200px]">
                        <span className="truncate block text-slate-600" title={asset.notes}>
                          {asset.notes || ''}
                        </span>
                      </td>

                      {/* 添付 */}
                      <td className="py-2 px-2.5 border-r border-slate-200/70 text-center whitespace-nowrap">
                        {asset.attachments && asset.attachments.length > 0 ? (
                          <span className="inline-flex items-center gap-0.5 text-indigo-600 font-bold">
                            <Paperclip className="w-3 h-3" />
                            {asset.attachments.length}
                          </span>
                        ) : (
                          <span className="text-slate-300">-</span>
                        )}
                      </td>

                      {activeCategory && <td className="py-2 px-2" />}
                    </tr>
                  );
                })}

                {!loading && displayedAssets.length === 0 && (
                  <tr>
                    <td
                      colSpan={activeCategory ? listColumns.length + 8 : 11}
                      className="py-12 text-center text-xs text-slate-400"
                    >
                      該当する資産が登録されていません。「+ 新規」から資産を追加できます。
                    </td>
                  </tr>
                )}
              </tbody>

              {/* Notion-style footer add row */}
              <tfoot>
                <tr className="border-t border-slate-200 bg-slate-50/50">
                  <td colSpan={activeCategory ? listColumns.length + 8 : 11} className="p-2">
                    <button
                      type="button"
                      onClick={openCreateModal}
                      className="w-full text-left px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-500 hover:text-indigo-700 hover:bg-indigo-50/60 flex items-center gap-1.5 transition-colors cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      新規ページ（{activeCategory ? `${activeCategory.name}を` : '資産を'}追加）
                    </button>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Modals */}
      <AssetDetailModal
        isOpen={detailModalOpen}
        onClose={() => {
          setDetailModalOpen(false);
          setEditingAsset(null);
        }}
        asset={editingAsset}
        defaultCategoryId={
          selectedCategoryId !== 'all' ? selectedCategoryId : categories[0]?.id
        }
        defaultIsShared={mainMode === 'shared' ? true : undefined}
        categories={categories}
        currentUser={currentUser}
        users={allUsers}
        offices={offices}
        divisions={divisions}
        logs={logs}
        onSaveAsset={handleSaveAsset}
        onDeleteAsset={handleDeleteAsset}
        onAddLog={handleAddLog}
        onDeleteLog={handleDeleteLog}
      />

      <AssetCategoryEditorModal
        isOpen={categoryModalOpen}
        onClose={() => {
          setCategoryModalOpen(false);
          setEditingCategory(null);
        }}
        category={editingCategory}
        onSave={handleSaveCategory}
        onDelete={handleDeleteCategory}
      />

      <AssetCsvImportModal
        isOpen={csvImportModalOpen}
        onClose={() => setCsvImportModalOpen(false)}
        categories={categories}
        defaultCategoryId={
          selectedCategoryId !== 'all' ? selectedCategoryId : categories[0]?.id
        }
        existingAssets={assets}
        users={allUsers}
        offices={offices}
        divisions={divisions}
        onImportAsset={handleSaveAsset}
        onSaveCategory={handleSaveCategory}
        onComplete={fetchAllData}
      />
    </div>
  );
}
