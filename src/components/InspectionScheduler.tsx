import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  FileSpreadsheet,
  Upload,
  Calendar as CalendarIcon,
  Users,
  CheckCircle2,
  AlertCircle,
  Clock,
  MapPin,
  FileText,
  ArrowRight,
  ArrowLeft,
  RefreshCw,
  EyeOff,
  CornerDownRight,
  Check,
  Plus,
  Trash2,
  FileCheck,
  ClipboardList,
  Sparkles,
  ExternalLink,
  Layers,
  Tag,
  Building,
  UserCheck,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  GripVertical,
  CalendarDays,
  Filter,
  Search,
  Loader2,
  Save,
  RotateCcw,
  CloudCheck,
  History,
  Server,
  HardDrive,
  AlertTriangle,
  Info,
  Wifi,
  WifiOff,
  HelpCircle,
  Lock,
  StickyNote,
  Mail,
  Printer,
  Phone,
  Globe,
  FileCheck2,
  Send,
  Edit3,
  Copy
} from 'lucide-react';
import { User, CalendarEvent } from '../types';
import {
  InspectionItem,
  InspectionMetaA,
  InspectionFaxStatus,
  InspectionMailStatus,
  InspectionTelStatus,
  InspectionPosterType,
  InspectionWorkNoticeType,
  InspectionWebEntryType,
  parseInspectionExcel,
  generateSampleInspectionExcel,
  generateDemoInspectionItems,
  saveSiteMasterEntry,
  applyMasterToItem,
  batchApplyMasterToItems,
  duplicateInspectionItem,
  copyMonthInspectionSchedule
} from '../utils/excelInspection';
import { getAvatarUrl } from '../utils/avatar';
import { markEventAsRead } from '../utils/notifications';
import { API_BASE_URL } from '../config/api';

interface InspectionSchedulerProps {
  allUsers: User[];
  currentUser: User;
  onAddEvents: (events: CalendarEvent[]) => void;
  onNavigateToCalendar?: () => void;
}

type StepType = 'import' | 'assign_date' | 'assign_member' | 'completed';

