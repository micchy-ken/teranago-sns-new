import React, { useState, useMemo, useEffect } from 'react';
import { User, CalendarEvent, OfficeMaster, DivisionMaster } from '../../types';
import { 
  InspectionReportRecord, 
  CrmInspectionData 
} from '../../types/inspectionReport';
import { InspectionPhotoReport } from '../../types/photoReport';
import { API_BASE_URL } from '../../config/api';
import { 
  getAllInspectionReports, 
  saveInspectionReport, 
  getAllCrmInspectionData, 
  findPreviousReport, 
  createDraftReportFromCrm, 
  createEmptyReportForEvent, 
  copyPreviousReportToNew,
  extractQuantityFromEvent,
  extractJobNoFromEvent,
  toggleOfficeConfirmation,
  fetchInspectionReportsApi,
  fetchCrmInspectionDataApi
} from '../../utils/inspectionReportStorage';
import { getLocalDateStr, formatTimeJST } from '../../utils/dateUtils';
import { InspectionReportEditorModal } from './InspectionReportEditorModal';
import { InspectionReportPrintView } from './InspectionReportPrintView';
import { InspectionPhotoReportModal } from './InspectionPhotoReportModal';
import { InspectionPhotoReportFolderModal } from './InspectionPhotoReportFolderModal';
import { 
  FileCheck2, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  Copy, 
  PlusCircle, 
  CheckCircle, 
  AlertTriangle, 
  Eye, 
  Edit3, 
  Building,
  Building2, 
  UserCheck, 
  Filter, 
  Layers, 
  Printer, 
  Check, 
  ChevronRight,
  Sparkles,
  Shield,
  Briefcase,
  Stamp,
  CheckCircle2,
  Settings,
  Camera,
  FolderOpen
} from 'lucide-react';
import { InspectionCheckItemMasterModal } from './InspectionCheckItemMasterModal';

