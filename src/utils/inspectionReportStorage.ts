import { 
  InspectionReportRecord, 
  InspectionDoorReport, 
  CrmInspectionData, 
  STANDARD_CHECK_ITEMS, 
  InspectionJudgementCode 
} from '../types/inspectionReport';
import { CalendarEvent, User } from '../types';
import { getLocalDateStr, formatTimeJST } from './dateUtils';
import { API_BASE_URL } from '../config/api';
import { getInspectionMasterItems } from './inspectionMasterStorage';
import { normalizeJobNo, isSameJobNo } from './crmInspectionPdfParser';

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

/** デフォルトの全項目「良好(V)」チェックリストマップを作成 */
export function createDefaultCheckResults(): Record<string, InspectionJudgementCode> {
  const map: Record<string, InspectionJudgementCode> = {};
  const items = getInspectionMasterItems();
  items.forEach(item => {
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

/** 保存されたCRMデータを取得（モック・シードは一切使用せず空配列で開始） */
export function getAllCrmInspectionData(): CrmInspectionData[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_CRM);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter((item) => item && typeof item.jobNo === 'string' && item.jobNo.trim().length > 0);
      }
    }
  } catch (err) {
    console.warn('Failed to parse CRM data from localStorage:', err);
  }
  return [];
}

/** 作業No（ゼロ埋め有無を自動吸収）でCRMデータを検索 */
export function findCrmDataByJobNo(
  crmList: CrmInspectionData[],
  jobNo?: string | null
): CrmInspectionData | undefined {
  if (!jobNo || !Array.isArray(crmList) || crmList.length === 0) return undefined;
  return crmList.find((c) => isSameJobNo(c.jobNo, jobNo));
}

/** 保存された全点検報告書を取得（ローカルキャッシュ） */
export function getAllInspectionReports(): InspectionReportRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_REPORTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) {
        return parsed.filter(r => r.id !== 'rep_sample_signed_01');
      }
    }
  } catch (err) {
    console.warn('Failed to parse inspection reports from localStorage:', err);
  }
  return [];
}

/** サーバー（MS SQL Server / クラウドDB）から点検報告書一覧を取得 */
export async function fetchInspectionReportsApi(filters?: { 
  date?: string; 
  status?: string; 
  jobNo?: string; 
  inspectorId?: string;
  yearMonth?: string;
}): Promise<InspectionReportRecord[]> {
  try {
    const params = new URLSearchParams();
    if (filters?.date) params.append('date', filters.date);
    if (filters?.status) params.append('status', filters.status);
    if (filters?.jobNo) params.append('jobNo', filters.jobNo);
    if (filters?.inspectorId) params.append('inspectorId', filters.inspectorId);
    if (filters?.yearMonth) params.append('yearMonth', filters.yearMonth);

    const url = `${API_BASE_URL}/inspections/reports${params.toString() ? `?${params.toString()}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.reports)) {
      // ローカルストレージをサーバーデータで最新化
      localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(data.reports));
      return data.reports;
    }
  } catch (err) {
    console.warn('[InspectionReportStorage] fetchInspectionReportsApi failed, using localStorage:', err);
  }
  return getAllInspectionReports();
}

/** サーバー（MS SQL Server / クラウドDB）へ点検報告書（サイン含む）を即時保存・送信 */
export async function saveInspectionReportApi(report: InspectionReportRecord): Promise<boolean> {
  try {
    const url = `${API_BASE_URL}/inspections/reports`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report)
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || `HTTP error ${res.status}`);
    }
    return true;
  } catch (err) {
    console.error('[InspectionReportStorage] saveInspectionReportApi failed to persist to server DB:', err);
    return false;
  }
}

/** 事務員による確認ステータスをトグル更新（DB & ローカル二重更新） */
export function toggleOfficeConfirmation(
  reportId: string, 
  confirmedByName: string,
  user?: User
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
      officeConfirmedById: newConfirmed && user ? user.id : undefined,
      updatedAt: new Date().toISOString(),
    };
    list[idx] = updated;
    localStorage.setItem(STORAGE_KEY_REPORTS, JSON.stringify(list));

    // サーバー（DB）へ非同期即時反映
    fetch(`${API_BASE_URL}/inspections/reports/${encodeURIComponent(reportId)}/confirm`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user: user || { name: confirmedByName } })
    }).catch(err => {
      console.warn('[InspectionReportStorage] Office confirmation server sync error:', err);
    });

    return updated;
  } catch (err) {
    console.warn('Failed to toggle office confirmation:', err);
    return null;
  }
}

/** 点検報告書を保存（新規または更新: ローカル保存 + サーバーDB即時POST） */
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

    // サーバー（Synology NAS / SQL Server）へ直ちにPOST送信
    saveInspectionReportApi(updated).then(success => {
      if (success) {
        console.log(`[InspectionReportStorage] Successfully saved report ${report.id} to cloud DB!`);
      }
    });
  } catch (err) {
    console.warn('Failed to save inspection report to localStorage:', err);
  }
}

/** サーバーからCRM点検データを取得 */
export async function fetchCrmInspectionDataApi(yearMonth?: string): Promise<CrmInspectionData[]> {
  try {
    const url = `${API_BASE_URL}/inspections/crm-data${yearMonth ? `?yearMonth=${encodeURIComponent(yearMonth)}` : ''}`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`HTTP error ${res.status}`);
    const data = await res.json();
    if (data && Array.isArray(data.items)) {
      localStorage.setItem(STORAGE_KEY_CRM, JSON.stringify(data.items));
      return data.items;
    }
  } catch (err) {
    console.warn('[InspectionReportStorage] fetchCrmInspectionDataApi error:', err);
  }
  return getAllCrmInspectionData();
}

