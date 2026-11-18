import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  Check,
  Share2,
  Star,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  RotateCcw,
  ClipboardCheck,
  Gauge
} from 'lucide-react';
import { API_BASE_URL } from '../../config/api';
import { AppQueryParams, buildAppUrl, copyTextToClipboard } from '../../utils/urlParams';
import { upsertBookmarkForUser } from '../../utils/bookmarks';
import {
  AssetAlertInfo,
  AssetCategory,
  AssetFieldDefinition,
  AssetItem,
  AssetLogActionType,
  AssetLogItem,
  AssetSortConfig,
  AssetViewSettings,
  DivisionMaster,
  OfficeMaster,
  User
} from '../../types';
import {
  ASSET_STATUS_META,
  INSPECTION_SCHEDULE_FIELD_KEYS,
  LAST_INSPECTION_FIELD_KEYS,
  MILEAGE_FIELD_KEYS,
  computeAssetAlerts,
  exportAssetsToCsv,
  formatAssetDateJa,
  getActiveScheduledInspection,
  getAssetIconComponent,
  getCategoryTheme,
  getDerivedLastInspectionDate,
  getEffectiveAssetMileage,
  getJstTodayStr,
  getSelectChipStyle
} from '../../utils/assets';
import { isSameOffice, resolveOffice, resolveOfficeName } from '../../utils/masterResolver';
import { getAvatarUrl } from '../../utils/avatar';
import { AssetDetailModal } from './AssetDetailModal';
import { AssetCategoryEditorModal } from './AssetCategoryEditorModal';
import { AssetCsvImportModal } from './AssetCsvImportModal';
import { AssetCalendarView } from './AssetCalendarView';
import { AssetInspectionListView } from './AssetInspectionListView';
import {
  AssetInspectionConfirmModal,
  ConfirmInspectionPayload,
  RescheduleInspectionPayload
} from './AssetInspectionConfirmModal';

export interface AssetInitialParams {
  assetMode?: 'my' | 'catalog' | 'shared' | 'inspections' | 'calendar';
  assetCategory?: string;
  assetOffice?: string;
  assetAssignee?: string;
  assetLens?: 'all' | 'inspection_due' | 'last_inspection' | 'attachments' | 'lease_alert';
  assetAlert?: 'none' | 'all_alerts' | 'overdue' | 'inspection_1m' | 'replacement_6m';
  assetQ?: string;
  assetShowRetired?: boolean;
  assetSubTab?: 'details' | 'inspections' | 'history';
  assetSort?: string;
  requestKey?: number;
}

function parseAssetSortStr(raw?: string): AssetSortConfig | null {
  if (!raw) return null;
  const idx = raw.lastIndexOf(':');
  if (idx <= 0) return null;
  const key = raw.slice(0, idx).trim();
  const dir = raw.slice(idx + 1).trim();
  if (!key || (dir !== 'asc' && dir !== 'desc')) return null;
  return { key, dir };
}

interface AssetManagementProps {
  currentUser: User;
  allUsers: User[];
  offices: OfficeMaster[];
  divisions: DivisionMaster[];
  initialAssetId?: string;
  initialAssetParams?: AssetInitialParams;
  onClearInitialAssetId?: () => void;
  onUpdateUser?: (user: User) => void;
}

type MainMode = 'my' | 'catalog' | 'shared' | 'inspections' | 'calendar';
type SubLens = 'all' | 'inspection_due' | 'last_inspection' | 'attachments' | 'lease_alert';
type AlertFilterType = 'none' | 'all_alerts' | 'overdue' | 'inspection_1m' | 'replacement_6m';

