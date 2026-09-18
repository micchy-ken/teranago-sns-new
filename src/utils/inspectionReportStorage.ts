import { 
  InspectionReportRecord, 
  InspectionDoorReport, 
  CrmInspectionData, 
  STANDARD_CHECK_ITEMS, 
  InspectionJudgementCode 
} from '../types/inspectionReport';
import { CalendarEvent, User } from '../types';
import { getLocalDateStr, formatTimeJST } from './dateUtils';

const STORAGE_KEY_REPORTS = 'teranago_inspection_reports_v1';
const STORAGE_KEY_CRM = 'teranago_crm_inspection_data_v1';

/** カレンダーイベントから台数を正確に抽出 */
export function extractQuantityFromEvent(event?: CalendarEvent): number {
  if (!event) return 1;
  const eventAny = event as any;
  if (typeof eventAny.quantity === 'number' && eventAny.quantity > 0) {
    return eventAny.quantity;
  }
  if (typeof eventAny.quantity === 'string') {
    const parsed = parseInt(eventAny.quantity, 10);
    if (!isNaN(parsed) && parsed > 0) return parsed;
  }
  if (event.memo) {
    const match = event.memo.match(/【台数】\s*(\d+)\s*台?/);
    if (match && match[1]) {
      const q = parseInt(match[1], 10);
      if (q > 0) return q;
    }
  }
  // タイトルに【〇台】が含まれる場合
  if (event.title) {
    const match = event.title.match(/【(\d+)台】/);
    if (match && match[1]) {
      const q = parseInt(match[1], 10);
      if (q > 0) return q;
    }
  }
  return 1;
}

/** カレンダーイベントから作業Noを正確に抽出 */
export function extractJobNoFromEvent(event?: CalendarEvent): string {
  if (!event) return '';
  const eventAny = event as any;
  if (eventAny.jobNo && typeof eventAny.jobNo === 'string' && eventAny.jobNo.trim()) {
    return eventAny.jobNo.trim();
  }
  if (event.memo) {
    const match = event.memo.match(/【作業No】\s*([^\n\r]+)/);
    if (match && match[1] && match[1].trim() !== '未設定') {
      return match[1].trim();
    }
  }
  return '';
}

/** サンプル初期シードデータ（添付「シャーメゾンジーエー」と「プラセシオン加納天神」） */
const INITIAL_CRM_SEED: CrmInspectionData[] = [
  {
    jobNo: '01269044',
    yearMonth: '202604',
    customerName: 'シャーメゾンジーエー 御中',
    address: '愛知県岡崎市明大寺町字池下51',
    phone: '',
    contractType: 'ST',
    totalDoorsCount: 1,
    doors: [
      {
        doorIndex: 1,
        doorNumber: '247653',
        location: '正面玄関',
        model: '100KLCM',
      },
    ],
    importedAt: '2026-04-01T09:00:00.000Z',
  },
  {
    jobNo: '01296500',
    yearMonth: '202610',
    customerName: '●プラセシオン加納天神　御中',
    address: '岐阜県岐阜市加納天神町4-39',
    phone: '058-274-4351',
    contractType: 'ST',
    totalDoorsCount: 3,
    doors: [
      {
        doorIndex: 1,
        doorNumber: '00025397',
        location: '風除室　外側',
        model: 'TAS-EB-15T',
      },
      {
        doorIndex: 2,
        doorNumber: '00025398',
        location: '風除室　内側',
        model: 'TAS-EB-15T',
      },
      {
        doorIndex: 3,
        doorNumber: '00025399',
        location: 'ＥＶ前',
        model: 'TAS-EB-15T',
      },
    ],
    importedAt: '2026-09-01T09:00:00.000Z',
  },
];

/** デフォルトの全項目「良好(V)」チェックリストマップを作成 */
export function createDefaultCheckResults(): Record<string, InspectionJudgementCode> {
  const map: Record<string, InspectionJudgementCode> = {};
  STANDARD_CHECK_ITEMS.forEach(item => {
    map[item.key] = item.defaultVal || 'V';
  });
  return map;
}