/** CRM点検データを一括保存（既存データと作業No正規化マージ ＋ ローカル＆サーバーDB即時POST） */
export async function saveCrmInspectionDataList(
  list: CrmInspectionData[],
  importedBy?: string,
  options?: { merge?: boolean }
): Promise<{
  ok: boolean;
  savedToServer: boolean;
  importedCount: number;
  totalCount: number;
  mergedList: CrmInspectionData[];
  error?: string;
}> {
  const shouldMerge = options?.merge !== false;
  let mergedList: CrmInspectionData[] = [];

  try {
    const map = new Map<string, CrmInspectionData>();
    if (shouldMerge) {
      for (const existing of getAllCrmInspectionData()) {
        const key = normalizeJobNo(existing.jobNo);
        if (key) map.set(key, existing);
      }
    }
    for (const item of list) {
      const key = normalizeJobNo(item.jobNo);
      if (key) map.set(key, item);
    }
    mergedList = Array.from(map.values());
    localStorage.setItem(STORAGE_KEY_CRM, JSON.stringify(mergedList));
  } catch (err) {
    console.warn('Failed to save CRM data to localStorage:', err);
    mergedList = list;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/inspections/crm-data/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: list,
        yearMonth: list[0]?.yearMonth || '',
        importedBy,
      }),
    });
    if (!res.ok) {
      const errBody = await res.json().catch(() => ({}));
      const msg = errBody?.error || `HTTP ${res.status}`;
      console.warn('[InspectionReportStorage] CRM bulk save server sync error:', msg);
      return {
        ok: true,
        savedToServer: false,
        importedCount: list.length,
        totalCount: mergedList.length,
        mergedList,
        error: msg,
      };
    }
    return {
      ok: true,
      savedToServer: true,
      importedCount: list.length,
      totalCount: mergedList.length,
      mergedList,
    };
  } catch (err: any) {
    console.warn('[InspectionReportStorage] CRM bulk save server sync error:', err);
    return {
      ok: true,
      savedToServer: false,
      importedCount: list.length,
      totalCount: mergedList.length,
      mergedList,
      error: err?.message || 'ネットワークエラー',
    };
  }
}

/**
 * 既存の点検報告書（下書き・未反映分など）にCRMデータ（物件No・設置場所・型式）を安全にマッピング反映する
 * - 既存のチェック判定・計測値・特記事項・サインはすべて保持
 * - overwriteNonEmpty: false の場合は空欄または初期プレースホルダ（「扉 1」「正面玄関」等）のみ自動補完
 * - overwriteNonEmpty: true の場合はCRM側の物件No・設置場所・型式を優先反映
 */
export function applyCrmDataToReport(
  report: InspectionReportRecord,
  crm: CrmInspectionData,
  options?: { overwriteNonEmpty?: boolean }
): InspectionReportRecord {
  const overwrite = options?.overwriteNonEmpty === true;
  const existingDoors = Array.isArray(report.doors) ? report.doors : [];
  const crmDoors = Array.isArray(crm.doors) ? crm.doors : [];
  const targetCount = Math.max(existingDoors.length, crmDoors.length, crm.totalDoorsCount || 0, 1);

  const isPlaceholderLocation = (loc?: string, idx?: number) => {
    const trimmed = (loc || '').trim();
    if (!trimmed) return true;
    if (/^扉\s*\d+$/.test(trimmed)) return true;
    if (idx === 0 && trimmed === '正面玄関') return true;
    return false;
  };

  const nextDoors: InspectionDoorReport[] = [];
  for (let i = 0; i < targetCount; i++) {
    const existing = existingDoors[i];
    const crmDoor = crmDoors[i];
    if (existing && crmDoor) {
      const canFillLocation =
        overwrite ||
        (!existing.doorNumber && isPlaceholderLocation(existing.location, i)) ||
        !existing.location?.trim();

      nextDoors.push({
        ...existing,
        doorIndex: i + 1,
        doorNumber: overwrite
          ? (crmDoor.doorNumber || existing.doorNumber || '')
          : (existing.doorNumber?.trim() ? existing.doorNumber : (crmDoor.doorNumber || '')),
        location: canFillLocation
          ? (crmDoor.location || existing.location || '')
          : existing.location,
        model: overwrite
          ? (crmDoor.model || existing.model || '')
          : (existing.model?.trim() ? existing.model : (crmDoor.model || '')),
      });
    } else if (existing) {
      nextDoors.push({ ...existing, doorIndex: i + 1 });
    } else if (crmDoor) {
      nextDoors.push(
        createDefaultDoorReport(i + 1, crmDoor.doorNumber, crmDoor.location, crmDoor.model)
      );
    } else {
      nextDoors.push(createDefaultDoorReport(i + 1, '', `扉 ${i + 1}`, ''));
    }
  }

  return {
    ...report,
    jobNo: report.jobNo?.trim() || crm.jobNo,
    yearMonth: report.yearMonth?.trim() || crm.yearMonth,
    address: report.address?.trim() || crm.address || '',
    phone: report.phone?.trim() || crm.phone || '',
    contractType: report.contractType?.trim() || crm.contractType || 'ST',
    isCrmImported: true,
    totalDoorsCount: nextDoors.length,
    doors: nextDoors,
  };
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

/** 指定現場の過去（直近）の報告書を検索（同じ作業No[ゼロ埋め吸収]または同じお客様名） */
export function findPreviousReport(jobNo?: string, customerName?: string): InspectionReportRecord | null {
  const list = getAllInspectionReports();
  // 完了済みのもの（サイン済みまたは下書き）を日付降順で探す
  const matched = list
    .filter(r => {
      if (jobNo && r.jobNo && isSameJobNo(r.jobNo, jobNo)) return true;
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