interface InspectionReportTabProps {
  currentUser: User;
  allUsers: User[];
  events: CalendarEvent[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
}

export const InspectionReportTab: React.FC<InspectionReportTabProps> = ({
  currentUser,
  allUsers,
  events,
  offices = [],
  divisions = [],
}) => {
  // 日本標準時（JST）の今日の日付文字列 (YYYY-MM-DD)
  const todayJst = useMemo(() => getLocalDateStr(new Date()), []);

  // 日付選択（デフォルト: 日本標準時の今日）
  const [selectedDate, setSelectedDate] = useState<string>(todayJst);

  // 1. ユーザーの所属部署が「事務」かどうかの判定
  const isUserOfficeStaff = useMemo(() => {
    const dept = (currentUser.department || '').toLowerCase();
    const div = (currentUser.division || '').toLowerCase();
    return dept.includes('事務') || div.includes('事務') || dept.includes('総務') || div.includes('総務');
  }, [currentUser]);

  // モード：事務所属なら自動的に「事務確認モード」がデフォルトON。他所属でも手動切り替え可能
  const [isOfficeViewMode, setIsOfficeViewMode] = useState<boolean>(isUserOfficeStaff);

  // 1. 営業所候補の収集（マスタと登録ユーザーから抽出）
  const officeOptions = useMemo(() => {
    const set = new Set<string>();
    offices.forEach((o) => {
      if (o.name && o.name.trim()) set.add(o.name.trim());
    });
    allUsers.forEach((u) => {
      if (u.office && u.office.trim()) set.add(u.office.trim());
    });
    return Array.from(set);
  }, [offices, allUsers]);

  // 2. 部署候補の収集（「保守」を確実に含め、マスタ・ユーザーから抽出）
  const divisionOptions = useMemo(() => {
    const set = new Set<string>();
    set.add('保守'); // デフォルト指定の「保守」
    set.add('事務'); // 事務部門
    divisions.forEach((d) => {
      if (d.name && d.name.trim()) set.add(d.name.trim());
    });
    allUsers.forEach((u) => {
      if (u.division && u.division.trim()) set.add(u.division.trim());
    });
    return Array.from(set);
  }, [divisions, allUsers]);

  // 初期値：営業所はユーザーの所属営業所（未設定なら 'all'）
  const defaultOffice = useMemo(() => {
    if (currentUser.office && currentUser.office.trim()) {
      return currentUser.office.trim();
    }
    return 'all';
  }, [currentUser]);

  // 初期値：部署は「保守」
  const defaultDivision = '保守';

  const [selectedOffice, setSelectedOffice] = useState<string>(defaultOffice);
  const [selectedDivision, setSelectedDivision] = useState<string>(defaultDivision);
  const [selectedUserId, setSelectedUserId] = useState<string>('all');

  // 選択された営業所・部署に所属するメンバーリスト
  const matchingUsers = useMemo(() => {
    return allUsers.filter((u) => {
      // 営業所判定
      if (selectedOffice !== 'all') {
        if (!u.office || u.office.trim() !== selectedOffice) {
          return false;
        }
      }
      // 部署判定
      if (selectedDivision !== 'all') {
        const div = (u.division || '').toLowerCase();
        const dept = (u.department || '').toLowerCase();
        const target = selectedDivision.toLowerCase();
        if (!div.includes(target) && !dept.includes(target)) {
          return false;
        }
      }
      return true;
    });
  }, [allUsers, selectedOffice, selectedDivision]);

  // 営業所・部署が変わった際に、選択中の担当者が合致しなくなった場合は 'all' にリセット
  useEffect(() => {
    if (selectedUserId !== 'all') {
      const exists = matchingUsers.some((u) => u.id === selectedUserId);
      if (!exists) {
        setSelectedUserId('all');
      }
    }
  }, [matchingUsers, selectedUserId]);

  // 報告書レコードリスト
  const [reports, setReports] = useState<InspectionReportRecord[]>(() => getAllInspectionReports());

  // CRMデータリスト
  const [crmList, setCrmList] = useState<CrmInspectionData[]>(() => getAllCrmInspectionData());

  // 写真報告書リスト
  const [photoReports, setPhotoReports] = useState<InspectionPhotoReport[]>([]);

  // モーダル状態
  const [editingReport, setEditingReport] = useState<InspectionReportRecord | null>(null);
  const [previewingReport, setPreviewingReport] = useState<InspectionReportRecord | null>(null);
  const [photoReportTarget, setPhotoReportTarget] = useState<InspectionReportRecord | null>(null);
  const [selectedExistingPhotoReport, setSelectedExistingPhotoReport] = useState<InspectionPhotoReport | null>(null);
  const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
  const [isFolderModalOpen, setIsFolderModalOpen] = useState(false);
  const [isMasterModalOpen, setIsMasterModalOpen] = useState(false);

  // 点検予定の登録・表示権限（管理者または点検予定管理が表示許可されているユーザー）
  const canManageInspectionSettings = useMemo(() => {
    const isSystemAdmin = currentUser.isAdmin === true || currentUser.role === 'admin' || currentUser.id === 'u1';
    if (isSystemAdmin) return true;
    return currentUser.preferences?.showInspectionScheduler === true || (currentUser as any)?.showInspectionScheduler === true;
  }, [currentUser]);

  // フィルター：ユーザーの所属が事務の場合、明細画面の初期値が「完了」(completed) になります！
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'completed'>(() => {
    return isUserOfficeStaff ? 'completed' : 'all';
  });

  // 事務用表示範囲（'day': 選択日, 'all_signed': サイン受領済みの全件一覧）
  const [officeViewScope, setOfficeViewScope] = useState<'day' | 'all_signed'>('day');

  // 事務確認トグルハンドラー
  const handleToggleOfficeConfirm = (reportId: string) => {
    toggleOfficeConfirmation(reportId, currentUser.name, currentUser);
    refreshData();
  };

  // ストレージから即時取得し、さらにサーバー（クラウドDB）から最新データを非同期取得
  const refreshData = () => {
    // 1. ローカル即時反映
    setReports(getAllInspectionReports());
    setCrmList(getAllCrmInspectionData());

    // 2. クラウドDB（Synology NAS / SQL Server）から最新データを非同期取得
    fetchInspectionReportsApi().then((serverReports) => {
      if (serverReports && Array.isArray(serverReports)) {
        setReports(serverReports);
      }
    });
    fetchCrmInspectionDataApi().then((serverCrm) => {
      if (serverCrm && Array.isArray(serverCrm)) {
        setCrmList(serverCrm);
      }
    });

    // 3. 写真報告書一覧の取得
    fetch(`${API_BASE_URL}/photo-reports`)
      .then(res => res.ok ? res.json() : [])
      .then(list => {
        if (Array.isArray(list)) {
          setPhotoReports(list);
        }
      })
      .catch(err => console.error('写真報告書一覧取得エラー:', err));
  };

  useEffect(() => {
    refreshData();
  }, []);

  // 選択日・営業所・部署・担当者の点検予定（カレンダーイベント）を日本標準時で抽出
  const dayEvents = useMemo(() => {
    return events.filter((e) => {
      if (!e.start) return false;

      // 日本標準時（JST）での日付判定
      const eventDateJst = getLocalDateStr(e.start);
      if (eventDateJst !== selectedDate) return false;

      // 点検イベント（type === 'inspection' または createdViaInspection）
      const isInspection = e.type === 'inspection' || e.createdViaInspection;
      if (!isInspection) return false;

      const attendees = e.attendees || [];

      // 個別担当者が選択されている場合
      if (selectedUserId !== 'all') {
        return attendees.some((u) => u.id === selectedUserId);
      }

      // 営業所・部署のフィルター
      if (attendees.length > 0) {
        return attendees.some((u) => {
          // 営業所一致判定
          if (selectedOffice !== 'all') {
            const userOffice = (u.office || '').trim();
            if (userOffice && userOffice !== selectedOffice) {
              return false;
            }
          }
          // 部署一致判定
          if (selectedDivision !== 'all') {
            const div = (u.division || '').toLowerCase();
            const dept = (u.department || '').toLowerCase();
            const target = selectedDivision.toLowerCase();
            if (!div.includes(target) && !dept.includes(target)) {
              return false;
            }
          }
          return true;
        });
      }

      // 参加者が割り当てられていないイベントの場合
      if (selectedOffice === 'all' && selectedDivision === 'all') {
        return true;
      }
      return false;
    });
  }, [events, selectedDate, selectedOffice, selectedDivision, selectedUserId]);

  // 各スケジュールイベントとCRMデータ、作成済み報告書を突合
  const matchedScheduleItems = useMemo(() => {
    return dayEvents.map((event) => {
      // 1. スケジュールに紐づく既存の報告書があるか確認
      const existingReport = reports.find((r) => r.scheduleEventId === event.id) ||
        reports.find((r) => r.inspectionDate === selectedDate && r.customerName.includes(event.title.trim()));

      // 2. イベントから台数（quantity）および作業No（jobNo）を正確に抽出
      const scheduleQuantity = extractQuantityFromEvent(event);
      const jobNoFromEvent = extractJobNoFromEvent(event);
      
      // 3. CRMデータとの突合（作業Noでマッチング、あるいは現場名でマッチング）
      let matchedCrm = crmList.find((c) => {
        if (jobNoFromEvent && c.jobNo === jobNoFromEvent) return true;
        if (c.customerName && event.title && c.customerName.replace(/^[●\s]+/, '').includes(event.title.trim())) return true;
        if (event.title && c.customerName && event.title.includes(c.customerName.replace(/^[●\s]+/, ''))) return true;
        return false;
      });

      // 4. 前回の報告書（過去に完了した同一現場・作業No）の検索
      const prevReport = findPreviousReport(matchedCrm?.jobNo || jobNoFromEvent, event.title);

      // 台数の確定：スケジュールから取れる台数を最優先とし、CRMや既存報告書も考慮
      const finalQuantity = scheduleQuantity || matchedCrm?.totalDoorsCount || existingReport?.totalDoorsCount || 1;

      return {
        event,
        existingReport,
        matchedCrm,
        prevReport,
        isCrmImported: !!matchedCrm,
        jobNo: matchedCrm?.jobNo || jobNoFromEvent || existingReport?.jobNo || '',
        scheduleQuantity: finalQuantity,
      };
    });
  }, [dayEvents, reports, crmList, selectedDate]);

  // フィルター適用後のリスト
  const filteredItems = useMemo(() => {
    if (statusFilter === 'all') return matchedScheduleItems;
    if (statusFilter === 'pending') {
      return matchedScheduleItems.filter((i) => !i.existingReport || i.existingReport.status !== 'signed');
    }
    if (statusFilter === 'completed') {
      return matchedScheduleItems.filter((i) => i.existingReport && i.existingReport.status === 'signed');
    }
    return matchedScheduleItems;
  }, [matchedScheduleItems, statusFilter]);

  // 事務用：自拠点のサイン受領済み報告書リスト（自拠点・全期間）
  const myOfficeSignedReportsList = useMemo(() => {
    const targetOffice = (selectedOffice !== 'all' && selectedOffice) || currentUser.office || '';
    return reports
      .filter((r) => {
        if (r.status !== 'signed') return false;
        if (!targetOffice) return true;
        const inspectorUser = allUsers.find(u => u.id === r.inspectorId || u.name === r.inspectorName);
        const repOffice = (r as any).office || inspectorUser?.office;
        return !repOffice || repOffice === targetOffice;
      })
      .sort((a, b) => new Date(b.signedAt || b.inspectionDate || b.updatedAt).getTime() - new Date(a.signedAt || a.inspectionDate || a.updatedAt).getTime());
  }, [reports, selectedOffice, currentUser.office, allUsers]);

  // サマリー集計
  const summary = useMemo(() => {
    const total = matchedScheduleItems.length;
    const completed = matchedScheduleItems.filter((i) => i.existingReport?.status === 'signed').length;
    const drafting = matchedScheduleItems.filter((i) => i.existingReport && i.existingReport.status === 'draft').length;
    const unimported = matchedScheduleItems.filter((i) => !i.isCrmImported && !i.existingReport).length;
    const notStarted = total - completed - drafting;
    const officeConfirmedCount = matchedScheduleItems.filter((i) => i.existingReport?.officeConfirmed).length;
    const officeUnconfirmedCount = completed - officeConfirmedCount;
    return { 
      total, 
      completed, 
      drafting, 
      unimported, 
      notStarted,
      officeConfirmedCount,
      officeUnconfirmedCount
    };
  }, [matchedScheduleItems]);

  // 新規作成アクション（CRMデータあり）
  const handleCreateNew = (item: (typeof matchedScheduleItems)[0]) => {
    if (item.matchedCrm) {
      const draft = createDraftReportFromCrm(item.matchedCrm, item.event, currentUser);
      setEditingReport(draft);
    } else {
      // 未取り込み時の現場手動作成（B案）
      const draft = createEmptyReportForEvent(item.event, currentUser, item.jobNo);
      setEditingReport(draft);
    }
  };

  // 前回コピーして作成アクション
  const handleCopyFromPrevious = (item: (typeof matchedScheduleItems)[0]) => {
    if (!item.prevReport) {
      handleCreateNew(item);
      return;
    }
    const copied = copyPreviousReportToNew(item.prevReport, item.event, item.matchedCrm, currentUser);
    setEditingReport(copied);
  };

  // 報告書保存ハンドラー
  const handleSaveReport = async (savedReport: InspectionReportRecord) => {
    saveInspectionReport(savedReport);
    refreshData();
  };

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* ページタイトルバー */}
      <div className="bg-white rounded-2xl p-4 sm:p-5 border border-slate-200 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3 sm:gap-4">
        <div className="flex items-center gap-3">
          <div className={`w-10 h-10 sm:w-12 sm:h-12 rounded-xl text-white flex items-center justify-center shadow-md shrink-0 ${
            isOfficeViewMode ? 'bg-teal-600 shadow-teal-100' : 'bg-indigo-600 shadow-indigo-100'
          }`}>
            {isOfficeViewMode ? <Briefcase className="w-5 h-5 sm:w-6 sm:h-6" /> : <FileCheck2 className="w-5 h-5 sm:w-6 sm:h-6" />}
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-lg sm:text-xl font-black text-slate-900 tracking-tight">点検報告書</h1>
              <span className="px-2 py-0.5 text-[11px] sm:text-xs font-bold bg-amber-50 text-amber-700 border border-amber-200 rounded-md">
                開発中
              </span>
            </div>
          </div>
        </div>