/** 扉1台分のデフォルト点検オブジェクトを生成 */
export function createDefaultDoorReport(
  index: number = 1,
  doorNumber: string = '',
  location: string = '',
  model: string = ''
): InspectionDoorReport {
  return {
    doorIndex: index,
    doorNumber: doorNumber || '',
    location: location || '',
    model: model || '',
    openCount: '',
    openSpeed: '8',
    closeSpeed: '3',
    timerSeconds: '1',
    sensorWidth: '1200',
    outerSensorWidthOk: true,
    outerSensorOpeningOk: true,
    outerSensorDepthOk: true,
    outerSensorNearOk: true,
    innerSensorWidthOk: true,
    innerSensorOpeningOk: true,
    innerSensorDepthOk: true,
    innerSensorNearOk: true,
    checkResults: createDefaultCheckResults(),
    remarks: '',
  };
}

/** 保存されたCRMデータを取得 */
export function getAllCrmInspectionData(): CrmInspectionData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CRM);
    if (raw) {
      return JSON.parse(raw);
    }
  } catch (err) {
    console.warn('Failed to parse CRM data from localStorage:', err);
  }
  // 未保存の場合は初期シードをセットして返却
  localStorage.setItem(STORAGE_KEY_CRM, JSON.stringify(INITIAL_CRM_SEED));
  return INITIAL_CRM_SEED;
}

/** CRMデータを保存（一括取り込み等で使用） */
export function saveCrmInspectionDataList(list: CrmInspectionData[]) {
  try {
    localStorage.setItem(STORAGE_KEY_CRM, JSON.stringify(list));
  } catch (err) {
    console.warn('Failed to save CRM data to localStorage:', err);
  }
}

/** 初期シード報告書（サイン受領済みサンプルの提供） */
function getInitialReportsSeed(): InspectionReportRecord[] {
  const today = new Date().toISOString().slice(0, 10);
  return [
    {
      id: 'rep_sample_signed_01',
      jobNo: '01269044',
      yearMonth: '202604',
      customerName: 'シャーメゾンジーエー 御中',
      address: '愛知県岡崎市明大寺町字池下51',
      phone: '',
      contractType: 'ST',
      category: 'maintenance',
      inspectionDate: today,
      startTime: '09:00',
      endTime: '10:00',
      inspectorId: 'user_sample_inspector',
      inspectorName: '鈴木 保守',
      isCrmImported: true,
      totalDoorsCount: 1,
      doors: [
        {
          doorIndex: 1,
          doorNumber: '247653',
          location: '正面玄関',
          model: '100KLCM',
          openCount: '42,639',
          openSpeed: '8',
          closeSpeed: '3',
          timerSeconds: '1',
          sensorWidth: '1200',
          outerSensorWidthOk: true,
          outerSensorOpeningOk: true,
          outerSensorDepthOk: true,
          outerSensorNearOk: true,
          innerSensorWidthOk: true,
          innerSensorOpeningOk: true,
          innerSensorDepthOk: true,
          innerSensorNearOk: true,
          checkResults: createDefaultCheckResults(),
          remarks: '各部注油・清掃実施。動作良好です。',
        },
      ],
      overallRemarks: '自動ドアの開閉動作、光線センサー感度ともに良好です。次回点検は半年後を予定しております。',
      status: 'signed',
      customerSignature: 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="120" height="40"><text x="10" y="28" font-family="cursive" font-size="20" fill="%231e3a8a">佐藤</text></svg>',
      signedAt: new Date().toISOString(),
      signedCustomerName: '佐藤 管理人',
      officeConfirmed: false,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ];
}

/** 保存された全点検報告書を取得 */
export function getAllInspectionReports(): InspectionReportRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REPORTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed;
      }
    }
  } catch (err) {
    console.warn('Failed to parse inspection reports from localStorage:', err);
  }
  const seed = getInitialReportsSeed();
  try {
    localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(seed));
  } catch (e) {
    // ignore
  }
  return seed;
}

