import React, { useState, useEffect, useMemo } from 'react';
import { 
  DailyReport, 
  User, 
  CalendarEvent, 
  MaintenanceWorkRow, 
  MaintenanceOfficeWorkRow, 
  MaintenanceDailyReportData, 
  WorkReportStatus,
  WorkflowApplication,
  ApprovalFlowRule,
  ItemMaster,
  ApplicationStatus,
  OfficeMaster,
  PositionMaster,
  MaintenanceReportOfficeConfig,
  ReportApprovalRecord
} from '../types';
import { 
  Calendar as CalendarIcon, 
  Clock, 
  Save, 
  Send, 
  CheckCircle2, 
  Sparkles, 
  Building2, 
  UserCheck, 
  Plus, 
  Trash2, 
  HelpCircle, 
  Printer, 
  ChevronDown, 
  ChevronUp, 
  ChevronLeft,
  ChevronRight,
  FileText, 
  ArrowLeft,
  MapPin,
  Users,
  Check,
  AlertCircle,
  PackageCheck,
  PackagePlus,
  Package,
  Sliders,
  GripVertical,
  ArrowUp,
  ArrowDown,
  RotateCcw,
  MessageSquare,
  ArrowRight,
  ShieldCheck,
  Undo2
} from 'lucide-react';
import { getAvatarUrl } from '../utils/avatar';
import { triggerOpenUserModal } from '../utils/userModal';
import { getLocalDateStr } from '../utils/dateUtils';
import { expandRecurringEvents } from '../utils/recurrenceUtils';
import { ApplicationModal } from './ApplicationModal';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import { VoiceInputButton } from './common/VoiceInputButton';
import { API_BASE_URL } from '../config/api';
import { createDefaultOfficeConfig } from './admin/MaintenanceOfficeConfigAdmin';
import { InspectionReportRecord } from '../types/inspectionReport';
import { InspectionReportPrintView } from './inspection/InspectionReportPrintView';
import { InspectionReportEditorModal } from './inspection/InspectionReportEditorModal';
import { 
  fetchInspectionReportsApi, 
  getAllInspectionReports, 
  extractJobNoFromEvent,
  saveInspectionReport,
  createDefaultDoorReport
} from '../utils/inspectionReportStorage';
import { 
  isBranchManager, 
  isSectionManager,
  isChiefOrAssistant,
  resolveSupervisorChain, 
  getNextSupervisor, 
  formatStampNameAndDate 
} from '../utils/supervisorChain';
import {
  findOfficeConfig,
  resolveOffice,
  resolveOfficeId,
  getUserOfficeName,
} from '../utils/masterResolver';

// JST (日本標準時) 基準で YYYY-MM-DD を判定
function getEventDateStrJST(dateInput: string | Date | undefined): string {
  if (!dateInput) return '';
  if (typeof dateInput === 'string') {
    if (dateInput.includes('T') && !dateInput.includes('Z') && !dateInput.includes('+')) {
      return dateInput.split('T')[0];
    }
  }
  return getLocalDateStr(dateInput);
}

// JST (日本標準時) 基準で HH:mm を判定
function getEventTimeStrJST(dateInput: string | Date | undefined): string {
  if (!dateInput) return '09:00';
  if (typeof dateInput === 'string') {
    if (dateInput.includes('T') && !dateInput.includes('Z') && !dateInput.includes('+')) {
      return dateInput.split('T')[1].substring(0, 5);
    }
  }
  const d = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
  if (!d || isNaN(d.getTime())) {
    if (typeof dateInput === 'string' && dateInput.includes('T')) {
      return dateInput.split('T')[1].substring(0, 5);
    }
    return '09:00';
  }
  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = formatter.formatToParts(d);
  let hour = parts.find(p => p.type === 'hour')?.value || '00';
  let minute = parts.find(p => p.type === 'minute')?.value || '00';
  if (hour === '24') hour = '00';
  return `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`;
}

interface MaintenanceDailyReportProps {
  report?: DailyReport | null;
  currentUser: User;
  allUsers?: User[];
  allReports?: DailyReport[];
  calendarEvents?: CalendarEvent[];
  onSaveReport?: (data: Partial<DailyReport>) => Promise<void> | void;
  onReviewReport?: (id: string, comment: string) => Promise<void> | void;
  onBack?: () => void;
  applications?: WorkflowApplication[];
  onAddApplication?: (app: Omit<WorkflowApplication, 'id' | 'createdAt' | 'status'> & { id?: string; status?: ApplicationStatus }) => Promise<void> | void;
  onUpdateApplication?: (app: WorkflowApplication) => Promise<void> | void;
  approvalFlows?: ApprovalFlowRule[];
  itemMasters?: ItemMaster[];
  offices?: OfficeMaster[];
  positions?: PositionMaster[];
}

// 曜日漢字ヘルパー
function getDayOfWeekJa(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return days[d.getDay()] || '';
}

// スケジュール種別・区分の日本語変換ヘルパー（英語表記 repair 等を「修理」「点検」等に変換）
function formatEventTypeJa(typeInput?: string): string {
  if (!typeInput) return '保守作業';
  const t = typeInput.trim().toLowerCase();
  if (t === 'repair' || t === '修理') return '修理';
  if (t === 'inspection' || t === '点検') return '点検';
  if (t === 'replacement' || t === '取替' || t === 'eg取替' || t === '単体取替') return '取替';
  if (t === 'oncall' || t === 'オンコール') return 'オンコール';
  if (t === 'maintenance') return '定期点検';
  if (t === 'site_work') return '現場作業';
  if (t === 'meeting') return '会議・打ち合わせ';
  if (t === 'construction') return '工事';
  if (t === 'personal') return '個人予定';
  if (t === 'business_trip') return '出張';
  if (t === 'visitor') return '来客対応';
  return typeInput;
}

// スケジュール区分「修理・点検・取替」判定ヘルパー
function getNormalizedScheduleCategory(ev: CalendarEvent): '点検' | '取替' | '修理' | null {
  const typeStr = String(ev.type || '').trim().toLowerCase();
  const titleAndMemo = `${ev.title || ''} ${ev.memo || ''} ${ev.location || ''}`;

  // 1. ev.type による種別判定
  if (typeStr === 'inspection' || typeStr === '点検') return '点検';
  if (typeStr === 'replacement' || typeStr === '取替' || typeStr === 'eg取替' || typeStr === '単体取替') return '取替';
  if (typeStr === 'repair' || typeStr === '修理' || typeStr === 'oncall' || typeStr === 'オンコール') return '修理';

  // 2. タイトル・メモ内の明示的な区分表記チェック
  if (titleAndMemo.includes('点検')) return '点検';
  if (titleAndMemo.includes('取替') || titleAndMemo.includes('EG') || titleAndMemo.includes('単体')) return '取替';
  if (titleAndMemo.includes('修理') || titleAndMemo.includes('オンコール')) return '修理';

  return null;
}

// 時間差分計算ヘルパー (HH:MM 〜 HH:MM => "H:MM")
function calculateTimeDiff(start: string, end: string): string {
  if (!start || !end) return '0:00';
  const [sH, sM] = start.split(':').map(Number);
  const [eH, eM] = end.split(':').map(Number);
  if (isNaN(sH) || isNaN(sM) || isNaN(eH) || isNaN(eM)) return '0:00';

  let startMinutes = sH * 60 + sM;
  let endMinutes = eH * 60 + eM;
  if (endMinutes < startMinutes) endMinutes += 24 * 60; // 日をまたぐ場合

  const diff = endMinutes - startMinutes;
  const hours = Math.floor(diff / 60);
  const mins = diff % 60;
  return `${hours}:${mins < 10 ? '0' : ''}${mins}`;
}

// 時間文字列を分に変換 ("8:30" => 510)
function timeStringToMinutes(timeStr: string): number {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(':').map(Number);
  if (isNaN(h)) return 0;
  return (h || 0) * 60 + (m || 0);
}

