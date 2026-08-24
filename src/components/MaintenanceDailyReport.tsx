import React, { useState, useEffect, useMemo } from 'react';
import { 
  DailyReport, 
  User, 
  CalendarEvent, 
  MaintenanceWorkRow, 
  MaintenanceOfficeWorkRow, 
  MaintenanceDailyReportData, 
  WorkReportStatus 
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
  AlertCircle
} from 'lucide-react';
import { getAvatarUrl } from '../utils/avatar';
import { getLocalDateStr } from '../utils/dateUtils';
import { expandRecurringEvents } from '../utils/recurrenceUtils';

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
  calendarEvents?: CalendarEvent[];
  onSaveReport?: (data: Partial<DailyReport>) => Promise<void> | void;
  onReviewReport?: (id: string, comment: string) => Promise<void> | void;
  onBack?: () => void;
}

// 曜日漢字ヘルパー
function getDayOfWeekJa(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  const days = ['日', '月', '火', '水', '木', '金', '土'];
  return days[d.getDay()] || '';
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
  calendarEvents = [],
  onSaveReport,
  onReviewReport,
  onBack,
}: MaintenanceDailyReportProps) {
  // maintenanceData の安全な取得（JSON文字列で届いた場合のフェイルセーフ）
  const maintenanceData = useMemo<MaintenanceDailyReportData | null>(() => {
    if (!report?.maintenanceData) return null;
    if (typeof report.maintenanceData === 'string') {
      try {
        return JSON.parse(report.maintenanceData);
      } catch (e) {
        return null;
      }
    }
    return report.maintenanceData as MaintenanceDailyReportData;
  }, [report]);

  // 日付
  const [reportDate, setReportDate] = useState<string>(() => {
    if (report?.date) return report.date.split('T')[0];
    const today = new Date();
    return today.toISOString().split('T')[0];
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

  // ステータス
  const [status, setStatus] = useState<WorkReportStatus>(report?.status || 'draft');
  const [reviewComment, setReviewComment] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // アコーディオン表示用（スマホビューで展開する行ID）
  const [expandedMobileRow, setExpandedMobileRow] = useState<string | null>('row-1');

  // 当月累計（ダミー標準値 + 入力値）
  const baseMonthlyTotal = 24391;

  // 上長候補リスト
  const supervisorCandidates = useMemo(() => {
    return allUsers.filter(u => u.id !== currentUser.id);
  }, [allUsers, currentUser.id]);

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

      // 内容（作業区分）が変更された場合、標準ポイント/金額のプリセット自動適用
      if (fields.contentType !== undefined) {
        const ct = fields.contentType;
        if (ct === 'EG取替') {
          updatedRow.replacementCount = updatedRow.replacementCount || 1;
          updatedRow.replacementAmount = updatedRow.replacementAmount || 291500;
          updatedRow.replacementValue = updatedRow.replacementValue || 480;
        } else if (ct === '単体取替') {
          updatedRow.replacementCount = updatedRow.replacementCount || 1;
          updatedRow.replacementAmount = updatedRow.replacementAmount || 150000;
          updatedRow.replacementValue = updatedRow.replacementValue || 240;
        } else if (ct === '修理' || ct === 'オンコール') {
          updatedRow.oncallAmount = updatedRow.oncallAmount || 34500;
          updatedRow.oncallValue = updatedRow.oncallValue || 115;
        } else if (ct === '点検') {
          updatedRow.inspectionCount = updatedRow.inspectionCount || 1;
          updatedRow.inspectionValue = updatedRow.inspectionValue || 120;
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
      alert(`${targetDateStr} のスケジュールが見つかりませんでした。\nダミーの保守スケジュールで初期入力を行います。`);
      // ダミーデータのロード（PDFサンプルデータ再現）
      setMainWorkRows([
        {
          id: 'row-1',
          directGo: true,
          directReturn: false,
          siteName: 'ＨＣバロー領下',
          workDescription: '定期点検・取替作業',
          district: '岐阜',
          peopleCount: 2,
          coworkers: '山田',
          startTime: '07:00',
          endTime: '09:00',
          contentType: 'EG取替',
          inspectionCount: 0,
          inspectionValue: 0,
          oncallAmount: 0,
          oncallValue: 0,
          replacementCount: 1,
          replacementAmount: 291500,
          replacementValue: 480,
          buildingMaterialValue: 0,
          workHours: '2:00',
        },
        {
          id: 'row-2',
          directGo: false,
          directReturn: false,
          siteName: 'イチ×ビル',
          workDescription: 'エレベーター保守',
          district: '一宮',
          peopleCount: 2,
          coworkers: '山田',
          startTime: '09:30',
          endTime: '12:00',
          contentType: 'EG取替',
          inspectionCount: 0,
          inspectionValue: 0,
          oncallAmount: 0,
          oncallValue: 0,
          replacementCount: 1,
          replacementAmount: 0,
          replacementValue: 0,
          buildingMaterialValue: 0,
          workHours: '2:30',
        },
        {
          id: 'row-3',
          directGo: false,
          directReturn: false,
          siteName: 'バロー碧南',
          workDescription: '現調・見積',
          district: '碧南',
          peopleCount: 1,
          coworkers: '',
          startTime: '15:00',
          endTime: '15:30',
          contentType: '見積',
          inspectionCount: 0,
          inspectionValue: 0,
          oncallAmount: 0,
          oncallValue: 0,
          replacementCount: 0,
          replacementAmount: 0,
          replacementValue: 0,
          buildingMaterialValue: 0,
          workHours: '0:30',
        },
        {
          id: 'row-4',
          directGo: false,
          directReturn: false,
          siteName: 'バロー刈谷',
          workDescription: '障害修理・オンコール対応',
          district: '刈谷',
          peopleCount: 1,
          coworkers: '',
          startTime: '16:00',
          endTime: '17:00',
          contentType: '修理',
          inspectionCount: 0,
          inspectionValue: 0,
          oncallAmount: 34500,
          oncallValue: 115,
          replacementCount: 0,
          replacementAmount: 0,
          replacementValue: 0,
          buildingMaterialValue: 0,
          workHours: '1:00',
        },
        {
          id: 'row-5',
          directGo: false,
          directReturn: true,
          siteName: 'ミュープラット大曽根',
          workDescription: '単体取替作業',
          district: '東区',
          peopleCount: 3,
          coworkers: '鈴木, 高橋',
          startTime: '20:30',
          endTime: '23:30',
          contentType: '単体取替',
          inspectionCount: 0,
          inspectionValue: 0,
          oncallAmount: 0,
          oncallValue: 0,
          replacementCount: 0,
          replacementAmount: 0,
          replacementValue: 0,
          buildingMaterialValue: 0,
          workHours: '3:00',
        },
        ...createEmptyMainRows().slice(5),
      ]);
      return;
    }

    // イベントからの自動セット (JST基準で正確な開始・終了時刻と作業時間を抽出)
    const newRows = createEmptyMainRows();
    dayEvents.slice(0, 10).forEach((ev, idx) => {
      const startT = getEventTimeStrJST(ev.start);
      const endT = getEventTimeStrJST(ev.end);
      
      // 地区の抽出：スケジュールメモやタイトル等の詳細情報に【地区】〇〇が明記されている場合のみセット
      let districtStr = '';
      const fullText = `${ev.memo || ''} ${ev.location || ''} ${ev.title || ''}`;
      const districtMatch = fullText.match(/【地区】\s*([^\s\r\n】]+)/) || fullText.match(/地区[：:]\s*([^\s\r\n]+)/);
      if (districtMatch && districtMatch[1]) {
        districtStr = districtMatch[1].trim();
      }

      // 内容区分の判定：スケジュールの内容（ev.type, ev.memo, ev.title）に準じる
      let contentType = '';
      const ctExplicitMatch = fullText.match(/【内容区分】\s*([^\s\r\n】]+)/) || fullText.match(/【内容】\s*([^\s\r\n】]+)/);
      if (ctExplicitMatch && ctExplicitMatch[1]) {
        const candidate = ctExplicitMatch[1].trim();
        if (['EG取替', '単体取替', '修理', 'オンコール', '点検', '見積'].includes(candidate)) {
          contentType = candidate;
        }
      }
      
      if (!contentType) {
        if (fullText.includes('EG取替') || (fullText.includes('EG') && fullText.includes('取替'))) {
          contentType = 'EG取替';
        } else if (fullText.includes('単体取替') || (fullText.includes('単体') && fullText.includes('取替'))) {
          contentType = '単体取替';
        } else if (fullText.includes('オンコール')) {
          contentType = 'オンコール';
        } else if (fullText.includes('点検')) {
          contentType = '点検';
        } else if (fullText.includes('見積') || fullText.includes('現調')) {
          contentType = '見積';
        } else if (fullText.includes('修理')) {
          contentType = '修理';
        } else if (ev.type && ['EG取替', '単体取替', '修理', 'オンコール', '点検', '見積'].includes(ev.type)) {
          contentType = ev.type;
        } else {
          // 特段の記述がなければデフォルトは '修理'
          contentType = '修理';
        }
      }

      // 各内容区分ごとの数値・金額プリセット初期値設定
      let inspectionCount = 0;
      let inspectionValue = 0;
      let oncallAmount = 0;
      let oncallValue = 0;
      let replacementCount = 0;
      let replacementAmount = 0;
      let replacementValue = 0;

      if (contentType === 'EG取替') {
        replacementCount = 1;
        replacementAmount = 291500;
        replacementValue = 480;
      } else if (contentType === '単体取替') {
        replacementCount = 1;
        replacementAmount = 150000;
        replacementValue = 240;
      } else if (contentType === '修理' || contentType === 'オンコール') {
        oncallAmount = 34500;
        oncallValue = 115;
      } else if (contentType === '点検') {
        inspectionCount = 1;
        inspectionValue = 120;
      }

      // 自分以外の参加メンバー抽出
      const otherAttendees = (ev.attendees || []).filter(a => {
        if (!a) return false;
        if (a.id && currentUser.id && a.id === currentUser.id) return false;
        if (a.name && currentUser.name && a.name.trim() === currentUser.name.trim()) return false;
        return true;
      });

      // 人数算出（attendeesが存在すればその件数、なければ1人）
      const totalPeople = (ev.attendees && ev.attendees.length > 0) ? ev.attendees.length : 1;

      // 1人（本人だけ）の場合は同行者不要（空文字）。2人以上の場合は自分以外のメンバーを表示
      const coworkersStr = (totalPeople >= 2 && otherAttendees.length > 0)
        ? otherAttendees.map(a => a.name).filter(Boolean).join(', ')
        : '';

      newRows[idx] = {
        id: `row-${idx + 1}`,
        directGo: false,
        directReturn: false,
        siteName: ev.title || '現場名未設定',
        workDescription: ev.memo || ev.type || '保守作業',
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
      };
    });

    setMainWorkRows(newRows);
    alert(`${dayEvents.length} 件のスケジュールを自動取り込みしました！`);
  };

  // ---------------- 保存・提出処理 ----------------
  const handleSave = async (submitStatus: WorkReportStatus) => {
    if (!onSaveReport) return;
    setIsSubmitting(true);

    try {
      const maintenanceData: MaintenanceDailyReportData = {
        date: reportDate,
        userName: currentUser.name,
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
        monthlyTotalValue: baseMonthlyTotal + calculatedDailyTotalValue,
      };

      const summaryTasks = mainWorkRows
        .filter(r => r.siteName)
        .map(r => `・[${r.startTime}〜${r.endTime}] ${r.siteName} (${r.contentType}): ${r.workDescription}`)
        .join('\n');

      const payload: Partial<DailyReport> = {
        id: report?.id,
        reportType: 'maintenance_daily',
        date: reportDate,
        department: currentUser.department || currentUser.division || '保守',
        tasks: summaryTasks || '保守日報作業報告',
        supervisorId: supervisorId || undefined,
        status: submitStatus,
        maintenanceData,
      };

      await onSaveReport(payload);
      setStatus(submitStatus);
    } catch (e) {
      console.error('Failed to save maintenance report:', e);
      alert('保存処理に失敗しました。');
    } finally {
      setIsSubmitting(false);
    }
  };

  // 上長レビュー確認
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
            <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center text-white font-bold shadow-sm shadow-amber-200">
              <FileText className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base sm:text-lg font-bold text-slate-900">
                  平日（月～金）保守日報
                </h1>
                <span className="text-xs font-semibold px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  保守部署専用
                </span>
              </div>
              <p className="text-xs text-slate-500 hidden sm:block">
                当日のスケジュールから作業・点検・取替内容を自動算出し、日報を簡単に作成・保存します
              </p>
            </div>
          </div>

          {/* 右側アクションボタン */}
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
              className="px-4 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold transition-all shadow-sm shadow-indigo-200 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <Send className="w-4 h-4" />
              日報を提出
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-2 sm:px-6 pt-4 space-y-4">
        {/* ---------------- 色設定・操作ガイドバナー ---------------- */}
        <div className="bg-white rounded-xl border border-slate-200 p-3.5 sm:p-4 shadow-xs flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <span className="font-bold text-slate-700 flex items-center gap-1">
              <HelpCircle className="w-4 h-4 text-amber-500" />
              セルの色分けガイド:
            </span>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-[#FAF3E0] border border-amber-300 inline-block shadow-2xs"></span>
              <span className="font-semibold text-amber-900">肌色 = 自動反映・自動計算項目</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-4 rounded bg-[#E8F8F0] border border-emerald-400 inline-block shadow-2xs"></span>
              <span className="font-semibold text-emerald-900">緑色 = ※手入力項目</span>
            </div>
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
            {/* 日付選択 */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-bold text-slate-600 shrink-0">日報日付:</label>
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
              </div>
              <span className="px-2 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg text-xs font-extrabold shrink-0">
                ({getDayOfWeekJa(reportDate)})
              </span>
            </div>

            {/* 氏名（自動反映） */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600 shrink-0">氏名:</label>
              <div className="flex-1 px-3 py-1.5 bg-[#FAF3E0] border border-amber-200 rounded-lg text-xs font-bold text-slate-900 flex items-center gap-2">
                <img
                  src={getAvatarUrl(currentUser.avatarUrl)}
                  alt={currentUser.name}
                  className="w-5 h-5 rounded-full object-cover"
                />
                <span>{currentUser.name}</span>
                <span className="text-[10px] text-amber-700 font-normal ml-auto">({currentUser.department || '保守'})</span>
              </div>
            </div>

            {/* 報告先上長 */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-slate-600 shrink-0">報告先上長:</label>
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
            </div>
          </div>
        </div>

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
                  <th className="p-2 border-r border-slate-200 text-center w-10">番号</th>
                  <th className="p-2 border-r border-slate-200 text-center w-16">直行直帰</th>
                  <th className="p-2 border-r border-slate-200 w-36">現場名</th>
                  <th className="p-2 border-r border-slate-200 w-32">作業内容</th>
                  <th className="p-2 border-r border-slate-200 w-20">地区</th>
                  <th className="p-2 border-r border-slate-200 text-center w-14">人数</th>
                  <th className="p-2 border-r border-slate-200 w-24">同行者</th>
                  <th className="p-2 border-r border-slate-200 text-center w-36">作業時間</th>
                  <th className="p-2 border-r border-slate-200 w-24">内容区分</th>
                  <th className="p-2 border-r border-slate-200 text-center bg-[#FAF3E0] w-24">点検台数/数値</th>
                  <th className="p-2 border-r border-slate-200 text-center bg-[#FAF3E0] w-28">オンコール金額/数値</th>
                  <th className="p-2 border-r border-slate-200 text-center bg-[#FAF3E0] w-32">取替台数/金額/数値</th>
                  <th className="p-2 text-center bg-[#E8F8F0] w-24 text-emerald-900 border-l border-emerald-300">
                    建材数値<br /><span className="text-[9px] font-normal text-emerald-700">※手入力</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200 font-sans">
                {mainWorkRows.map((row, idx) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    {/* 番号 */}
                    <td className="p-2 border-r border-slate-200 text-center font-bold text-slate-500 bg-slate-50">
                      {idx + 1}
                    </td>

                    {/* 直行・直帰 (手入力/チェック) */}
                    <td className="p-1 border-r border-slate-200 text-center">
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
                    </td>

                    {/* 現場名 */}
                    <td className="p-1 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.siteName}
                        onChange={e => updateMainRow(idx, { siteName: e.target.value })}
                        placeholder="現場名"
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-amber-500 bg-white"
                      />
                    </td>

                    {/* 作業内容 */}
                    <td className="p-1 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.workDescription}
                        onChange={e => updateMainRow(idx, { workDescription: e.target.value })}
                        placeholder="作業内容"
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-amber-500 bg-white"
                      />
                    </td>

                    {/* 地区 */}
                    <td className="p-1 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.district}
                        onChange={e => updateMainRow(idx, { district: e.target.value })}
                        placeholder="地区"
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-amber-500 bg-white"
                      />
                    </td>

                    {/* 人数 */}
                    <td className="p-1 border-r border-slate-200 text-center">
                      <input
                        type="number"
                        min={1}
                        value={row.peopleCount || ''}
                        onChange={e => updateMainRow(idx, { peopleCount: Number(e.target.value) })}
                        className="w-12 px-1 py-1 border border-slate-200 rounded text-xs text-center focus:ring-1 focus:ring-amber-500 bg-white"
                      />
                    </td>

                    {/* 同行者 */}
                    <td className="p-1 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.coworkers}
                        onChange={e => updateMainRow(idx, { coworkers: e.target.value })}
                        placeholder="同行者"
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs focus:ring-1 focus:ring-amber-500 bg-white"
                      />
                    </td>

                    {/* 作業時間 開始 〜 終了 & 算出時間 */}
                    <td className="p-1 border-r border-slate-200 text-center">
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
                    </td>

                    {/* 内容区分 (EG取替, 見積, 修理, 単体取替等) */}
                    <td className="p-1 border-r border-slate-200">
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
                    </td>

                    {/* 点検台数 / 点検数値 (肌色) */}
                    <td className="p-1 border-r border-slate-200 bg-[#FAF3E0]">
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
                    </td>

                    {/* オンコール金額 / 数値 (肌色) */}
                    <td className="p-1 border-r border-slate-200 bg-[#FAF3E0]">
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
                    </td>

                    {/* 取替台数 / 金額 / 数値 (肌色) */}
                    <td className="p-1 border-r border-slate-200 bg-[#FAF3E0]">
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
                    </td>

                    {/* 建材数値 (緑色 ※手入力) */}
                    <td className="p-1 bg-[#E8F8F0] border-l border-emerald-300">
                      <input
                        type="number"
                        placeholder="0"
                        value={row.buildingMaterialValue || ''}
                        onChange={e => updateMainRow(idx, { buildingMaterialValue: Number(e.target.value) })}
                        className="w-full px-2 py-1 border border-emerald-400 rounded text-xs text-center font-bold text-emerald-950 bg-white focus:ring-2 focus:ring-emerald-500/20"
                      />
                    </td>
                  </tr>
                ))}

                {/* 集計行 */}
                <tr className="bg-amber-100/60 font-bold border-t-2 border-slate-300 text-slate-800">
                  <td colSpan={7} className="p-2 text-right border-r border-slate-300">
                    作業時間計 / 各種小計:
                  </td>
                  <td className="p-2 text-center border-r border-slate-300 font-extrabold text-amber-900">
                    {mainTableTotals.workHoursStr}
                  </td>
                  <td className="p-2 border-r border-slate-300"></td>
                  <td className="p-2 text-center border-r border-slate-300 text-amber-950">
                    {mainTableTotals.inspectionCount}台 / {mainTableTotals.inspectionValue}pt
                  </td>
                  <td className="p-2 text-center border-r border-slate-300 text-amber-950">
                    ¥{mainTableTotals.oncallAmount.toLocaleString()} ({mainTableTotals.oncallValue}pt)
                  </td>
                  <td className="p-2 text-center border-r border-slate-300 text-amber-950">
                    {mainTableTotals.replacementCount}台 / ¥{mainTableTotals.replacementAmount.toLocaleString()} ({mainTableTotals.replacementValue}pt)
                  </td>
                  <td className="p-2 text-center font-bold text-emerald-900 bg-emerald-100/70 border-l border-emerald-300">
                    {mainTableTotals.buildingMaterialValue}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------------- 2. メイン作業一覧（スマホ向けレスポンシブ表示） ---------------- */}
        <div className="md:hidden space-y-3">
          <div className="bg-slate-800 text-white p-3 rounded-xl flex items-center justify-between">
            <h2 className="text-xs font-bold flex items-center gap-1.5">
              <Building2 className="w-4 h-4 text-amber-400" />
              当日作業・点検一覧 (カード形式)
            </h2>
            <button
              onClick={handleAutoLoadSchedule}
              className="px-2 py-1 bg-amber-500 text-white rounded text-[11px] font-bold"
            >
              自動取込
            </button>
          </div>

          {mainWorkRows.map((row, idx) => {
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
                    <span className="w-5 h-5 rounded-full bg-slate-200 text-slate-700 text-[11px] font-bold flex items-center justify-center shrink-0">
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
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {row.workHours && row.workHours !== '0:00' && (
                      <span className="text-[11px] font-bold text-amber-700">{row.workHours}</span>
                    )}
                    {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-400" /> : <ChevronDown className="w-4 h-4 text-slate-400" />}
                  </div>
                </div>

                {/* カード詳細ボディ */}
                {isExpanded && (
                  <div className="p-3.5 space-y-3 text-xs bg-white rounded-b-xl">
                    {/* 直行直帰 */}
                    <div className="flex items-center gap-4 bg-slate-50 p-2 rounded-lg">
                      <span className="font-bold text-slate-600">直行直帰:</span>
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
                    </div>

                    {/* 現場名 & 作業内容 */}
                    <div className="grid grid-cols-1 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600">現場名</label>
                        <input
                          type="text"
                          value={row.siteName}
                          onChange={e => updateMainRow(idx, { siteName: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded text-xs bg-white"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600">作業内容</label>
                        <input
                          type="text"
                          value={row.workDescription}
                          onChange={e => updateMainRow(idx, { workDescription: e.target.value })}
                          className="w-full p-2 border border-slate-300 rounded text-xs bg-white"
                        />
                      </div>
                    </div>

                    {/* 時間 & 区分 */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="text-[11px] font-bold text-slate-600">開始 〜 終了</label>
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
                      </div>
                      <div>
                        <label className="text-[11px] font-bold text-slate-600">内容区分</label>
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
                      </div>
                    </div>

                    {/* オンコール・取替数値 (肌色) */}
                    <div className="bg-[#FAF3E0] p-2.5 rounded-lg border border-amber-200 space-y-2">
                      <div className="text-[11px] font-bold text-amber-900">オンコール・取替自動計算:</div>
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
                    </div>

                    {/* 建材数値 (緑色 ※手入力) */}
                    <div className="bg-[#E8F8F0] p-2.5 rounded-lg border border-emerald-300">
                      <label className="text-[11px] font-bold text-emerald-900 flex items-center justify-between mb-1">
                        <span>建材数値</span>
                        <span className="text-[10px] text-emerald-700 bg-emerald-200/60 px-1.5 py-0.2 rounded font-normal">※手入力</span>
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        value={row.buildingMaterialValue || ''}
                        onChange={e => updateMainRow(idx, { buildingMaterialValue: Number(e.target.value) })}
                        className="w-full p-2 border border-emerald-400 rounded text-center font-bold text-emerald-950 bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* ---------------- 3. 事務（見積）作業報告（5行） ---------------- */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-xs p-4 space-y-3">
          <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <FileText className="w-4 h-4 text-indigo-600" />
            事務（見積）作業報告 (1〜5)
          </h2>

          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left border-collapse min-w-[700px]">
              <thead>
                <tr className="bg-slate-100 border-b border-slate-200 font-bold text-slate-700">
                  <th className="p-2 border-r border-slate-200 w-36">見積提出先</th>
                  <th className="p-2 border-r border-slate-200">内容</th>
                  <th className="p-2 border-r border-slate-200 w-28 text-right">金額(円)</th>
                  <th className="p-2 border-r border-slate-200 w-28 text-center">決定予定月</th>
                  <th className="p-2 border-r border-slate-200 w-20 text-center">時間(分)</th>
                  <th className="p-2 w-36">備考</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-200">
                {officeWorkRows.map((row, idx) => (
                  <tr key={row.id}>
                    <td className="p-1 border-r border-slate-200">
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
                    </td>
                    <td className="p-1 border-r border-slate-200">
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
                    </td>
                    <td className="p-1 border-r border-slate-200">
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
                    </td>
                    <td className="p-1 border-r border-slate-200">
                      <input
                        type="text"
                        placeholder="2026/09"
                        value={row.targetMonth}
                        onChange={e => {
                          const next = [...officeWorkRows];
                          next[idx].targetMonth = e.target.value;
                          setOfficeWorkRows(next);
                        }}
                        className="w-full px-2 py-1 border border-slate-200 rounded text-xs text-center bg-white"
                      />
                    </td>
                    <td className="p-1 border-r border-slate-200">
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
                    </td>
                    <td className="p-1">
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
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* その他事務作業 */}
          <div className="pt-2">
            <label className="block text-xs font-bold text-slate-700 mb-1">その他事務作業:</label>
            <textarea
              rows={2}
              value={otherOfficeWork}
              onChange={e => setOtherOfficeWork(e.target.value)}
              placeholder="事務処理、会議、電話対応など"
              className="w-full p-2 border border-slate-300 rounded-lg text-xs bg-white"
            />
          </div>
        </div>

        {/* ---------------- 4. 下部工事・集計サマリー & 時間集計 (2カラム) ---------------- */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* 左側2カラム: 工事集計サマリー (Excel下部再現) */}
          <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-3">
            <h2 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              工事・点検・オンコール・取替 集計サマリー
            </h2>

            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 border-b border-slate-300 font-bold text-slate-700">
                    <th className="p-2 border-r border-slate-200">工事内容</th>
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
                      当日数値合計
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-center font-bold">
                  <tr>
                    {/* 工事内容 */}
                    <td className="p-2 border-r border-slate-200 text-left">
                      <input
                        type="text"
                        value={constructionType}
                        onChange={e => setConstructionType(e.target.value)}
                        className="w-full px-1 py-0.5 border border-slate-200 rounded text-xs bg-white"
                      />
                    </td>
                    {/* 台数 */}
                    <td className="p-2 border-r border-slate-200">
                      <input
                        type="number"
                        value={constructionCount}
                        onChange={e => setConstructionCount(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-12 px-1 py-0.5 border border-slate-200 rounded text-center bg-white"
                      /> 台
                    </td>
                    {/* 人数 */}
                    <td className="p-2 border-r border-slate-200">
                      <input
                        type="number"
                        value={constructionPeople}
                        onChange={e => setConstructionPeople(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-12 px-1 py-0.5 border border-slate-200 rounded text-center bg-white"
                      /> 人
                    </td>
                    {/* 工事数値 (緑色 ※手入力) */}
                    <td className="p-2 border-r border-emerald-300 bg-[#E8F8F0]">
                      <input
                        type="number"
                        value={constructionValue}
                        onChange={e => setConstructionValue(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-16 px-1 py-0.5 border border-emerald-400 rounded text-center font-extrabold text-emerald-950 bg-white"
                      />
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
                      <input
                        type="number"
                        value={distanceValue}
                        onChange={e => setDistanceValue(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-16 px-1 py-0.5 border border-emerald-400 rounded text-center font-extrabold text-emerald-950 bg-white"
                      />
                    </td>
                    {/* 当日数値合計 (肌色 自動計算) */}
                    <td className="p-2 bg-[#FAF3E0] font-black text-amber-900 text-sm">
                      {calculatedDailyTotalValue}
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>

          {/* 右側1カラム: 時間集計 & 当月累計数値 & 承認印欄 */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs space-y-4 flex flex-col justify-between">
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
                  <input
                    type="text"
                    value={breakHours}
                    onChange={e => setBreakHours(e.target.value)}
                    className="w-16 p-0.5 border border-slate-300 rounded text-center bg-white"
                  />
                </div>

                {/* 残業時間 (緑色 ※手入力) */}
                <div className="flex items-center justify-between p-1.5 bg-[#E8F8F0] rounded border border-emerald-300">
                  <span className="text-emerald-900 font-bold">残業時間 (※手入力):</span>
                  <input
                    type="text"
                    value={overtimeHours}
                    onChange={e => setOvertimeHours(e.target.value)}
                    className="w-16 p-0.5 border border-emerald-400 rounded text-center font-bold text-emerald-950 bg-white"
                  />
                </div>

                <div className="flex items-center justify-between p-2 bg-slate-800 text-white rounded font-bold">
                  <span>合計時間:</span>
                  <span className="text-amber-400 text-sm">{calculatedTotalHoursStr}</span>
                </div>

                {/* 当月数値合計 (肌色 自動算出) */}
                <div className="p-3 bg-[#FAF3E0] border border-amber-300 rounded-lg text-center space-y-1">
                  <span className="text-[11px] font-bold text-amber-900">当月数値合計 (自動集計):</span>
                  <div className="text-xl font-black text-amber-950">
                    {(baseMonthlyTotal + calculatedDailyTotalValue).toLocaleString()} <span className="text-xs font-normal">pt</span>
                  </div>
                </div>
              </div>
            </div>

            {/* 承認印欄 */}
            <div className="border-t border-slate-200 pt-3">
              <span className="text-[11px] font-bold text-slate-600 block mb-1.5">承認印欄:</span>
              <div className="grid grid-cols-3 gap-2 text-center text-[10px]">
                <div className="border border-slate-300 rounded p-1">
                  <span className="text-slate-400 block border-b border-slate-200 pb-0.5">支店長</span>
                  <span className="text-slate-400 font-bold block pt-1">印</span>
                </div>
                <div className="border border-slate-300 rounded p-1">
                  <span className="text-slate-400 block border-b border-slate-200 pb-0.5">課長</span>
                  <span className="text-slate-400 font-bold block pt-1">印</span>
                </div>
                <div className="border border-slate-300 rounded p-1">
                  <span className="text-slate-400 block border-b border-slate-200 pb-0.5">係長</span>
                  <span className="text-slate-700 font-bold block pt-1">鶴見</span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* ---------------- 上長用 レビューフィードバックエリア ---------------- */}
        {report?.status === 'submitted' && (
          <div className="bg-amber-50 border border-amber-300 rounded-xl p-4 shadow-xs space-y-3">
            <div className="flex items-center gap-2 text-amber-900 font-bold text-xs">
              <UserCheck className="w-4 h-4 text-amber-600" />
              <span>上長確認・コメント入力</span>
            </div>
            <textarea
              rows={2}
              value={reviewComment}
              onChange={e => setReviewComment(e.target.value)}
              placeholder="確認時のフィードバックコメントを入力..."
              className="w-full p-2 border border-amber-300 rounded-lg text-xs bg-white"
            />
            <button
              onClick={handleReview}
              disabled={isSubmitting}
              className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              確認完了（確認印を押印）
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