/** 事務員による確認ステータスをトグル更新 */
export function toggleOfficeConfirmation(
  reportId: string, 
  confirmedByName: string
): InspectionReportRecord | null {
  try {
    const list = getAllInspectionReports();
    const idx = list.findIndex(r => r.id === reportId);
    if (idx === -1) return null;

    const current = list[idx];
    const newConfirmed = !current.officeConfirmed;
    const updated: InspectionReportRecord = {
      ...current,
      officeConfirmed: newConfirmed,
      officeConfirmedAt: newConfirmed ? new Date().toISOString() : undefined,
      officeConfirmedByName: newConfirmed ? confirmedByName : undefined,
      updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(list));
    return updated;
  } catch (err) {
    console.warn('Failed to toggle office confirmation:', err);
    return null;
  }
}

/** 点検報告書を保存（新規または更新） */
export function saveInspectionReport(report: InspectionReportRecord): void {
  try {
    const list = getAllInspectionReports();
    const idx = list.findIndex(r => r.id === report.id);
    const updated = {
      ...report,
      updatedAt: new Date().toISOString(),
    };
    if (idx !== -1) {
      list[idx] = updated;
    } else {
      list.push(updated);
    }
    localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(list));
  } catch (err) {
    console.warn('Failed to save inspection report to localStorage:', err);
  }
}

/** 点検報告書を削除 */
export function deleteInspectionReport(id: string): void {
  try {
    const list = getAllInspectionReports().filter(r => r.id !== id);
    localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(list));
  } catch (err) {
    console.warn('Failed to delete inspection report from localStorage:', err);
  }
}

/** 指定現場の過去（直近）の報告書を検索（同じ作業Noまたは同じお客様名） */
export function findPreviousReport(jobNo?: string, customerName?: string): InspectionReportRecord | null {
  const list = getAllInspectionReports();
  // 完了済みのもの（サイン済みまたは下書き）を日付降順で探す
  const matched = list
    .filter(r => {
      if (jobNo && r.jobNo && r.jobNo === jobNo) return true;
      if (customerName && r.customerName && r.customerName.includes(customerName)) return true;
      return false;
    })
    .sort((a, b) => new Date(b.inspectionDate || b.updatedAt).getTime() - new Date(a.inspectionDate || a.updatedAt).getTime());

  return matched.length > 0 ? matched[0] : null;
}