// 分を時間文字列に変換 (510 => "8:30")
function minutesToTimeString(totalMins: number): string {
  if (isNaN(totalMins) || totalMins < 0) return '0:00';
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${h}:${m < 10 ? '0' : ''}${m}`;
}

// 空のメイン行（10行初期生成）
function createEmptyMainRows(): MaintenanceWorkRow[] {
  const rows: MaintenanceWorkRow[] = [];
  for (let i = 1; i <= 10; i++) {
    rows.push({
      id: `row-${i}`,
      directGo: false,
      directReturn: false,
      siteName: '',
      workDescription: '',
      district: '',
      peopleCount: 1,
      coworkers: '',
      startTime: '',
      endTime: '',
      contentType: '',
      inspectionCount: 0,
      inspectionValue: 0,
      oncallAmount: 0,
      oncallValue: 0,
      replacementCount: 0,
      replacementAmount: 0,
      replacementValue: 0,
      buildingMaterialValue: 0,
      workHours: '0:00',
    });
  }
  return rows;
}

function parseTasksToMainWorkRows(tasksStr: string): MaintenanceWorkRow[] {
  if (!tasksStr) return [];
  const lines = tasksStr.split('\n').map(l => l.trim()).filter(Boolean);
  const rows: MaintenanceWorkRow[] = [];

  lines.forEach((line, idx) => {
    const cleanLine = line.replace(/^[・•\-\*\s]+/, '').trim();
    if (!cleanLine) return;

    const match = cleanLine.match(/^\[\s*([0-9]{1,2}:[0-9]{2})\s*[-〜~]\s*([0-9]{1,2}:[0-9]{2})\s*\]\s*([^\(:（]+)(?:\(([^)]+)\)|（([^）]+)）)?(?::|：)?\s*(.*)$/);
    if (match) {
      const startTime = match[1];
      const endTime = match[2];
      const siteName = match[3] ? match[3].trim() : '';
      const rawType = (match[4] || match[5] || '').trim();
      const workDescription = match[6] ? match[6].trim() : '';

      let contentType = rawType;
      if (!contentType) {
        if (workDescription.toLowerCase().includes('inspection')) contentType = '点検';
        else if (workDescription.toLowerCase().includes('replacement')) contentType = '取替';
        else if (workDescription.toLowerCase().includes('oncall')) contentType = 'オンコール';
        else contentType = '修理';
      }

      rows.push({
        id: `parsed-${idx + 1}`,
        directGo: false,
        directReturn: false,
        siteName,
        workDescription,
        district: '',
        peopleCount: 1,
        coworkers: '',
        startTime,
        endTime,
        contentType: contentType as any,
        inspectionCount: 0,
        inspectionValue: 0,
        oncallAmount: 0,
        oncallValue: 0,
        replacementCount: 0,
        replacementAmount: 0,
        replacementValue: 0,
        buildingMaterialValue: 0,
        workHours: '',
      });
    }
  });
  return rows;
}

// 空の事務作業行（5行初期生成）
function createEmptyOfficeRows(): MaintenanceOfficeWorkRow[] {
  const rows: MaintenanceOfficeWorkRow[] = [];
  for (let i = 1; i <= 5; i++) {
    rows.push({
      id: `office-${i}`,
      destination: '',
      content: '',
      amount: 0,
      targetMonth: '',
      timeMinutes: 0,
      remarks: '',
    });
  }
  return rows;
}

export function MaintenanceDailyReportView({
  report,
  currentUser,
  allUsers = [],
  allReports = [],
  calendarEvents = [],
  onSaveReport,
  onReviewReport,
  onBack,
  applications = [],
  onAddApplication,
  onUpdateApplication,
  approvalFlows = [],
  itemMasters = [],
  offices = [],
  positions = [],
}: MaintenanceDailyReportProps) {
  // 拠点別様式設定（所属拠点をマスター正規名で初期選択）
  const [selectedOfficeName, setSelectedOfficeName] = useState<string>(() => {
    return getUserOfficeName(report?.author || currentUser, offices) || (offices[0]?.name) || '名古屋支店';
  });

  // キャッシュから即時同期初期化（初回描画時から非表示設定を完全反映しチラつき・表示切り替えを根絶）
  const [officeConfigs, setOfficeConfigs] = useState<MaintenanceReportOfficeConfig[]>(() => {
    try {
      const cached = localStorage.getItem('teranago_maintenance_office_configs_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      console.warn('Failed to parse cached office configs:', e);
    }
    return [];
  });

  // 設定ロード完了状態（キャッシュが存在すれば初回からtrue、未キャッシュ時のみ初回フェッチ完了まで描画を保留）
  const [isConfigReady, setIsConfigReady] = useState<boolean>(() => {
    try {
      const cached = localStorage.getItem('teranago_maintenance_office_configs_cache');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return true;
        }
      }
    } catch (e) {}
    return false;
  });

  useEffect(() => {
    let isMounted = true;
    fetch(`${API_BASE_URL}/masters/maintenance-configs`)
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        if (Array.isArray(data) && data.length > 0) {
          setOfficeConfigs(data);
          try {
            localStorage.setItem('teranago_maintenance_office_configs_cache', JSON.stringify(data));
          } catch (e) {}
        }
      })
      .catch(() => {})
      .finally(() => {
        if (isMounted) setIsConfigReady(true);
      });
    return () => { isMounted = false; };
  }, []);

  // 現在適用中の拠点様式設定（マスターID・表記ゆれ吸収対応）
  const currentOfficeConfig = useMemo<MaintenanceReportOfficeConfig>(() => {
    const found = findOfficeConfig(officeConfigs, selectedOfficeName, offices);
    return found || createDefaultOfficeConfig(selectedOfficeName, resolveOfficeId(selectedOfficeName, offices));
  }, [officeConfigs, selectedOfficeName, offices]);

  const visibleColumns = currentOfficeConfig.visibleColumns;

  // 補充申請モーダル管理用ステート
  const [supplyModalState, setSupplyModalState] = useState<{
    isOpen: boolean;
    initialData?: WorkflowApplication | null;
    targetSiteName?: string;
  } | null>(null);

  // 現場名に対応する補充申請を検索するヘルパー関数
  const getSupplyApplicationForSite = (siteName: string): WorkflowApplication | undefined => {
    if (!siteName || !siteName.trim() || !applications) return undefined;
    const sName = siteName.trim();
    return applications.find(app => 
      app.type === 'inventory_issue' && 
      (app.title.includes(sName) || (app.description && app.description.includes(sName)))
    );
  };

  const handleOpenSupplyModal = (siteName: string) => {
    if (!siteName || !siteName.trim()) return;
    const existingApp = getSupplyApplicationForSite(siteName);
    setSupplyModalState({
      isOpen: true,
      initialData: existingApp || null,
      targetSiteName: siteName.trim(),
    });
  };
  // maintenanceData の安全な取得（camelCase と snake_case の両方およびJSON文字列化対応）
  const maintenanceData = useMemo<MaintenanceDailyReportData | null>(() => {
    if (!report) return null;
    let raw = report.maintenanceData || (report as any).maintenance_data || (report as any).maintenanceData;
    if (!raw) return null;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        return null;
      }
    }
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (e) {
        // ignore
      }
    }
    return raw as MaintenanceDailyReportData;
  }, [report]);

  // 日付 (JST準拠)
  const [reportDate, setReportDate] = useState<string>(() => {
    if (report?.date) return report.date.split('T')[0];
    return getLocalDateStr(new Date());
  });

  // 報告先上長
  const [supervisorId, setSupervisorId] = useState<string>(() => {
    return report?.supervisorId || report?.supervisor_id || currentUser.supervisorId || '';
  });

  // メイン作業10行
  const [mainWorkRows, setMainWorkRows] = useState<MaintenanceWorkRow[]>(() => {
    if (maintenanceData?.mainWorkRows && maintenanceData.mainWorkRows.length > 0) {
      // 10行に満たない場合は補完
      const existing = [...maintenanceData.mainWorkRows];
      while (existing.length < 10) {
        existing.push({
          id: `row-${existing.length + 1}`,
          directGo: false,
          directReturn: false,
          siteName: '',
          workDescription: '',
          district: '',
          peopleCount: 1,
          coworkers: '',
          startTime: '',
          endTime: '',
          contentType: '',
          inspectionCount: 0,
          inspectionValue: 0,
          oncallAmount: 0,
          oncallValue: 0,
          replacementCount: 0,
          replacementAmount: 0,
          replacementValue: 0,
          buildingMaterialValue: 0,
          workHours: '0:00',
        });
      }
      return existing;
    }

    // maintenanceData が直接ない場合、tasks 文字列から明細行を自動復元試行
    const tasksSource = report?.tasks || (report as any)?.content || '';
    const parsedRows = parseTasksToMainWorkRows(tasksSource);
    if (parsedRows.length > 0) {
      const existing = [...parsedRows];
      while (existing.length < 10) {
        existing.push({
          id: `row-${existing.length + 1}`,
          directGo: false,
          directReturn: false,
          siteName: '',
          workDescription: '',
          district: '',
          peopleCount: 1,
          coworkers: '',
          startTime: '',
          endTime: '',
          contentType: '',
          inspectionCount: 0,
          inspectionValue: 0,
          oncallAmount: 0,
          oncallValue: 0,
          replacementCount: 0,
          replacementAmount: 0,
          replacementValue: 0,
          buildingMaterialValue: 0,
          workHours: '0:00',
        });
      }
      return existing;
    }

    return createEmptyMainRows();
  });

  // 事務作業5行
  const [officeWorkRows, setOfficeWorkRows] = useState<MaintenanceOfficeWorkRow[]>(() => {
    if (maintenanceData?.officeWorkRows && maintenanceData.officeWorkRows.length > 0) {
      const existing = [...maintenanceData.officeWorkRows];
      while (existing.length < 5) {
        existing.push({
          id: `office-${existing.length + 1}`,
          destination: '',
          content: '',
          amount: 0,
          targetMonth: '',
          timeMinutes: 0,
          remarks: '',
        });
      }
      return existing;
    }
    return createEmptyOfficeRows();
  });

  // その他事務作業
  const [otherOfficeWork, setOtherOfficeWork] = useState<string>(
    maintenanceData?.otherOfficeWork || ''
  );

  // 工事・集計サマリー（緑色手入力＆自動集計）初期値はすべて空文字
  const [constructionType, setConstructionType] = useState<string>(
    maintenanceData?.constructionType || ''
  );
  const [constructionCount, setConstructionCount] = useState<number | string>(
    maintenanceData?.constructionCount ?? ''
  );
  const [constructionPeople, setConstructionPeople] = useState<number | string>(
    maintenanceData?.constructionPeople ?? ''
  );
  const [constructionValue, setConstructionValue] = useState<number | string>(
    maintenanceData?.constructionValue ?? ''
  ); // ※緑色手入力
  const [distanceValue, setDistanceValue] = useState<number | string>(
    maintenanceData?.distanceValue ?? ''
  ); // ※緑色手入力

  // 時間集計（緑色手入力＆自動集計）初期値はすべて空文字
  const [breakHours, setBreakHours] = useState<string>(
    maintenanceData?.breakHours || ''
  );
  const [overtimeHours, setOvertimeHours] = useState<string>(
    maintenanceData?.overtimeHours || ''
  ); // ※緑色手入力
  const [travelHours, setTravelHours] = useState<string>(
    maintenanceData?.travelHours || ''
  );
  const [estimateSurveyHours, setEstimateSurveyHours] = useState<string>(
    maintenanceData?.estimateSurveyHours || ''
  );

  // ステータス & 提出済み（閲覧・レビュー確認）モード判定
  const [status, setStatus] = useState<WorkReportStatus>(report?.status || 'draft');
  const isSubmittedMode = status === 'submitted' || status === 'reviewed';

  // 作成者・上長表示用情報
  const reportAuthorName = report?.author?.name || maintenanceData?.userName || currentUser.name;
  const reportAuthorDept = report?.author?.department || report?.department || currentUser.department || '保守';
  const reportAuthorAvatar = report?.author?.avatarUrl || currentUser.avatarUrl;

  const [reviewComment, setReviewComment] = useState<string>(() => {
    return report?.feedbackComment || (report as any)?.review_feedback || '';
  });
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });

  // 点検報告書データ & プレビュー・作成編集モーダル用
  const [inspectionReports, setInspectionReports] = useState<InspectionReportRecord[]>(() => getAllInspectionReports());
  const [previewInspectionReport, setPreviewInspectionReport] = useState<InspectionReportRecord | null>(null);
  const [editingInspectionReport, setEditingInspectionReport] = useState<InspectionReportRecord | null>(null);

  // 行に紐づく有効な作業No（連携用No）を判定・取得
  const getJobNoForRow = (row: MaintenanceWorkRow): string | undefined => {
    // 1. row.jobNo が明示的にある場合
    if (row.jobNo && row.jobNo.trim() && row.jobNo.trim() !== '未設定') {
      return row.jobNo.trim();
    }

    // 2. row.eventId から紐づくカレンダーイベントの jobNo
    if (row.eventId && calendarEvents && calendarEvents.length > 0) {
      const ev = calendarEvents.find(e => e.id === row.eventId);
      if (ev) {
        const no = (ev as any).jobNo || extractJobNoFromEvent(ev);
        if (no && no.trim() && no.trim() !== '未設定') return no.trim();
      }
    }

    // 3. 現場名や作業内容に含まれる【作業No】... または 作業No: ... の抽出
    const fullRowText = `${row.siteName || ''} ${row.workDescription || ''}`;
    const jobNoMatch = fullRowText.match(/【作業No】\s*([^\s\r\n】]+)/) || fullRowText.match(/作業No[：:]\s*([^\s\r\n]+)/);
    if (jobNoMatch && jobNoMatch[1] && jobNoMatch[1].trim() !== '未設定') {
      return jobNoMatch[1].trim();
    }

    // 4. 同日・同現場名のカレンダーイベントからの逆引き
    if (calendarEvents && calendarEvents.length > 0 && row.siteName?.trim()) {
      const cleanSiteName = row.siteName.trim().replace(/^[●\s]+/, '').toLowerCase();
      const matchedEv = calendarEvents.find(ev => {
        const evDate = getEventDateStrJST(ev.start);
        if (evDate !== reportDate) return false;
        const evTitleClean = (ev.title || '').replace(/【.*?】/, '').replace(/^[●\s]+/, '').trim().toLowerCase();
        const evLocClean = (ev.location || '').trim().toLowerCase();
        return (evTitleClean && (evTitleClean.includes(cleanSiteName) || cleanSiteName.includes(evTitleClean))) ||
               (evLocClean && (evLocClean.includes(cleanSiteName) || cleanSiteName.includes(evLocClean)));
      });

      if (matchedEv) {
        const evJobNo = (matchedEv as any).jobNo || extractJobNoFromEvent(matchedEv);
        if (evJobNo && evJobNo.trim() && evJobNo.trim() !== '未設定') {
          return evJobNo.trim();
        }
      }
    }

    return undefined;
  };

  // 点検報告書の新規作成ハンドラー（未作成バッジ押下時）
  const handleOpenCreateReport = (row: MaintenanceWorkRow) => {
    if (!row.siteName || !row.siteName.trim()) return;

    // 同日のイベントまたは現場名一致イベントから情報を補完
    const matchedEv = calendarEvents.find(ev => {
      if (row.eventId && ev.id === row.eventId) return true;
      const evDate = getEventDateStrJST(ev.start);
      if (evDate !== reportDate) return false;
      const evTitle = (ev.title || '').replace(/【.*?】/, '').trim().toLowerCase();
      const sName = row.siteName.trim().toLowerCase();
      return (evTitle && (evTitle.includes(sName) || sName.includes(evTitle)));
    });

    const determinedJobNo = getJobNoForRow(row) || '';

    const newReport: InspectionReportRecord = {
      id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      jobNo: determinedJobNo,
      yearMonth: reportDate ? reportDate.substring(0, 7).replace('-', '') : '',
      scheduleEventId: row.eventId || matchedEv?.id,
      customerName: row.siteName.trim(),
      address: matchedEv?.location || '',
      phone: '',
      contractType: 'ST',
      category: 'maintenance',
      inspectionDate: reportDate,
      startTime: row.startTime || (matchedEv?.start ? getEventTimeStrJST(matchedEv.start) : '10:00'),
      endTime: row.endTime || (matchedEv?.end ? getEventTimeStrJST(matchedEv.end) : '11:00'),
      inspectorId: reportAuthor?.id || currentUser.id,
      inspectorName: reportAuthor?.name || currentUser.name,
      isCrmImported: false,
      totalDoorsCount: 1,
      doors: [createDefaultDoorReport(1, '', '正面玄関', '')],
      overallRemarks: '',
      status: 'draft',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    setEditingInspectionReport(newReport);
  };

  // 日報日付変更時やマウント時にクラウドDBおよびローカルキャッシュから点検報告書を最新フェッチ
  useEffect(() => {
    let isMounted = true;
    fetchInspectionReportsApi().then(reports => {
      if (isMounted && reports && Array.isArray(reports)) {
        setInspectionReports(reports);
      }
    }).catch(err => {
      console.warn('Failed to fetch inspection reports for daily report:', err);
    });
    return () => { isMounted = false; };
  }, [reportDate]);

  // 行に紐づく点検報告書を作業No最優先で照合（ハイブリッド照合）
  const getInspectionReportForRow = (row: MaintenanceWorkRow): InspectionReportRecord | undefined => {
    if (!inspectionReports || inspectionReports.length === 0) return undefined;

    // 1. row.jobNo による完全一致（最優先）
    if (row.jobNo && row.jobNo.trim()) {
      const trimmed = row.jobNo.trim();
      const match = inspectionReports.find(r => r.jobNo && r.jobNo.trim() === trimmed);
      if (match) return match;
    }

    // 2. row.eventId による scheduleEventId 一致
    if (row.eventId && row.eventId.trim()) {
      const match = inspectionReports.find(r => r.scheduleEventId === row.eventId);
      if (match) return match;
    }

    // 3. 現場名や作業内容に含まれる【作業No】... または 作業No: ... の抽出照合
    const fullRowText = `${row.siteName || ''} ${row.workDescription || ''}`;
    const jobNoMatch = fullRowText.match(/【作業No】\s*([^\s\r\n】]+)/) || fullRowText.match(/作業No[：:]\s*([^\s\r\n]+)/);
    if (jobNoMatch && jobNoMatch[1] && jobNoMatch[1].trim() !== '未設定') {
      const extractedNo = jobNoMatch[1].trim();
      const match = inspectionReports.find(r => r.jobNo && r.jobNo.trim() === extractedNo);
      if (match) return match;
    }

    // 4. カレンダーイベントからの逆引き（同日・同現場名のイベントから jobNo / eventId を探索）
    if (calendarEvents && calendarEvents.length > 0 && row.siteName?.trim()) {
      const cleanSiteName = row.siteName.trim().replace(/^[●\s]+/, '').toLowerCase();
      const matchedEv = calendarEvents.find(ev => {
        const evDate = getEventDateStrJST(ev.start);
        if (evDate !== reportDate) return false;
        const evTitleClean = (ev.title || '').replace(/【.*?】/, '').replace(/^[●\s]+/, '').trim().toLowerCase();
        const evLocClean = (ev.location || '').trim().toLowerCase();
        return (evTitleClean && (evTitleClean.includes(cleanSiteName) || cleanSiteName.includes(evTitleClean))) ||
               (evLocClean && (evLocClean.includes(cleanSiteName) || cleanSiteName.includes(evLocClean)));
      });

      if (matchedEv) {
        const evJobNo = (matchedEv as any).jobNo || extractJobNoFromEvent(matchedEv);
        if (evJobNo && evJobNo.trim()) {
          const match = inspectionReports.find(r => r.jobNo && r.jobNo.trim() === evJobNo.trim());
          if (match) return match;
        }
        if (matchedEv.id) {
          const match = inspectionReports.find(r => r.scheduleEventId === matchedEv.id);
          if (match) return match;
        }
      }
    }

    // 5. 現場名（customerName）と日付（inspectionDate）によるフォールバック照合
    if (row.siteName && row.siteName.trim()) {
      const cleanSiteName = row.siteName.trim().replace(/^[●\s]+/, '').toLowerCase();
      const match = inspectionReports.find(r => {
        const isDateMatch = r.inspectionDate === reportDate;
        if (!isDateMatch) return false;
        const reportCust = (r.customerName || '').replace(/^[●\s]+/, '').trim().toLowerCase();
        const reportAddr = (r.address || '').trim().toLowerCase();
        return (reportCust && (reportCust.includes(cleanSiteName) || cleanSiteName.includes(reportCust))) ||
               (reportAddr && (reportAddr.includes(cleanSiteName) || cleanSiteName.includes(reportAddr)));
      });
      if (match) return match;
    }

    return undefined;
  };

  // report または maintenanceData 変更時の状態復元同期
  useEffect(() => {
    if (report?.date) setReportDate(report.date.split('T')[0]);
    else if ((report as any)?.reportDate) setReportDate((report as any).reportDate.split('T')[0]);
    if (report?.supervisorId || (report as any)?.supervisor_id) {
      setSupervisorId(report?.supervisorId || (report as any)?.supervisor_id || '');
    }
    if (report?.status) setStatus(report.status);
    if (report?.feedbackComment || (report as any)?.review_feedback) {
      setReviewComment(report.feedbackComment || (report as any).review_feedback || '');
    }

    if (maintenanceData) {
      let rowsSource = maintenanceData.mainWorkRows;
      if (typeof rowsSource === 'string') {
        try { rowsSource = JSON.parse(rowsSource); } catch (e) {}
      }
      if (Array.isArray(rowsSource) && rowsSource.length > 0) {
        const existing = [...rowsSource];
        while (existing.length < 10) {
          existing.push({
            id: `row-${existing.length + 1}`,
            directGo: false,
            directReturn: false,
            siteName: '',
            workDescription: '',
            district: '',
            peopleCount: 1,
            coworkers: '',
            startTime: '',
            endTime: '',
            contentType: '',
            inspectionCount: 0,
            inspectionValue: 0,
            oncallAmount: 0,
            oncallValue: 0,
            replacementCount: 0,
            replacementAmount: 0,
            replacementValue: 0,
            buildingMaterialValue: 0,
            workHours: '0:00',
          });
        }
        setMainWorkRows(existing);
      }

      let officeSource = maintenanceData.officeWorkRows;
      if (typeof officeSource === 'string') {
        try { officeSource = JSON.parse(officeSource); } catch (e) {}
      }
      if (Array.isArray(officeSource) && officeSource.length > 0) {
        const existing = [...officeSource];
        while (existing.length < 5) {
          existing.push({
            id: `office-${existing.length + 1}`,
            destination: '',
            content: '',
            amount: 0,
            targetMonth: '',
            timeMinutes: 0,
            remarks: '',
          });
        }
        setOfficeWorkRows(existing);
      }

      if (maintenanceData.otherOfficeWork !== undefined) setOtherOfficeWork(maintenanceData.otherOfficeWork || '');
      if (maintenanceData.constructionType !== undefined) setConstructionType(maintenanceData.constructionType || '');
      if (maintenanceData.constructionCount !== undefined) setConstructionCount(maintenanceData.constructionCount ?? '');
      if (maintenanceData.constructionPeople !== undefined) setConstructionPeople(maintenanceData.constructionPeople ?? '');
      if (maintenanceData.constructionValue !== undefined) setConstructionValue(maintenanceData.constructionValue ?? '');
      if (maintenanceData.distanceValue !== undefined) setDistanceValue(maintenanceData.distanceValue ?? '');
      if (maintenanceData.breakHours !== undefined) setBreakHours(maintenanceData.breakHours || '');
      if (maintenanceData.overtimeHours !== undefined) setOvertimeHours(maintenanceData.overtimeHours || '');
      if (maintenanceData.travelHours !== undefined) setTravelHours(maintenanceData.travelHours || '');
      if (maintenanceData.estimateSurveyHours !== undefined) setEstimateSurveyHours(maintenanceData.estimateSurveyHours || '');
    } else if (report) {
      const tasksSource = report.tasks || (report as any).content || '';
      const parsedRows = parseTasksToMainWorkRows(tasksSource);
      if (parsedRows.length > 0) {
        const existing = [...parsedRows];
        while (existing.length < 10) {
          existing.push({
            id: `row-${existing.length + 1}`,
            directGo: false,
            directReturn: false,
            siteName: '',
            workDescription: '',
            district: '',
            peopleCount: 1,
            coworkers: '',
            startTime: '',
            endTime: '',
            contentType: '',
            inspectionCount: 0,
            inspectionValue: 0,
            oncallAmount: 0,
            oncallValue: 0,
            replacementCount: 0,
            replacementAmount: 0,
            replacementValue: 0,
            buildingMaterialValue: 0,
            workHours: '0:00',
          });
        }
        setMainWorkRows(existing);
      }
    }
  }, [report, maintenanceData]);

  // アコーディオン表示用（スマホビューで展開する行ID）
  const [expandedMobileRow, setExpandedMobileRow] = useState<string | null>('row-1');

  // メンバー別集計用: 選択メンバーID（初期値: レポート作成者または閲覧者）
  const [selectedMemberId, setSelectedMemberId] = useState<string>(() => {
    return report?.author?.id || report?.authorId || (report as any)?.author_id || currentUser.id;
  });

  // レポート変更時に選択メンバーIDを作成者に同期
  useEffect(() => {
    const aid = report?.author?.id || report?.authorId || (report as any)?.author_id || currentUser.id;
    setSelectedMemberId(aid);
  }, [report?.id, report?.author?.id, report?.authorId, (report as any)?.author_id, currentUser.id]);

  // allReports が渡されていない場合の補完フェッチ
  const [fetchedReports, setFetchedReports] = useState<DailyReport[]>([]);
  useEffect(() => {
    if (allReports && allReports.length > 0) return;
    let isMounted = true;
    fetch(`${API_BASE_URL}/work-reports`)
      .then(res => res.json())
      .then(data => {
        if (!isMounted) return;
        if (Array.isArray(data)) {
          setFetchedReports(data);
        }
      })
      .catch(() => {});
    return () => { isMounted = false; };
  }, [allReports]);

  // 有効な日報全件リスト
  const effectiveAllReports = useMemo(() => {
    return (allReports && allReports.length > 0) ? allReports : fetchedReports;
  }, [allReports, fetchedReports]);

  // 対象年月 (YYYY-MM)
  const targetYearMonth = useMemo(() => {
    const dateStr = reportDate || (report as any)?.date || getLocalDateStr(new Date());
    return dateStr.slice(0, 7);
  }, [reportDate, report]);

  // 上長候補リスト
  const supervisorCandidates = useMemo(() => {
    return allUsers.filter(u => u.id !== currentUser.id);
  }, [allUsers, currentUser.id]);

  const supervisorDisplayName = useMemo(() => {
    const sId = supervisorId || report?.supervisorId || (report as any)?.supervisor_id;
    const found = allUsers.find(u => u.id === sId);
    if (found) return `${found.name} (${found.department || '上長'})`;
    if (report?.supervisor?.name) return `${report.supervisor.name} (${report.supervisor.department || '上長'})`;
    return '未指定';
  }, [supervisorId, report, allUsers]);

  // 作成者ユーザーの解決
  const reportAuthor = useMemo<User>(() => {
    const aid = report?.author?.id || report?.authorId || (report as any)?.author_id;
    if (aid) {
      const found = allUsers.find(u => u.id === aid);
      if (found) return found;
    }
    return report?.author || currentUser;
  }, [report, allUsers, currentUser]);

  // 承認履歴 (approvalHistory)
  const approvalHistory = useMemo<ReportApprovalRecord[]>(() => {
    return (
      maintenanceData?.approvalHistory ||
      (report as any)?.approvalHistory ||
      (report as any)?.maintenance_data?.approvalHistory ||
      []
    );
  }, [maintenanceData, report]);

  // 作成者から支店長までの多段階承認チェーン（マスターID・レベル照合）
  const supervisorChain = useMemo(() => {
    return resolveSupervisorChain(reportAuthor, allUsers, positions, offices);
  }, [reportAuthor, allUsers, positions, offices]);

  // 現在の承認担当上長 (report.supervisorId で指定されている上長)
  const currentAssignedSupervisor = useMemo(() => {
    const sid = report?.supervisorId || supervisorId;
    return allUsers.find(u => u.id === sid) || report?.supervisor || null;
  }, [report, supervisorId, allUsers]);

  // 現在の操作ユーザーから見た「次の上長（回覧先）」
  const nextSupervisor = useMemo(() => {
    return getNextSupervisor(currentUser, reportAuthor, allUsers, positions, offices);
  }, [currentUser, reportAuthor, allUsers, positions, offices]);

  // 現在のユーザーが支店長（または最終承認者）か判定
  const isFinalApprover = useMemo(() => {
    if (isBranchManager(currentUser, positions)) return true;
    if (!nextSupervisor) return true;
    return false;
  }, [currentUser, nextSupervisor, positions]);

  // 現在の操作ユーザーが日報の作成者本人か判定
  const isAuthor = useMemo(() => {
    return Boolean(reportAuthor.id === currentUser.id);
  }, [reportAuthor.id, currentUser.id]);

  // 差し戻し状態の検知・情報抽出
  const remandInfo = useMemo(() => {
    if (status !== 'draft') return null;

    // 1. report.isRemanded または report.remandedAt
    if (report?.isRemanded || (report as any)?.remandedAt) {
      return {
        approverName: (report as any)?.remandedBy || '上長',
        comment: report.feedbackComment ? report.feedbackComment.replace(/^\[差し戻し:[^\]]*\]\s*/, '') : '',
        approvedAt: (report as any)?.remandedAt || report.updatedAt,
      };
    }

    // 2. approvalHistory 内の remanded レコード
    const lastRemand = [...approvalHistory].reverse().find(r => r.action === 'remanded');
    if (lastRemand) {
      return {
        approverName: `${lastRemand.approverName}${lastRemand.approverPosition ? ` (${lastRemand.approverPosition})` : ''}`,
        comment: lastRemand.comment || '',
        approvedAt: lastRemand.approvedAt,
      };
    }

    // 3. feedbackComment 内の [差し戻し] 表記
    if (report?.feedbackComment?.includes('差し戻し')) {
      const m = report.feedbackComment.match(/\[差し戻し:\s*([^\]]+)\]/);
      const c = report.feedbackComment.replace(/\[差し戻し:[^\]]*\]\s*/, '');
      return {
        approverName: m ? m[1] : '上長',
        comment: c || '',
        approvedAt: (report as any)?.updatedAt || (report as any)?.updated_at,
      };
    }

    return null;
  }, [report, status, approvalHistory]);

  const isRemanded = Boolean(remandInfo);

  // 承認印欄（支店長・課長・係長/担当）の押印情報判定
  const stampBoxInfo = useMemo(() => {
    // 下書き（draft）状態（差し戻し中・取り下げ後を含む）の場合は、一切の押印・確認中を表示せず全消去（印）とする
    if (status === 'draft') {
      return {
        chief: { title: '係長 / 担当', record: null, isCurrentTarget: false, user: null, stampLabel: '提出' },
        section: { title: '課長', record: null, isCurrentTarget: false, user: null, stampLabel: '確認' },
        branch: { title: '支店長', record: null, isCurrentTarget: false, user: null, stampLabel: '承認' },
      };
    }

    const formatRecord = (rec?: Partial<ReportApprovalRecord> | null, defaultLabel: string = '確認') => {
      if (!rec || !rec.approverName) return null;
      const { surname, dateStr } = formatStampNameAndDate(rec.approverName, rec.approvedAt);
      return {
        ...rec,
        stampName: surname,
        stampDate: dateStr,
        stampLabel: defaultLabel,
      };
    };

    // 有効な承認履歴（差し戻し以前のものは除外）
    const validHistory = approvalHistory.filter(r => r.action !== 'remanded');

    // 1. 支店長 (最終承認) レコード（役職マスターID/コード/レベル＋名称フォールバック）
    const rawBranch = validHistory.find(
      r => r.action === 'final_approved' || (status === 'reviewed' && isBranchManager({ positionId: r.approverPositionId, position: r.approverPosition }, positions))
    );

    // 2. 課長 (第2承認 / 上長) レコード
    const rawSection = validHistory.find(
      r => r.action === 'forwarded' && (
        isSectionManager({ positionId: r.approverPositionId, position: r.approverPosition }, positions) ||
        (r.step === 2 && !isBranchManager({ positionId: r.approverPositionId, position: r.approverPosition }, positions))
      )
    );

    // 3. 係長 (第1承認 / 係長) レコード
    const rawChief = validHistory.find(
      r => r.action === 'forwarded' && (
        isChiefOrAssistant({ positionId: r.approverPositionId, position: r.approverPosition }, positions) ||
        (r.step === 1 && !isBranchManager({ positionId: r.approverPositionId, position: r.approverPosition }, positions) && !isSectionManager({ positionId: r.approverPositionId, position: r.approverPosition }, positions))
      )
    );

    // 4. 提出担当 (作成者) の提出印レコード
    const rawSubmission = validHistory.find(r => r.action === 'submitted') || (
      // 提出済みだが履歴に submitted レコードがまだない場合の自動フォールバック（作成者の提出印）
      (status === 'submitted' || status === 'reviewed') ? {
        step: 0,
        approverId: reportAuthor.id,
        approverName: reportAuthor.name,
        approverPositionId: reportAuthor.positionId,
        approverPosition: reportAuthor.position || '担当',
        action: 'submitted' as const,
        approvedAt: report?.submittedAt || maintenanceData?.submittedAt || report?.date || new Date().toISOString(),
      } : null
    );

    const branchRecord = formatRecord(rawBranch, '承認');
    const sectionRecord = formatRecord(rawSection, '確認');

    // 右枠の印鑑判定: 係長が確認していれば係長印(確認)、それ以前で日報が提出中/確認済なら作成者(担当)の提出印(提出)
    let chiefBoxRecord: any = null;
    let chiefBoxTitle = '係長 / 担当';
    let chiefBoxLabel = '提出';

    if (rawChief) {
      chiefBoxRecord = formatRecord(rawChief, '確認');
      chiefBoxTitle = '係長';
      chiefBoxLabel = '確認';
    } else if (rawSubmission) {
      chiefBoxRecord = formatRecord(rawSubmission, '提出');
      chiefBoxTitle = isChiefOrAssistant(reportAuthor, positions) ? (reportAuthor.position || '係長') : '担当';
      chiefBoxLabel = '提出';
    }

    // 各スロットの候補ユーザー
    const chainBranchUser = supervisorChain.find(u => isBranchManager(u, positions)) || supervisorChain[supervisorChain.length - 1];
    const chainSectionUser = supervisorChain.find(u => isSectionManager(u, positions)) || supervisorChain.find(u => u.id !== chainBranchUser?.id && !isBranchManager(u, positions));
    const chainChiefUser = supervisorChain.find(u => isChiefOrAssistant(u, positions)) || (supervisorChain[0]?.id !== chainSectionUser?.id ? supervisorChain[0] : null);

    // 現在どの段階で待機中か判定 (提出中のみ「確認中」を表示)
    const isSubmitted = status === 'submitted';

    // 支店長待機中: 課長承認済み、または担当/係長から直接支店長へ回覧された場合
    const isCurrentBranch = isSubmitted && !branchRecord && (
      (currentAssignedSupervisor && isBranchManager(currentAssignedSupervisor, positions)) ||
      (!currentAssignedSupervisor && !nextSupervisor) ||
      (!!sectionRecord)
    );

    // 課長待機中: 支店長待機中でなく、課長印がなく、現在の担当上長が課長または係長承認後
    const isCurrentSection = isSubmitted && !sectionRecord && !branchRecord && !isCurrentBranch && (
      (currentAssignedSupervisor && (
        isSectionManager(currentAssignedSupervisor, positions) ||
        (!isBranchManager(currentAssignedSupervisor, positions) && !isChiefOrAssistant(currentAssignedSupervisor, positions))
      )) ||
      (!!rawChief && supervisorChain.length >= 2)
    );

    // 係長待機中: 上記以外で係長枠が未確認かつ現在の担当が係長の場合
    const isCurrentChief = isSubmitted && !rawChief && !sectionRecord && !branchRecord && !isCurrentBranch && !isCurrentSection && (
      Boolean(currentAssignedSupervisor && isChiefOrAssistant(currentAssignedSupervisor, positions))
    );

    return {
      chief: {
        title: chiefBoxTitle,
        record: chiefBoxRecord,
        isCurrentTarget: isCurrentChief,
        user: chainChiefUser,
        stampLabel: chiefBoxLabel,
      },
      section: {
        title: (chainSectionUser?.position && isSectionManager(chainSectionUser, positions)) ? chainSectionUser.position : '課長',
        record: sectionRecord,
        isCurrentTarget: isCurrentSection,
        user: chainSectionUser,
        stampLabel: '確認',
      },
      branch: {
        title: (chainBranchUser?.position && chainBranchUser.position.includes('所長')) ? '所長' : '支店長',
        record: branchRecord,
        isCurrentTarget: isCurrentBranch,
        user: chainBranchUser,
        stampLabel: '承認',
      },
    };
  }, [approvalHistory, currentAssignedSupervisor, nextSupervisor, reportAuthor, status, supervisorChain, maintenanceData, report, positions]);

  // 提出済み日報表示用（入力のある有効行のみ抽出）
  const displayedMainRows = useMemo(() => {
    if (!isSubmittedMode) return mainWorkRows;
    const filled = mainWorkRows.filter(r => 
      Boolean(r.siteName?.trim() || r.contentType || (r.startTime && r.startTime !== '') || r.workDescription?.trim() || (r.inspectionCount && r.inspectionCount > 0) || (r.replacementCount && r.replacementCount > 0) || (r.oncallAmount && r.oncallAmount > 0))
    );
    return filled.length > 0 ? filled : mainWorkRows.slice(0, 1);
  }, [isSubmittedMode, mainWorkRows]);

  const displayedOfficeRows = useMemo(() => {
    if (!isSubmittedMode) return officeWorkRows;
    const filled = officeWorkRows.filter(r => 
      Boolean(r.destination?.trim() || r.content?.trim() || (r.amount && r.amount > 0) || r.targetMonth?.trim() || (r.timeMinutes && r.timeMinutes > 0) || r.remarks?.trim())
    );
    return filled.length > 0 ? filled : officeWorkRows.slice(0, 1);
  }, [isSubmittedMode, officeWorkRows]);

  // ---------------- D&D (ドラッグ＆ドロップ) および 行移動・行削除・行追加 ----------------
  const [draggedMainIndex, setDraggedMainIndex] = useState<number | null>(null);
  const [dragOverMainIndex, setDragOverMainIndex] = useState<number | null>(null);

  const moveMainRow = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= mainWorkRows.length || toIndex >= mainWorkRows.length) return;
    setMainWorkRows(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const deleteMainRow = (index: number) => {
    setMainWorkRows(prev => {
      if (prev.length <= 1) {
        return createEmptyMainRows().slice(0, 1);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const addMainRow = (afterIndex?: number) => {
    setMainWorkRows(prev => {
      const newRow: MaintenanceWorkRow = {
        id: `row-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        directGo: false,
        directReturn: false,
        siteName: '',
        workDescription: '',
        district: '',
        peopleCount: 1,
        coworkers: '',
        startTime: '',
        endTime: '',
        contentType: '',
        inspectionCount: 0,
        inspectionValue: 0,
        oncallAmount: 0,
        oncallValue: 0,
        replacementCount: 0,
        replacementAmount: 0,
        replacementValue: 0,
        buildingMaterialValue: 0,
        workHours: '0:00',
      };
      if (afterIndex !== undefined && afterIndex >= 0) {
        const next = [...prev];
        next.splice(afterIndex + 1, 0, newRow);
        return next;
      }
      return [...prev, newRow];
    });
  };

  // 事務作業行の D&D / 行操作
  const [draggedOfficeIndex, setDraggedOfficeIndex] = useState<number | null>(null);
  const [dragOverOfficeIndex, setDragOverOfficeIndex] = useState<number | null>(null);

  const moveOfficeRow = (fromIndex: number, toIndex: number) => {
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= officeWorkRows.length || toIndex >= officeWorkRows.length) return;
    setOfficeWorkRows(prev => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const deleteOfficeRow = (index: number) => {
    setOfficeWorkRows(prev => {
      if (prev.length <= 1) {
        return createEmptyOfficeRows().slice(0, 1);
      }
      return prev.filter((_, i) => i !== index);
    });
  };

  const addOfficeRow = () => {
    setOfficeWorkRows(prev => [
      ...prev,
      {
        id: `office-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
        destination: '',
        content: '',
        amount: 0,
        targetMonth: '',
        timeMinutes: 0,
        remarks: '',
      }
    ]);
  };

  // ---------------- 計算ロジック ----------------
  // 行ごとの自動算出値更新
  const updateMainRow = (index: number, fields: Partial<MaintenanceWorkRow>) => {
    setMainWorkRows(prev => {
      const next = [...prev];
      const updatedRow = { ...next[index], ...fields };

      // 時間の差分自動計算
      if (fields.startTime !== undefined || fields.endTime !== undefined) {
        updatedRow.workHours = calculateTimeDiff(updatedRow.startTime, updatedRow.endTime);
      }

      // 内容（作業区分）が変更された場合、拠点設定の標準ポイント/金額のプリセット自動適用
      if (fields.contentType !== undefined) {
        const ct = fields.contentType;
        const pts = currentOfficeConfig.pointSettings;
        if (ct === 'EG取替') {
          updatedRow.replacementCount = updatedRow.replacementCount || 1;
          updatedRow.replacementAmount = updatedRow.replacementAmount || pts.replacementEgAmount;
          updatedRow.replacementValue = updatedRow.replacementValue || pts.replacementEgPoint;
        } else if (ct === '単体取替') {
          updatedRow.replacementCount = updatedRow.replacementCount || 1;
          updatedRow.replacementAmount = updatedRow.replacementAmount || pts.replacementSingleAmount;
          updatedRow.replacementValue = updatedRow.replacementValue || pts.replacementSinglePoint;
        } else if (ct === '修理' || ct === 'オンコール') {
          updatedRow.oncallAmount = updatedRow.oncallAmount || pts.oncallAmount;
          updatedRow.oncallValue = updatedRow.oncallValue || pts.oncallPoint;
        } else if (ct === '点検') {
          updatedRow.inspectionCount = updatedRow.inspectionCount || 1;
          updatedRow.inspectionValue = updatedRow.inspectionValue || pts.inspectionPointPerUnit;
        }
      }

      next[index] = updatedRow;
      return next;
    });
  };

  // メインテーブル合計（自動計算）
  const mainTableTotals = useMemo(() => {
    let totalWorkMins = 0;
    let totalInspectionCount = 0;
    let totalInspectionValue = 0;
    let totalOncallCount = 0;
    let totalOncallAmount = 0;
    let totalOncallValue = 0;
    let totalReplacementCount = 0;
    let totalReplacementAmount = 0;
    let totalReplacementValue = 0;
    let totalBuildingMaterialValue = 0;

    mainWorkRows.forEach(row => {
      if (!row.siteName && !row.contentType && !row.startTime) return;

      totalWorkMins += timeStringToMinutes(row.workHours || '0:00');
      totalInspectionCount += row.inspectionCount || 0;
      totalInspectionValue += row.inspectionValue || 0;

      if ((row.oncallAmount || 0) > 0 || (row.oncallValue || 0) > 0) {
        totalOncallCount += 1;
      }
      totalOncallAmount += row.oncallAmount || 0;
      totalOncallValue += row.oncallValue || 0;

      totalReplacementCount += row.replacementCount || 0;
      totalReplacementAmount += row.replacementAmount || 0;
      totalReplacementValue += row.replacementValue || 0;

      totalBuildingMaterialValue += row.buildingMaterialValue || 0;
    });

    return {
      workHoursStr: minutesToTimeString(totalWorkMins),
      totalWorkMins,
      inspectionCount: totalInspectionCount,
      inspectionValue: totalInspectionValue,
      oncallCount: totalOncallCount,
      oncallAmount: totalOncallAmount,
      oncallValue: totalOncallValue,
      replacementCount: totalReplacementCount,
      replacementAmount: totalReplacementAmount,
      replacementValue: totalReplacementValue,
      buildingMaterialValue: totalBuildingMaterialValue,
    };
  }, [mainWorkRows]);

  // 当日数値合計 (肌色セル自動計算)
  // 計算式: 工事数値 + 点検数値 + オンコール数値 + 取替数値 + 建材数値 + 距離数値
  const calculatedDailyTotalValue = useMemo(() => {
    return (
      (Number(constructionValue) || 0) +
      (mainTableTotals.inspectionValue || 0) +
      (mainTableTotals.oncallValue || 0) +
      (mainTableTotals.replacementValue || 0) +
      (mainTableTotals.buildingMaterialValue || 0) +
      (Number(distanceValue) || 0)
    );
  }, [
    constructionValue,
    mainTableTotals.inspectionValue,
    mainTableTotals.oncallValue,
    mainTableTotals.replacementValue,
    mainTableTotals.buildingMaterialValue,
    distanceValue,
  ]);

  // 時間集計の自動計算
  const calculatedTotalWorkHoursStr = mainTableTotals.workHoursStr;
  const calculatedTotalWorkMins = mainTableTotals.totalWorkMins;
  const calculatedTotalHoursStr = useMemo(() => {
    const breakMins = timeStringToMinutes(breakHours);
    const overtimeMins = timeStringToMinutes(overtimeHours);
    const travelMins = timeStringToMinutes(travelHours);
    const totalMins = calculatedTotalWorkMins + overtimeMins - breakMins;
    return minutesToTimeString(Math.max(0, totalMins));
  }, [calculatedTotalWorkMins, breakHours, overtimeHours, travelHours]);

  // 選択中メンバーオブジェクトの解決
  const selectedMember = useMemo(() => {
    return allUsers.find(u => u.id === selectedMemberId) || reportAuthor;
  }, [allUsers, selectedMemberId, reportAuthor]);

  // ---------------- 当月累計の自動集計 (メンバー別) ----------------
  // 対象年月・対象メンバーの保存済み保守日報 + 編集中の当日実績を合算
  const monthlyMemberTotals = useMemo(() => {
    let inspectionCount = 0;
    let inspectionValue = 0;
    let oncallCount = 0;
    let oncallAmount = 0;
    let oncallValue = 0;
    let replacementCount = 0;
    let replacementAmount = 0;
    let replacementValue = 0;
    let constructionCountSum = 0;
    let constructionPeopleSum = 0;
    let constructionValueSum = 0;
    let buildingMaterialValueSum = 0;
    let distanceValueSum = 0;

    const currentReportId = report?.id;
    const currentReportDate = reportDate ? reportDate.slice(0, 10) : '';
    const currentAuthorId = report?.author?.id || report?.authorId || (report as any)?.author_id || currentUser.id;

    effectiveAllReports.forEach(r => {
      const rAuthorId = r.author?.id || r.authorId || (r as any).author_id;
      if (rAuthorId !== selectedMemberId) return;

      const rDate = (r.date || (r as any).report_date || '').slice(0, 10);
      if (!rDate.startsWith(targetYearMonth)) return;

      // 保守日報判定
      const isMaintenance =
        r.reportType === 'maintenance_daily' ||
        (r as any).report_type === 'maintenance_daily' ||
        (r as any).maintenanceData ||
        (r as any).report_data?.maintenanceData ||
        (r as any).tasks?.includes('【保守点検】');
      if (!isMaintenance) return;

      // 現在画面で開いて編集中の日報と同じ場合はスキップ（リアルタイム手入力値を後で加算）
      const isCurrentReport =
        (currentReportId && r.id === currentReportId) ||
        (!currentReportId && rDate === currentReportDate && selectedMemberId === currentAuthorId);
      if (isCurrentReport) return;

      // maintenanceData の取り出し
      let mData: any = r.maintenanceData;
      if (typeof mData === 'string') {
        try { mData = JSON.parse(mData); } catch (e) {}
      }
      if (!mData && (r as any).report_data?.maintenanceData) {
        mData = (r as any).report_data.maintenanceData;
        if (typeof mData === 'string') {
          try { mData = JSON.parse(mData); } catch (e) {}
        }
      }

      let workRows: any[] = [];
      if (mData && Array.isArray(mData.mainWorkRows)) {
        workRows = mData.mainWorkRows;
      } else if (r.tasks) {
        workRows = parseTasksToMainWorkRows(r.tasks);
      }

      let rInspCount = 0;
      let rInspVal = 0;
      let rOncallCnt = 0;
      let rOncallAmt = 0;
      let rOncallVal = 0;
      let rReplCnt = 0;
      let rReplAmt = 0;
      let rReplVal = 0;
      let rBldMatVal = 0;

      workRows.forEach(row => {
        rInspCount += Number(row.inspectionCount || 0);
        rInspVal += Number(row.inspectionValue || 0);
        if (Number(row.oncallAmount || 0) > 0 || Number(row.oncallValue || 0) > 0) {
          rOncallCnt += 1;
        }
        rOncallAmt += Number(row.oncallAmount || 0);
        rOncallVal += Number(row.oncallValue || 0);
        rReplCnt += Number(row.replacementCount || 0);
        rReplAmt += Number(row.replacementAmount || 0);
        rReplVal += Number(row.replacementValue || 0);
        rBldMatVal += Number(row.buildingMaterialValue || 0);
      });

      const rConstCount = Number(mData?.constructionCount || 0);
      const rConstPeople = Number(mData?.constructionPeople || 0);
      const rConstVal = Number(mData?.constructionValue || 0);
      const rDistVal = Number(mData?.distanceValue || 0);

      inspectionCount += rInspCount;
      inspectionValue += rInspVal;
      oncallCount += rOncallCnt;
      oncallAmount += rOncallAmt;
      oncallValue += rOncallVal;
      replacementCount += rReplCnt;
      replacementAmount += rReplAmt;
      replacementValue += rReplVal;
      constructionCountSum += rConstCount;
      constructionPeopleSum += rConstPeople;
      constructionValueSum += rConstVal;
      buildingMaterialValueSum += rBldMatVal;
      distanceValueSum += rDistVal;
    });

    // 選択メンバーが現在開いている日報の作成者の場合、現在画面で入力されている最新の当日値をリアルタイム加算
    if (selectedMemberId === currentAuthorId) {
      inspectionCount += mainTableTotals.inspectionCount;
      inspectionValue += mainTableTotals.inspectionValue;
      oncallCount += mainTableTotals.oncallCount;
      oncallAmount += mainTableTotals.oncallAmount;
      oncallValue += mainTableTotals.oncallValue;
      replacementCount += mainTableTotals.replacementCount;
      replacementAmount += mainTableTotals.replacementAmount;
      replacementValue += mainTableTotals.replacementValue;
      constructionCountSum += Number(constructionCount) || 0;
      constructionPeopleSum += Number(constructionPeople) || 0;
      constructionValueSum += Number(constructionValue) || 0;
      buildingMaterialValueSum += Number(mainTableTotals.buildingMaterialValue) || 0;
      distanceValueSum += Number(distanceValue) || 0;
    }

    const totalValue =
      inspectionValue +
      oncallValue +
      replacementValue +
      constructionValueSum +
      buildingMaterialValueSum +
      distanceValueSum;

    return {
      inspectionCount,
      inspectionValue,
      oncallCount,
      oncallAmount,
      oncallValue,
      replacementCount,
      replacementAmount,
      replacementValue,
      constructionCount: constructionCountSum,
      constructionPeople: constructionPeopleSum,
      constructionValue: constructionValueSum,
      buildingMaterialValue: buildingMaterialValueSum,
      distanceValue: distanceValueSum,
      totalValue,
    };
  }, [
    effectiveAllReports,
    selectedMemberId,
    targetYearMonth,
    report?.id,
    reportDate,
    report?.author?.id,
    report?.authorId,
    currentUser.id,
    mainTableTotals,
    constructionCount,
    constructionPeople,
    constructionValue,
    distanceValue,
  ]);

  // ---------------- スケジュールからの自動読み込み ----------------
  const handleAutoLoadSchedule = () => {
    if (!reportDate) {
      alert('日付を選択してください。');
      return;
    }

    const targetDateStr = reportDate.split('T')[0];
    const [y, m, d] = targetDateStr.split('-').map(Number);
    const viewStart = new Date(y, m - 1, d, 0, 0, 0);
    const viewEnd = new Date(y, m - 1, d, 23, 59, 59);

    // 対象日付範囲で繰り返しイベント（定期点検・毎朝業務等）を展開
    const expanded = expandRecurringEvents(
      calendarEvents,
      viewStart,
      viewEnd
    );

    // 選択日付および自分が参加メンバー/作成者になっているカレンダーイベントの抽出 (JST基準)
    const dayEvents = expanded.filter(ev => {
      const evStartLocalDate = getEventDateStrJST(ev.start);
      if (evStartLocalDate !== targetDateStr) return false;

      // 自分が参加メンバー(attendees)または作成者(createdBy)に含まれているかチェック
      const isAttendee = ev.attendees && ev.attendees.some(a => 
        a.id === currentUser.id || (a.name && currentUser.name && a.name.trim() === currentUser.name.trim())
      );
      const isCreator = ev.createdById === currentUser.id || ev.createdBy?.id === currentUser.id || ev.createdBy?.name === currentUser.name;

      return isAttendee || isCreator;
    });

    if (dayEvents.length === 0) {
      alert(`${targetDateStr} のスケジュール（参加・担当予定）が見つかりませんでした。`);
      return;
    }

    // イベントからの自動セット (JST基準で正確な開始・終了時刻と作業時間を抽出)
    const newRows = createEmptyMainRows();
    const mapCfg = currentOfficeConfig.scheduleMapping;
    const pts = currentOfficeConfig.pointSettings;

    // スケジュール区分「修理・点検・取替」の取り込み（余分な判定は排し区分を厳密判定）
    const targetEvents = (mapCfg.onlyTargetKeywords ?? true)
      ? dayEvents.filter(ev => {
          const category = getNormalizedScheduleCategory(ev);
          if (!category) return false;
          if (category === '点検') return mapCfg.importInspection ?? true;
          if (category === '取替') return mapCfg.importReplacement ?? true;
          if (category === '修理') return mapCfg.importRepair ?? true;
          return false;
        })
      : dayEvents;

    if (targetEvents.length === 0) {
      alert(`${targetDateStr} のスケジュールに「点検」「取替」「修理」に該当する予定が見つかりませんでした。`);
      return;
    }

    targetEvents.slice(0, 10).forEach((ev, idx) => {
      const startT = getEventTimeStrJST(ev.start);
      const endT = getEventTimeStrJST(ev.end);
      const category = getNormalizedScheduleCategory(ev);
      const typeJa = formatEventTypeJa(ev.type);
      const fullText = `${ev.memo || ''} ${ev.location || ''} ${ev.title || ''} ${ev.type || ''}`;

      // 現場名の決定（マッピング設定準拠）
      let siteNameStr = ev.title || '現場名未設定';
      if (mapCfg.siteNameSource === 'location') {
        siteNameStr = ev.location || ev.title || '現場名未設定';
      } else if (mapCfg.siteNameSource === 'location_then_title') {
        siteNameStr = (ev.location && ev.location.trim()) ? ev.location.trim() : (ev.title || '現場名未設定');
      }

      // 作業内容の決定（マッピング設定準拠＆日本語変換徹底）
      let workDescStr = ev.memo && ev.memo.trim() ? ev.memo.trim() : (ev.title || typeJa);
      if (mapCfg.workDescriptionSource === 'memo') {
        workDescStr = ev.memo && ev.memo.trim() ? ev.memo.trim() : (ev.title || typeJa);
      } else if (mapCfg.workDescriptionSource === 'type') {
        workDescStr = typeJa;
      } else if (mapCfg.workDescriptionSource === 'title') {
        workDescStr = ev.title || typeJa;
      }

      // 地区の決定（マッピング設定準拠）
      let districtStr = '';
      if (mapCfg.districtSource === 'tag') {
        const districtMatch = fullText.match(/【地区】\s*([^\s\r\n】]+)/) || fullText.match(/地区[：:]\s*([^\s\r\n]+)/);
        if (districtMatch && districtMatch[1]) {
          districtStr = districtMatch[1].trim();
        }
      } else if (mapCfg.districtSource === 'location') {
        districtStr = ev.location || '';
      } else if (mapCfg.districtSource === 'default_office') {
        districtStr = selectedOfficeName;
      }

      // 直行・直帰の自動判定
      let isDirectGo = false;
      let isDirectReturn = false;
      if (mapCfg.autoDetectDirectGoReturn) {
        const searchStr = `${ev.title || ''} ${ev.memo || ''}`;
        if (searchStr.includes('直行')) isDirectGo = true;
        if (searchStr.includes('直帰')) isDirectReturn = true;
      }

      // 内容区分の判定：スケジュール内容（点検、取替、修理）に応じたデフォルト割り当て
      let contentType = '';
      const ctExplicitMatch = fullText.match(/【内容区分】\s*([^\s\r\n】]+)/) || fullText.match(/【内容】\s*([^\s\r\n】]+)/);
      if (ctExplicitMatch && ctExplicitMatch[1]) {
        const candidate = ctExplicitMatch[1].trim();
        if (['EG取替', '単体取替', '修理', 'オンコール', '点検', '見積'].includes(candidate)) {
          contentType = candidate;
        }
      }
      
      if (!contentType) {
        if (category === '取替') {
          contentType = mapCfg.replacementDefaultCategory || 'EG取替';
        } else if (category === '点検') {
          contentType = mapCfg.inspectionDefaultCategory || '点検';
        } else if (category === '修理') {
          contentType = mapCfg.repairDefaultCategory || '修理';
        } else {
          contentType = typeJa;
        }
      }

      // 各内容区分ごとの数値・金額プリセット（拠点設定値）
      let inspectionCount = 0;
      let inspectionValue = 0;
      let oncallAmount = 0;
      let oncallValue = 0;
      let replacementCount = 0;
      let replacementAmount = 0;
      let replacementValue = 0;

      if (contentType === 'EG取替') {
        replacementCount = 1;
        replacementAmount = pts.replacementEgAmount;
        replacementValue = pts.replacementEgPoint;
      } else if (contentType === '単体取替') {
        replacementCount = 1;
        replacementAmount = pts.replacementSingleAmount;
        replacementValue = pts.replacementSinglePoint;
      } else if (contentType === '修理' || contentType === 'オンコール') {
        oncallAmount = pts.oncallAmount;
        oncallValue = pts.oncallPoint;
      } else if (contentType === '点検') {
        inspectionCount = 1;
        inspectionValue = pts.inspectionPointPerUnit;
      }

      // 自分以外の参加メンバー抽出
      let totalPeople = 1;
      let coworkersStr = '';
      if (mapCfg.autoImportAttendees) {
        const otherAttendees = (ev.attendees || []).filter(a => {
          if (!a) return false;
          if (a.id && currentUser.id && a.id === currentUser.id) return false;
          if (a.name && currentUser.name && a.name.trim() === currentUser.name.trim()) return false;
          return true;
        });
        totalPeople = (ev.attendees && ev.attendees.length > 0) ? ev.attendees.length : 1;
        coworkersStr = (totalPeople >= 2 && otherAttendees.length > 0)
          ? otherAttendees.map(a => a.name).filter(Boolean).join(', ')
          : '';
      }

      const eventJobNo = (ev as any).jobNo || extractJobNoFromEvent(ev) || '';

      newRows[idx] = {
        id: `row-${idx + 1}`,
        directGo: isDirectGo,
        directReturn: isDirectReturn,
        siteName: siteNameStr,
        workDescription: workDescStr,
        district: districtStr,
        peopleCount: totalPeople,
        coworkers: coworkersStr,
        startTime: startT,
        endTime: endT,
        contentType,
        inspectionCount,
        inspectionValue,
        oncallAmount,
        oncallValue,
        replacementCount,
        replacementAmount,
        replacementValue,
        buildingMaterialValue: 0,
        workHours: calculateTimeDiff(startT, endT),
        jobNo: eventJobNo || undefined,
        eventId: ev.id,
      };
    });

    setMainWorkRows(newRows);
    alert(`${targetEvents.length} 件のスケジュールを自動取り込みしました！（様式: ${selectedOfficeName}）`);
  };

  // ---------------- 保存・提出処理 ----------------
  const handleSave = async (submitStatus: WorkReportStatus) => {
    if (!onSaveReport) return;
    setIsSubmitting(true);

    try {
      // 提出時は作成者（担当）の提出印レコードを新規生成
      const submissionRecord: ReportApprovalRecord = {
        step: 0,
        approverId: reportAuthor.id,
        approverName: reportAuthor.name,
        approverPositionId: reportAuthor.positionId,
        approverPosition: reportAuthor.position || '担当',
        comment: '',
        action: 'submitted',
        approvedAt: new Date().toISOString(),
      };

      const nowIso = new Date().toISOString();

      const updatedMaintenanceData: MaintenanceDailyReportData = {
        date: reportDate,
        userName: reportAuthor.name,
        submittedAt: submitStatus === 'submitted' ? nowIso : undefined,
        // 提出時は提出者押印で履歴を初期化、下書き時は空
        approvalHistory: submitStatus === 'submitted' ? [submissionRecord] : [],
        mainWorkRows,
        officeWorkRows,
        otherOfficeWork,
        constructionType,
        constructionCount: Number(constructionCount) || 0,
        constructionPeople: Number(constructionPeople) || 0,
        constructionValue: Number(constructionValue) || 0,
        distanceValue: Number(distanceValue) || 0,
        workHours: calculatedTotalWorkHoursStr,
        officeHours: '0:00',
        travelHours,
        breakHours,
        overtimeHours,
        totalHours: calculatedTotalHoursStr,
        estimateSurveyHours,
        dailyTotalValue: calculatedDailyTotalValue,
        monthlyTotalValue: monthlyMemberTotals.totalValue,
      };

      const summaryTasks = mainWorkRows
        .filter(r => r.siteName)
        .map(r => `・[${r.startTime}〜${r.endTime}] ${r.siteName} (${r.contentType}): ${r.workDescription}`)
        .join('\n');

      const matchedOffice = resolveOffice(selectedOfficeName, offices);

      const payload: Partial<DailyReport> = {
        id: report?.id,
        author: reportAuthor,
        authorId: reportAuthor.id,
        author_id: reportAuthor.id,
        reportType: 'maintenance_daily',
        date: reportDate,
        officeId: matchedOffice?.id || reportAuthor.officeId,
        divisionId: reportAuthor.divisionId,
        department: reportAuthor.department || (reportAuthor as any).division || currentUser.department || '保守',
        tasks: summaryTasks || '保守日報作業報告',
        supervisorId: supervisorId || undefined,
        status: submitStatus,
        submittedAt: submitStatus === 'submitted' ? nowIso : undefined,
        isRemanded: false,
        remandedAt: undefined,
        remandedBy: undefined,
        maintenanceData: updatedMaintenanceData,
      };

      await onSaveReport(payload);
      setStatus(submitStatus);
      if (submitStatus === 'submitted') {
        alert('保守日報を提出しました。\n担当（提出者）の押印が承認印欄に反映されました。');
      } else {
        alert('保守日報を下書き保存しました。');
      }
    } catch (e) {
      console.error('Failed to save maintenance report:', e);
      alert('保存処理に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 上長レビュー確認（旧互換）
  const handleReview = async () => {
    if (!report?.id || !onReviewReport) return;
    setIsSubmitting(true);
    try {
      await onReviewReport(report.id, reviewComment);
      setStatus('reviewed');
    } catch (e) {
      console.error('Failed to review:', e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // 提出された日報の差し戻し処理
  const handleRemand = async () => {
    if (!report?.id) return;
    setConfirmModal({
      isOpen: true,
      title: '日報の差し戻し',
      message: `この日報を作成者（${reportAuthorName}さん）に差し戻しますか？\n（ステータスが下書きに戻り、承認印欄の押印はすべて消去され、再編集・再提出が可能になります）`,
      confirmText: '差し戻す',
      cancelText: 'キャンセル',
      type: 'warning',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          const nowIso = new Date().toISOString();
          const remandRecord: ReportApprovalRecord = {
            step: approvalHistory.length + 1,
            approverId: currentUser.id,
            approverName: currentUser.name,
            approverPositionId: currentUser.positionId,
            approverPosition: currentUser.position || '上長',
            comment: reviewComment?.trim() || '',
            action: 'remanded',
            approvedAt: nowIso,
          };

          const updatedMaintenanceData: MaintenanceDailyReportData = {
            ...(maintenanceData || {
              date: reportDate,
              mainWorkRows,
              officeWorkRows,
            }),
            // 差し戻し時は過去の押印を完全消去（履歴には差し戻し記録のみ保持）
            approvalHistory: [remandRecord],
          };

          if (onSaveReport) {
            await onSaveReport({
              id: report.id,
              author: reportAuthor,
              authorId: reportAuthor.id,
              author_id: reportAuthor.id,
              reportType: 'maintenance_daily',
              status: 'draft',
              isRemanded: true,
              remandedAt: nowIso,
              remandedBy: `${currentUser.name} (${currentUser.position || '上長'})`,
              supervisorId: reportAuthor.supervisorId || supervisorId,
              feedbackComment: reviewComment?.trim() 
                ? `[差し戻し: ${currentUser.name} (${currentUser.position || '上長'})] ${reviewComment.trim()}`
                : `[差し戻し: ${currentUser.name} (${currentUser.position || '上長'})] コメントなしで差し戻されました。内容を修正して再提出してください。`,
              tasks: report.tasks,
              maintenanceData: updatedMaintenanceData,
            });
          }
          setStatus('draft');
          alert(`日報を作成者（${reportAuthorName}さん）に差し戻しました。\n承認印欄の押印は消去されました。`);
          if (onBack) onBack();
        } catch (err) {
          console.error('Failed to remand report:', err);
          alert('差し戻し処理に失敗しました。');
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  };

  // 提出された日報の上長提出・確認完了処理（多段階承認：上長がいる限り回覧、支店長が最終承認）
  const handleForwardOrApprove = async () => {
    if (!report?.id) return;
    setIsSubmitting(true);
    try {
      const nowIso = new Date().toISOString();
      // 差し戻しレコードを除外した有効な履歴に今回のアクションを追加
      const validHistory = approvalHistory.filter(r => r.action !== 'remanded');

      if (isFinalApprover) {
        // 支店長 / 最終承認
        const finalRecord: ReportApprovalRecord = {
          step: validHistory.length + 1,
          approverId: currentUser.id,
          approverName: currentUser.name,
          approverPositionId: currentUser.positionId,
          approverPosition: currentUser.position || '支店長',
          comment: reviewComment || '',
          action: 'final_approved',
          approvedAt: nowIso,
        };

        const updatedMaintenanceData: MaintenanceDailyReportData = {
          ...(maintenanceData || {
            date: reportDate,
            mainWorkRows,
            officeWorkRows,
          }),
          approvalHistory: [...validHistory, finalRecord],
        };

        if (onReviewReport) {
          await onReviewReport(report.id, reviewComment || '');
        }
        if (onSaveReport) {
          await onSaveReport({
            id: report.id,
            author: reportAuthor,
            authorId: reportAuthor.id,
            author_id: reportAuthor.id,
            reportType: 'maintenance_daily',
            status: 'reviewed',
            isRemanded: false,
            feedbackComment: reviewComment || '',
            tasks: report.tasks,
            maintenanceData: updatedMaintenanceData,
            reviewedAt: nowIso,
          });
        }
        setStatus('reviewed');
        alert('日報の支店長最終承認（確認完了）を行いました。\n承認印欄に支店長の押印が反映されました。');
      } else {
        // 次の上長へ回覧・提出
        const nextTarget = nextSupervisor!;
        const forwardRecord: ReportApprovalRecord = {
          step: validHistory.length + 1,
          approverId: currentUser.id,
          approverName: currentUser.name,
          approverPositionId: currentUser.positionId,
          approverPosition: currentUser.position || '上長',
          comment: reviewComment || '',
          action: 'forwarded',
          approvedAt: nowIso,
        };

        const updatedMaintenanceData: MaintenanceDailyReportData = {
          ...(maintenanceData || {
            date: reportDate,
            mainWorkRows,
            officeWorkRows,
          }),
          approvalHistory: [...validHistory, forwardRecord],
        };

        if (onSaveReport) {
          await onSaveReport({
            id: report.id,
            author: reportAuthor,
            authorId: reportAuthor.id,
            author_id: reportAuthor.id,
            reportType: 'maintenance_daily',
            status: 'submitted', // 提出中（次の上長の承認待ち）
            supervisorId: nextTarget.id,
            isRemanded: false,
            feedbackComment: reviewComment || '',
            tasks: report.tasks,
            maintenanceData: updatedMaintenanceData,
          });
        }
        alert(`日報を上長（${nextTarget.name} ${nextTarget.position || '上長'}）へ提出（回覧）しました。\n確認印欄に押印が反映されました。`);
      }

      if (onBack) onBack();
    } catch (err) {
      console.error('Failed to forward/approve report:', err);
      alert('提出処理に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 提出の取り下げ処理（作成者本人が下書きに戻して編集可能にする）
  const handleWithdraw = async () => {
    if (!report?.id || !onSaveReport) return;
    setConfirmModal({
      isOpen: true,
      title: '日報提出の取り下げ',
      message: '日報の提出を取り下げて下書き（編集可能）に戻しますか？\n取り下げると承認印欄の押印は消去され、入力内容を修正して再提出できるようになります。',
      confirmText: '取り下げる',
      cancelText: 'キャンセル',
      type: 'warning',
      onConfirm: async () => {
        setIsSubmitting(true);
        try {
          const updatedMaintenanceData: MaintenanceDailyReportData = {
            ...(maintenanceData || {
              date: reportDate,
              mainWorkRows,
              officeWorkRows,
            }),
            // 取り下げ時は押印履歴を完全消去
            approvalHistory: [],
            submittedAt: undefined,
          };

          await onSaveReport({
            id: report.id,
            author: reportAuthor,
            authorId: reportAuthor.id,
            author_id: reportAuthor.id,
            reportType: 'maintenance_daily',
            status: 'draft',
            isRemanded: false,
            submittedAt: undefined,
            tasks: report.tasks,
            maintenanceData: updatedMaintenanceData,
          });
          setStatus('draft');
          alert('日報の提出を取り下げました。承認印欄の押印は消去されました。編集して再提出してください。');
        } catch (err) {
          console.error('Failed to withdraw report:', err);
          alert('提出の取り下げに失敗しました。');
        } finally {
          setIsSubmitting(false);
        }
      }
    });
  };

  return (
    <div className="flex-1 bg-slate-100 min-h-screen pb-20 font-sans text-slate-800">
      {/* ---------------- 画面トップ固定ヘッダー ---------------- */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-xs px-4 py-3 sm:px-6">
        <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {onBack && (
              <button
                onClick={onBack}
                className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                title="一覧に戻る"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
            )}
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-bold shadow-sm ${
              isSubmittedMode ? 'bg-indigo-600 shadow-indigo-200' : 'bg-amber-500 shadow-amber-200'
            }`}>
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900">
                  平日（月～金）保守日報
                </h1>
                {isSubmittedMode ? (
                  <span className={`text-xs font-semibold px-2.5 py-0.5 rounded-full border flex items-center gap-1 ${
                    status === 'reviewed' 
                      ? 'bg-emerald-100 text-emerald-800 border-emerald-300' 
                      : 'bg-amber-100 text-amber-900 border-amber-300'
                  }`}>
                    {status === 'reviewed' ? (
                      <>
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        <span>支店長 最終承認完了</span>
                      </>
                    ) : (
                      <>
                        <Clock className="w-3.5 h-3.5 text-amber-600" />
                        <span>{isAuthor ? '提出中' : '提出済（承認回覧中）'}</span>
                      </>
                    )}
                  </span>
                ) : isRemanded ? (
                  <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 flex items-center gap-1 animate-pulse">
                    <RotateCcw className="w-3.5 h-3.5 text-rose-600" />
                    <span>差し戻し（修正中）</span>
                  </span>
                ) : (
                  <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                    保守部署専用
                  </span>
                )}

                {/* 拠点別カスタム様式セレクター / 直接表示 */}
                <div className="flex items-center gap-1.5 ml-1">
                  <span className="text-[11px] font-bold text-slate-500 hidden md:inline">様式:</span>
                  {isSubmittedMode ? (
                    <span className="text-xs font-bold text-amber-900 bg-amber-50 border border-amber-300 rounded-lg px-2.5 py-0.5">
                      {selectedOfficeName} 様式
                    </span>
                  ) : (
                    <div className="relative">
                      <select
                        value={selectedOfficeName}
                        onChange={(e) => setSelectedOfficeName(e.target.value)}
                        className="text-xs font-bold text-amber-900 bg-amber-50 hover:bg-amber-100 border border-amber-300 rounded-lg px-2.5 py-1 pr-6 cursor-pointer appearance-none transition-colors"
                        title="適用する拠点別カスタム様式（表示列・計算ポイント）を切り替えます"
                      >
                        {(offices.length > 0 ? offices.map(o => o.name) : ['本社', '名古屋支店', '静岡営業所', '浜松営業所', '三河営業所']).map(offName => (
                          <option key={offName} value={offName}>
                            {offName} 様式
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="w-3.5 h-3.5 text-amber-700 absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                    </div>
                  )}
                </div>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                {isSubmittedMode 
                  ? (isAuthor ? '現在提出中の保守日報です。内容を修正したい場合は「取り下げ・編集」を行ってください。' : '多段階承認フロー（支店長最終承認）による日報確認画面です。内容確認の上、上長への回覧提出または差し戻しを行えます。')
                  : '当日のスケジュールから作業・点検・取替内容を自動算出し、日報を簡単に作成・保存します'}
              </p>
            </div>
          </div>

          {/* 右側アクションボタン */}
          {isSubmittedMode ? (
            <div className="flex items-center gap-2">
              {status === 'submitted' ? (
                isAuthor ? (
                  <button
                    onClick={handleWithdraw}
                    disabled={isSubmitting}
                    className="px-4 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-amber-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="日報の提出を取り下げて下書きに戻し、編集可能にします"
                  >
                    <Undo2 className="w-3.5 h-3.5" />
                    <span>取り下げ・編集</span>
                  </button>
                ) : (
                  <>
                    <button
                      onClick={handleRemand}
                      disabled={isSubmitting}
                      className="px-3.5 py-1.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="日報を作成者に差し戻します（下書きに戻す）"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      差し戻し
                    </button>
                    {isFinalApprover ? (
                      <button
                        onClick={handleForwardOrApprove}
                        disabled={isSubmitting}
                        className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-emerald-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title="支店長としての最終承認（確認完了）を行います"
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        支店長 承認完了（最終確認）
                      </button>
                    ) : (
                      <button
                        onClick={handleForwardOrApprove}
                        disabled={isSubmitting}
                        className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-indigo-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                        title={nextSupervisor ? `${nextSupervisor.name}さんへ回覧します` : '上長へ提出します'}
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>上長（{nextSupervisor?.name || '次上長'}）へ提出</span>
                      </button>
                    )}
                  </>
                )
              ) : (
                <span className="px-3 py-1.5 bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  支店長 最終承認済
                </span>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <button
                onClick={handleAutoLoadSchedule}
                className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
                title="選択した日付のスケジュールから現場名・作業時間を自動入力します"
              >
                <Sparkles className="w-4 h-4" />
                <span className="hidden sm:inline">スケジュール自動取り込み</span>
                <span className="sm:hidden">自動取込</span>
              </button>

              <button
                onClick={() => handleSave('draft')}
                disabled={isSubmitting}
                className="px-3.5 py-1.5 bg-white border border-slate-300 text-slate-700 hover:bg-slate-50 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1 cursor-pointer disabled:opacity-50"
              >
                <Save className="w-4 h-4 text-slate-500" />
                下書き保存
              </button>

              <button
                onClick={() => handleSave('submitted')}
                disabled={isSubmitting}
                className={`px-4 py-1.5 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                  isRemanded 
                    ? 'bg-rose-600 hover:bg-rose-700 shadow-rose-200' 
                    : 'bg-indigo-600 hover:bg-indigo-700 shadow-indigo-200'
                }`}
              >
                <Send className="w-4 h-4" />
                {isRemanded ? '日報を再提出' : '日報を提出'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-2 sm:px-6 pt-4 space-y-4">
        {/* 差し戻し時の専用アラートバナー（コメント有無にかかわらず理由・状況を明確表示） */}
        {isRemanded && status === 'draft' && (
          <div className="bg-rose-50 border-2 border-rose-300 rounded-xl p-4 shadow-sm flex flex-wrap items-start justify-between gap-3 animate-in fade-in">
            <div className="flex items-start gap-3 flex-1 min-w-[280px]">
              <div className="w-10 h-10 rounded-xl bg-rose-200 flex items-center justify-center text-rose-800 shrink-0 mt-0.5">
                <RotateCcw className="w-5 h-5 text-rose-700" />
              </div>
              <div className="flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="px-2 py-0.5 bg-rose-600 text-white text-[11px] font-bold rounded">
                    差し戻し
                  </span>
                  <h3 className="font-bold text-rose-950 text-sm">
                    この保守日報は上長（{remandInfo?.approverName || '上長'}）より差し戻されました
                  </h3>
                  {remandInfo?.approvedAt && (
                    <span className="text-xs text-rose-500 font-mono">
                      {new Date(remandInfo.approvedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}
                    </span>
                  )}
                </div>
                <div className="mt-2 text-xs">
                  {remandInfo?.comment ? (
                    <div className="bg-white/90 border border-rose-200 rounded-lg p-2.5 text-rose-900 shadow-2xs">
                      <strong className="block text-[11px] text-rose-700 font-bold mb-0.5">差し戻し理由・指示事項:</strong>
                      <p className="whitespace-pre-wrap">{remandInfo.comment}</p>
                    </div>
                  ) : (
                    <p className="text-rose-800 bg-rose-100/70 p-2.5 rounded-lg border border-rose-200 font-medium">
                      ※上長からの個別コメントはありません。作業内容・時間・集計等の必要箇所を修正し、右上の「日報を再提出」ボタンを押してください。
                    </p>
                  )}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleSave('submitted')}
              disabled={isSubmitting}
              className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50 self-start shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>日報を再提出</span>
            </button>
          </div>
        )}

        {/* 本人提出中時の取り下げ案内バナー */}
        {isSubmittedMode && status === 'submitted' && isAuthor && (
          <div className="bg-amber-50/95 border-2 border-amber-300 rounded-xl p-4 shadow-xs flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-200/90 flex items-center justify-center text-amber-800 shrink-0">
                <Clock className="w-5 h-5 text-amber-700" />
              </div>
              <div>
                <h3 className="font-bold text-amber-950 text-sm flex items-center gap-2">
                  この保守日報は現在【提出中（上長確認待ち）】です
                </h3>
                <p className="text-xs text-amber-800/90 mt-0.5">
                  内容を修正したい場合は「取り下げ・編集」を行ってください。下書き状態に戻り再編集が可能になります。
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={isSubmitting}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" />
              <span>取り下げて編集する</span>
            </button>
          </div>
        )}

        {/* ---------------- 提出された日報用 上長確認・多段階承認ステッパー＆コメントパネル ---------------- */}
        {isSubmittedMode && (
          <div className="bg-white border-2 border-indigo-300 rounded-xl p-4 shadow-sm space-y-4">
            {/* 上部ヘッダー & アクションボタン (上長閲覧時のみ表示) */}
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-indigo-100 pb-3">
              <div className="flex items-center gap-2 text-indigo-950 font-bold text-sm">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <span>上長確認・多段階承認 (支店長最終承認)</span>
                <span className="text-[11px] font-normal text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-200">
                  ※上長がいる限り順次回覧され、支店長で最終確定します
                </span>
              </div>
              {!isAuthor && status === 'submitted' && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRemand}
                    disabled={isSubmitting}
                    className="px-3.5 py-1.5 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                    title="日報を作成者に差し戻します（下書きに戻す）"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    差し戻し
                  </button>
                  {isFinalApprover ? (
                    <button
                      onClick={handleForwardOrApprove}
                      disabled={isSubmitting}
                      className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-emerald-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title="支店長としての最終承認（確認完了）を行います"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      支店長 承認完了（最終確認）
                    </button>
                  ) : (
                    <button
                      onClick={handleForwardOrApprove}
                      disabled={isSubmitting}
                      className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-indigo-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                      title={nextSupervisor ? `${nextSupervisor.name}さんへ回覧します` : '上長へ提出します'}
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>上長（{nextSupervisor?.name || '次上長'}）へ提出</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 承認ルート進捗ステップバー */}
            <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
              <div className="text-[11px] font-bold text-slate-700 mb-2.5 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-indigo-600" />
                  <span>承認ルート進捗状況:</span>
                </span>
                <span className="text-[11px] font-semibold text-slate-500">
                  {status === 'reviewed' ? (
                    <span className="text-emerald-700 font-bold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      支店長 最終承認完了
                    </span>
                  ) : (
                    <span className="text-amber-700 font-bold">
                      現在: {currentAssignedSupervisor?.name || '上長'} 確認中
                    </span>
                  )}
                </span>
              </div>

              <div className="flex items-center flex-wrap gap-2 text-xs">
                {/* Step 0: 作成者 */}
                <button
                  type="button"
                  onClick={() => triggerOpenUserModal(reportAuthor || reportAuthorName)}
                  className="flex items-center gap-1.5 bg-white hover:bg-indigo-50/70 px-2.5 py-1.5 rounded-lg border border-slate-200 hover:border-indigo-300 shadow-2xs transition-colors cursor-pointer text-left"
                  title="作成者の社員詳細を表示"
                >
                  <span className="w-5 h-5 rounded-full bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center shrink-0">
                    ✓
                  </span>
                  <div className="leading-tight">
                    <span className="text-[10px] text-slate-400 block font-normal">作成者</span>
                    <span className="font-bold text-slate-800 hover:text-indigo-600">{reportAuthorName}</span>
                  </div>
                </button>

                <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />

                {/* チェーン内の各上長ステップ */}
                {(supervisorChain.length > 0 ? supervisorChain : (currentAssignedSupervisor ? [currentAssignedSupervisor] : [])).map((stepUser, sIdx) => {
                  const isBm = isBranchManager(stepUser);
                  const approvedRecord = approvalHistory.find(
                    r => r.approverId === stepUser.id && (r.action === 'forwarded' || r.action === 'final_approved')
                  );
                  const isCurrentlyPending = !approvedRecord && status === 'submitted' && (
                    (report?.supervisorId === stepUser.id || supervisorId === stepUser.id) ||
                    (!report?.supervisorId && sIdx === 0)
                  );

                  return (
                    <React.Fragment key={stepUser.id}>
                      <div
                        onClick={() => triggerOpenUserModal(stepUser)}
                        title={`${stepUser.name} さんの社員詳細を表示`}
                        className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg border shadow-2xs transition-all cursor-pointer hover:ring-2 hover:ring-indigo-300/60 ${
                          approvedRecord 
                            ? 'bg-emerald-50/80 border-emerald-300 text-emerald-950' 
                            : isCurrentlyPending 
                              ? 'bg-amber-50 border-amber-300 ring-2 ring-amber-400/30 text-amber-950 animate-pulse' 
                              : 'bg-white border-slate-200 text-slate-600 opacity-75'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center shrink-0 ${
                          approvedRecord 
                            ? 'bg-emerald-600 text-white' 
                            : isCurrentlyPending 
                              ? 'bg-amber-500 text-white' 
                              : 'bg-slate-200 text-slate-600'
                        }`}>
                          {approvedRecord ? '✓' : sIdx + 1}
                        </span>
                        <div className="leading-tight">
                          <div className="flex items-center gap-1">
                            <span className="text-[10px] font-semibold text-slate-500">
                              {isBm ? '【最終】支店長' : stepUser.position || `上長${sIdx + 1}`}
                            </span>
                            {approvedRecord && <span className="text-[9px] bg-emerald-100 text-emerald-800 px-1 rounded font-bold">承認済</span>}
                            {isCurrentlyPending && <span className="text-[9px] bg-amber-100 text-amber-800 px-1 rounded font-bold">確認中</span>}
                          </div>
                          <span className="font-bold text-slate-800">{stepUser.name}</span>
                        </div>
                      </div>
                      {sIdx < supervisorChain.length - 1 && (
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                    </React.Fragment>
                  );
                })}
              </div>
            </div>

            {/* これまでの承認・フィードバックコメント履歴 */}
            {approvalHistory.length > 0 && (
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                <span className="text-[11px] font-bold text-slate-700 block">承認・回覧・コメント履歴:</span>
                <div className="space-y-1.5">
                  {approvalHistory.map((item, idx) => (
                    <div key={idx} className="text-xs bg-white p-2.5 rounded-lg border border-slate-200 flex flex-wrap items-center justify-between gap-2 shadow-2xs">
                      <div className="flex items-center gap-2">
                        <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                          item.action === 'final_approved'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-200'
                            : item.action === 'remanded'
                              ? 'bg-rose-100 text-rose-800 border border-rose-200'
                              : 'bg-indigo-100 text-indigo-800 border border-indigo-200'
                        }`}>
                          {item.action === 'final_approved' ? '支店長最終承認' : item.action === 'remanded' ? '差し戻し' : '上長提出・回覧'}
                        </span>
                        <button
                          type="button"
                          onClick={() => triggerOpenUserModal(item.approverId || item.approverName)}
                          className="font-bold text-slate-800 hover:text-indigo-600 hover:underline transition-colors cursor-pointer"
                          title="承認者の社員詳細を表示"
                        >
                          {item.approverName} ({item.approverPosition || '上長'}):
                        </button>
                        <span className="text-slate-700">{item.comment || <span className="text-slate-400">（コメントなし）</span>}</span>
                      </div>
                      {item.approvedAt && (
                        <span className="text-[10px] text-slate-400 font-mono">
                          {new Date(item.approvedAt).toLocaleString('ja-JP', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* コメント入力テキストエリア (上長閲覧時かつ提出中モード時のみ入力可) */}
            {!isAuthor && status === 'submitted' ? (
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                  <span>
                    コメント入力 <span className="text-slate-400 font-normal">（空白のまま上長提出・承認または差し戻し可能です）</span>:
                  </span>
                  <VoiceInputButton
                    currentValue={reviewComment}
                    onValueChange={setReviewComment}
                    size="xs"
                    label="音声入力"
                    variant="subtle"
                    title="確認コメントを音声で入力（クリックで開始/停止）"
                  />
                </label>
                <textarea
                  rows={2}
                  value={reviewComment}
                  onChange={e => setReviewComment(e.target.value)}
                  placeholder={
                    isFinalApprover
                      ? "支店長承認時のフィードバックや指示事項を入力（空白でも承認可能）..."
                      : `上長（${nextSupervisor?.name || '次上長'}）への申し送りや確認コメントを入力（空白でも提出可能）...`
                  }
                  className="w-full p-2.5 border border-indigo-200 rounded-lg text-xs bg-indigo-50/20 focus:bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors"
                />
              </div>
            ) : status === 'reviewed' ? (
              <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200 flex items-center gap-2 text-xs font-bold text-emerald-900">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>この日報は支店長により最終承認（確認完了）されています。</span>
              </div>
            ) : null}
          </div>
        )}

        {/* ---------------- 色設定・操作ガイドバナー ---------------- */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-bold text-slate-700 flex items-center gap-1">
              <HelpCircle className="w-4 h-4 text-amber-500" />
              {isSubmittedMode ? '日報確認モード:' : 'セルの色分けガイド:'}
            </span>
            {isSubmittedMode ? (
              <span className="text-slate-600 font-medium">
                提出された日報です（全項目直接表示）。コメントを入力の上、上長提出または差し戻しを行ってください。
              </span>
            ) : (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-[#FAF3E0] border border-amber-300 inline-block shadow-2xs"></span>
                  <span className="font-semibold text-amber-900">肌色 = 自動反映・自動計算項目</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-4 h-4 rounded bg-[#E8F8F0] border border-emerald-400 inline-block shadow-2xs"></span>
                  <span className="font-semibold text-emerald-900">緑色 = ※手入力項目</span>
                </div>
              </>
            )}
          </div>

          <div className="flex items-center gap-2 text-slate-500 text-[11px]">
            <span>当日数値合計: <strong className="text-amber-700 font-bold text-sm">{calculatedDailyTotalValue} pt</strong></span>
            <span>|</span>
            <span>合計時間: <strong className="text-slate-800 font-bold text-sm">{calculatedTotalHoursStr}</strong></span>
          </div>
        </div>

        {/* ---------------- 1. ヘッダー情報（日付・氏名・承認先） ---------------- */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 items-center">
            {/* 日付選択 / 直接表示 */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600 shrink-0">日報日付:</label>
              {isSubmittedMode ? (
                <div className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 flex items-center justify-between">
                  <span className="flex items-center gap-1.5">
                    <CalendarIcon className="w-3.5 h-3.5 text-amber-600" />
                    {reportDate}
                  </span>
                  <span className="px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded text-xs font-extrabold">
                    ({getDayOfWeekJa(reportDate)})
                  </span>
                </div>
              ) : (
                <div className="flex items-center gap-1 flex-1 min-w-[170px]">
                  <button
                    type="button"
                    onClick={() => {
                      if (!reportDate) return;
                      const [y, m, d] = reportDate.split('-').map(Number);
                      const dt = new Date(y, m - 1, d - 1);
                      setReportDate(getLocalDateStr(dt));
                    }}
                    className="p-1.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 border border-slate-300 hover:border-amber-300 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center shrink-0"
                    title="前日へ移動"
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </button>
                  <input
                    type="date"
                    value={reportDate}
                    onChange={e => setReportDate(e.target.value)}
                    className="w-full px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-amber-500/20 focus:border-amber-500 text-center cursor-pointer"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      if (!reportDate) return;
                      const [y, m, d] = reportDate.split('-').map(Number);
                      const dt = new Date(y, m - 1, d + 1);
                      setReportDate(getLocalDateStr(dt));
                    }}
                    className="p-1.5 bg-slate-100 hover:bg-amber-100 text-slate-600 hover:text-amber-800 border border-slate-300 hover:border-amber-300 rounded-lg text-xs font-bold transition-all cursor-pointer flex items-center justify-center shrink-0"
                    title="翌日へ移動"
                  >
                    <ChevronRight className="w-4 h-4" />
                  </button>
                  <span className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-extrabold shrink-0">
                    ({getDayOfWeekJa(reportDate)})
                  </span>
                </div>
              )}
            </div>

            {/* 氏名 */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600 shrink-0">氏名:</label>
              <button
                type="button"
                onClick={() => triggerOpenUserModal(reportAuthor || reportAuthorName)}
                className="flex-1 px-3 py-1.5 bg-[#FAF3E0] hover:bg-amber-100/80 border border-amber-200 rounded-lg text-xs font-bold text-slate-900 hover:text-indigo-700 flex items-center gap-2 transition-colors cursor-pointer text-left"
                title="社員詳細を表示"
              >
                <img
                  src={getAvatarUrl(reportAuthorAvatar)}
                  alt={reportAuthorName}
                  className="w-5 h-5 rounded-full object-cover"
                />
                <span className="hover:underline">{reportAuthorName}</span>
                <span className="text-[10px] text-amber-700 font-normal ml-auto">({reportAuthorDept})</span>
              </button>
            </div>

            {/* 報告先上長 */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600 shrink-0">報告先上長:</label>
              {isSubmittedMode ? (
                <div className="flex-1 px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 flex items-center gap-1.5">
                  <UserCheck className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                  <span>{supervisorDisplayName}</span>
                </div>
              ) : (
                <select
                  value={supervisorId}
                  onChange={e => setSupervisorId(e.target.value)}
                  className="flex-1 px-3 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-bold text-slate-800 focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 cursor-pointer"
                >
                  <option value="">（選択してください）</option>
                  {supervisorCandidates.map(u => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.department || '上長'})
                    </option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {!isConfigReady ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 shadow-xs flex flex-col items-center justify-center space-y-3 my-4">
            <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin" />
            <span className="text-xs font-bold text-slate-600">様式設定（{selectedOfficeName}）を読み込んでいます...</span>
          </div>
        ) : (
          <>
            {/* ---------------- 2. メイン作業一覧（10行） PC向け Excel風グリッド ---------------- */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden hidden md:block">
          <div className="bg-slate-800 text-white px-4 py-2.5 flex items-center justify-between">
            <h2 className="text-xs font-bold tracking-wider uppercase flex items-center gap-2">
              <Building2 className="w-4 h-4 text-amber-400" />
              当日作業・点検・取替一覧 (1〜10)
            </h2>
            <span className="text-[11px] text-slate-300">
              ※肌色セルはスケジュール等から自動計算、緑色は手入力欄
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse min-w-[1200px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-300 text-slate-700 font-bold text-[11px]">
                  <th className="p-2 border-r border-slate-200 text-center w-12">番号</th>
                  {visibleColumns.directGoReturn && <th className="p-2 border-r border-slate-200 text-center w-16">直行直帰</th>}
                  <th className="p-2 border-r border-slate-200 w-36">現場名</th>
                  <th className="p-2 border-r border-slate-200 w-32">作業内容</th>
                  {visibleColumns.district && <th className="p-2 border-r border-slate-200 w-20">地区</th>}
                  {visibleColumns.peopleCoworkers && <th className="p-2 border-r border-slate-200 text-center w-14">人数</th>}
                  {visibleColumns.peopleCoworkers && <th className="p-2 border-r border-slate-200 w-24">同行者</th>}
                  <th className="p-2 border-r border-slate-200 text-center w-36">作業時間</th>
                  <th className="p-2 border-r border-slate-200 w-24">内容区分</th>
                  {visibleColumns.inspection && <th className="p-2 border-r border-slate-200 text-center bg-[#FAF3E0] w-24">点検台数/数値</th>}
                  {visibleColumns.oncall && <th className="p-2 border-r border-slate-200 text-center bg-[#FAF3E0] w-28">オンコール金額/数値</th>}
                  {visibleColumns.replacement && <th className="p-2 border-r border-slate-200 text-center bg-[#FAF3E0] w-32">取替台数/金額/数値</th>}
                  {visibleColumns.buildingMaterial && (
                    <th className="p-2 text-center bg-[#E8F8F0] w-24 text-emerald-900 border-l border-emerald-300">
                      建材数値<br /><span className="text-[9px] font-normal text-emerald-700">※手入力</span>
                    </th>
                  )}
                  {visibleColumns.photoReportLink && (
                    <th className="p-2 text-center bg-[#EBF5FF] w-28 text-sky-900 border-l border-sky-300">
                      補充<br /><span className="text-[9px] font-normal text-sky-700">※申請・確認</span>
                    </th>
                  )}
                  {!isSubmittedMode && <th className="p-2 text-center w-16 border-l border-slate-200">操作</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-sans">
                {displayedMainRows.map((row, idx) => (
                  <tr
                    key={row.id}
                    draggable={!isSubmittedMode}
                    onDragStart={(e) => {
                      if (isSubmittedMode) return;
                      setDraggedMainIndex(idx);
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      if (isSubmittedMode) return;
                      e.preventDefault();
                      e.dataTransfer.dropEffect = 'move';
                      if (dragOverMainIndex !== idx) setDragOverMainIndex(idx);
                    }}
                    onDragLeave={() => {
                      if (dragOverMainIndex === idx) setDragOverMainIndex(null);
                    }}
                    onDrop={(e) => {
                      if (isSubmittedMode) return;
                      e.preventDefault();
                      if (draggedMainIndex !== null && draggedMainIndex !== idx) {
                        moveMainRow(draggedMainIndex, idx);
                      }
                      setDraggedMainIndex(null);
                      setDragOverMainIndex(null);
                    }}
                    onDragEnd={() => {
                      setDraggedMainIndex(null);
                      setDragOverMainIndex(null);
                    }}
                    className={`transition-colors ${
                      !isSubmittedMode && draggedMainIndex === idx ? 'opacity-40 bg-amber-100' : 'hover:bg-slate-50'
                    } ${
                      !isSubmittedMode && dragOverMainIndex === idx ? 'border-t-2 border-b-2 border-amber-500 bg-amber-100/70' : ''
                    }`}
                  >
                    {/* 番号 & ドラッグハンドル */}
                    <td className="p-2 border-r border-slate-200 text-center font-bold text-slate-500 bg-slate-50/80">
                      {isSubmittedMode ? (
                        <span>{idx + 1}</span>
                      ) : (
                        <div className="flex items-center justify-center gap-0.5">
                          <span
                            className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-amber-700 p-0.5 rounded transition-colors"
                            title="ドラッグして行順を移動"
                          >
                            <GripVertical className="w-3.5 h-3.5" />
                          </span>
                          <span>{idx + 1}</span>
                        </div>
                      )}
                    </td>

                    {/* 直行・直帰 */}
                    {visibleColumns.directGoReturn && (
                      <td className="p-2 border-r border-slate-200 text-center">
                        {isSubmittedMode ? (
                          <div className="flex items-center justify-center gap-1 text-[10px] font-bold">
                            {row.directGo && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-200">直行</span>}
                            {row.directReturn && <span className="px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-200">直帰</span>}
                            {!row.directGo && !row.directReturn && <span className="text-slate-400 font-normal">-</span>}
                          </div>
                        ) : (
                          <div className="flex items-center justify-center gap-1 text-[10px]">
                            <label className="flex items-center gap-0.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!row.directGo}
                                onChange={e => updateMainRow(idx, { directGo: e.target.checked })}
                                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-3 w-3"
                              />
                              <span>直行</span>
                            </label>
                            <label className="flex items-center gap-0.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!row.directReturn}
                                onChange={e => updateMainRow(idx, { directReturn: e.target.checked })}
                                className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 h-3 w-3"
                              />
                              <span>直帰</span>
                            </label>
                          </div>
                        )}
                      </td>
                    )}

                    {/* 現場名 */}
                    <td className="p-2 border-r border-slate-200 font-semibold text-slate-900">
                      <div className="space-y-1">
                        {isSubmittedMode ? (
                          <div className="font-bold text-slate-900">{row.siteName || <span className="text-slate-400 font-normal">-</span>}</div>
                        ) : (
                          <input
                            type="text"
                            value={row.siteName}
                            onChange={e => updateMainRow(idx, { siteName: e.target.value })}
                            placeholder="現場名"
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-amber-500 bg-white"
                          />
                        )}
                        {(() => {
                          const matchedReport = getInspectionReportForRow(row);
                          const effectiveJobNo = getJobNoForRow(row) || matchedReport?.jobNo;

                          // 1. 作成済みの点検報告書がある場合は「確定」または「下書き」を表示
                          if (matchedReport) {
                            const isSigned = matchedReport.status === 'signed';
                            return (
                              <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!isSigned && !isSubmittedMode) {
                                      setEditingInspectionReport(matchedReport);
                                    } else {
                                      setPreviewInspectionReport(matchedReport);
                                    }
                                  }}
                                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold border transition-colors shadow-2xs cursor-pointer ${
                                    isSigned
                                      ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                      : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                  }`}
                                  title={`点検報告書: ${isSigned ? '確定 (サイン済)' : '下書き'}`}
                                >
                                  <FileText className={`w-3 h-3 ${isSigned ? 'text-emerald-600' : 'text-amber-600'} shrink-0`} />
                                  <span>{isSigned ? '確定' : '下書き'}</span>
                                </button>
                              </div>
                            );
                          }

                          // 2. 報告書未作成の場合: 作業Noで連携できる状況にあるもののみ「未作成」を表示、そもそも作業Noがないものは非表示
                          if (!effectiveJobNo) {
                            return null;
                          }

                          return (
                            <div className="flex items-center gap-1.5 flex-wrap pt-0.5">
                              {isSubmittedMode ? (
                                <span
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-slate-200 bg-slate-50 text-slate-400 cursor-default"
                                  title="点検報告書: 未作成"
                                >
                                  <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>未作成</span>
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleOpenCreateReport(row)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium border border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100 transition-colors shadow-2xs cursor-pointer"
                                  title="点検報告書: 未作成 (クリックで作成)"
                                >
                                  <FileText className="w-3 h-3 text-slate-400 shrink-0" />
                                  <span>未作成</span>
                                </button>
                              )}
                            </div>
                          );
                        })()}
                      </div>
                    </td>

                    {/* 作業内容 */}
                    <td className="p-2 border-r border-slate-200 text-slate-800">
                      {isSubmittedMode ? (
                        <span>{row.workDescription || <span className="text-slate-400">-</span>}</span>
                      ) : (
                        <input
                          type="text"
                          value={row.workDescription}
                          onChange={e => updateMainRow(idx, { workDescription: e.target.value })}
                          placeholder="作業内容"
                          className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-amber-500 bg-white"
                        />
                      )}
                    </td>

                    {/* 地区 */}
                    {visibleColumns.district && (
                      <td className="p-2 border-r border-slate-200 text-slate-700">
                        {isSubmittedMode ? (
                          <span>{row.district || <span className="text-slate-400">-</span>}</span>
                        ) : (
                          <input
                            type="text"
                            value={row.district}
                            onChange={e => updateMainRow(idx, { district: e.target.value })}
                            placeholder="地区"
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-amber-500 bg-white"
                          />
                        )}
                      </td>
                    )}

                    {/* 人数 */}
                    {visibleColumns.peopleCoworkers && (
                      <td className="p-2 border-r border-slate-200 text-center text-slate-700">
                        {isSubmittedMode ? (
                          <span>{row.peopleCount ? `${row.peopleCount}人` : '-'}</span>
                        ) : (
                          <input
                            type="number"
                            min={1}
                            value={row.peopleCount || ''}
                            onChange={e => updateMainRow(idx, { peopleCount: Number(e.target.value) })}
                            className="w-12 px-1 py-1 border border-slate-200 rounded text-xs text-center focus:ring-1 focus:ring-amber-500 bg-white"
                          />
                        )}
                      </td>
                    )}

                    {/* 同行者 */}
                    {visibleColumns.peopleCoworkers && (
                      <td className="p-2 border-r border-slate-200 text-slate-700">
                        {isSubmittedMode ? (
                          <span>{row.coworkers || <span className="text-slate-400">-</span>}</span>
                        ) : (
                          <input
                            type="text"
                            value={row.coworkers}
                            onChange={e => updateMainRow(idx, { coworkers: e.target.value })}
                            placeholder="同行者"
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-amber-500 bg-white"
                          />
                        )}
                      </td>
                    )}

                    {/* 作業時間 開始 〜 終了 & 算出時間 */}
                    <td className="p-2 border-r border-slate-200 text-center">
                      {isSubmittedMode ? (
                        <div className="font-semibold text-slate-800">
                          {row.startTime || row.endTime ? (
                            <span>{row.startTime || '--:--'} 〜 {row.endTime || '--:--'}</span>
                          ) : (
                            <span className="text-slate-400 font-normal">-</span>
                          )}
                          {row.workHours && row.workHours !== '0:00' && (
                            <div className="text-[10px] text-amber-700 font-bold mt-0.5">
                              ({row.workHours})
                            </div>
                          )}
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="time"
                              value={row.startTime}
                              onChange={e => updateMainRow(idx, { startTime: e.target.value })}
                              className="w-16 p-0.5 border border-slate-200 rounded text-[11px] text-center bg-white"
                            />
                            <span className="text-slate-400">〜</span>
                            <input
                              type="time"
                              value={row.endTime}
                              onChange={e => updateMainRow(idx, { endTime: e.target.value })}
                              className="w-16 p-0.5 border border-slate-200 rounded text-[11px] text-center bg-white"
                            />
                          </div>
                          {row.workHours && row.workHours !== '0:00' && (
                            <div className="text-[10px] text-amber-700 font-semibold mt-0.5">
                              ({row.workHours})
                            </div>
                          )}
                        </>
                      )}
                    </td>

                    {/* 内容区分 (EG取替, 見積, 修理, 単体取替等) */}
                    <td className="p-2 border-r border-slate-200">
                      {isSubmittedMode ? (
                        row.contentType ? (
                          <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-200 text-[11px] font-bold">
                            {row.contentType}
                          </span>
                        ) : (
                          <span className="text-slate-400">-</span>
                        )
                      ) : (
                        <select
                          value={row.contentType}
                          onChange={e => updateMainRow(idx, { contentType: e.target.value })}
                          className="w-full px-1.5 py-1 border border-slate-200 rounded text-xs font-semibold bg-white"
                        >
                          <option value="">（内容）</option>
                          <option value="EG取替">EG取替</option>
                          <option value="単体取替">単体取替</option>
                          <option value="修理">修理</option>
                          <option value="オンコール">オンコール</option>
                          <option value="点検">点検</option>
                          <option value="見積">見積</option>
                        </select>
                      )}
                    </td>

                    {/* 点検台数 / 点検数値 (肌色) */}
                    {visibleColumns.inspection && (
                      <td className="p-2 border-r border-slate-200 bg-[#FAF3E0] text-center">
                        {isSubmittedMode ? (
                          (row.inspectionCount || row.inspectionValue) ? (
                            <span className="font-bold text-amber-950">
                              {row.inspectionCount || 0}台 / {row.inspectionValue || 0}pt
                            </span>
                          ) : (
                            <span className="text-amber-800/40">-</span>
                          )
                        ) : (
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="number"
                              placeholder="台"
                              value={row.inspectionCount || ''}
                              onChange={e => updateMainRow(idx, { inspectionCount: Number(e.target.value) })}
                              className="w-10 px-1 py-0.5 border border-amber-200 rounded text-xs text-center bg-white"
                            />
                            <input
                              type="number"
                              placeholder="数値"
                              value={row.inspectionValue || ''}
                              onChange={e => updateMainRow(idx, { inspectionValue: Number(e.target.value) })}
                              className="w-12 px-1 py-0.5 border border-amber-200 rounded text-xs text-center bg-white"
                            />
                          </div>
                        )}
                      </td>
                    )}

                    {/* オンコール金額 / 数値 (肌色) */}
                    {visibleColumns.oncall && (
                      <td className="p-2 border-r border-slate-200 bg-[#FAF3E0] text-center">
                        {isSubmittedMode ? (
                          (row.oncallAmount || row.oncallValue) ? (
                            <span className="font-bold text-amber-950">
                              ¥{(row.oncallAmount || 0).toLocaleString()} ({row.oncallValue || 0}pt)
                            </span>
                          ) : (
                            <span className="text-amber-800/40">-</span>
                          )
                        ) : (
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="number"
                              placeholder="金額(円)"
                              value={row.oncallAmount || ''}
                              onChange={e => updateMainRow(idx, { oncallAmount: Number(e.target.value) })}
                              className="w-16 px-1 py-0.5 border border-amber-200 rounded text-xs text-right bg-white"
                            />
                            <input
                              type="number"
                              placeholder="数値"
                              value={row.oncallValue || ''}
                              onChange={e => updateMainRow(idx, { oncallValue: Number(e.target.value) })}
                              className="w-12 px-1 py-0.5 border border-amber-200 rounded text-xs text-center bg-white"
                            />
                          </div>
                        )}
                      </td>
                    )}

                    {/* 取替台数 / 金額 / 数値 (肌色) */}
                    {visibleColumns.replacement && (
                      <td className="p-2 border-r border-slate-200 bg-[#FAF3E0] text-center">
                        {isSubmittedMode ? (
                          (row.replacementCount || row.replacementAmount || row.replacementValue) ? (
                            <span className="font-bold text-amber-950">
                              {row.replacementCount || 0}台 / ¥{(row.replacementAmount || 0).toLocaleString()} ({row.replacementValue || 0}pt)
                            </span>
                          ) : (
                            <span className="text-amber-800/40">-</span>
                          )
                        ) : (
                          <div className="flex items-center gap-1 justify-center">
                            <input
                              type="number"
                              placeholder="台"
                              value={row.replacementCount || ''}
                              onChange={e => updateMainRow(idx, { replacementCount: Number(e.target.value) })}
                              className="w-8 px-1 py-0.5 border border-amber-200 rounded text-xs text-center bg-white"
                            />
                            <input
                              type="number"
                              placeholder="金額(円)"
                              value={row.replacementAmount || ''}
                              onChange={e => updateMainRow(idx, { replacementAmount: Number(e.target.value) })}
                              className="w-16 px-1 py-0.5 border border-amber-200 rounded text-xs text-right bg-white"
                            />
                            <input
                              type="number"
                              placeholder="数値"
                              value={row.replacementValue || ''}
                              onChange={e => updateMainRow(idx, { replacementValue: Number(e.target.value) })}
                              className="w-10 px-1 py-0.5 border border-amber-200 rounded text-xs text-center bg-white"
                            />
                          </div>
                        )}
                      </td>
                    )}

                    {/* 建材数値 (緑色 ※手入力) */}
                    {visibleColumns.buildingMaterial && (
                      <td className="p-2 bg-[#E8F8F0] border-l border-emerald-300 text-center font-bold text-emerald-950">
                        {isSubmittedMode ? (
                          <span>{row.buildingMaterialValue || 0}</span>
                        ) : (
                          <input
                            type="number"
                            placeholder="0"
                            value={row.buildingMaterialValue || ''}
                            onChange={e => updateMainRow(idx, { buildingMaterialValue: Number(e.target.value) })}
                            className="w-full px-2 py-1 border border-emerald-400 rounded text-xs text-center font-bold text-emerald-950 bg-white focus:ring-2 focus:ring-emerald-500/20"
                          />
                        )}
                      </td>
                    )}

                    {/* 補充ボタン列 */}
                    {visibleColumns.photoReportLink && (
                      <td className="p-1 border-l border-slate-200 text-center bg-slate-50/50">
                        {(() => {
                          const existingApp = getSupplyApplicationForSite(row.siteName);
                          const isSiteEmpty = !row.siteName || !row.siteName.trim();

                          if (existingApp) {
                            let badgeColor = 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200 shadow-2xs';
                            let statusText = '申請中';
                            if (existingApp.status === 'approved') {
                              badgeColor = 'bg-emerald-100 text-emerald-900 border-emerald-300 hover:bg-emerald-200 shadow-2xs';
                              statusText = '承認済';
                            } else if (existingApp.status === 'rejected') {
                              badgeColor = 'bg-rose-100 text-rose-900 border-rose-300 hover:bg-rose-200 shadow-2xs';
                              statusText = '却下';
                            } else if (existingApp.status === 'draft') {
                              badgeColor = 'bg-slate-100 text-slate-800 border-slate-300 hover:bg-slate-200 shadow-2xs';
                              statusText = '下書き';
                            }

                            return (
                              <button
                                type="button"
                                onClick={() => handleOpenSupplyModal(row.siteName)}
                                className={`w-full px-1.5 py-1 text-[11px] font-bold rounded border flex items-center justify-center gap-1 mx-auto transition-colors cursor-pointer ${badgeColor}`}
                                title="クリックで補充申請の内容を確認・変更"
                              >
                                <PackageCheck className="w-3.5 h-3.5 shrink-0" />
                                <span className="truncate">補充 ({statusText})</span>
                              </button>
                            );
                          }

                          if (isSubmittedMode) {
                            return <span className="text-slate-400 text-[11px]">-</span>;
                          }

                          return (
                            <button
                              type="button"
                              onClick={() => {
                                if (isSiteEmpty) {
                                  alert('補充申請を作成するには、先に現場名を入力してください。');
                                  return;
                                }
                                handleOpenSupplyModal(row.siteName);
                              }}
                              className={`w-full px-2 py-1 text-[11px] font-bold rounded border flex items-center justify-center gap-1 mx-auto transition-all ${
                                isSiteEmpty 
                                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed opacity-60' 
                                  : 'bg-sky-50 text-sky-700 border-sky-300 hover:bg-sky-100 hover:text-sky-800 shadow-2xs cursor-pointer'
                              }`}
                              title={isSiteEmpty ? '現場名を入力すると補充依頼できます' : 'この現場の補充申請を作成'}
                            >
                              <PackagePlus className="w-3.5 h-3.5 shrink-0 text-sky-600" />
                              <span>補充</span>
                            </button>
                          );
                        })()}
                      </td>
                    )}

                    {/* 行移動・削除ボタン列（編集モード時のみ） */}
                    {!isSubmittedMode && (
                      <td className="p-1 border-l border-slate-200 text-center bg-slate-50/40">
                        <div className="flex items-center justify-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => moveMainRow(idx, idx - 1)}
                            disabled={idx === 0}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                            title="上へ移動"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => moveMainRow(idx, idx + 1)}
                            disabled={idx === mainWorkRows.length - 1}
                            className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                            title="下へ移動"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteMainRow(idx)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                            title="この行を削除"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}

                {/* 集計行 */}
                <tr className="bg-amber-100/60 font-bold border-t-2 border-slate-300 text-slate-800">
                  <td colSpan={3 + (visibleColumns.directGoReturn ? 1 : 0) + (visibleColumns.district ? 1 : 0) + (visibleColumns.peopleCoworkers ? 2 : 0)} className="p-2 text-right border-r border-slate-300">
                    作業時間計 / 各種小計:
                  </td>
                  <td className="p-2 text-center border-r border-slate-300 font-extrabold text-amber-900">
                    {mainTableTotals.workHoursStr}
                  </td>
                  <td className="p-2 border-r border-slate-300"></td>
                  {visibleColumns.inspection && (
                    <td className="p-2 text-center border-r border-slate-300 text-amber-950">
                      {mainTableTotals.inspectionCount}台 / {mainTableTotals.inspectionValue}pt
                    </td>
                  )}
                  {visibleColumns.oncall && (
                    <td className="p-2 text-center border-r border-slate-300 text-amber-950">
                      ¥{mainTableTotals.oncallAmount.toLocaleString()} ({mainTableTotals.oncallValue}pt)
                    </td>
                  )}
                  {visibleColumns.replacement && (
                    <td className="p-2 text-center border-r border-slate-300 text-amber-950">
                      {mainTableTotals.replacementCount}台 / ¥{mainTableTotals.replacementAmount.toLocaleString()} ({mainTableTotals.replacementValue}pt)
                    </td>
                  )}
                  {visibleColumns.buildingMaterial && (
                    <td className="p-2 text-center font-bold text-emerald-900 bg-emerald-100/70 border-l border-emerald-300">
                      {mainTableTotals.buildingMaterialValue}
                    </td>
                  )}
                  {visibleColumns.photoReportLink && (
                    <td className="p-2 text-center bg-slate-100 border-l border-slate-300 text-slate-400 font-normal text-[11px]">-</td>
                  )}
                  {!isSubmittedMode && (
                    <td className="p-2 text-center bg-slate-100 border-l border-slate-300 text-slate-400 font-normal text-[11px]">-</td>
                  )}
                </tr>
              </tbody>
            </table>
          </div>

          {/* 作業行追加フッター（編集モード時のみ） */}
          {!isSubmittedMode && (
            <div className="p-2.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => addMainRow()}
                className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                作業行を追加
              </button>
              <span className="text-[11px] font-semibold text-slate-500 flex items-center gap-1">
                <GripVertical className="w-3.5 h-3.5 text-amber-500" />
                行頭アイコン（⋮⋮）をドラッグ＆ドロップ、または上下矢印で順序を入れ替えられます。
              </span>
            </div>
          )}
        </div>

        {/* ---------------- 2. メイン作業一覧（スマホ向けレスポンシブ表示） ---------------- */}
        <div className="md:hidden space-y-3">
          <div className="bg-slate-800 text-white p-3 rounded-xl flex items-center justify-between">
            <h2 className="text-xs font-bold flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-amber-400" />
              当日作業・点検一覧 (カード形式)
            </h2>
            {!isSubmittedMode && (
              <button
                type="button"
                onClick={handleAutoLoadSchedule}
                className="px-2 py-1 bg-amber-500 text-white rounded text-[11px] font-bold"
              >
                自動取込
              </button>
            )}
          </div>

          {displayedMainRows.map((row, idx) => {
            const isExpanded = expandedMobileRow === row.id;
            const hasData = !!row.siteName || !!row.contentType;

            return (
              <div
                key={row.id}
                className={`bg-white rounded-xl border transition-all ${
                  hasData ? 'border-amber-300 shadow-xs' : 'border-slate-200'
                }`}
              >
                {/* カードヘッダー */}
                <div
                  onClick={() => setExpandedMobileRow(isExpanded ? null : row.id)}
                  className="p-3 bg-slate-50 rounded-t-xl flex items-center justify-between cursor-pointer border-b border-slate-100"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="w-5 h-5 rounded-full bg-amber-500 text-white text-[11px] font-bold flex items-center justify-center shrink-0">
                      {idx + 1}
                    </span>
                    <span className="font-bold text-xs text-slate-900 truncate">
                      {row.siteName || `現場 ${idx + 1} (未入力)`}
                    </span>
                    {row.contentType && (
                      <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded text-[10px] font-bold shrink-0">
                        {row.contentType}
                      </span>
                    )}
                    {(() => {
                      const matchedReport = getInspectionReportForRow(row);
                      const effectiveJobNo = getJobNoForRow(row) || matchedReport?.jobNo;

                      if (matchedReport) {
                        const isSigned = matchedReport.status === 'signed';
                        return (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (!isSigned && !isSubmittedMode) {
                                setEditingInspectionReport(matchedReport);
                              } else {
                                setPreviewInspectionReport(matchedReport);
                              }
                            }}
                            className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold border shrink-0 transition-colors shadow-2xs cursor-pointer ${
                              isSigned
                                ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                            }`}
                            title={`点検報告書: ${isSigned ? '確定 (サイン済)' : '下書き'}`}
                          >
                            <FileText className={`w-3 h-3 ${isSigned ? 'text-emerald-600' : 'text-amber-600'}`} />
                            <span>{isSigned ? '確定' : '下書き'}</span>
                          </button>
                        );
                      }

                      // 報告書未作成の場合: 作業Noで連携できる状況にあるもののみ「未作成」を表示、そもそも作業Noがないものは非表示
                      if (!effectiveJobNo) return null;

                      return (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (!isSubmittedMode) handleOpenCreateReport(row);
                          }}
                          className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium border shrink-0 border-slate-200 bg-slate-50 text-slate-400 ${
                            !isSubmittedMode ? 'cursor-pointer hover:bg-slate-100' : 'cursor-default'
                          }`}
                          title="点検報告書: 未作成"
                        >
                          <FileText className="w-3 h-3 text-slate-400" />
                          <span>未作成</span>
                        </button>
                      );
                    })()}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {row.workHours && row.workHours !== '0:00' && (
                      <span className="text-[11px] font-bold text-amber-700 mr-1">{row.workHours}</span>
                    )}
                    {!isSubmittedMode && (
                      <>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveMainRow(idx, idx - 1); }}
                          disabled={idx === 0}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                          title="上へ移動"
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); moveMainRow(idx, idx + 1); }}
                          disabled={idx === mainWorkRows.length - 1}
                          className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                          title="下へ移動"
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.stopPropagation(); deleteMainRow(idx); }}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer transition-colors"
                          title="この行を削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400 ml-0.5" /> : <ChevronDown className="w-4 h-4 text-slate-400 ml-0.5" />}
                  </div>
                </div>

                {/* カード詳細ボディ */}
                {isExpanded && (
                  <div className="p-3.5 space-y-3 text-xs bg-white rounded-b-xl">
                    {/* 直行直帰 */}
                    <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-lg">
                      <span className="font-bold text-slate-600">直行直帰:</span>
                      {isSubmittedMode ? (
                        <div className="flex items-center gap-2">
                          {row.directGo && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[11px]">直行</span>}
                          {row.directReturn && <span className="px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[11px]">直帰</span>}
                          {!row.directGo && !row.directReturn && <span className="text-slate-400">-</span>}
                        </div>
                      ) : (
                        <>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={!!row.directGo}
                              onChange={e => updateMainRow(idx, { directGo: e.target.checked })}
                              className="rounded text-amber-600 h-4 w-4"
                            />
                            <span>直行</span>
                          </label>
                          <label className="flex items-center gap-1">
                            <input
                              type="checkbox"
                              checked={!!row.directReturn}
                              onChange={e => updateMainRow(idx, { directReturn: e.target.checked })}
                              className="rounded text-amber-600 h-4 w-4"
                            />
                            <span>直帰</span>
                          </label>
                        </>
                      )}
                    </div>

                    {/* 現場名 & 作業内容 */}
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <div className="flex items-center justify-between mb-1 gap-1.5 flex-wrap">
                          <label className="text-[11px] font-bold text-slate-600">現場名</label>
                          <div className="flex items-center gap-1.5 flex-wrap">
                            {(() => {
                              const matchedReport = getInspectionReportForRow(row);
                              const effectiveJobNo = getJobNoForRow(row) || matchedReport?.jobNo;

                              if (matchedReport) {
                                const isSigned = matchedReport.status === 'signed';
                                return (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      if (!isSigned && !isSubmittedMode) {
                                        setEditingInspectionReport(matchedReport);
                                      } else {
                                        setPreviewInspectionReport(matchedReport);
                                      }
                                    }}
                                    className={`px-2 py-0.5 text-[10px] font-bold rounded-full border flex items-center gap-1 shadow-2xs cursor-pointer ${
                                      isSigned
                                        ? 'bg-emerald-50 text-emerald-800 border-emerald-300 hover:bg-emerald-100'
                                        : 'bg-amber-50 text-amber-800 border-amber-300 hover:bg-amber-100'
                                    }`}
                                    title={`点検報告書: ${isSigned ? '確定 (サイン済)' : '下書き'}`}
                                  >
                                    <FileText className={`w-3 h-3 ${isSigned ? 'text-emerald-600' : 'text-amber-600'}`} />
                                    <span>{isSigned ? '確定' : '下書き'}</span>
                                  </button>
                                );
                              }

                              // 報告書未作成の場合: 作業Noで連携できる状況にあるもののみ「未作成」を表示、そもそも作業Noがないものは非表示
                              if (!effectiveJobNo) return null;

                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    if (!isSubmittedMode) handleOpenCreateReport(row);
                                  }}
                                  className={`px-2 py-0.5 text-[10px] font-medium rounded-full border border-slate-200 bg-slate-50 text-slate-400 flex items-center gap-1 shadow-2xs ${
                                    !isSubmittedMode ? 'cursor-pointer hover:bg-slate-100' : 'cursor-default'
                                  }`}
                                  title="点検報告書: 未作成"
                                >
                                  <FileText className="w-3 h-3 text-slate-400" />
                                  <span>未作成</span>
                                </button>
                              );
                            })()}
                            {(() => {
                              const existingApp = getSupplyApplicationForSite(row.siteName);
                            const isSiteEmpty = !row.siteName || !row.siteName.trim();
                            if (existingApp) {
                              let badgeColor = 'bg-amber-100 text-amber-900 border-amber-300';
                              let statusText = '申請中';
                              if (existingApp.status === 'approved') {
                                badgeColor = 'bg-emerald-100 text-emerald-900 border-emerald-300';
                                statusText = '承認済';
                              } else if (existingApp.status === 'rejected') {
                                badgeColor = 'bg-rose-100 text-rose-900 border-rose-300';
                                statusText = '却下';
                              }
                              return (
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleOpenSupplyModal(row.siteName);
                                  }}
                                  className={`px-2 py-0.5 text-[10px] font-bold rounded border flex items-center gap-1 ${badgeColor}`}
                                >
                                  <PackageCheck className="w-3 h-3" />
                                  <span>補充 ({statusText})</span>
                                </button>
                              );
                            }
                            if (isSubmittedMode) {
                              return null;
                            }
                            return (
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  if (isSiteEmpty) {
                                    alert('補充申請を作成するには、先に現場名を入力してください。');
                                    return;
                                  }
                                  handleOpenSupplyModal(row.siteName);
                                }}
                                disabled={isSiteEmpty}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded border flex items-center gap-1 ${
                                  isSiteEmpty 
                                    ? 'bg-slate-100 text-slate-400 border-slate-200' 
                                    : 'bg-sky-50 text-sky-700 border-sky-300'
                                }`}
                              >
                                <PackagePlus className="w-3 h-3 text-sky-600" />
                                <span>補充依頼</span>
                              </button>
                            );
                          })()}
                          </div>
                        </div>
                        {isSubmittedMode ? (
                          <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-slate-900">
                            {row.siteName || '-'}
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={row.siteName}
                            onChange={e => updateMainRow(idx, { siteName: e.target.value })}
                            className="w-full p-2 border border-slate-300 rounded text-xs bg-white"
                          />
                        )}
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600">作業内容</label>
                        {isSubmittedMode ? (
                          <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800">
                            {row.workDescription || '-'}
                          </div>
                        ) : (
                          <input
                            type="text"
                            value={row.workDescription}
                            onChange={e => updateMainRow(idx, { workDescription: e.target.value })}
                            className="w-full p-2 border border-slate-300 rounded text-xs bg-white"
                          />
                        )}
                      </div>
                    </div>

                    {/* 時間 & 区分 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600">開始 〜 終了</label>
                        {isSubmittedMode ? (
                          <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs text-center font-bold text-slate-800">
                            {row.startTime || row.endTime ? `${row.startTime || '--:--'} 〜 ${row.endTime || '--:--'}` : '-'}
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <input
                              type="time"
                              value={row.startTime}
                              onChange={e => updateMainRow(idx, { startTime: e.target.value })}
                              className="w-full p-1.5 border border-slate-300 rounded text-xs text-center"
                            />
                            <span>〜</span>
                            <input
                              type="time"
                              value={row.endTime}
                              onChange={e => updateMainRow(idx, { endTime: e.target.value })}
                              className="w-full p-1.5 border border-slate-300 rounded text-xs text-center"
                            />
                          </div>
                        )}
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600">内容区分</label>
                        {isSubmittedMode ? (
                          <div className="p-2 bg-slate-50 border border-slate-200 rounded text-xs font-bold text-slate-800">
                            {row.contentType || '-'}
                          </div>
                        ) : (
                          <select
                            value={row.contentType}
                            onChange={e => updateMainRow(idx, { contentType: e.target.value })}
                            className="w-full p-1.5 border border-slate-300 rounded text-xs font-bold"
                          >
                            <option value="">（内容）</option>
                            <option value="EG取替">EG取替</option>
                            <option value="単体取替">単体取替</option>
                            <option value="修理">修理</option>
                            <option value="オンコール">オンコール</option>
                            <option value="点検">点検</option>
                            <option value="見積">見積</option>
                          </select>
                        )}
                      </div>
                    </div>

                    {/* オンコール・取替数値 (肌色) */}
                    <div className="bg-[#FAF3E0] p-2.5 rounded-lg border border-amber-200 space-y-2">
                      <div className="text-[11px] font-bold text-amber-900">オンコール・取替自動計算:</div>
                      {isSubmittedMode ? (
                        <div className="grid grid-cols-3 gap-2 text-center text-xs">
                          <div className="bg-white/80 p-1.5 rounded border border-amber-200">
                            <span className="text-[10px] text-amber-800 block">取替台数</span>
                            <span className="font-bold text-amber-950">{row.replacementCount ? `${row.replacementCount}台` : '-'}</span>
                          </div>
                          <div className="bg-white/80 p-1.5 rounded border border-amber-200">
                            <span className="text-[10px] text-amber-800 block">取替金額</span>
                            <span className="font-bold text-amber-950">{row.replacementAmount ? `¥${row.replacementAmount.toLocaleString()}` : '-'}</span>
                          </div>
                          <div className="bg-white/80 p-1.5 rounded border border-amber-200">
                            <span className="text-[10px] text-amber-800 block">取替pt</span>
                            <span className="font-bold text-amber-950">{row.replacementValue ? `${row.replacementValue}pt` : '-'}</span>
                          </div>
                        </div>
                      ) : (
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <div>
                            <span className="text-[10px] text-amber-800">取替台数</span>
                            <input
                              type="number"
                              value={row.replacementCount || ''}
                              onChange={e => updateMainRow(idx, { replacementCount: Number(e.target.value) })}
                              className="w-full p-1 border border-amber-300 rounded text-center bg-white"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-amber-800">取替金額</span>
                            <input
                              type="number"
                              value={row.replacementAmount || ''}
                              onChange={e => updateMainRow(idx, { replacementAmount: Number(e.target.value) })}
                              className="w-full p-1 border border-amber-300 rounded text-right bg-white"
                            />
                          </div>
                          <div>
                            <span className="text-[10px] text-amber-800">取替pt</span>
                            <input
                              type="number"
                              value={row.replacementValue || ''}
                              onChange={e => updateMainRow(idx, { replacementValue: Number(e.target.value) })}
                              className="w-full p-1 border border-amber-300 rounded text-center bg-white"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* 建材数値 (緑色 ※手入力) */}
                    <div className="bg-[#E8F8F0] p-2.5 rounded-lg border border-emerald-300">
                      <label className="text-[11px] font-bold text-emerald-900 flex items-center justify-between mb-1">
                        <span>建材数値</span>
                        <span className="text-[10px] text-emerald-700 bg-emerald-200/60 px-1.5 py-0.2 rounded font-normal">※手入力</span>
                      </label>
                      {isSubmittedMode ? (
                        <div className="p-2 bg-white/80 border border-emerald-400 rounded text-center font-bold text-emerald-950 text-xs">
                          {row.buildingMaterialValue ?? 0}
                        </div>
                      ) : (
                        <input
                          type="number"
                          placeholder="0"
                          value={row.buildingMaterialValue || ''}
                          onChange={e => updateMainRow(idx, { buildingMaterialValue: Number(e.target.value) })}
                          className="w-full p-2 border border-emerald-400 rounded text-center font-bold text-emerald-950 bg-white"
                        />
                      )}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
          {/* モバイル用作業行追加ボタン */}
          {!isSubmittedMode && (
            <button
              type="button"
              onClick={() => addMainRow()}
              className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              作業行を追加
            </button>
          )}
        </div>

        {/* ---------------- 3. 事務（見積）作業報告（5行） ---------------- */}
        {visibleColumns.showOfficeWorkTable && (
          <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-600" />
                事務（見積）作業報告
              </h2>
              {!isSubmittedMode && (
                <button
                  type="button"
                  onClick={addOfficeRow}
                  className="px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center gap-1"
                >
                  <Plus className="w-3.5 h-3.5" />
                  事務行を追加
                </button>
              )}
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-xs text-left border-collapse min-w-[750px]">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                    <th className="p-2 border-r border-slate-200 text-center w-12">番号</th>
                    <th className="p-2 border-r border-slate-200 w-36">見積提出先</th>
                    <th className="p-2 border-r border-slate-200">内容</th>
                    <th className="p-2 border-r border-slate-200 w-28 text-right">金額(円)</th>
                    <th className="p-2 border-r border-slate-200 w-28 text-center">決定予定月</th>
                    <th className="p-2 border-r border-slate-200 w-20 text-center">時間(分)</th>
                    <th className="p-2 border-r border-slate-200 w-36">備考</th>
                    {!isSubmittedMode && <th className="p-2 text-center w-16">操作</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200">
                  {displayedOfficeRows.map((row, idx) => (
                    <tr
                      key={row.id}
                      draggable={!isSubmittedMode}
                      onDragStart={(e) => {
                        if (isSubmittedMode) return;
                        setDraggedOfficeIndex(idx);
                        e.dataTransfer.effectAllowed = 'move';
                      }}
                      onDragOver={(e) => {
                        if (isSubmittedMode) return;
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                        if (dragOverOfficeIndex !== idx) setDragOverOfficeIndex(idx);
                      }}
                      onDragLeave={() => {
                        if (dragOverOfficeIndex === idx) setDragOverOfficeIndex(null);
                      }}
                      onDrop={(e) => {
                        if (isSubmittedMode) return;
                        e.preventDefault();
                        if (draggedOfficeIndex !== null && draggedOfficeIndex !== idx) {
                          moveOfficeRow(draggedOfficeIndex, idx);
                        }
                        setDraggedOfficeIndex(null);
                        setDragOverOfficeIndex(null);
                      }}
                      onDragEnd={() => {
                        setDraggedOfficeIndex(null);
                        setDragOverOfficeIndex(null);
                      }}
                      className={`transition-colors select-none ${
                        !isSubmittedMode && draggedOfficeIndex === idx ? 'opacity-40 bg-indigo-100' : 'hover:bg-slate-50'
                      } ${
                        !isSubmittedMode && dragOverOfficeIndex === idx ? 'border-t-2 border-b-2 border-indigo-500 bg-indigo-100/70' : ''
                      }`}
                    >
                      {/* 番号 */}
                      <td className="p-2 border-r border-slate-200 text-center font-bold text-slate-500 bg-slate-50/80">
                        {isSubmittedMode ? (
                          <span>{idx + 1}</span>
                        ) : (
                          <div className="flex items-center justify-center gap-0.5">
                            <span
                              className="cursor-grab active:cursor-grabbing text-slate-400 hover:text-indigo-700 p-0.5 rounded transition-colors"
                              title="ドラッグして行順を移動"
                            >
                              <GripVertical className="w-3.5 h-3.5" />
                            </span>
                            <span>{idx + 1}</span>
                          </div>
                        )}
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        {isSubmittedMode ? (
                          <span className="font-semibold text-slate-800">{row.destination || <span className="text-slate-400 font-normal">-</span>}</span>
                        ) : (
                          <input
                            type="text"
                            value={row.destination}
                            onChange={e => {
                              const next = [...officeWorkRows];
                              next[idx].destination = e.target.value;
                              setOfficeWorkRows(next);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white"
                          />
                        )}
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        {isSubmittedMode ? (
                          <span className="text-slate-700">{row.content || <span className="text-slate-400 font-normal">-</span>}</span>
                        ) : (
                          <input
                            type="text"
                            value={row.content}
                            onChange={e => {
                              const next = [...officeWorkRows];
                              next[idx].content = e.target.value;
                              setOfficeWorkRows(next);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white"
                          />
                        )}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-right">
                        {isSubmittedMode ? (
                          <span className="font-semibold text-slate-800">{row.amount ? `¥${row.amount.toLocaleString()}` : <span className="text-slate-400 font-normal">-</span>}</span>
                        ) : (
                          <input
                            type="number"
                            value={row.amount || ''}
                            onChange={e => {
                              const next = [...officeWorkRows];
                              next[idx].amount = Number(e.target.value);
                              setOfficeWorkRows(next);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-right bg-white"
                          />
                        )}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center">
                        {isSubmittedMode ? (
                          <span>{row.targetMonth || <span className="text-slate-400 font-normal">-</span>}</span>
                        ) : (
                          <input
                            type="text"
                            placeholder=""
                            value={row.targetMonth}
                            onChange={e => {
                              const next = [...officeWorkRows];
                              next[idx].targetMonth = e.target.value;
                              setOfficeWorkRows(next);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-center bg-white"
                          />
                        )}
                      </td>
                      <td className="p-2 border-r border-slate-200 text-center">
                        {isSubmittedMode ? (
                          <span>{row.timeMinutes ? `${row.timeMinutes}分` : <span className="text-slate-400 font-normal">-</span>}</span>
                        ) : (
                          <input
                            type="number"
                            value={row.timeMinutes || ''}
                            onChange={e => {
                              const next = [...officeWorkRows];
                              next[idx].timeMinutes = Number(e.target.value);
                              setOfficeWorkRows(next);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-center bg-white"
                          />
                        )}
                      </td>
                      <td className="p-2 border-r border-slate-200">
                        {isSubmittedMode ? (
                          <span className="text-slate-600">{row.remarks || <span className="text-slate-400 font-normal">-</span>}</span>
                        ) : (
                          <input
                            type="text"
                            value={row.remarks}
                            onChange={e => {
                              const next = [...officeWorkRows];
                              next[idx].remarks = e.target.value;
                              setOfficeWorkRows(next);
                            }}
                            className="w-full px-2 py-1 border border-slate-200 rounded text-xs bg-white"
                          />
                        )}
                      </td>
                      {/* 操作列 */}
                      {!isSubmittedMode && (
                        <td className="p-1 text-center bg-slate-50/40">
                          <div className="flex items-center justify-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => moveOfficeRow(idx, idx - 1)}
                              disabled={idx === 0}
                              className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                              title="上へ移動"
                            >
                              <ArrowUp className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => moveOfficeRow(idx, idx + 1)}
                              disabled={idx === officeWorkRows.length - 1}
                              className="p-1 text-slate-400 hover:text-slate-700 disabled:opacity-20 cursor-pointer"
                              title="下へ移動"
                            >
                              <ArrowDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => deleteOfficeRow(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                              title="この行を削除"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                  {isSubmittedMode && displayedOfficeRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-4 text-center text-slate-400">
                        事務（見積）作業報告の記入はありません
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* その他事務作業 */}
            <div className="pt-2">
              <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center justify-between">
                <span>その他事務作業:</span>
                {!isSubmittedMode && (
                  <VoiceInputButton
                    currentValue={otherOfficeWork}
                    onValueChange={setOtherOfficeWork}
                    size="xs"
                    label="音声入力"
                    variant="subtle"
                    title="事務作業内容を音声で入力（クリックで開始/停止）"
                  />
                )}
              </label>
              {isSubmittedMode ? (
                <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 text-xs text-slate-800 whitespace-pre-wrap min-h-[44px]">
                  {otherOfficeWork || <span className="text-slate-400">（記入なし）</span>}
                </div>
              ) : (
                <textarea
                  rows={2}
                  value={otherOfficeWork}
                  onChange={e => setOtherOfficeWork(e.target.value)}
                  placeholder="事務処理、会議、電話対応など"
                  className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
                />
              )}
            </div>
          </div>
        )}

        {/* ---------------- 4. 下部工事・集計サマリー & 時間集計 (2カラム) ---------------- */}
        <div className={`grid grid-cols-1 ${visibleColumns.showConstructionSummary ? 'lg:grid-cols-3' : 'lg:grid-cols-1'} gap-4`}>
          {/* 左側2カラム: 工事集計サマリー (Excel下部再現) */}
          {visibleColumns.showConstructionSummary && (
            <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  工事・点検・オンコール・取替 集計サマリー
                </h2>
                {/* メンバー切り替えセレクター & 対象年月バッジ */}
                <div className="flex items-center gap-2 text-xs">
                  <span className="text-[11px] font-bold text-slate-600 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                    {targetYearMonth.replace('-', '年')}月度
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[11px] text-slate-500 font-medium">集計対象:</span>
                    <select
                      value={selectedMemberId}
                      onChange={e => setSelectedMemberId(e.target.value)}
                      className="text-xs px-2 py-0.5 border border-slate-300 rounded-md bg-white font-bold text-slate-800 focus:outline-hidden focus:ring-1 focus:ring-indigo-500 shadow-2xs"
                    >
                      <option value={reportAuthor.id}>
                        {reportAuthor.name} ({reportAuthor.office || reportAuthor.department || '作成者'})
                      </option>
                      {allUsers
                        .filter(u => u.id !== reportAuthor.id)
                        .map(u => (
                          <option key={u.id} value={u.id}>
                            {u.name} ({u.office || u.department || 'メンバー'})
                          </option>
                        ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse">
                  <thead>
                    <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700">
                      <th className="p-2 border-r border-slate-200 text-left min-w-[140px]">区分 / 工事内容</th>
                      <th className="p-2 border-r border-slate-200 text-center">台数</th>
                      <th className="p-2 border-r border-slate-200 text-center">人数</th>
                      <th className="p-2 border-r border-slate-200 text-center bg-[#E8F8F0] text-emerald-900 border-emerald-300">
                        工事数値<br /><span className="text-[9px] font-normal text-emerald-700">※手入力</span>
                      </th>
                      <th className="p-2 border-r border-slate-200 text-center bg-[#FAF3E0]">点検台数/数値</th>
                      <th className="p-2 border-r border-slate-200 text-center bg-[#FAF3E0]">オンコール件/金額/pt</th>
                      <th className="p-2 border-r border-slate-200 text-center bg-[#FAF3E0]">取替台/金額/pt</th>
                      <th className="p-2 border-r border-slate-200 text-center bg-[#E8F8F0] text-emerald-900 border-emerald-300">
                        建材数値<br /><span className="text-[9px] font-normal text-emerald-700">※手入力</span>
                      </th>
                      <th className="p-2 border-r border-slate-200 text-center bg-[#E8F8F0] text-emerald-900 border-emerald-300">
                        距離数値<br /><span className="text-[9px] font-normal text-emerald-700">※手入力</span>
                      </th>
                      <th className="p-2 text-center bg-[#FAF3E0] font-extrabold text-amber-950">
                        数値合計
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-center font-bold">
                    {/* 1行目: 当日実績 */}
                    <tr className="hover:bg-slate-50/50 transition-colors">
                      {/* 工事内容 */}
                      <td className="p-2 border-r border-slate-200 text-left">
                        <div className="flex items-center gap-1.5 mb-1">
                          <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-bold bg-blue-100 text-blue-800 border border-blue-200 whitespace-nowrap shadow-2xs">
                            当日
                          </span>
                        </div>
                        {isSubmittedMode ? (
                          <span className="font-semibold text-slate-800">{constructionType || <span className="text-slate-400 font-normal">-</span>}</span>
                        ) : (
                          <input
                            type="text"
                            value={constructionType}
                            onChange={e => setConstructionType(e.target.value)}
                            className="w-full px-1 py-0.5 border border-slate-200 rounded text-xs bg-white"
                            placeholder="工事内容"
                          />
                        )}
                      </td>
                      {/* 台数 */}
                      <td className="p-2 border-r border-slate-200">
                        {isSubmittedMode ? (
                          <span>{constructionCount !== '' && constructionCount !== undefined ? `${constructionCount} 台` : '-'}</span>
                        ) : (
                          <>
                            <input
                              type="number"
                              value={constructionCount}
                              onChange={e => setConstructionCount(e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-12 px-1 py-0.5 border border-slate-200 rounded text-center bg-white"
                            /> 台
                          </>
                        )}
                      </td>
                      {/* 人数 */}
                      <td className="p-2 border-r border-slate-200">
                        {isSubmittedMode ? (
                          <span>{constructionPeople !== '' && constructionPeople !== undefined ? `${constructionPeople} 人` : '-'}</span>
                        ) : (
                          <>
                            <input
                              type="number"
                              value={constructionPeople}
                              onChange={e => setConstructionPeople(e.target.value === '' ? '' : Number(e.target.value))}
                              className="w-12 px-1 py-0.5 border border-slate-200 rounded text-center bg-white"
                            /> 人
                          </>
                        )}
                      </td>
                      {/* 工事数値 (緑色 ※手入力) */}
                      <td className="p-2 border-r border-emerald-300 bg-[#E8F8F0]">
                        {isSubmittedMode ? (
                          <span className="font-extrabold text-emerald-950">{constructionValue !== '' && constructionValue !== undefined ? constructionValue : 0}</span>
                        ) : (
                          <input
                            type="number"
                            value={constructionValue}
                            onChange={e => setConstructionValue(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-16 px-1 py-0.5 border border-emerald-400 rounded text-center font-extrabold text-emerald-950 bg-white"
                          />
                        )}
                      </td>
                      {/* 点検台数/数値 (肌色) */}
                      <td className="p-2 border-r border-slate-200 bg-[#FAF3E0] text-amber-950">
                        {mainTableTotals.inspectionCount}台 / {mainTableTotals.inspectionValue}pt
                      </td>
                      {/* オンコール件/金額/pt (肌色) */}
                      <td className="p-2 border-r border-slate-200 bg-[#FAF3E0] text-amber-950">
                        {mainTableTotals.oncallCount}件 / ¥{mainTableTotals.oncallAmount.toLocaleString()} ({mainTableTotals.oncallValue}pt)
                      </td>
                      {/* 取替台/金額/pt (肌色) */}
                      <td className="p-2 border-r border-slate-200 bg-[#FAF3E0] text-amber-950">
                        {mainTableTotals.replacementCount}台 / ¥{mainTableTotals.replacementAmount.toLocaleString()} ({mainTableTotals.replacementValue}pt)
                      </td>
                      {/* 建材数値 (緑色 ※手入力) */}
                      <td className="p-2 border-r border-emerald-300 bg-[#E8F8F0] text-emerald-900">
                        {mainTableTotals.buildingMaterialValue}
                      </td>
                      {/* 距離数値 (緑色 ※手入力) */}
                      <td className="p-2 border-r border-emerald-300 bg-[#E8F8F0]">
                        {isSubmittedMode ? (
                          <span className="font-extrabold text-emerald-950">{distanceValue !== '' && distanceValue !== undefined ? distanceValue : 0}</span>
                        ) : (
                          <input
                            type="number"
                            value={distanceValue}
                            onChange={e => setDistanceValue(e.target.value === '' ? '' : Number(e.target.value))}
                            className="w-16 px-1 py-0.5 border border-emerald-400 rounded text-center font-extrabold text-emerald-950 bg-white"
                          />
                        )}
                      </td>
                      {/* 当日数値合計 (肌色 自動計算) */}
                      <td className="p-2 bg-[#FAF3E0] font-black text-amber-900 text-sm">
                        {calculatedDailyTotalValue}
                      </td>
                    </tr>

                    {/* 2行目: 当月累計 (選択メンバーの月間累計値) */}
                    <tr className="bg-indigo-50/50 text-indigo-950 font-bold border-t-2 border-indigo-200">
                      {/* 区分 */}
                      <td className="p-2 border-r border-slate-200 text-left">
                        <div className="flex items-center gap-1.5">
                          <span className="inline-block px-1.5 py-0.2 rounded text-[10px] font-bold bg-indigo-600 text-white whitespace-nowrap shadow-2xs">
                            当月累計
                          </span>
                          <span className="text-[11px] font-semibold text-slate-700 truncate max-w-[100px]" title={selectedMember.name}>
                            {selectedMember.name}
                          </span>
                        </div>
                      </td>
                      {/* 工事台数累計 */}
                      <td className="p-2 border-r border-slate-200 text-indigo-900 font-extrabold">
                        {monthlyMemberTotals.constructionCount} 台
                      </td>
                      {/* 工事人数累計 */}
                      <td className="p-2 border-r border-slate-200 text-indigo-900 font-extrabold">
                        {monthlyMemberTotals.constructionPeople} 人
                      </td>
                      {/* 工事数値累計 */}
                      <td className="p-2 border-r border-emerald-300 bg-emerald-50/70 text-emerald-950 font-black">
                        {monthlyMemberTotals.constructionValue.toLocaleString()}
                      </td>
                      {/* 点検台数/数値 累計 */}
                      <td className="p-2 border-r border-slate-200 bg-amber-50/70 text-amber-950 font-black">
                        {monthlyMemberTotals.inspectionCount}台 / {monthlyMemberTotals.inspectionValue.toLocaleString()}pt
                      </td>
                      {/* オンコール件/金額/pt 累計 */}
                      <td className="p-2 border-r border-slate-200 bg-amber-50/70 text-amber-950 font-black">
                        {monthlyMemberTotals.oncallCount}件 / ¥{monthlyMemberTotals.oncallAmount.toLocaleString()} ({monthlyMemberTotals.oncallValue.toLocaleString()}pt)
                      </td>
                      {/* 取替台/金額/pt 累計 */}
                      <td className="p-2 border-r border-slate-200 bg-amber-50/70 text-amber-950 font-black">
                        {monthlyMemberTotals.replacementCount}台 / ¥{monthlyMemberTotals.replacementAmount.toLocaleString()} ({monthlyMemberTotals.replacementValue.toLocaleString()}pt)
                      </td>
                      {/* 建材数値 累計 */}
                      <td className="p-2 border-r border-emerald-300 bg-emerald-50/70 text-emerald-950 font-black">
                        {monthlyMemberTotals.buildingMaterialValue.toLocaleString()}
                      </td>
                      {/* 距離数値 累計 */}
                      <td className="p-2 border-r border-emerald-300 bg-emerald-50/70 text-emerald-950 font-black">
                        {monthlyMemberTotals.distanceValue.toLocaleString()}
                      </td>
                      {/* 当月数値合計 (月間総合計pt) */}
                      <td className="p-2 bg-amber-100/90 font-black text-amber-950 text-base">
                        {monthlyMemberTotals.totalValue.toLocaleString()}
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 右側1カラム: 時間集計 & 当月累計数値 & 承認印欄 */}
          <div className={`${visibleColumns.showConstructionSummary ? '' : 'max-w-xl mx-auto w-full'} bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-4 flex flex-col justify-between`}>
            <div>
              <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Clock className="w-4 h-4 text-indigo-600" />
                時間集計 & 当月累計
              </h2>

              <div className="space-y-2 text-xs">
                <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded border border-slate-200">
                  <span className="text-slate-600 font-semibold">作業時間:</span>
                  <strong className="text-slate-900">{calculatedTotalWorkHoursStr}</strong>
                </div>

                <div className="flex items-center justify-between p-1.5 bg-slate-50 rounded border border-slate-200">
                  <span className="text-slate-600 font-semibold">休憩・待機時間:</span>
                  {isSubmittedMode ? (
                    <strong className="text-slate-900">{breakHours || '0:00'}</strong>
                  ) : (
                    <input
                      type="text"
                      value={breakHours}
                      onChange={e => setBreakHours(e.target.value)}
                      className="w-16 p-0.5 border border-slate-300 rounded text-center bg-white"
                    />
                  )}
                </div>

                {/* 残業時間 (緑色 ※手入力) */}
                <div className="flex items-center justify-between p-1.5 bg-[#E8F8F0] rounded border border-emerald-300">
                  <span className="text-emerald-900 font-bold">残業時間 (※手入力):</span>
                  {isSubmittedMode ? (
                    <strong className="text-emerald-950 font-bold">{overtimeHours || '0:00'}</strong>
                  ) : (
                    <input
                      type="text"
                      value={overtimeHours}
                      onChange={e => setOvertimeHours(e.target.value)}
                      className="w-16 p-0.5 border border-emerald-400 rounded text-center font-bold text-emerald-950 bg-white"
                    />
                  )}
                </div>

                <div className="flex items-center justify-between p-2 bg-slate-800 text-white rounded font-bold">
                  <span>合計時間:</span>
                  <span className="text-amber-400 text-sm">{calculatedTotalHoursStr}</span>
                </div>

                {/* 当月数値合計 (肌色 自動算出) */}
                <div className="p-3 bg-[#FAF3E0] border border-amber-300 rounded-lg text-center space-y-1">
                  <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                    <span>当月数値合計 ({selectedMember.name}):</span>
                    <span className="text-[10px] text-amber-700 font-normal">自動集計</span>
                  </div>
                  <div className="text-xl font-black text-amber-950">
                    {monthlyMemberTotals.totalValue.toLocaleString()} <span className="text-xs font-normal">pt</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 承認印欄（支店長 最終承認・課長・係長） */}
            <div className="border-t border-slate-200 pt-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-[11px] font-bold text-slate-700">承認印欄:</span>
                <span className="text-[10px] text-slate-400">電子承認印 (JST)</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                {/* 支店長 (最終承認) */}
                <div className={`border rounded p-1.5 flex flex-col items-center justify-between min-h-[78px] ${
                  stampBoxInfo.branch.record ? 'border-red-300 bg-red-50/20' : stampBoxInfo.branch.isCurrentTarget ? 'border-indigo-400 bg-indigo-50/30 ring-1 ring-indigo-400' : 'border-slate-300 bg-slate-50/50'
                }`}>
                  <span className="text-slate-500 font-bold block border-b border-slate-200 pb-0.5 w-full">
                    {stampBoxInfo.branch.title}
                  </span>
                  <div className="my-auto py-1 flex items-center justify-center">
                    {stampBoxInfo.branch.record ? (
                      <div className="w-12 h-12 rounded-full border-2 border-red-600 bg-white/90 text-red-600 flex flex-col items-center justify-center shadow-xs -rotate-3 select-none leading-none">
                        <span className="text-[9px] font-bold scale-90 tracking-tighter">{stampBoxInfo.branch.stampLabel || '承認'}</span>
                        <span className="text-[11px] font-black tracking-tight">{stampBoxInfo.branch.record.stampName}</span>
                        <span className="text-[8px] font-bold scale-85 text-red-500">{stampBoxInfo.branch.record.stampDate}</span>
                      </div>
                    ) : stampBoxInfo.branch.isCurrentTarget ? (
                      <div className="text-center">
                        <span className="inline-block px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-bold animate-pulse">
                          確認中
                        </span>
                        <span className="block text-[9px] text-slate-400 mt-0.5">{stampBoxInfo.branch.user?.name || '支店長'}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 font-bold text-xs">印</span>
                    )}
                  </div>
                </div>

                {/* 課長 (上位上長) */}
                <div className={`border rounded p-1.5 flex flex-col items-center justify-between min-h-[78px] ${
                  stampBoxInfo.section.record ? 'border-red-300 bg-red-50/20' : stampBoxInfo.section.isCurrentTarget ? 'border-indigo-400 bg-indigo-50/30 ring-1 ring-indigo-400' : 'border-slate-300 bg-slate-50/50'
                }`}>
                  <span className="text-slate-500 font-bold block border-b border-slate-200 pb-0.5 w-full">
                    {stampBoxInfo.section.title}
                  </span>
                  <div className="my-auto py-1 flex items-center justify-center">
                    {stampBoxInfo.section.record ? (
                      <div className="w-12 h-12 rounded-full border-2 border-red-600 bg-white/90 text-red-600 flex flex-col items-center justify-center shadow-xs -rotate-3 select-none leading-none">
                        <span className="text-[9px] font-bold scale-90 tracking-tighter">{stampBoxInfo.section.stampLabel || '確認'}</span>
                        <span className="text-[11px] font-black tracking-tight">{stampBoxInfo.section.record.stampName}</span>
                        <span className="text-[8px] font-bold scale-85 text-red-500">{stampBoxInfo.section.record.stampDate}</span>
                      </div>
                    ) : stampBoxInfo.section.isCurrentTarget ? (
                      <div className="text-center">
                        <span className="inline-block px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-bold animate-pulse">
                          確認中
                        </span>
                        <span className="block text-[9px] text-slate-400 mt-0.5">{stampBoxInfo.section.user?.name || '課長'}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 font-bold text-xs">印</span>
                    )}
                  </div>
                </div>

                {/* 係長 / 直属上長 (第1承認) */}
                <div className={`border rounded p-1.5 flex flex-col items-center justify-between min-h-[78px] ${
                  stampBoxInfo.chief.record ? 'border-red-300 bg-red-50/20' : stampBoxInfo.chief.isCurrentTarget ? 'border-indigo-400 bg-indigo-50/30 ring-1 ring-indigo-400' : 'border-slate-300 bg-slate-50/50'
                }`}>
                  <span className="text-slate-500 font-bold block border-b border-slate-200 pb-0.5 w-full">
                    {stampBoxInfo.chief.title}
                  </span>
                  <div className="my-auto py-1 flex items-center justify-center">
                    {stampBoxInfo.chief.record ? (
                      <div className="w-12 h-12 rounded-full border-2 border-red-600 bg-white/90 text-red-600 flex flex-col items-center justify-center shadow-xs -rotate-3 select-none leading-none">
                        <span className="text-[9px] font-bold scale-90 tracking-tighter">{stampBoxInfo.chief.stampLabel || '提出'}</span>
                        <span className="text-[11px] font-black tracking-tight">{stampBoxInfo.chief.record.stampName}</span>
                        <span className="text-[8px] font-bold scale-85 text-red-500">{stampBoxInfo.chief.record.stampDate}</span>
                      </div>
                    ) : stampBoxInfo.chief.isCurrentTarget ? (
                      <div className="text-center">
                        <span className="inline-block px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded text-[9px] font-bold animate-pulse">
                          確認中
                        </span>
                        <span className="block text-[9px] text-slate-400 mt-0.5">{stampBoxInfo.chief.user?.name || '係長'}</span>
                      </div>
                    ) : (
                      <span className="text-slate-300 font-bold text-xs">印</span>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        </>
      )}

        {/* ---------------- 本人提出中: 最下部取り下げバー ---------------- */}
        {isSubmittedMode && status === 'submitted' && isAuthor && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-900 text-xs font-bold">
              <Clock className="w-4 h-4 text-amber-700 shrink-0" />
              <span>この保守日報は現在【提出中（上長確認待ち）】です。内容を修正したい場合は取り下げを行ってください。</span>
            </div>
            <button
              type="button"
              onClick={handleWithdraw}
              disabled={isSubmitting}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Undo2 className="w-4 h-4" />
              <span>取り下げて編集する</span>
            </button>
          </div>
        )}

        {/* ---------------- 提出後: 多段階承認（上長回覧 / 支店長最終承認）・差し戻しエリア ---------------- */}
        {isSubmittedMode && status === 'submitted' && !isAuthor && (
          <div className="bg-gradient-to-r from-indigo-50/80 via-slate-50 to-indigo-50/80 border border-indigo-200 rounded-xl p-4 shadow-sm space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-indigo-100 pb-2">
              <div className="flex items-center gap-2 text-indigo-950 font-bold text-xs">
                <MessageSquare className="w-4 h-4 text-indigo-600" />
                <span>
                  {isFinalApprover ? '支店長 最終承認・決裁' : '上長確認・上位回覧コメント'}
                </span>
                <span className="text-[11px] font-normal text-indigo-700 bg-white px-2.5 py-0.5 rounded-full border border-indigo-200 shadow-2xs">
                  ※コメントは空白のままでも{isFinalApprover ? '最終承認' : '上長提出'}・差し戻し可能です
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleRemand}
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-white border border-rose-300 text-rose-700 hover:bg-rose-50 rounded-lg text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  title="日報を作成者に差し戻します（下書きに戻す）"
                >
                  <RotateCcw className="w-3.5 h-3.5" />
                  <span>作成者（{reportAuthor?.name || '作成者'}）へ差し戻し</span>
                </button>
                <button
                  type="button"
                  onClick={handleForwardOrApprove}
                  disabled={isSubmitting}
                  className={`px-5 py-2 text-white rounded-lg text-xs font-bold transition-all shadow-sm flex items-center gap-1.5 cursor-pointer disabled:opacity-50 ${
                    isFinalApprover
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-indigo-600 hover:bg-indigo-700'
                  }`}
                  title={
                    isFinalApprover
                      ? '支店長として日報を最終承認（確認完了）します'
                      : `日報を確認し、次の上長（${nextSupervisor?.name || '上位上長'}）へ提出（回覧）します`
                  }
                >
                  {isFinalApprover ? (
                    <>
                      <ShieldCheck className="w-4 h-4" />
                      <span>支店長 承認完了（最終確認）</span>
                    </>
                  ) : (
                    <>
                      <Send className="w-3.5 h-3.5" />
                      <span>上長（{nextSupervisor?.name || '上位上長'}）へ提出</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <textarea
              rows={2}
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
              placeholder={
                isFinalApprover
                  ? '支店長コメント・指示事項があれば入力（空白のまま「承認完了」可能です）...'
                  : `上長コメント・確認事項があれば入力（空白のまま「上長（${nextSupervisor?.name || '上位上長'}）へ提出」可能です）...`
              }
              className="w-full p-2.5 border border-indigo-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500 transition-colors shadow-inner"
            />

            {/* 過去の承認・回覧コメント履歴 */}
            {approvalHistory.length > 0 && (
              <div className="pt-2 border-t border-indigo-100/80 space-y-1.5">
                <span className="text-[11px] font-bold text-slate-600 block">承認・回覧コメント履歴:</span>
                <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                  {approvalHistory.map((rec, idx) => (
                    <div key={idx} className="bg-white/90 border border-slate-200 rounded-lg p-2 text-xs flex items-start gap-2 shadow-2xs">
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold shrink-0 mt-0.5 ${
                        rec.action === 'final_approved' ? 'bg-emerald-100 text-emerald-800' :
                        rec.action === 'remanded' ? 'bg-rose-100 text-rose-800' : 'bg-indigo-100 text-indigo-800'
                      }`}>
                        {rec.action === 'final_approved' ? '最終承認' : rec.action === 'remanded' ? '差し戻し' : '回覧提出'}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 text-slate-500 text-[10px]">
                          <strong className="text-slate-800 font-bold">{rec.approverName}</strong>
                          {rec.approverPosition && <span>({rec.approverPosition})</span>}
                          <span>•</span>
                          <span>{new Date(rec.approvedAt).toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' })}</span>
                        </div>
                        {rec.comment ? (
                          <p className="text-slate-700 mt-0.5 whitespace-pre-wrap">{rec.comment}</p>
                        ) : (
                          <p className="text-slate-400 italic text-[11px] mt-0.5">（コメントなし）</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ---------------- 補充申請 ポップアップモーダル ---------------- */}
        {supplyModalState?.isOpen && (
          <ApplicationModal
            isOpen={true}
            onClose={() => setSupplyModalState(null)}
            onSave={async (appData) => {
              if (appData.id && onUpdateApplication) {
                await onUpdateApplication(appData as WorkflowApplication);
              } else if (onAddApplication) {
                await onAddApplication(appData);
              }
              setSupplyModalState(null);
            }}
            allUsers={allUsers || []}
            currentUser={currentUser}
            approvalFlows={approvalFlows}
            itemMasters={itemMasters}
            initialData={supplyModalState.initialData}
            initialType="inventory_issue"
            initialTitle={`[${supplyModalState.targetSiteName || '現場'}] 補充申請`}
            initialDescription={`保守日報 (${reportDate}) の現場 [${supplyModalState.targetSiteName || '未入力'}] における資材・部品の補充依頼です。`}
          />
        )}

        <ConfirmModal
          {...confirmModal}
          onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        />

        {/* ---------------- 点検報告書 プレビュー・印刷モーダル ---------------- */}
        {previewInspectionReport && (
          <InspectionReportPrintView
            report={previewInspectionReport}
            onClose={() => setPreviewInspectionReport(null)}
          />
        )}

        {/* ---------------- 点検報告書 作成・編集モーダル ---------------- */}
        {editingInspectionReport && (
          <InspectionReportEditorModal
            initialReport={editingInspectionReport}
            onSave={(saved) => {
              saveInspectionReport(saved);
              setInspectionReports((prev) => [saved, ...prev.filter((r) => r.id !== saved.id)]);
              setEditingInspectionReport(null);
            }}
            onClose={() => setEditingInspectionReport(null)}
          />
        )}
      </div>
    </div>
  );
}
