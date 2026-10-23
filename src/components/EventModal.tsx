import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, RefreshCw, Trash2, AlertCircle, Link as LinkIcon, Building2, Users, Paperclip, Plus, Check, UserCheck, Copy, Loader2, Repeat, Clock, UploadCloud, Search, HardHat, CheckCircle2, ChevronRight, Layers } from 'lucide-react';
import { EventType, CalendarEvent, OfficeMaster, DivisionMaster, User, AttachmentFile, RecurrenceRule, RecurrenceFrequency, RecurrenceMonthlyType, ConstructionPhase } from '../types';
import { Site, SiteStatus } from '../types/site';
import { API_BASE_URL } from '../config/api';
import { getAvatarUrl } from '../utils/avatar';
import { uploadMultipleFiles, isPreviewable } from '../utils/fileUpload';
import { FilePreviewModal } from './FilePreviewModal';
import { getLocalDateStr, getJstHourAndMinutes } from '../utils/dateUtils';
import { calculateWeekOfMonth, isRecurringEvent, getRecurrenceLabel, safeParseRecurrence } from '../utils/recurrenceUtils';
import { RecurrenceActionModal, RecurrenceActionScope } from './RecurrenceActionModal';
import { UrlPastePopup, useUrlPasteHandler } from './common/UrlPastePopup';
import { MemberSelector } from './MemberSelector';

export interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (
    event: Omit<CalendarEvent, 'id'> | CalendarEvent,
    scope?: RecurrenceActionScope,
    originalInstanceDate?: string
  ) => void;
  onDelete?: (
    eventId: string,
    scope?: RecurrenceActionScope,
    instanceDate?: string
  ) => void;
  editingEvent?: CalendarEvent | null;
  isCopyMode?: boolean;
  defaultInitialDate?: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  defaultEndDate?: string;     // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  defaultIsAllDay?: boolean;
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  allUsers?: User[];
  defaultAttendees?: User[];
  currentUser?: User;
  sites?: Site[];
  allEvents?: CalendarEvent[];
}


const toLocalDatetimeInput = (isoStr?: string) => {
  if (!isoStr) return '';
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(isoStr)) return isoStr;
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;

  const formatter = new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });

  const parts = formatter.formatToParts(d);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  let hours = parts.find(p => p.type === 'hour')?.value || '00';
  if (hours === '24') hours = '00';
  const minutes = parts.find(p => p.type === 'minute')?.value || '00';

  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

const extractLocalDateStr = (isoOrDateStr?: string) => {
  return getLocalDateStr(isoOrDateStr);
};

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 12 }, (_, i) => String(i * 5).padStart(2, '0'));

// 現在の時刻を30分刻みで丸めた (例: 14:00〜14:14 -> 14:00, 14:15〜14:44 -> 14:30, 14:45〜14:59 -> 15:00) JST準拠
const getRounded30MinTime = (dateInput: Date | string = new Date()): { hours: string; minutes: string } => {
  const { hour, minute } = getJstHourAndMinutes(dateInput);
  const roundedMin = Math.round(minute / 30) * 30;
  let finalH = hour;
  let finalM = roundedMin;
  if (finalM >= 60) {
    finalH = (finalH + 1) % 24;
    finalM = 0;
  }
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    hours: pad(finalH),
    minutes: pad(finalM),
  };
};

