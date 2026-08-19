import React, { useState, useRef } from 'react';
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
  GripVertical,
  CalendarDays,
  Filter
} from 'lucide-react';
import { User, CalendarEvent } from '../types';
import {
  InspectionItem,
  parseInspectionExcel,
  generateSampleInspectionExcel,
  generateDemoInspectionItems
} from '../utils/excelInspection';
import { getAvatarUrl } from '../utils/avatar';
import { markEventAsRead } from '../utils/notifications';

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

  // 検索・フィルター
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'placed' | 'hidden' | 'carried_over'>('pending');

  // メンバー登録時の部署フィルター（デフォルト：保守メンバーのみ）
  const [onlyMaintenanceMembers, setOnlyMaintenanceMembers] = useState<boolean>(true);

  // 日付移動用モーダル
  const [shiftDateModalItem, setShiftDateModalItem] = useState<InspectionItem | null>(null);
  const [newTargetDate, setNewTargetDate] = useState<string>('');

  // 日時指定手動モーダル
  const [manualModalItem, setManualModalItem] = useState<InspectionItem | null>(null);
  const [manualDate, setManualDate] = useState<string>('');
  const [manualTime, setManualTime] = useState<string>('09:00');

  // 一括担当者指定用
  const [batchUserIds, setBatchUserIds] = useState<string[]>([]);
  const [completedCount, setCompletedCount] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // ------------------------------------------
  // 指定日の配置アイテムの時間再計算ヘルパー (9:00から1時間刻み)
  // ------------------------------------------
  const recalculateTimesForDateList = (
    currentItems: InspectionItem[],
    dateKey: string,
    orderedSameDayItems?: InspectionItem[]
  ): InspectionItem[] => {
    const sameDay = orderedSameDayItems || currentItems.filter((i) => i.status === 'placed' && i.assignedDate === dateKey);
    const otherItems = currentItems.filter((i) => !(i.status === 'placed' && i.assignedDate === dateKey));

    const updatedSameDay = sameDay.map((item, idx) => {
      let startH = 9 + idx;
      if (startH >= 18) startH = 17; // 17時上限
      const startStr = `${String(startH).padStart(2, '0')}:00`;
      const endStr = `${String(startH + 1).padStart(2, '0')}:00`;
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
  // Excel ファイル読込処理
  // ------------------------------------------
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) return;

      const result = parseInspectionExcel(buffer, allUsers);
      if (result.error) {
        alert(result.error);
        return;
      }

      if (result.targetYearMonth) {
        setTargetYearMonth(result.targetYearMonth);
      }
      setItems(result.items);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleDropFile = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileUpload(e.dataTransfer.files[0]);
    }
  };

  // デモデータ読み込み (実データ形式)
  const handleLoadDemoData = () => {
    const demoItems = generateDemoInspectionItems(targetYearMonth, allUsers);
    setItems(demoItems);
  };

  // ------------------------------------------
  // ステータス・カウント集計
  // ------------------------------------------
  const pendingItems = items.filter((i) => i.status === 'pending');
  const placedItems = items.filter((i) => i.status === 'placed');
  const hiddenItems = items.filter((i) => i.status === 'hidden');
  const carriedOverItems = items.filter((i) => i.status === 'carried_over');

  // 表示フィルタリングアイテム
  const filteredListItems = items.filter((item) => {
    if (statusFilter !== 'all' && item.status !== statusFilter) return false;

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchSite = item.siteName.toLowerCase().includes(q);
      const matchAddr = item.address.toLowerCase().includes(q);
      const matchJob = item.jobNo.toLowerCase().includes(q);
      const matchRules = item.customerRules.toLowerCase().includes(q);
      const matchSiteCode = item.siteCode ? item.siteCode.toLowerCase().includes(q) : false;
      const matchPerson = item.excelPersonName ? item.excelPersonName.toLowerCase().includes(q) : false;
      return matchSite || matchAddr || matchJob || matchRules || matchSiteCode || matchPerson;
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

  // 確定登録（CalendarEventへ変換・反映）
  const handleFinalConfirmRegistration = () => {
    const itemsToRegister = items.filter((i) => i.status === 'placed' && i.assignedDate);
    if (itemsToRegister.length === 0) {
      alert('カレンダーに仮配置された点検予定がありません。');
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

      const newEvent: CalendarEvent = {
        id: `evt_insp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: `[点検] ${item.siteName}`,
        start: startIso,
        end: endIso,
        type: 'inspection',
        location: item.address,
        memo: memoLines.join('\n'),
        attendees: item.assignedUsers && item.assignedUsers.length > 0 ? item.assignedUsers : [currentUser],
        createdBy: currentUser,
        isGoogleSynced: false,
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
    setCompletedCount(createdEvents.length);
    setCurrentStep('completed');
  };

  return (
    <div className="w-full max-w-7xl mx-auto space-y-6 pb-12">
      {/* 画面ヘッダー */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm ring-1 ring-slate-900/5">
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
      </div>

      {/* ==========================================
          STEP 1 & 2: EXCEL IMPORT & LIST VIEW
          ========================================== */}
      {currentStep === 'import' && (
        <div className="space-y-6">
          {/* 取込カード */}
          <div className="bg-white rounded-2xl border border-slate-200 p-8 shadow-sm ring-1 ring-slate-900/5 flex flex-col items-center justify-center text-center space-y-4">
            <div className="flex items-center justify-center gap-3">
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

                <div className="flex items-center gap-3">
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
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-sm transition-all flex items-center gap-2 cursor-pointer"
                  >
                    日付登録画面へ進む (Step 3)
                    <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* プレビューテーブル */}
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0 z-10">
                    <tr>
                      <th className="py-2.5 px-3">#</th>
                      <th className="py-2.5 px-3">作業No</th>
                      <th className="py-2.5 px-3">現場コード / 現場名</th>
                      <th className="py-2.5 px-3">作業名 (区分)</th>
                      <th className="py-2.5 px-3">地区 / 住所</th>
                      <th className="py-2.5 px-3 text-center">台数</th>
                      <th className="py-2.5 px-3">客先規則 / 注意事項</th>
                      <th className="py-2.5 px-3">エクセル担当者</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {items.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">{item.jobNo}</td>
                        <td className="py-2.5 px-3">
                          <div className="font-bold text-slate-900">{item.siteName}</div>
                          {item.siteCode && (
                            <span className="text-[10px] text-slate-400 font-mono">コード: {item.siteCode}</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded font-semibold text-[11px]">
                            {item.workName || '点検'}{item.workCategory ? ` (${item.workCategory})` : ''}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          <div className="text-slate-800 font-medium max-w-xs truncate">{item.address}</div>
                          {item.area && <div className="text-[10px] text-slate-400">{item.area}</div>}
                        </td>
                        <td className="py-2.5 px-3 text-center font-bold">{item.quantity}</td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{item.customerRules}</td>
                        <td className="py-2.5 px-3">
                          {item.assignedUsers && item.assignedUsers.length > 0 ? (
                            <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full font-bold text-[10px]">
                              {item.assignedUsers.map((u) => u.name).join(', ')}
                            </span>
                          ) : item.excelPersonName ? (
                            <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px]">
                              {item.excelPersonName}
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[10px]">未割当</span>
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

          {/* 2カラムレイアウト: 左=リスト / 右=縦一列カレンダー */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
            
            {/* 左カラム: 点検予定リスト (4 cols) */}
            <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm ring-1 ring-slate-900/5 space-y-4 sticky top-20 max-h-[80vh] flex flex-col">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <ClipboardList className="w-4 h-4 text-indigo-600" />
                  点検予定リスト
                </h3>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
                  {filteredListItems.length}件表示
                </span>
              </div>

              {/* 検索 & フィルタタブ */}
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="現場名・作業No・住所・規則等で検索..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />

                <div className="flex items-center gap-1 overflow-x-auto text-[11px] font-bold pb-1">
                  <button
                    onClick={() => setStatusFilter('pending')}
                    className={`px-2.5 py-1 rounded-lg border cursor-pointer whitespace-nowrap ${
                      statusFilter === 'pending' ? 'bg-amber-500 text-white border-amber-500' : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    未配置 ({pendingItems.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('placed')}
                    className={`px-2.5 py-1 rounded-lg border cursor-pointer whitespace-nowrap ${
                      statusFilter === 'placed' ? 'bg-emerald-600 text-white border-emerald-600' : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    仮配置 ({placedItems.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('carried_over')}
                    className={`px-2.5 py-1 rounded-lg border cursor-pointer whitespace-nowrap ${
                      statusFilter === 'carried_over' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    繰越 ({carriedOverItems.length})
                  </button>
                  <button
                    onClick={() => setStatusFilter('hidden')}
                    className={`px-2.5 py-1 rounded-lg border cursor-pointer whitespace-nowrap ${
                      statusFilter === 'hidden' ? 'bg-slate-600 text-white border-slate-600' : 'bg-slate-50 text-slate-600 border-slate-200'
                    }`}
                  >
                    削除 ({hiddenItems.length})
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
                  filteredListItems.map((item) => (
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
                          <div className="flex items-center gap-1.5 mb-1 flex-wrap">
                            <span className="font-mono text-[10px] font-black px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                              {item.jobNo}
                            </span>
                            <span className="font-semibold text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100">
                              {item.quantity}台
                            </span>
                            {item.workName && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">
                                {item.workName}
                              </span>
                            )}
                            {item.excelPersonName && (
                              <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100">
                                担当: {item.excelPersonName}
                              </span>
                            )}
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {item.siteName}
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{item.address}</span>
                          </p>
                          {item.customerRules && (
                            <p className="text-[10px] text-amber-700 bg-amber-50/60 px-1.5 py-0.5 rounded mt-1 truncate">
                              規則: {item.customerRules}
                            </p>
                          )}
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
                                onClick={() => handleCarryOverItem(item.id)}
                                className="text-slate-500 hover:text-slate-800 cursor-pointer"
                                title="翌月に繰り越す"
                              >
                                翌月繰越
                              </button>
                              <button
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
                            <button
                              onClick={() => {
                                setShiftDateModalItem(item);
                                setNewTargetDate(item.assignedDate || `${targetYearMonth}-01`);
                              }}
                              className="text-emerald-800 hover:text-emerald-950 font-bold flex items-center gap-1 cursor-pointer bg-emerald-100/70 hover:bg-emerald-200 px-1.5 py-0.5 rounded"
                              title="日付を変更する"
                            >
                              <CalendarDays className="w-3 h-3" />
                              {item.assignedDate?.slice(5)} ({item.assignedStartTime})
                            </button>
                            <button
                              onClick={() => handleRemoveFromCalendar(item.id)}
                              className="text-rose-600 hover:text-rose-800 cursor-pointer underline"
                            >
                              リストに戻す
                            </button>
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
                  ))
                )}
              </div>
            </div>

            {/* 右カラム: カレンダー（縦一列・日付順） (8 cols) */}
            <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200 p-4 shadow-sm ring-1 ring-slate-900/5 space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div>
                  <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5 text-indigo-600" />
                    {targetYearMonth}度 日付順カレンダー (仮配置・再配置ゾーン)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    左リストからドロップして新規配置。配置後も<strong>「別日付へのD&D移動」</strong>や<strong>「▲▼ボタン・D&Dでの順序入れ替え（時間の自動調整）」</strong>が可能です。
                  </p>
                </div>
              </div>

              {/* 縦一列の日付ブロック */}
              <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
                {monthDays.map((day) => {
                  const dayPlacedItems = items.filter(
                    (i) => i.status === 'placed' && i.assignedDate === day.dateKey
                  );

                  const isHovered = dragOverDate === day.dateKey;

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
                      className={`p-3.5 rounded-2xl border transition-all ${
                        isHovered
                          ? 'bg-indigo-50 border-indigo-400 ring-2 ring-indigo-300'
                          : day.isSunday
                          ? 'bg-rose-50/20 border-rose-200/80'
                          : day.isSaturday
                          ? 'bg-blue-50/20 border-blue-200/80'
                          : 'bg-slate-50/50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between pb-2 border-b border-slate-200/60">
                        <div className="flex items-center gap-2">
                          <span
                            className={`px-2.5 py-0.5 rounded-lg font-black text-xs ${
                              day.isSunday
                                ? 'bg-rose-500 text-white'
                                : day.isSaturday
                                ? 'bg-blue-500 text-white'
                                : 'bg-slate-800 text-white'
                            }`}
                          >
                            {day.monthNumber}/{day.dayNumber} ({day.dayOfWeekStr})
                          </span>

                          <span className="text-xs font-bold text-slate-500">
                            {dayPlacedItems.length > 0 ? `${dayPlacedItems.length}件 配置済み` : '未配置'}
                          </span>
                        </div>

                        <span className="text-[10px] text-slate-400 font-bold">
                          D&Dドロップ領域 (別日付からの移動も可能)
                        </span>
                      </div>

                      {/* 配置済みアイテム一覧 */}
                      <div className="mt-2.5 space-y-2">
                        {dayPlacedItems.length === 0 ? (
                          <div className="py-2 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                            ドラッグしてここにドロップ (9:00〜仮配置)
                          </div>
                        ) : (
                          dayPlacedItems.map((placed, idx) => {
                            const isItemDragOver = dragOverItemId === placed.id;

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
                                className={`p-3 bg-white rounded-xl border shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2 transition-all cursor-grab active:cursor-grabbing group ${
                                  isItemDragOver
                                    ? 'border-indigo-500 ring-2 ring-indigo-200 bg-indigo-50/50'
                                    : 'border-emerald-200 hover:border-emerald-400'
                                }`}
                              >
                                <div className="flex items-center gap-2.5 flex-1 min-w-0">
                                  {/* ドラッグハンドル */}
                                  <div className="text-slate-300 group-hover:text-slate-500 cursor-grab shrink-0" title="ドラッグして順序や日付を変更">
                                    <GripVertical className="w-4 h-4" />
                                  </div>

                                  {/* 時間バッジ */}
                                  <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-xs font-mono font-black rounded-lg shrink-0">
                                    {placed.assignedStartTime} - {placed.assignedEndTime}
                                  </span>

                                  {/* 現場名・情報 */}
                                  <div className="min-w-0 flex-1">
                                    <div className="text-xs font-bold text-slate-900 flex items-center gap-2 flex-wrap">
                                      <span className="truncate">{placed.siteName}</span>
                                      <span className="text-[10px] font-mono text-slate-500">({placed.jobNo})</span>
                                      <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded shrink-0">
                                        {placed.quantity}台
                                      </span>
                                      {placed.workName && (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded shrink-0">
                                          {placed.workName}
                                        </span>
                                      )}
                                      {placed.excelPersonName && (
                                        <span className="text-[10px] px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded border border-blue-100 shrink-0">
                                          担当: {placed.excelPersonName}
                                        </span>
                                      )}
                                    </div>
                                    <div className="text-[11px] text-slate-500 truncate mt-0.5">
                                      {placed.address}
                                    </div>
                                  </div>
                                </div>

                                {/* 操作ボタングループ (順序変更 ▲▼, 日付変更, リストに戻す) */}
                                <div className="flex items-center gap-1.5 self-end sm:self-center shrink-0">
                                  {/* 順序変更ボタン (▲ / ▼) */}
                                  <div className="flex items-center bg-slate-100 rounded-lg p-0.5 border border-slate-200">
                                    <button
                                      type="button"
                                      disabled={idx === 0}
                                      onClick={() => handleMoveItemOrder(placed.id, 'up')}
                                      className="p-1 hover:bg-white text-slate-600 hover:text-indigo-600 rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                                      title="時間を1つ繰り上げ（前へ移動）"
                                    >
                                      <ChevronUp className="w-3.5 h-3.5" />
                                    </button>
                                    <button
                                      type="button"
                                      disabled={idx === dayPlacedItems.length - 1}
                                      onClick={() => handleMoveItemOrder(placed.id, 'down')}
                                      className="p-1 hover:bg-white text-slate-600 hover:text-indigo-600 rounded disabled:opacity-30 disabled:hover:bg-transparent cursor-pointer transition-colors"
                                      title="時間を1つ繰り下げ（後ろへ移動）"
                                    >
                                      <ChevronDown className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

                                  {/* 日付変更ボタン */}
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setShiftDateModalItem(placed);
                                      setNewTargetDate(placed.assignedDate || day.dateKey);
                                    }}
                                    className="px-2 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 border border-indigo-200 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                                    title="別の日付へ変更"
                                  >
                                    <CalendarDays className="w-3 h-3" />
                                    日付変更
                                  </button>

                                  {/* リストに戻す */}
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveFromCalendar(placed.id)}
                                    className="px-2 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                                  >
                                    リストに戻す
                                  </button>
                                </div>
                              </div>
                            );
                          })
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
          <div className="overflow-x-auto max-h-[60vh]">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold sticky top-0 z-10">
                <tr>
                  <th className="py-2.5 px-3">日時</th>
                  <th className="py-2.5 px-3">作業No</th>
                  <th className="py-2.5 px-3">現場名</th>
                  <th className="py-2.5 px-3">場所 / 規則</th>
                  <th className="py-2.5 px-3">エクセル担当者</th>
                  <th className="py-2.5 px-3">カレンダー参加メンバー (保守)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-800">
                {placedItems.map((item) => (
                  <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-3 font-bold whitespace-nowrap">
                      <div className="text-slate-900">{item.assignedDate}</div>
                      <div className="text-indigo-600 font-mono text-[11px]">
                        {item.assignedStartTime} - {item.assignedEndTime}
                      </div>
                    </td>
                    <td className="py-3 px-3 font-mono font-bold text-slate-700">{item.jobNo}</td>
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{item.siteName}</div>
                      <div className="text-[11px] text-slate-500 font-semibold">{item.quantity}台</div>
                    </td>
                    <td className="py-3 px-3 max-w-xs">
                      <div className="text-slate-700 truncate">{item.address}</div>
                      <div className="text-[10px] text-amber-700 truncate">{item.customerRules}</div>
                    </td>
                    <td className="py-3 px-3">
                      {item.excelPersonName ? (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded-full text-[10px] font-semibold">
                          {item.excelPersonName}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">-</span>
                      )}
                    </td>
                    <td className="py-3 px-3">
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

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-left text-xs text-slate-600 space-y-1">
            <div className="flex items-center justify-between">
              <span>登録先年月:</span>
              <span className="font-bold text-slate-900">{targetYearMonth}</span>
            </div>
            <div className="flex items-center justify-between">
              <span>スケジュール区分:</span>
              <span className="font-bold text-indigo-600">点検</span>
            </div>
            <div className="flex items-center justify-between">
              <span>翌月繰越件数:</span>
              <span className="font-bold text-slate-900">{carriedOverItems.length}件</span>
            </div>
          </div>

          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              onClick={() => {
                setItems([]);
                setCurrentStep('import');
              }}
              className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer"
            >
              続けて別のファイルを取り込む
            </button>
            {onNavigateToCalendar && (
              <button
                onClick={onNavigateToCalendar}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-sm transition-all cursor-pointer flex items-center gap-2"
              >
                <CalendarIcon className="w-4 h-4" />
                カレンダー画面で確認する
              </button>
            )}
          </div>
        </div>
      )}

      {/* 日付変更モーダル */}
      {shiftDateModalItem && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 max-w-sm w-full shadow-2xl space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              <CalendarDays className="w-4 h-4 text-indigo-600" />
              点検日の変更
            </h3>
            <div className="text-xs text-slate-600 bg-slate-50 p-2.5 rounded-lg">
              <div className="font-bold text-slate-900">{shiftDateModalItem.siteName}</div>
              <div className="text-[11px] text-slate-500">{shiftDateModalItem.address}</div>
              <div className="text-[11px] font-mono text-indigo-600 mt-1">
                現在の日時: {shiftDateModalItem.assignedDate} ({shiftDateModalItem.assignedStartTime} - {shiftDateModalItem.assignedEndTime})
              </div>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">新しい配置日</label>
                <input
                  type="date"
                  value={newTargetDate}
                  onChange={(e) => setNewTargetDate(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800"
                />
              </div>
              <p className="text-[11px] text-slate-500">
                ※移動先の日付の末尾に追加され、9:00からの時間枠が自動計算されます。
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShiftDateModalItem(null)}
                className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  if (newTargetDate && newTargetDate !== shiftDateModalItem.assignedDate) {
                    handleAssignItemToDate(shiftDateModalItem.id, newTargetDate);
                  }
                  setShiftDateModalItem(null);
                }}
                className="px-4 py-1.5 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg cursor-pointer"
              >
                日付を変更
              </button>
            </div>
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
              <div className="text-[11px] text-slate-500">{manualModalItem.address}</div>
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
    </div>
  );
}