/** CRMデータとスケジュール情報から新規下書き報告書を生成 */
export function createDraftReportFromCrm(
  crm: CrmInspectionData,
  event?: CalendarEvent,
  currentUser?: User
): InspectionReportRecord {
  const eventDate = event?.start ? getLocalDateStr(event.start) : getLocalDateStr(new Date());
  const startTime = event?.start ? formatTimeJST(event.start) : '10:00';
  const endTime = event?.end ? formatTimeJST(event.end) : '11:00';

  const scheduleQty = extractQuantityFromEvent(event);
  const targetDoorsCount = Math.max(crm.totalDoorsCount || 0, crm.doors?.length || 0, scheduleQty, 1);

  const doors: InspectionDoorReport[] = [];
  for (let i = 0; i < targetDoorsCount; i++) {
    const crmDoor = crm.doors?.[i];
    if (crmDoor) {
      doors.push(createDefaultDoorReport(i + 1, crmDoor.doorNumber, crmDoor.location, crmDoor.model));
    } else {
      doors.push(createDefaultDoorReport(i + 1, '', `扉 ${i + 1}`, ''));
    }
  }

  return {
    id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    jobNo: crm.jobNo || extractJobNoFromEvent(event),
    yearMonth: crm.yearMonth || (eventDate ? eventDate.substring(0, 7).replace('-', '') : ''),
    scheduleEventId: event?.id,
    customerName: crm.customerName.replace(/^[●\s]+/, ''),
    address: crm.address || event?.location || '',
    phone: crm.phone || '',
    contractType: crm.contractType || 'ST',
    category: 'maintenance',
    inspectionDate: eventDate,
    startTime,
    endTime,
    inspectorId: currentUser?.id || 'u1',
    inspectorName: currentUser?.name || '作業員',
    isCrmImported: true,
    totalDoorsCount: targetDoorsCount,
    doors,
    overallRemarks: '',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** 未取り込み時の現場手動新規作成用 */
export function createEmptyReportForEvent(
  event: CalendarEvent,
  currentUser?: User,
  customJobNo?: string
): InspectionReportRecord {
  const eventDate = event.start ? getLocalDateStr(event.start) : getLocalDateStr(new Date());
  const startTime = event.start ? formatTimeJST(event.start) : '10:00';
  const endTime = event.end ? formatTimeJST(event.end) : '11:00';

  const scheduleQty = extractQuantityFromEvent(event);
  const jobNo = customJobNo || extractJobNoFromEvent(event);

  const doors: InspectionDoorReport[] = [];
  for (let i = 0; i < scheduleQty; i++) {
    doors.push(createDefaultDoorReport(i + 1, '', i === 0 ? '正面玄関' : `扉 ${i + 1}`, ''));
  }

  return {
    id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    jobNo,
    yearMonth: eventDate.substring(0, 7).replace('-', ''),
    scheduleEventId: event.id,
    customerName: event.title.replace(/【.*?】/, '').trim(),
    address: event.location || '',
    phone: '',
    contractType: 'ST',
    category: 'maintenance',
    inspectionDate: eventDate,
    startTime,
    endTime,
    inspectorId: currentUser?.id || 'u1',
    inspectorName: currentUser?.name || '作業員',
    isCrmImported: false,
    totalDoorsCount: scheduleQty,
    doors,
    overallRemarks: '',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

/** 前回報告書の点検結果をコピーして新しい下書きを作成 */
export function copyPreviousReportToNew(
  prevReport: InspectionReportRecord,
  event?: CalendarEvent,
  crm?: CrmInspectionData,
  currentUser?: User
): InspectionReportRecord {
  const eventDate = event?.start ? getLocalDateStr(event.start) : getLocalDateStr(new Date());
  const startTime = event?.start ? formatTimeJST(event.start) : '10:00';
  const endTime = event?.end ? formatTimeJST(event.end) : '11:00';

  const scheduleQty = extractQuantityFromEvent(event);

  // 扉情報の引き継ぎ: 前回の扉点検結果をそのままコピー（開閉回数等は空にして最新入力を促す）
  const copiedDoors: InspectionDoorReport[] = prevReport.doors.map((d, i) => {
    // もし今回CRMデータに最新の扉番号等があればそちらを優先マージ
    const matchedCrmDoor = crm?.doors?.[i];
    return {
      ...d,
      doorNumber: matchedCrmDoor?.doorNumber || d.doorNumber,
      location: matchedCrmDoor?.location || d.location,
      model: matchedCrmDoor?.model || d.model,
      openCount: '', // 開閉回数は今回現場で測るためクリア
      // 判定結果や寸法チェックは前回の値をそのままコピー
      checkResults: { ...(d.checkResults || {}) },
    };
  });

  // スケジュール台数が前回より多い場合は空の扉を追加
  while (copiedDoors.length < scheduleQty) {
    const nextIdx = copiedDoors.length + 1;
    copiedDoors.push(createDefaultDoorReport(nextIdx, '', `扉 ${nextIdx}`, ''));
  }

  const finalJobNo = crm?.jobNo || extractJobNoFromEvent(event) || prevReport.jobNo;

  return {
    id: `rep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    jobNo: finalJobNo,
    yearMonth: crm?.yearMonth || eventDate.substring(0, 7).replace('-', ''),
    scheduleEventId: event?.id,
    customerName: crm?.customerName?.replace(/^[●\s]+/, '') || prevReport.customerName,
    address: crm?.address || event?.location || prevReport.address,
    phone: crm?.phone || prevReport.phone || '',
    contractType: crm?.contractType || prevReport.contractType || 'ST',
    category: prevReport.category || 'maintenance',
    inspectionDate: eventDate,
    startTime,
    endTime,
    inspectorId: currentUser?.id || prevReport.inspectorId,
    inspectorName: currentUser?.name || prevReport.inspectorName,
    isCrmImported: !!crm,
    totalDoorsCount: Math.max(copiedDoors.length, scheduleQty),
    doors: copiedDoors,
    overallRemarks: prevReport.overallRemarks || '',
    status: 'draft',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}