        {/* コントロール（モード切替・日付選択 & 営業所・部署・担当者選択） */}
        <div className="flex flex-wrap items-center gap-2">
          {/* 現場用 / 事務用 モード切り替えボタン */}
          <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
            <button
              type="button"
              onClick={() => {
                setIsOfficeViewMode(false);
                setStatusFilter('all');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                !isOfficeViewMode 
                  ? 'bg-white text-indigo-700 shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <FileCheck2 className="w-3.5 h-3.5" />
              <span>現場用</span>
            </button>
            <button
              type="button"
              onClick={() => {
                setIsOfficeViewMode(true);
                setStatusFilter('completed');
              }}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1.5 ${
                isOfficeViewMode 
                  ? 'bg-teal-600 text-white shadow-xs' 
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Stamp className="w-3.5 h-3.5" />
              <span>事務用</span>
            </button>
          </div>

          {/* 日付ピッカー（JST基準） */}
          <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 shadow-2xs">
            <CalendarIcon className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="text-xs sm:text-sm font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer"
            />
          </div>

          {/* 営業所セレクト（スマホではアイコンのみ） */}
          <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs" title={`営業所: ${selectedOffice === 'all' ? '全営業所' : selectedOffice}`}>
            <Building2 className="w-4 h-4 text-indigo-600 shrink-0 sm:mr-1.5" />
            <select
              value={selectedOffice}
              onChange={(e) => setSelectedOffice(e.target.value)}
              className="text-xs sm:text-sm font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer hidden sm:inline"
              title="営業所を選択"
            >
              <option value="all">全営業所</option>
              {officeOptions.map((off) => (
                <option key={off} value={off}>
                  {off}
                </option>
              ))}
            </select>
            {/* スマホ用タップ選択オーバーレイ */}
            <select
              value={selectedOffice}
              onChange={(e) => setSelectedOffice(e.target.value)}
              className="sm:hidden absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              title="営業所を選択"
            >
              <option value="all">全営業所</option>
              {officeOptions.map((off) => (
                <option key={off} value={off}>
                  {off}
                </option>
              ))}
            </select>
          </div>

          {/* 部署セレクト（スマホではアイコンのみ） */}
          <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs" title={`部署: ${selectedDivision === 'all' ? '全部署' : selectedDivision}`}>
            <Shield className="w-4 h-4 text-indigo-600 shrink-0 sm:mr-1.5" />
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="text-xs sm:text-sm font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer hidden sm:inline"
              title="部署を選択"
            >
              <option value="all">全部署</option>
              {divisionOptions.map((div) => (
                <option key={div} value={div}>
                  {div}
                </option>
              ))}
            </select>
            {/* スマホ用タップ選択オーバーレイ */}
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="sm:hidden absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              title="部署を選択"
            >
              <option value="all">全部署</option>
              {divisionOptions.map((div) => (
                <option key={div} value={div}>
                  {div}
                </option>
              ))}
            </select>
          </div>

          {/* 担当者セレクト（選択された営業所・部署のメンバー / スマホではアイコンのみ） */}
          <div className="relative flex items-center bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1.5 shadow-2xs" title={`担当者: ${selectedUserId === 'all' ? '全員' : matchingUsers.find(u => u.id === selectedUserId)?.name || '未選択'}`}>
            <UserCheck className="w-4 h-4 text-indigo-600 shrink-0 sm:mr-1.5" />
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="text-xs sm:text-sm font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer max-w-[120px] sm:max-w-[180px] hidden sm:inline"
              title="担当者を選択"
            >
              <option value="all">担当者: 全員 ({matchingUsers.length}名)</option>
              {matchingUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.id === currentUser.id ? '★自分' : ''}
                </option>
              ))}
            </select>
            {/* スマホ用タップ選択オーバーレイ */}
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="sm:hidden absolute inset-0 opacity-0 w-full h-full cursor-pointer"
              title="担当者を選択"
            >
              <option value="all">担当者: 全員 ({matchingUsers.length}名)</option>
              {matchingUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} {u.id === currentUser.id ? '★自分' : ''}
                </option>
              ))}
            </select>
          </div>

          {/* 写真報告書グループ（作成 & フォルダ） */}
          <div className="flex items-center bg-slate-50 p-0.5 rounded-xl border border-slate-200 text-xs shadow-2xs">
            <span className="px-2 py-1 text-[11px] font-bold text-slate-500 border-r border-slate-200 mr-0.5">
              写真報告書
            </span>
            <button
              type="button"
              onClick={() => {
                setPhotoReportTarget(null);
                setSelectedExistingPhotoReport(null);
                setIsPhotoModalOpen(true);
              }}
              className="px-2.5 sm:px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5"
              title="現場写真（2〜4枚）を添付した写真報告書を作成・PDF出力"
            >
              <Camera className="w-3.5 h-3.5 text-indigo-600" />
              <span>作成</span>
            </button>
            <button
              type="button"
              onClick={() => setIsFolderModalOpen(true)}
              className="px-2.5 sm:px-3 py-1.5 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ml-0.5"
              title="写真報告書フォルダ一覧"
            >
              <FolderOpen className="w-3.5 h-3.5 text-slate-600" />
              <span>フォルダ</span>
            </button>
          </div>

          {/* 点検項目マスター設定ボタン（点検予定登録・表示権限者のみ表示・アイコンのみ） */}
          {canManageInspectionSettings && (
            <button
              type="button"
              onClick={() => setIsMasterModalOpen(true)}
              className="p-2 bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 rounded-xl transition-all shadow-2xs cursor-pointer flex items-center justify-center shrink-0"
              title="点検項目設定"
            >
              <Settings className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* 事務用専用バナー（事務確認モード時） */}
      {isOfficeViewMode && (
        <div className="bg-teal-50 border border-teal-200 rounded-2xl p-3 sm:p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-teal-600 text-white flex items-center justify-center shrink-0">
              <Stamp className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <div>
              <span className="font-bold text-teal-900 text-sm">事務用確認</span>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setOfficeViewScope('day')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                officeViewScope === 'day'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'bg-white text-teal-800 border border-teal-300 hover:bg-teal-100/50'
              }`}
            >
              📅 選択日 ({matchedScheduleItems.length})
            </button>
            <button
              type="button"
              onClick={() => setOfficeViewScope('all_signed')}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
                officeViewScope === 'all_signed'
                  ? 'bg-teal-700 text-white shadow-xs'
                  : 'bg-white text-teal-800 border border-teal-300 hover:bg-teal-100/50'
              }`}
            >
              <CheckCircle className="w-3.5 h-3.5 text-emerald-500" />
              <span>自拠点のサイン済一覧 ({myOfficeSignedReportsList.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* サマリーカードグリッド */}
      {isOfficeViewMode ? (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-xs font-bold text-slate-400">本日の点検予定</div>
            <div className="text-2xl font-black text-slate-900 mt-1 flex items-baseline gap-1">
              <span>{summary.total}</span>
              <span className="text-xs font-medium text-slate-500">件</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-emerald-200 bg-emerald-50/20 shadow-2xs">
            <div className="text-xs font-bold text-emerald-700 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>サイン受領完了</span>
            </div>
            <div className="text-2xl font-black text-emerald-600 mt-1 flex items-baseline gap-1">
              <span>{summary.completed}</span>
              <span className="text-xs font-medium text-slate-500">/ {summary.total} 件</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-teal-200 bg-teal-50/20 shadow-2xs">
            <div className="text-xs font-bold text-teal-700 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>事務確認済</span>
            </div>
            <div className="text-2xl font-black text-teal-700 mt-1 flex items-baseline gap-1">
              <span>{summary.officeConfirmedCount}</span>
              <span className="text-xs font-medium text-slate-500">件</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-amber-200 bg-amber-50/20 shadow-2xs">
            <div className="text-xs font-bold text-amber-700 flex items-center gap-1">
              <Stamp className="w-3.5 h-3.5" />
              <span>事務確認待ち（要処理）</span>
            </div>
            <div className="text-2xl font-black text-amber-600 mt-1 flex items-baseline gap-1">
              <span>{summary.officeUnconfirmedCount}</span>
              <span className="text-xs font-medium text-slate-500">件</span>
            </div>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4">
          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-xs font-bold text-slate-400">本日の点検予定</div>
            <div className="text-2xl font-black text-slate-900 mt-1 flex items-baseline gap-1">
              <span>{summary.total}</span>
              <span className="text-xs font-medium text-slate-500">件</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-xs font-bold text-emerald-600 flex items-center gap-1">
              <CheckCircle className="w-3.5 h-3.5" />
              <span>サイン受領完了</span>
            </div>
            <div className="text-2xl font-black text-emerald-600 mt-1 flex items-baseline gap-1">
              <span>{summary.completed}</span>
              <span className="text-xs font-medium text-slate-500">/ {summary.total} 件</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-xs font-bold text-amber-600 flex items-center gap-1">
              <Edit3 className="w-3.5 h-3.5" />
              <span>作成中・下書き</span>
            </div>
            <div className="text-2xl font-black text-amber-600 mt-1 flex items-baseline gap-1">
              <span>{summary.drafting}</span>
              <span className="text-xs font-medium text-slate-500">件</span>
            </div>
          </div>

          <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
            <div className="text-xs font-bold text-rose-500 flex items-center gap-1">
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>未取り込み</span>
            </div>
            <div className="text-2xl font-black text-rose-600 mt-1 flex items-baseline gap-1">
              <span>{summary.unimported}</span>
              <span className="text-xs font-medium text-slate-500">件</span>
            </div>
          </div>
        </div>
      )}

      {/* 事務用「自拠点サイン受領済み一覧」モードの場合 */}
      {isOfficeViewMode && officeViewScope === 'all_signed' ? (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-600" />
              <span>自拠点のサイン受領済み点検報告書一覧（{myOfficeSignedReportsList.length}件）</span>
            </h2>
            <span className="text-xs text-slate-500">受領日時の新しい順で表示</span>
          </div>

          {myOfficeSignedReportsList.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300">
              <p className="text-slate-500 text-sm">自拠点のサイン受領済み点検報告書はまだありません。</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {myOfficeSignedReportsList.map((rep) => {
                return (
                  <div
                    key={rep.id}
                    className={`bg-white rounded-2xl border transition-all p-5 shadow-xs hover:shadow-md ${
                      rep.officeConfirmed ? 'border-teal-300 bg-teal-50/15' : 'border-emerald-200 bg-emerald-50/20'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* 左側：現場・点検日・サイン状況 */}
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">
                            <CalendarIcon className="w-3.5 h-3.5 text-slate-500" />
                            <span>点検日: {rep.inspectionDate} ({rep.startTime}～{rep.endTime})</span>
                          </span>
                          <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                            作業No: {rep.jobNo || '未登録'}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200">
                            台数: {rep.totalDoorsCount || 1}台
                          </span>
                          <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600">
                            点検員: {rep.inspectorName}
                          </span>
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-300">
                            <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                            サイン受領済
                          </span>
                          {rep.officeConfirmed ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 flex items-center gap-1 border border-teal-300">
                              <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                              事務確認済 ({rep.officeConfirmedByName || '事務担当'})
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 flex items-center gap-1 border border-amber-300">
                              <Stamp className="w-3.5 h-3.5 text-amber-600" />
                              事務未確認
                            </span>
                          )}
                        </div>

                        {/* 現場名 */}
                        <div className="flex items-center gap-2">
                          <Building className="w-5 h-5 text-indigo-600 shrink-0" />
                          <h2 className="text-base sm:text-lg font-black text-slate-900 truncate">
                            {rep.customerName}
                          </h2>
                        </div>

                        {/* 住所 & サイン画像プレビュー */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
                          <div className="flex items-center gap-1.5 truncate">
                            <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <span>{rep.address || '住所未登録'}</span>
                          </div>

                          {/* サインプレビュー */}
                          {rep.customerSignature && (
                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shrink-0 shadow-2xs">
                              <span className="text-[11px] font-bold text-slate-500">署名:</span>
                              <img
                                src={rep.customerSignature}
                                alt="お客様サイン"
                                className="h-6 max-w-[120px] object-contain border-b border-slate-300"
                              />
                              {rep.signedCustomerName && (
                                <span className="text-[11px] font-bold text-slate-700">({rep.signedCustomerName})</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 右側：事務確認スタンプ ＆ 印刷ボタン */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                        <button
                          type="button"
                          onClick={() => handleToggleOfficeConfirm(rep.id)}
                          className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                            rep.officeConfirmed
                              ? 'bg-teal-50 text-teal-700 border border-teal-300 hover:bg-teal-100'
                              : 'bg-teal-600 text-white hover:bg-teal-700 shadow-xs'
                          }`}
                        >
                          <Stamp className="w-4 h-4" />
                          <span>{rep.officeConfirmed ? '確認済解除' : '事務確認済にする'}</span>
                        </button>

                        {(() => {
                          const matchedPhotos = photoReports.filter(
                            p => p.inspectionReportId === rep.id || (rep.jobNo && p.jobNo === rep.jobNo)
                          );
                          const hasPhoto = matchedPhotos.length > 0;
                          return (
                            <button
                              type="button"
                              onClick={() => {
                                setPhotoReportTarget(rep);
                                setSelectedExistingPhotoReport(hasPhoto ? matchedPhotos[0] : null);
                                setIsPhotoModalOpen(true);
                              }}
                              className={`px-3.5 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
                                hasPhoto
                                  ? 'bg-purple-50 text-purple-700 border border-purple-300 hover:bg-purple-100'
                                  : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                              }`}
                              title={hasPhoto ? `写真報告書 (${matchedPhotos.length}件作成済)` : 'この点検報告書から写真報告書を作成・編集'}
                            >
                              <Camera className="w-4 h-4 text-indigo-600" />
                              <span>{hasPhoto ? `写真報告書 (${matchedPhotos.length}件)` : '写真報告書'}</span>
                            </button>
                          );
                        })()}

                        <button
                          type="button"
                          onClick={() => setPreviewingReport(rep)}
                          className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                        >
                          <Printer className="w-4 h-4" />
                          <span>帳票確認・A4印刷</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* 通常の日別明細リスト */
        <>
          {/* リストフィルターバー */}
          <div className="flex items-center justify-between flex-wrap gap-2">
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl border border-slate-200 text-xs">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  statusFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                すべて ({matchedScheduleItems.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('completed')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer flex items-center gap-1 ${
                  statusFilter === 'completed' 
                    ? 'bg-emerald-600 text-white shadow-xs' 
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckCircle className="w-3.5 h-3.5" />
                <span>完了（サイン済）のみ ({summary.completed})</span>
                {isOfficeViewMode && (
                  <span className={`ml-1 text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                    statusFilter === 'completed' ? 'bg-emerald-700 text-white' : 'bg-slate-200 text-slate-600'
                  }`}>
                    初期値
                  </span>
                )}
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('pending')}
                className={`px-3 py-1.5 rounded-lg font-bold transition-colors cursor-pointer ${
                  statusFilter === 'pending' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                未完了・下書きのみ ({summary.total - summary.completed})
              </button>
            </div>

            <div className="text-xs text-slate-400">
              ※ 現場で受領されたお客様サイン・点検結果が即時反映されます
            </div>
          </div>

          {/* 点検予定＆報告書カード一覧 */}
          {filteredItems.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-dashed border-slate-300">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-3">
                <CalendarIcon className="w-6 h-6" />
              </div>
              <h3 className="font-bold text-slate-800 text-base">対象の点検報告書・予定がありません</h3>
              <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                {statusFilter === 'completed'
                  ? `選択された日付（${selectedDate}）に、サイン受領完了した点検報告書はまだありません。「すべて」に切り替えると本日の全予定を確認できます。`
                  : `選択された日付（${selectedDate}）には、点検のスケジュールが登録されていないか、フィルター条件に一致するものがありません。`}
              </p>
              {statusFilter === 'completed' && (
                <button
                  type="button"
                  onClick={() => setStatusFilter('all')}
                  className="mt-4 px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-colors cursor-pointer"
                >
                  すべての予定を表示
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4">
              {filteredItems.map((item) => {
                const { event, existingReport, matchedCrm, prevReport, isCrmImported, jobNo, scheduleQuantity } = item;
                
                // 日本標準時（JST）で開始時刻・終了時刻を正確にフォーマット
                const startTime = event.start ? formatTimeJST(event.start) : '時間未定';
                const endTime = event.end ? formatTimeJST(event.end) : '';
                
                const isCompleted = existingReport?.status === 'signed';
                const isDraft = existingReport && !isCompleted;

                return (
                  <div
                    key={event.id}
                    className={`bg-white rounded-2xl border transition-all p-5 shadow-xs hover:shadow-md ${
                      isCompleted
                        ? existingReport?.officeConfirmed
                          ? 'border-teal-300 bg-teal-50/15'
                          : 'border-emerald-200 bg-emerald-50/20'
                        : isDraft
                        ? 'border-amber-200 bg-amber-50/20'
                        : !isCrmImported
                        ? 'border-rose-200/80'
                        : 'border-slate-200'
                    }`}
                  >
                    <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                      {/* 左側：現場情報・時間・ステータス */}
                      <div className="space-y-2 min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          {/* 時間バッジ（JST） */}
                          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-bold bg-slate-100 text-slate-700">
                            <Clock className="w-3.5 h-3.5 text-slate-500" />
                            <span>{startTime} {endTime ? `～ ${endTime}` : ''}</span>
                          </span>

                          {/* 作業Noバッジ */}
                          {jobNo ? (
                            <span className="px-2.5 py-0.5 rounded-lg text-xs font-mono font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                              作業No: {jobNo}
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" />
                              未取り込み
                            </span>
                          )}

                          {/* 台数バッジ */}
                          <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 flex items-center gap-1">
                            <Layers className="w-3 h-3 text-amber-600" />
                            <span>台数: {scheduleQuantity}台</span>
                          </span>

                          {/* 担当者名バッジ */}
                          {event.attendees && event.attendees.length > 0 && (
                            <span className="px-2.5 py-0.5 rounded-lg text-xs font-bold bg-slate-100 text-slate-600 flex items-center gap-1">
                              <UserCheck className="w-3 h-3 text-slate-400" />
                              <span>{event.attendees.map(a => a.name).join(', ')}</span>
                            </span>
                          )}

                          {/* ステータスバッジ */}
                          {isCompleted ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 flex items-center gap-1 border border-emerald-300">
                              <CheckCircle className="w-3.5 h-3.5 text-emerald-600" />
                              サイン完了
                            </span>
                          ) : isDraft ? (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 flex items-center gap-1 border border-amber-300">
                              <Edit3 className="w-3.5 h-3.5 text-amber-600" />
                              下書き保存あり
                            </span>
                          ) : (
                            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 text-slate-600">
                              未作成
                            </span>
                          )}

                          {/* 事務確認バッジ */}
                          {isCompleted && (
                            existingReport?.officeConfirmed ? (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-teal-100 text-teal-800 flex items-center gap-1 border border-teal-300">
                                <CheckCircle2 className="w-3.5 h-3.5 text-teal-600" />
                                事務確認済
                              </span>
                            ) : (
                              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 flex items-center gap-1 border border-amber-200">
                                <Stamp className="w-3.5 h-3.5 text-amber-600" />
                                事務未確認
                              </span>
                            )
                          )}
                        </div>

                        {/* 現場名 */}
                        <div className="flex items-center gap-2">
                          <Building className="w-5 h-5 text-indigo-600 shrink-0" />
                          <h2 className="text-base sm:text-lg font-black text-slate-900 truncate">
                            {event.title}
                          </h2>
                        </div>

                        {/* 住所 & サインプレビュー */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs text-slate-500">
                          <div className="space-y-0.5">
                            <div className="flex items-center gap-1.5 truncate">
                              <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <span>{event.location || matchedCrm?.address || '住所未登録'}</span>
                            </div>
                            {matchedCrm?.doors && (
                              <div className="flex items-center gap-2 text-slate-600 font-medium flex-wrap">
                                <span>扉構成:</span>
                                {matchedCrm.doors.map((d) => (
                                  <span key={d.doorIndex} className="bg-white px-1.5 py-0.5 rounded border border-slate-200 text-[11px]">
                                    {d.location} ({d.model || '標準'})
                                  </span>
                                ))}
                              </div>
                            )}
                          </div>

                          {/* サイン画像サムネイル（完了時） */}
                          {isCompleted && existingReport?.customerSignature && (
                            <div className="flex items-center gap-2 bg-white px-3 py-1.5 rounded-xl border border-slate-200 shrink-0 shadow-2xs">
                              <span className="text-[11px] font-bold text-slate-500">受領サイン:</span>
                              <img
                                src={existingReport.customerSignature}
                                alt="サイン"
                                className="h-6 max-w-[120px] object-contain border-b border-slate-300"
                              />
                              {existingReport.signedCustomerName && (
                                <span className="text-[11px] font-bold text-slate-700">({existingReport.signedCustomerName})</span>
                              )}
                            </div>
                          )}
                        </div>
                      </div>

                      {/* 右側：アクションボタン群 */}
                      <div className="flex flex-wrap items-center gap-2 shrink-0 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                        {/* 完了済みの場合のアクション */}
                        {isCompleted && (
                          <>
                            {/* 事務確認トグルボタン */}
                            {existingReport && (
                              <button
                                type="button"
                                onClick={() => handleToggleOfficeConfirm(existingReport.id)}
                                className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer ${
                                  existingReport.officeConfirmed
                                    ? 'bg-teal-50 text-teal-700 border border-teal-300 hover:bg-teal-100'
                                    : 'bg-teal-600 text-white hover:bg-teal-700 shadow-xs'
                                }`}
                                title="事務の点検確認スタンプを切り替えます"
                              >
                                <Stamp className="w-4 h-4" />
                                <span>{existingReport.officeConfirmed ? '確認済解除' : '事務確認済にする'}</span>
                              </button>
                            )}

                            {(() => {
                              const matchedPhotos = photoReports.filter(
                                p => p.inspectionReportId === existingReport.id || (existingReport.jobNo && p.jobNo === existingReport.jobNo)
                              );
                              const hasPhoto = matchedPhotos.length > 0;
                              return (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPhotoReportTarget(existingReport);
                                    setSelectedExistingPhotoReport(hasPhoto ? matchedPhotos[0] : null);
                                    setIsPhotoModalOpen(true);
                                  }}
                                  className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs ${
                                    hasPhoto
                                      ? 'bg-purple-50 text-purple-700 border border-purple-300 hover:bg-purple-100'
                                      : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200'
                                  }`}
                                  title={hasPhoto ? `写真報告書 (${matchedPhotos.length}件作成済)` : 'この点検報告書から写真報告書を作成・編集'}
                                >
                                  <Camera className="w-4 h-4 text-indigo-600" />
                                  <span>{hasPhoto ? `写真報告書 (${matchedPhotos.length}件)` : '写真報告書'}</span>
                                </button>
                              );
                            })()}

                            <button
                              type="button"
                              onClick={() => setPreviewingReport(existingReport)}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-slate-800 hover:bg-slate-900 text-white flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
                            >
                              <Printer className="w-4 h-4" />
                              <span>帳票確認・印刷</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => setEditingReport(existingReport)}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-white hover:bg-slate-50 text-indigo-600 border border-indigo-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                              <span>修正</span>
                            </button>
                          </>
                        )}

                        {/* 下書き保存ありの場合のアクション */}
                        {isDraft && (
                          <>
                            <button
                              type="button"
                              onClick={() => setPreviewingReport(existingReport)}
                              className="px-3 py-2 rounded-xl text-xs font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 flex items-center gap-1 transition-colors cursor-pointer"
                              title="プレビュー"
                            >
                              <Eye className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setEditingReport(existingReport)}
                              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-amber-500 hover:bg-amber-600 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                            >
                              <Edit3 className="w-4 h-4" />
                              <span>報告書の作成を再開</span>
                            </button>
                          </>
                        )}

                        {/* 未作成（CRM取り込み済み） */}
                        {!existingReport && isCrmImported && (
                          <>
                            {prevReport && (
                              <button
                                type="button"
                                onClick={() => handleCopyFromPrevious(item)}
                                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5 transition-colors cursor-pointer"
                                title={`前回（${prevReport.inspectionDate}）の点検結果をコピー`}
                              >
                                <Copy className="w-3.5 h-3.5 text-emerald-600" />
                                <span>前回内容をコピーして作成</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleCreateNew(item)}
                              className="px-4 py-2 rounded-xl text-xs sm:text-sm font-bold bg-indigo-600 hover:bg-indigo-700 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                            >
                              <PlusCircle className="w-4 h-4" />
                              <span>新規作成</span>
                            </button>
                          </>
                        )}

                        {/* 未作成（未取り込み・現場対応） */}
                        {!existingReport && !isCrmImported && (
                          <div className="flex items-center gap-2">
                            {prevReport && (
                              <button
                                type="button"
                                onClick={() => handleCopyFromPrevious(item)}
                                className="px-3.5 py-2 rounded-xl text-xs font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 flex items-center gap-1.5 cursor-pointer"
                              >
                                <Copy className="w-3.5 h-3.5" />
                                <span>前回コピー</span>
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleCreateNew(item)}
                              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-amber-600 hover:bg-amber-700 text-white flex items-center gap-1.5 shadow-sm transition-all cursor-pointer"
                              title="事務所の取り込みを待たずに現場で手動作成を開始します"
                            >
                              <PlusCircle className="w-4 h-4" />
                              <span>手動で新規作成 (現場対応)</span>
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}

      {/* 報告書作成・編集モーダル */}
      {editingReport && (
        <InspectionReportEditorModal
          initialReport={editingReport}
          onSave={handleSaveReport}
          onClose={() => setEditingReport(null)}
        />
      )}

      {/* 帳票プレビューモーダル */}
      {previewingReport && (
        <InspectionReportPrintView
          report={previewingReport}
          onClose={() => setPreviewingReport(null)}
        />
      )}

      {/* 点検項目マスター設定モーダル */}
      <InspectionCheckItemMasterModal
        isOpen={isMasterModalOpen}
        onClose={() => setIsMasterModalOpen(false)}
      />

      {/* 点検・写真報告書モーダル */}
      {isPhotoModalOpen && (
        <InspectionPhotoReportModal
          isOpen={isPhotoModalOpen}
          onClose={() => {
            setIsPhotoModalOpen(false);
            setPhotoReportTarget(null);
            setSelectedExistingPhotoReport(null);
          }}
          currentUser={currentUser}
          initialInspectionReport={photoReportTarget}
          existingPhotoReport={selectedExistingPhotoReport}
          inspectionReportsList={reports}
          onSaved={() => {
            refreshData();
          }}
        />
      )}

      {/* 写真報告書フォルダ管理モーダル */}
      {isFolderModalOpen && (
        <InspectionPhotoReportFolderModal
          isOpen={isFolderModalOpen}
          onClose={() => setIsFolderModalOpen(false)}
          currentUser={currentUser}
          allReports={photoReports}
          inspectionReportsList={reports}
          onOpenCreateNew={() => {
            setIsFolderModalOpen(false);
            setPhotoReportTarget(null);
            setSelectedExistingPhotoReport(null);
            setIsPhotoModalOpen(true);
          }}
          onOpenEditReport={(report) => {
            setIsFolderModalOpen(false);
            setSelectedExistingPhotoReport(report);
            setPhotoReportTarget(null);
            setIsPhotoModalOpen(true);
          }}
          onOpenPreviewReport={(report) => {
            setIsFolderModalOpen(false);
            setSelectedExistingPhotoReport(report);
            setPhotoReportTarget(null);
            setIsPhotoModalOpen(true);
          }}
          onDeleteReport={(deletedId) => {
            setPhotoReports(prev => prev.filter(r => r.id !== deletedId));
          }}
          onRefresh={() => {
            refreshData();
          }}
        />
      )}
    </div>
  );
};