export function InspectionScheduler({
  allUsers,
  currentUser,
  onAddEvents,
  onNavigateToCalendar
}: InspectionSchedulerProps) {
  const [currentStep, setCurrentStep] = useState<StepType>('import');

  // Excel / アイテム状態 (デフォルト 2026-08)
  const [targetYearMonth, setTargetYearMonth] = useState<string>('2026-08');
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);
  const [dragOverItemId, setDragOverItemId] = useState<string | null>(null);

  // 自動保存・下書き状態管理
  type SyncDestination = 'server' | 'local_only';
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [syncDestination, setSyncDestination] = useState<SyncDestination>('server');
  const [syncDetailNote, setSyncDetailNote] = useState<string>('');
  const [showSyncInfoModal, setShowSyncInfoModal] = useState<boolean>(false);
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [isLoadingDraft, setIsLoadingDraft] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [carriedOverBanner, setCarriedOverBanner] = useState<{ prevMonth: string; count: number } | null>(null);
  const isInitialMountRef = useRef<boolean>(true);
  const isImportingRef = useRef<boolean>(false);
  const lastSavedJsonRef = useRef<string>('');
  const autoSaveTimerRef = useRef<any>(null);

  // 検索・フィルター
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'placed' | 'registered' | 'hidden' | 'carried_over'>('pending');

  // 仮配置ゾーンでの確定済みスケジュール表示切替（チェックマークで非表示化可能）
  const [showRegisteredInCalendar, setShowRegisteredInCalendar] = useState<boolean>(true);

  // 左側サイドバー（点検予定リスト）の開閉状態
  const [isSidebarOpen, setIsSidebarOpen] = useState<boolean>(true);
  // 時間変更ポップアップ表示中のアイテムID
  const [editingTimeItemId, setEditingTimeItemId] = useState<string | null>(null);

  // 備考・メタデータ(A)詳細編集モーダル用状態
  const [metaModalItem, setMetaModalItem] = useState<InspectionItem | null>(null);
  const [metaDraft, setMetaDraft] = useState<InspectionMetaA>({
    remarks: '',
    faxStatus: 'none',
    mailStatus: 'none',
    telStatus: 'none',
    posterType: 'none',
    workNoticeType: 'none',
    webEntryType: 'none',
  });

  // メンバー登録時の部署フィルター（デフォルト：保守メンバーのみ）
  const [onlyMaintenanceMembers, setOnlyMaintenanceMembers] = useState<boolean>(true);

  // 日時指定手動モーダル
  const [manualModalItem, setManualModalItem] = useState<InspectionItem | null>(null);
  const [manualDate, setManualDate] = useState<string>('');
  const [manualTime, setManualTime] = useState<string>('09:00');

  // 一括担当者指定用
  const [batchUserIds, setBatchUserIds] = useState<string[]>([]);
  const [completedCount, setCompletedCount] = useState<number>(0);
  const [step1Search, setStep1Search] = useState<string>('');

  // 他月からの点検データコピーモーダル用状態
  const [showCopyMonthModal, setShowCopyMonthModal] = useState<boolean>(false);
  const [copySourceMonth, setCopySourceMonth] = useState<string>('2026-07');
  const [copyMode, setCopyMode] = useState<'unassigned' | 'same_day'>('unassigned');
  const [copyStrategy, setCopyStrategy] = useState<'replace' | 'append'>('replace');
  const [copySourceLoading, setCopySourceLoading] = useState<boolean>(false);
  const [copySourceItems, setCopySourceItems] = useState<InspectionItem[]>([]);
  const [copySuccessToast, setCopySuccessToast] = useState<string | null>(null);

  // Excel取り込み時の確認・不一致・上書き/追加確認モーダル用状態
  const [pendingExcelImport, setPendingExcelImport] = useState<{
    fileYearMonth: string;
    items: InspectionItem[];
    fileName: string;
    isMismatch: boolean;
  } | null>(null);
  const [excelImportTargetMonthChoice, setExcelImportTargetMonthChoice] = useState<'excel_month' | 'current_selected'>('excel_month');
  const [excelImportStrategyChoice, setExcelImportStrategyChoice] = useState<'replace' | 'append'>('replace');

  const fileInputRef = useRef<HTMLInputElement>(null);

  // ==========================================
  // 前月 / 翌月 計算ヘルパー
  // ==========================================
  const getPrevMonth = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    if (!y || !m) return '';
    const d = new Date(y, m - 2, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  const getNextMonth = (ym: string) => {
    const [y, m] = ym.split('-').map(Number);
    if (!y || !m) return '';
    const d = new Date(y, m, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
  };

  // ==========================================
  // 下書きロード & 前月繰越自動引き継ぎ処理
  // ==========================================
  const loadDraftAndCarryOver = useCallback(async (ym: string, isManualSync = false) => {
    if (isImportingRef.current) return;
    if (isManualSync) setIsSyncing(true);
    else setIsLoadingDraft(true);

    try {
      // 1. APIから下書きを取得
      let loadedItems: InspectionItem[] = [];
      let loadedTime: string | null = null;
      let fromServer = false;
      let storageType = 'file';

      try {
        const resDraft = await fetch(`${API_BASE_URL}/inspection/drafts?targetYearMonth=${encodeURIComponent(ym)}`, {
          headers: {
            'Accept': 'application/json',
            'X-Target-Year-Month': ym
          }
        });
        if (resDraft.ok) {
          const draftData = await resDraft.json();
          if (Array.isArray(draftData.items) && draftData.items.length > 0) {
            loadedItems = draftData.items;
            fromServer = true;
            storageType = draftData.storage || 'server';
            if (draftData.lastSavedAt) {
              loadedTime = new Date(draftData.lastSavedAt).toLocaleTimeString('ja-JP', {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit',
              });
            }
          }
        }
      } catch (netErr) {
        console.warn('Draft server fetch failed:', netErr);
      }

      // 2. サーバーにない場合、ローカルストレージを確認
      if (loadedItems.length === 0) {
        try {
          const localSaved = localStorage.getItem(`inspection_draft_${ym}`);
          if (localSaved) {
            const parsed = JSON.parse(localSaved);
            if (Array.isArray(parsed) && parsed.length > 0) {
              loadedItems = parsed;
              fromServer = false;
            }
          }
        } catch (_) {}
      }

      // 3. 前月からの「翌月繰越」アイテムを確認
      try {
        const resCarry = await fetch(`${API_BASE_URL}/inspection/carry-overs?targetYearMonth=${encodeURIComponent(ym)}`, {
          headers: {
            'Accept': 'application/json',
            'X-Target-Year-Month': ym
          }
        });
        if (resCarry.ok) {
          const carryData = await resCarry.json();
          if (carryData.carriedOverCount > 0 && Array.isArray(carryData.carriedOverItems)) {
            // 既存のリストに未登録の繰越案件があればマージ
            const existingJobNos = new Set(loadedItems.map(i => i.jobNo));
            const newCarried = carryData.carriedOverItems.filter((i: any) => !existingJobNos.has(i.jobNo));

            if (newCarried.length > 0) {
              loadedItems = [...loadedItems, ...newCarried];
              setCarriedOverBanner({
                prevMonth: carryData.prevMonth,
                count: newCarried.length,
              });
            }
          } else {
            setCarriedOverBanner(null);
          }
        }
      } catch (_) {}

      // もしインポート中フラグが立っていたら上書きをスキップ
      if (isImportingRef.current) return;

      setItems(loadedItems);
      lastSavedJsonRef.current = JSON.stringify(loadedItems);
      if (loadedItems.length > 0) {
        setSaveStatus('saved');
        setSyncDestination(fromServer ? 'server' : 'local_only');
        setSyncDetailNote(
          fromServer
            ? (storageType === 'sql' ? 'SQL Serverデータベースから下書きを読み込みました' : 'サーバー（API/NAS）から下書きを読み込みました')
            : 'このブラウザのローカル一時保存から復元しました（サーバー未接続）'
        );
        setLastSavedTime(loadedTime || new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        if (isInitialMountRef.current) {
          setCurrentStep('assign_date');
        }
      } else {
        setSaveStatus('idle');
        setSyncDestination('server');
        setSyncDetailNote('');
      }
    } catch (err) {
      console.warn('Failed to load inspection draft:', err);
      setSaveStatus('error');
      setSyncDestination('local_only');
    } finally {
      setIsLoadingDraft(false);
      setIsSyncing(false);
      isInitialMountRef.current = false;
    }
  }, []);

  // 即座にサーバーへ直接永続保存する関数
  const saveDraftDirect = async (ym: string, itemsToSave: InspectionItem[], step?: StepType) => {
    setSaveStatus('saving');
    const jsonStr = JSON.stringify(itemsToSave);
    try {
      localStorage.setItem(`inspection_draft_${ym}`, jsonStr);
    } catch (_) {}

    try {
      const res = await fetch(`${API_BASE_URL}/inspection/drafts?targetYearMonth=${encodeURIComponent(ym)}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
          'X-Target-Year-Month': ym
        },
        body: JSON.stringify({
          targetYearMonth: ym,
          items: itemsToSave,
          currentStep: step || currentStep,
          savedByUserId: currentUser.id,
          savedByUserName: currentUser.name,
        }),
      });

      const nowFormatted = new Date().toLocaleTimeString('ja-JP', {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });

      if (res.ok) {
        const data = await res.json();
        lastSavedJsonRef.current = jsonStr;
        setSaveStatus('saved');
        setSyncDestination('server');
        setSyncDetailNote(data.storage === 'sql' ? 'SQL Serverデータベースに正常に保存・同期されました' : 'サーバー（API/NAS）に正常に保存・同期されました');
        setLastSavedTime(
          data.lastSavedAt
            ? new Date(data.lastSavedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
            : nowFormatted
        );
      } else {
        lastSavedJsonRef.current = jsonStr;
        setSaveStatus('saved');
        setSyncDestination('local_only');
        setSyncDetailNote(`サーバー未応答 (HTTP ${res.status}): ローカル一時保存`);
        setLastSavedTime(nowFormatted);
      }
    } catch (e: any) {
      lastSavedJsonRef.current = jsonStr;
      setSaveStatus('saved');
      setSyncDestination('local_only');
      setSyncDetailNote('サーバーAPI未接続: ローカル一時保存');
      setLastSavedTime(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
    }
  };

  // 月変更時・初回マウント時に自動ロード
  useEffect(() => {
    loadDraftAndCarryOver(targetYearMonth);
  }, [targetYearMonth, loadDraftAndCarryOver]);

  // ==========================================
  // デバウンス自動保存 (Auto-Save)
  // D&D移動や連続での時間変更時のサーバー通信トラフィックを削減するため、
  // ローカル(localStorage)は即時書き込み、サーバー同期は2.5秒(2500ms)静止後に遅延実行します。
  // ==========================================
  useEffect(() => {
    if (isInitialMountRef.current || isLoadingDraft) return;

    const currentJson = JSON.stringify(items);
    if (currentJson === lastSavedJsonRef.current) return;

    // 1. ローカルストレージ(ブラウザ)へは即座に書き込み（画面描画のレスポンス爆速化＆ブラウザ閉じ対策）
    try {
      localStorage.setItem(`inspection_draft_${targetYearMonth}`, currentJson);
    } catch (_) {}

    // 操作待機中ステータスに更新
    setSaveStatus('saving');
    setSyncDetailNote('編集中... 2.5秒後にサーバーと同期します');

    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
    }

    // 2. サーバーAPIへの同期送信は、D&D・操作が静止した 2500ms (2.5秒) 後に1回だけ一括送信
    autoSaveTimerRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE_URL}/inspection/drafts?targetYearMonth=${encodeURIComponent(targetYearMonth)}`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Target-Year-Month': targetYearMonth
          },
          body: JSON.stringify({
            targetYearMonth,
            items,
            savedByUserId: currentUser.id,
            savedByUserName: currentUser.name,
            currentStep,
          }),
        });

        const nowFormatted = new Date().toLocaleTimeString('ja-JP', {
          hour: '2-digit',
          minute: '2-digit',
          second: '2-digit',
        });

        if (res.ok) {
          const data = await res.json();
          lastSavedJsonRef.current = currentJson;
          setSaveStatus('saved');
          setSyncDestination('server');
          setSyncDetailNote(data.storage === 'sql' ? 'SQL Serverデータベースに正常に自動保存・同期されました' : 'サーバー（API/NAS）に正常に自動保存・同期されました');
          setLastSavedTime(
            data.lastSavedAt
              ? new Date(data.lastSavedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              : nowFormatted
          );
        } else {
          lastSavedJsonRef.current = currentJson;
          setSaveStatus('saved');
          setSyncDestination('local_only');
          setSyncDetailNote(`サーバー未応答 (HTTP ${res.status}): このブラウザ内のみ保存中`);
          setLastSavedTime(nowFormatted);
        }
      } catch (e: any) {
        console.warn('Auto-save server error, saved to local cache:', e);
        lastSavedJsonRef.current = currentJson;
        setSaveStatus('saved');
        setSyncDestination('local_only');
        setSyncDetailNote('サーバーAPI未接続: このブラウザ内のみ保存中');
        setLastSavedTime(new Date().toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      }
    }, 2500);

    return () => {
      if (autoSaveTimerRef.current) {
        clearTimeout(autoSaveTimerRef.current);
      }
    };
  }, [items, targetYearMonth, isLoadingDraft, currentUser, currentStep]);

  // 下書きクリア（リセット）
  const handleClearDraft = async () => {
    if (items.length === 0) return;
    if (confirm(`${targetYearMonth} の下書き作業データを初期化しますか？\n（配置・未配置・繰越状態がクリアされます）`)) {
      try {
        await fetch(`${API_BASE_URL}/inspection/drafts?targetYearMonth=${encodeURIComponent(targetYearMonth)}`, {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            'X-Target-Year-Month': targetYearMonth
          },
          body: JSON.stringify({ targetYearMonth })
        });
        localStorage.removeItem(`inspection_draft_${targetYearMonth}`);
        setItems([]);
        lastSavedJsonRef.current = JSON.stringify([]);
        setSaveStatus('idle');
        setLastSavedTime(null);
        setCarriedOverBanner(null);
      } catch (e) {
        console.error('Failed to clear draft:', e);
      }
    }
  };

  // 手動同期
  const handleManualSync = () => {
    loadDraftAndCarryOver(targetYearMonth, true);
  };

  // ==========================================
  // 保守メンバーのフィルタリング
  // ==========================================
  const maintenanceUsers = allUsers.filter((u) => {
    const div = (u.division || '').trim();
    const dept = (u.department || '').trim();
    return div.includes('保守') || dept.includes('保守');
  });

  // メンバー登録画面で表示するユーザー一覧
  const selectableUsers = onlyMaintenanceMembers && maintenanceUsers.length > 0
    ? maintenanceUsers
    : allUsers;

  // ==========================================
  // カレンダーの日付リスト生成 (対象年月の1日〜末日)
  // ==========================================
  const getDaysInMonthList = (yearMonthStr: string) => {
    const [year, month] = yearMonthStr.split('-').map(Number);
    if (!year || !month) return [];

    const daysCount = new Date(year, month, 0).getDate();
    const days = [];

    for (let d = 1; d <= daysCount; d++) {
      const dayStr = String(d).padStart(2, '0');
      const monthStr = String(month).padStart(2, '0');
      const dateKey = `${year}-${monthStr}-${dayStr}`;
      
      const dateObj = new Date(year, month - 1, d);
      const dayOfWeekNum = dateObj.getDay();
      const dayOfWeekMap = ['日', '月', '火', '水', '木', '金', '土'];
      const dayOfWeekStr = dayOfWeekMap[dayOfWeekNum];

      days.push({
        dateKey,
        dayNumber: d,
        monthNumber: month,
        dayOfWeekStr,
        dayOfWeekNum,
        isWeekend: dayOfWeekNum === 0 || dayOfWeekNum === 6,
        isSunday: dayOfWeekNum === 0,
        isSaturday: dayOfWeekNum === 6,
      });
    }

    return days;
  };

  const monthDays = getDaysInMonthList(targetYearMonth);

  // 30分刻みの時間候補リスト
  const TIME_OPTIONS_30MIN = [
    '06:00', '06:30', '07:00', '07:30', '08:00', '08:30', '09:00', '09:30',
    '10:00', '10:30', '11:00', '11:30', '12:00', '12:30', '13:00', '13:30',
    '14:00', '14:30', '15:00', '15:30', '16:00', '16:30', '17:00', '17:30',
    '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00'
  ];

  // ------------------------------------------
  // 指定日の配置アイテムの時間ヘルパー（全件9:00スタート、個別設定時間を維持）
  // ------------------------------------------
  const recalculateTimesForDateList = (
    currentItems: InspectionItem[],
    dateKey: string,
    orderedSameDayItems?: InspectionItem[]
  ): InspectionItem[] => {
    const sameDay = orderedSameDayItems || currentItems.filter((i) => i.status === 'placed' && i.assignedDate === dateKey);
    const otherItems = currentItems.filter((i) => !(i.status === 'placed' && i.assignedDate === dateKey));

    const updatedSameDay = sameDay.map((item) => {
      // 既存の時間が設定されていれば維持、なければすべて9:00〜10:00を初期値とする
      const startStr = item.assignedStartTime || '09:00';
      let endStr = item.assignedEndTime;
      if (!endStr) {
        const [h, m] = startStr.split(':').map(Number);
        const endH = Math.min(23, h + 1);
        endStr = `${String(endH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
      }
      return {
        ...item,
        status: 'placed' as const,
        assignedDate: dateKey,
        assignedStartTime: startStr,
        assignedEndTime: endStr,
      };
    });

    return [...otherItems, ...updatedSameDay];
  };

  // ------------------------------------------
  // 時間の30分刻み直接更新ハンドラー
  // ------------------------------------------
  const handleUpdateItemTime = (itemId: string, newStart: string, newEnd?: string) => {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          let calculatedEnd = newEnd;
          if (!calculatedEnd) {
            const [h, m] = newStart.split(':').map(Number);
            const endH = Math.min(23, h + 1);
            calculatedEnd = `${String(endH).padStart(2, '0')}:${String(m || 0).padStart(2, '0')}`;
          }
          if (item.jobNo) {
            saveSiteMasterEntry(item.jobNo, {
              siteCode: item.siteCode,
              siteName: item.siteName,
              metaA: item.metaA,
              lastPlacedStartTime: newStart,
              lastPlacedEndTime: calculatedEnd,
            });
          }
          return {
            ...item,
            assignedStartTime: newStart,
            assignedEndTime: calculatedEnd,
          };
        }
        return item;
      })
    );
  };

  // ------------------------------------------
  // メタデータ (A) のクイック循環・トグル更新ハンドラー
  // ------------------------------------------
  // Faxステータス: 必要(赤) -> 送付済(黄) -> 確定済(緑) -> 必要(赤)...
  const handleCycleFaxStatus = (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const current = item.metaA?.faxStatus || 'none';
          let next: InspectionFaxStatus = 'required';
          if (current === 'required') next = 'sent';
          else if (current === 'sent') next = 'confirmed';
          else if (current === 'confirmed') next = 'required';
          const newMetaA = {
            ...item.metaA,
            faxStatus: next,
          };
          if (item.jobNo) {
            saveSiteMasterEntry(item.jobNo, {
              siteCode: item.siteCode,
              siteName: item.siteName,
              metaA: newMetaA,
            });
          }
          return {
            ...item,
            metaA: newMetaA,
          };
        }
        return item;
      })
    );
  };

  // Mailステータス: 必要(赤) -> 送付済(黄) -> 確定済(緑) -> 必要(赤)...
  const handleCycleMailStatus = (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const current = item.metaA?.mailStatus || 'none';
          let next: InspectionMailStatus = 'required';
          if (current === 'required') next = 'sent';
          else if (current === 'sent') next = 'confirmed';
          else if (current === 'confirmed') next = 'required';
          const newMetaA = {
            ...item.metaA,
            mailStatus: next,
          };
          if (item.jobNo) {
            saveSiteMasterEntry(item.jobNo, {
              siteCode: item.siteCode,
              siteName: item.siteName,
              metaA: newMetaA,
            });
          }
          return {
            ...item,
            metaA: newMetaA,
          };
        }
        return item;
      })
    );
  };

  // Telステータス: 必要(赤) -> 確認済(緑) -> 必要(赤)...
  const handleCycleTelStatus = (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const current = item.metaA?.telStatus || 'none';
          let next: InspectionTelStatus = 'required';
          if (current === 'required') next = 'confirmed';
          else if (current === 'confirmed') next = 'required';
          const newMetaA = {
            ...item.metaA,
            telStatus: next,
          };
          if (item.jobNo) {
            saveSiteMasterEntry(item.jobNo, {
              siteCode: item.siteCode,
              siteName: item.siteName,
              metaA: newMetaA,
            });
          }
          return {
            ...item,
            metaA: newMetaA,
          };
        }
        return item;
      })
    );
  };

  // 貼紙 済トグル (未済:赤 ⇄ 済:濃い緑)
  const handleTogglePosterDone = (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const nextDone = !item.metaA?.posterDone;
          const newMetaA = {
            ...item.metaA,
            posterDone: nextDone,
          };
          if (item.jobNo) {
            saveSiteMasterEntry(item.jobNo, {
              siteCode: item.siteCode,
              siteName: item.siteName,
              metaA: newMetaA,
            });
          }
          return {
            ...item,
            metaA: newMetaA,
          };
        }
        return item;
      })
    );
  };

  // 作業届 済トグル (未済:赤 ⇄ 済:濃い緑)
  const handleToggleWorkNoticeDone = (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const nextDone = !item.metaA?.workNoticeDone;
          const newMetaA = {
            ...item.metaA,
            workNoticeDone: nextDone,
          };
          if (item.jobNo) {
            saveSiteMasterEntry(item.jobNo, {
              siteCode: item.siteCode,
              siteName: item.siteName,
              metaA: newMetaA,
            });
          }
          return {
            ...item,
            metaA: newMetaA,
          };
        }
        return item;
      })
    );
  };

  // WEB入力 済トグル (未済:赤 ⇄ 済:濃い緑)
  const handleToggleWebEntryDone = (itemId: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === itemId) {
          const nextDone = !item.metaA?.webEntryDone;
          const newMetaA = {
            ...item.metaA,
            webEntryDone: nextDone,
          };
          if (item.jobNo) {
            saveSiteMasterEntry(item.jobNo, {
              siteCode: item.siteCode,
              siteName: item.siteName,
              metaA: newMetaA,
            });
          }
          return {
            ...item,
            metaA: newMetaA,
          };
        }
        return item;
      })
    );
  };

  // 備考・メタデータ詳細モーダルを開く
  const handleOpenMetaModal = (item: InspectionItem, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setMetaModalItem(item);
    setMetaDraft({
      remarks: item.metaA?.remarks || '',
      faxStatus: item.metaA?.faxStatus || 'none',
      mailStatus: item.metaA?.mailStatus || 'none',
      telStatus: item.metaA?.telStatus || 'none',
      posterType: item.metaA?.posterType || 'none',
      posterDone: item.metaA?.posterDone || false,
      workNoticeType: item.metaA?.workNoticeType || 'none',
      workNoticeDone: item.metaA?.workNoticeDone || false,
      webEntryType: item.metaA?.webEntryType || 'none',
      webEntryDone: item.metaA?.webEntryDone || false,
    });
  };

  // 備考・メタデータ詳細モーダルを保存
  const handleSaveMetaModal = () => {
    if (!metaModalItem) return;
    const newMetaA = {
      ...metaModalItem.metaA,
      ...metaDraft,
    };
    if (metaModalItem.jobNo) {
      saveSiteMasterEntry(metaModalItem.jobNo, {
        siteCode: metaModalItem.siteCode,
        siteName: metaModalItem.siteName,
        metaA: newMetaA,
      });
    }
    setItems((prev) =>
      prev.map((item) => {
        if (item.id === metaModalItem.id) {
          return {
            ...item,
            metaA: newMetaA,
          };
        }
        return item;
      })
    );
    setMetaModalItem(null);
  };

  // ------------------------------------------
  // Excel ファイル読込処理
  // ------------------------------------------
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = async (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) return;

      const result = parseInspectionExcel(buffer, allUsers);
      if (result.error) {
        alert(result.error);
        return;
      }

      const fileYm = result.targetYearMonth || targetYearMonth;
      const isMismatch = Boolean(result.targetYearMonth && result.targetYearMonth !== targetYearMonth);

      // モーダルを開いて、年月不一致の確認や既存データとの上書き・追加を選択させる
      setPendingExcelImport({
        fileYearMonth: fileYm,
        items: result.items,
        fileName: file.name,
        isMismatch,
      });
      setExcelImportTargetMonthChoice(isMismatch ? 'excel_month' : 'current_selected');
      setExcelImportStrategyChoice('replace');
    };
    reader.readAsArrayBuffer(file);
  };

  // Excel取り込み確認モーダルで「取り込みを実行」をクリックした時の処理
  const handleConfirmExcelImport = async () => {
    if (!pendingExcelImport) return;

    const chosenYm = excelImportTargetMonthChoice === 'excel_month'
      ? pendingExcelImport.fileYearMonth
      : targetYearMonth;

    const importedItems = pendingExcelImport.items.map(item => ({
      ...item,
      targetYearMonth: chosenYm,
    }));

    let nextItems: InspectionItem[] = [];

    // もし選択中の画面と取り込み先年月が一致していて、かつ「追加」の場合はマージ
    if (chosenYm === targetYearMonth && excelImportStrategyChoice === 'append' && items.length > 0) {
      nextItems = [...items, ...importedItems];
    } else if (chosenYm !== targetYearMonth) {
      // 別年月へ取り込む場合、その年月の既存データを一旦チェック
      let existingTargetMonthItems: InspectionItem[] = [];
      try {
        const local = localStorage.getItem(`inspection_draft_${chosenYm}`);
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed)) existingTargetMonthItems = parsed;
        }
      } catch (_) {}

      if (excelImportStrategyChoice === 'append' && existingTargetMonthItems.length > 0) {
        nextItems = [...existingTargetMonthItems, ...importedItems];
      } else {
        nextItems = importedItems;
      }
    } else {
      nextItems = importedItems;
    }

    isImportingRef.current = true;
    if (chosenYm !== targetYearMonth) {
      setTargetYearMonth(chosenYm);
    }
    setItems(nextItems);
    setCurrentStep('assign_date');
    setPendingExcelImport(null);

    setCopySuccessToast(`「${pendingExcelImport.fileName}」から ${importedItems.length} 件の点検予定を ${chosenYm} に取り込みました`);
    setTimeout(() => setCopySuccessToast(null), 4000);

    // 即座にサーバー（SQL/ファイル）に直接永続保存
    await saveDraftDirect(chosenYm, nextItems, 'assign_date');
    setTimeout(() => {
      isImportingRef.current = false;
    }, 1200);
  };

  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // デモデータ読み込み (実データ形式)
  const handleLoadDemoData = async () => {
    const demoItems = generateDemoInspectionItems(targetYearMonth, allUsers);
    isImportingRef.current = true;
    setItems(demoItems);
    setCurrentStep('assign_date');
    await saveDraftDirect(targetYearMonth, demoItems, 'assign_date');
    setTimeout(() => {
      isImportingRef.current = false;
    }, 1200);
  };

  // ------------------------------------------
  // 他月からの点検データコピー処理
  // ------------------------------------------
  const fetchCopySourceDraft = useCallback(async (sourceYm: string) => {
    setCopySourceLoading(true);
    let loaded: InspectionItem[] = [];
    try {
      const res = await fetch(`${API_BASE_URL}/inspection/drafts?targetYearMonth=${encodeURIComponent(sourceYm)}`, {
        headers: { 'Accept': 'application/json', 'X-Target-Year-Month': sourceYm }
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.items) && data.items.length > 0) {
          loaded = data.items;
        }
      }
    } catch (_) {}

    if (loaded.length === 0) {
      try {
        const local = localStorage.getItem(`inspection_draft_${sourceYm}`);
        if (local) {
          const parsed = JSON.parse(local);
          if (Array.isArray(parsed) && parsed.length > 0) {
            loaded = parsed;
          }
        }
      } catch (_) {}
    }

    // デモ用などで過去月データがない場合のフォールバック（デモデータを仮想ソースとする）
    if (loaded.length === 0 && (sourceYm === '2026-07' || sourceYm === getPrevMonth(targetYearMonth))) {
      loaded = generateDemoInspectionItems(sourceYm, allUsers);
    }

    setCopySourceItems(loaded);
    setCopySourceLoading(false);
  }, [targetYearMonth, allUsers]);

  // モーダル表示時に自動ロード
  useEffect(() => {
    if (showCopyMonthModal) {
      fetchCopySourceDraft(copySourceMonth);
    }
  }, [showCopyMonthModal, copySourceMonth, fetchCopySourceDraft]);

  const handleOpenCopyMonthModal = (defaultSourceYm?: string) => {
    const srcYm = defaultSourceYm || getPrevMonth(targetYearMonth) || '2026-07';
    setCopySourceMonth(srcYm);
    setShowCopyMonthModal(true);
  };

  const handleExecuteCopyMonth = async () => {
    if (copySourceItems.length === 0) {
      alert(`${copySourceMonth} にコピー可能な点検データが存在しません。`);
      return;
    }

    const copied = copyMonthInspectionSchedule(copySourceItems, targetYearMonth, copyMode);

    let nextItems: InspectionItem[] = [];
    if (copyStrategy === 'replace') {
      nextItems = copied;
    } else {
      nextItems = [...items, ...copied];
    }

    isImportingRef.current = true;
    setItems(nextItems);
    setCurrentStep('assign_date');
    setShowCopyMonthModal(false);
    setCopySuccessToast(`${copySourceMonth} から ${copied.length} 件の点検予定をマスター情報付きでコピーしました`);
    setTimeout(() => setCopySuccessToast(null), 4000);

    // サーバーへ直接保存
    await saveDraftDirect(targetYearMonth, nextItems, 'assign_date');
    setTimeout(() => {
      isImportingRef.current = false;
    }, 1200);
  };

  // 単一カードの複製ハンドラー
  const handleDuplicateItem = (sourceItem: InspectionItem) => {
    const duplicated = duplicateInspectionItem(sourceItem, {
      targetYearMonth,
      newDate: sourceItem.assignedDate,
      status: sourceItem.status === 'placed' ? 'placed' : 'pending',
    });

    setItems((prev) => {
      const idx = prev.findIndex((i) => i.id === sourceItem.id);
      if (idx !== -1) {
        const next = [...prev];
        next.splice(idx + 1, 0, duplicated);
        return next;
      }
      return [...prev, duplicated];
    });

    setCopySuccessToast(`「${sourceItem.siteName}」を複製しました`);
    setTimeout(() => setCopySuccessToast(null), 3000);
  };

  // ------------------------------------------
  // ステータス・カウント集計
  // ------------------------------------------
  const pendingItems = items.filter((i) => i.status === 'pending');
  const placedItems = items.filter((i) => i.status === 'placed');
  const registeredItems = items.filter((i) => i.status === 'registered');
  const hiddenItems = items.filter((i) => i.status === 'hidden');
  const carriedOverItems = items.filter((i) => i.status === 'carried_over');

  // 表示フィルタリングアイテム
  const filteredListItems = items.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSite = item.siteName.toLowerCase().includes(q);
      const matchArea = item.area ? item.area.toLowerCase().includes(q) : false;
      const matchAddr = item.address.toLowerCase().includes(q);
      const matchJob = item.jobNo.toLowerCase().includes(q);
      const matchRules = item.customerRules.toLowerCase().includes(q);
      const matchSiteCode = item.siteCode ? item.siteCode.toLowerCase().includes(q) : false;
      const matchPerson = item.excelPersonName ? item.excelPersonName.toLowerCase().includes(q) : false;
      return matchSite || matchArea || matchAddr || matchJob || matchRules || matchSiteCode || matchPerson;
    }
    return true;
  });

  // ------------------------------------------
  // D&D 日付配置 & 再配置（別日付への移動）
  // ------------------------------------------
  const handleAssignItemToDate = (itemId: string, newDateKey: string) => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem) return;

    const oldDateKey = targetItem.status === 'placed' ? targetItem.assignedDate : undefined;

    setItems((prev) => {
      // 既存の targetItem を更新
      const itemToMove = {
        ...targetItem,
        status: 'placed' as const,
        assignedDate: newDateKey,
      };

      let updatedList = prev.filter((i) => i.id !== itemId);
      const targetDayItems = updatedList.filter((i) => i.status === 'placed' && i.assignedDate === newDateKey);
      
      // 末尾に追加
      const newTargetDayItems = [...targetDayItems, itemToMove];

      // 新しい日付の時間を再計算
      updatedList = recalculateTimesForDateList(updatedList, newDateKey, newTargetDayItems);

      // 古い日付があれば古い日付の時間も繰り上げ再計算
      if (oldDateKey && oldDateKey !== newDateKey) {
        updatedList = recalculateTimesForDateList(updatedList, oldDateKey);
      }

      return updatedList;
    });
  };

  // ------------------------------------------
  // 同一日内での順序入れ替え (上へ / 下へ)
  // ------------------------------------------
  const handleMoveItemOrder = (itemId: string, direction: 'up' | 'down') => {
    const targetItem = items.find((i) => i.id === itemId);
    if (!targetItem || !targetItem.assignedDate) return;

    const dateKey = targetItem.assignedDate;
    const sameDayItems = items.filter((i) => i.status === 'placed' && i.assignedDate === dateKey);
    const currentIndex = sameDayItems.findIndex((i) => i.id === itemId);
    if (currentIndex === -1) return;

    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= sameDayItems.length) return;

    // スワップ
    const reorderedSameDay = [...sameDayItems];
    const temp = reorderedSameDay[currentIndex];
    reorderedSameDay[currentIndex] = reorderedSameDay[targetIndex];
    reorderedSameDay[targetIndex] = temp;

    // 時間再計算
    setItems((prev) => recalculateTimesForDateList(prev, dateKey, reorderedSameDay));
  };

  // ------------------------------------------
  // ドラッグ＆ドロップによる特定アイテムの前への割り込み配置
  // ------------------------------------------
  const handleDropOnItem = (droppedItemId: string, targetItemId: string) => {
    if (droppedItemId === targetItemId) return;
    const droppedItem = items.find((i) => i.id === droppedItemId);
    const targetItem = items.find((i) => i.id === targetItemId);
    if (!droppedItem || !targetItem || !targetItem.assignedDate) return;

    const newDateKey = targetItem.assignedDate;
    const oldDateKey = droppedItem.status === 'placed' ? droppedItem.assignedDate : undefined;

    setItems((prev) => {
      const remaining = prev.filter((i) => i.id !== droppedItemId);
      const sameDayItems = remaining.filter((i) => i.status === 'placed' && i.assignedDate === newDateKey);

      const targetIdx = sameDayItems.findIndex((i) => i.id === targetItemId);
      const insertIdx = targetIdx !== -1 ? targetIdx : sameDayItems.length;

      const itemToInsert: InspectionItem = {
        ...droppedItem,
        status: 'placed',
        assignedDate: newDateKey,
      };

      const newSameDay = [...sameDayItems];
      newSameDay.splice(insertIdx, 0, itemToInsert);

      let updated = recalculateTimesForDateList(remaining, newDateKey, newSameDay);

      if (oldDateKey && oldDateKey !== newDateKey) {
        updated = recalculateTimesForDateList(updated, oldDateKey);
      }

      return updated;
    });
  };

  // エクセル内の点検日情報を使って一括仮配置する便利機能
  const handleAutoPlaceFromExcelDates = () => {
    const itemsWithDate = items.filter((i) => i.status === 'pending' && i.initialDate);
    if (itemsWithDate.length === 0) {
      alert('エクセル内に点検日が記載された未配置アイテムがありません。');
      return;
    }

    setItems((prev) => {
      let updated = [...prev];
      const dateCounters: Record<string, number> = {};
      
      updated.filter((i) => i.status === 'placed' && i.assignedDate).forEach((i) => {
        dateCounters[i.assignedDate!] = (dateCounters[i.assignedDate!] || 0) + 1;
      });

      const datesToRecalculate = new Set<string>();

      updated = updated.map((item) => {
        if (item.status === 'pending' && item.initialDate) {
          const dKey = item.initialDate;
          datesToRecalculate.add(dKey);
          return {
            ...item,
            status: 'placed' as const,
            assignedDate: dKey,
          };
        }
        return item;
      });

      datesToRecalculate.forEach((dKey) => {
        updated = recalculateTimesForDateList(updated, dKey);
      });

      return updated;
    });
  };

  // カレンダーから削除（未配置に戻す）
  const handleRemoveFromCalendar = (itemId: string) => {
    const targetItem = items.find((i) => i.id === itemId);
    const oldDateKey = targetItem?.assignedDate;

    setItems((prev) => {
      let updated = prev.map((i) => {
        if (i.id === itemId) {
          return {
            ...i,
            status: 'pending' as const,
            assignedDate: undefined,
            assignedStartTime: undefined,
            assignedEndTime: undefined,
          };
        }
        return i;
      });

      if (oldDateKey) {
        updated = recalculateTimesForDateList(updated, oldDateKey);
      }
      return updated;
    });
  };

  // 翌月繰り越し
  const handleCarryOverItem = (itemId: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: 'carried_over' } : i))
    );
  };

  // 一時削除（非表示リスト）
  const handleHideItem = (itemId: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: 'hidden' } : i))
    );
  };

  // 未配置に戻す
  const handleRestoreToPending = (itemId: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: 'pending' } : i))
    );
  };

  // 一括翌月繰り越し
  const handleBatchCarryOver = () => {
    if (!pendingItems.length) return;
    if (confirm(`未配置の ${pendingItems.length} 件をすべて「翌月繰り越し」に移動しますか？`)) {
      setItems((prev) =>
        prev.map((i) => (i.status === 'pending' ? { ...i, status: 'carried_over' } : i))
      );
    }
  };

  // 一括一時削除
  const handleBatchHide = () => {
    if (!pendingItems.length) return;
    if (confirm(`未配置の ${pendingItems.length} 件をすべて「一時削除（非表示）」に移動しますか？`)) {
      setItems((prev) =>
        prev.map((i) => (i.status === 'pending' ? { ...i, status: 'hidden' } : i))
      );
    }
  };

  // ------------------------------------------
  // メンバー割り当て & 確定登録
  // ------------------------------------------
  const handleToggleUserAssignment = (itemId: string, userId: string) => {
    const targetUser = allUsers.find((u) => u.id === userId);
    if (!targetUser) return;

    setItems((prev) =>
      prev.map((i) => {
        if (i.id === itemId) {
          const currentUsers = i.assignedUsers || [];
          const exists = currentUsers.some((u) => u.id === userId);
          const nextUsers = exists
            ? currentUsers.filter((u) => u.id !== userId)
            : [...currentUsers, targetUser];
          return { ...i, assignedUsers: nextUsers };
        }
        return i;
      })
    );
  };

  // 全アイテムに共通担当者を一括設定
  const handleApplyBatchUsers = () => {
    if (batchUserIds.length === 0) return;
    const selectedUsers = allUsers.filter((u) => batchUserIds.includes(u.id));

    setItems((prev) =>
      prev.map((i) => {
        if (i.status === 'placed') {
          return { ...i, assignedUsers: selectedUsers };
        }
        return i;
      })
    );
  };

  // 確定登録（CalendarEventへ変換・反映し、該当アイテムをregisteredとして下書き保存）
  const handleFinalConfirmRegistration = () => {
    const itemsToRegister = items.filter((i) => i.status === 'placed' && i.assignedDate);
    if (itemsToRegister.length === 0) {
      alert('カレンダーに仮配置された未確定の点検予定がありません。');
      return;
    }

    const createdEvents: CalendarEvent[] = itemsToRegister.map((item) => {
      const startTime = item.assignedStartTime || '09:00';
      const endTime = item.assignedEndTime || '10:00';
      const startIso = `${item.assignedDate}T${startTime}:00`;
      const endIso = `${item.assignedDate}T${endTime}:00`;

      // 内容に実エクセルの各項目を整理して格納
      const memoLines = [
        `【作業No】${item.jobNo || '未設定'}`,
        item.siteCode ? `【現場コード】${item.siteCode}` : '',
        `【台数】${item.quantity}台`,
        item.workName ? `【作業名】${item.workName}${item.workCategory ? ` (区分: ${item.workCategory})` : ''}` : '',
        item.contractNo ? `【契約No】${item.contractNo}` : '',
        item.area ? `【地区】${item.area}` : '',
        `【客先規則】${item.customerRules || 'なし'}`,
        item.department ? `【部門】${item.department}` : '',
        item.conditions ? `【条件/警告】${item.conditions}` : '',
      ].filter(Boolean);

      const eventId = `evt_insp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
      const newEvent: CalendarEvent = {
        id: eventId,
        title: item.siteName,
        start: startIso,
        end: endIso,
        type: 'inspection',
        location: item.address,
        memo: memoLines.join('\n'),
        attendees: item.assignedUsers && item.assignedUsers.length > 0 ? item.assignedUsers : [currentUser],
        createdBy: {
          ...currentUser,
          name: '点検登録',
        },
        createdViaInspection: true,
        isGoogleSynced: false,
        status: 'published',
        targetYearMonth: targetYearMonth,
        draftSavedAt: new Date().toISOString(),
        createdAt: new Date().toISOString(),
      };

      // 参加者に対して既読処理
      if (item.assignedUsers && item.assignedUsers.length > 0) {
        item.assignedUsers.forEach((u) => markEventAsRead(u.id, newEvent.id));
      } else {
        markEventAsRead(currentUser.id, newEvent.id);
      }

      return newEvent;
    });

    onAddEvents(createdEvents);

    // 確定されたアイテムのステータスを 'registered' に変更し、次回以降の重複追加を防止
    const registeredIds = new Set(itemsToRegister.map((i) => i.id));
    const updatedItems = items.map((i) => {
      if (registeredIds.has(i.id)) {
        return {
          ...i,
          status: 'registered' as const,
          isConfirmed: true,
          draftSavedAt: new Date().toISOString(),
        };
      }
      return i;
    });

    setItems(updatedItems);
    saveDraftDirect(targetYearMonth, updatedItems, 'assign_date');
    setCompletedCount(createdEvents.length);
    setCurrentStep('completed');
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-12">
      {/* 画面ヘッダー */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm ring-1 ring-slate-900/5 space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-indigo-600 text-white rounded-2xl flex items-center justify-center shadow-md shadow-indigo-100">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl font-black text-slate-900">点検予定一括登録・管理</h1>
                <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-200">
                  月間点検スケジューラー
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                月間300〜600件の点検エクセルを取り込み、D&Dで日付配置・順序調整・メンバー割り当てを行いカレンダーに一括反映します。
              </p>
            </div>
          </div>

          {/* ステップナビゲーター */}
          <div className="flex items-center gap-1.5 sm:gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 self-start md:self-auto overflow-x-auto text-xs font-bold">
            <button
              onClick={() => setCurrentStep('import')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer ${
                currentStep === 'import'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <span>1. 取込・確認</span>
            </button>

            <span className="text-slate-300">→</span>

            <button
              disabled={items.length === 0}
              onClick={() => setCurrentStep('assign_date')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                currentStep === 'assign_date'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <span>2. 日付仮配置・再配置 (D&D)</span>
            </button>

            <span className="text-slate-300">→</span>

            <button
              disabled={placedItems.length === 0}
              onClick={() => setCurrentStep('assign_member')}
              className={`px-3 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                currentStep === 'assign_member'
                  ? 'bg-indigo-600 text-white shadow-xs'
                  : 'text-slate-600 hover:bg-slate-200/60'
              }`}
            >
              <span>3. メンバー登録 (保守)</span>
            </button>
          </div>
        </div>

        {/* サブツールバー: 対象年月切替・自動保存状態・同期・リセット */}
        <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
          {/* 年月セレクター */}
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-slate-100/80 p-1 rounded-xl border border-slate-200/80">
              <button
                type="button"
                onClick={() => setTargetYearMonth(getPrevMonth(targetYearMonth))}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
                title={`前月 (${getPrevMonth(targetYearMonth)}) へ`}
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <div className="flex items-center gap-1.5 px-2.5 py-0.5">
                <CalendarDays className="w-4 h-4 text-indigo-600" />
                <span className="font-bold text-slate-700">点検対象年月:</span>
                <input
                  type="month"
                  value={targetYearMonth}
                  onChange={(e) => setTargetYearMonth(e.target.value)}
                  className="font-black text-indigo-900 bg-transparent border-none focus:outline-none cursor-pointer text-sm"
                />
              </div>
              <button
                type="button"
                onClick={() => setTargetYearMonth(getNextMonth(targetYearMonth))}
                className="p-1 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors cursor-pointer"
                title={`翌月 (${getNextMonth(targetYearMonth)}) へ`}
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* 自動保存・同期ステータスバッジ（クリックで詳細表示） */}
            <button
              type="button"
              onClick={() => setShowSyncInfoModal(true)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border font-medium text-[11px] transition-all cursor-pointer shadow-2xs ${
                saveStatus === 'saving'
                  ? 'bg-amber-50 text-amber-800 border-amber-300 ring-1 ring-amber-400/30'
                  : syncDestination === 'server'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100/80 ring-1 ring-emerald-400/20'
                  : 'bg-amber-50 text-amber-900 border-amber-300 hover:bg-amber-100 ring-1 ring-amber-400/40'
              }`}
              title="クリックして保存・同期の詳細を確認"
            >
              {saveStatus === 'saving' && (
                <>
                  <Loader2 className="w-3.5 h-3.5 text-amber-600 animate-spin" />
                  <span className="font-bold">自動保存中...</span>
                </>
              )}
              {saveStatus === 'saved' && syncDestination === 'server' && (
                <>
                  <Server className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="font-bold text-emerald-900">サーバー同期済 🟢</span>
                  <span className="text-emerald-700 font-normal hidden sm:inline">
                    {lastSavedTime && `(${lastSavedTime})`}
                  </span>
                </>
              )}
              {saveStatus === 'saved' && syncDestination === 'local_only' && (
                <>
                  <HardDrive className="w-3.5 h-3.5 text-amber-600" />
                  <span className="font-bold text-amber-900">ローカル保存中（サーバー未接続） 🟠</span>
                  <span className="text-amber-800 font-normal hidden sm:inline">
                    {lastSavedTime && `(${lastSavedTime})`}
                  </span>
                  <span className="px-1.5 py-0.5 bg-amber-200 text-amber-900 text-[10px] font-bold rounded">
                    ブラウザ内のみ
                  </span>
                </>
              )}
              {saveStatus === 'idle' && (
                <>
                  <Save className="w-3.5 h-3.5 text-slate-400" />
                  <span className="text-slate-500">変更時に自動保存</span>
                </>
              )}
              {saveStatus === 'error' && (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-rose-500" />
                  <span className="text-rose-600 font-bold">ローカルキャッシュのみ</span>
                </>
              )}
              <HelpCircle className="w-3.5 h-3.5 text-slate-400 ml-0.5" />
            </button>
          </div>

          {/* アクションボタン: 他月コピー & サーバー同期 & 下書きクリア */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => handleOpenCopyMonthModal()}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold rounded-xl transition-colors border border-indigo-200 cursor-pointer shadow-2xs"
              title="他月・前月の点検予定データをマスター情報（時間・メタデータ）付きで一括コピーします"
            >
              <Copy className="w-3.5 h-3.5 text-indigo-600" />
              <span>他月データからコピー</span>
            </button>
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              title="サーバーの最新の下書き配置データを取得して同期します"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-indigo-600' : 'text-slate-500'}`} />
              <span>最新を同期</span>
            </button>
            {items.length > 0 && (
              <button
                type="button"
                onClick={handleClearDraft}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 font-bold rounded-xl transition-colors border border-rose-200 cursor-pointer"
                title={`${targetYearMonth} の作業中データをリセットします`}
              >
                <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                <span>下書きクリア</span>
              </button>
            )}
          </div>
        </div>
      </div>

      {/* コピー完了・各種トースト通知 */}
      {copySuccessToast && (
        <div className="bg-emerald-600 text-white px-4 py-2.5 rounded-xl text-xs font-bold shadow-lg flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-200 shrink-0" />
            <span>{copySuccessToast}</span>
          </div>
          <button
            onClick={() => setCopySuccessToast(null)}
            className="text-emerald-200 hover:text-white p-0.5"
          >
            ✕
          </button>
        </div>
      )}

      {/* ローカル保存モード時の注意・案内バナー */}
      {syncDestination === 'local_only' && items.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-2xs animate-in fade-in slide-in-from-top-2">
          <div className="flex items-start sm:items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-amber-500 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
              <HardDrive className="w-5 h-5" />
            </div>
            <div>
              <div className="font-bold text-amber-950 text-sm flex items-center gap-2">
                <span>⚠️ 現在【このブラウザ内（ローカル）】にのみ下書きが保存されています</span>
                <span className="px-2 py-0.5 bg-amber-200 text-amber-900 rounded-full text-[10px] font-bold">
                  サーバー未同期
                </span>
              </div>
              <p className="text-amber-800 text-xs mt-0.5">
                自社サーバーのAPI（/api/inspection/drafts）が応答していないため、別PCやシークレットタブには共有されません。
                （ブラウザを閉じてもこのPCの同じブラウザでは作業継続可能です）
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
            <button
              type="button"
              onClick={handleManualSync}
              disabled={isSyncing}
              className="px-3 py-1.5 bg-white hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl font-bold transition-colors cursor-pointer flex items-center gap-1.5 shadow-2xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
              <span>サーバーへ再接続</span>
            </button>
            <button
              type="button"
              onClick={() => setShowSyncInfoModal(true)}
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold transition-colors cursor-pointer shadow-xs"
            >
              詳細・同期設定
            </button>
          </div>
        </div>
      )}

      {/* 繰越案件引き継ぎ通知バナー */}
      {carriedOverBanner && (
        <div className="bg-indigo-50 border border-indigo-200 rounded-2xl p-4 flex items-center justify-between gap-4 text-xs shadow-2xs animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-xs">
              <History className="w-5 h-5" />
            </div>
            <div>
              <div className="font-black text-indigo-950 text-sm flex items-center gap-2">
                前月（{carriedOverBanner.prevMonth}度）からの繰越案件を自動引き継ぎしました
                <span className="px-2 py-0.5 bg-indigo-200 text-indigo-900 rounded-full text-[11px] font-bold">
                  {carriedOverBanner.count}件
                </span>
              </div>
              <p className="text-xs text-indigo-700 mt-0.5">
                前月の点検調整で「翌月へ繰越」に設定された案件が、今月の未配置リストへ自動的に引き継がれました。
              </p>
            </div>
          </div>
          <button
            onClick={() => setCarriedOverBanner(null)}
            className="px-3 py-1.5 text-xs font-bold text-indigo-700 hover:bg-indigo-100 rounded-xl transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>
      )}

      {/* ==========================================
          STEP 1 & 2: EXCEL IMPORT & LIST VIEW
          ========================================== */}
      {currentStep === 'import' && (
        <div className="space-y-6">
          {items.length > 0 && (
            <div className="bg-emerald-50 border border-emerald-200 rounded-2xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
              <div className="flex items-center gap-3 text-left">
                <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-bold shrink-0 shadow-xs">
                  <CheckCircle2 className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="font-bold text-emerald-950 text-sm">
                    {targetYearMonth} の作業中データ（{items.length}件）が読み込まれています
                  </h4>
                  <p className="text-xs text-emerald-700 mt-0.5">
                    配置中: {placedItems.length}件 / 未配置: {pendingItems.length}件 / 繰越: {carriedOverItems.length}件
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCurrentStep('assign_date')}
                className="w-full sm:w-auto px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-200 flex items-center justify-center gap-2 transition-all cursor-pointer"
              >
                <span>日付配置画面を再開する</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* 取込カード */}
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm ring-1 ring-slate-900/5 flex flex-col items-center justify-center text-center space-y-4">
            <div className="flex items-center justify-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={handleLoadDemoData}
                className="flex items-center gap-2 px-4 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              >
                <Sparkles className="w-4 h-4 text-amber-600" />
                実フォーマットのデモデータ読込
              </button>
              <button
                type="button"
                onClick={() => handleOpenCopyMonthModal()}
                className="flex items-center gap-2 px-4 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              >
                <Copy className="w-4 h-4 text-indigo-600" />
                他月・前月データから一括コピー
              </button>
              <button
                type="button"
                onClick={() => generateSampleInspectionExcel(targetYearMonth)}
                className="flex items-center gap-2 px-4 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl text-xs font-bold transition-all shadow-2xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-indigo-600" />
                実フォーマットExcel(26列)をDL
              </button>
            </div>

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={handleDropFile}
              onClick={() => fileInputRef.current?.click()}
              className="w-full max-w-2xl border-2 border-dashed border-indigo-200 hover:border-indigo-500 bg-indigo-50/20 hover:bg-indigo-50/50 rounded-2xl p-8 flex flex-col items-center justify-center cursor-pointer transition-all group"
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx,.xls"
                className="hidden"
                onChange={(e) => {
                  if (e.target.files && e.target.files[0]) {
                    handleFileUpload(e.target.files[0]);
                  }
                }}
              />
              <div className="w-14 h-14 bg-indigo-100 text-indigo-600 rounded-2xl flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
                <Upload className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-slate-800">
                点検予定エクセルファイルをここにドラッグ＆ドロップ
              </p>
              <p className="text-xs text-slate-500 mt-1">
                またはクリックしてファイルを選択 (.xlsx / .xls) ── C1セル（またはヘッダー）から「点検月（2026/08等）」を自動認識します
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2 text-[11px] font-semibold text-slate-600 pt-2">
              <span className="px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200">現場名 → 件名</span>
              <span className="px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200">住所 → 場所</span>
              <span className="px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200">作業No・台数・客先規則・現場コード・作業名 → 内容</span>
              <span className="px-2.5 py-1 bg-slate-50 rounded-lg border border-slate-200">担当者名 → 保守メンバー自動マッチング</span>
            </div>
          </div>

          {/* 取り込み済みアイテム一覧プレビュー */}
          {items.length > 0 && (
            <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm ring-1 ring-slate-900/5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <FileCheck className="w-5 h-5 text-indigo-600" />
                    取り込み完了リスト ({items.length}件)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    「日付未定・メンバー未定・区分:点検」として読み込まれました。次へ進み日付を仮配置します。
                  </p>
                </div>

                <div className="flex items-center gap-3 flex-wrap">
                  <div className="relative">
                    <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      placeholder="一覧内を検索..."
                      value={step1Search}
                      onChange={(e) => setStep1Search(e.target.value)}
                      className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 w-48"
                    />
                  </div>

                  <div className="flex items-center gap-1 text-xs text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                    <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
                    点検月:
                    <input
                      type="month"
                      value={targetYearMonth}
                      onChange={(e) => setTargetYearMonth(e.target.value)}
                      className="font-bold text-slate-900 bg-transparent border-none focus:outline-none cursor-pointer"
                    />
                  </div>
                  <button
                    onClick={() => setCurrentStep('assign_date')}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap"
                  >
                    日付登録画面へ進む (Step 3)
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* プレビューテーブル */}
              <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[60vh] shadow-2xs">
                <table className="w-full min-w-[950px] text-left text-xs table-fixed">
                  <colgroup>
                    <col className="w-12" />
                    <col className="w-28" />
                    <col className="w-48" />
                    <col className="w-28" />
                    <col className="w-56" />
                    <col className="w-16" />
                    <col className="w-auto" />
                  </colgroup>
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3 whitespace-nowrap text-center">#</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">作業No</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">現場名 / コード</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-center">作業名 (区分)</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">地区 / 住所</th>
                      <th className="py-2.5 px-3 whitespace-nowrap text-center">台数</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">客先規則 / 注意事項</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800 bg-white">
                    {items
                      .filter((item) => {
                        if (!step1Search.trim()) return true;
                        const q = step1Search.toLowerCase();
                        return (
                          item.siteName.toLowerCase().includes(q) ||
                          item.jobNo.toLowerCase().includes(q) ||
                          item.address.toLowerCase().includes(q) ||
                          item.customerRules.toLowerCase().includes(q) ||
                          (item.siteCode ? item.siteCode.toLowerCase().includes(q) : false) ||
                          (item.workName ? item.workName.toLowerCase().includes(q) : false)
                        );
                      })
                      .map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-400 text-center whitespace-nowrap">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-600 whitespace-nowrap">{item.jobNo}</td>
                        <td className="py-2.5 px-3 min-w-0">
                          <div className="font-bold text-slate-900 truncate" title={item.siteName}>{item.siteName}</div>
                          {item.siteCode && (
                            <span className="text-[10px] text-slate-400 font-mono block">コード: {item.siteCode}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center whitespace-nowrap">
                          <span className={`px-2 py-0.5 rounded font-bold text-[11px] whitespace-nowrap inline-block ${
                            item.workName === '点検'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : item.workName === 'スポット'
                              ? 'bg-amber-50 text-amber-700 border border-amber-200'
                              : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          }`}>
                            {item.workName || '点検'}{item.workCategory ? ` (${item.workCategory})` : ''}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 min-w-0">
                          <div className="text-slate-800 font-medium truncate" title={item.address}>{item.address}</div>
                          {item.area && <div className="text-[10px] text-slate-400 truncate">{item.area}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold whitespace-nowrap">{item.quantity}</td>
                        <td className="py-2.5 px-3 min-w-0">
                          <div className="text-slate-600 truncate" title={item.customerRules}>{item.customerRules || '-'}</div>
                          {item.conditions && (
                            <div className="text-[10px] text-amber-700 truncate mt-0.5" title={item.conditions}>{item.conditions}</div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ==========================================
          STEP 3 & 4: DATE ASSIGNMENT (SPLIT D&D VIEW)
          ========================================== */}
      {currentStep === 'assign_date' && (
        <div className="space-y-4">
          {/* コントロールツールバー */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm ring-1 ring-slate-900/5 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-500">集計状況:</span>
              <span className="px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold border border-amber-200">
                未配置: {pendingItems.length}件
              </span>
              <span className="px-2.5 py-1 bg-emerald-100 text-emerald-800 rounded-lg text-xs font-bold border border-emerald-200">
                仮配置済み: {placedItems.length}件
              </span>
              {registeredItems.length > 0 && (
                <span className="px-2.5 py-1 bg-teal-50 text-teal-800 rounded-lg text-xs font-bold border border-teal-200 flex items-center gap-1">
                  <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                  確定済: {registeredItems.length}件
                </span>
              )}
              {carriedOverItems.length > 0 && (
                <span className="px-2.5 py-1 bg-indigo-100 text-indigo-800 rounded-lg text-xs font-bold border border-indigo-200">
                  翌月繰越: {carriedOverItems.length}件
                </span>
              )}
              {hiddenItems.length > 0 && (
                <span className="px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg text-xs font-bold border border-slate-200">
                  一時削除: {hiddenItems.length}件
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <button
                type="button"
                onClick={() => handleOpenCopyMonthModal()}
                className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-colors border border-indigo-200 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                title="他月・前月の点検データをマスター情報付きでコピー"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-600" />
                他月データからコピー
              </button>
              {pendingItems.some((i) => i.initialDate) && (
                <button
                  onClick={handleAutoPlaceFromExcelDates}
                  className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl transition-colors border border-indigo-200 flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  title="エクセルに記載された点検日に沿って仮配置します"
                >
                  <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                  エクセル記載日で一括仮配置
                </button>
              )}
              {pendingItems.length > 0 && (
                <>
                  <button
                    onClick={handleBatchCarryOver}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors border border-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    未配置を翌月へ繰越
                  </button>
                  <button
                    onClick={handleBatchHide}
                    className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors border border-slate-200 flex items-center gap-1.5 cursor-pointer"
                  >
                    <EyeOff className="w-3.5 h-3.5" />
                    未配置を一時削除
                  </button>
                </>
              )}
              <button
                disabled={placedItems.length === 0}
                onClick={() => setCurrentStep('assign_member')}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              >
                メンバー登録へ進む (Step 5)
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* 2カラムレイアウト: 左=リスト (開閉可能) / 右=横並び日付順カレンダー */}
          <div className="flex flex-col lg:flex-row gap-5 items-start">
            
            {/* 左カラム: 点検予定リスト (開閉可能) */}
            {isSidebarOpen ? (
              <div className="w-full lg:w-96 lg:shrink-0 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm ring-1 ring-slate-900/5 space-y-4 sticky top-20 max-h-[82vh] flex flex-col transition-all">
                <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                  <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                    <ClipboardList className="w-4 h-4 text-indigo-600" />
                    点検予定リスト
                  </h3>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                      {filteredListItems.length}件表示
                    </span>
                    <button
                      type="button"
                      onClick={() => setIsSidebarOpen(false)}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                      title="リストを閉じてカレンダーを全幅表示"
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* 検索 & フィルタタブ */}
                <div className="space-y-2">
                  <input
                    type="text"
                    placeholder="現場名・作業No・地区・住所・規則等で検索..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />

                  <div className="flex items-center gap-1 overflow-x-auto text-[11px] font-bold pb-1">
                    <button
                      onClick={() => setStatusFilter('pending')}
                      className={`px-2.5 py-1 rounded-lg border cursor-pointer whitespace-nowrap ${
                        statusFilter === 'pending' ? 'bg-amber-500 text-white border-amber-500 shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      未配置 ({pendingItems.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('placed')}
                      className={`px-2.5 py-1 rounded-lg border cursor-pointer whitespace-nowrap ${
                        statusFilter === 'placed' ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      仮配置中 ({placedItems.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('registered')}
                      className={`px-2.5 py-1 rounded-lg border cursor-pointer whitespace-nowrap flex items-center gap-1 ${
                        statusFilter === 'registered' ? 'bg-emerald-600 text-white border-emerald-600 shadow-xs' : 'bg-emerald-50 text-emerald-800 border-emerald-200 hover:bg-emerald-100'
                      }`}
                    >
                      <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                      確定済 ({registeredItems.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('carried_over')}
                      className={`px-2.5 py-1 rounded-lg border cursor-pointer whitespace-nowrap ${
                        statusFilter === 'carried_over' ? 'bg-purple-600 text-white border-purple-600 shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      繰越 ({carriedOverItems.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('hidden')}
                      className={`px-2.5 py-1 rounded-lg border cursor-pointer whitespace-nowrap ${
                        statusFilter === 'hidden' ? 'bg-slate-600 text-white border-slate-600 shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      削除 ({hiddenItems.length})
                    </button>
                    <button
                      onClick={() => setStatusFilter('all')}
                      className={`px-2.5 py-1 rounded-lg border cursor-pointer whitespace-nowrap ${
                        statusFilter === 'all' ? 'bg-slate-800 text-white border-slate-800 shadow-xs' : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      すべて ({items.length})
                    </button>
                  </div>
                </div>

                {/* ドラッグ可能なカード一覧 */}
                <div className="overflow-y-auto space-y-3 flex-1 pr-1">
                  {filteredListItems.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-xs">
                      該当する点検予定がありません
                    </div>
                  ) : (
                    filteredListItems.map((item) => {
                      const isSpot = item.workCategory === '2' || item.workName === 'スポット' || item.workName === 'スポット点検' || (item.workName ? item.workName.includes('スポット') : false);
                      return (
                      <div
                        key={item.id}
                        draggable={item.status === 'pending' || item.status === 'placed'}
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', item.id);
                          setDraggedItemId(item.id);
                        }}
                        onDragEnd={() => {
                          setDraggedItemId(null);
                          setDragOverDate(null);
                          setDragOverItemId(null);
                        }}
                        className={`p-3.5 rounded-xl border transition-all relative group cursor-grab active:cursor-grabbing ${
                          item.status === 'pending'
                            ? 'bg-white border-slate-200 hover:border-indigo-400 hover:shadow-sm'
                            : item.status === 'placed'
                            ? 'bg-emerald-50/40 border-emerald-300'
                            : item.status === 'carried_over'
                            ? 'bg-indigo-50/40 border-indigo-200 opacity-70'
                            : 'bg-slate-100 border-slate-200 opacity-50'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="w-full">
                            {/* 上段: 繰越バッジ ＆ 右上ステータスボタン/バッジ */}
                            <div className="flex items-center justify-between gap-1 mb-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {item.carriedOverFrom && (
                                  <span className="font-bold text-[10px] px-1.5 py-0.5 bg-indigo-100 text-indigo-800 rounded border border-indigo-200 inline-flex items-center gap-1">
                                    <History className="w-2.5 h-2.5" />
                                    前月({item.carriedOverFrom})より繰越
                                  </span>
                                )}
                              </div>

                              {/* 右上: 「なし」以外のステータスボタン（Fax/Mail/Tel）＆済切替ボタン（貼紙/作業届/WEB入力） */}
                              <div className="flex items-center gap-1 flex-wrap justify-end">
                                {/* Faxボタン (必要:赤 -> 送付済:黄 -> 確定済:緑) */}
                                {item.metaA?.faxStatus && item.metaA.faxStatus !== 'none' && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleCycleFaxStatus(item.id, e)}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-tighter cursor-pointer transition-all shadow-2xs ${
                                      item.metaA.faxStatus === 'required'
                                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                                        : item.metaA.faxStatus === 'sent'
                                        ? 'bg-amber-400 text-slate-950 font-black hover:bg-amber-500'
                                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    }`}
                                    title={`Fax: ${item.metaA.faxStatus === 'required' ? '必要(赤)' : item.metaA.faxStatus === 'sent' ? '送付済(黄)' : '確定済(緑)'} (クリックで切替)`}
                                  >
                                    Fax
                                  </button>
                                )}

                                {/* Mailボタン (必要:赤 -> 送付済:黄 -> 確定済:緑) */}
                                {item.metaA?.mailStatus && item.metaA.mailStatus !== 'none' && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleCycleMailStatus(item.id, e)}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-tighter cursor-pointer transition-all shadow-2xs ${
                                      item.metaA.mailStatus === 'required'
                                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                                        : item.metaA.mailStatus === 'sent'
                                        ? 'bg-amber-400 text-slate-950 font-black hover:bg-amber-500'
                                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    }`}
                                    title={`Mail: ${item.metaA.mailStatus === 'required' ? '必要(赤)' : item.metaA.mailStatus === 'sent' ? '送付済(黄)' : '確定済(緑)'} (クリックで切替)`}
                                  >
                                    Mail
                                  </button>
                                )}

                                {/* Telボタン (必要:赤 -> 確認済:緑) */}
                                {item.metaA?.telStatus && item.metaA.telStatus !== 'none' && (
                                  <button
                                    type="button"
                                    onClick={(e) => handleCycleTelStatus(item.id, e)}
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-tighter cursor-pointer transition-all shadow-2xs ${
                                      item.metaA.telStatus === 'required'
                                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                                        : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                    }`}
                                    title={`Tel: ${item.metaA.telStatus === 'required' ? '必要(赤)' : '確認済(緑)'} (クリックで切替)`}
                                  >
                                    Tel
                                  </button>
                                )}

                                {/* 貼紙ボタン (貼紙＋区分、クリックで未済:赤 ⇄ 済:濃い緑) */}
                                {item.metaA?.posterType && item.metaA.posterType !== 'none' && (() => {
                                  const pType = item.metaA.posterType;
                                  const label = pType === 'direct' ? '直接' : pType === 'mail' ? 'Mail' : pType === 'fax' ? 'Fax' : '郵送';
                                  const isDone = Boolean(item.metaA.posterDone);
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => handleTogglePosterDone(item.id, e)}
                                      className="inline-flex items-center rounded text-[9px] overflow-hidden border border-sky-300 shadow-2xs cursor-pointer select-none hover:opacity-90 transition-all"
                                      title={`貼紙${label}: ${isDone ? '済(濃緑)' : '未済(赤)'} (クリックで済/未済を切替)`}
                                    >
                                      <span className="px-1 py-0.5 bg-sky-100 text-sky-900 font-bold border-r border-sky-300">
                                        貼紙
                                      </span>
                                      <span className={`px-1.5 py-0.5 font-black transition-colors ${
                                        isDone ? 'bg-emerald-700 text-white' : 'bg-rose-600 text-white'
                                      }`}>
                                        {label}
                                      </span>
                                    </button>
                                  );
                                })()}

                                {/* 作業届ボタン (作業届＋区分、クリックで未済:赤 ⇄ 済:濃い緑) */}
                                {item.metaA?.workNoticeType && item.metaA.workNoticeType !== 'none' && (() => {
                                  const label = item.metaA.workNoticeType === 'mail' ? 'Mail' : 'Fax';
                                  const isDone = Boolean(item.metaA.workNoticeDone);
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => handleToggleWorkNoticeDone(item.id, e)}
                                      className="inline-flex items-center rounded text-[9px] overflow-hidden border border-indigo-300 shadow-2xs cursor-pointer select-none hover:opacity-90 transition-all"
                                      title={`作業届${label}: ${isDone ? '済(濃緑)' : '未済(赤)'} (クリックで済/未済を切替)`}
                                    >
                                      <span className="px-1 py-0.5 bg-indigo-100 text-indigo-900 font-bold border-r border-indigo-300">
                                        作業届
                                      </span>
                                      <span className={`px-1.5 py-0.5 font-black transition-colors ${
                                        isDone ? 'bg-emerald-700 text-white' : 'bg-rose-600 text-white'
                                      }`}>
                                        {label}
                                      </span>
                                    </button>
                                  );
                                })()}

                                {/* WEB入力ボタン (WEB＋入力、クリックで未済:赤 ⇄ 済:濃い緑) */}
                                {item.metaA?.webEntryType && item.metaA.webEntryType !== 'none' && (() => {
                                  const isDone = Boolean(item.metaA.webEntryDone);
                                  return (
                                    <button
                                      type="button"
                                      onClick={(e) => handleToggleWebEntryDone(item.id, e)}
                                      className="inline-flex items-center rounded text-[9px] overflow-hidden border border-purple-300 shadow-2xs cursor-pointer select-none hover:opacity-90 transition-all"
                                      title={`WEB入力: ${isDone ? '済(濃緑)' : '未済(赤)'} (クリックで済/未済を切替)`}
                                    >
                                      <span className="px-1 py-0.5 bg-purple-100 text-purple-900 font-bold border-r border-purple-300">
                                        WEB
                                      </span>
                                      <span className={`px-1.5 py-0.5 font-black transition-colors ${
                                        isDone ? 'bg-emerald-700 text-white' : 'bg-rose-600 text-white'
                                      }`}>
                                        入力
                                      </span>
                                    </button>
                                  );
                                })()}
                              </div>
                            </div>

                            <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                              {item.siteName}
                            </h4>
                            
                            {/* スポット点検（該当時のみ地区の左） ＆ 地区 ＆ 台数（右側） */}
                            <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap" title={`地区: ${item.area || '-'} / 住所: ${item.address || '-'}`}>
                              {isSpot && (
                                <span className="font-bold text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded shrink-0">
                                  スポット点検
                                </span>
                              )}
                              <span className="flex items-center gap-1 truncate font-medium text-slate-600">
                                <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                <span className="truncate">{item.area || item.address || '地区未定'}</span>
                              </span>
                              <span className="font-semibold text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100 shrink-0">
                                {item.quantity}台
                              </span>
                            </div>
                            {item.customerRules && (
                              <div
                                className="relative group/rule text-[10px] text-amber-800 bg-amber-50/90 border border-amber-200/80 px-1.5 py-0.5 rounded mt-1 truncate font-medium cursor-help"
                                title={`客先規則: ${item.customerRules}`}
                              >
                                <span className="font-bold text-amber-900">客先規則:</span> {item.customerRules}

                                {/* マウスホバーで全文表示する吹き出し */}
                                <div className="hidden group-hover/rule:block absolute bottom-full left-0 mb-1.5 z-30 w-64 max-w-xs p-2 bg-slate-900 text-white text-[11px] font-normal rounded-lg shadow-xl whitespace-normal break-words pointer-events-none animate-in fade-in zoom-in-95 duration-100">
                                  <div className="font-bold text-amber-300 text-[10px] mb-0.5 flex items-center gap-1">
                                    <span>客先規則（全文）</span>
                                  </div>
                                  {item.customerRules}
                                  <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-slate-900" />
                                </div>
                              </div>
                            )}

                            {/* 付箋風の備考欄 (客先規則の真下に重なるように配置・ホバーで全文表示) */}
                            <div className="mt-1 flex justify-end">
                              <div
                                onClick={(e) => handleOpenMetaModal(item, e)}
                                className="relative group/note w-full bg-amber-100 hover:bg-amber-200 text-amber-950 px-2 py-1 rounded-md border border-amber-300 shadow-2xs transform rotate-0.5 hover:rotate-0 transition-all cursor-pointer"
                                title={item.metaA?.remarks ? `備考: ${item.metaA.remarks}` : 'クリックして備考・全ステータス（Fax/Mail/Tell/貼紙/作業届/WEB入力）を変更'}
                              >
                                <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-900 leading-tight">
                                  <StickyNote className="w-3 h-3 text-amber-700 shrink-0" />
                                  <span className="truncate">
                                    {item.metaA?.remarks ? item.metaA.remarks : '＋ 備考・ステータス設定'}
                                  </span>
                                </div>

                                {/* マウスホバーで全文表示する吹き出し */}
                                {item.metaA?.remarks && (
                                  <div className="hidden group-hover/note:block absolute bottom-full right-0 mb-1.5 z-30 w-64 max-w-xs p-2.5 bg-amber-950 text-amber-50 text-[11px] font-normal rounded-lg shadow-xl whitespace-normal break-words pointer-events-none animate-in fade-in zoom-in-95 duration-100">
                                    <div className="font-bold text-amber-300 text-[10px] mb-1 flex items-center gap-1 border-b border-amber-800/80 pb-0.5">
                                      <StickyNote className="w-3 h-3 text-amber-400 shrink-0" />
                                      <span>備考メモ（全文）</span>
                                    </div>
                                    <div className="leading-relaxed whitespace-pre-wrap">{item.metaA.remarks}</div>
                                    <div className="absolute top-full right-6 -mt-1 border-4 border-transparent border-t-amber-950" />
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* アクションボタン */}
                        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold">
                          {item.status === 'pending' && (
                            <>
                              <button
                                onClick={() => {
                                  setManualModalItem(item);
                                  setManualDate(item.initialDate || `${targetYearMonth}-01`);
                                }}
                                className="text-indigo-600 hover:text-indigo-800 flex items-center gap-1 cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                                日時指定配置
                              </button>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleDuplicateItem(item)}
                                  className="text-indigo-600 hover:text-indigo-800 cursor-pointer flex items-center gap-0.5"
                                  title="この現場を複製（コピー）"
                                >
                                  <Copy className="w-2.5 h-2.5" />
                                  複製
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleCarryOverItem(item.id)}
                                  className="text-slate-500 hover:text-slate-800 cursor-pointer"
                                  title="翌月に繰り越す"
                                >
                                  翌月繰越
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleHideItem(item.id)}
                                  className="text-slate-400 hover:text-rose-600 cursor-pointer"
                                  title="一時削除する"
                                >
                                  削除
                                </button>
                              </div>
                            </>
                          )}

                          {item.status === 'placed' && (
                            <div className="w-full flex items-center justify-between gap-1 flex-wrap">
                              <span className="text-indigo-800 font-bold flex items-center gap-1 bg-indigo-50 px-2 py-0.5 rounded text-[11px] border border-indigo-100">
                                <CalendarIcon className="w-3 h-3 text-indigo-600" />
                                仮: {item.assignedDate?.slice(5)} ({item.assignedStartTime})
                              </span>
                              <button
                                onClick={() => handleRemoveFromCalendar(item.id)}
                                className="text-rose-600 hover:text-rose-800 cursor-pointer underline"
                              >
                                未配置に戻す
                              </button>
                            </div>
                          )}

                          {item.status === 'registered' && (
                            <div className="w-full flex items-center justify-between gap-1 flex-wrap">
                              <span className="text-emerald-900 font-bold flex items-center gap-1 bg-emerald-100 px-2 py-0.5 rounded text-[11px] border border-emerald-300">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                確定済: {item.assignedDate?.slice(5)} ({item.assignedStartTime})
                              </span>
                            </div>
                          )}

                          {(item.status === 'hidden' || item.status === 'carried_over') && (
                            <button
                              onClick={() => handleRestoreToPending(item.id)}
                              className="text-indigo-600 hover:text-indigo-800 cursor-pointer font-bold"
                            >
                              未配置リストに戻す
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })
                  )}
                </div>
              </div>
            ) : (
              /* 閉じている時の縦ストリップバー */
              <div className="w-12 shrink-0 bg-white rounded-2xl border border-slate-200 p-2 shadow-sm ring-1 ring-slate-900/5 flex flex-col items-center gap-4 sticky top-20 transition-all">
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="p-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-xl cursor-pointer transition-colors shadow-2xs"
                  title="点検予定リストを展開する"
                >
                  <ChevronRight className="w-5 h-5" />
                </button>
                <div
                  onClick={() => setIsSidebarOpen(true)}
                  className="cursor-pointer flex flex-col items-center gap-2 py-2 text-slate-600 hover:text-indigo-600 transition-colors"
                  title="クリックして点検予定リストを開く"
                >
                  <ClipboardList className="w-4 h-4 text-indigo-600" />
                  <span className="text-[11px] font-bold [writing-mode:vertical-rl] tracking-widest">
                    予定リスト ({pendingItems.length})
                  </span>
                </div>
                <span className="text-[10px] font-black text-amber-700 bg-amber-100 px-1.5 py-0.5 rounded-full">
                  {pendingItems.length}
                </span>
              </div>
            )}

            {/* 右カラム: カレンダー（日付は縦並び、予定は右側へ横並び追加） */}
            <div className="flex-1 min-w-0 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm ring-1 ring-slate-900/5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-3 border-b border-slate-100 gap-3">
                <div className="flex items-center gap-3">
                  {!isSidebarOpen && (
                    <button
                      type="button"
                      onClick={() => setIsSidebarOpen(true)}
                      className="px-2.5 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl flex items-center gap-1.5 border border-indigo-200 transition-colors cursor-pointer"
                      title="左側の点検予定リストを表示"
                    >
                      <ClipboardList className="w-3.5 h-3.5" />
                      リスト表示 ({pendingItems.length}件)
                    </button>
                  )}
                  <div>
                    <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                      <CalendarIcon className="w-5 h-5 text-indigo-600" />
                      {targetYearMonth}度 日付順カレンダー (仮配置・再配置ゾーン)
                    </h3>
                    <p className="text-xs text-slate-500 mt-0.5">
                      日付ごとに予定が右側へ横並びで配置されます。時間は<strong>すべて9:00スタート</strong>、時間バッジをクリックして<strong>30分刻みで直接変更</strong>できます。
                    </p>
                  </div>
                </div>

                {/* チェックマーク: 確定済みスケジュールの表示/非表示 */}
                <label
                  className="flex items-center gap-2 px-3 py-1.5 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl cursor-pointer select-none transition-colors text-xs font-bold text-slate-700 shrink-0 shadow-2xs"
                  title="チェックを外すと、確定済みの点検予定を非表示にして未確定の仮配置のみに絞り込めます"
                >
                  <input
                    type="checkbox"
                    checked={showRegisteredInCalendar}
                    onChange={(e) => setShowRegisteredInCalendar(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
                  />
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                    確定済み予定を表示 ({registeredItems.length}件)
                  </span>
                </label>
              </div>

              {/* 日付行リスト（日付は縦並び、予定は右側へ横並び追加） */}
              <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
                {monthDays.map((day) => {
                  const dayPlacedItems = items.filter(
                    (i) => i.status === 'placed' && i.assignedDate === day.dateKey
                  );
                  const dayRegisteredItems = showRegisteredInCalendar
                    ? items.filter(
                        (i) => i.status === 'registered' && i.assignedDate === day.dateKey
                      )
                    : [];

                  const isHovered = dragOverDate === day.dateKey;
                  const hasAnyItem = dayPlacedItems.length > 0 || dayRegisteredItems.length > 0;

                  return (
                    <div
                      key={day.dateKey}
                      onDragOver={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverDate(day.dateKey);
                      }}
                      onDragLeave={(e) => {
                        e.preventDefault();
                        if (dragOverDate === day.dateKey) {
                          setDragOverDate(null);
                        }
                      }}
                      onDrop={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setDragOverDate(null);
                        setDragOverItemId(null);
                        const itemId = e.dataTransfer.getData('text/plain') || draggedItemId;
                        if (itemId) {
                          handleAssignItemToDate(itemId, day.dateKey);
                        }
                      }}
                      className={`p-3 rounded-2xl border transition-all flex flex-col md:flex-row items-stretch gap-3 ${
                        isHovered
                          ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-300'
                          : day.isSunday
                          ? 'bg-rose-50/20 border-rose-200/80'
                          : day.isSaturday
                          ? 'bg-blue-50/20 border-blue-200/80'
                          : 'bg-slate-50/40 border-slate-200'
                      }`}
                    >
                      {/* 左側: 日付固定カラム */}
                      <div className="w-full md:w-36 md:shrink-0 flex md:flex-col items-center md:items-start justify-between md:justify-center gap-1.5 p-2 bg-white/80 rounded-xl border border-slate-200/80 shadow-2xs">
                        <span
                          className={`px-2.5 py-1 rounded-lg font-black text-xs w-full text-center ${
                            day.isSunday
                              ? 'bg-rose-500 text-white'
                              : day.isSaturday
                              ? 'bg-blue-500 text-white'
                              : 'bg-slate-800 text-white'
                          }`}
                        >
                          {day.monthNumber}/{day.dayNumber} ({day.dayOfWeekStr})
                        </span>

                        <div className="flex items-center gap-1 flex-wrap">
                          {dayPlacedItems.length > 0 && (
                            <span className="text-[11px] font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 px-1.5 py-0.5 rounded">
                              {dayPlacedItems.length}件 仮配置
                            </span>
                          )}
                          {dayRegisteredItems.length > 0 && (
                            <span className="px-1.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200/80 rounded text-[10px] font-bold flex items-center gap-1">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              {dayRegisteredItems.length}件 確定
                            </span>
                          )}
                          {!hasAnyItem && (
                            <span className="text-[10px] font-bold text-slate-400">
                              未配置
                            </span>
                          )}
                        </div>
                      </div>

                      {/* 右側: 予定カードの横並びゾーン (8/2 □ □ □ □ 折り返さず右に伸びてスクロール) */}
                      <div className="flex-1 min-w-0 flex items-stretch gap-2.5 min-h-[76px] p-2 bg-slate-50/60 rounded-xl border border-dashed border-slate-200/90 overflow-x-auto">
                        {!hasAnyItem ? (
                          <div className="w-full py-4 text-center text-xs text-slate-400 flex items-center justify-center gap-1.5 shrink-0">
                            <Plus className="w-3.5 h-3.5 text-slate-300" />
                            ドラッグしてここにドロップ (9:00〜仮配置)
                          </div>
                        ) : (
                          <>
                            {/* 1. 仮配置中の点検予定カード (横スクロール・横一列配置) */}
                            {dayPlacedItems.map((placed) => {
                              const isItemDragOver = dragOverItemId === placed.id;
                              const isEditingTime = editingTimeItemId === placed.id;
                              const isSpot = placed.workCategory === '2' || placed.workName === 'スポット' || placed.workName === 'スポット点検' || (placed.workName ? placed.workName.includes('スポット') : false);

                              return (
                                <div
                                  key={placed.id}
                                  draggable={true}
                                  onDragStart={(e) => {
                                    e.stopPropagation();
                                    e.dataTransfer.setData('text/plain', placed.id);
                                    setDraggedItemId(placed.id);
                                  }}
                                  onDragEnd={() => {
                                    setDraggedItemId(null);
                                    setDragOverDate(null);
                                    setDragOverItemId(null);
                                  }}
                                  onDragOver={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDragOverItemId(placed.id);
                                  }}
                                  onDragLeave={(e) => {
                                    e.preventDefault();
                                    if (dragOverItemId === placed.id) {
                                      setDragOverItemId(null);
                                    }
                                  }}
                                  onDrop={(e) => {
                                    e.preventDefault();
                                    e.stopPropagation();
                                    setDragOverDate(null);
                                    setDragOverItemId(null);
                                    const sourceItemId = e.dataTransfer.getData('text/plain') || draggedItemId;
                                    if (sourceItemId) {
                                      handleDropOnItem(sourceItemId, placed.id);
                                    }
                                  }}
                                  className={`w-72 shrink-0 p-3 bg-white rounded-xl border shadow-xs flex flex-col justify-between gap-2 transition-all cursor-grab active:cursor-grabbing group relative ${
                                    isItemDragOver
                                      ? 'border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/50'
                                      : 'border-emerald-200 hover:border-emerald-400 hover:shadow-sm'
                                  }`}
                                >
                                  {/* カード上部: 左上に時間変更ボタン ＆ 右上にステータスボタン群/解除ボタン */}
                                  <div>
                                    <div className="flex items-center justify-between gap-1 mb-1.5 relative">
                                      {/* 左上: 時間直接変更ボタン (30分刻み) */}
                                      <div className="relative">
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            setEditingTimeItemId(isEditingTime ? null : placed.id);
                                          }}
                                          className="px-2 py-0.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 text-xs font-mono font-bold rounded-lg border border-emerald-200 transition-colors cursor-pointer flex items-center gap-1 shadow-2xs"
                                          title="クリックして時間を直接変更 (30分刻み)"
                                        >
                                          <Clock className="w-3 h-3 text-emerald-600" />
                                          <span>{placed.assignedStartTime || '09:00'} - {placed.assignedEndTime || '10:00'}</span>
                                          <ChevronDown className="w-3 h-3 text-emerald-600" />
                                        </button>

                                        {/* 30分刻みの時間クイック選択ポップオーバー */}
                                        {isEditingTime && (
                                          <div
                                            onClick={(e) => e.stopPropagation()}
                                            className="absolute left-0 top-full mt-1.5 z-30 bg-white rounded-xl border border-slate-200 shadow-xl p-3 w-64 space-y-2 ring-1 ring-slate-900/10 text-xs animate-in fade-in zoom-in-95 duration-100"
                                          >
                                            <div className="flex items-center justify-between pb-1 border-b border-slate-100">
                                              <span className="font-bold text-slate-800 flex items-center gap-1">
                                                <Clock className="w-3.5 h-3.5 text-indigo-600" />
                                                時間変更 (30分刻み)
                                              </span>
                                              <button
                                                type="button"
                                                onClick={() => setEditingTimeItemId(null)}
                                                className="text-slate-400 hover:text-slate-600 text-xs font-bold px-1"
                                              >
                                                ✕
                                              </button>
                                            </div>

                                            <div className="grid grid-cols-2 gap-2">
                                              <div>
                                                <label className="text-[10px] font-bold text-slate-500 block mb-1">
                                                  開始時刻
                                                </label>
                                                <select
                                                  value={placed.assignedStartTime || '09:00'}
                                                  onChange={(e) => {
                                                    const newStart = e.target.value;
                                                    handleUpdateItemTime(placed.id, newStart);
                                                  }}
                                                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500"
                                                >
                                                  {TIME_OPTIONS_30MIN.map((t) => (
                                                    <option key={t} value={t}>
                                                      {t}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>

                                              <div>
                                                <label className="text-[10px] font-bold text-slate-500 block mb-1">
                                                  終了時刻
                                                </label>
                                                <select
                                                  value={placed.assignedEndTime || '10:00'}
                                                  onChange={(e) => {
                                                    const newEnd = e.target.value;
                                                    handleUpdateItemTime(placed.id, placed.assignedStartTime || '09:00', newEnd);
                                                  }}
                                                  className="w-full px-2 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold focus:ring-2 focus:ring-indigo-500"
                                                >
                                                  {TIME_OPTIONS_30MIN.map((t) => (
                                                    <option key={t} value={t}>
                                                      {t}
                                                    </option>
                                                  ))}
                                                </select>
                                              </div>
                                            </div>

                                            {/* クイックプリセットボタン */}
                                            <div className="pt-1 border-t border-slate-100 flex items-center justify-between gap-1 flex-wrap">
                                              {['09:00', '10:30', '13:00', '14:30', '16:00'].map((preset) => (
                                                <button
                                                  key={preset}
                                                  type="button"
                                                  onClick={() => {
                                                    handleUpdateItemTime(placed.id, preset);
                                                    setEditingTimeItemId(null);
                                                  }}
                                                  className="px-1.5 py-0.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 font-mono text-[10px] font-bold rounded text-slate-600 transition-colors"
                                                >
                                                  {preset}
                                                </button>
                                              ))}
                                            </div>
                                          </div>
                                        )}
                                      </div>

                                      <div className="flex items-center gap-1">
                                        {/* 右上: 「なし」以外のステータスボタン（Fax/Mail/Tel）＆済切替ボタン（貼紙/作業届/WEB入力） */}
                                        <div className="flex items-center gap-1 flex-wrap justify-end">
                                          {/* Faxボタン (必要:赤 -> 送付済:黄 -> 確定済:緑) */}
                                          {placed.metaA?.faxStatus && placed.metaA.faxStatus !== 'none' && (
                                            <button
                                              type="button"
                                              onClick={(e) => handleCycleFaxStatus(placed.id, e)}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-tighter cursor-pointer transition-all shadow-2xs ${
                                                placed.metaA.faxStatus === 'required'
                                                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                                                  : placed.metaA.faxStatus === 'sent'
                                                  ? 'bg-amber-400 text-slate-950 font-black hover:bg-amber-500'
                                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                              }`}
                                              title={`Fax: ${placed.metaA.faxStatus === 'required' ? '必要(赤)' : placed.metaA.faxStatus === 'sent' ? '送付済(黄)' : '確定済(緑)'} (クリックで切替)`}
                                            >
                                              Fax
                                            </button>
                                          )}

                                          {/* Mailボタン (必要:赤 -> 送付済:黄 -> 確定済:緑) */}
                                          {placed.metaA?.mailStatus && placed.metaA.mailStatus !== 'none' && (
                                            <button
                                              type="button"
                                              onClick={(e) => handleCycleMailStatus(placed.id, e)}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-tighter cursor-pointer transition-all shadow-2xs ${
                                                placed.metaA.mailStatus === 'required'
                                                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                                                  : placed.metaA.mailStatus === 'sent'
                                                  ? 'bg-amber-400 text-slate-950 font-black hover:bg-amber-500'
                                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                              }`}
                                              title={`Mail: ${placed.metaA.mailStatus === 'required' ? '必要(赤)' : '送付済(黄)'} (クリックで切替)`}
                                            >
                                              Mail
                                            </button>
                                          )}

                                          {/* Telボタン (必要:赤 -> 確認済:緑) */}
                                          {placed.metaA?.telStatus && placed.metaA.telStatus !== 'none' && (
                                            <button
                                              type="button"
                                              onClick={(e) => handleCycleTelStatus(placed.id, e)}
                                              className={`px-1.5 py-0.5 rounded text-[9px] font-black tracking-tighter cursor-pointer transition-all shadow-2xs ${
                                                placed.metaA.telStatus === 'required'
                                                  ? 'bg-rose-600 text-white hover:bg-rose-700'
                                                  : 'bg-emerald-600 text-white hover:bg-emerald-700'
                                              }`}
                                              title={`Tel: ${placed.metaA.telStatus === 'required' ? '必要(赤)' : '確認済(緑)'} (クリックで切替)`}
                                            >
                                              Tel
                                            </button>
                                          )}

                                          {/* 貼紙ボタン (貼紙＋区分、クリックで未済:赤 ⇄ 済:濃い緑) */}
                                          {placed.metaA?.posterType && placed.metaA.posterType !== 'none' && (() => {
                                            const pType = placed.metaA.posterType;
                                            const label = pType === 'direct' ? '直接' : pType === 'mail' ? 'Mail' : pType === 'fax' ? 'Fax' : '郵送';
                                            const isDone = Boolean(placed.metaA.posterDone);
                                            return (
                                              <button
                                                type="button"
                                                onClick={(e) => handleTogglePosterDone(placed.id, e)}
                                                className="inline-flex items-center rounded text-[9px] overflow-hidden border border-sky-300 shadow-2xs cursor-pointer select-none hover:opacity-90 transition-all"
                                                title={`貼紙${label}: ${isDone ? '済(濃緑)' : '未済(赤)'} (クリックで済/未済を切替)`}
                                              >
                                                <span className="px-1 py-0.5 bg-sky-100 text-sky-900 font-bold border-r border-sky-300">
                                                  貼紙
                                                </span>
                                                <span className={`px-1.5 py-0.5 font-black transition-colors ${
                                                  isDone ? 'bg-emerald-700 text-white' : 'bg-rose-600 text-white'
                                                }`}>
                                                  {label}
                                                </span>
                                              </button>
                                            );
                                          })()}

                                          {/* 作業届ボタン (作業届＋区分、クリックで未済:赤 ⇄ 済:濃い緑) */}
                                          {placed.metaA?.workNoticeType && placed.metaA.workNoticeType !== 'none' && (() => {
                                            const label = placed.metaA.workNoticeType === 'mail' ? 'Mail' : 'Fax';
                                            const isDone = Boolean(placed.metaA.workNoticeDone);
                                            return (
                                              <button
                                                type="button"
                                                onClick={(e) => handleToggleWorkNoticeDone(placed.id, e)}
                                                className="inline-flex items-center rounded text-[9px] overflow-hidden border border-indigo-300 shadow-2xs cursor-pointer select-none hover:opacity-90 transition-all"
                                                title={`作業届${label}: ${isDone ? '済(濃緑)' : '未済(赤)'} (クリックで済/未済を切替)`}
                                              >
                                                <span className="px-1 py-0.5 bg-indigo-100 text-indigo-900 font-bold border-r border-indigo-300">
                                                  作業届
                                                </span>
                                                <span className={`px-1.5 py-0.5 font-black transition-colors ${
                                                  isDone ? 'bg-emerald-700 text-white' : 'bg-rose-600 text-white'
                                                }`}>
                                                  {label}
                                                </span>
                                              </button>
                                            );
                                          })()}

                                          {/* WEB入力ボタン (WEB＋入力、クリックで未済:赤 ⇄ 済:濃い緑) */}
                                          {placed.metaA?.webEntryType && placed.metaA.webEntryType !== 'none' && (() => {
                                            const isDone = Boolean(placed.metaA.webEntryDone);
                                            return (
                                              <button
                                                type="button"
                                                onClick={(e) => handleToggleWebEntryDone(placed.id, e)}
                                                className="inline-flex items-center rounded text-[9px] overflow-hidden border border-purple-300 shadow-2xs cursor-pointer select-none hover:opacity-90 transition-all"
                                                title={`WEB入力: ${isDone ? '済(濃緑)' : '未済(赤)'} (クリックで済/未済を切替)`}
                                              >
                                                <span className="px-1 py-0.5 bg-purple-100 text-purple-900 font-bold border-r border-purple-300">
                                                  WEB
                                                </span>
                                                <span className={`px-1.5 py-0.5 font-black transition-colors ${
                                                  isDone ? 'bg-emerald-700 text-white' : 'bg-rose-600 text-white'
                                                }`}>
                                                  入力
                                                </span>
                                              </button>
                                            );
                                          })()}
                                        </div>

                                        {/* 現場カード複製ボタン */}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleDuplicateItem(placed);
                                          }}
                                          className="text-slate-300 hover:text-indigo-600 hover:bg-indigo-50 p-1 rounded-md transition-colors cursor-pointer ml-1"
                                          title="この現場カードを複製（コピー）"
                                        >
                                          <Copy className="w-3.5 h-3.5" />
                                        </button>

                                        {/* 未配置に戻すクイック解除ボタン */}
                                        <button
                                          type="button"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            handleRemoveFromCalendar(placed.id);
                                          }}
                                          className="text-slate-300 hover:text-rose-600 hover:bg-rose-50 p-1 rounded-md transition-colors cursor-pointer"
                                          title="未配置リストに戻す"
                                        >
                                          <RotateCcw className="w-3.5 h-3.5" />
                                        </button>
                                      </div>
                                    </div>

                                    {/* 現場名 */}
                                    <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors line-clamp-1">
                                      {placed.siteName}
                                    </h4>

                                    {/* スポット点検（該当時のみ地区の左） ＆ 地区 ＆ 台数（右側） */}
                                    <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap" title={`地区: ${placed.area || '-'} / 住所: ${placed.address || '-'}`}>
                                      {isSpot && (
                                        <span className="font-bold text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded shrink-0">
                                          スポット点検
                                        </span>
                                      )}
                                      <span className="flex items-center gap-1 truncate font-medium text-slate-600">
                                        <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                        <span className="truncate">{placed.area || placed.address || '地区未定'}</span>
                                      </span>
                                      <span className="font-semibold text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100 shrink-0">
                                        {placed.quantity}台
                                      </span>
                                    </div>

                                    {/* 客先規則 */}
                                    {placed.customerRules && (
                                      <div
                                        className="relative group/rule text-[10px] text-amber-800 bg-amber-50/90 border border-amber-200/80 px-1.5 py-0.5 rounded mt-1 truncate font-medium cursor-help"
                                        title={`客先規則: ${placed.customerRules}`}
                                      >
                                        <span className="font-bold text-amber-900">客先規則:</span> {placed.customerRules}

                                        {/* マウスホバーで全文表示する吹き出し */}
                                        <div className="hidden group-hover/rule:block absolute bottom-full left-0 mb-1.5 z-30 w-64 max-w-xs p-2 bg-slate-900 text-white text-[11px] font-normal rounded-lg shadow-xl whitespace-normal break-words pointer-events-none animate-in fade-in zoom-in-95 duration-100">
                                          <div className="font-bold text-amber-300 text-[10px] mb-0.5 flex items-center gap-1">
                                            <span>客先規則（全文）</span>
                                          </div>
                                          {placed.customerRules}
                                          <div className="absolute top-full left-4 -mt-1 border-4 border-transparent border-t-slate-900" />
                                        </div>
                                      </div>
                                    )}

                                    {/* 付箋風の備考欄 (客先規則の真下に重なるように配置・ホバーで全文表示) */}
                                    <div className="mt-1 flex justify-end">
                                      <div
                                        onClick={(e) => handleOpenMetaModal(placed, e)}
                                        className="relative group/note w-full bg-amber-100 hover:bg-amber-200 text-amber-950 px-2 py-1 rounded-md border border-amber-300 shadow-2xs transform rotate-0.5 hover:rotate-0 transition-all cursor-pointer"
                                        title={placed.metaA?.remarks ? `備考: ${placed.metaA.remarks}` : 'クリックして備考・全ステータス（Fax/Mail/Tell/貼紙/作業届/WEB入力）を変更'}
                                      >
                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-amber-900 leading-tight">
                                          <StickyNote className="w-3 h-3 text-amber-700 shrink-0" />
                                          <span className="truncate">
                                            {placed.metaA?.remarks ? placed.metaA.remarks : '＋ 備考・ステータス設定'}
                                          </span>
                                        </div>

                                        {/* マウスホバーで全文表示する吹き出し */}
                                        {placed.metaA?.remarks && (
                                          <div className="hidden group-hover/note:block absolute bottom-full right-0 mb-1.5 z-30 w-64 max-w-xs p-2.5 bg-amber-950 text-amber-50 text-[11px] font-normal rounded-lg shadow-xl whitespace-normal break-words pointer-events-none animate-in fade-in zoom-in-95 duration-100">
                                            <div className="font-bold text-amber-300 text-[10px] mb-1 flex items-center gap-1 border-b border-amber-800/80 pb-0.5">
                                              <StickyNote className="w-3 h-3 text-amber-400 shrink-0" />
                                              <span>備考メモ（全文）</span>
                                            </div>
                                            <div className="leading-relaxed whitespace-pre-wrap">{placed.metaA.remarks}</div>
                                            <div className="absolute top-full right-6 -mt-1 border-4 border-transparent border-t-amber-950" />
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>
                                </div>
                              );
                            })}

                            {/* 2. 確定済みの点検予定 (薄く表示・ロック状態・横スクロール) */}
                            {dayRegisteredItems.map((reg) => {
                              const isSpot = reg.workCategory === '2' || reg.workName === 'スポット' || reg.workName === 'スポット点検' || (reg.workName ? reg.workName.includes('スポット') : false);
                              return (
                              <div
                                key={reg.id}
                                className="w-72 shrink-0 p-3 bg-slate-100/80 border border-slate-200/90 rounded-xl shadow-2xs flex flex-col justify-between gap-2 opacity-65 hover:opacity-90 transition-opacity select-none"
                              >
                                <div>
                                  <div className="flex items-center justify-between gap-1 mb-1">
                                    <span className="px-2 py-0.5 bg-slate-200 text-slate-700 font-mono font-bold rounded text-xs flex items-center gap-1">
                                      <Lock className="w-3 h-3 text-slate-400" />
                                      {reg.assignedStartTime || '09:00'} - {reg.assignedEndTime || '10:00'}
                                    </span>
                                    <span className="px-1.5 py-0.5 bg-emerald-100 text-emerald-800 text-[10px] font-bold rounded flex items-center gap-1 border border-emerald-200">
                                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                      確定済
                                    </span>
                                  </div>

                                  <h4 className="text-xs font-semibold text-slate-800 line-clamp-1">
                                    {reg.siteName}
                                  </h4>
                                  <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-1.5 flex-wrap" title={`地区: ${reg.area || '-'} / 住所: ${reg.address || '-'}`}>
                                    {isSpot && (
                                      <span className="font-bold text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-900 border border-amber-300 rounded shrink-0">
                                        スポット点検
                                      </span>
                                    )}
                                    <span className="flex items-center gap-1 truncate font-medium text-slate-600">
                                      <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                                      <span className="truncate">{reg.area || reg.address || '地区未定'}</span>
                                    </span>
                                    <span className="font-semibold text-[10px] px-1.5 py-0.5 bg-slate-200 text-slate-700 rounded border border-slate-300 shrink-0">
                                      {reg.quantity}台
                                    </span>
                                  </div>
                                </div>

                                {reg.assignedUsers && reg.assignedUsers.length > 0 && (
                                  <div className="pt-2 border-t border-slate-200/60 flex items-center justify-end text-[10px] text-slate-600 truncate">
                                    担当: {reg.assignedUsers.map((u) => u.name).join(', ')}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          </>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          STEP 5: MEMBER ASSIGNMENT & FINAL SAVE
          ========================================== */}
      {currentStep === 'assign_member' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm ring-1 ring-slate-900/5 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <Users className="w-5 h-5 text-indigo-600" />
                  メンバー登録・確定画面 (Step 5)
                </h2>
                <span className="px-2.5 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold flex items-center gap-1">
                  <UserCheck className="w-3.5 h-3.5" />
                  部署「保守」メンバー表示
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                仮配置した {placedItems.length} 件の点検予定に担当メンバーを割り当ててカレンダーに確定反映します。
              </p>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setCurrentStep('assign_date')}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <ArrowLeft className="w-4 h-4" />
                日付登録に戻る
              </button>

              <button
                onClick={handleFinalConfirmRegistration}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md shadow-emerald-200 transition-all flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                カレンダーに確定登録する ({placedItems.length}件)
              </button>
            </div>
          </div>

          {/* 部署フィルター切り替えバー & 一括担当者設定ツールバー */}
          <div className="bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2 border-b border-indigo-100/70">
              <div className="flex items-center gap-2">
                <Filter className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-indigo-950">表示対象メンバー:</span>
                <span className="text-xs text-slate-600 font-semibold">
                  {onlyMaintenanceMembers ? `「保守」部署のみ (${selectableUsers.length}名)` : `全部署 (${selectableUsers.length}名)`}
                </span>
              </div>

              <div className="flex items-center gap-1 text-xs">
                <button
                  type="button"
                  onClick={() => setOnlyMaintenanceMembers(true)}
                  className={`px-2.5 py-1 rounded-lg border font-bold cursor-pointer transition-all ${
                    onlyMaintenanceMembers
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  ✓ 保守部署のみ
                </button>
                <button
                  type="button"
                  onClick={() => setOnlyMaintenanceMembers(false)}
                  className={`px-2.5 py-1 rounded-lg border font-bold cursor-pointer transition-all ${
                    !onlyMaintenanceMembers
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  全メンバー表示
                </button>
              </div>
            </div>

            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                <span className="text-xs font-bold text-indigo-900">
                  全配置予定への一括メンバー割り当て:
                </span>
              </div>

              <div className="flex items-center gap-2 flex-wrap">
                {selectableUsers.map((u) => {
                  const isSelected = batchUserIds.includes(u.id);
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => {
                        setBatchUserIds((prev) =>
                          prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                        );
                      }}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <img
                        src={getAvatarUrl(u.avatarUrl)}
                        alt={u.name}
                        className="w-4 h-4 rounded-full"
                      />
                      <span>{u.name}</span>
                      {u.division && (
                        <span className={`text-[10px] px-1 py-0.2 rounded font-normal ${
                          isSelected ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {u.division}
                        </span>
                      )}
                    </button>
                  );
                })}

                <button
                  type="button"
                  onClick={handleApplyBatchUsers}
                  disabled={batchUserIds.length === 0}
                  className="px-3 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-2xs cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ml-2"
                >
                  全予定に適用
                </button>
              </div>
            </div>
          </div>

          {/* 点検予定ごとのメンバー個別指定テーブル */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl max-h-[60vh] shadow-2xs">
            <table className="w-full min-w-[1000px] text-left text-xs table-fixed">
              <colgroup>
                <col className="w-32" />
                <col className="w-28" />
                <col className="w-52" />
                <col className="w-56" />
                <col className="w-auto" />
              </colgroup>
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3 whitespace-nowrap">日時</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">作業No</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">現場名 (台数・作業名)</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">地区 / 客先規則</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">カレンダー参加メンバー (保守)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800 bg-white">
                {placedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 font-bold whitespace-nowrap">
                      <div className="text-slate-900">{item.assignedDate}</div>
                      <div className="text-indigo-600 font-mono text-[11px]">
                        {item.assignedStartTime} - {item.assignedEndTime}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-700 whitespace-nowrap">{item.jobNo}</td>
                    <td className="py-3 px-3 min-w-0">
                      <div className="font-bold text-slate-900 truncate" title={item.siteName}>{item.siteName}</div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[10px] text-slate-500 font-semibold whitespace-nowrap">{item.quantity}台</span>
                        <span className={`text-[10px] px-1.5 py-0.2 rounded font-bold whitespace-nowrap inline-block ${
                          item.workName === '点検'
                            ? 'bg-blue-50 text-blue-700 border border-blue-200'
                            : item.workName === 'スポット'
                            ? 'bg-amber-50 text-amber-700 border border-amber-200'
                            : 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        }`}>
                          {item.workName || '点検'}
                        </span>
                      </div>
                    </td>
                    <td className="py-3 px-3 min-w-0">
                      <div className="text-slate-700 truncate font-medium" title={item.area ? `${item.area}${item.address ? ` (${item.address})` : ''}` : item.address}>{item.area || item.address || '-'}</div>
                      {item.customerRules && (
                        <div className="text-[10px] text-amber-800 bg-amber-50/80 px-1.5 py-0.5 rounded mt-0.5 truncate font-medium border border-amber-100" title={item.customerRules}>
                          規則: {item.customerRules}
                        </div>
                      )}
                    </td>
                    <td className="py-3 px-3 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {selectableUsers.map((u) => {
                          const isAssigned = (item.assignedUsers || []).some((au) => au.id === u.id);
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => handleToggleUserAssignment(item.id, u.id)}
                              className={`flex items-center gap-1 px-2 py-0.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                                isAssigned
                                  ? 'bg-emerald-600 text-white border-emerald-600'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              <img
                                src={getAvatarUrl(u.avatarUrl)}
                                alt={u.name}
                                className="w-3.5 h-3.5 rounded-full"
                              />
                              <span>{u.name}</span>
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==========================================
          STEP COMPLETED: SUCCESS SUMMARY
          ========================================== */}
      {currentStep === 'completed' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 shadow-sm ring-1 ring-slate-900/5 text-center space-y-6 max-w-xl mx-auto">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-inner">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div className="space-y-2">
            <h2 className="text-xl font-black text-slate-900">
              点検予定の確定登録が完了しました！
            </h2>
            <p className="text-xs text-slate-500">
              合計 <strong>{completedCount}件</strong> の点検スケジュールがカレンダーに既読状態で登録されました。
            </p>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs text-slate-600 space-y-1.5">
            <div className="flex items-center justify-between">
              <span>登録先年月:</span>
              <span className="font-bold text-slate-900">{targetYearMonth}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>今回確定登録分:</span>
              <span className="font-bold text-emerald-600">＋ {completedCount} 件</span>
            </div>
            <div className="flex items-center justify-between">
              <span>累計確定済件数:</span>
              <span className="font-bold text-slate-900">{registeredItems.length} 件</span>
            </div>
            <div className="flex items-center justify-between">
              <span>残りの未配置件数:</span>
              <span className="font-bold text-amber-600">{pendingItems.length} 件</span>
            </div>
            <div className="flex items-center justify-between">
              <span>翌月繰越件数:</span>
              <span className="font-bold text-slate-900">{carriedOverItems.length} 件</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
            {pendingItems.length > 0 && (
              <button
                onClick={() => setCurrentStep('assign_date')}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-200 transition-all cursor-pointer flex items-center gap-2"
              >
                <CalendarIcon className="w-4 h-4" />
                残りの点検（未配置 {pendingItems.length}件）の配置を続ける
              </button>
            )}
            {onNavigateToCalendar && (
              <button
                onClick={onNavigateToCalendar}
                className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-md shadow-emerald-200 transition-all cursor-pointer flex items-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                カレンダー画面で確認する
              </button>
            )}
            <button
              onClick={() => {
                setItems([]);
                setCurrentStep('import');
              }}
              className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              別のファイルを取り込む
            </button>
          </div>
        </div>
      )}

      {/* 手動日時指定モーダル */}
      {manualModalItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-slate-900">
              点検予定の日時指定配置
            </h3>
            <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg">
              <div className="font-bold text-slate-900">{manualModalItem.siteName}</div>
              <div className="text-[11px] text-slate-500">{manualModalItem.area || manualModalItem.address}</div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">配置日付</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">開始時刻</label>
                <input
                  type="time"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setManualModalItem(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  if (manualDate) {
                    handleAssignItemToDate(manualModalItem.id, manualDate);
                  }
                  setManualModalItem(null);
                }}
                className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer"
              >
                この日時で配置
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 同期ステータス・設定詳細モーダル */}
      {showSyncInfoModal && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className={`w-9 h-9 rounded-2xl flex items-center justify-center font-bold text-white shadow-xs ${
                  syncDestination === 'server' ? 'bg-emerald-600' : 'bg-amber-500'
                }`}>
                  {syncDestination === 'server' ? <Server className="w-5 h-5" /> : <HardDrive className="w-5 h-5" />}
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900">
                    下書きの保存・同期ステータス
                  </h3>
                  <p className="text-xs text-slate-500">
                    点検スケジューラーの自動保存先と同期状況
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowSyncInfoModal(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 現在の保存状態カード */}
            <div className={`p-4 rounded-2xl border ${
              syncDestination === 'server'
                ? 'bg-emerald-50/80 border-emerald-200 text-emerald-950'
                : 'bg-amber-50/80 border-amber-200 text-amber-950'
            }`}>
              <div className="flex items-center gap-2 font-bold text-sm">
                <span>現在の保存先:</span>
                <span className={`px-2.5 py-0.5 rounded-full text-xs font-black ${
                  syncDestination === 'server'
                    ? 'bg-emerald-600 text-white shadow-xs'
                    : 'bg-amber-500 text-white shadow-xs'
                }`}>
                  {syncDestination === 'server' ? '🟢 サーバー同期中（正常）' : '🟠 ブラウザ内ローカル保存（サーバー未接続）'}
                </span>
              </div>
              <p className="text-xs mt-2 leading-relaxed">
                {syncDestination === 'server' ? (
                  '自社サーバー（NAS/SQL）とリアルタイムに同期されています。他の管理者のPCや別ブラウザ、シークレットタブでも即座に同じ下書き作業を再開・共有できます。'
                ) : (
                  '自社サーバーのAPI（/api/inspection/drafts）が応答していないため、現在の作業内容は【このブラウザ内（localStorage）】にのみ保存されています。ブラウザを閉じてもこのPCの同じブラウザであれば復元されますが、別PCやシークレットタブには共有されません。'
                )}
              </p>
            </div>

            {/* 詳細プロパティ一覧 */}
            <div className="bg-slate-50 p-4 rounded-2xl border border-slate-200 space-y-2.5 text-xs text-slate-700">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">点検対象年月:</span>
                <span className="font-bold text-slate-900">{targetYearMonth}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">作業中案件数:</span>
                <span className="font-bold text-slate-900">
                  全 {items.length} 件（配置済: {placedItems.length}件 / 未配置: {pendingItems.length}件 / 繰越: {carriedOverItems.length}件）
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">最終保存時刻:</span>
                <span className="font-bold text-slate-900">{lastSavedTime || '未保存'}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">最終操作ユーザー:</span>
                <span className="font-bold text-slate-900">{currentUser.name}</span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-200/60">
                <span className="text-slate-500">APIエンドポイント:</span>
                <span className="font-mono text-[11px] text-slate-600 truncate max-w-[220px]">
                  {API_BASE_URL}/inspection/drafts
                </span>
              </div>
            </div>

            {/* ローカル保存時の解決手順案内 */}
            {syncDestination === 'local_only' && (
              <div className="bg-slate-900 text-slate-100 p-4 rounded-2xl text-xs space-y-2">
                <div className="font-bold text-amber-400 flex items-center gap-1.5">
                  <Info className="w-4 h-4" />
                  <span>サーバー同期を有効にする手順</span>
                </div>
                <ol className="list-decimal list-inside space-y-1 text-[11px] text-slate-300">
                  <li>メニューから <strong>「管理者パネル」</strong> ＞ <strong>「システム設定」</strong> を開く</li>
                  <li><strong>「server.js 推奨コード」</strong> タブで最新コードをコピー</li>
                  <li>サーバー（NAS / Windows Server）の <code>server.js</code> に貼り付けて Node.js を再起動</li>
                  <li>下の <strong>「サーバーへ再同期」</strong> ボタンを押す</li>
                </ol>
              </div>
            )}

            {/* アクションボタン */}
            <div className="flex items-center justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => setShowSyncInfoModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                閉じる
              </button>
              <button
                type="button"
                disabled={isSyncing || items.length === 0}
                onClick={async () => {
                  await loadDraftAndCarryOver(targetYearMonth, true);
                }}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-200 flex items-center gap-1.5 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                <span>今すぐサーバーへ再同期</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 備考・各種ステータス設定モーダル (付箋クリックで開く) */}
      {metaModalItem && metaDraft && (
        <div
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setMetaModalItem(null);
            }
          }}
          className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-50 flex items-center justify-center p-4"
        >
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150 border border-slate-200">
            {/* モーダルヘッダー */}
            <div className="flex items-start justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center font-bold shadow-xs">
                  <StickyNote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <span>現場備考・ステータス設定</span>
                    <span className="font-mono text-xs font-bold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                      {metaModalItem.jobNo}
                    </span>
                  </h3>
                  <p className="text-xs font-bold text-slate-600 truncate max-w-sm mt-0.5">
                    {metaModalItem.siteName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setMetaModalItem(null)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 設定フォーム */}
            <div className="space-y-4 text-xs max-h-[60vh] overflow-y-auto pr-1">
              {/* 1. 備考欄 (付箋に表示されるテキスト) */}
              <div>
                <label className="block font-bold text-slate-800 mb-1 flex items-center gap-1.5">
                  <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                  備考（カード右下の付箋に表示）
                </label>
                <textarea
                  rows={2}
                  value={metaDraft.remarks || ''}
                  onChange={(e) => setMetaDraft({ ...metaDraft, remarks: e.target.value })}
                  placeholder="備考を入力（例: 鍵預かり、管理人室へ、午前希望など）"
                  className="w-full px-3 py-2 bg-amber-50/40 border border-amber-200 rounded-xl text-slate-900 placeholder:text-slate-400 focus:ring-2 focus:ring-amber-500 focus:border-amber-500 font-medium"
                />
              </div>

              {/* 2. ステータスボタン系 (クリックで状態が変わる系) */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                  連絡・通知ステータス（右上ボタン表示）
                </div>

                {/* Faxステータス */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Printer className="w-3.5 h-3.5 text-slate-500" />
                    Faxステータス
                  </span>
                  <div className="flex items-center gap-1">
                    {[
                      { id: 'none', label: 'なし', bg: 'bg-slate-100 text-slate-600' },
                      { id: 'required', label: '必要', bg: 'bg-rose-600 text-white' },
                      { id: 'sent', label: '送付済', bg: 'bg-amber-400 text-slate-900 font-bold' },
                      { id: 'confirmed', label: '確定済', bg: 'bg-emerald-600 text-white' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMetaDraft({ ...metaDraft, faxStatus: opt.id as any })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          metaDraft.faxStatus === opt.id
                            ? `${opt.bg} ring-2 ring-indigo-500 shadow-xs`
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Mailステータス */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Mail className="w-3.5 h-3.5 text-slate-500" />
                    Mailステータス
                  </span>
                  <div className="flex items-center gap-1">
                    {[
                      { id: 'none', label: 'なし', bg: 'bg-slate-100 text-slate-600' },
                      { id: 'required', label: '必要', bg: 'bg-rose-600 text-white' },
                      { id: 'sent', label: '送付済', bg: 'bg-amber-400 text-slate-900 font-bold' },
                      { id: 'confirmed', label: '確定済', bg: 'bg-emerald-600 text-white' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMetaDraft({ ...metaDraft, mailStatus: opt.id as any })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          metaDraft.mailStatus === opt.id
                            ? `${opt.bg} ring-2 ring-indigo-500 shadow-xs`
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Telステータス */}
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-slate-800 flex items-center gap-1.5">
                    <Phone className="w-3.5 h-3.5 text-slate-500" />
                    Telステータス
                  </span>
                  <div className="flex items-center gap-1">
                    {[
                      { id: 'none', label: 'なし', bg: 'bg-slate-100 text-slate-600' },
                      { id: 'required', label: '必要', bg: 'bg-rose-600 text-white' },
                      { id: 'confirmed', label: '確認済', bg: 'bg-emerald-600 text-white' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setMetaDraft({ ...metaDraft, telStatus: opt.id as any })}
                        className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          metaDraft.telStatus === opt.id
                            ? `${opt.bg} ring-2 ring-indigo-500 shadow-xs`
                            : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* 3. 書類・手配バッジ系 (貼紙、作業届、WEB入力) */}
              <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200/80 space-y-3">
                <div className="font-bold text-slate-700 text-[11px] uppercase tracking-wider">
                  書類・手配区分（右上ボタン表示・「済」切替可能）
                </div>

                {/* 貼紙 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Send className="w-3.5 h-3.5 text-slate-500" />
                      貼紙手配
                    </span>
                    <div className="flex items-center gap-1 flex-wrap justify-end">
                      {[
                        { id: 'none', label: 'なし' },
                        { id: 'direct', label: '直接' },
                        { id: 'mail', label: 'Mail' },
                        { id: 'fax', label: 'Fax' },
                        { id: 'postal', label: '郵送' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMetaDraft({ ...metaDraft, posterType: opt.id as any })}
                          className={`px-2 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            metaDraft.posterType === opt.id
                              ? 'bg-sky-600 text-white shadow-xs'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {metaDraft.posterType !== 'none' && (
                    <div className="flex items-center justify-end gap-2 pr-1">
                      <span className="text-[11px] text-slate-500 font-bold">実行状態:</span>
                      <button
                        type="button"
                        onClick={() => setMetaDraft({ ...metaDraft, posterDone: !metaDraft.posterDone })}
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-black cursor-pointer transition-all ${
                          metaDraft.posterDone
                            ? 'bg-emerald-700 text-white ring-1 ring-emerald-800'
                            : 'bg-rose-600 text-white ring-1 ring-rose-700'
                        }`}
                      >
                        {metaDraft.posterDone ? '✓ 済（完了）' : '未済（要対応）'}
                      </button>
                    </div>
                  )}
                </div>

                {/* 作業届 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <FileCheck2 className="w-3.5 h-3.5 text-slate-500" />
                      作業届
                    </span>
                    <div className="flex items-center gap-1">
                      {[
                        { id: 'none', label: 'なし' },
                        { id: 'mail', label: 'Mail' },
                        { id: 'fax', label: 'Fax' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMetaDraft({ ...metaDraft, workNoticeType: opt.id as any })}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            metaDraft.workNoticeType === opt.id
                              ? 'bg-indigo-600 text-white shadow-xs'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {metaDraft.workNoticeType !== 'none' && (
                    <div className="flex items-center justify-end gap-2 pr-1">
                      <span className="text-[11px] text-slate-500 font-bold">実行状態:</span>
                      <button
                        type="button"
                        onClick={() => setMetaDraft({ ...metaDraft, workNoticeDone: !metaDraft.workNoticeDone })}
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-black cursor-pointer transition-all ${
                          metaDraft.workNoticeDone
                            ? 'bg-emerald-700 text-white ring-1 ring-emerald-800'
                            : 'bg-rose-600 text-white ring-1 ring-rose-700'
                        }`}
                      >
                        {metaDraft.workNoticeDone ? '✓ 済（完了）' : '未済（要対応）'}
                      </button>
                    </div>
                  )}
                </div>

                {/* WEB入力 */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-bold text-slate-800 flex items-center gap-1.5">
                      <Globe className="w-3.5 h-3.5 text-slate-500" />
                      WEB入力
                    </span>
                    <div className="flex items-center gap-1">
                      {[
                        { id: 'none', label: 'なし' },
                        { id: 'required', label: '必要' },
                      ].map((opt) => (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => setMetaDraft({ ...metaDraft, webEntryType: opt.id as any })}
                          className={`px-3 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                            metaDraft.webEntryType === opt.id
                              ? 'bg-purple-600 text-white shadow-xs'
                              : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </div>
                  {metaDraft.webEntryType !== 'none' && (
                    <div className="flex items-center justify-end gap-2 pr-1">
                      <span className="text-[11px] text-slate-500 font-bold">実行状態:</span>
                      <button
                        type="button"
                        onClick={() => setMetaDraft({ ...metaDraft, webEntryDone: !metaDraft.webEntryDone })}
                        className={`px-2.5 py-0.5 rounded-md text-[11px] font-black cursor-pointer transition-all ${
                          metaDraft.webEntryDone
                            ? 'bg-emerald-700 text-white ring-1 ring-emerald-800'
                            : 'bg-rose-600 text-white ring-1 ring-rose-700'
                        }`}
                      >
                        {metaDraft.webEntryDone ? '✓ 済（完了）' : '未済（要対応）'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* モーダルフッター */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setMetaModalItem(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSaveMetaModal}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-200 flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>設定を保存</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          他月の点検データから一括コピーモーダル
          ========================================== */}
      {showCopyMonthModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-xl w-full p-6 shadow-2xl space-y-5 border border-slate-200 max-h-[90vh] overflow-y-auto">
            {/* モーダルヘッダー */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold shrink-0">
                  <Copy className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    他月の点検データから一括コピー
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    過去月の点検予定・現場マスター（時間・書類手配区分）を引き継ぎ、{targetYearMonth} へ取り込みます
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCopyMonthModal(false)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 1. コピー元年月の指定 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                ① コピー元（過去・他月）の年月を選択
              </label>
              <div className="flex items-center gap-3 flex-wrap">
                <div className="flex items-center bg-slate-100 p-1.5 rounded-xl border border-slate-200">
                  <CalendarDays className="w-4 h-4 text-indigo-600 ml-1.5 mr-1" />
                  <input
                    type="month"
                    value={copySourceMonth}
                    onChange={(e) => setCopySourceMonth(e.target.value)}
                    className="font-bold text-slate-800 bg-transparent border-none focus:outline-none cursor-pointer text-sm"
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => setCopySourceMonth(getPrevMonth(targetYearMonth))}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-xs font-bold text-slate-600 transition-colors border border-slate-200"
                  >
                    前月 ({getPrevMonth(targetYearMonth)})
                  </button>
                  <button
                    type="button"
                    onClick={() => setCopySourceMonth('2026-07')}
                    className="px-2.5 py-1.5 bg-slate-100 hover:bg-indigo-50 hover:text-indigo-600 rounded-lg text-xs font-bold text-slate-600 transition-colors border border-slate-200"
                  >
                    2026-07 (デモ実績)
                  </button>
                </div>
              </div>

              {/* コピー元データ件数プレビュー */}
              <div className="pt-1">
                {copySourceLoading ? (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center gap-2 text-xs text-slate-500 font-medium">
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                    <span>{copySourceMonth} の点検データを検索中...</span>
                  </div>
                ) : copySourceItems.length > 0 ? (
                  <div className="p-3 bg-emerald-50 rounded-xl border border-emerald-200 flex items-center justify-between text-xs text-emerald-900 font-bold">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>{copySourceMonth} の点検データ: 合計 {copySourceItems.length} 件</span>
                    </div>
                    <div className="text-[11px] text-emerald-700 font-normal">
                      (仮配置済: {copySourceItems.filter((i) => i.status === 'placed').length}件 / 未配置: {copySourceItems.filter((i) => i.status === 'pending').length}件)
                    </div>
                  </div>
                ) : (
                  <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 flex items-center gap-2 text-xs text-amber-900 font-bold">
                    <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>{copySourceMonth} には保存済み点検データがありません。別の月を選択してください。</span>
                  </div>
                )}
              </div>
            </div>

            {/* 2. コピー後の配置方式 */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                ② コピー時の配置方法
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setCopyMode('unassigned')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    copyMode === 'unassigned'
                      ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/30'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                    <span>すべて未配置リストへ</span>
                    {copyMode === 'unassigned' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    全件を左側の「未配置リスト」に格納。今月の日程に合わせてD&Dで順次配置します。
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setCopyMode('same_day')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    copyMode === 'same_day'
                      ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/30'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                    <span>同日付けで仮配置</span>
                    {copyMode === 'same_day' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    元データで15日配置のものは当月15日へ自動仮配置（未配置のものは未配置のまま）。
                  </p>
                </button>
              </div>
            </div>

            {/* 3. 取り込み先（当月データ）の扱い */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                ③ 既存の {targetYearMonth} データとの統合方法
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setCopyStrategy('replace')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    copyStrategy === 'replace'
                      ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/30'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                    <span>当月データを上書き（クリア）</span>
                    {copyStrategy === 'replace' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    現在の {targetYearMonth} の下書きをリセットし、コピーしたデータで新規開始します（推奨）。
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setCopyStrategy('append')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    copyStrategy === 'append'
                      ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/30'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                    <span>現在のデータに追加</span>
                    {copyStrategy === 'append' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    既存の作業中データはそのまま残し、末尾にコピーした点検カードを追加します。
                  </p>
                </button>
              </div>
            </div>

            {/* 4. マスター引き継ぎルールの説明 */}
            <div className="bg-slate-50 p-3.5 rounded-2xl border border-slate-200 space-y-1.5 text-xs text-slate-600">
              <div className="font-bold text-slate-800 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
                <span>コピー時のマスター引き継ぎ・初期化ルール</span>
              </div>
              <ul className="list-disc list-inside space-y-1 pl-1 text-[11px] text-slate-600 leading-relaxed">
                <li>
                  <span className="font-bold text-slate-800">時間枠の引き継ぎ:</span> 初期値（09:00〜10:00）から変更された現場は、マスター記録のカスタム時間を引き継ぎます。デフォルトのままのデータは初期値で配置されます。
                </li>
                <li>
                  <span className="font-bold text-slate-800">書類・手配（貼紙・作業届・WEB入力・備考）:</span> 区分や種別はそのまま引き継がれますが、<span className="font-bold text-rose-700">「済フラグ」は全て未済（赤）にリセット</span>されます。
                </li>
                <li>
                  <span className="font-bold text-slate-800">Fax / Mail / Tel:</span> 過去に設定があった現場は「要対応（赤）」として引き継がれます。
                </li>
              </ul>
            </div>

            {/* モーダルフッター */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowCopyMonthModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                disabled={copySourceItems.length === 0 || copySourceLoading}
                onClick={handleExecuteCopyMonth}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-200 flex items-center gap-2"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>
                  {copySourceItems.length > 0
                    ? `${copySourceItems.length}件を ${targetYearMonth} へコピー`
                    : 'コピーを実行'}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ==========================================
          Excel取込時の確認・不一致・上書き選択モーダル
          ========================================== */}
      {pendingExcelImport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl space-y-5 border border-slate-200">
            {/* ヘッダー */}
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-3.5">
              <div className="flex items-center gap-3">
                <div className={`w-10 h-10 rounded-2xl flex items-center justify-center font-bold shrink-0 ${
                  pendingExcelImport.isMismatch ? 'bg-amber-100 text-amber-800' : 'bg-indigo-100 text-indigo-700'
                }`}>
                  {pendingExcelImport.isMismatch ? (
                    <AlertTriangle className="w-5 h-5 text-amber-600" />
                  ) : (
                    <FileSpreadsheet className="w-5 h-5 text-indigo-600" />
                  )}
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    {pendingExcelImport.isMismatch ? '点検年月の確認・取り込み設定' : 'エクセル取り込みの確認'}
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    ファイル: <span className="font-semibold text-slate-700">{pendingExcelImport.fileName}</span>（{pendingExcelImport.items.length}件）
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPendingExcelImport(null)}
                className="text-slate-400 hover:text-slate-700 p-1.5 rounded-xl hover:bg-slate-100 transition-colors cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* 不一致アラートバナー */}
            {pendingExcelImport.isMismatch && (
              <div className="bg-amber-50 border border-amber-300 rounded-2xl p-3.5 flex items-start gap-3 text-xs text-amber-900">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <div className="font-bold">
                    選択中の年月とエクセルの年月が一致していません
                  </div>
                  <div className="text-[11px] leading-relaxed text-amber-800">
                    現在画面で選択中: <span className="font-bold bg-amber-200/70 px-1 py-0.5 rounded">{targetYearMonth}</span>
                    <br />
                    エクセル内記載の年月: <span className="font-bold bg-amber-200/70 px-1 py-0.5 rounded">{pendingExcelImport.fileYearMonth}</span>
                  </div>
                </div>
              </div>
            )}

            {/* 1. 取り込み先年月の選択（不一致時） */}
            {pendingExcelImport.isMismatch && (
              <div className="space-y-2">
                <label className="text-xs font-bold text-slate-700 block">
                  ① どちらの年月に取り込みますか？
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setExcelImportTargetMonthChoice('excel_month')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      excelImportTargetMonthChoice === 'excel_month'
                        ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/30'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                      <span>エクセルの年月 ({pendingExcelImport.fileYearMonth})</span>
                      {excelImportTargetMonthChoice === 'excel_month' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      {pendingExcelImport.fileYearMonth} へ切り替えて取り込みます（推奨）
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setExcelImportTargetMonthChoice('current_selected')}
                    className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                      excelImportTargetMonthChoice === 'current_selected'
                        ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/30'
                        : 'bg-white border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                      <span>現在選択中 ({targetYearMonth})</span>
                      {excelImportTargetMonthChoice === 'current_selected' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1">
                      エクセルの月に関わらず、{targetYearMonth} のデータとして取り込みます
                    </p>
                  </button>
                </div>
              </div>
            )}

            {/* 2. 既存データとの統合方法（上書き or 追加） */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-slate-700 block">
                {pendingExcelImport.isMismatch ? '②' : '①'} 既存の点検データとの統合方法
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <button
                  type="button"
                  onClick={() => setExcelImportStrategyChoice('replace')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    excelImportStrategyChoice === 'replace'
                      ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/30'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                    <span>既存データを上書き（全置換）</span>
                    {excelImportStrategyChoice === 'replace' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    既存の下書きをクリアし、エクセルの{pendingExcelImport.items.length}件で新規開始します。
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setExcelImportStrategyChoice('append')}
                  className={`p-3 rounded-2xl border text-left transition-all cursor-pointer ${
                    excelImportStrategyChoice === 'append'
                      ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-400/30'
                      : 'bg-white border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  <div className="font-bold text-xs text-slate-900 flex items-center justify-between">
                    <span>現在のデータに追加（マージ）</span>
                    {excelImportStrategyChoice === 'append' && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1 leading-snug">
                    既存の作業中データをそのまま残し、末尾にエクセルの{pendingExcelImport.items.length}件を追加します。
                  </p>
                </button>
              </div>
            </div>

            {/* ボタン */}
            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setPendingExcelImport(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleConfirmExcelImport}
                className="px-5 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl transition-all cursor-pointer shadow-md shadow-indigo-200 flex items-center gap-2"
              >
                <Check className="w-4 h-4" />
                <span>
                  {excelImportTargetMonthChoice === 'excel_month'
                    ? `${pendingExcelImport.fileYearMonth} へ取り込み実行`
                    : `${targetYearMonth} へ取り込み実行`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
