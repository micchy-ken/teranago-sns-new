import React, { useState, useRef } from 'react';
import { 
  FileSpreadsheet, 
  Upload, 
  Download, 
  Calendar as CalendarIcon, 
  Clock, 
  Users, 
  CheckCircle2, 
  ArrowRight, 
  ArrowLeft, 
  RefreshCw, 
  Search, 
  Trash2, 
  EyeOff, 
  ChevronRight, 
  Sparkles, 
  Building2, 
  MapPin, 
  ClipboardList, 
  Tag, 
  Plus, 
  X, 
  HelpCircle,
  FileCheck,
  Check,
  ArrowUpRight,
  Filter,
  UserCheck
} from 'lucide-react';
import { User, CalendarEvent } from '../types';
import { 
  InspectionItem, 
  parseInspectionExcel, 
  generateSampleInspectionExcel, 
  generateDemoInspectionItems 
} from '../utils/excelInspection';
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

  // Excel / アイテム状態
  const [targetYearMonth, setTargetYearMonth] = useState<string>('2026-09');
  const [items, setItems] = useState<InspectionItem[]>([]);
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);
  const [draggedItemId, setDraggedItemId] = useState<string | null>(null);

  // 検索・フィルター
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'placed' | 'hidden' | 'carried_over'>('pending');

  // 日付一括設定用モーダル
  const [manualModalItem, setManualModalItem] = useState<InspectionItem | null>(null);
  const [manualDate, setManualDate] = useState<string>('');
  const [manualTime, setManualTime] = useState<string>('09:00');

  // 一括担当者指定用
  const [batchUserIds, setBatchUserIds] = useState<string[]>([]);
  const [completedCount, setCompletedCount] = useState<number>(0);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
  // Excel ファイル読込処理
  // ------------------------------------------
  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const buffer = e.target?.result as ArrayBuffer;
      if (!buffer) return;

      const result = parseInspectionExcel(buffer);
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

  // デモデータ読み込み
  const handleLoadDemoData = () => {
    const demoItems = generateDemoInspectionItems(targetYearMonth);
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
      return matchSite || matchAddr || matchJob || matchRules;
    }
    return true;
  });

  // ------------------------------------------
  // D&D & 日付配置ロジック
  // ------------------------------------------
  const handleAssignItemToDate = (itemId: string, dateKey: string, customTime?: string) => {
    // 同一日に既に配置されている件数をカウントして時間を自動連番化
    const existingSameDayItems = items.filter((i) => i.assignedDate === dateKey && i.id !== itemId);
    const orderIndex = existingSameDayItems.length;

    // デフォルト: 9:00開始、1時間刻み
    let startTime = '09:00';
    let endTime = '10:00';

    if (customTime) {
      startTime = customTime;
      const [h, m] = customTime.split(':').map(Number);
      const endH = (h + 1).toString().padStart(2, '0');
      endTime = `${endH}:${String(m).padStart(2, '0')}`;
    } else {
      const startHour = 9 + orderIndex;
      const endHour = startHour + 1;
      startTime = `${String(startHour).padStart(2, '0')}:00`;
      endTime = `${String(endHour).padStart(2, '0')}:00`;
    }

    setItems((prev) =>
      prev.map((i) => {
        if (i.id === itemId) {
          return {
            ...i,
            status: 'placed',
            assignedDate: dateKey,
            assignedStartTime: startTime,
            assignedEndTime: endTime,
          };
        }
        return i;
      })
    );
  };

  // カレンダーからリストに戻す
  const handleRemoveFromCalendar = (itemId: string) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.id === itemId) {
          return {
            ...i,
            status: 'pending',
            assignedDate: undefined,
            assignedStartTime: undefined,
            assignedEndTime: undefined,
          };
        }
        return i;
      })
    );
  };

  // 翌月に繰り越す
  const handleCarryOverItem = (itemId: string) => {
    setItems((prev) =>
      prev.map((i) => (i.id === itemId ? { ...i, status: 'carried_over' } : i))
    );
  };

  // 一時的に削除（非表示）
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

      // 内容に作業No、台数、客先規則を記録
      const memoText = [
        `【作業No】${item.jobNo || '未設定'}`,
        `【台数】${item.quantity || '未設定'}`,
        `【客先規則】${item.customerRules || 'なし'}`,
      ].join('\n');

      const newEvent: CalendarEvent = {
        id: `evt_insp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        title: `[点検] ${item.siteName}`,
        start: startIso,
        end: endIso,
        type: 'inspection',
        location: item.address,
        memo: memoText,
        attendees: item.assignedUsers || [currentUser],
        createdBy: currentUser,
        isGoogleSynced: false,
      };

      // 参加者に対して既読処理
      if (item.assignedUsers) {
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
      {/* 画面ヘッダー & ステッパー */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm ring-1 ring-slate-900/5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-6 border-b border-slate-100">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold text-indigo-600 uppercase tracking-wider mb-1">
              <ClipboardList className="w-4 h-4" />
              Inspection Schedule Manager
            </div>
            <h1 className="text-xl sm:text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              点検予定一括登録・管理
              <span className="px-2.5 py-0.5 bg-indigo-50 text-indigo-700 text-xs font-bold rounded-full border border-indigo-200">
                {targetYearMonth}度
              </span>
            </h1>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => generateSampleInspectionExcel(targetYearMonth)}
              className="px-3.5 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 font-bold text-xs rounded-xl border border-slate-200 transition-colors flex items-center gap-2 cursor-pointer"
              title="実データ形式のサンプルExcelをダウンロード"
            >
              <Download className="w-4 h-4 text-slate-500" />
              サンプルExcel取得
            </button>
            <button
              onClick={handleLoadDemoData}
              className="px-3.5 py-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-colors flex items-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-4 h-4 text-indigo-600" />
              デモデータ読込
            </button>
          </div>
        </div>

        {/* 5ステップナビゲーション */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-6">
          <button
            onClick={() => setCurrentStep('import')}
            className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 cursor-pointer ${
              currentStep === 'import'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-200'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
          >
            <div className={`p-2 rounded-lg ${currentStep === 'import' ? 'bg-white/20' : 'bg-white border border-slate-200'}`}>
              <FileSpreadsheet className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-extrabold opacity-80 uppercase">Step 1 & 2</div>
              <div className="text-xs font-black">Excel取り込み</div>
            </div>
          </button>

          <button
            disabled={items.length === 0}
            onClick={() => setCurrentStep('assign_date')}
            className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${
              items.length === 0 ? 'opacity-40 cursor-not-allowed border-slate-200 bg-slate-50' : 'cursor-pointer'
            } ${
              currentStep === 'assign_date'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-200'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
          >
            <div className={`p-2 rounded-lg ${currentStep === 'assign_date' ? 'bg-white/20' : 'bg-white border border-slate-200'}`}>
              <CalendarIcon className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-extrabold opacity-80 uppercase">Step 3 & 4</div>
              <div className="text-xs font-black">日付・D&D登録</div>
            </div>
          </button>

          <button
            disabled={placedItems.length === 0}
            onClick={() => setCurrentStep('assign_member')}
            className={`p-3 rounded-xl border text-left transition-all flex items-center gap-3 ${
              placedItems.length === 0 ? 'opacity-40 cursor-not-allowed border-slate-200 bg-slate-50' : 'cursor-pointer'
            } ${
              currentStep === 'assign_member'
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-md ring-2 ring-indigo-200'
                : 'bg-slate-50 hover:bg-slate-100 border-slate-200 text-slate-700'
            }`}
          >
            <div className={`p-2 rounded-lg ${currentStep === 'assign_member' ? 'bg-white/20' : 'bg-white border border-slate-200'}`}>
              <Users className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-extrabold opacity-80 uppercase">Step 5</div>
              <div className="text-xs font-black">メンバー登録</div>
            </div>
          </button>

          <div
            className={`p-3 rounded-xl border text-left flex items-center gap-3 ${
              currentStep === 'completed'
                ? 'bg-emerald-600 text-white border-emerald-600 shadow-md'
                : 'bg-slate-50 border-slate-200 text-slate-400'
            }`}
          >
            <div className={`p-2 rounded-lg ${currentStep === 'completed' ? 'bg-white/20' : 'bg-white border border-slate-200'}`}>
              <CheckCircle2 className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[10px] font-extrabold opacity-80 uppercase">Final</div>
              <div className="text-xs font-black">スケジュール反映</div>
            </div>
          </div>
        </div>
      </div>

      {/* ==========================================
          STEP 1 & 2: EXCEL IMPORT & PREVIEW
          ========================================== */}
      {currentStep === 'import' && (
        <div className="space-y-6">
          {/* ファイルドロップエリア */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDropFile}
            onClick={() => fileInputRef.current?.click()}
            className="border-2 border-dashed border-indigo-300 hover:border-indigo-500 bg-indigo-50/30 hover:bg-indigo-50/60 rounded-2xl p-8 sm:p-12 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-4 group shadow-2xs"
          >
            <input
              type="file"
              ref={fileInputRef}
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => e.target.files?.[0] && handleFileUpload(e.target.files[0])}
            />
            <div className="p-4 bg-white rounded-2xl shadow-sm group-hover:scale-110 transition-transform border border-indigo-100">
              <Upload className="w-8 h-8 text-indigo-600" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900">
                点検予定のエクセルファイルをドラッグ＆ドロップ
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                またはクリックしてファイルを選択 (.xlsx / .xls) ── C1セルから対象年月を自動読み込みします
              </p>
            </div>
            <div className="flex items-center gap-4 text-xs font-semibold text-slate-600 pt-2">
              <span className="px-2.5 py-1 bg-white rounded-lg border border-slate-200">現場名 → スケジュール件名</span>
              <span className="px-2.5 py-1 bg-white rounded-lg border border-slate-200">住所 → 開催場所</span>
              <span className="px-2.5 py-1 bg-white rounded-lg border border-slate-200">作業No・台数・規則 → 内容</span>
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
                    対象年月:
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
                      <th className="py-2.5 px-3">現場名（件名）</th>
                      <th className="py-2.5 px-3">住所（場所）</th>
                      <th className="py-2.5 px-3">台数</th>
                      <th className="py-2.5 px-3">客先規則 / 注意事項</th>
                      <th className="py-2.5 px-3">ステータス</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-800">
                    {items.map((item, idx) => (
                      <tr key={item.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-2.5 px-3 font-mono text-slate-400">{idx + 1}</td>
                        <td className="py-2.5 px-3 font-mono font-bold text-indigo-600">{item.jobNo}</td>
                        <td className="py-2.5 px-3 font-bold text-slate-900">{item.siteName}</td>
                        <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">{item.address}</td>
                        <td className="py-2.5 px-3 font-semibold">{item.quantity}</td>
                        <td className="py-2.5 px-3 text-slate-500 max-w-xs truncate">{item.customerRules}</td>
                        <td className="py-2.5 px-3">
                          <span className="px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded-full font-bold text-[10px]">
                            未配置（日付未定）
                          </span>
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
            <div className="flex items-center gap-3 flex-wrap">
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

            <div className="flex items-center gap-2">
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

              {/* 検索 & フィルター */}
              <div className="space-y-2">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="現場名・住所・作業Noで検索..."
                    className="w-full pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />
                </div>

                <div className="flex items-center gap-1 overflow-x-auto pb-1 text-[11px] font-bold">
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
                      onDragEnd={() => setDraggedItemId(null)}
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
                        <div>
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="font-mono text-[10px] font-black px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded">
                              {item.jobNo}
                            </span>
                            <span className="font-semibold text-[10px] px-1.5 py-0.5 bg-indigo-50 text-indigo-700 rounded border border-indigo-100">
                              {item.quantity}
                            </span>
                          </div>
                          <h4 className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                            {item.siteName}
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-1">
                            <MapPin className="w-3 h-3 text-slate-400 shrink-0" />
                            <span className="truncate">{item.address}</span>
                          </p>
                        </div>
                      </div>

                      {/* アクションボタン */}
                      <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[10px] font-bold">
                        {item.status === 'pending' && (
                          <>
                            <button
                              onClick={() => {
                                setManualModalItem(item);
                                setManualDate(`${targetYearMonth}-01`);
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
                          <div className="w-full flex items-center justify-between">
                            <span className="text-emerald-700 font-bold flex items-center gap-1">
                              <Check className="w-3 h-3" />
                              {item.assignedDate} ({item.assignedStartTime})
                            </span>
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
                    {targetYearMonth}度 日付順カレンダー (仮配置ゾーン)
                  </h3>
                  <p className="text-xs text-slate-500">
                    左リストから日付ブロックへドラッグ＆ドロップしてください。9:00から1時間毎に順次登録されます。
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
                        setDragOverDate(day.dateKey);
                      }}
                      onDragLeave={() => setDragOverDate(null)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setDragOverDate(null);
                        const itemId = e.dataTransfer.getData('text/plain');
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
                          D&Dドロップ領域
                        </span>
                      </div>

                      {/* 配置済みアイテム一覧 */}
                      <div className="mt-2.5 space-y-2">
                        {dayPlacedItems.length === 0 ? (
                          <div className="py-2 text-center text-xs text-slate-400 border border-dashed border-slate-200 rounded-xl">
                            ドラッグしてここにドロップ
                          </div>
                        ) : (
                          dayPlacedItems.map((placed) => (
                            <div
                              key={placed.id}
                              className="p-3 bg-white rounded-xl border border-emerald-200 shadow-xs flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                            >
                              <div className="flex items-center gap-3">
                                <span className="px-2 py-1 bg-emerald-100 text-emerald-800 text-xs font-mono font-black rounded-lg">
                                  {placed.assignedStartTime} - {placed.assignedEndTime}
                                </span>
                                <div>
                                  <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                                    {placed.siteName}
                                    <span className="text-[10px] font-mono text-slate-500">({placed.jobNo})</span>
                                  </div>
                                  <div className="text-[11px] text-slate-500 truncate max-w-sm">
                                    {placed.address}
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center gap-2 self-end sm:self-center">
                                <button
                                  onClick={() => handleRemoveFromCalendar(placed.id)}
                                  className="px-2.5 py-1 text-[11px] font-bold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                                >
                                  リストに戻す
                                </button>
                              </div>
                            </div>
                          ))
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
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Users className="w-5 h-5 text-indigo-600" />
                メンバー登録・確定画面 (Step 5)
              </h2>
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
                日付調整に戻る
              </button>
              <button
                onClick={handleFinalConfirmRegistration}
                className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <CheckCircle2 className="w-4 h-4" />
                確定登録する（スケジュールに一括反映）
              </button>
            </div>
          </div>

          {/* メンバー一括指定バー */}
          <div className="bg-indigo-50/60 rounded-xl p-4 border border-indigo-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <UserCheck className="w-4 h-4 text-indigo-600" />
              <span className="text-xs font-bold text-slate-800">全点検予定に共通メンバーを一括割り当て:</span>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              {allUsers.slice(0, 6).map((u) => {
                const isSelected = batchUserIds.includes(u.id);
                return (
                  <button
                    key={u.id}
                    onClick={() => {
                      if (isSelected) setBatchUserIds(batchUserIds.filter((id) => id !== u.id));
                      else setBatchUserIds([...batchUserIds, u.id]);
                    }}
                    className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                      isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs' : 'bg-white text-slate-700 border-slate-200'
                    }`}
                  >
                    {u.name}
                  </button>
                );
              })}
              <button
                onClick={handleApplyBatchUsers}
                className="px-3 py-1 bg-indigo-600 text-white font-bold text-xs rounded-lg shadow-2xs cursor-pointer hover:bg-indigo-700"
              >
                一括適用
              </button>
            </div>
          </div>

          {/* 仮配置された点検予定リスト */}
          <div className="space-y-3">
            {placedItems.map((item) => (
              <div
                key={item.id}
                className="p-4 bg-slate-50/60 rounded-2xl border border-slate-200 flex flex-col lg:flex-row lg:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-indigo-600 text-white font-mono text-xs font-bold rounded-md">
                      {item.assignedDate} ({item.assignedStartTime} - {item.assignedEndTime})
                    </span>
                    <span className="font-mono text-xs text-slate-500 font-bold">{item.jobNo}</span>
                  </div>
                  <h4 className="text-sm font-black text-slate-900">{item.siteName}</h4>
                  <p className="text-xs text-slate-600 flex items-center gap-1">
                    <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                    {item.address}
                  </p>
                </div>

                {/* 個別メンバー選択ボタン */}
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold text-slate-500">担当メンバー:</span>
                  {allUsers.map((user) => {
                    const isAssigned = item.assignedUsers?.some((u) => u.id === user.id);
                    return (
                      <button
                        key={user.id}
                        onClick={() => handleToggleUserAssignment(item.id, user.id)}
                        className={`px-2.5 py-1 text-xs font-bold rounded-lg border transition-all cursor-pointer ${
                          isAssigned
                            ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        {user.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ==========================================
          COMPLETED STEP
          ========================================== */}
      {currentStep === 'completed' && (
        <div className="bg-white rounded-2xl border border-slate-200 p-8 sm:p-12 shadow-sm text-center space-y-6">
          <div className="w-16 h-16 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-sm border border-emerald-200">
            <CheckCircle2 className="w-10 h-10" />
          </div>

          <div>
            <h2 className="text-2xl font-black text-slate-900">
              点検スケジュールの登録が完了しました！
            </h2>
            <p className="text-sm text-slate-600 mt-2">
              合計 <strong>{completedCount} 件</strong> の点検スケジュールを各メンバーのカレンダーに自動同期・既読登録いたしました。
            </p>
          </div>

          <div className="flex items-center justify-center gap-4 pt-4">
            <button
              onClick={() => {
                setItems([]);
                setCurrentStep('import');
              }}
              className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              続けて別のファイルを取り込む
            </button>
            {onNavigateToCalendar && (
              <button
                onClick={onNavigateToCalendar}
                className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-md transition-all flex items-center gap-2 cursor-pointer"
              >
                <CalendarIcon className="w-4 h-4" />
                カレンダー画面で確認する
              </button>
            )}
          </div>
        </div>
      )}

      {/* 手動日時指定モーダル */}
      {manualModalItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">日時指定配置</h3>
              <button onClick={() => setManualModalItem(null)} className="text-slate-400 hover:text-slate-600">
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-600 font-bold">
              {manualModalItem.siteName} ({manualModalItem.jobNo})
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-500 font-bold mb-1">配置日</label>
                <input
                  type="date"
                  value={manualDate}
                  onChange={(e) => setManualDate(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl"
                />
              </div>

              <div>
                <label className="block text-slate-500 font-bold mb-1">開始時間</label>
                <input
                  type="time"
                  value={manualTime}
                  onChange={(e) => setManualTime(e.target.value)}
                  className="w-full p-2 border border-slate-200 rounded-xl"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setManualModalItem(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 rounded-xl"
              >
                キャンセル
              </button>
              <button
                onClick={() => {
                  if (manualDate) {
                    handleAssignItemToDate(manualModalItem.id, manualDate, manualTime);
                    setManualModalItem(null);
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-white bg-indigo-600 rounded-xl"
              >
                配置する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
