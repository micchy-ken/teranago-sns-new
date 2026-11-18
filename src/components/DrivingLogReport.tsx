import React, { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import {
  DailyReport,
  DrivingLogData,
  DrivingLogRow,
  DrivingLogOfficeConfig,
  DrivingLogInspectionItem,
  User,
  OfficeMaster,
  DivisionMaster,
  CalendarEvent,
  WorkReportStatus,
} from '../types';
import { AssetItem } from '../types/asset';
import { API_BASE_URL } from '../config/api';
import {
  DRIVING_LOG_OFFICE_CONFIGS_CACHE_KEY,
  DEFAULT_DRIVING_INSPECTION_ITEMS,
  DEFAULT_KY_DECLARATION_LINES,
  DEFAULT_DRIVING_LOG_LEGAL_NOTES,
  DEFAULT_DRIVING_LOG_TOTAL_NOTICE,
  createDefaultDrivingLogOfficeConfig,
  normalizeDrivingLogOfficeConfig,
} from './admin/DrivingLogOfficeConfigAdmin';
import {
  Car,
  Printer,
  Save,
  Send,
  ChevronLeft,
  ChevronRight,
  CheckCircle2,
  Calendar,
  MapPin,
  Gauge,
  Fuel,
  ShieldCheck,
  Sparkles,
  RotateCcw,
  FileText,
  Info,
  Clock,
  CheckSquare,
  Square,
  Plus,
} from 'lucide-react';
import { getLocalDateStr } from '../utils/dateUtils';
import {
  getUserOfficeName,
  getUserDivisionName,
  findOfficeConfig,
  resolveOffice,
} from '../utils/masterResolver';

export const DRIVING_INSPECTION_ITEMS = DEFAULT_DRIVING_INSPECTION_ITEMS;
export const KY_DECLARATION_LINES = DEFAULT_KY_DECLARATION_LINES;

// JST基準で「今日」が属する月度（締日翌日以降は翌月度）を算出
export function getDefaultDrivingPeriod(
  now: Date = new Date(),
  closingDay: number = 25
): { year: number; month: number } {
  const ymd = getLocalDateStr(now);
  const [y, m, d] = ymd.split('-').map(Number);
  if (closingDay < 28 && d > closingDay) {
    if (m === 12) return { year: y + 1, month: 1 };
    return { year: y, month: m + 1 };
  }
  return { year: y, month: m };
}

// 対象年月度（例: 2026年11月度）と締日から期間日付配列（JST）を生成
export function generateDrivingPeriodDates(
  targetYear: number,
  targetMonth: number,
  closingDay: number = 25
): {
  periodStart: string;
  periodEnd: string;
  periodLabel: string;
  dates: { date: string; month: number; day: number; monthDayLabel: string; weekday: string }[];
} {
  const pad = (n: number) => String(n).padStart(2, '0');
  const lastDayOfMonth = (yr: number, mo: number) => new Date(yr, mo, 0).getDate();

  let startStr: string;
  let endStr: string;
  let periodLabel: string;

  if (closingDay >= 28) {
    const endDay = lastDayOfMonth(targetYear, targetMonth);
    startStr = `${targetYear}-${pad(targetMonth)}-01`;
    endStr = `${targetYear}-${pad(targetMonth)}-${pad(endDay)}`;
    periodLabel = `${targetMonth}月1日～${targetMonth}月${endDay}日`;
  } else {
    const prevYear = targetMonth === 1 ? targetYear - 1 : targetYear;
    const prevMonth = targetMonth === 1 ? 12 : targetMonth - 1;
    const startDay = Math.min(closingDay + 1, lastDayOfMonth(prevYear, prevMonth));
    const endDay = Math.min(closingDay, lastDayOfMonth(targetYear, targetMonth));
    startStr = `${prevYear}-${pad(prevMonth)}-${pad(startDay)}`;
    endStr = `${targetYear}-${pad(targetMonth)}-${pad(endDay)}`;
    periodLabel = `${prevMonth}月${startDay}日～${targetMonth}月${endDay}日`;
  }

  const startMs = new Date(`${startStr}T12:00:00+09:00`).getTime();
  const endMs = new Date(`${endStr}T12:00:00+09:00`).getTime();
  const weekdays = ['日', '月', '火', '水', '木', '金', '土'];

  const dates: { date: string; month: number; day: number; monthDayLabel: string; weekday: string }[] = [];
  for (let ms = startMs; ms <= endMs; ms += 86400000) {
    const dt = new Date(ms);
    const dStr = getLocalDateStr(dt);
    const [, m, d] = dStr.split('-').map(Number);
    const jstDay = new Date(`${dStr}T12:00:00+09:00`).getDay();
    dates.push({
      date: dStr,
      month: m,
      day: d,
      monthDayLabel: `${m}月${d}日`,
      weekday: weekdays[jstDay],
    });
  }

  return {
    periodStart: startStr,
    periodEnd: endStr,
    periodLabel,
    dates,
  };
}

interface DrivingLogReportProps {
  currentUser: User;
  reports: DailyReport[];
  vehicleAssets: AssetItem[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  calendarEvents?: CalendarEvent[];
  onSaveReport: (reportId: string | null, payload: Partial<DailyReport>) => Promise<void>;
}

export const DrivingLogReportView: React.FC<DrivingLogReportProps> = ({
  currentUser,
  reports,
  vehicleAssets,
  offices = [],
  divisions = [],
  calendarEvents = [],
  onSaveReport,
}) => {
  const [officeConfigs, setOfficeConfigs] = useState<DrivingLogOfficeConfig[]>(() => {
    try {
      const cached = localStorage.getItem(DRIVING_LOG_OFFICE_CONFIGS_CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (e) {}
    return [];
  });

  useEffect(() => {
    let isMounted = true;
    fetch(`${API_BASE_URL}/masters/driving-log-configs`)
      .then((res) => res.json())
      .then((data) => {
        if (!isMounted) return;
        if (Array.isArray(data)) {
          setOfficeConfigs(data);
          try {
            localStorage.setItem(DRIVING_LOG_OFFICE_CONFIGS_CACHE_KEY, JSON.stringify(data));
          } catch (e) {}
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // 自分の担当車両を優先し、なければ全車両から選択可能
  const myVehicles = useMemo(() => {
    const normName = (s?: string) => (s || '').replace(/[\s　]+/g, '').trim();
    const myNorm = normName(currentUser.name);
    return vehicleAssets.filter(
      (v) =>
        v.status !== 'retired' &&
        (String(v.assigneeUserId || '') === String(currentUser.id) ||
          (v.assigneeUserName && normName(v.assigneeUserName) === myNorm))
    );
  }, [vehicleAssets, currentUser.id, currentUser.name]);

  const selectableVehicles = useMemo(() => {
    const active = vehicleAssets.filter((v) => v.status !== 'retired');
    if (myVehicles.length > 0) {
      const myIds = new Set(myVehicles.map((v) => v.id));
      const others = active.filter((v) => !myIds.has(v.id));
      return [...myVehicles, ...others];
    }
    return active;
  }, [vehicleAssets, myVehicles]);

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(() => {
    return myVehicles[0]?.id || selectableVehicles[0]?.id || '';
  });

  useEffect(() => {
    if (!selectedVehicleId && (myVehicles[0]?.id || selectableVehicles[0]?.id)) {
      setSelectedVehicleId(myVehicles[0]?.id || selectableVehicles[0]?.id || '');
    }
  }, [myVehicles, selectableVehicles, selectedVehicleId]);

  const selectedVehicle = useMemo(
    () => selectableVehicles.find((v) => v.id === selectedVehicleId) || null,
    [selectableVehicles, selectedVehicleId]
  );

  // 対象車両の所属拠点または使用者の所属拠点から拠点別様式設定を解決
  const resolvedOffice = useMemo(() => {
    const vehicleOfficeKey = selectedVehicle?.officeId || selectedVehicle?.office;
    if (vehicleOfficeKey) {
      const matched = resolveOffice(vehicleOfficeKey, offices);
      if (matched) return matched;
    }
    const userOfficeKey = getUserOfficeName(currentUser, offices) || currentUser.officeId || currentUser.office;
    if (userOfficeKey) {
      const matched = resolveOffice(userOfficeKey, offices);
      if (matched) return matched;
    }
    return offices[0] || { id: undefined, name: selectedVehicle?.office || currentUser.office || '名古屋支店' };
  }, [selectedVehicle, currentUser, offices]);

  const currentOfficeConfig = useMemo<DrivingLogOfficeConfig>(() => {
    const found = findOfficeConfig(
      officeConfigs,
      resolvedOffice.id || resolvedOffice.name,
      offices
    );
    return normalizeDrivingLogOfficeConfig(
      found || createDefaultDrivingLogOfficeConfig(resolvedOffice.name, resolvedOffice.id),
      resolvedOffice.name,
      resolvedOffice.id
    );
  }, [officeConfigs, resolvedOffice, offices]);

  const closingDay = currentOfficeConfig.defaultSettings.closingDay || 25;
  const defaultPeriod = useMemo(() => getDefaultDrivingPeriod(new Date(), closingDay), [closingDay]);
  const [targetYear, setTargetYear] = useState<number>(() => defaultPeriod.year);
  const [targetMonth, setTargetMonth] = useState<number>(() => defaultPeriod.month);

  const periodInfo = useMemo(
    () => generateDrivingPeriodDates(targetYear, targetMonth, closingDay),
    [targetYear, targetMonth, closingDay]
  );

  // 該当車両（または自分）＆該当月度の既存運転記録簿を検索
  const existingReport = useMemo(() => {
    return (
      reports.find((r) => {
        const dLog = r.drivingLogData || (r.constructionData?.__kind === 'driving_log' ? (r.constructionData as unknown as DrivingLogData) : undefined);
        if (!dLog && r.reportType !== 'driving_log') return false;
        if (!dLog) return false;
        const sameMonth = Number(dLog.targetYear) === targetYear && Number(dLog.targetMonth) === targetMonth;
        if (!sameMonth) return false;
        if (selectedVehicleId && dLog.vehicleAssetId) {
          return dLog.vehicleAssetId === selectedVehicleId;
        }
        const authorId = r.author?.id || r.authorId || r.author_id;
        return String(authorId) === String(currentUser.id);
      }) || null
    );
  }, [reports, targetYear, targetMonth, selectedVehicleId, currentUser.id]);

  // 実際にフォーム・帳票で使用する日常点検項目 / KY宣言 / 確認印ラベル
  const savedLogSnapshot: DrivingLogData | undefined =
    existingReport?.drivingLogData ||
    (existingReport?.constructionData?.__kind === 'driving_log'
      ? (existingReport.constructionData as unknown as DrivingLogData)
      : undefined);

  const isLockedSubmitted =
    existingReport?.status === 'submitted' || existingReport?.status === 'reviewed';

  const activeInspectionItems = useMemo<DrivingLogInspectionItem[]>(() => {
    if (
      isLockedSubmitted &&
      savedLogSnapshot?.inspectionItemsSnapshot &&
      savedLogSnapshot.inspectionItemsSnapshot.length > 0
    ) {
      return savedLogSnapshot.inspectionItemsSnapshot.filter((it) => it.enabled !== false);
    }
    return currentOfficeConfig.inspectionItems.filter((it) => it.enabled !== false);
  }, [isLockedSubmitted, savedLogSnapshot, currentOfficeConfig]);

  const activeKyTitle =
    isLockedSubmitted && savedLogSnapshot?.kyDeclarationTitleSnapshot
      ? savedLogSnapshot.kyDeclarationTitleSnapshot
      : currentOfficeConfig.kyDeclarationTitle || 'K Y 宣 言';

  const activeKyLines = useMemo<string[]>(() => {
    if (
      isLockedSubmitted &&
      savedLogSnapshot?.kyDeclarationLinesSnapshot &&
      savedLogSnapshot.kyDeclarationLinesSnapshot.length > 0
    ) {
      return savedLogSnapshot.kyDeclarationLinesSnapshot;
    }
    return currentOfficeConfig.kyDeclarationLines;
  }, [isLockedSubmitted, savedLogSnapshot, currentOfficeConfig]);

  const activeStampLabels = currentOfficeConfig.stampLabels;
  const defaultSettings = currentOfficeConfig.defaultSettings;

  // 拠点・部署・車種・登録番号の初期値導出
  const defaultHeaderValues = useMemo(() => {
    const uOffice = getUserOfficeName(currentUser, offices) || currentUser.office || '';
    const uDiv = getUserDivisionName(currentUser, divisions) || currentUser.division || '';
    const combinedDept = [uOffice, uDiv].filter(Boolean).join(' ') || currentUser.department || '';

    const vModel =
      selectedVehicle?.attributes?.vehicleModel ||
      selectedVehicle?.attributes?.modelName ||
      selectedVehicle?.attributes?.carName ||
      selectedVehicle?.name ||
      '';
    const regNo =
      selectedVehicle?.assetCode ||
      selectedVehicle?.attributes?.registrationNumber ||
      selectedVehicle?.attributes?.plateNumber ||
      '';
    const assignee = selectedVehicle?.assigneeUserName || currentUser.name || '';

    return {
      officeAndDepartment: combinedDept,
      driverAssigneeName: assignee,
      vehicleModel: String(vModel),
      registrationNumber: String(regNo),
    };
  }, [currentUser, offices, divisions, selectedVehicle]);

  // フォームステート
  const [officeAndDepartment, setOfficeAndDepartment] = useState<string>('');
  const [driverAssigneeName, setDriverAssigneeName] = useState<string>('');
  const [vehicleModel, setVehicleModel] = useState<string>('');
  const [registrationNumber, setRegistrationNumber] = useState<string>('');
  const [reportDate, setReportDate] = useState<string>(() => getLocalDateStr(new Date()));
  const [inspectionChecks, setInspectionChecks] = useState<Record<string, boolean>>({});
  const [rows, setRows] = useState<DrivingLogRow[]>([]);
  const [cashTollAmount, setCashTollAmount] = useState<number | ''>('');
  const [cashFuelAmount, setCashFuelAmount] = useState<number | ''>('');
  const [isSaving, setIsSaving] = useState(false);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [isPrintModalOpen, setIsPrintModalOpen] = useState(false);

  // クイック入力用の選択日（デフォルトは今日が期間内なら今日、そうでなければ期間初日）
  const todayStr = useMemo(() => getLocalDateStr(new Date()), []);
  const [selectedDayStr, setSelectedDayStr] = useState<string>(todayStr);

  // 月度または車両切り替え時にデータ初期化・復元
  useEffect(() => {
    const savedLog: DrivingLogData | undefined =
      existingReport?.drivingLogData ||
      (existingReport?.constructionData?.__kind === 'driving_log'
        ? (existingReport.constructionData as unknown as DrivingLogData)
        : undefined);

    if (savedLog) {
      setOfficeAndDepartment(savedLog.officeAndDepartment || defaultHeaderValues.officeAndDepartment);
      setDriverAssigneeName(savedLog.driverAssigneeName || defaultHeaderValues.driverAssigneeName);
      setVehicleModel(savedLog.vehicleModel || defaultHeaderValues.vehicleModel);
      setRegistrationNumber(savedLog.registrationNumber || defaultHeaderValues.registrationNumber);
      setReportDate(savedLog.reportDate || todayStr);
      setInspectionChecks(savedLog.inspectionChecks || {});
      setCashTollAmount(savedLog.cashTollAmount ?? '');
      setCashFuelAmount(savedLog.cashFuelAmount ?? '');

      const savedRowMap = new Map<string, DrivingLogRow>();
      (savedLog.rows || []).forEach((r) => {
        if (r && r.date) savedRowMap.set(r.date, r);
      });

      const mergedRows: DrivingLogRow[] = periodInfo.dates.map((d) => {
        const found = savedRowMap.get(d.date);
        if (found) {
          return {
            ...found,
            date: d.date,
            monthDayLabel: d.monthDayLabel,
          };
        }
        return {
          date: d.date,
          monthDayLabel: d.monthDayLabel,
          alcoholPresence: '',
          alcoholValue: '',
          driverName: '',
          departureTime: '',
          departureMeter: '',
          destination: '',
          arrivalTime: '',
          arrivalMeter: '',
          distanceKm: '',
          fuelLiters: '',
          fuelAmount: '',
        };
      });
      setRows(mergedRows);
    } else {
      setOfficeAndDepartment(defaultHeaderValues.officeAndDepartment);
      setDriverAssigneeName(defaultHeaderValues.driverAssigneeName);
      setVehicleModel(defaultHeaderValues.vehicleModel);
      setRegistrationNumber(defaultHeaderValues.registrationNumber);
      setReportDate(todayStr);
      const initialChecks: Record<string, boolean> = {};
      if (defaultSettings.autoCheckAllInspectionOnNew) {
        activeInspectionItems.forEach((item) => {
          initialChecks[item.key] = true;
        });
      }
      setInspectionChecks(initialChecks);
      setCashTollAmount('');
      setCashFuelAmount('');
      setRows(
        periodInfo.dates.map((d) => ({
          date: d.date,
          monthDayLabel: d.monthDayLabel,
          alcoholPresence: '',
          alcoholValue: '',
          driverName: '',
          departureTime: '',
          departureMeter: '',
          destination: '',
          arrivalTime: '',
          arrivalMeter: '',
          distanceKm: '',
          fuelLiters: '',
          fuelAmount: '',
        }))
      );
    }

    const inPeriod = periodInfo.dates.some((d) => d.date === todayStr);
    setSelectedDayStr(inPeriod ? todayStr : periodInfo.dates[0]?.date || todayStr);
  }, [existingReport?.id, targetYear, targetMonth, selectedVehicleId, defaultHeaderValues, periodInfo, todayStr, defaultSettings.autoCheckAllInspectionOnNew, activeInspectionItems]);

  // 選択中の日の行データと前日までの最終メーター
  const activeRowIndex = useMemo(
    () => rows.findIndex((r) => r.date === selectedDayStr),
    [rows, selectedDayStr]
  );
  const activeRow = activeRowIndex >= 0 ? rows[activeRowIndex] : null;

  const previousArrivalMeter = useMemo(() => {
    if (activeRowIndex <= 0) return '';
    for (let i = activeRowIndex - 1; i >= 0; i--) {
      const m = rows[i]?.arrivalMeter;
      if (m !== '' && m !== undefined && !isNaN(Number(m))) {
        return Number(m);
      }
    }
    return '';
  }, [rows, activeRowIndex]);

  // 選択日のカレンダー予定から訪問先候補を抽出
  const suggestedDestinations = useMemo(() => {
    if (!selectedDayStr || !calendarEvents.length) return [];
    const candidates = new Set<string>();
    calendarEvents.forEach((ev) => {
      const evStart = getLocalDateStr(ev.start);
      const evEnd = ev.end ? getLocalDateStr(ev.end) : evStart;
      if (!evStart || selectedDayStr < evStart || selectedDayStr > evEnd) return;
      const isMine =
        String(ev.createdBy?.id || '') === String(currentUser.id) ||
        (ev.attendees || []).some((a) => String(a.id) === String(currentUser.id));
      if (!isMine) return;
      if (ev.location && ev.location.trim()) candidates.add(ev.location.trim());
      if (ev.title && ev.title.trim()) candidates.add(ev.title.trim());
    });
    return Array.from(candidates).slice(0, 6);
  }, [calendarEvents, selectedDayStr, currentUser.id]);

  // 行の更新（出発・帰着メーターから走行距離を自動計算）
  const updateRow = (dateStr: string, patch: Partial<DrivingLogRow>) => {
    setRows((prev) =>
      prev.map((row) => {
        if (row.date !== dateStr) return row;
        const next: DrivingLogRow = { ...row, ...patch };
        const dep = next.departureMeter !== '' && next.departureMeter !== undefined ? Number(next.departureMeter) : NaN;
        const arr = next.arrivalMeter !== '' && next.arrivalMeter !== undefined ? Number(next.arrivalMeter) : NaN;
        if (!isNaN(dep) && !isNaN(arr) && arr >= dep) {
          next.distanceKm = Math.round((arr - dep) * 10) / 10;
        } else if (patch.departureMeter !== undefined || patch.arrivalMeter !== undefined) {
          if (isNaN(dep) || isNaN(arr)) {
            next.distanceKm = '';
          }
        }
        return next;
      })
    );
  };

  // ワンタップ初期セット（運転者・アルコール0.00・前回メーター）
  const handleQuickFillDay = (dateStr: string) => {
    const idx = rows.findIndex((r) => r.date === dateStr);
    if (idx < 0) return;
    const current = rows[idx];
    let prevMeter: number | '' = current.departureMeter;
    if (prevMeter === '') {
      for (let i = idx - 1; i >= 0; i--) {
        if (rows[i].arrivalMeter !== '' && !isNaN(Number(rows[i].arrivalMeter))) {
          prevMeter = Number(rows[i].arrivalMeter);
          break;
        }
      }
    }
    updateRow(dateStr, {
      alcoholPresence: current.alcoholPresence || defaultSettings.defaultAlcoholPresence || '無',
      alcoholValue: current.alcoholValue || defaultSettings.defaultAlcoholValue || '0.00',
      driverName: current.driverName || driverAssigneeName || currentUser.name,
      departureTime: current.departureTime || defaultSettings.defaultDepartureTime || '08:30',
      departureMeter: prevMeter,
    });
  };

  // 集計値（走行距離・給油量・給油金額・稼働日数）
  const totals = useMemo(() => {
    let distanceKm = 0;
    let fuelLiters = 0;
    let fuelAmount = 0;
    let recordedDays = 0;

    rows.forEach((r) => {
      const hasAny =
        Boolean(r.destination?.trim()) ||
        r.departureMeter !== '' ||
        r.arrivalMeter !== '' ||
        r.distanceKm !== '' ||
        r.fuelLiters !== '' ||
        Boolean(r.departureTime) ||
        Boolean(r.arrivalTime);
      if (hasAny) recordedDays++;

      if (r.distanceKm !== '' && !isNaN(Number(r.distanceKm))) {
        distanceKm += Number(r.distanceKm);
      }
      if (r.fuelLiters !== '' && !isNaN(Number(r.fuelLiters))) {
        fuelLiters += Number(r.fuelLiters);
      }
      if (r.fuelAmount !== '' && !isNaN(Number(r.fuelAmount))) {
        fuelAmount += Number(r.fuelAmount);
      }
    });

    return {
      distanceKm: Math.round(distanceKm * 10) / 10,
      fuelLiters: Math.round(fuelLiters * 100) / 100,
      fuelAmount: Math.round(fuelAmount),
      recordedDays,
    };
  }, [rows]);

  const checkedCount = useMemo(
    () => activeInspectionItems.filter((i) => inspectionChecks[i.key]).length,
    [activeInspectionItems, inspectionChecks]
  );

  // 月度前後移動
  const handlePrevMonth = () => {
    if (targetMonth === 1) {
      setTargetYear((y) => y - 1);
      setTargetMonth(12);
    } else {
      setTargetMonth((m) => m - 1);
    }
  };

  const handleNextMonth = () => {
    if (targetMonth === 12) {
      setTargetYear((y) => y + 1);
      setTargetMonth(1);
    } else {
      setTargetMonth((m) => m + 1);
    }
  };

  // 保存・提出
  const handleSave = async (status: WorkReportStatus) => {
    setIsSaving(true);
    try {
      const drivingLogData: DrivingLogData = {
        targetYear,
        targetMonth,
        periodStart: periodInfo.periodStart,
        periodEnd: periodInfo.periodEnd,
        reportDate: reportDate || todayStr,
        vehicleAssetId: selectedVehicleId || undefined,
        officeId: resolvedOffice.id,
        officeName: resolvedOffice.name,
        officeAndDepartment,
        driverAssigneeName,
        vehicleModel,
        registrationNumber,
        inspectionChecks,
        inspectionItemsSnapshot: activeInspectionItems.map((it) => ({ ...it })),
        kyDeclarationTitleSnapshot: activeKyTitle,
        kyDeclarationLinesSnapshot: [...activeKyLines],
        rows,
        cashTollAmount,
        cashFuelAmount,
        totalDistanceKm: totals.distanceKm,
        totalFuelLiters: totals.fuelLiters,
        totalFuelAmount: totals.fuelAmount,
        driverStamp:
          status === 'submitted' || existingReport?.status === 'submitted'
            ? {
                name: (driverAssigneeName || currentUser.name).trim().split(/[\s　]+/)[0],
                date: (reportDate || todayStr).replace(/-/g, '.'),
              }
            : existingReport?.drivingLogData?.driverStamp,
      };

      const summaryTitle = `【運転記録簿】${targetYear}年${targetMonth}月度 (${periodInfo.periodLabel}) ${registrationNumber} ${vehicleModel}`;
      const summaryResult = `稼働 ${totals.recordedDays}日 / 走行距離 ${totals.distanceKm.toLocaleString()} Km / 給油 ${totals.fuelLiters.toLocaleString()} ㍑ (${totals.fuelAmount.toLocaleString()} 円)`;

      await onSaveReport(existingReport?.id || null, {
        reportType: 'driving_log',
        date: reportDate || todayStr,
        weekStartDate: periodInfo.periodStart,
        weekLabel: `${targetYear}年${targetMonth}月度 (${periodInfo.periodLabel})`,
        department: officeAndDepartment || currentUser.department || '',
        tasks: summaryTitle,
        results: summaryResult,
        issues: '',
        status,
        supervisorId: currentUser.supervisorId || undefined,
        drivingLogData,
        constructionData: { ...drivingLogData, __kind: 'driving_log' },
      });

      setSaveToast(status === 'submitted' ? '運転記録簿を提出しました' : '運転記録簿を下書き保存しました');
      setTimeout(() => setSaveToast(null), 3000);
    } finally {
      setIsSaving(false);
    }
  };

  // 報告日の年・月・日分解（A4帳票用）
  const reportDateParts = useMemo(() => {
    if (!reportDate) return { y: '', m: '', d: '' };
    const [y, m, d] = reportDate.split('-');
    return { y: y || '', m: m ? String(Number(m)) : '', d: d ? String(Number(d)) : '' };
  }, [reportDate]);

  // 31行固定配列（A4帳票の行数を常に31行に揃える）
  const printRows = useMemo(() => {
    const list: (DrivingLogRow | null)[] = [...rows];
    while (list.length < 31) {
      list.push(null);
    }
    return list.slice(0, 31);
  }, [rows]);

  // 担当者印の描画
  const renderStampCircle = (name?: string, dateStr?: string) => {
    if (!name) return null;
    const surname = name.trim().split(/[\s　]+/)[0].slice(0, 4);
    return (
      <div className="w-11 h-11 rounded-full border-[1.5px] border-rose-600 text-rose-600 flex flex-col items-center justify-between py-0.5 mx-auto select-none leading-none font-sans">
        <span className="text-[7px] font-bold border-b border-rose-400 w-full text-center pb-[1px]">
          確認
        </span>
        <span className="text-[6.5px] font-bold tracking-tighter">{dateStr || ''}</span>
        <span className="text-[8.5px] font-black tracking-wider border-t border-rose-400 w-full text-center pt-[1px]">
          {surname}
        </span>
      </div>
    );
  };

  return (
    <div className="space-y-5">
      {/* トースト通知 */}
      {saveToast && (
        <div className="fixed bottom-5 right-5 z-50 bg-emerald-700 text-white px-4 py-2.5 rounded-xl shadow-lg flex items-center gap-2 text-xs font-bold">
          <CheckCircle2 className="w-4 h-4" />
          {saveToast}
        </div>
      )}

      {/* 1. 最上部コントロールバー：対象月度・車両選択・保存・A4 PDF出力 */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-3">
          {/* 月度セレクター */}
          <div className="flex items-center bg-slate-100 rounded-lg p-1 border border-slate-200">
            <button
              type="button"
              onClick={handlePrevMonth}
              className="p-1.5 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="前月度へ"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="px-3 text-center">
              <div className="text-sm font-bold text-slate-900">
                {targetYear}年 {targetMonth}月度
              </div>
              <div className="text-[11px] text-slate-500 font-medium">
                {periodInfo.periodLabel}
              </div>
            </div>
            <button
              type="button"
              onClick={handleNextMonth}
              className="p-1.5 rounded-md hover:bg-white text-slate-600 hover:text-slate-900 transition-colors cursor-pointer"
              title="翌月度へ"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {/* 車両選択プルダウン */}
          {selectableVehicles.length > 0 && (
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <Car className="w-4 h-4 text-emerald-600 shrink-0" />
              <div className="flex flex-col">
                <span className="text-[10px] text-slate-500 font-semibold leading-none">
                  対象車両（資産台帳連動）
                </span>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="text-xs font-bold text-slate-800 bg-transparent focus:outline-none cursor-pointer mt-0.5"
                >
                  {selectableVehicles.map((v) => {
                    const model =
                      v.attributes?.vehicleModel ||
                      v.attributes?.modelName ||
                      v.name ||
                      '車両';
                    const isMine = myVehicles.some((mv) => mv.id === v.id);
                    return (
                      <option key={v.id} value={v.id}>
                        {isMine ? '★担当: ' : ''}
                        {v.assetCode}（{model} / {v.assigneeUserName || '共用'}）
                      </option>
                    );
                  })}
                </select>
              </div>
            </div>
          )}

          {/* ステータス表示 */}
          <div className="text-xs text-slate-500 flex items-center gap-1.5">
            <span>状態:</span>
            <span className="font-bold text-slate-800">
              {existingReport?.status === 'reviewed'
                ? '確認済'
                : existingReport?.status === 'submitted'
                ? '提出済'
                : existingReport
                ? '下書き保存中'
                : '新規（未保存）'}
            </span>
            <span aria-hidden="true">·</span>
            <span>記録日数 {totals.recordedDays}日</span>
          </div>
        </div>

        {/* アクションボタン群 */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setIsPrintModalOpen(true)}
            className="px-3.5 py-2 bg-slate-800 hover:bg-slate-900 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Printer className="w-4 h-4" />
            A4プレビュー / PDF出力
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSave('draft')}
            className="px-3.5 py-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <Save className="w-4 h-4 text-slate-500" />
            下書き保存
          </button>
          <button
            type="button"
            disabled={isSaving}
            onClick={() => handleSave('submitted')}
            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
          >
            <Send className="w-4 h-4" />
            月次提出（担当者印）
          </button>
        </div>
      </div>

      {/* 2. 基本ヘッダー情報＆月次点検12項目（2カラム構成） */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        {/* 左：車両・所属ヘッダー情報 + 月間集計サマリー */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5">
            <h3 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
              <Car className="w-4 h-4 text-emerald-600" />
              車両・所属情報（帳票ヘッダー）
            </h3>
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-slate-500">報告日:</span>
              <input
                type="date"
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
                className="border border-slate-200 rounded px-2 py-0.5 text-xs font-medium text-slate-700"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                拠点・部署名
              </label>
              <input
                type="text"
                value={officeAndDepartment}
                onChange={(e) => setOfficeAndDepartment(e.target.value)}
                placeholder="例: 名古屋支店 工務課"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                車両担当者
              </label>
              <input
                type="text"
                value={driverAssigneeName}
                onChange={(e) => setDriverAssigneeName(e.target.value)}
                placeholder="例: 安藤 浩靖"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                車種
              </label>
              <input
                type="text"
                value={vehicleModel}
                onChange={(e) => setVehicleModel(e.target.value)}
                placeholder="例: レジアスエース"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                登録番号（ナンバー）
              </label>
              <input
                type="text"
                value={registrationNumber}
                onChange={(e) => setRegistrationNumber(e.target.value)}
                placeholder="例: 名古屋401ま8977"
                className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500"
              />
            </div>
          </div>

          {/* 月間合計＆現金払い欄 */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <div className="grid grid-cols-3 gap-2 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
              <div>
                <div className="text-[10px] text-slate-500 font-medium">月間走行距離</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                  {totals.distanceKm.toLocaleString()} <span className="text-[11px] font-normal">Km</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-medium">給油量合計</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                  {totals.fuelLiters.toLocaleString()} <span className="text-[11px] font-normal">㍑</span>
                </div>
              </div>
              <div>
                <div className="text-[10px] text-slate-500 font-medium">給油金額合計</div>
                <div className="text-sm font-bold text-slate-900 mt-0.5 tabular-nums">
                  {totals.fuelAmount.toLocaleString()} <span className="text-[11px] font-normal">円</span>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  現金払い：通行料（円）
                </label>
                <input
                  type="number"
                  value={cashTollAmount}
                  onChange={(e) => setCashTollAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                  現金払い：給油代（円）
                </label>
                <input
                  type="number"
                  value={cashFuelAmount}
                  onChange={(e) => setCashFuelAmount(e.target.value === '' ? '' : Number(e.target.value))}
                  placeholder="0"
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-emerald-500 tabular-nums"
                />
              </div>
            </div>
          </div>
        </div>

        {/* 右：日常点検項目＆ KY宣言（拠点別様式連動） */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-4 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5 mb-3">
              <div className="flex flex-wrap items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <h3 className="text-xs font-bold text-slate-800">
                  日常点検項目（{checkedCount}/{activeInspectionItems.length} 確認済）
                </h3>
                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 border border-indigo-200/80 whitespace-nowrap">
                  {currentOfficeConfig.officeName} 様式
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    const allChecked: Record<string, boolean> = {};
                    activeInspectionItems.forEach((i) => {
                      allChecked[i.key] = true;
                    });
                    setInspectionChecks(allChecked);
                  }}
                  className="px-2.5 py-1 text-[11px] font-bold bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-md transition-colors cursor-pointer"
                >
                  すべて異常なし（一括ON）
                </button>
                <button
                  type="button"
                  onClick={() => setInspectionChecks({})}
                  className="px-2 py-1 text-[11px] text-slate-500 hover:text-slate-800 cursor-pointer"
                >
                  クリア
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
              {activeInspectionItems.map((item) => {
                const checked = Boolean(inspectionChecks[item.key]);
                return (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      setInspectionChecks((prev) => ({ ...prev, [item.key]: !prev[item.key] }))
                    }
                    className={`flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                      checked
                        ? 'bg-emerald-50/50 border-emerald-200 text-slate-800'
                        : 'bg-white border-slate-200 text-slate-500 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-1.5 text-[11px] font-medium truncate">
                      {checked ? (
                        <CheckSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <Square className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      )}
                      <span className="truncate">{item.label}</span>
                    </span>
                    <span className="text-[10px] text-slate-400 shrink-0">{item.method}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-600 bg-slate-50 px-3 py-2 rounded-lg">
            <span className="font-bold text-slate-700">{activeKyTitle.replace(/\s+/g, '')}：</span>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              {activeKyLines.map((line, idx) => (
                <span key={idx}>{line}</span>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 3. 本日・指定日のクイック入力カード（スマホ・現場で1日分を素早く入力） */}
      {activeRow && (
        <div className="bg-emerald-50/40 rounded-xl border border-emerald-200 p-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-emerald-700" />
              <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                1日分クイック入力：
              </h3>
              <select
                value={selectedDayStr}
                onChange={(e) => setSelectedDayStr(e.target.value)}
                className="bg-white border border-emerald-300 rounded-lg px-2.5 py-1 text-xs font-bold text-emerald-900 focus:outline-none cursor-pointer"
              >
                {periodInfo.dates.map((d) => {
                  const r = rows.find((row) => row.date === d.date);
                  const hasEntry = Boolean(r?.destination || r?.departureMeter !== '' || r?.arrivalMeter !== '');
                  return (
                    <option key={d.date} value={d.date}>
                      {d.monthDayLabel}（{d.weekday}）{d.date === todayStr ? '【今日】' : ''}{hasEntry ? ' ●記録あり' : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => handleQuickFillDay(activeRow.date)}
                className="px-3 py-1.5 bg-white hover:bg-emerald-50 text-emerald-700 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-2xs"
              >
                <Sparkles className="w-3.5 h-3.5" />
                初期値セット（アルコール{defaultSettings.defaultAlcoholPresence || '無'}{defaultSettings.defaultAlcoholValue || '0.00'}・運転者・前回メーター）
              </button>
              {previousArrivalMeter !== '' && (
                <span className="text-[11px] text-slate-600">
                  前回帰着メーター: <strong className="tabular-nums">{previousArrivalMeter}</strong> Km
                </span>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-9 gap-2.5 bg-white p-3 rounded-lg border border-slate-200">
            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">
                酒気帯び / 検知数値
              </label>
              <div className="flex items-center gap-1">
                <select
                  value={activeRow.alcoholPresence}
                  onChange={(e) =>
                    updateRow(activeRow.date, {
                      alcoholPresence: e.target.value as '無' | '有' | '',
                      alcoholValue:
                        e.target.value === '無' && !activeRow.alcoholValue ? '0.00' : activeRow.alcoholValue,
                    })
                  }
                  className="border border-slate-200 rounded px-1.5 py-1 text-xs font-bold text-slate-800 bg-white"
                >
                  <option value="">-</option>
                  <option value="無">無</option>
                  <option value="有">有</option>
                </select>
                <input
                  type="text"
                  value={activeRow.alcoholValue}
                  onChange={(e) => updateRow(activeRow.date, { alcoholValue: e.target.value })}
                  placeholder="0.00"
                  className="w-full border border-slate-200 rounded px-1.5 py-1 text-xs tabular-nums text-right"
                />
                <span className="text-[10px] text-slate-400">mg/l</span>
              </div>
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">運転者</label>
              <input
                type="text"
                value={activeRow.driverName}
                onChange={(e) => updateRow(activeRow.date, { driverName: e.target.value })}
                placeholder={driverAssigneeName || currentUser.name}
                className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">出発時刻</label>
              <input
                type="time"
                value={activeRow.departureTime}
                onChange={(e) => updateRow(activeRow.date, { departureTime: e.target.value })}
                className="w-full border border-slate-200 rounded px-2 py-1 text-xs tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">
                出発メーター (Km)
              </label>
              <input
                type="number"
                value={activeRow.departureMeter}
                onChange={(e) =>
                  updateRow(activeRow.date, {
                    departureMeter: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
                placeholder={previousArrivalMeter !== '' ? String(previousArrivalMeter) : 'Km'}
                className="w-full border border-slate-200 rounded px-2 py-1 text-xs tabular-nums text-right"
              />
            </div>

            <div className="col-span-2 sm:col-span-2 lg:col-span-2">
              <label className="block text-[10px] font-bold text-slate-500 mb-1">訪問先</label>
              <input
                type="text"
                value={activeRow.destination}
                onChange={(e) => updateRow(activeRow.date, { destination: e.target.value })}
                placeholder="現場名・訪問先を入力"
                className="w-full border border-slate-200 rounded px-2 py-1 text-xs"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">帰着時刻</label>
              <input
                type="time"
                value={activeRow.arrivalTime}
                onChange={(e) => updateRow(activeRow.date, { arrivalTime: e.target.value })}
                className="w-full border border-slate-200 rounded px-2 py-1 text-xs tabular-nums"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">
                帰着メーター (Km)
              </label>
              <input
                type="number"
                value={activeRow.arrivalMeter}
                onChange={(e) =>
                  updateRow(activeRow.date, {
                    arrivalMeter: e.target.value === '' ? '' : Number(e.target.value),
                  })
                }
                placeholder="Km"
                className="w-full border border-slate-200 rounded px-2 py-1 text-xs tabular-nums text-right"
              />
            </div>

            <div>
              <label className="block text-[10px] font-bold text-slate-500 mb-1">
                給油量(㍑) / 金額
              </label>
              <div className="flex items-center gap-1">
                <input
                  type="number"
                  step="0.1"
                  value={activeRow.fuelLiters}
                  onChange={(e) =>
                    updateRow(activeRow.date, {
                      fuelLiters: e.target.value === '' ? '' : Number(e.target.value),
                    })
                  }
                  placeholder="㍑"
                  className="w-1/2 border border-slate-200 rounded px-1.5 py-1 text-xs tabular-nums text-right"
                />
                <input
                  type="number"
                  value={activeRow.fuelAmount}
                  onChange={(e) =>
                    updateRow(activeRow.date, {
                      fuelAmount: e.target.value === '' ? '' : Number(e.target.value),
                    })
                  }
                  placeholder="円"
                  className="w-1/2 border border-slate-200 rounded px-1.5 py-1 text-xs tabular-nums text-right"
                />
              </div>
            </div>
          </div>

          {/* カレンダー予定からの訪問先ワンクリック転記 */}
          {suggestedDestinations.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[11px] text-slate-500 font-medium flex items-center gap-1">
                <MapPin className="w-3.5 h-3.5 text-emerald-600" />
                この日のカレンダー予定から訪問先に追加:
              </span>
              {suggestedDestinations.map((dest) => (
                <button
                  key={dest}
                  type="button"
                  onClick={() => {
                    const currentDest = activeRow.destination?.trim();
                    const nextDest = currentDest
                      ? currentDest.includes(dest)
                        ? currentDest
                        : `${currentDest}、${dest}`
                      : dest;
                    updateRow(activeRow.date, { destination: nextDest });
                  }}
                  className="px-2 py-0.5 bg-white hover:bg-emerald-100 text-slate-700 border border-slate-200 rounded text-[11px] font-medium transition-colors cursor-pointer"
                >
                  + {dest}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 4. 月間31日一覧テーブル（直接編集も可能） */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs font-bold text-slate-800 flex items-center gap-2">
            <FileText className="w-4 h-4 text-emerald-600" />
            <span>月次運転記録一覧（{periodInfo.periodLabel}）</span>
          </div>
          <span className="text-[11px] text-slate-500">
            ※各セルで直接入力・修正できます。帰着時メーターを入力すると走行距離が自動計算されます。
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs border-collapse min-w-[920px]">
            <thead>
              <tr className="bg-slate-100 text-slate-700 border-b border-slate-200 text-[11px]">
                <th className="py-2 px-2 text-center font-bold w-24 border-r border-slate-200">日付</th>
                <th className="py-2 px-2 text-center font-bold w-36 border-r border-slate-200">
                  アルコール検知器数値
                </th>
                <th className="py-2 px-2 text-center font-bold w-28 border-r border-slate-200">運転者</th>
                <th className="py-2 px-2 text-center font-bold w-24 border-r border-slate-200">出発時刻</th>
                <th className="py-2 px-2 text-center font-bold w-28 border-r border-slate-200">
                  出発時メーター
                </th>
                <th className="py-2 px-2 text-left font-bold border-r border-slate-200">訪問先</th>
                <th className="py-2 px-2 text-center font-bold w-24 border-r border-slate-200">帰着時刻</th>
                <th className="py-2 px-2 text-center font-bold w-28 border-r border-slate-200">
                  帰着時メーター
                </th>
                <th className="py-2 px-2 text-center font-bold w-24 border-r border-slate-200">走行距離</th>
                <th className="py-2 px-2 text-center font-bold w-24 border-r border-slate-200">
                  ガソリン給油
                </th>
                <th className="py-2 px-2 text-center font-bold w-24">給油金額</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-200">
              {periodInfo.dates.map((dInfo, idx) => {
                const row = rows[idx] || {
                  date: dInfo.date,
                  monthDayLabel: dInfo.monthDayLabel,
                  alcoholPresence: '',
                  alcoholValue: '',
                  driverName: '',
                  departureTime: '',
                  departureMeter: '',
                  destination: '',
                  arrivalTime: '',
                  arrivalMeter: '',
                  distanceKm: '',
                  fuelLiters: '',
                  fuelAmount: '',
                };
                const isSelected = dInfo.date === selectedDayStr;
                const isWeekend = dInfo.weekday === '日' || dInfo.weekday === '土';

                return (
                  <tr
                    key={dInfo.date}
                    onClick={() => setSelectedDayStr(dInfo.date)}
                    className={`transition-colors ${
                      isSelected
                        ? 'bg-emerald-50/70'
                        : isWeekend
                        ? 'bg-slate-50/70 hover:bg-slate-100/60'
                        : 'hover:bg-slate-50'
                    }`}
                  >
                    <td className="py-1.5 px-2 text-center font-semibold whitespace-nowrap border-r border-slate-200">
                      <span
                        className={
                          dInfo.weekday === '日'
                            ? 'text-rose-600'
                            : dInfo.weekday === '土'
                            ? 'text-blue-600'
                            : 'text-slate-800'
                        }
                      >
                        {dInfo.month}月{dInfo.day}日({dInfo.weekday})
                      </span>
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200">
                      <div className="flex items-center gap-1">
                        <select
                          value={row.alcoholPresence}
                          onChange={(e) =>
                            updateRow(dInfo.date, {
                              alcoholPresence: e.target.value as '無' | '有' | '',
                              alcoholValue:
                                e.target.value === '無' && !row.alcoholValue ? '0.00' : row.alcoholValue,
                            })
                          }
                          className="border border-slate-200 rounded px-1 py-0.5 text-[11px] bg-white"
                        >
                          <option value="">-</option>
                          <option value="無">無</option>
                          <option value="有">有</option>
                        </select>
                        <input
                          type="text"
                          value={row.alcoholValue}
                          onChange={(e) => updateRow(dInfo.date, { alcoholValue: e.target.value })}
                          placeholder="0.00"
                          className="w-14 border border-slate-200 rounded px-1 py-0.5 text-[11px] text-right tabular-nums bg-white"
                        />
                        <span className="text-[10px] text-slate-400">mg/l</span>
                      </div>
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.driverName}
                        onChange={(e) => updateRow(dInfo.date, { driverName: e.target.value })}
                        placeholder=""
                        className="w-full border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-1.5 py-0.5 text-xs bg-transparent focus:bg-white focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200">
                      <input
                        type="time"
                        value={row.departureTime}
                        onChange={(e) => updateRow(dInfo.date, { departureTime: e.target.value })}
                        className="w-full border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-1 py-0.5 text-xs tabular-nums bg-transparent focus:bg-white focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={row.departureMeter}
                          onChange={(e) =>
                            updateRow(dInfo.date, {
                              departureMeter: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                          className="w-full border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-1 py-0.5 text-xs text-right tabular-nums bg-transparent focus:bg-white focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">Km</span>
                      </div>
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200">
                      <input
                        type="text"
                        value={row.destination}
                        onChange={(e) => updateRow(dInfo.date, { destination: e.target.value })}
                        placeholder=""
                        className="w-full border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-1.5 py-0.5 text-xs bg-transparent focus:bg-white focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200">
                      <input
                        type="time"
                        value={row.arrivalTime}
                        onChange={(e) => updateRow(dInfo.date, { arrivalTime: e.target.value })}
                        className="w-full border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-1 py-0.5 text-xs tabular-nums bg-transparent focus:bg-white focus:outline-none"
                      />
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          value={row.arrivalMeter}
                          onChange={(e) =>
                            updateRow(dInfo.date, {
                              arrivalMeter: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                          className="w-full border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-1 py-0.5 text-xs text-right tabular-nums bg-transparent focus:bg-white focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">Km</span>
                      </div>
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200 text-right tabular-nums">
                      <div className="flex items-center justify-end gap-1">
                        <input
                          type="number"
                          value={row.distanceKm}
                          onChange={(e) =>
                            updateRow(dInfo.date, {
                              distanceKm: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                          className="w-14 border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-1 py-0.5 text-xs font-semibold text-right tabular-nums bg-transparent focus:bg-white focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">Km</span>
                      </div>
                    </td>
                    <td className="py-1 px-1.5 border-r border-slate-200">
                      <div className="flex items-center gap-1">
                        <input
                          type="number"
                          step="0.1"
                          value={row.fuelLiters}
                          onChange={(e) =>
                            updateRow(dInfo.date, {
                              fuelLiters: e.target.value === '' ? '' : Number(e.target.value),
                            })
                          }
                          className="w-full border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-1 py-0.5 text-xs text-right tabular-nums bg-transparent focus:bg-white focus:outline-none"
                        />
                        <span className="text-[10px] text-slate-400">㍑</span>
                      </div>
                    </td>
                    <td className="py-1 px-1.5">
                      <input
                        type="number"
                        value={row.fuelAmount}
                        onChange={(e) =>
                          updateRow(dInfo.date, {
                            fuelAmount: e.target.value === '' ? '' : Number(e.target.value),
                          })
                        }
                        className="w-full border border-transparent hover:border-slate-200 focus:border-emerald-500 rounded px-1 py-0.5 text-xs text-right tabular-nums bg-transparent focus:bg-white focus:outline-none"
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-300">
                <td colSpan={8} className="py-2 px-4 text-center border-r border-slate-300">
                  計　（※走行距離、給油量、給油金額の合計）
                </td>
                <td className="py-2 px-2 text-right tabular-nums border-r border-slate-300">
                  {totals.distanceKm.toLocaleString()} Km
                </td>
                <td className="py-2 px-2 text-right tabular-nums border-r border-slate-300">
                  {totals.fuelLiters.toLocaleString()} ㍑
                </td>
                <td className="py-2 px-2 text-right tabular-nums">
                  {totals.fuelAmount.toLocaleString()} 円
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* 5. A4縦 印刷・PDF出力ポータルモーダル（添付PDFの帳票様式を完全再現） */}
      {isPrintModalOpen &&
        createPortal(
          <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/75 backdrop-blur-xs flex justify-center p-2 sm:p-6 print:p-0 print:bg-white print:static print-modal-overlay print-portal-root">
            <style>{`
              @media print {
                @page {
                  size: A4 portrait;
                  margin: 6mm 6mm 6mm 6mm;
                }
                html, body {
                  margin: 0 !important;
                  padding: 0 !important;
                  background: #ffffff !important;
                  -webkit-print-color-adjust: exact !important;
                  print-color-adjust: exact !important;
                }
                #root {
                  display: none !important;
                }
                .driving-log-print-sheet {
                  width: 100% !important;
                  max-width: 198mm !important;
                  margin: 0 auto !important;
                  padding: 0 !important;
                  box-shadow: none !important;
                  border: none !important;
                }
              }
              .driving-log-table th,
              .driving-log-table td {
                border: 1px solid #000000;
              }
            `}</style>

            <div className="w-full max-w-[210mm] flex flex-col items-center print-modal-container">
              {/* 操作ツールバー（印刷時は非表示） */}
              <div className="w-full bg-slate-800 text-white rounded-xl px-4 py-3 mb-4 flex flex-wrap items-center justify-between gap-3 shadow-lg print:hidden">
                <div className="flex items-center gap-2.5">
                  <Printer className="w-5 h-5 text-emerald-400" />
                  <div>
                    <div className="text-sm font-bold">
                      運転記録簿 A4縦 印刷 / PDF出力プレビュー
                    </div>
                    <div className="text-[11px] text-slate-300">
                      印刷ダイアログの「送信先」で「PDFに保存」を選ぶとA4縦1枚のPDFとして出力できます
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => window.print()}
                    className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs"
                  >
                    <Printer className="w-4 h-4" />
                    印刷 / PDF保存を実行
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsPrintModalOpen(false)}
                    className="px-3 py-2 bg-slate-700 hover:bg-slate-600 text-slate-200 text-xs font-bold rounded-lg cursor-pointer"
                  >
                    閉じる
                  </button>
                </div>
              </div>

              {/* A4縦シート本体 */}
              <div
                id="driving-log-print-area"
                className="driving-log-print-sheet bg-white text-black w-full max-w-[210mm] p-[8mm] print:p-0 shadow-2xl font-sans text-[10px] leading-tight box-border"
              >
                {/* タイトル＆報告日 */}
                <div className="relative flex flex-col items-center mb-1.5">
                  <h1 className="text-[18px] font-bold tracking-[0.5em] text-center">
                    運転記録簿
                  </h1>
                  <div className="absolute right-1 top-1 text-[10px] flex items-center gap-2">
                    <span>報告日</span>
                    <span className="inline-block min-w-[28px] text-right">{reportDateParts.y}</span>
                    <span>年</span>
                    <span className="inline-block min-w-[16px] text-right">{reportDateParts.m}</span>
                    <span>月</span>
                    <span className="inline-block min-w-[16px] text-right">{reportDateParts.d}</span>
                    <span>日</span>
                  </div>
                  <div className="text-[11px] font-bold mt-1">
                    {targetYear}年　{targetMonth}月度
                  </div>
                  <div className="text-[11px] font-bold mt-0.5">
                    {periodInfo.periodLabel}
                  </div>
                </div>

                {/* 拠点・部署名 / 車両担当者 / 車種 / 登録番号 */}
                <table className="w-full border-collapse driving-log-table border-[1.5px] border-black mb-1.5 text-[10px]">
                  <tbody>
                    <tr className="h-[20px]">
                      <th className="w-[18%] bg-white font-bold text-center">拠点・部署名</th>
                      <td className="w-[40%] text-center font-medium px-2">{officeAndDepartment}</td>
                      <th className="w-[10%] bg-white font-bold text-center">車種</th>
                      <td className="w-[32%] text-center font-medium px-2">{vehicleModel}</td>
                    </tr>
                    <tr className="h-[20px]">
                      <th className="bg-white font-bold text-center">車両担当者</th>
                      <td className="text-center font-medium px-2">{driverAssigneeName}</td>
                      <th className="bg-white font-bold text-center">登録番号</th>
                      <td className="text-center font-medium px-2">{registrationNumber}</td>
                    </tr>
                  </tbody>
                </table>

                {/* 点検項目（可変行数対応） + KY宣言 + 4承認印欄 */}
                <div className="w-full border-[1.5px] border-black mb-[-1px] flex items-stretch text-[9.5px]">
                  {/* 左62%: 日常点検チェックリスト */}
                  <table className="w-[62%] border-collapse text-[9.5px] shrink-0">
                    <tbody>
                      {activeInspectionItems.map((item, idx) => {
                        const isChecked = Boolean(inspectionChecks[item.key]);
                        const isLastRow = idx === activeInspectionItems.length - 1;
                        return (
                          <tr key={item.key} className="h-[14.5px]">
                            {idx === 0 && (
                              <th
                                rowSpan={activeInspectionItems.length}
                                className="w-[9.5%] text-center font-normal align-middle leading-snug border-r border-black"
                              >
                                点<br />検<br />項<br />目
                              </th>
                            )}
                            <td
                              className={`w-[79%] text-center px-1 border-r border-black ${
                                isLastRow ? '' : 'border-b border-black'
                              }`}
                            >
                              {item.label}
                            </td>
                            <td
                              className={`w-[11.5%] text-center whitespace-nowrap px-0.5 ${
                                isLastRow ? '' : 'border-b border-black'
                              }`}
                            >
                              <span className={isChecked ? 'font-semibold' : 'text-neutral-500'}>
                                {item.method}
                              </span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* 右38%: KY宣言 + 4確認印ヘッダー + 印鑑枠 */}
                  <div className="w-[38%] flex flex-col border-l border-black">
                    <div className="bg-neutral-300 border-b border-black py-0.5 text-center font-bold tracking-[0.4em] text-[11px]">
                      {activeKyTitle}
                    </div>
                    <div className="py-1 px-2 text-center text-[9.5px] leading-[1.28] border-b border-black">
                      {activeKyLines.map((l, i) => (
                        <div key={i}>{l}</div>
                      ))}
                    </div>
                    <div className="grid grid-cols-4 border-b border-black text-[9px] text-center bg-white">
                      <div className="py-0.5 border-r border-black truncate px-0.5">
                        {activeStampLabels.slot1}
                      </div>
                      <div className="py-0.5 border-r border-black truncate px-0.5">
                        {activeStampLabels.slot2}
                      </div>
                      <div className="py-0.5 border-r border-black truncate px-0.5">
                        {activeStampLabels.slot3}
                      </div>
                      <div className="py-0.5 truncate px-0.5">{activeStampLabels.slot4}</div>
                    </div>
                    <div className="grid grid-cols-4 flex-1 min-h-[54px] bg-white">
                      <div className="border-r border-black flex items-center justify-center p-0.5">
                        {renderStampCircle(
                          driverAssigneeName || currentUser.name,
                          (reportDate || todayStr).replace(/-/g, '.')
                        )}
                      </div>
                      <div className="border-r border-black flex items-center justify-center p-0.5"></div>
                      <div className="border-r border-black flex items-center justify-center p-0.5"></div>
                      <div className="flex items-center justify-center p-0.5"></div>
                    </div>
                  </div>
                </div>

                {/* 31行の日次運転記録テーブル */}
                <table className="w-full border-collapse driving-log-table border-[1.5px] border-black text-[9px]">
                  <thead>
                    <tr className="h-[24px] bg-white">
                      <th className="w-[9%] text-center font-normal">日付</th>
                      <th className="w-[11%] text-center font-normal leading-tight text-[8px]">
                        アルコール検<br />知機数値
                      </th>
                      <th className="w-[9%] text-center font-normal">運転者</th>
                      <th className="w-[7%] text-center font-normal">出発時刻</th>
                      <th className="w-[9.5%] text-center font-normal text-[8.5px]">出発時メーター</th>
                      <th className="w-[16.5%] text-center font-normal">訪問先</th>
                      <th className="w-[7%] text-center font-normal">帰着時刻</th>
                      <th className="w-[9.5%] text-center font-normal text-[8.5px]">帰着時メーター</th>
                      <th className="w-[9.5%] text-center font-normal">走行距離</th>
                      <th className="w-[7.5%] text-center font-normal leading-tight text-[8px]">
                        ガソリン給<br />油
                      </th>
                      <th className="w-[4.5%] text-center font-normal text-[7.5px]">給油金額</th>
                    </tr>
                  </thead>
                  <tbody>
                    {printRows.map((row, idx) => {
                      const dParts = row?.date ? row.date.split('-').map(Number) : null;
                      const mStr = dParts ? String(dParts[1]) : '';
                      const dayStr = dParts ? String(dParts[2]) : '';
                      const isShaded = idx % 2 === 1;
                      const [depH, depM] = (row?.departureTime || '').split(':');
                      const [arrH, arrM] = (row?.arrivalTime || '').split(':');

                      return (
                        <tr
                          key={idx}
                          className={`h-[16.5px] ${isShaded ? 'bg-neutral-200/75' : 'bg-white'}`}
                        >
                          {/* 日付: 月 日 */}
                          <td className="px-1 whitespace-nowrap">
                            <div className="flex items-center justify-between">
                              <span className="inline-block w-3 text-right">{mStr}</span>
                              <span>月</span>
                              <span className="inline-block w-3 text-right">{dayStr}</span>
                              <span>日</span>
                            </div>
                          </td>

                          {/* アルコール検知器数値: 有・無 mg/l */}
                          <td className="px-1 whitespace-nowrap text-[8px]">
                            <div className="flex items-center justify-between">
                              <span>
                                <span
                                  className={
                                    row?.alcoholPresence === '有'
                                      ? 'inline-block border border-black rounded-full px-0.5 font-bold'
                                      : ''
                                  }
                                >
                                  有
                                </span>
                                ・
                                <span
                                  className={
                                    row?.alcoholPresence === '無'
                                      ? 'inline-block border border-black rounded-full px-0.5 font-bold'
                                      : ''
                                  }
                                >
                                  無
                                </span>
                              </span>
                              <span className="tabular-nums font-medium">
                                {row?.alcoholValue || ''}
                              </span>
                              <span className="text-[7.5px]">mg/l</span>
                            </div>
                          </td>

                          {/* 運転者 */}
                          <td className="px-1 text-center truncate max-w-[65px]">
                            {row?.driverName || ''}
                          </td>

                          {/* 出発時刻 */}
                          <td className="px-1 text-center tabular-nums">
                            <div className="flex items-center justify-center gap-0.5">
                              <span className="inline-block w-3 text-right">{depH || ''}</span>
                              <span>:</span>
                              <span className="inline-block w-3 text-left">{depM || ''}</span>
                            </div>
                          </td>

                          {/* 出発時メーター */}
                          <td className="px-1 whitespace-nowrap">
                            <div className="flex items-center justify-between">
                              <span className="tabular-nums flex-1 text-right pr-1">
                                {row?.departureMeter !== '' && row?.departureMeter !== undefined
                                  ? Number(row.departureMeter).toLocaleString()
                                  : ''}
                              </span>
                              <span className="text-[8px]">Km</span>
                            </div>
                          </td>

                          {/* 訪問先 */}
                          <td className="px-1 truncate max-w-[115px]">{row?.destination || ''}</td>

                          {/* 帰着時刻 */}
                          <td className="px-1 text-center tabular-nums">
                            <div className="flex items-center justify-center gap-0.5">
                              <span className="inline-block w-3 text-right">{arrH || ''}</span>
                              <span>:</span>
                              <span className="inline-block w-3 text-left">{arrM || ''}</span>
                            </div>
                          </td>

                          {/* 帰着時メーター */}
                          <td className="px-1 whitespace-nowrap">
                            <div className="flex items-center justify-between">
                              <span className="tabular-nums flex-1 text-right pr-1">
                                {row?.arrivalMeter !== '' && row?.arrivalMeter !== undefined
                                  ? Number(row.arrivalMeter).toLocaleString()
                                  : ''}
                              </span>
                              <span className="text-[8px]">Km</span>
                            </div>
                          </td>

                          {/* 走行距離 */}
                          <td className="px-1 whitespace-nowrap">
                            <div className="flex items-center justify-between">
                              <span className="tabular-nums flex-1 text-right pr-1">
                                {row?.distanceKm !== '' && row?.distanceKm !== undefined
                                  ? Number(row.distanceKm).toLocaleString()
                                  : ''}
                              </span>
                              <span className="text-[8px]">Km</span>
                            </div>
                          </td>

                          {/* ガソリン給油 */}
                          <td className="px-1 whitespace-nowrap">
                            <div className="flex items-center justify-between">
                              <span className="tabular-nums flex-1 text-right pr-0.5">
                                {row?.fuelLiters !== '' && row?.fuelLiters !== undefined
                                  ? Number(row.fuelLiters).toLocaleString()
                                  : ''}
                              </span>
                              <span className="text-[7.5px]">㍑</span>
                            </div>
                          </td>

                          {/* 給油金額 */}
                          <td className="px-0.5 text-right tabular-nums text-[8px]">
                            {row?.fuelAmount !== '' && row?.fuelAmount !== undefined
                              ? Number(row.fuelAmount).toLocaleString()
                              : ''}
                          </td>
                        </tr>
                      );
                    })}

                    {/* 計 行 */}
                    <tr className="h-[22px] bg-white font-bold">
                      <td colSpan={6} className="text-center tracking-[1em]">
                        計
                      </td>
                      <td colSpan={2} className="bg-neutral-500"></td>
                      <td className="px-1 whitespace-nowrap">
                        <div className="flex items-center justify-between">
                          <span className="tabular-nums flex-1 text-right pr-1">
                            {totals.distanceKm > 0 ? totals.distanceKm.toLocaleString() : ''}
                          </span>
                          <span className="text-[8px] font-normal">Km</span>
                        </div>
                      </td>
                      <td className="px-1 whitespace-nowrap">
                        <div className="flex items-center justify-between">
                          <span className="tabular-nums flex-1 text-right pr-0.5">
                            {totals.fuelLiters > 0 ? totals.fuelLiters.toLocaleString() : ''}
                          </span>
                          <span className="text-[7.5px] font-normal">㍑</span>
                        </div>
                      </td>
                      <td className="px-0.5 text-right tabular-nums text-[8px]">
                        {totals.fuelAmount > 0 ? totals.fuelAmount.toLocaleString() : ''}
                      </td>
                    </tr>
                  </tbody>
                </table>

                {/* 下部注記 ＆ 現金払い枠 */}
                <div className="text-right font-bold underline text-[10.5px] mt-1 mb-1">
                  {defaultSettings.footerTotalNoticeText || DEFAULT_DRIVING_LOG_TOTAL_NOTICE}
                </div>

                <div className="flex items-start justify-between gap-4 mt-1">
                  <div className="text-[8.5px] leading-snug max-w-[60%]">
                    {defaultSettings.showLegalNotesOnPrint &&
                      (defaultSettings.legalNotesText || DEFAULT_DRIVING_LOG_LEGAL_NOTES)
                        .split('\n')
                        .map((line, i) => <div key={i}>{line}</div>)}
                  </div>

                  <div className="w-[34%]">
                    <div className="text-[9px] mb-0.5">現金払い</div>
                    <table className="w-full border-collapse driving-log-table border border-black text-[9.5px]">
                      <tbody>
                        <tr className="h-[18px]">
                          <th className="w-[28%] font-normal text-center">通行料</th>
                          <td className="px-2 text-right tabular-nums">
                            {cashTollAmount !== '' && cashTollAmount !== undefined
                              ? `${Number(cashTollAmount).toLocaleString()} 円`
                              : ''}
                          </td>
                        </tr>
                        <tr className="h-[18px]">
                          <th className="font-normal text-center">給油代</th>
                          <td className="px-2 text-right tabular-nums">
                            {cashFuelAmount !== '' && cashFuelAmount !== undefined
                              ? `${Number(cashFuelAmount).toLocaleString()} 円`
                              : ''}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            </div>
          </div>,
          document.body
        )}
    </div>
  );
};