export function AssetManagement({
  currentUser,
  allUsers,
  offices,
  divisions,
  initialAssetId,
  initialAssetParams,
  onClearInitialAssetId,
  onUpdateUser
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

  // Share & Bookmark feedback states
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  const [favoritesFeedback, setFavoritesFeedback] = useState<string | null>(null);
  const [pendingAssetParams, setPendingAssetParams] = useState<AssetInitialParams | null>(
    () => initialAssetParams || null
  );

  // Sort & Column Width states (personal preference per category)
  const assetViewSettings = currentUser?.preferences?.assetViewSettings;
  const categorySettingKey = selectedCategoryId || 'all';
  const [sortConfig, setSortConfig] = useState<AssetSortConfig | null>(() =>
    parseAssetSortStr(initialAssetParams?.assetSort)
  );
  const [columnWidthsByCategory, setColumnWidthsByCategory] = useState<
    Record<string, Record<string, number>>
  >(() => assetViewSettings?.columnWidths || {});
  const columnWidthsRef = useRef(columnWidthsByCategory);
  columnWidthsRef.current = columnWidthsByCategory;
  const isResizingRef = useRef(false);
  const justResizedRef = useRef(false);
  const sharedSortOverrideRef = useRef<boolean>(
    Boolean(
      initialAssetParams?.assetSort ||
        initialAssetParams?.assetMode ||
        initialAssetParams?.assetCategory ||
        initialAssetParams?.assetOffice ||
        initialAssetParams?.assetAssignee ||
        initialAssetParams?.assetLens ||
        initialAssetParams?.assetAlert ||
        initialAssetParams?.assetQ
    )
  );

  // Modals
  const [detailModalOpen, setDetailModalOpen] = useState<boolean>(false);
  const [editingAsset, setEditingAsset] = useState<AssetItem | null>(null);
  const [detailInitialSubTab, setDetailInitialSubTab] = useState<
    'details' | 'inspections' | 'history'
  >('details');
  const [categoryModalOpen, setCategoryModalOpen] = useState<boolean>(false);
  const [editingCategory, setEditingCategory] = useState<AssetCategory | null>(null);
  const [csvImportModalOpen, setCsvImportModalOpen] = useState<boolean>(false);
  const [confirmModalState, setConfirmModalState] = useState<{
    asset: AssetItem;
    targetLog?: AssetLogItem | null;
    directMode?: boolean;
  } | null>(null);

  // Inline table cell editing states
  const [inlineEditCell, setInlineEditCell] = useState<{
    assetId: string;
    colKey: string;
  } | null>(null);
  const [inlineDraftVal, setInlineDraftVal] = useState<string>('');
  const [inlineSavingId, setInlineSavingId] = useState<string | null>(null);

  const todayStr = getJstTodayStr();

  const refreshAssetsAndLogs = useCallback(async () => {
    try {
      const [assetRes, logRes] = await Promise.all([
        fetch(`${API_BASE_URL}/assets/items`),
        fetch(`${API_BASE_URL}/assets/logs`)
      ]);
      const [assetData, logData] = await Promise.all([
        assetRes.ok ? assetRes.json() : null,
        logRes.ok ? logRes.json() : null
      ]);
      if (Array.isArray(assetData)) {
        setAssets(assetData);
        setEditingAsset((prev) =>
          prev ? assetData.find((a: AssetItem) => a.id === prev.id) || prev : null
        );
      }
      if (Array.isArray(logData)) {
        setLogs(logData);
      }
      window.dispatchEvent(new CustomEvent('teranago:assets-updated'));
    } catch {
      // silent refresh failure
    }
  }, []);

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

  const persistAssetViewSettings = useCallback(
    (updater: (prev: AssetViewSettings) => AssetViewSettings) => {
      if (!currentUser || !onUpdateUser) return;
      const prevSettings: AssetViewSettings = currentUser.preferences?.assetViewSettings || {};
      const nextSettings = updater(prevSettings);
      onUpdateUser({
        ...currentUser,
        preferences: {
          ...(currentUser.preferences || {}),
          assetViewSettings: nextSettings
        }
      });
    },
    [currentUser, onUpdateUser]
  );

  // Sync saved column widths from user preferences when user switches/loads
  useEffect(() => {
    if (isResizingRef.current) return;
    setColumnWidthsByCategory(assetViewSettings?.columnWidths || {});
  }, [currentUser?.id, assetViewSettings?.columnWidths]);

  // Load remembered sort per category (unless overridden by incoming shared link)
  useEffect(() => {
    if (sharedSortOverrideRef.current) return;
    const isRemembered = Boolean(assetViewSettings?.rememberSortByCategory?.[categorySettingKey]);
    if (isRemembered) {
      setSortConfig(assetViewSettings?.sortsByCategory?.[categorySettingKey] || null);
    } else {
      setSortConfig(null);
    }
  }, [
    categorySettingKey,
    currentUser?.id,
    assetViewSettings?.rememberSortByCategory,
    assetViewSettings?.sortsByCategory
  ]);

  // Track incoming bookmark / URL param updates
  useEffect(() => {
    if (initialAssetParams?.requestKey) {
      setPendingAssetParams(initialAssetParams);
      if (!initialAssetId) {
        setDetailModalOpen(false);
        setEditingAsset(null);
      }
    }
  }, [initialAssetParams, initialAssetId]);

  // Apply URL / bookmark parameters (resolving category & office masters once loaded)
  useEffect(() => {
    if (!pendingAssetParams) return;
    const p = pendingAssetParams;
    const hasAnyViewParam = Boolean(
      p.assetMode ||
        p.assetCategory ||
        p.assetOffice ||
        p.assetAssignee ||
        p.assetLens ||
        p.assetAlert ||
        p.assetQ !== undefined ||
        p.assetShowRetired !== undefined ||
        p.assetSort
    );
    if (!hasAnyViewParam) {
      setPendingAssetParams(null);
      return;
    }

    sharedSortOverrideRef.current = true;
    setSortConfig(parseAssetSortStr(p.assetSort));

    const targetMode: MainMode = p.assetMode || mainMode;
    if (p.assetMode) {
      setMainMode(p.assetMode);
    }
    setSubLens(p.assetLens || 'all');
    setAlertFilter(p.assetAlert || 'none');
    setSearchQuery(p.assetQ ?? '');
    setShowRetired(Boolean(p.assetShowRetired));
    setAssigneeFilter(targetMode === 'catalog' && p.assetAssignee === '__shared__' ? 'all' : (p.assetAssignee || 'all'));

    if (categories.length === 0 && (p.assetCategory || targetMode === 'catalog')) {
      return;
    }

    if (p.assetCategory && p.assetCategory !== 'all') {
      const rawCat = p.assetCategory.trim();
      const matchedCat = categories.find(
        (c) =>
          String(c.id) === rawCat ||
          c.name.trim().toLowerCase() === rawCat.toLowerCase()
      );
      setSelectedCategoryId(matchedCat ? matchedCat.id : rawCat);
    } else if (targetMode === 'catalog') {
      setSelectedCategoryId(categories[0]?.id || 'all');
    } else {
      setSelectedCategoryId('all');
    }

    if (p.assetOffice && p.assetOffice !== 'all') {
      if (offices.length === 0) return;
      const resolvedOff = resolveOffice(p.assetOffice, offices);
      setSelectedOfficeFilter(resolvedOff ? String(resolvedOff.id) : p.assetOffice);
    } else {
      setSelectedOfficeFilter('all');
    }

    setPendingAssetParams(null);
  }, [pendingAssetParams, categories, offices, mainMode]);

  // Deep link handler (?tab=assets&assetId=...)
  useEffect(() => {
    if (!initialAssetId || assets.length === 0) return;
    const found = assets.find((a) => String(a.id) === String(initialAssetId));
    if (found) {
      setDetailInitialSubTab(initialAssetParams?.assetSubTab || 'details');
      setEditingAsset(found);
      setDetailModalOpen(true);
      onClearInitialAssetId?.();
    }
  }, [initialAssetId, assets, initialAssetParams?.assetSubTab, onClearInitialAssetId]);

  // Switch to first category automatically when entering catalog mode with 'all' selected
  const handleChangeMainMode = (mode: MainMode) => {
    sharedSortOverrideRef.current = false;
    setMainMode(mode);
    setAlertFilter('none');
    if (mode !== 'catalog') {
      setSelectedOfficeFilter('all');
    } else if (assigneeFilter === '__shared__') {
      setAssigneeFilter('all');
    }
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

  // Pre-compute alerts per asset (SSOT: scheduled inspections + static dates)
  const assetAlertsMap = useMemo(() => {
    const map = new Map<string, AssetAlertInfo[]>();
    for (const a of assets) {
      const cat = categoryMap.get(a.categoryId);
      map.set(a.id, computeAssetAlerts(a, cat, todayStr, logs));
    }
    return map;
  }, [assets, categoryMap, todayStr, logs]);

  // Scheduled inspections due today or overdue waiting for execution confirmation
  const dueConfirmationAssets = useMemo(() => {
    return assets.filter((a) => {
      if (a.status === 'retired') return false;
      const sched = getActiveScheduledInspection(a, logs, todayStr);
      return Boolean(sched && sched.isDueOrOverdue);
    });
  }, [assets, logs, todayStr]);

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
      totalActive: assets.filter((a) => a.status !== 'retired' && !a.isShared).length,
      myCount,
      sharedCount,
      overdueCount,
      inspection1mCount,
      replacement6mCount,
      dueConfirmationCount: dueConfirmationAssets.length
    };
  }, [assets, assetAlertsMap, currentUser.id, dueConfirmationAssets.length]);

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
      } else if (mainMode === 'catalog') {
        if (a.isShared) return false;
      } else if (mainMode === 'shared') {
        if (!a.isShared) return false;
      }

      if (selectedCategoryId !== 'all' && a.categoryId !== selectedCategoryId) {
        return false;
      }

      if (mainMode === 'catalog' && selectedOfficeFilter !== 'all') {
        const assetOffice = a.officeId || a.office || '';
        if (!isSameOffice(assetOffice, selectedOfficeFilter, offices)) {
          return false;
        }
      }

      if (mainMode === 'catalog' && assigneeFilter !== 'all') {
        if (assigneeFilter === '__unassigned__') {
          if (a.isShared || a.assigneeUserId) return false;
        } else if (assigneeFilter !== '__shared__' && String(a.assigneeUserId) !== String(assigneeFilter)) {
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
        const hasScheduled = Boolean(getActiveScheduledInspection(a, logs, todayStr));
        const hasOtherInspectionDate = Boolean(a.attributes?.shakenExpiryDate);
        if (!hasScheduled && !hasOtherInspectionDate) return false;
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

    // Explicit column sort takes priority over SubLens default sort
    if (sortConfig) {
      const { key, dir } = sortConfig;
      const activeFieldDef = activeCategory?.fields?.find((f) => f.key === key);

      const getSortValue = (asset: AssetItem): { empty: boolean; kind: 'num' | 'date' | 'text'; value: any } => {
        if (key === '__name') {
          const s = String(asset.name || asset.assetCode || '').trim();
          return { empty: !s, kind: 'text', value: s };
        }
        if (key === '__category') {
          const s = categoryMap.get(asset.categoryId)?.name || '';
          return { empty: !s, kind: 'text', value: s };
        }
        if (key === '__assignee') {
          const s = asset.isShared
            ? '共用（限定なし）'
            : (asset.assigneeUserId ? userMap.get(String(asset.assigneeUserId))?.name : undefined) ||
              asset.assigneeUserName ||
              '';
          return { empty: !s, kind: 'text', value: s };
        }
        if (key === '__office') {
          const s = asset.officeId
            ? resolveOfficeName(asset.officeId, offices) || asset.office || ''
            : asset.office || '';
          return { empty: !s, kind: 'text', value: s };
        }
        if (key === '__alert') {
          const minDays = (assetAlertsMap.get(asset.id) || [])[0]?.daysRemaining;
          return minDays === undefined
            ? { empty: true, kind: 'num', value: 0 }
            : { empty: false, kind: 'num', value: minDays };
        }
        if (key === '__summary') {
          const s = String(
            asset.attributes?.vehicleModel ||
              asset.attributes?.makerModel ||
              asset.attributes?.equipmentType ||
              asset.attributes?.toolType ||
              asset.assetCode ||
              ''
          ).trim();
          return { empty: !s, kind: 'text', value: s };
        }
        if (key === '__nextDate') {
          const sched = getActiveScheduledInspection(asset, logs, todayStr);
          const d = sched?.eventDate || asset.attributes?.shakenExpiryDate || '';
          return { empty: !d, kind: 'date', value: String(d) };
        }
        if (key === '__leaseDate') {
          const d = asset.attributes?.leaseEndDate || '';
          return { empty: !d, kind: 'date', value: String(d) };
        }
        if (key === '__notes') {
          const s = String(asset.notes || '').trim();
          return { empty: !s, kind: 'text', value: s };
        }
        if (key === '__attachments') {
          return { empty: false, kind: 'num', value: asset.attachments?.length || 0 };
        }

        if (LAST_INSPECTION_FIELD_KEYS.has(key)) {
          const derived = getDerivedLastInspectionDate(asset, logs);
          return { empty: !derived, kind: 'date', value: derived };
        }
        if (INSPECTION_SCHEDULE_FIELD_KEYS.has(key)) {
          const sched = getActiveScheduledInspection(asset, logs, todayStr);
          const d = sched?.eventDate || '';
          return { empty: !d, kind: 'date', value: d };
        }
        if (key === 'mileage') {
          const mi = getEffectiveAssetMileage(asset);
          return mi.value === null
            ? { empty: true, kind: 'num', value: 0 }
            : { empty: false, kind: 'num', value: mi.value };
        }

        const raw = asset.attributes?.[key];
        if (raw === undefined || raw === null || raw === '') {
          return { empty: true, kind: 'text', value: '' };
        }
        if (activeFieldDef?.type === 'number') {
          const n = Number(raw);
          return Number.isNaN(n)
            ? { empty: true, kind: 'num', value: 0 }
            : { empty: false, kind: 'num', value: n };
        }
        if (activeFieldDef?.type === 'checkbox') {
          return { empty: false, kind: 'num', value: raw ? 1 : 0 };
        }
        if (activeFieldDef?.type === 'date') {
          const s = String(raw).trim();
          return { empty: !s, kind: 'date', value: s };
        }
        const s = String(raw).trim();
        return { empty: !s, kind: 'text', value: s };
      };

      list = [...list].sort((a, b) => {
        const va = getSortValue(a);
        const vb = getSortValue(b);
        if (va.empty && vb.empty) return 0;
        if (va.empty) return 1; // Always push blanks to bottom
        if (vb.empty) return -1;

        let cmp = 0;
        if (va.kind === 'num') {
          cmp = (va.value as number) - (vb.value as number);
        } else if (va.kind === 'date') {
          cmp = String(va.value).localeCompare(String(vb.value));
        } else {
          cmp = String(va.value).localeCompare(String(vb.value), 'ja', {
            numeric: true,
            sensitivity: 'base'
          });
        }
        if (cmp !== 0) {
          return dir === 'asc' ? cmp : -cmp;
        }
        return String(a.name || '').localeCompare(String(b.name || ''), 'ja', { numeric: true });
      });
    } else if (subLens === 'inspection_due') {
      list = [...list].sort((a, b) => {
        const da =
          getActiveScheduledInspection(a, logs, todayStr)?.eventDate ||
          a.attributes?.shakenExpiryDate ||
          '9999-99-99';
        const db =
          getActiveScheduledInspection(b, logs, todayStr)?.eventDate ||
          b.attributes?.shakenExpiryDate ||
          '9999-99-99';
        return String(da).localeCompare(String(db));
      });
    } else if (subLens === 'last_inspection') {
      list = [...list].sort((a, b) => {
        const da = getDerivedLastInspectionDate(a, logs) || '0000-00-00';
        const db = getDerivedLastInspectionDate(b, logs) || '0000-00-00';
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
    assetAlertsMap,
    sortConfig,
    activeCategory,
    categoryMap,
    userMap,
    logs,
    todayStr
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
    await refreshAssetsAndLogs();
    return saved;
  };

  const handleSaveAssetInline = async (asset: AssetItem, patch: Partial<AssetItem>) => {
    await handleSaveAsset({
      ...asset,
      ...patch,
      id: asset.id
    });
  };

  const handleCreateScheduledInspection = async (params: {
    assetId: string;
    eventDate: string;
    inspectionType?: string;
    vendor?: string;
    memo?: string;
  }) => {
    const res = await fetch(
      `${API_BASE_URL}/assets/${encodeURIComponent(params.assetId)}/logs`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          actionType: 'inspection',
          eventDate: params.eventDate,
          summary: `${params.inspectionType || '定期点検'} 予定`,
          actorId: currentUser.id,
          actorName: currentUser.name,
          detail: {
            inspectionStatus: 'scheduled',
            inspectionType: params.inspectionType || '定期点検',
            vendor: params.vendor || undefined,
            memo: params.memo || undefined
          }
        })
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '点検予定の登録に失敗しました');
    }
    await refreshAssetsAndLogs();
  };

  const handleCancelScheduledInspection = async (assetId: string, logId?: string) => {
    if (logId) {
      const targetLog = logs.find((l) => String(l.id) === String(logId));
      const res = await fetch(
        `${API_BASE_URL}/assets/logs/${encodeURIComponent(logId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actorId: currentUser.id,
            actorName: currentUser.name,
            summary: `${targetLog?.detail?.inspectionType || '点検'}予定を取り消しました`,
            detail: {
              ...(targetLog?.detail || {}),
              inspectionStatus: 'cancelled',
              cancellationReason: '予定取消'
            }
          })
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '点検予定の取消に失敗しました');
      }
      await refreshAssetsAndLogs();
      return;
    }

    const res = await fetch(
      `${API_BASE_URL}/assets/${encodeURIComponent(assetId)}/scheduled-inspection`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          eventDate: '',
          actorId: currentUser.id,
          actorName: currentUser.name
        })
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '点検予定の取消に失敗しました');
    }
    await refreshAssetsAndLogs();
  };

  const handleSaveScheduledInspection = async (params: {
    assetId: string;
    logId?: string;
    eventDate: string;
    inspectionType?: string;
    vendor?: string;
    memo?: string;
  }) => {
    if (params.logId) {
      if (!params.eventDate || !params.eventDate.trim()) {
        await handleCancelScheduledInspection(params.assetId, params.logId);
        return;
      }
      const targetLog = logs.find((l) => String(l.id) === String(params.logId));
      const nextType =
        params.inspectionType !== undefined
          ? params.inspectionType.trim()
          : targetLog?.detail?.inspectionType || '定期点検';
      const nextVendor =
        params.vendor !== undefined
          ? params.vendor.trim()
          : targetLog?.detail?.vendor;
      const nextMemo =
        params.memo !== undefined
          ? params.memo.trim()
          : targetLog?.detail?.memo;

      const res = await fetch(
        `${API_BASE_URL}/assets/logs/${encodeURIComponent(params.logId)}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            eventDate: params.eventDate.trim(),
            actorId: currentUser.id,
            actorName: currentUser.name,
            summary: `${nextType || '定期点検'} 予定`,
            detail: {
              ...(targetLog?.detail || {}),
              inspectionStatus: 'scheduled',
              inspectionType: nextType || undefined,
              vendor: nextVendor || undefined,
              memo: nextMemo || undefined
            }
          })
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '点検予定の更新に失敗しました');
      }
      await refreshAssetsAndLogs();
      return;
    }

    const res = await fetch(
      `${API_BASE_URL}/assets/${encodeURIComponent(params.assetId)}/scheduled-inspection`,
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...params,
          actorId: currentUser.id,
          actorName: currentUser.name
        })
      }
    );
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || '点検予定の保存に失敗しました');
    }
    await refreshAssetsAndLogs();
  };

  const handleConfirmInspection = async (payload: ConfirmInspectionPayload) => {
    if (payload.directMode) {
      const res = await fetch(
        `${API_BASE_URL}/assets/${encodeURIComponent(payload.assetId)}/logs`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            actionType: 'inspection',
            eventDate: payload.actualDate,
            summary: `${payload.inspectionType || '定期点検'} 実施確定`,
            actorId: currentUser.id,
            actorName: currentUser.name,
            detail: {
              inspectionStatus: 'completed',
              inspectionType: payload.inspectionType || '定期点検',
              vendor: payload.vendor || undefined,
              cost: payload.cost,
              mileage: payload.mileage,
              checklistResults: payload.checklistResults,
              memo: payload.memo || undefined,
              confirmedAt: new Date().toISOString(),
              confirmedById: currentUser.id,
              confirmedByName: currentUser.name
            }
          })
        }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || '点検実績の保存に失敗しました');
      }
      if (payload.nextScheduledDate) {
        await fetch(
          `${API_BASE_URL}/assets/${encodeURIComponent(payload.assetId)}/logs`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              actionType: 'inspection',
              eventDate: payload.nextScheduledDate,
              summary: `${payload.nextInspectionType || '次回点検'} 予定`,
              actorId: currentUser.id,
              actorName: currentUser.name,
              detail: {
                inspectionStatus: 'scheduled',
                inspectionType: payload.nextInspectionType || '定期点検',
                vendor: payload.vendor || undefined
              }
            })
          }
        );
      }
      await refreshAssetsAndLogs();
      return;
    }

    const res = await fetch(
      `${API_BASE_URL}/assets/${encodeURIComponent(payload.assetId)}/inspections/confirm`,
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
      throw new Error(err.error || '点検実施の確定保存に失敗しました');
    }
    await refreshAssetsAndLogs();
  };

  const handleDeleteAsset = async (assetId: string) => {
    const res = await fetch(`${API_BASE_URL}/assets/${encodeURIComponent(assetId)}`, {
      method: 'DELETE'
    });
    if (!res.ok) throw new Error('資産の削除に失敗しました');
    setAssets((prev) => prev.filter((a) => a.id !== assetId));
    setLogs((prev) => prev.filter((l) => l.assetId !== assetId));
    window.dispatchEvent(new CustomEvent('teranago:assets-updated'));
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
    window.dispatchEvent(new CustomEvent('teranago:assets-updated'));
  };

  const handleDeleteLog = async (_assetId: string, logId: string) => {
    const res = await fetch(
      `${API_BASE_URL}/assets/logs/${encodeURIComponent(logId)}`,
      { method: 'DELETE' }
    );
    if (!res.ok) return;
    setLogs((prev) => prev.filter((l) => l.id !== logId));
    await refreshAssetsAndLogs();
  };

  const handleExportCsv = () => {
    exportAssetsToCsv({
      assets: displayedAssets,
      categories,
      users: allUsers,
      offices,
      divisions,
      logs,
      selectedCategory: activeCategory
    });
  };

  const openCreateModal = () => {
    setDetailInitialSubTab('details');
    setEditingAsset(null);
    setDetailModalOpen(true);
  };

  const openEditModal = (
    asset: AssetItem,
    subTab: 'details' | 'inspections' | 'history' = 'details'
  ) => {
    setDetailInitialSubTab(subTab);
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

  const commitInlineFieldValue = async (
    asset: AssetItem,
    field: AssetFieldDefinition,
    nextRaw: any
  ) => {
    setInlineEditCell(null);
    setInlineSavingId(asset.id);
    try {
      if (INSPECTION_SCHEDULE_FIELD_KEYS.has(field.key)) {
        const scheduled = getActiveScheduledInspection(asset, logs, todayStr);
        const nextDate = String(nextRaw || '').trim();
        if ((scheduled?.eventDate || '') === nextDate) return;
        await handleSaveScheduledInspection({
          assetId: asset.id,
          logId: scheduled?.logId,
          eventDate: nextDate,
          inspectionType: scheduled?.inspectionType || asset.attributes?.inspectionType,
          vendor:
            scheduled?.vendor ||
            asset.attributes?.inspectionVendor ||
            asset.attributes?.maintenanceVendor
        });
        return;
      }

      if (LAST_INSPECTION_FIELD_KEYS.has(field.key) || MILEAGE_FIELD_KEYS.has(field.key)) {
        return;
      }

      const nextVal =
        field.type === 'number'
          ? String(nextRaw ?? '').trim() === ''
            ? ''
            : Number(String(nextRaw).replace(/,/g, ''))
          : nextRaw;
      if ((asset.attributes?.[field.key] ?? '') === nextVal) return;

      await handleSaveAssetInline(asset, {
        attributes: {
          ...(asset.attributes || {}),
          [field.key]: nextVal
        }
      });
    } finally {
      setInlineSavingId(null);
    }
  };

  const renderFieldCell = (asset: AssetItem, field: AssetFieldDefinition) => {
    // 1) 最終点検日系は「確定済み点検履歴」から自動算出。0件時は必ず完全空白（'-' 禁止）
    if (LAST_INSPECTION_FIELD_KEYS.has(field.key)) {
      const derivedLast = getDerivedLastInspectionDate(asset, logs);
      if (!derivedLast) return null;
      return (
        <span className="whitespace-nowrap text-xs font-medium text-slate-800 tabular-nums">
          {formatAssetDateJa(derivedLast)}
        </span>
      );
    }

    // 2) 走行距離は「運転記録簿」の最新記録から自動取得。未記録時は必ず完全空白（'-' 禁止）
    if (MILEAGE_FIELD_KEYS.has(field.key)) {
      const mileageInfo = getEffectiveAssetMileage(asset);
      if (mileageInfo.value === null) return null;
      return (
        <span
          className="whitespace-nowrap text-xs text-slate-800 font-medium inline-flex items-center gap-1 tabular-nums"
          title={
            mileageInfo.date
              ? `運転記録簿（${mileageInfo.date}時点）から自動取得`
              : '運転記録簿から自動取得'
          }
        >
          <span>
            {Number(mileageInfo.value).toLocaleString()}
            {field.unit ? ` ${field.unit}` : ''}
          </span>
          <Gauge className="w-3 h-3 text-sky-700 shrink-0" />
        </span>
      );
    }

    const scheduled = INSPECTION_SCHEDULE_FIELD_KEYS.has(field.key)
      ? getActiveScheduledInspection(asset, logs, todayStr)
      : null;

    const val = scheduled
      ? scheduled.eventDate
      : asset.attributes?.[field.key];

    const canInlineEdit = Boolean(field.inlineEditable);
    const isEditingThis =
      inlineEditCell?.assetId === asset.id && inlineEditCell.colKey === field.key;

    if (canInlineEdit && isEditingThis) {
      if (field.type === 'select') {
        return (
          <select
            autoFocus
            value={inlineDraftVal}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => commitInlineFieldValue(asset, field, e.target.value)}
            onBlur={() => setInlineEditCell(null)}
            className="w-full max-w-[160px] px-1.5 py-0.5 text-xs bg-white border border-indigo-400 rounded focus:outline-none"
          >
            <option value="">-- 未選択 --</option>
            {(field.options || []).map((opt) => (
              <option key={opt} value={opt}>
                {opt}
              </option>
            ))}
          </select>
        );
      }

      if (field.type === 'date') {
        return (
          <input
            type="date"
            autoFocus
            value={inlineDraftVal}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setInlineDraftVal(e.target.value)}
            onBlur={() => commitInlineFieldValue(asset, field, inlineDraftVal)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitInlineFieldValue(asset, field, inlineDraftVal);
              if (e.key === 'Escape') setInlineEditCell(null);
            }}
            className="px-1.5 py-0.5 text-xs bg-white border border-indigo-400 rounded tabular-nums focus:outline-none"
          />
        );
      }

      if (field.type === 'number') {
        return (
          <input
            type="number"
            autoFocus
            value={inlineDraftVal}
            onClick={(e) => e.stopPropagation()}
            onChange={(e) => setInlineDraftVal(e.target.value)}
            onBlur={() => commitInlineFieldValue(asset, field, inlineDraftVal)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') commitInlineFieldValue(asset, field, inlineDraftVal);
              if (e.key === 'Escape') setInlineEditCell(null);
            }}
            className="w-24 px-1.5 py-0.5 text-xs bg-white border border-indigo-400 rounded tabular-nums focus:outline-none"
          />
        );
      }

      return (
        <input
          type="text"
          autoFocus
          value={inlineDraftVal}
          onClick={(e) => e.stopPropagation()}
          onChange={(e) => setInlineDraftVal(e.target.value)}
          onBlur={() => commitInlineFieldValue(asset, field, inlineDraftVal)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') commitInlineFieldValue(asset, field, inlineDraftVal);
            if (e.key === 'Escape') setInlineEditCell(null);
          }}
          className="w-full min-w-[110px] px-1.5 py-0.5 text-xs bg-white border border-indigo-400 rounded focus:outline-none"
        />
      );
    }

    const triggerInlineEdit = (e: React.MouseEvent) => {
      if (!canInlineEdit) return;
      e.stopPropagation();
      if (field.type === 'checkbox') {
        commitInlineFieldValue(asset, field, !val);
        return;
      }
      setInlineEditCell({ assetId: asset.id, colKey: field.key });
      setInlineDraftVal(val !== undefined && val !== null ? String(val) : '');
    };

    const wrapInline = (node: React.ReactNode) =>
      canInlineEdit ? (
        <div
          onClick={triggerInlineEdit}
          title="クリックして表のまま直接編集"
          className="cursor-pointer rounded px-1 -mx-1 py-0.5 hover:bg-indigo-100/60 transition-colors min-h-[22px] flex items-center"
        >
          {node}
        </div>
      ) : (
        node
      );

    if (val === undefined || val === null || val === '') {
      return wrapInline(
        <span className={canInlineEdit ? 'text-slate-300 hover:text-indigo-500 text-[11px]' : 'text-slate-300'}>
          {canInlineEdit ? '入力...' : '-'}
        </span>
      );
    }
    if (field.type === 'select') {
      return wrapInline(
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
      return wrapInline(
        <span
          className={`whitespace-nowrap text-xs tabular-nums ${
            scheduled?.isDueOrOverdue || fieldAlert?.severity === 'overdue'
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
      return wrapInline(
        val ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-700 font-semibold whitespace-nowrap">
            <Check className="w-3.5 h-3.5" />
            対象
          </span>
        ) : (
          <span className="text-slate-400 text-xs">-</span>
        )
      );
    }
    if (field.type === 'number') {
      return wrapInline(
        <span className="whitespace-nowrap text-xs text-slate-700 font-medium inline-flex items-center gap-1 tabular-nums">
          <span>
            {Number(val).toLocaleString()}
            {field.unit ? ` ${field.unit}` : ''}
          </span>
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
    return wrapInline(
      <span className="text-xs text-slate-700 truncate block" title={String(val)}>
        {String(val)}
      </span>
    );
  };

  // Column sorting & resizing handlers
  const isRememberSortChecked = Boolean(
    assetViewSettings?.rememberSortByCategory?.[categorySettingKey]
  );
  const currentCategoryWidths = columnWidthsByCategory[categorySettingKey] || {};

  const getColumnLabelForKey = (colKey: string): string => {
    switch (colKey) {
      case '__name':
        return activeCategory?.id === 'cat-vehicle' ? '登録番号' : '管理番号 / 資産名';
      case '__category':
        return '種類';
      case '__assignee':
        return '使用者';
      case '__office':
        return '拠点';
      case '__alert':
        return '警告';
      case '__summary':
        return '車種・型番 / 主要情報';
      case '__nextDate':
        return '点検予定 / 期限';
      case '__leaseDate':
        return 'リース満了';
      case '__notes':
        return '備考';
      case '__attachments':
        return '資料';
      default:
        return listColumns.find((c) => c.key === colKey)?.label || colKey;
    }
  };

  const handleToggleColumnSort = (colKey: string) => {
    if (justResizedRef.current) return;
    let nextSort: AssetSortConfig | null;
    if (sortConfig?.key !== colKey) {
      nextSort = { key: colKey, dir: 'asc' };
    } else if (sortConfig.dir === 'asc') {
      nextSort = { key: colKey, dir: 'desc' };
    } else {
      nextSort = null;
    }
    setSortConfig(nextSort);
    if (isRememberSortChecked) {
      sharedSortOverrideRef.current = false;
      persistAssetViewSettings((prev) => {
        const nextSorts = { ...(prev.sortsByCategory || {}) };
        if (nextSort) {
          nextSorts[categorySettingKey] = nextSort;
        } else {
          delete nextSorts[categorySettingKey];
        }
        return {
          ...prev,
          sortsByCategory: nextSorts
        };
      });
    }
  };

  const handleToggleRememberSort = (checked: boolean) => {
    sharedSortOverrideRef.current = false;
    persistAssetViewSettings((prev) => {
      const nextRemember = {
        ...(prev.rememberSortByCategory || {}),
        [categorySettingKey]: checked
      };
      const nextSorts = { ...(prev.sortsByCategory || {}) };
      if (checked) {
        if (sortConfig) {
          nextSorts[categorySettingKey] = sortConfig;
        } else {
          delete nextSorts[categorySettingKey];
        }
      } else {
        delete nextSorts[categorySettingKey];
      }
      return {
        ...prev,
        rememberSortByCategory: nextRemember,
        sortsByCategory: nextSorts
      };
    });
  };

  const handleResetViewSettings = () => {
    sharedSortOverrideRef.current = false;
    setSortConfig(null);
    setColumnWidthsByCategory((prev) => {
      const next = { ...prev };
      delete next[categorySettingKey];
      return next;
    });
    persistAssetViewSettings((prev) => {
      const nextSorts = { ...(prev.sortsByCategory || {}) };
      delete nextSorts[categorySettingKey];
      const nextWidths = { ...(prev.columnWidths || {}) };
      delete nextWidths[categorySettingKey];
      return {
        ...prev,
        sortsByCategory: nextSorts,
        columnWidths: nextWidths
      };
    });
    setFavoritesFeedback('この資産種類の並び替え・列幅を初期化しました');
    setTimeout(() => setFavoritesFeedback(null), 2500);
  };

  const startColumnResize = (e: React.MouseEvent<HTMLDivElement>, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    const thEl = e.currentTarget.parentElement;
    const startWidth = thEl ? Math.round(thEl.getBoundingClientRect().width) : 140;
    const startX = e.clientX;
    isResizingRef.current = true;

    const handleMouseMove = (moveEvt: MouseEvent) => {
      const delta = moveEvt.clientX - startX;
      const clampedWidth = Math.max(64, Math.min(640, startWidth + delta));
      setColumnWidthsByCategory((prev) => ({
        ...prev,
        [categorySettingKey]: {
          ...(prev[categorySettingKey] || {}),
          [colKey]: clampedWidth
        }
      }));
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      isResizingRef.current = false;
      justResizedRef.current = true;
      setTimeout(() => {
        justResizedRef.current = false;
      }, 100);
      const latestWidths = columnWidthsRef.current;
      persistAssetViewSettings((prev) => ({
        ...prev,
        columnWidths: latestWidths
      }));
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  const resetSingleColumnWidth = (e: React.MouseEvent<HTMLDivElement>, colKey: string) => {
    e.preventDefault();
    e.stopPropagation();
    setColumnWidthsByCategory((prev) => {
      const catWidths = { ...(prev[categorySettingKey] || {}) };
      delete catWidths[colKey];
      const next = { ...prev, [categorySettingKey]: catWidths };
      if (Object.keys(catWidths).length === 0) {
        delete next[categorySettingKey];
      }
      persistAssetViewSettings((p) => ({
        ...p,
        columnWidths: next
      }));
      return next;
    });
  };

  const getColStyle = (colKey: string, defaultStyle?: React.CSSProperties): React.CSSProperties | undefined => {
    const w = currentCategoryWidths[colKey];
    if (w) {
      return { width: `${w}px`, minWidth: `${w}px`, maxWidth: `${w}px` };
    }
    return defaultStyle;
  };

  const renderSortableHeader = (
    colKey: string,
    label: string,
    extraClassName = '',
    alignCenter = false,
    defaultStyle?: React.CSSProperties
  ) => {
    const isSorted = sortConfig?.key === colKey;
    const isSticky = extraClassName.includes('sticky');
    const colStyle = getColStyle(colKey, defaultStyle);
    return (
      <th
        key={colKey}
        style={colStyle}
        onClick={() => handleToggleColumnSort(colKey)}
        className={`${isSticky ? '' : 'relative'} group/th select-none py-2.5 px-3 border-r border-slate-200/80 whitespace-nowrap cursor-pointer transition-colors hover:bg-slate-100/90 ${
          isSorted ? 'bg-indigo-50/70 text-indigo-800' : ''
        } ${extraClassName}`}
        title={`${label}で並べ替え（クリック: 昇順→降順→解除 / 右端ドラッグ: 幅変更）`}
      >
        <div className={`flex items-center gap-1 pr-1.5 ${alignCenter ? 'justify-center' : 'justify-between'}`}>
          <span className="truncate">{label}</span>
          <span className="shrink-0 inline-flex items-center">
            {isSorted && sortConfig?.dir === 'asc' ? (
              <ArrowUp className="w-3 h-3 text-indigo-600" />
            ) : isSorted && sortConfig?.dir === 'desc' ? (
              <ArrowDown className="w-3 h-3 text-indigo-600" />
            ) : (
              <ArrowUpDown className="w-3 h-3 text-slate-300 opacity-0 group-hover/th:opacity-100 transition-opacity" />
            )}
          </span>
        </div>
        <div
          role="separator"
          aria-orientation="vertical"
          onMouseDown={(e) => startColumnResize(e, colKey)}
          onDoubleClick={(e) => resetSingleColumnWidth(e, colKey)}
          onClick={(e) => e.stopPropagation()}
          title="左右にドラッグで枠の横幅を変更（ダブルクリックで幅リセット）"
          className="absolute top-0 right-0 h-full w-2 cursor-col-resize z-30 flex items-center justify-end group/resize"
        >
          <span className="w-0.5 h-4 rounded-full bg-transparent group-hover/th:bg-slate-300 group-hover/resize:bg-indigo-500 group-hover/resize:h-full transition-all" />
        </div>
      </th>
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
    <div className="flex-1 min-w-0 w-full space-y-5">
      {/* Header & Main Mode Switcher */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-4 min-w-0 w-full">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-xl font-extrabold text-slate-900 flex items-center gap-2">
              <Layers className="w-6 h-6 text-indigo-600" />
              <span>資産管理</span>
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
              onClick={async () => {
                const shareParams: AppQueryParams = {
                  tab: 'assets',
                  assetMode: mainMode,
                };
                if (mainMode !== 'calendar') {
                  if (selectedCategoryId && selectedCategoryId !== 'all') {
                    shareParams.assetCategory = selectedCategoryId;
                  }
                  if (mainMode === 'catalog' && selectedOfficeFilter !== 'all') {
                    shareParams.assetOffice = selectedOfficeFilter;
                  }
                  if (mainMode === 'catalog' && assigneeFilter !== 'all') {
                    shareParams.assetAssignee = assigneeFilter;
                  }
                  if (subLens !== 'all') {
                    shareParams.assetLens = subLens;
                  }
                  if (alertFilter !== 'none') {
                    shareParams.assetAlert = alertFilter;
                  }
                  if (searchQuery.trim()) {
                    shareParams.assetQ = searchQuery.trim();
                  }
                  if (showRetired) {
                    shareParams.assetShowRetired = true;
                  }
                  if (sortConfig) {
                    shareParams.assetSort = `${sortConfig.key}:${sortConfig.dir}`;
                  }
                }

                const url = buildAppUrl(shareParams);
                const ok = await copyTextToClipboard(url);
                if (ok) {
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2500);
                }

                if (currentUser && onUpdateUser) {
                  const modeLabels: Record<MainMode, string> = {
                    my: '自分の資産',
                    catalog: '資産台帳',
                    shared: '共用資産',
                    inspections: '点検一覧',
                    calendar: '資産カレンダー',
                  };
                  const catLabel =
                    mainMode !== 'calendar' && mainMode !== 'inspections' && activeCategory
                      ? activeCategory.name
                      : mainMode !== 'calendar' && mainMode !== 'inspections'
                        ? 'すべて'
                        : '';
                  const title = catLabel
                    ? `${modeLabels[mainMode]}：${catLabel}`
                    : modeLabels[mainMode];

                  const subtitleParts: string[] = [];
                  if (mainMode === 'catalog' && selectedOfficeFilter !== 'all') {
                    const offName = resolveOfficeName(selectedOfficeFilter, offices);
                    if (offName) subtitleParts.push(offName);
                  }
                  if (mainMode === 'catalog' && assigneeFilter !== 'all') {
                    if (assigneeFilter === '__shared__') subtitleParts.push('共用');
                    else if (assigneeFilter === '__unassigned__') subtitleParts.push('未割当');
                    else {
                      const u = userMap.get(String(assigneeFilter));
                      if (u?.name) subtitleParts.push(u.name);
                    }
                  }
                  const lensLabels: Record<SubLens, string> = {
                    all: '',
                    inspection_due: '点検予定',
                    last_inspection: '前回点検日',
                    attachments: '資料添付',
                    lease_alert: 'リース・アラート',
                  };
                  if (mainMode !== 'calendar' && subLens !== 'all' && lensLabels[subLens]) {
                    subtitleParts.push(lensLabels[subLens]);
                  }
                  if (mainMode !== 'calendar' && alertFilter !== 'none') {
                    const alertLabels: Record<AlertFilterType, string> = {
                      none: '',
                      all_alerts: 'アラート対象',
                      overdue: '期限超過',
                      inspection_1m: '点検アラート',
                      replacement_6m: '入替アラート',
                    };
                    if (alertLabels[alertFilter]) subtitleParts.push(alertLabels[alertFilter]);
                  }
                  if (mainMode !== 'calendar' && searchQuery.trim()) {
                    subtitleParts.push(`検索: ${searchQuery.trim()}`);
                  }
                  if (mainMode !== 'calendar' && showRetired) {
                    subtitleParts.push('廃棄済含む');
                  }
                  if (mainMode !== 'calendar' && sortConfig) {
                    subtitleParts.push(
                      `並び: ${getColumnLabelForKey(sortConfig.key)}${sortConfig.dir === 'asc' ? '▲' : '▼'}`
                    );
                  }

                  const { updatedUser } = upsertBookmarkForUser(currentUser, {
                    category: 'assets',
                    title,
                    subtitle: subtitleParts.join(' ・ ') || undefined,
                    params: shareParams,
                  });
                  onUpdateUser(updatedUser);
                  setFavoritesFeedback('共有リンクをコピーし、お気に入りにストックしました');
                  setTimeout(() => setFavoritesFeedback(null), 3000);
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                copiedLink
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50 hover:text-indigo-600'
              }`}
              title="現在の表示URLをコピー（お気に入りにも自動ストック）"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>URLコピー完了!</span>
                </>
              ) : (
                <>
                  <Share2 className="w-3.5 h-3.5 text-slate-500" />
                  <span>共有リンク</span>
                </>
              )}
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
              onClick={() => handleChangeMainMode('inspections')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                mainMode === 'inspections'
                  ? 'bg-amber-600 text-white shadow-xs'
                  : summaryStats.dueConfirmationCount > 0
                  ? 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <ClipboardCheck className="w-3.5 h-3.5" />
              点検一覧
              {summaryStats.dueConfirmationCount > 0 && (
                <span
                  className={`px-1.5 py-0.2 rounded-full text-[10px] font-extrabold tabular-nums ${
                    mainMode === 'inspections'
                      ? 'bg-white text-amber-800'
                      : 'bg-rose-600 text-white'
                  }`}
                >
                  要確認 {summaryStats.dueConfirmationCount}
                </span>
              )}
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
          {mainMode !== 'calendar' && mainMode !== 'inspections' && (
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

      {/* Scheduled Inspections Due Confirmation Banner */}
      {dueConfirmationAssets.length > 0 && mainMode !== 'calendar' && (
        <div className="p-3.5 rounded-2xl bg-rose-50/90 border border-rose-200 flex flex-wrap items-center justify-between gap-3 shadow-2xs">
          <div className="flex items-center gap-2.5 min-w-0">
            <AlertOctagon className="w-5 h-5 text-rose-600 shrink-0" />
            <div className="text-xs text-rose-950">
              <span className="font-extrabold">
                点検予定日を過ぎた資産（実施確認待ち）が {dueConfirmationAssets.length}件 あります
              </span>
              <span className="text-rose-700 ml-2 hidden sm:inline">
                実施確認すると予定をクリアし、確定履歴・最終点検日へ反映します。
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {dueConfirmationAssets.slice(0, 3).map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setConfirmModalState({ asset: a })}
                className="px-2.5 py-1 rounded-lg text-[11px] font-bold bg-white border border-rose-300 text-rose-800 hover:bg-rose-600 hover:text-white transition-colors cursor-pointer whitespace-nowrap"
              >
                {a.name} を確認
              </button>
            ))}
            {mainMode !== 'inspections' && (
              <button
                type="button"
                onClick={() => handleChangeMainMode('inspections')}
                className="px-3 py-1 rounded-lg text-[11px] font-bold bg-rose-600 text-white hover:bg-rose-700 cursor-pointer whitespace-nowrap"
              >
                点検一覧で確認する
              </button>
            )}
          </div>
        </div>
      )}

      {error && (
        <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
          {error}
        </div>
      )}

      {/* Main Content */}
      {mainMode === 'inspections' ? (
        <AssetInspectionListView
          assets={assets}
          categories={categories}
          logs={logs}
          users={allUsers}
          offices={offices}
          currentUser={currentUser}
          onCreateScheduledInspection={handleCreateScheduledInspection}
          onSaveScheduledInspection={handleSaveScheduledInspection}
          onCancelScheduledInspection={handleCancelScheduledInspection}
          onDeleteTransactionLog={handleDeleteLog}
          onOpenConfirmModal={(asset, options) =>
            setConfirmModalState({
              asset,
              targetLog: options?.targetLog || null,
              directMode: Boolean(options?.directMode)
            })
          }
          onOpenDetailModal={(asset, subTab) => openEditModal(asset, subTab || 'inspections')}
        />
      ) : mainMode === 'calendar' ? (
        <AssetCalendarView
          assets={assets}
          categories={categories}
          logs={logs}
          offices={offices}
          onSelectAsset={openEditModal}
        />
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden min-w-0 w-full">
          {/* Category Pills Bar */}
          <div className="px-4 py-3 border-b border-slate-200 bg-slate-50/60 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              {(mainMode === 'my' || mainMode === 'shared') && (
                <button
                  type="button"
                  onClick={() => {
                    sharedSortOverrideRef.current = false;
                    setSelectedCategoryId('all');
                  }}
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
                    onClick={() => {
                      sharedSortOverrideRef.current = false;
                      setSelectedCategoryId(cat.id);
                    }}
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
                <>
                  <select
                    value={selectedOfficeFilter}
                    onChange={(e) => setSelectedOfficeFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
                  >
                    <option value="all">拠点: すべて</option>
                    {offices.map((off) => (
                      <option key={off.id} value={off.id}>
                        {off.name}
                      </option>
                    ))}
                  </select>

                  <select
                    value={assigneeFilter}
                    onChange={(e) => setAssigneeFilter(e.target.value)}
                    className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700"
                  >
                    <option value="all">使用者: すべて</option>
                    <option value="__unassigned__">未割当</option>
                    {allUsers.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </>
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

          {/* Notion-Style Sub-View Pills (ビューレンズ) + Remember Sort & Reset */}
          <div className="px-4 py-2.5 border-b border-slate-200 bg-white flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSubLens('all')}
                className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                  subLens === 'all'
                    ? 'bg-slate-200 text-slate-900 font-bold'
                    : 'text-slate-600 hover:bg-slate-100'
                }`}
              >
                すべて
              </button>

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

            <div className="flex items-center gap-2 ml-auto">
              <label
                className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-slate-600 cursor-pointer select-none whitespace-nowrap px-2 py-1 rounded-lg hover:bg-slate-50 border border-transparent hover:border-slate-200 transition-colors"
                title="ONにすると、この資産種類の並べ替え順を個人設定として保存します"
              >
                <input
                  type="checkbox"
                  checked={isRememberSortChecked}
                  onChange={(e) => handleToggleRememberSort(e.target.checked)}
                  className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                />
                <span>この並びを記憶する</span>
              </label>

              <button
                type="button"
                onClick={handleResetViewSettings}
                disabled={
                  !sortConfig &&
                  Object.keys(currentCategoryWidths).length === 0 &&
                  !assetViewSettings?.sortsByCategory?.[categorySettingKey]
                }
                className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-500 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 disabled:opacity-35 disabled:hover:bg-white disabled:hover:text-slate-500 disabled:hover:border-slate-200 transition-colors cursor-pointer disabled:cursor-default shrink-0"
                title="この種類の並べ替え・列幅を初期状態に戻す"
                aria-label="並べ替え・列幅をリセット"
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Notion-Style Spreadsheet Table */}
          <div className="w-full overflow-x-auto">
            <table className="w-full min-w-max text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/95 text-[11px] font-bold text-slate-500">
                  {renderSortableHeader(
                    '__name',
                    activeCategory?.id === 'cat-vehicle' ? '登録番号' : '管理番号 / 資産名',
                    'sticky left-0 z-20 bg-slate-50 shadow-[2px_0_5px_-2px_rgba(15,23,42,0.08)]',
                    false,
                    { minWidth: '170px', maxWidth: '230px' }
                  )}
                  {!activeCategory && renderSortableHeader('__category', '種類')}
                  {renderSortableHeader('__assignee', '使用者', '', false, { minWidth: '130px' })}
                  {renderSortableHeader('__office', '拠点')}
                  {renderSortableHeader('__alert', '警告', 'px-2.5')}

                  {activeCategory ? (
                    listColumns.map((col) =>
                      renderSortableHeader(col.key, col.label, '', false, { maxWidth: '200px' })
                    )
                  ) : (
                    <>
                      {renderSortableHeader('__summary', '車種・型番 / 主要情報')}
                      {renderSortableHeader('__nextDate', '点検予定 / 期限')}
                      {renderSortableHeader('__leaseDate', 'リース満了')}
                    </>
                  )}

                  {renderSortableHeader('__notes', '備考', '', false, { minWidth: '140px' })}
                  {renderSortableHeader('__attachments', '資料', 'px-2.5 text-center', true)}
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

                  const summaryText =
                    asset.attributes?.vehicleModel ||
                    asset.attributes?.makerModel ||
                    asset.attributes?.equipmentType ||
                    asset.attributes?.toolType ||
                    asset.assetCode ||
                    '-';
                  const scheduled = getActiveScheduledInspection(asset, logs, todayStr);
                  const nextDate = scheduled?.eventDate || asset.attributes?.shakenExpiryDate || '';
                  const leaseDate = asset.attributes?.leaseEndDate || '';

                  const canInlineAssignee = Boolean(!asset.isShared && activeCategory?.allowInlineAssignee);
                  const isEditingAssignee =
                    inlineEditCell?.assetId === asset.id && inlineEditCell.colKey === '__assignee';
                  const canInlineNotes = activeCategory ? activeCategory.allowInlineNotes !== false : true;
                  const isEditingNotes =
                    inlineEditCell?.assetId === asset.id && inlineEditCell.colKey === '__notes';

                  return (
                    <tr
                      key={asset.id}
                      onClick={() => openEditModal(asset)}
                      className={`group hover:bg-indigo-50/40 transition-colors cursor-pointer ${
                        asset.status === 'retired' ? 'opacity-50 bg-slate-50' : ''
                      } ${inlineSavingId === asset.id ? 'opacity-60' : ''}`}
                    >
                      {/* 登録番号 / 名称 + Hover 開く */}
                      <td
                        style={getColStyle('__name', { maxWidth: '230px' })}
                        className={`sticky left-0 z-10 py-2 px-3 border-r border-slate-200/70 shadow-[2px_0_5px_-2px_rgba(15,23,42,0.08)] transition-colors ${
                          asset.status === 'retired'
                            ? 'bg-slate-50 group-hover:bg-slate-100'
                            : 'bg-white group-hover:bg-indigo-50'
                        }`}
                      >
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
                        <td
                          style={getColStyle('__category')}
                          className="py-2 px-3 border-r border-slate-200/70 whitespace-nowrap overflow-hidden"
                        >
                          <span
                            className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border ${catTheme.badge}`}
                          >
                            <CatIcon className="w-3 h-3" />
                            {cat?.name || '資産'}
                          </span>
                        </td>
                      )}

                      {/* 使用者 */}
                      <td
                        style={getColStyle('__assignee')}
                        onClick={
                          canInlineAssignee && !isEditingAssignee
                            ? (e) => {
                                e.stopPropagation();
                                setInlineEditCell({ assetId: asset.id, colKey: '__assignee' });
                                setInlineDraftVal(asset.assigneeUserId ? String(asset.assigneeUserId) : '');
                              }
                            : undefined
                        }
                        title={canInlineAssignee ? 'クリックして使用者の直接変更' : undefined}
                        className={`py-2 px-3 border-r border-slate-200/70 whitespace-nowrap overflow-hidden ${
                          canInlineAssignee ? 'hover:bg-indigo-100/50' : ''
                        }`}
                      >
                        {isEditingAssignee ? (
                          <select
                            autoFocus
                            value={inlineDraftVal}
                            onClick={(e) => e.stopPropagation()}
                            onChange={async (e) => {
                              const nextUid = e.target.value;
                              setInlineEditCell(null);
                              const targetU = allUsers.find((u) => String(u.id) === String(nextUid));
                              setInlineSavingId(asset.id);
                              try {
                                await handleSaveAssetInline(asset, {
                                  assigneeUserId: nextUid || '',
                                  assigneeUserName: targetU?.name || ''
                                });
                              } finally {
                                setInlineSavingId(null);
                              }
                            }}
                            onBlur={() => setInlineEditCell(null)}
                            className="w-full px-1.5 py-0.5 text-xs bg-white border border-indigo-400 rounded focus:outline-none"
                          >
                            <option value="">未割当</option>
                            {allUsers.map((u) => (
                              <option key={u.id} value={u.id}>
                                {u.name}
                              </option>
                            ))}
                          </select>
                        ) : asset.isShared ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                            <Users className="w-3 h-3" />
                            共用（限定なし）
                          </span>
                        ) : assignee || asset.assigneeUserName ? (
                          <div className="flex items-center gap-1.5 min-w-0">
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
                            <span className="font-medium text-slate-800 truncate">
                              {assignee?.name || asset.assigneeUserName}
                            </span>
                          </div>
                        ) : (
                          <span className="text-slate-400">未割当</span>
                        )}
                      </td>

                      {/* 拠点 */}
                      <td
                        style={getColStyle('__office')}
                        className="py-2 px-3 border-r border-slate-200/70 whitespace-nowrap text-slate-600 overflow-hidden"
                      >
                        <span className="truncate block">{officeLabel || '-'}</span>
                      </td>

                      {/* 警告 */}
                      <td
                        style={getColStyle('__alert')}
                        className="py-2 px-2.5 border-r border-slate-200/70 whitespace-nowrap overflow-hidden"
                      >
                        {renderAlertIconCell(asset.id)}
                      </td>

                      {/* 動的列 or 混合サマリー列 */}
                      {activeCategory ? (
                        listColumns.map((col) => (
                          <td
                            key={col.key}
                            style={getColStyle(col.key, { maxWidth: '200px' })}
                            className="py-2 px-3 border-r border-slate-200/70 overflow-hidden"
                          >
                            {renderFieldCell(asset, col)}
                          </td>
                        ))
                      ) : (
                        <>
                          <td
                            style={getColStyle('__summary')}
                            className="py-2 px-3 border-r border-slate-200/70 text-slate-700 whitespace-nowrap overflow-hidden"
                          >
                            <span className="truncate block">{summaryText}</span>
                          </td>
                          <td
                            style={getColStyle('__nextDate')}
                            className="py-2 px-3 border-r border-slate-200/70 whitespace-nowrap overflow-hidden tabular-nums"
                          >
                            {nextDate ? (
                              <span className={scheduled?.isDueOrOverdue ? 'text-rose-700 font-bold' : 'text-slate-700'}>
                                {formatAssetDateJa(nextDate)}
                              </span>
                            ) : (
                              '-'
                            )}
                          </td>
                          <td
                            style={getColStyle('__leaseDate')}
                            className="py-2 px-3 border-r border-slate-200/70 whitespace-nowrap overflow-hidden"
                          >
                            {leaseDate ? formatAssetDateJa(leaseDate) : '-'}
                          </td>
                        </>
                      )}

                      {/* 備考 (種類別で直編集設定有効時にインライン編集) */}
                      <td
                        style={getColStyle('__notes', { maxWidth: '200px' })}
                        onClick={
                          canInlineNotes && !isEditingNotes
                            ? (e) => {
                                e.stopPropagation();
                                setInlineEditCell({ assetId: asset.id, colKey: '__notes' });
                                setInlineDraftVal(asset.notes || '');
                              }
                            : undefined
                        }
                        title={canInlineNotes ? 'クリックして備考を直接編集' : asset.notes}
                        className={`py-2 px-3 border-r border-slate-200/70 overflow-hidden ${
                          canInlineNotes ? 'hover:bg-indigo-100/50' : ''
                        }`}
                      >
                        {isEditingNotes ? (
                          <input
                            type="text"
                            autoFocus
                            value={inlineDraftVal}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => setInlineDraftVal(e.target.value)}
                            onBlur={async () => {
                              setInlineEditCell(null);
                              if ((asset.notes || '') === inlineDraftVal) return;
                              setInlineSavingId(asset.id);
                              try {
                                await handleSaveAssetInline(asset, { notes: inlineDraftVal });
                              } finally {
                                setInlineSavingId(null);
                              }
                            }}
                            onKeyDown={async (e) => {
                              if (e.key === 'Enter') {
                                setInlineEditCell(null);
                                if ((asset.notes || '') !== inlineDraftVal) {
                                  setInlineSavingId(asset.id);
                                  try {
                                    await handleSaveAssetInline(asset, { notes: inlineDraftVal });
                                  } finally {
                                    setInlineSavingId(null);
                                  }
                                }
                              }
                              if (e.key === 'Escape') setInlineEditCell(null);
                            }}
                            className="w-full min-w-[120px] px-1.5 py-0.5 text-xs bg-white border border-indigo-400 rounded focus:outline-none"
                          />
                        ) : (
                          <span className="truncate block text-slate-600" title={asset.notes}>
                            {asset.notes || (canInlineNotes ? <span className="text-slate-300 text-[11px]">入力...</span> : '')}
                          </span>
                        )}
                      </td>

                      {/* 添付 */}
                      <td
                        style={getColStyle('__attachments')}
                        className="py-2 px-2.5 border-r border-slate-200/70 text-center whitespace-nowrap overflow-hidden"
                      >
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
          setDetailInitialSubTab('details');
        }}
        asset={editingAsset}
        initialSubTab={detailInitialSubTab}
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
        onSaveScheduledInspection={handleSaveScheduledInspection}
        onOpenConfirmModal={(asset) => setConfirmModalState({ asset })}
        onOpenCategoryEditor={(cat) => {
          setEditingCategory(cat);
          setCategoryModalOpen(true);
        }}
        onUpdateUser={onUpdateUser}
      />

      <AssetInspectionConfirmModal
        isOpen={Boolean(confirmModalState)}
        onClose={() => setConfirmModalState(null)}
        asset={confirmModalState?.asset || null}
        category={
          confirmModalState?.asset
            ? categoryMap.get(confirmModalState.asset.categoryId) || null
            : null
        }
        logs={logs}
        targetLog={confirmModalState?.targetLog || null}
        directMode={Boolean(confirmModalState?.directMode)}
        onConfirmInspection={handleConfirmInspection}
        onRescheduleInspection={(p: RescheduleInspectionPayload) => handleSaveScheduledInspection(p)}
        onCancelSchedule={handleCancelScheduledInspection}
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

      {/* お気に入り操作トースト通知 */}
      {favoritesFeedback && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900/95 text-white px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 text-xs font-semibold backdrop-blur-xs">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
          <span>{favoritesFeedback}</span>
        </div>
      )}
    </div>
  );
}