// local ISO 文字列 ('YYYY-MM-DDTHH:mm') に分数を加算
const addMinutesToLocalDatetime = (localDatetimeStr: string, minutesToAdd: number): string => {
  if (!localDatetimeStr || !localDatetimeStr.includes('T')) return '';
  const [datePart, timePart] = localDatetimeStr.split('T');
  const [h, m] = (timePart || '00:00').split(':').map(Number);
  const [year, month, day] = datePart.split('-').map(Number);
  if (isNaN(year) || isNaN(month) || isNaN(day) || isNaN(h) || isNaN(m)) return '';

  const d = new Date(year, month - 1, day, h, m + minutesToAdd);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// 2つの 'YYYY-MM-DDTHH:mm' 間の差分（分単位）を計算
const getMinutesDifference = (startStr: string, endStr: string): number | null => {
  if (!startStr || !endStr || !startStr.includes('T') || !endStr.includes('T')) return null;
  const [sDate, sTime] = startStr.split('T');
  const [eDate, eTime] = endStr.split('T');
  const [sY, sM, sD] = sDate.split('-').map(Number);
  const [sH, sMin] = sTime.split(':').map(Number);
  const [eY, eM, eD] = eDate.split('-').map(Number);
  const [eH, eMin] = eTime.split(':').map(Number);

  const startDate = new Date(sY, sM - 1, sD, sH, sMin);
  const endDate = new Date(eY, eM - 1, eD, eH, eMin);

  const diffMs = endDate.getTime() - startDate.getTime();
  if (isNaN(diffMs)) return null;
  return Math.round(diffMs / (60 * 1000));
};

const roundTo5Minutes = (minStr?: string) => {
  if (!minStr) return '00';
  const m = parseInt(minStr, 10) || 0;
  const rounded = Math.round(m / 5) * 5;
  if (rounded >= 60) return '55';
  return String(rounded).padStart(2, '0');
};

const WEEKDAY_LABELS = [
  { day: 0, label: '日' },
  { day: 1, label: '月' },
  { day: 2, label: '火' },
  { day: 3, label: '水' },
  { day: 4, label: '木' },
  { day: 5, label: '金' },
  { day: 6, label: '土' },
];

export function EventModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  editingEvent,
  isCopyMode,
  defaultInitialDate,
  defaultEndDate,
  defaultIsAllDay,
  offices = [],
  divisions = [],
  allUsers = [],
  defaultAttendees = [],
  currentUser,
  sites = [],
  allEvents = [],
}: EventModalProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('personal');
  const [office, setOffice] = useState<string>('全社');
  const [division, setDivision] = useState<string>('全部署');
  const [isAllDay, setIsAllDay] = useState(false);
  const [isPrivate, setIsPrivate] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [memo, setMemo] = useState('');
  const memoPasteHandler = useUrlPasteHandler(memo, setMemo);
  const [isGoogleSynced, setIsGoogleSynced] = useState(false);
  const [selectedAttendees, setSelectedAttendees] = useState<User[]>([]);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 現場連携ステート
  const [selectedSiteId, setSelectedSiteId] = useState<string | null>(null);
  const [selectedSiteCode, setSelectedSiteCode] = useState<string | null>(null);
  const [selectedSiteName, setSelectedSiteName] = useState<string | null>(null);
  const [constructionPhase, setConstructionPhase] = useState<ConstructionPhase>('new');
  const [internalSites, setInternalSites] = useState<Site[]>(sites || []);
  const [isSiteSelectorOpen, setIsSiteSelectorOpen] = useState(false);
  const [siteFilterStatus, setSiteFilterStatus] = useState<'not_started' | 'in_progress' | 'all' | 'other'>('not_started');
  const [siteSearchQuery, setSiteSearchQuery] = useState('');

  // 現場一覧のフェッチ (sites prop が空の場合の自動補完)
  useEffect(() => {
    if (sites && sites.length > 0) {
      setInternalSites(sites);
    } else {
      let isMounted = true;
      fetch(`${API_BASE_URL}/sites`)
        .then(res => res.json())
        .then(data => {
          if (isMounted && data && Array.isArray(data.sites)) {
            setInternalSites(data.sites);
          }
        })
        .catch(err => console.warn('[EventModal] Failed to fetch sites:', err));
      return () => { isMounted = false; };
    }
  }, [sites]);


  // 予定の所要時間（分単位）を保持するステート（初期値60分）
  const [durationMinutes, setDurationMinutes] = useState<number | null>(60);

  // 繰り返し設定ステート
  const [isRecurring, setIsRecurring] = useState(false);
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFrequency>('weekly');
  const [selectedDaysOfWeek, setSelectedDaysOfWeek] = useState<number[]>([1]); // 毎週の曜日
  const [monthlyType, setMonthlyType] = useState<RecurrenceMonthlyType>('same_day');
  const [monthDay, setMonthDay] = useState<number>(1);
  const [weekOfMonth, setWeekOfMonth] = useState<number>(1);
  const [dayOfWeek, setDayOfWeek] = useState<number>(1);
  const [recurrenceEndType, setRecurrenceEndType] = useState<'never' | 'until_date' | 'count'>('never');
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>('');
  const [recurrenceCount, setRecurrenceCount] = useState<number>(10);

  // 定期予定変更・削除確認ダイアログ
  const [actionModalState, setActionModalState] = useState<{
    isOpen: boolean;
    mode: 'edit' | 'delete';
    pendingPayload?: any;
  }>({ isOpen: false, mode: 'edit' });

  // アップロード・プレビュー状態
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);
  const [previewFile, setPreviewFile] = useState<AttachmentFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const [currentEditingEvent, setCurrentEditingEvent] = useState<CalendarEvent | null>(isCopyMode ? null : (editingEvent || null));
  const isIcal = currentEditingEvent ? currentEditingEvent.isIcal === true : false;
  const isCurrentlyRecurring = isRecurringEvent(editingEvent);

  useEffect(() => {
    setCurrentEditingEvent(isCopyMode ? null : (editingEvent || null));
  }, [editingEvent, isCopyMode]);

  // 開始日時が変更されたときに、曜日の初期値を自動追従
  useEffect(() => {
    if (!start) return;
    const startDatePart = start.split('T')[0];
    if (startDatePart) {
      const d = new Date(startDatePart);
      if (!isNaN(d.getTime())) {
        const dow = d.getDay();
        const { weekOfMonth: wom } = calculateWeekOfMonth(d);
        setDayOfWeek(dow);
        setWeekOfMonth(wom);
        setMonthDay(d.getDate());

        // 新規作成で繰り返しをONにしたばかりの場合、開始日の曜日をデフォルトで選択
        if (!editingEvent && selectedDaysOfWeek.length === 0) {
          setSelectedDaysOfWeek([dow]);
        }
      }
    }
  }, [start, editingEvent]);

  const handleCopyAndAdd = () => {
    const newTitle = title.includes('(コピー)') ? title : `${title} (コピー)`;
    setTitle(newTitle);
    setCurrentEditingEvent(null); // IDを解除して新規追加扱いにする
    setError('内容を複製しました。日時やタイトルなどを確認し「保存する」を押してください。');
  };

  const handleModalClose = () => {
    setActionModalState({ isOpen: false, mode: 'edit' });
    onClose();
  };

  useEffect(() => {
    if (isOpen) {
      setActionModalState({ isOpen: false, mode: 'edit' });
      setError(null);
      setIsUploading(false);
      if (editingEvent) {
        if (isCopyMode) {
          const copyTitle = editingEvent.title.includes('(コピー)') ? editingEvent.title : `${editingEvent.title} (コピー)`;
          setTitle(copyTitle);
          setCurrentEditingEvent(null);
          setError('内容を複製しました。日時やタイトルなどを確認し「保存する」を押してください。');
        } else {
          setTitle(editingEvent.title);
          setCurrentEditingEvent(editingEvent);
        }
        setType(editingEvent.type);
        setOffice(editingEvent.office || '全社');
        setDivision(editingEvent.division || '全部署');

        const isAllDayEv = !!editingEvent.isAllDay;
        const startDateStr = extractLocalDateStr(editingEvent.start);
        const endDateStr = editingEvent.end ? extractLocalDateStr(editingEvent.end) : startDateStr;
        
        let startLocal = '';
        let endLocal = '';

        if (isAllDayEv) {
          startLocal = `${startDateStr}T00:00`;
          endLocal = `${endDateStr}T23:59`;
          setDurationMinutes(null);
        } else {
          startLocal = toLocalDatetimeInput(editingEvent.start);
          const isSameExactTime = editingEvent.end && new Date(editingEvent.start).getTime() === new Date(editingEvent.end).getTime();
          if (editingEvent.end && !isSameExactTime) {
            endLocal = toLocalDatetimeInput(editingEvent.end);
            const diff = getMinutesDifference(startLocal, endLocal);
            setDurationMinutes(diff && diff > 0 ? diff : 60);
          } else {
            endLocal = addMinutesToLocalDatetime(startLocal, 60);
            setDurationMinutes(60);
          }
        }

        const isMultiDay = !!(startDateStr && endDateStr && startDateStr !== endDateStr);
        setIsAllDay(isAllDayEv || isMultiDay);
        setIsPrivate(!!(editingEvent.isPrivate || (editingEvent as any).isSecret));

        setStart(startLocal);
        setEnd(endLocal);
        setLocation(editingEvent.location || '');
        setMemo(editingEvent.memo || '');
        setIsGoogleSynced(!!editingEvent.isGoogleSynced);
        setSelectedAttendees(editingEvent.attendees || []);
        setAttachments(editingEvent.attachments || []);

        // 現場連携情報の復元
        setSelectedSiteId(editingEvent.siteId || null);
        setSelectedSiteCode(editingEvent.siteCode || null);
        setSelectedSiteName(editingEvent.siteName || null);
        if (editingEvent.siteId || editingEvent.siteCode || editingEvent.siteName) {
          setType('construction');
        }
        let phase: ConstructionPhase = editingEvent.constructionPhase || 'new';
        if (!editingEvent.constructionPhase && editingEvent.title) {
          if (editingEvent.title.includes('【新規】')) phase = 'new';
          else if (editingEvent.title.includes('【残】')) phase = 'remaining';
          else if (editingEvent.title.includes('【出庫有】')) phase = 'shukko';
        }
        setConstructionPhase(phase);
        setIsSiteSelectorOpen(false);

        // 繰り返し設定の復元
        const parsedRec = safeParseRecurrence(editingEvent.recurrence);
        if (parsedRec && parsedRec.frequency !== 'none') {
          setIsRecurring(true);
          setRecurrenceFreq(parsedRec.frequency || 'weekly');
          setSelectedDaysOfWeek(parsedRec.daysOfWeek || [new Date(startDateStr).getDay()]);
          setMonthlyType(parsedRec.monthlyType || 'same_day');
          setMonthDay(parsedRec.monthDay || new Date(startDateStr).getDate());
          setWeekOfMonth(parsedRec.weekOfMonth || 1);
          setDayOfWeek(parsedRec.dayOfWeek !== undefined ? parsedRec.dayOfWeek : new Date(startDateStr).getDay());
          setRecurrenceEndType(parsedRec.endType || 'never');
          setRecurrenceEndDate(parsedRec.endDate || '');
          setRecurrenceCount(parsedRec.count || 10);
        } else if (editingEvent.recurrenceParentId) {
          // 個別インスタンス
          setIsRecurring(true);
          setRecurrenceFreq('weekly');
          setSelectedDaysOfWeek([new Date(startDateStr).getDay()]);
          setRecurrenceEndType('never');
        } else {
          setIsRecurring(false);
          setRecurrenceFreq('weekly');
          setSelectedDaysOfWeek([new Date(startDateStr).getDay()]);
          setRecurrenceEndType('never');
          setRecurrenceEndDate('');
          setRecurrenceCount(10);
        }
      } else {
        setTitle('');
        setType('personal');
        setOffice('全社');
        setDivision('全部署');
        
        // 現場情報の初期化
        setSelectedSiteId(null);
        setSelectedSiteCode(null);
        setSelectedSiteName(null);
        setConstructionPhase('new');
        setIsSiteSelectorOpen(false);
        setSiteSearchQuery('');

        
        const initStartStr = defaultInitialDate ? extractLocalDateStr(defaultInitialDate) : extractLocalDateStr(new Date().toISOString());
        const initEndStr = defaultEndDate ? extractLocalDateStr(defaultEndDate) : initStartStr;
        const isMulti = !!(defaultEndDate && initStartStr !== initEndStr);

        const useAllDay = defaultIsAllDay !== undefined ? defaultIsAllDay : isMulti;
        setIsAllDay(useAllDay);
        setIsPrivate(false);

        setLocation('');
        setMemo('');
        setIsGoogleSynced(false);
        setAttachments([]);

        // 参加者の初期設定
        if (defaultAttendees && defaultAttendees.length > 0) {
          setSelectedAttendees(defaultAttendees);
        } else if (currentUser) {
          setSelectedAttendees([currentUser]);
        } else {
          setSelectedAttendees([]);
        }

        // 開始日時・終了日時の初期設定
        if (useAllDay) {
          setStart(`${initStartStr}T00:00`);
          setEnd(`${initEndStr}T23:59`);
          setDurationMinutes(null);
        } else {
          let startLocal = '';
          if (defaultInitialDate) {
            if (defaultInitialDate.includes('T')) {
              startLocal = toLocalDatetimeInput(defaultInitialDate);
            } else {
              // 日付のみ渡された場合 (カレンダーマス目クリック等): その日付 + 現在時刻の30分丸め
              const { hours, minutes } = getRounded30MinTime(new Date());
              startLocal = `${defaultInitialDate}T${hours}:${minutes}`;
            }
          } else {
            const now = new Date();
            const { hours, minutes } = getRounded30MinTime(now);
            const todayStr = extractLocalDateStr(now.toISOString());
            startLocal = `${todayStr}T${hours}:${minutes}`;
          }

          let endLocal = '';
          if (defaultEndDate && defaultEndDate.includes('T') && defaultEndDate !== defaultInitialDate) {
            endLocal = toLocalDatetimeInput(defaultEndDate);
            const diff = getMinutesDifference(startLocal, endLocal);
            setDurationMinutes(diff && diff > 0 ? diff : 60);
          } else {
            // スケジュール追加時、終日でなければ終了日時は自動的に60分とする
            endLocal = addMinutesToLocalDatetime(startLocal, 60);
            setDurationMinutes(60);
          }

          setStart(startLocal);
          setEnd(endLocal);
        }

        // 繰り返し初期値
        setIsRecurring(false);
        setRecurrenceFreq('weekly');
        const startD = new Date(initStartStr);
        const dow = isNaN(startD.getTime()) ? 1 : startD.getDay();
        setSelectedDaysOfWeek([dow]);
        setMonthlyType('same_day');
        setMonthDay(isNaN(startD.getTime()) ? 1 : startD.getDate());
        const { weekOfMonth: wom } = calculateWeekOfMonth(startD);
        setWeekOfMonth(wom);
        setDayOfWeek(dow);
        setRecurrenceEndType('never');
        
        // 終了日初期値（3ヶ月後）
        const threeMonthsLater = new Date(startD);
        threeMonthsLater.setMonth(threeMonthsLater.getMonth() + 3);
        setRecurrenceEndDate(getLocalDateStr(threeMonthsLater.toISOString()));
        setRecurrenceCount(10);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, editingEvent]);

  // 開始日時変更ハンドラー (所要時間 durationMinutes があれば自動で終了日時を追従)
  const handleStartChange = (newStart: string) => {
    setStart(newStart);
    setError(null);

    if (!isAllDay && newStart) {
      const duration = durationMinutes || 60;
      const updatedEnd = addMinutesToLocalDatetime(newStart, duration);
      if (updatedEnd) {
        setEnd(updatedEnd);
      }
    }
  };

  // 終了日時変更ハンドラー (所要時間を再計算して保管)
  const handleEndChange = (newEnd: string) => {
    setEnd(newEnd);
    setError(null);

    if (!isAllDay && start && newEnd) {
      const diff = getMinutesDifference(start, newEnd);
      if (diff !== null && diff > 0) {
        setDurationMinutes(diff);
      } else {
        setDurationMinutes(diff !== null ? Math.max(0, diff) : 60);
      }
    }
  };

  // 終日トグルハンドラー
  const handleAllDayToggle = (checked: boolean) => {
    setIsAllDay(checked);
    setError(null);

    if (checked) {
      const startDatePart = start.split('T')[0] || extractLocalDateStr(new Date().toISOString());
      const endDatePart = end ? (end.split('T')[0] || startDatePart) : startDatePart;
      setStart(`${startDatePart}T00:00`);
      setEnd(`${endDatePart}T23:59`);
      setDurationMinutes(null);
    } else {
      // 終日OFF: デフォルトで現在の時間を30分刻みで丸めた時間を開始時間、終了時間は+60分
      const baseDatePart = start.split('T')[0] || extractLocalDateStr(new Date().toISOString());
      const { hours, minutes } = getRounded30MinTime(new Date());
      const newStart = `${baseDatePart}T${hours}:${minutes}`;
      const newEnd = addMinutesToLocalDatetime(newStart, 60);
      setStart(newStart);
      setEnd(newEnd);
      setDurationMinutes(60);
    }
  };

  // 他人から隠す（非公開）トグルハンドラー
  const handlePrivateToggle = (checked: boolean) => {
    setIsPrivate(checked);
    setError(null);
    if (checked && currentUser) {
      setSelectedAttendees([currentUser]);
    }
  };

  // 現場選択モーダル用フィルター済みリスト
  const filteredSites = useMemo(() => {
    return internalSites.filter(site => {
      // 1. ステータスフィルター
      if (siteFilterStatus === 'not_started' && site.status !== 'not_started') return false;
      if (siteFilterStatus === 'in_progress' && site.status !== 'in_progress') return false;
      if (siteFilterStatus === 'other' && site.status !== 'completed' && site.status !== 'on_hold') return false;

      // 2. 検索キーワードフィルター
      if (siteSearchQuery.trim()) {
        const q = siteSearchQuery.toLowerCase();
        const code = (site.siteCode || '').toLowerCase();
        const name = (site.siteName || '').toLowerCase();
        const customer = (site.customerName || '').toLowerCase();
        const addr = (site.address || '').toLowerCase();
        return code.includes(q) || name.includes(q) || customer.includes(q) || addr.includes(q);
      }
      return true;
    });
  }, [internalSites, siteFilterStatus, siteSearchQuery]);

  const selectedSite = useMemo(() => {
    if (!selectedSiteId) return null;
    return internalSites.find(s => s.id === selectedSiteId) || null;
  }, [internalSites, selectedSiteId]);

  if (!isOpen) return null;

  const toggleAttendee = (user: User) => {
    if (selectedAttendees.some(u => u.id === user.id)) {
      setSelectedAttendees(selectedAttendees.filter(u => u.id !== user.id));
    } else {
      setSelectedAttendees([...selectedAttendees, user]);
    }
  };

  const toggleWeekday = (day: number) => {
    if (selectedDaysOfWeek.includes(day)) {
      if (selectedDaysOfWeek.length > 1) {
        setSelectedDaysOfWeek(selectedDaysOfWeek.filter(d => d !== day));
      }
    } else {
      setSelectedDaysOfWeek([...selectedDaysOfWeek, day].sort((a, b) => a - b));
    }
  };

  // 添付ファイルアップロード (非同期)
  const processUploadedFiles = async (files: FileList | File[]) => {
    if (files && files.length > 0) {
      setIsUploading(true);
      try {
        const uploaded = await uploadMultipleFiles(files);
        setAttachments(prev => [...prev, ...uploaded]);
      } catch (err) {
        console.error(err);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processUploadedFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!isIcal) {
      setIsDraggingOver(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (!isIcal && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processUploadedFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const buildRecurrenceRule = (): RecurrenceRule | undefined => {
    if (!isRecurring) return undefined;

    return {
      frequency: recurrenceFreq,
      interval: 1,
      daysOfWeek: recurrenceFreq === 'weekly' ? selectedDaysOfWeek : undefined,
      monthlyType: recurrenceFreq === 'monthly' ? monthlyType : undefined,
      monthDay: recurrenceFreq === 'monthly' && monthlyType === 'same_day' ? monthDay : undefined,
      weekOfMonth: recurrenceFreq === 'monthly' && monthlyType === 'day_of_week' ? weekOfMonth : undefined,
      dayOfWeek: recurrenceFreq === 'monthly' && monthlyType === 'day_of_week' ? dayOfWeek : undefined,
      endType: recurrenceEndType,
      endDate: recurrenceEndType === 'until_date' ? recurrenceEndDate : undefined,
      count: recurrenceEndType === 'count' ? Number(recurrenceCount) || 1 : undefined,
    };
  };

  // 現場選択ハンドラー
  const handleSelectSite = (site: Site) => {
    setSelectedSiteId(site.id);
    setSelectedSiteCode(site.siteCode);
    setSelectedSiteName(site.siteName);
    setType('construction');

    // タイトルに現場名を自動セット
    setTitle(site.siteName);

    // 乗り込み区分（新規・残・出庫有）の自動判定
    const hasExistingEvents = (allEvents || []).some(
      ev => (ev.siteId === site.id || ev.siteCode === site.siteCode) && ev.id !== editingEvent?.id
    );

    let initialPhase: ConstructionPhase = 'new';
    if (site.status === 'in_progress' || hasExistingEvents) {
      initialPhase = 'remaining';
    } else {
      initialPhase = 'new';
    }
    setConstructionPhase(initialPhase);

    // 現場住所があれば場所（location）に自動補完
    if (site.address && !location) {
      setLocation(site.address);
    }

    // 現場の担当者がいれば参加者（attendees）に自動補完
    if (allUsers.length > 0 && selectedAttendees.length <= 1) {
      const candidateUserIds = new Set<string>();
      if (site.primaryWorkerId) candidateUserIds.add(site.primaryWorkerId);
      if (site.coWorkers) {
        site.coWorkers.forEach(c => candidateUserIds.add(c.id));
      }
      const matchedUsers = allUsers.filter(u => candidateUserIds.has(u.id));
      if (matchedUsers.length > 0) {
        setSelectedAttendees(matchedUsers);
      }
    }

    setIsSiteSelectorOpen(false);
  };

  const handleClearSite = () => {
    setSelectedSiteId(null);
    setSelectedSiteCode(null);
    setSelectedSiteName(null);
    setConstructionPhase('new');
  };



  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title || !title.trim() || !start) {
      setError('タイトルと開始日時は必須です。');
      return;
    }

    if (isRecurring && recurrenceFreq === 'weekly' && selectedDaysOfWeek.length === 0) {
      setError('毎週繰り返す曜日を少なくとも1つ選択してください。');
      return;
    }

    if (isRecurring && recurrenceEndType === 'until_date' && !recurrenceEndDate) {
      setError('繰り返しの終了日を指定してください。');
      return;
    }

    if (end) {
      if (isAllDay) {
        const startDatePart = start.split('T')[0];
        const endDatePart = end.split('T')[0];
        if (endDatePart < startDatePart) {
          setError('終日の終了日は開始日以降の日付を指定してください。');
          return;
        }
      } else {
        const startDateObj = new Date(start);
        const endDateObj = new Date(end);
        if (endDateObj < startDateObj) {
          setError('終了日時は開始日時以降の日時を指定してください。');
          return;
        }
      }
    }

    let startIso: string;
    let endIso: string | undefined = undefined;

    if (isAllDay) {
      const startDatePart = start.split('T')[0];
      startIso = `${startDatePart}T00:00:00+09:00`;

      const endDatePart = (end && end.trim()) ? end.split('T')[0] : startDatePart;
      endIso = `${endDatePart}T23:59:59+09:00`;
    } else {
      const formattedStart = start.includes('+') || start.endsWith('Z') ? start : `${start}:00+09:00`;
      startIso = new Date(formattedStart).toISOString();
      const resolvedEnd = end || addMinutesToLocalDatetime(start, durationMinutes || 60);
      const formattedEnd = resolvedEnd.includes('+') || resolvedEnd.endsWith('Z') ? resolvedEnd : `${resolvedEnd}:00+09:00`;
      endIso = new Date(formattedEnd).toISOString();
    }

    const recurrenceObj = buildRecurrenceRule();

    const eventPayload: Omit<CalendarEvent, 'id'> = {
      title: (title || '').trim(),
      type,
      start: startIso,
      end: endIso,
      isAllDay,
      isPrivate,
      office,
      division,
      location,
      memo,
      isGoogleSynced: false,
      attendees: isPrivate && currentUser ? [currentUser] : selectedAttendees,
      createdBy: editingEvent?.createdBy || currentUser,
      attachments,
      recurrence: recurrenceObj,
      siteId: selectedSiteId || undefined,
      siteCode: selectedSiteCode || undefined,
      siteName: selectedSiteName || undefined,
      constructionPhase: selectedSiteId ? constructionPhase : undefined,
    };


    // 既存の繰り返し予定を編集する場合、適用範囲選択モーダルを表示
    if (editingEvent && isCurrentlyRecurring) {
      setActionModalState({
        isOpen: true,
        mode: 'edit',
        pendingPayload: {
          ...editingEvent,
          ...eventPayload,
        },
      });
      return;
    }

    if (currentEditingEvent) {
      onSave({
        ...currentEditingEvent,
        ...eventPayload,
      });
    } else {
      onSave(eventPayload);
    }

    onClose();
  };

  // 削除ボタン押下時のハンドラ
  const handleDeleteClick = () => {
    if (!editingEvent || !onDelete) return;

    if (isCurrentlyRecurring) {
      setActionModalState({
        isOpen: true,
        mode: 'delete',
      });
      return;
    }

    onDelete(editingEvent.id);
    onClose();
  };

  // 繰り返しアクション決定ハンドラ
  const handleConfirmRecurrenceAction = (scope: RecurrenceActionScope) => {
    const { mode, pendingPayload } = actionModalState;
    setActionModalState({ isOpen: false, mode: 'edit' });

    const originalDate = editingEvent?.instanceDate || (editingEvent?.start ? extractLocalDateStr(editingEvent.start) : undefined);

    if (mode === 'edit') {
      if (pendingPayload) {
        onSave(pendingPayload, scope, originalDate);
      }
      handleModalClose();
    } else if (mode === 'delete') {
      if (editingEvent && onDelete) {
        onDelete(editingEvent.id, scope, originalDate);
      }
      handleModalClose();
    }
  };

  return (
    <div
      onClick={(e) => {
        if (actionModalState.isOpen || isPreviewOpen) return;
        if (e.target === e.currentTarget) {
          handleModalClose();
        }
      }}
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg sm:max-w-2xl my-6 max-h-[92vh] overflow-y-auto ring-1 ring-slate-900/5"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <h2 className="text-base sm:text-lg font-bold text-slate-800">
              {currentEditingEvent ? '予定を編集' : '予定を追加'}
            </h2>
            {isCurrentlyRecurring && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 flex items-center gap-1">
                <Repeat className="w-3 h-3" />
                定期予定
              </span>
            )}
          </div>
          <button onClick={handleModalClose} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-4 sm:p-5 space-y-3">
          {isAllDay && start && end && start.split('T')[0] !== end.split('T')[0] && (
            <div className="p-3 bg-purple-50 border border-purple-200 text-purple-900 text-xs font-bold rounded-xl flex items-center justify-between gap-2 shadow-2xs">
              <div className="flex items-center gap-2">
                <span className="bg-purple-600 text-white text-[10px] font-black px-2 py-0.5 rounded-md tracking-wider">ドラッグ範囲選択</span>
                <span>{start.split('T')[0]} ～ {end.split('T')[0]}</span>
              </div>
              <span className="text-purple-700 font-extrabold bg-purple-100 px-2 py-0.5 rounded-md">
                {(() => {
                  const d1 = new Date(start.split('T')[0]);
                  const d2 = new Date(end.split('T')[0]);
                  if (isNaN(d1.getTime()) || isNaN(d2.getTime())) return '複数日';
                  const diff = Math.floor(Math.abs(d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24)) + 1;
                  return `${diff}日間の終日予定`;
                })()}
              </span>
            </div>
          )}

          {isIcal && (
            <div className="p-3.5 bg-indigo-50 border border-indigo-200 text-indigo-800 text-xs font-medium rounded-xl flex items-center gap-2.5">
              <LinkIcon className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>マイページで設定された iCal URL から同期された外部予定です。</span>
            </div>
          )}

          {error && (
            <div className="p-3.5 bg-red-50 border border-red-200 text-red-700 text-sm rounded-xl flex items-center gap-2.5 font-medium">
              <AlertCircle className="w-5 h-5 text-red-500 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">タイトル <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              readOnly={isIcal}
              value={title}
              onChange={e => { setTitle(e.target.value); setError(null); }}
              className={`w-full px-3 py-2 border border-slate-200 rounded-lg text-sm font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors shadow-2xs ${
                isIcal ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50 focus:bg-white'
              }`}
              placeholder="予定のタイトル"
            />
          </div>

          {/* 区分・終日・隠す・繰り返し を1行にコンパクト配置 */}
          <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50/90 px-3 py-2 rounded-xl border border-slate-200/80">
            {/* 区分 */}
            <div className="flex items-center gap-1.5 shrink-0">
              <label htmlFor="eventTypeSelect" className="text-xs font-bold text-slate-700 shrink-0">区分</label>
              <select
                id="eventTypeSelect"
                value={type}
                disabled={isIcal}
                onChange={e => setType(e.target.value as EventType)}
                className={`px-2 py-1 border border-slate-200 rounded-lg text-xs font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors shadow-2xs ${
                  isIcal ? 'bg-slate-100 text-slate-400 cursor-not-allowed' : 'bg-white hover:border-slate-300 text-slate-800 cursor-pointer'
                }`}
              >
                <option value="personal">個人</option>
                <option value="construction">工事</option>
                <option value="inspection">点検</option>
                <option value="replacement">取替</option>
                <option value="repair">修理</option>
                <option value="visitor">来客</option>
                <option value="business_trip">出張</option>
                <option value="meeting">会議</option>
              </select>
            </div>

            {/* 終日・隠す・繰り返し チェックボックス */}
            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <label
                htmlFor="isAllDay"
                className={`flex items-center gap-1 text-xs font-bold select-none cursor-pointer ${
                  isIcal ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 hover:text-indigo-600'
                }`}
              >
                <input
                  type="checkbox"
                  id="isAllDay"
                  disabled={isIcal}
                  checked={isAllDay}
                  onChange={e => handleAllDayToggle(e.target.checked)}
                  className={`w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${
                    isIcal ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                  }`}
                />
                <span>終日</span>
              </label>

              <label
                htmlFor="isPrivate"
                className={`flex items-center gap-1 text-xs font-bold select-none cursor-pointer ${
                  isIcal ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 hover:text-indigo-600'
                }`}
              >
                <input
                  type="checkbox"
                  id="isPrivate"
                  disabled={isIcal}
                  checked={isPrivate}
                  onChange={e => handlePrivateToggle(e.target.checked)}
                  className={`w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${
                    isIcal ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                  }`}
                />
                <span>隠す</span>
              </label>

              <label
                htmlFor="isRecurring"
                className={`flex items-center gap-1 text-xs font-bold select-none cursor-pointer ${
                  isIcal ? 'text-slate-400 cursor-not-allowed' : 'text-slate-700 hover:text-indigo-600'
                }`}
              >
                <input
                  type="checkbox"
                  id="isRecurring"
                  disabled={isIcal}
                  checked={isRecurring}
                  onChange={e => {
                    setIsRecurring(e.target.checked);
                    setError(null);
                  }}
                  className={`w-3.5 h-3.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 ${
                    isIcal ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
                  }`}
                />
                <span className="flex items-center gap-0.5">
                  <Repeat className={`w-3 h-3 ${isRecurring ? 'text-indigo-600' : 'text-slate-400'}`} />
                  繰り返し
                </span>
              </label>
            </div>
          </div>

          {/* 現場管理連携: 区分が「工事」のときの現場選択および3択トグルスイッチ */}
          {type === 'construction' && (
            <div className="p-3 bg-amber-50/70 border border-amber-200/90 rounded-xl space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-amber-900 flex items-center gap-1.5">
                  <HardHat className="w-4 h-4 text-amber-600" />
                  対象現場 <span className="text-[10px] text-amber-600 font-normal">（現場登録連携）</span>
                </span>
                {selectedSite && (
                  <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                    selectedSite.status === 'not_started' 
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                      : selectedSite.status === 'in_progress'
                      ? 'bg-blue-50 text-blue-700 border-blue-300'
                      : 'bg-slate-50 text-slate-700 border-slate-300'
                  }`}>
                    {selectedSite.status === 'not_started' ? '現場: 未着手' : selectedSite.status === 'in_progress' ? '現場: 進行中' : '現場: 完了・保留'}
                  </span>
                )}
              </div>

              {selectedSite ? (
                <div className="bg-white border border-amber-200 rounded-lg p-2.5 flex items-center justify-between gap-2 shadow-2xs">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-black bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                        {selectedSite.siteCode}
                      </span>
                      <strong className="text-xs font-bold text-slate-900 truncate">
                        {selectedSite.siteName}
                      </strong>
                    </div>
                    {selectedSite.address && (
                      <div className="text-[11px] text-slate-500 truncate mt-0.5 flex items-center gap-1">
                        <span className="text-slate-400">📍</span>
                        {selectedSite.address}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => setIsSiteSelectorOpen(true)}
                      className="px-2 py-1 bg-amber-100 hover:bg-amber-200 text-amber-800 text-[11px] font-bold rounded transition cursor-pointer"
                    >
                      変更
                    </button>
                    <button
                      type="button"
                      onClick={handleClearSite}
                      className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition cursor-pointer"
                      title="現場紐付けを解除"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsSiteSelectorOpen(true)}
                  className="w-full py-2.5 px-3 border border-dashed border-amber-300 hover:border-amber-400 bg-white hover:bg-amber-50/50 rounded-lg text-xs font-bold text-amber-800 flex items-center justify-center gap-2 transition cursor-pointer shadow-2xs group"
                >
                  <Search className="w-3.5 h-3.5 text-amber-600 group-hover:scale-110 transition-transform" />
                  <span>現場を選択してください（未着手・進行中・現場コード検索）</span>
                </button>
              )}

              {/* 乗り込み区分 3択トグルスイッチ (新規 / 残 / 出庫有) */}
              <div className="pt-2 border-t border-amber-200/60 flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-amber-950 shrink-0">乗り込み種別:</span>
                <div className="grid grid-cols-3 gap-1.5 flex-1 max-w-xs">
                  <button
                    type="button"
                    onClick={() => setConstructionPhase('new')}
                    className={`py-1 px-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs ${
                      constructionPhase === 'new'
                        ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-300'
                        : 'bg-white hover:bg-emerald-50 text-emerald-800 border border-emerald-200'
                    }`}
                  >
                    <span>【新規】</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConstructionPhase('remaining')}
                    className={`py-1 px-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs ${
                      constructionPhase === 'remaining'
                        ? 'bg-slate-700 text-white shadow-xs ring-2 ring-slate-400'
                        : 'bg-white hover:bg-slate-100 text-slate-700 border border-slate-300'
                    }`}
                  >
                    <span>【残】</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setConstructionPhase('shukko')}
                    className={`py-1 px-1.5 rounded-lg text-xs font-bold transition flex items-center justify-center gap-1 cursor-pointer shadow-2xs ${
                      constructionPhase === 'shukko'
                        ? 'bg-blue-600 text-white shadow-xs ring-2 ring-blue-300'
                        : 'bg-white hover:bg-blue-50 text-blue-800 border border-blue-200'
                    }`}
                  >
                    <span>【出庫有】</span>
                  </button>
                </div>
              </div>
            </div>
          )}


          {/* 開始日時・終了日時：1行目を見出し、2行目を日付・時刻にして日付欄を拡大 */}
          {isAllDay ? (
            <div className="bg-slate-50/90 px-3 py-2.5 rounded-xl border border-slate-200/80 space-y-1">
              <div className="text-xs font-bold text-slate-700 flex items-center gap-1">
                終日期間 <span className="text-red-500">*</span>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="date"
                  required
                  readOnly={isIcal}
                  value={start.split('T')[0] || ''}
                  onChange={e => {
                    const newStartDate = e.target.value;
                    setStart(newStartDate ? `${newStartDate}T00:00` : '');
                    setError(null);
                    if (newStartDate && end) {
                      const endDatePart = end.split('T')[0];
                      if (endDatePart && endDatePart < newStartDate) {
                        setEnd(`${newStartDate}T23:59`);
                      }
                    }
                  }}
                  className={`flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors text-xs font-bold text-slate-800 shadow-2xs ${
                    isIcal ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'hover:border-slate-300'
                  }`}
                />
                <span className="text-slate-400 font-bold shrink-0">～</span>
                <input
                  type="date"
                  readOnly={isIcal}
                  value={end ? end.split('T')[0] : (start ? start.split('T')[0] : '')}
                  onChange={e => {
                    setEnd(e.target.value ? `${e.target.value}T23:59` : '');
                    setError(null);
                  }}
                  className={`flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors text-xs font-bold text-slate-800 shadow-2xs ${
                    isIcal ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'hover:border-slate-300'
                  }`}
                />
              </div>
            </div>
          ) : (
            <div className="bg-slate-50/90 px-3 py-2.5 rounded-xl border border-slate-200/80">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {/* 開始日時: 1行目 見出し, 2行目 日付+時間 (時・分の表示なし) */}
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    開始 <span className="text-red-500">*</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      required
                      readOnly={isIcal}
                      value={start.split('T')[0] || ''}
                      onChange={e => {
                        const d = e.target.value;
                        const h = start.split('T')[1]?.split(':')[0] || '09';
                        const m = roundTo5Minutes(start.split('T')[1]?.split(':')[1] || '00');
                        handleStartChange(d ? `${d}T${h}:${m}` : '');
                      }}
                      className={`flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors text-xs font-bold text-slate-800 shadow-2xs ${
                        isIcal ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'hover:border-slate-300'
                      }`}
                    />
                    <div className="flex items-center gap-0.5 shrink-0 bg-white border border-slate-200 rounded-lg px-1.5 py-1 shadow-2xs">
                      <Clock className="w-3.5 h-3.5 text-indigo-500 shrink-0 ml-0.5" />
                      <select
                        disabled={isIcal}
                        value={start.split('T')[1]?.split(':')[0] || '09'}
                        onChange={e => {
                          const d = start.split('T')[0] || extractLocalDateStr(new Date().toISOString());
                          const h = e.target.value;
                          const m = roundTo5Minutes(start.split('T')[1]?.split(':')[1] || '00');
                          handleStartChange(`${d}T${h}:${m}`);
                        }}
                        className={`px-0.5 py-0.5 bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer ${
                          isIcal ? 'text-slate-400 cursor-not-allowed' : ''
                        }`}
                      >
                        {HOURS.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <span className="text-slate-400 font-bold text-xs">:</span>
                      <select
                        disabled={isIcal}
                        value={roundTo5Minutes(start.split('T')[1]?.split(':')[1] || '00')}
                        onChange={e => {
                          const d = start.split('T')[0] || extractLocalDateStr(new Date().toISOString());
                          const h = start.split('T')[1]?.split(':')[0] || '09';
                          const m = e.target.value;
                          handleStartChange(`${d}T${h}:${m}`);
                        }}
                        className={`px-0.5 py-0.5 bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer ${
                          isIcal ? 'text-slate-400 cursor-not-allowed' : ''
                        }`}
                      >
                        {MINUTES.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* 終了日時: 1行目 見出し, 2行目 日付+時間 (時・分の表示なし) */}
                <div className="space-y-1">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1">
                    終了 <span className="text-red-500">*</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <input
                      type="date"
                      required
                      readOnly={isIcal}
                      value={end ? end.split('T')[0] : ''}
                      onChange={e => {
                        const d = e.target.value;
                        if (!d) return;
                        const h = end ? (end.split('T')[1]?.split(':')[0] || '10') : '10';
                        const m = end ? roundTo5Minutes(end.split('T')[1]?.split(':')[1] || '00') : '00';
                        handleEndChange(`${d}T${h}:${m}`);
                      }}
                      className={`flex-1 min-w-0 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors text-xs font-bold text-slate-800 shadow-2xs ${
                        isIcal ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'hover:border-slate-300'
                      }`}
                    />
                    <div className="flex items-center gap-0.5 shrink-0 bg-white border border-slate-200 rounded-lg px-1.5 py-1 shadow-2xs">
                      <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0 ml-0.5" />
                      <select
                        disabled={isIcal}
                        value={end ? (end.split('T')[1]?.split(':')[0] || '10') : '10'}
                        onChange={e => {
                          const d = (end && end.split('T')[0]) || start.split('T')[0] || extractLocalDateStr(new Date().toISOString());
                          const h = e.target.value;
                          const m = end ? roundTo5Minutes(end.split('T')[1]?.split(':')[1] || '00') : '00';
                          handleEndChange(`${d}T${h}:${m}`);
                        }}
                        className={`px-0.5 py-0.5 bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer ${
                          isIcal ? 'text-slate-400 cursor-not-allowed' : ''
                        }`}
                      >
                        {HOURS.map(h => (
                          <option key={h} value={h}>{h}</option>
                        ))}
                      </select>
                      <span className="text-slate-400 font-bold text-xs">:</span>
                      <select
                        disabled={isIcal}
                        value={end ? roundTo5Minutes(end.split('T')[1]?.split(':')[1] || '00') : '00'}
                        onChange={e => {
                          const d = (end && end.split('T')[0]) || start.split('T')[0] || extractLocalDateStr(new Date().toISOString());
                          const h = end ? (end.split('T')[1]?.split(':')[0] || '10') : '10';
                          const m = e.target.value;
                          handleEndChange(`${d}T${h}:${m}`);
                        }}
                        className={`px-0.5 py-0.5 bg-transparent text-xs font-bold text-slate-800 focus:outline-none cursor-pointer ${
                          isIcal ? 'text-slate-400 cursor-not-allowed' : ''
                        }`}
                      >
                        {MINUTES.map(m => (
                          <option key={m} value={m}>{m}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* 繰り返しがONの場合に時間の下に表示される詳細設定 */}
          {isRecurring && (
            <div className="border border-indigo-200 rounded-xl p-3.5 bg-indigo-50/40 space-y-3.5 transition-all animate-in fade-in-50 duration-200">
              <div className="flex items-center gap-1.5 text-xs font-bold text-indigo-900 border-b border-indigo-100/80 pb-2">
                <Repeat className="w-4 h-4 text-indigo-600 shrink-0" />
                <span>繰り返し詳細設定</span>
              </div>

              {/* 頻度選択 */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">繰り返す頻度</label>
                <div className="grid grid-cols-4 gap-1.5">
                  {[
                    { id: 'weekly', label: '毎週' },
                    { id: 'monthly', label: '毎月' },
                    { id: 'daily', label: '毎日' },
                    { id: 'yearly', label: '毎年' },
                  ].map(item => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setRecurrenceFreq(item.id as RecurrenceFrequency)}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all ${
                        recurrenceFreq === item.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 毎週の場合: 曜日選択（複数選択可） */}
              {recurrenceFreq === 'weekly' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    繰り返す曜日 <span className="text-slate-400 font-normal">(複数選択可)</span>
                  </label>
                  <div className="flex gap-1.5">
                    {WEEKDAY_LABELS.map(({ day, label }) => {
                      const isSelected = selectedDaysOfWeek.includes(day);
                      const isWeekend = day === 0 || day === 6;
                      return (
                        <button
                          key={day}
                          type="button"
                          onClick={() => toggleWeekday(day)}
                          className={`flex-1 py-1.5 text-xs font-bold rounded-lg border transition-all ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                              : `bg-white border-slate-200 hover:bg-slate-100 ${
                                  isWeekend ? (day === 0 ? 'text-rose-600' : 'text-sky-600') : 'text-slate-700'
                                }`
                          }`}
                        >
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 毎月の場合: 同日 or 第N曜日 */}
              {recurrenceFreq === 'monthly' && (
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">毎月の指定方法</label>
                  <div className="space-y-2 bg-white p-2.5 rounded-lg border border-slate-200/90">
                    {/* 同日 */}
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="monthly_type"
                        checked={monthlyType === 'same_day'}
                        onChange={() => setMonthlyType('same_day')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-semibold">毎月</span>
                      <select
                        value={monthDay}
                        onChange={e => {
                          setMonthDay(Number(e.target.value));
                          setMonthlyType('same_day');
                        }}
                        className="px-2 py-1 border border-slate-200 rounded text-xs bg-slate-50 font-medium"
                      >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                          <option key={d} value={d}>{d}日</option>
                        ))}
                      </select>
                      <span>に繰り返す</span>
                    </label>

                    {/* 第N曜日 */}
                    <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                      <input
                        type="radio"
                        name="monthly_type"
                        checked={monthlyType === 'day_of_week'}
                        onChange={() => setMonthlyType('day_of_week')}
                        className="text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="font-semibold">毎月</span>
                      <select
                        value={weekOfMonth}
                        onChange={e => {
                          setWeekOfMonth(Number(e.target.value));
                          setMonthlyType('day_of_week');
                        }}
                        className="px-2 py-1 border border-slate-200 rounded text-xs bg-slate-50 font-medium"
                      >
                        <option value={1}>第1</option>
                        <option value={2}>第2</option>
                        <option value={3}>第3</option>
                        <option value={4}>第4</option>
                        <option value={5}>第5</option>
                      </select>
                      <select
                        value={dayOfWeek}
                        onChange={e => {
                          setDayOfWeek(Number(e.target.value));
                          setMonthlyType('day_of_week');
                        }}
                        className="px-2 py-1 border border-slate-200 rounded text-xs bg-slate-50 font-medium"
                      >
                        {WEEKDAY_LABELS.map(({ day, label }) => (
                          <option key={day} value={day}>{label}曜日</option>
                        ))}
                      </select>
                      <span>に繰り返す</span>
                    </label>
                  </div>
                </div>
              )}

              {/* 期限の設定 */}
              <div className="space-y-2 pt-1 border-t border-slate-200/60">
                <label className="block text-xs font-semibold text-slate-700">繰り返しの期限（終了条件）</label>
                <div className="space-y-2">
                  {/* 期限なし */}
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="recurrence_end_type"
                      checked={recurrenceEndType === 'never'}
                      onChange={() => setRecurrenceEndType('never')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>期限なし（継続的に繰り返す）</span>
                  </label>

                  {/* 終了日指定 */}
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="recurrence_end_type"
                      checked={recurrenceEndType === 'until_date'}
                      onChange={() => setRecurrenceEndType('until_date')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>終了日を指定:</span>
                    <input
                      type="date"
                      value={recurrenceEndDate}
                      disabled={recurrenceEndType !== 'until_date'}
                      onChange={e => {
                        setRecurrenceEndDate(e.target.value);
                        setRecurrenceEndType('until_date');
                        setError(null);
                      }}
                      className="px-2.5 py-1 border border-slate-200 rounded-lg text-xs bg-white focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    <span>まで</span>
                  </label>

                  {/* 回数指定 */}
                  <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                    <input
                      type="radio"
                      name="recurrence_end_type"
                      checked={recurrenceEndType === 'count'}
                      onChange={() => setRecurrenceEndType('count')}
                      className="text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>回数を指定:</span>
                    <input
                      type="number"
                      min="1"
                      max="365"
                      value={recurrenceCount}
                      disabled={recurrenceEndType !== 'count'}
                      onChange={e => {
                        setRecurrenceCount(Number(e.target.value));
                        setRecurrenceEndType('count');
                        setError(null);
                      }}
                      className="w-16 px-2.5 py-1 border border-slate-200 rounded-lg text-xs bg-white text-center focus:ring-2 focus:ring-indigo-500 disabled:bg-slate-100 disabled:text-slate-400"
                    />
                    <span>回繰り返したら終了</span>
                  </label>
                </div>
              </div>

              {/* プレビューテキスト */}
              <div className="p-2.5 bg-indigo-50/80 border border-indigo-100 rounded-lg text-xs text-indigo-900 font-medium flex items-center gap-2">
                <Repeat className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
                <span>
                  設定内容: <strong>{getRecurrenceLabel(buildRecurrenceRule()) || '繰り返しなし'}</strong>
                </span>
              </div>
            </div>
          )}

          {/* 参加者の選択 */}
          <div>
            {isPrivate && (
              <p className="text-xs font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-lg mb-2 flex items-center gap-1.5">
                🔒 「他人から隠す」がONのため、参加メンバーはあなたのみに固定されています。
              </p>
            )}
            <MemberSelector
              allUsers={allUsers}
              selectedUserIds={selectedAttendees.map(u => u.id)}
              onChangeSelectedUserIds={(ids) => {
                if (isPrivate) return;
                const updated = allUsers.filter(u => ids.includes(u.id));
                setSelectedAttendees(updated);
              }}
              offices={offices}
              divisions={divisions}
              disabled={isIcal || isPrivate}
              label="参加メンバー設定"
              defaultExpanded={false}
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">場所</label>
            <input
              type="text"
              readOnly={isIcal}
              value={location}
              onChange={e => setLocation(e.target.value)}
              className={`w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors shadow-2xs ${
                isIcal ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50 focus:bg-white'
              }`}
              placeholder="会議室、客先など"
            />
          </div>

          {/* 添付ファイル設定 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-slate-500" />
                添付ファイル
              </label>
              {!isIcal && (
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50"
                >
                  <Plus className="w-3.5 h-3.5" />
                  追加
                </button>
              )}
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />

            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative rounded-xl transition-all ${
                isDraggingOver
                  ? 'border-2 border-dashed border-indigo-500 bg-indigo-50/80 p-4 text-center ring-2 ring-indigo-300'
                  : ''
              }`}
            >
              {isDraggingOver && (
                <div className="flex flex-col items-center justify-center gap-1 text-indigo-700 pointer-events-none py-2">
                  <UploadCloud className="w-6 h-6 animate-bounce text-indigo-600" />
                  <p className="text-xs font-bold">ここにファイルをドロップして添付</p>
                </div>
              )}

              {!isDraggingOver && (
                <>
                  {isUploading && (
                    <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 mb-1.5">
                      <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                      <span>ファイルをアップロード中...</span>
                    </div>
                  )}

                  {attachments.length > 0 ? (
                    <div className="space-y-1.5">
                      {attachments.map(att => (
                        <div
                          key={att.id}
                          className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs animate-in fade-in-50 duration-200"
                        >
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={att.name}
                              className="font-semibold text-indigo-600 hover:text-indigo-800 hover:underline truncate"
                              title="クリックしてファイルをダウンロード・表示"
                            >
                              {att.name}
                            </a>
                            <span className="text-[10px] text-slate-400 shrink-0">({att.size})</span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0 ml-2">
                            {isPreviewable(att.name, att.type) && (
                              <button
                                type="button"
                                onClick={() => {
                                  setPreviewFile(att);
                                  setIsPreviewOpen(true);
                                }}
                                className="px-2 py-0.5 text-[10px] font-bold text-emerald-600 hover:bg-emerald-50 rounded-md transition-colors cursor-pointer"
                              >
                                プレビュー
                              </button>
                            )}
                            <a
                              href={att.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              download={att.name}
                              className="px-2 py-0.5 text-[10px] font-bold text-indigo-600 hover:bg-indigo-50 rounded-md transition-colors"
                              title="ファイルをダウンロード"
                            >
                              ダウンロード
                            </a>
                            {!isIcal && (
                              <button
                                type="button"
                                disabled={isUploading}
                                onClick={() => handleRemoveAttachment(att.id)}
                                className="text-slate-400 hover:text-red-600 p-0.5 rounded transition-colors disabled:opacity-50"
                                title="添付を削除"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                      {!isUploading && !isIcal && (
                        <div
                          onClick={() => !isUploading && fileInputRef.current?.click()}
                          className="p-2.5 border border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-xl text-center cursor-pointer transition-all bg-slate-50/50"
                        >
                          <p className="text-xs text-slate-500 font-medium flex items-center justify-center gap-1.5">
                            <UploadCloud className="w-3.5 h-3.5 text-indigo-500" />
                            クリックまたはファイルをドラッグ＆ドロップして追加添付
                          </p>
                        </div>
                      )}
                    </div>
                  ) : (
                    !isUploading && !isIcal && (
                      <div
                        onClick={() => !isUploading && fileInputRef.current?.click()}
                        className="py-2 px-3 border border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-xl text-center cursor-pointer transition-all bg-slate-50/50 flex items-center justify-center gap-2"
                      >
                        <UploadCloud className="w-4 h-4 text-indigo-500 shrink-0" />
                        <span className="text-xs text-slate-600 font-bold">
                          ファイルを添付
                        </span>
                        <span className="text-[11px] text-slate-400 font-medium">
                          (クリックまたはドラッグ＆ドロップ)
                        </span>
                      </div>
                    )
                  )}
                </>
              )}
            </div>
          </div>

          <div className="relative">
            <label className="block text-xs font-bold text-slate-700 mb-1">内容</label>
            <UrlPastePopup
              prompt={memoPasteHandler.pastePrompt}
              onInsertCard={memoPasteHandler.handleInsertCard}
              onKeepPlain={memoPasteHandler.handleKeepPlain}
              onClose={memoPasteHandler.closePrompt}
              positionClass="bottom-full mb-2 left-0"
            />
            <textarea
              readOnly={isIcal}
              value={memo}
              onChange={e => setMemo(e.target.value)}
              onPaste={memoPasteHandler.handlePaste}
              className={`w-full px-3 py-2 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors resize-none h-16 sm:h-20 text-xs ${
                isIcal ? 'bg-slate-100 text-slate-500 cursor-not-allowed' : 'bg-slate-50 focus:bg-white'
              }`}
              placeholder="詳細な内容... (URLを入力するとカードまたはリンクを選択できます)"
            ></textarea>
          </div>

          <div className="flex items-center justify-between pt-3.5 border-t border-slate-100">
            <div className="flex items-center gap-2">
              {currentEditingEvent && (
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={handleCopyAndAdd}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors shadow-2xs disabled:opacity-50 cursor-pointer"
                  title="この予定をコピーして新規登録画面にします"
                >
                  <Copy className="w-3.5 h-3.5 text-indigo-600" />
                  <span>コピーして追加</span>
                </button>
              )}

              {currentEditingEvent && onDelete && !isIcal && (
                <button
                  type="button"
                  disabled={isUploading}
                  onClick={handleDeleteClick}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors disabled:opacity-50 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  削除
                </button>
              )}
            </div>

            <div className="flex justify-end gap-2">
              <button type="button" disabled={isUploading} onClick={handleModalClose} className="px-3.5 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors disabled:opacity-50 cursor-pointer">キャンセル</button>
              {isIcal ? (
                <button
                  type="button"
                  disabled
                  className="px-4 py-2 text-xs font-bold text-slate-400 bg-slate-100 border border-slate-200 rounded-lg cursor-not-allowed flex items-center gap-1.5"
                >
                  外部予定 (編集不可)
                </button>
              ) : (
                <button type="submit" disabled={isUploading} className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm disabled:opacity-50 flex items-center gap-1.5 cursor-pointer">
                  {isUploading && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  {isUploading ? '処理中...' : (currentEditingEvent ? '更新する' : '保存する')}
                </button>
              )}
            </div>
          </div>
        </form>
      </div>

      <FilePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        file={previewFile}
      />

      {/* 定期予定の変更・削除確認ダイアログ */}
      <RecurrenceActionModal
        isOpen={actionModalState.isOpen}
        mode={actionModalState.mode}
        instanceDate={editingEvent?.instanceDate || (editingEvent?.start ? extractLocalDateStr(editingEvent.start) : undefined)}
        onClose={() => setActionModalState({ isOpen: false, mode: 'edit' })}
        onConfirm={handleConfirmRecurrenceAction}
      />

      {/* 現場選択モーダルポップアップ */}
      {isSiteSelectorOpen && (
        <div 
          onClick={() => setIsSiteSelectorOpen(false)}
          className="fixed inset-0 bg-slate-900/60 flex items-center justify-center z-70 p-3 sm:p-4 backdrop-blur-xs"
        >
          <div 
            onClick={e => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] animate-in fade-in zoom-in-95 duration-150"
          >
            {/* ヘッダー */}
            <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <HardHat className="w-4 h-4 text-amber-600" />
                <h3 className="text-sm font-bold text-slate-800">現場を選択</h3>
                <span className="text-xs text-slate-500">（全{internalSites.length}件）</span>
              </div>
              <button
                type="button"
                onClick={() => setIsSiteSelectorOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-600 rounded-lg cursor-pointer transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 検索入力 & 状態フィルター */}
            <div className="p-3 border-b border-slate-100 space-y-2 bg-white">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={siteSearchQuery}
                  onChange={e => setSiteSearchQuery(e.target.value)}
                  placeholder="現場コード・現場名・住所・元請で検索..."
                  className="w-full pl-9 pr-8 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  autoFocus
                />
                {siteSearchQuery && (
                  <button
                    type="button"
                    onClick={() => setSiteSearchQuery('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>

              {/* 状態フィルタータブ */}
              <div className="flex items-center gap-1.5 text-[11px] font-bold overflow-x-auto pb-0.5">
                <button
                  type="button"
                  onClick={() => setSiteFilterStatus('not_started')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer shrink-0 flex items-center gap-1 ${
                    siteFilterStatus === 'not_started'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span>
                  未着手 ({internalSites.filter(s => s.status === 'not_started').length})
                </button>

                <button
                  type="button"
                  onClick={() => setSiteFilterStatus('in_progress')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer shrink-0 flex items-center gap-1 ${
                    siteFilterStatus === 'in_progress'
                      ? 'bg-blue-600 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-blue-400"></span>
                  進行中 ({internalSites.filter(s => s.status === 'in_progress').length})
                </button>

                <button
                  type="button"
                  onClick={() => setSiteFilterStatus('all')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer shrink-0 ${
                    siteFilterStatus === 'all'
                      ? 'bg-slate-800 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  すべて ({internalSites.length})
                </button>

                <button
                  type="button"
                  onClick={() => setSiteFilterStatus('other')}
                  className={`px-2.5 py-1 rounded-md transition cursor-pointer shrink-0 ${
                    siteFilterStatus === 'other'
                      ? 'bg-slate-700 text-white shadow-2xs'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  完了・他 ({internalSites.filter(s => s.status === 'completed' || s.status === 'on_hold').length})
                </button>
              </div>
            </div>

            {/* 現場リスト */}
            <div className="flex-1 overflow-y-auto p-3 space-y-1.5">
              {filteredSites.length === 0 ? (
                <div className="py-10 text-center text-xs text-slate-400">
                  該当する現場が見つかりません。
                </div>
              ) : (
                filteredSites.map(site => {
                  const isSelected = selectedSiteId === site.id;
                  return (
                    <div
                      key={site.id}
                      onClick={() => handleSelectSite(site)}
                      className={`p-2.5 rounded-xl cursor-pointer transition border flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'bg-amber-50 border-amber-300 shadow-2xs'
                          : 'bg-white hover:bg-slate-50 border-slate-200/80 hover:border-slate-300'
                      }`}
                    >
                      <div className="min-w-0 space-y-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] font-black bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded border border-slate-200">
                            {site.siteCode}
                          </span>
                          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${
                            site.status === 'not_started'
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-300'
                              : site.status === 'in_progress'
                              ? 'bg-blue-50 text-blue-700 border-blue-300'
                              : 'bg-slate-50 text-slate-700 border-slate-300'
                          }`}>
                            {site.status === 'not_started' ? '未着手' : site.status === 'in_progress' ? '進行中' : '完了・保留'}
                          </span>
                          <strong className="text-xs font-bold text-slate-900 truncate">
                            {site.siteName}
                          </strong>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
                          {site.customerName && (
                            <span>元請: {site.customerName}</span>
                          )}
                          {site.egCount !== undefined && site.egCount > 0 && (
                            <span>EG台数: {site.egCount}台</span>
                          )}
                          {site.address && (
                            <span className="truncate max-w-[240px]">📍 {site.address}</span>
                          )}
                        </div>
                      </div>

                      <div className="shrink-0 flex items-center gap-1">
                        {isSelected ? (
                          <span className="flex items-center gap-1 text-emerald-700 bg-emerald-50 font-bold px-2 py-1 rounded-md text-[11px] border border-emerald-200">
                            <Check className="w-3.5 h-3.5" />
                            選択中
                          </span>
                        ) : (
                          <span className="text-slate-400 hover:text-amber-600 text-xs">
                            <ChevronRight className="w-4 h-4" />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* フッター */}
            <div className="p-2.5 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-[11px] text-slate-500 px-4">
              <span>現場を選択するとタイトルと乗り込み種別が自動連動します</span>
              <button
                type="button"
                onClick={() => setIsSiteSelectorOpen(false)}
                className="px-3 py-1 bg-white border border-slate-200 text-slate-700 rounded-md font-bold hover:bg-slate-100 cursor-pointer text-xs"
              >
                閉じる
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

