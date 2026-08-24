import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { CalendarEvent, EventType, User, OfficeMaster, DivisionMaster, Memo, RequirementType, MemoUserRecipientStatus } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { ChevronLeft, ChevronRight, List as ListIcon, Calendar as CalendarIcon, Plus, MapPin, Video, AlignLeft, RefreshCw, Clock, Link as LinkIcon, Loader2, Building2, Users, Paperclip, MessageSquare, Phone, X, Monitor, Maximize2, Minimize2, FileSpreadsheet, Share2, Check } from 'lucide-react';
import { EventModal } from './EventModal';
import { GlobalEventDetailModal } from './GlobalEventDetailModal';
import { renderWithClickableLinks } from '../utils/linkify';
import { renderContentWithLinks } from '../utils/renderContentWithLinks';
import { UrlPastePopup, useUrlPasteHandler } from './common/UrlPastePopup';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import { getLocalDateStr, addMinutesToLocalDatetime } from '../utils/dateUtils';
import { triggerPushNotification } from '../utils/pushNotifications';
import { expandRecurringEvents } from '../utils/recurrenceUtils';
import { RecurrenceActionScope } from './RecurrenceActionModal';
import { buildAppUrl, updateBrowserUrl } from '../utils/urlParams';

interface CalendarProps {
  events: CalendarEvent[];
  onAddEvent: (event: Omit<CalendarEvent, 'id'>) => void;
  onUpdateEvent?: (event: CalendarEvent, scope?: RecurrenceActionScope, originalInstanceDate?: string) => void;
  onDeleteEvent?: (eventId: string, scope?: RecurrenceActionScope, instanceDate?: string) => void;
  currentUser?: User;
  allUsers?: User[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  initialEventId?: string;
  initialOffice?: string;
  initialDivision?: string;
  initialMode?: 'personal' | 'team';
  initialView?: ViewMode;
  initialDate?: string;
  initialTypeFilter?: string;
  memos?: Memo[];
  onUpdateMemos?: (updatedMemos: Memo[]) => void;
  onRefetchEvents?: () => void;
  onNavigateToInspectionScheduler?: () => void;
}

type ViewMode = 'month' | 'week' | 'day' | 'list';

const typeStyles: Record<EventType, string> = {
  personal: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100',
  construction: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-100',
  inspection: 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100',
  replacement: 'bg-cyan-50 text-cyan-700 border-cyan-200 hover:bg-cyan-100',
  repair: 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100',
  visitor: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-100',
  business_trip: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-100'
};

const typeLabels: Record<EventType, string> = {
  personal: '個人',
  construction: '工事',
  inspection: '点検',
  replacement: '取替',
  repair: '修理',
  visitor: '来客',
  business_trip: '出張'
};

export function Calendar({
  events,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  currentUser,
  allUsers,
  offices = [],
  divisions = [],
  initialEventId,
  initialOffice,
  initialDivision,
  initialMode,
  initialView,
  initialDate,
  initialTypeFilter,
  memos = [],
  onUpdateMemos,
  onRefetchEvents,
  onNavigateToInspectionScheduler,
}: CalendarProps) {
  const [view, setView] = useState<ViewMode>(() => initialView || 'month');
  const [currentDate, setCurrentDate] = useState<Date>(() => {
    if (initialDate) {
      if (initialDate.toLowerCase() === 'today') return new Date();
      const d = new Date(initialDate.includes('T') ? initialDate : `${initialDate}T00:00:00`);
      if (!isNaN(d.getTime())) return d;
    }
    return new Date();
  });

  // デジタルサイネージモード関連の状態
  const [isSignageMode, setIsSignageMode] = useState<boolean>(false);
  const [liveClock, setLiveClock] = useState<Date>(new Date());
  const [lastRefetchedAt, setLastRefetchedAt] = useState<Date>(new Date());
  const [countdown, setCountdown] = useState<number>(30);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);
  
  // 拠点・部署のプルダウンフィルター状態（初期値は指定パラメータまたはログインユーザーの所属拠点・所属部署）
  const [selectedOffice, setSelectedOffice] = useState<string>(() => initialOffice || currentUser?.office || '全社');
  const [selectedDivision, setSelectedDivision] = useState<string>(() => initialDivision || currentUser?.division || '全部署');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>(() => initialTypeFilter || 'all');

  // currentUserの所属拠点・所属部署の初期反映（initialOffice/initialDivisionがない場合のみ）
  const userInitRef = React.useRef(false);
  useEffect(() => {
    if (currentUser && !userInitRef.current) {
      if (!initialOffice && currentUser.office) {
        setSelectedOffice(currentUser.office);
      }
      if (!initialDivision && currentUser.division) {
        setSelectedDivision(currentUser.division);
      }
      userInitRef.current = true;
    }
  }, [currentUser, initialOffice, initialDivision]);

  // カレンダーモード：'personal' (個人表示) or 'team' (チーム表示)
  const [calendarMode, setCalendarMode] = useState<'personal' | 'team'>(() => initialMode || 'personal');

  // initialPropsの動的変更を反映
  useEffect(() => {
    if (initialView) setView(initialView);
  }, [initialView]);

  useEffect(() => {
    if (initialMode) setCalendarMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    if (initialOffice) setSelectedOffice(initialOffice);
  }, [initialOffice]);

  useEffect(() => {
    if (initialDivision) setSelectedDivision(initialDivision);
  }, [initialDivision]);

  useEffect(() => {
    if (initialTypeFilter) setSelectedTypeFilter(initialTypeFilter);
  }, [initialTypeFilter]);

  useEffect(() => {
    if (initialDate) {
      if (initialDate.toLowerCase() === 'today') {
        setCurrentDate(new Date());
      } else {
        const d = new Date(initialDate.includes('T') ? initialDate : `${initialDate}T00:00:00`);
        if (!isNaN(d.getTime())) setCurrentDate(d);
      }
    }
  }, [initialDate]);

  // フィルター変更時にURLクエリパラメータを自動更新（ブラウザのアドレスバーに反映・リロード不要）
  useEffect(() => {
    const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
    updateBrowserUrl({
      tab: 'calendar',
      office: selectedOffice,
      division: selectedDivision,
      mode: calendarMode,
      view: view,
      date: dateStr,
      type: selectedTypeFilter !== 'all' ? selectedTypeFilter : undefined,
    });
  }, [selectedOffice, selectedDivision, calendarMode, view, currentDate, selectedTypeFilter]);

  // チーム・日表示以外に変更されたらサイネージモードを自動解除
  useEffect(() => {
    if (calendarMode !== 'team' || view !== 'day') {
      if (isSignageMode) {
        setIsSignageMode(false);
      }
    }
  }, [calendarMode, view, isSignageMode]);

  // サイネージモード作動中のタイマー（1秒ごとの時計・カウントダウン & 30秒ごとの自動データ更新）
  useEffect(() => {
    if (!isSignageMode) return;

    const timerId = setInterval(() => {
      setLiveClock(new Date());
      setCountdown(prev => {
        if (prev <= 1) {
          if (onRefetchEvents) {
            onRefetchEvents();
            setLastRefetchedAt(new Date());
          }
          return 30;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timerId);
  }, [isSignageMode, onRefetchEvents]);

  // サイネージモード切り替えハンドラー
  const handleToggleSignageMode = (enable: boolean) => {
    setIsSignageMode(enable);
    if (enable) {
      if (onRefetchEvents) {
        onRefetchEvents();
        setLastRefetchedAt(new Date());
      }
      setCountdown(30);
      try {
        if (document.documentElement.requestFullscreen) {
          document.documentElement.requestFullscreen().catch(() => {});
        }
      } catch (_) {}
    } else {
      try {
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      } catch (_) {}
    }
  };

  // ブラウザのEscキー等によるフルスクリーン解除の監視
  useEffect(() => {
    const handleFsChange = () => {
      if (!document.fullscreenElement && isSignageMode) {
        setIsSignageMode(false);
      }
    };
    document.addEventListener('fullscreenchange', handleFsChange);
    return () => document.removeEventListener('fullscreenchange', handleFsChange);
  }, [isSignageMode]);

  // 新規伝言メモ追加モーダルの状態
  const [isMemoModalOpen, setIsMemoModalOpen] = useState(false);
  const [memoTargetUser, setMemoTargetUser] = useState<User | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });

  // EventModalの初期参加者
  const [preselectedAttendees, setPreselectedAttendees] = useState<User[] | undefined>(undefined);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedDetailEvent, setSelectedDetailEvent] = useState<CalendarEvent | null>(null);
  const [isCopyMode, setIsCopyMode] = useState<boolean>(false);
  const [selectedInitialDate, setSelectedInitialDate] = useState<string | undefined>(undefined);
  const [selectedEndDate, setSelectedEndDate] = useState<string | undefined>(undefined);
  const [selectedIsAllDay, setSelectedIsAllDay] = useState<boolean | undefined>(undefined);

  // マウスドラッグによる複数日範囲選択状態
  const [selectionStart, setSelectionStart] = useState<string | null>(null);
  const [selectionEnd, setSelectionEnd] = useState<string | null>(null);
  const [isSelectingRange, setIsSelectingRange] = useState<boolean>(false);
  const [selectionAttendees, setSelectionAttendees] = useState<User[] | undefined>(undefined);
  const [selectionMemberId, setSelectionMemberId] = useState<string | null>(null);

  // 伝言メモ用の入力状態
  const [fromName, setFromName] = useState('');
  const [fromCompany, setFromCompany] = useState('');
  const [fromPhone, setFromPhone] = useState('');
  const [requirementType, setRequirementType] = useState<RequirementType>('phone_called');
  const [customRequirementText, setCustomRequirementText] = useState('');
  const [content, setContent] = useState('');
  const memoContentPasteHandler = useUrlPasteHandler(content, setContent);

  // チームタイムラインの各時間枠（実測X軸座標・幅）の管理
  const [hourLayouts, setHourLayouts] = useState<Record<number, { left: number; width: number }>>({});
  const [timelineTotalWidth, setTimelineTotalWidth] = useState<number>(0);
  const hoursHeaderRef = React.useRef<HTMLDivElement>(null);

  const measureHourLayouts = useCallback(() => {
    if (!hoursHeaderRef.current) return;
    const container = hoursHeaderRef.current;
    const containerRect = container.getBoundingClientRect();
    const containerLeft = containerRect.left;
    const totalW = container.clientWidth || container.scrollWidth;

    const elements = container.querySelectorAll<HTMLElement>('[data-hour]');
    const layouts: Record<number, { left: number; width: number }> = {};

    elements.forEach((el) => {
      const hStr = el.getAttribute('data-hour');
      if (hStr !== null) {
        const h = Number(hStr);
        const elRect = el.getBoundingClientRect();
        layouts[h] = {
          left: Math.round((elRect.left - containerLeft) * 10) / 10,
          width: Math.round(elRect.width * 10) / 10,
        };
      }
    });

    if (Object.keys(layouts).length > 0) {
      setHourLayouts(layouts);
      setTimelineTotalWidth(totalW);
    }
  }, []);

  useEffect(() => {
    measureHourLayouts();
    if (!hoursHeaderRef.current) return;

    const ro = new ResizeObserver(() => {
      measureHourLayouts();
    });
    ro.observe(hoursHeaderRef.current);

    window.addEventListener('resize', measureHourLayouts);
    return () => {
      ro.disconnect();
      window.removeEventListener('resize', measureHourLayouts);
    };
  }, [measureHourLayouts, currentDate, events, calendarMode, view, isSignageMode]);

  // レンダリング直後の追従測定
  useEffect(() => {
    const rafId = requestAnimationFrame(() => {
      measureHourLayouts();
    });
    return () => cancelAnimationFrame(rafId);
  }, [measureHourLayouts, currentDate, calendarMode, view, isSignageMode]);

  // Drag and drop state
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [draggedFromMemberId, setDraggedFromMemberId] = useState<string | null>(null);

  // リサイズ（ドラッグによる時間延長・短縮）状態
  const [resizingEvent, setResizingEvent] = useState<{
    event: CalendarEvent;
    direction: 'horizontal' | 'vertical';
    initialStartX: number;
    initialStartY: number;
    initialEndMs: number;
    currentEndMs: number;
    slotWidthPx?: number;
    slotHeightPx?: number;
    dateStr?: string;
  } | null>(null);

  // リサイズ操作中のマウス移動 & マウスアップのグローバルリスナー
  useEffect(() => {
    if (!resizingEvent) return;

    const handleMouseMove = (e: MouseEvent) => {
      const deltaX = e.clientX - resizingEvent.initialStartX;
      const deltaY = e.clientY - resizingEvent.initialStartY;
      const startMs = new Date(resizingEvent.event.start).getTime();

      let deltaMinutes = 0;
      if (resizingEvent.direction === 'horizontal') {
        const slotWidth = resizingEvent.slotWidthPx && resizingEvent.slotWidthPx > 0 ? resizingEvent.slotWidthPx : 100;
        // 1スロット(60分) あたりのピクセル幅から計算
        const rawMinutes = (deltaX / slotWidth) * 60;
        // 15分単位にスナップ
        deltaMinutes = Math.round(rawMinutes / 15) * 15;
      } else {
        const slotHeight = resizingEvent.slotHeightPx && resizingEvent.slotHeightPx > 0 ? resizingEvent.slotHeightPx : 50;
        // 1スロット(60分) あたりのピクセル高さから計算
        const rawMinutes = (deltaY / slotHeight) * 60;
        // 15分単位にスナップ
        deltaMinutes = Math.round(rawMinutes / 15) * 15;
      }

      // 新しい終了時間（ミリ秒）
      let newEndMs = resizingEvent.initialEndMs + deltaMinutes * 60 * 1000;
      // 最小所要時間は15分
      const minEndMs = startMs + 15 * 60 * 1000;
      if (newEndMs < minEndMs) {
        newEndMs = minEndMs;
      }

      setResizingEvent(prev => prev ? { ...prev, currentEndMs: newEndMs } : null);
    };

    const handleMouseUp = () => {
      if (resizingEvent && resizingEvent.currentEndMs !== resizingEvent.initialEndMs) {
        const newEndIso = new Date(resizingEvent.currentEndMs).toISOString();
        onUpdateEvent?.({
          ...resizingEvent.event,
          end: newEndIso,
        });
      }
      setResizingEvent(null);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [resizingEvent, onUpdateEvent]);

  const officeNames = useMemo(() => {
    const list = [
      ...offices.map(o => o.name),
      ...((allUsers || []).map(u => u.office).filter(Boolean) as string[]),
      ...(initialOffice ? [initialOffice] : []),
      ...(selectedOffice ? [selectedOffice] : []),
    ];
    return Array.from(new Set(list));
  }, [offices, allUsers, initialOffice, selectedOffice]);

  const divisionNames = useMemo(() => {
    const list = [
      ...divisions.map(d => d.name),
      ...((allUsers || []).map(u => u.division).filter(Boolean) as string[]),
      ...(initialDivision ? [initialDivision] : []),
      ...(selectedDivision ? [selectedDivision] : []),
    ];
    return Array.from(new Set(list));
  }, [divisions, allUsers, initialDivision, selectedDivision]);

  // 表示期間の前後を含む展開用日付範囲（前後3ヶ月）
  const viewRangeStart = new Date(currentDate.getFullYear(), currentDate.getMonth() - 2, 1);
  const viewRangeEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 3, 0);

  const expandedEvents = React.useMemo(() => {
    return expandRecurringEvents(events, viewRangeStart, viewRangeEnd);
  }, [events, currentDate]);

  const processedInitialEventIdRef = React.useRef<string | null>(null);

  useEffect(() => {
    if (initialEventId && processedInitialEventIdRef.current !== initialEventId) {
      let targetEv = expandedEvents.find(e => e.id === initialEventId);
      if (!targetEv) {
        const matchingInstances = expandedEvents.filter(e => e.recurrenceParentId === initialEventId || e.id === initialEventId);
        if (matchingInstances.length > 0) {
          const nowMs = Date.now();
          matchingInstances.sort((a, b) => {
            const diffA = Math.abs(new Date(a.start).getTime() - nowMs);
            const diffB = Math.abs(new Date(b.start).getTime() - nowMs);
            return diffA - diffB;
          });
          targetEv = matchingInstances[0];
        }
      }
      if (targetEv) {
        processedInitialEventIdRef.current = initialEventId;
        setSelectedDetailEvent(targetEv);
        if (targetEv.start) {
          setCurrentDate(new Date(targetEv.start));
        }
      }
    }
  }, [initialEventId, expandedEvents]);
  
  // イベントのフィルタリング処理
  const filteredEvents = expandedEvents.filter(e => {
    if (selectedTypeFilter !== 'all' && e.type !== selectedTypeFilter) {
      return false;
    }

    // 自分のカレンダー表示（personal mode）の場合：自分が参加者に含まれる予定のみ表示
    if (calendarMode === 'personal' && currentUser) {
      const isAttendee = e.attendees ? e.attendees.some(a => {
        if (!a) return false;
        return a.id === currentUser.id ||
          String(a.id) === String(currentUser.id) ||
          a.name === currentUser.name ||
          (a.email && currentUser.email && a.email === currentUser.email);
      }) : false;
      if (!isAttendee) return false;
    }

    return true;
  });

  // チーム表示用の所属メンバー抽出
  const teamMembers = (allUsers || []).filter(u => {
    if (selectedOffice === '全社' || selectedOffice === '全拠点' || selectedDivision === '全部署') {
      return false;
    }
    return u.office === selectedOffice && u.division === selectedDivision;
  });

  const handleToggleMode = (mode: 'personal' | 'team') => {
    setCalendarMode(mode);
    if (mode === 'team') {
      let nextOffice = selectedOffice;
      if (selectedOffice === '全社' || selectedOffice === '全拠点') {
        const targetOffice = currentUser?.office || officeNames.find(o => o !== '全社' && o !== '全拠点') || officeNames[0] || '';
        if (targetOffice) {
          setSelectedOffice(targetOffice);
          nextOffice = targetOffice;
        }
      }
      let nextDivision = selectedDivision;
      if (selectedDivision === '全部署') {
        const targetDivision = currentUser?.division || divisionNames.find(d => d !== '全部署') || divisionNames[0] || '';
        if (targetDivision) {
          setSelectedDivision(targetDivision);
          nextDivision = targetDivision;
        }
      }
      
      if (view !== 'week' && view !== 'day') {
        setView('week');
      }
    }
  };

  const changeDate = (offset: number) => {
    const newDate = new Date(currentDate);
    if (view === 'month' || view === 'list') {
      newDate.setMonth(currentDate.getMonth() + offset);
    } else if (view === 'week') {
      newDate.setDate(currentDate.getDate() + offset * 7);
    } else if (view === 'day') {
      newDate.setDate(currentDate.getDate() + offset);
    }
    setCurrentDate(newDate);
  };

  const openAddModalWithDate = (
    dateStr?: string,
    initialAttendees?: User[],
    endDateStr?: string,
    isAllDay?: boolean
  ) => {
    setEditingEvent(null);
    setSelectedInitialDate(dateStr);
    let calculatedEnd = endDateStr;
    if (!calculatedEnd && dateStr && dateStr.includes('T')) {
      calculatedEnd = addMinutesToLocalDatetime(dateStr, 60);
    }
    setSelectedEndDate(calculatedEnd || dateStr);
    const isMultiDay = (dateStr && calculatedEnd && dateStr.split('T')[0] !== calculatedEnd.split('T')[0]);
    setSelectedIsAllDay(isAllDay !== undefined ? isAllDay : (isMultiDay ? true : false));
    setPreselectedAttendees(initialAttendees);
    setIsModalOpen(true);
  };

  const getSelectionRange = useCallback(() => {
    if (!selectionStart || !selectionEnd) return null;
    if (selectionStart <= selectionEnd) {
      return { start: selectionStart, end: selectionEnd };
    } else {
      return { start: selectionEnd, end: selectionStart };
    }
  }, [selectionStart, selectionEnd]);

  const isDateInSelectionRange = (dateStr: string, memberId?: string) => {
    const range = getSelectionRange();
    if (!range) return false;
    if (selectionMemberId) {
      if (memberId !== selectionMemberId) return false;
    }
    return dateStr >= range.start && dateStr <= range.end;
  };

  const isEventOccurringOnDate = (e: CalendarEvent, dateStr: string) => {
    const startStr = getLocalDateStr(e.start);
    const endStr = e.end ? getLocalDateStr(e.end) : startStr;
    return dateStr >= startStr && dateStr <= endStr;
  };

  const sortEvents = (eventsList: CalendarEvent[]) => {
    return [...eventsList].sort((a, b) => {
      const aStart = getLocalDateStr(a.start);
      const bStart = getLocalDateStr(b.start);
      const aEnd = a.end ? getLocalDateStr(a.end) : aStart;
      const bEnd = b.end ? getLocalDateStr(b.end) : bStart;

      const aIsMultiDay = aStart !== aEnd;
      const bIsMultiDay = bStart !== bEnd;

      if (aIsMultiDay && !bIsMultiDay) return -1;
      if (!aIsMultiDay && bIsMultiDay) return 1;

      if (aStart !== bStart) return aStart.localeCompare(bStart);

      const aDuration = new Date(aEnd).getTime() - new Date(aStart).getTime();
      const bDuration = new Date(bEnd).getTime() - new Date(bStart).getTime();
      if (aDuration !== bDuration) return bDuration - aDuration;

      if (a.isAllDay && !b.isAllDay) return -1;
      if (!a.isAllDay && b.isAllDay) return 1;

      return new Date(a.start).getTime() - new Date(b.start).getTime();
    });
  };

  const multiDayTypeStyles: Record<EventType, string> = {
    personal: 'bg-emerald-600 text-white border-emerald-700 hover:bg-emerald-700 shadow-2xs',
    construction: 'bg-amber-600 text-white border-amber-700 hover:bg-amber-700 shadow-2xs',
    inspection: 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700 shadow-2xs',
    replacement: 'bg-cyan-600 text-white border-cyan-700 hover:bg-cyan-700 shadow-2xs',
    repair: 'bg-rose-600 text-white border-rose-700 hover:bg-rose-700 shadow-2xs',
    visitor: 'bg-orange-600 text-white border-orange-700 hover:bg-orange-700 shadow-2xs',
    business_trip: 'bg-sky-600 text-white border-sky-700 hover:bg-sky-700 shadow-2xs'
  };

  const getEventStyle = (e: CalendarEvent, forceSolid = false) => {
    const startStr = getLocalDateStr(e.start);
    const endStr = e.end ? getLocalDateStr(e.end) : startStr;
    const isMultiDay = startStr !== endStr;
    if (forceSolid || e.isAllDay || isMultiDay) {
      return multiDayTypeStyles[e.type] || 'bg-indigo-600 text-white border-indigo-700 hover:bg-indigo-700';
    }
    return typeStyles[e.type];
  };

  const getMultiDayStyle = (e: CalendarEvent, cellDateStr: string, isMonth = false) => {
    const startStr = getLocalDateStr(e.start);
    const endStr = e.end ? getLocalDateStr(e.end) : startStr;

    if (startStr === endStr) {
      return {
        isMultiDay: false,
        containerClass: isMonth ? 'rounded-md shadow-2xs mx-1 px-1.5' : 'rounded-md shadow-2xs',
        showTitle: true,
      };
    }

    const isStartDay = cellDateStr === startStr;
    const isEndDay = cellDateStr === endStr;
    const cellDate = new Date(cellDateStr);
    const isWeekFirstDay = cellDate.getDay() === 0;

    if (isMonth) {
      if (isStartDay) {
        return {
          isMultiDay: true,
          containerClass: 'rounded-l-full rounded-r-none border-r-0 relative z-20 font-bold text-white shadow-xs ml-1 mr-0 pr-2 pl-2',
          showTitle: true,
        };
      } else if (isEndDay) {
        return {
          isMultiDay: true,
          containerClass: 'rounded-r-full rounded-l-none border-l-0 relative z-20 font-bold text-white shadow-xs mr-1 ml-0 pl-2 pr-2',
          showTitle: isWeekFirstDay,
        };
      } else {
        return {
          isMultiDay: true,
          containerClass: 'rounded-none border-x-0 relative z-20 font-bold text-white shadow-2xs mx-0 px-2',
          showTitle: isWeekFirstDay,
        };
      }
    }

    if (isStartDay) {
      return {
        isMultiDay: true,
        containerClass: 'rounded-l-full rounded-r-none border-r-0 relative z-20 font-bold text-white shadow-xs -mr-2.5 pr-3 ml-0.5',
        showTitle: true,
      };
    } else if (isEndDay) {
      return {
        isMultiDay: true,
        containerClass: 'rounded-r-full rounded-l-none border-l-0 relative z-20 font-bold text-white shadow-xs -ml-2.5 pl-3 mr-0.5',
        showTitle: isWeekFirstDay,
      };
    } else {
      return {
        isMultiDay: true,
        containerClass: 'rounded-none border-x-0 relative z-20 font-bold text-white shadow-2xs -mx-2.5 px-2.5',
        showTitle: isWeekFirstDay,
      };
    }
  };

  const handleCellMouseDown = (e: React.MouseEvent, dateStr: string, attendees?: User[]) => {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement).closest('[data-event-card="true"]')) return;
    setIsSelectingRange(true);
    setSelectionStart(dateStr);
    setSelectionEnd(dateStr);
    setSelectionAttendees(attendees);
    setSelectionMemberId(attendees && attendees.length > 0 ? attendees[0].id : null);
  };

  const handleCellMouseEnter = (dateStr: string) => {
    if (isSelectingRange) {
      setSelectionEnd(dateStr);
    }
  };

  useEffect(() => {
    const handleGlobalMouseUp = () => {
      if (isSelectingRange) {
        setIsSelectingRange(false);
        const range = getSelectionRange();
        if (range) {
          const isMultiDay = range.start !== range.end;
          openAddModalWithDate(range.start, selectionAttendees, range.end, isMultiDay);
        }
        setSelectionStart(null);
        setSelectionEnd(null);
        setSelectionAttendees(undefined);
        setSelectionMemberId(null);
      }
    };

    window.addEventListener('mouseup', handleGlobalMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleGlobalMouseUp);
    };
  }, [isSelectingRange, getSelectionRange, selectionAttendees]);

  const handleEventClick = (e: React.MouseEvent, event: CalendarEvent) => {
    e.stopPropagation();
    e.preventDefault();
    setSelectedDetailEvent(event);
  };

  const handleSaveEvent = (
    eventData: Omit<CalendarEvent, 'id'> | CalendarEvent,
    scope?: RecurrenceActionScope,
    originalInstanceDate?: string
  ) => {
    if ('id' in eventData && eventData.id) {
      onUpdateEvent?.(eventData as CalendarEvent, scope, originalInstanceDate);
    } else {
      onAddEvent(eventData as Omit<CalendarEvent, 'id'>);
    }
  };

  const handleCreateMemo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!memoTargetUser) return;
    if (!fromName.trim()) {
      setConfirmModal({
        isOpen: true,
        title: '入力エラー',
        message: '依頼者のお名前を入力してください。',
        type: 'warning',
        confirmText: '確認',
      });
      return;
    }
    if (!content.trim()) {
      setConfirmModal({
        isOpen: true,
        title: '入力エラー',
        message: '伝言の本文内容を入力してください。',
        type: 'warning',
        confirmText: '確認',
      });
      return;
    }

    const recipientStatus: MemoUserRecipientStatus = {
      userId: memoTargetUser.id,
      userName: memoTargetUser.name,
      avatarUrl: memoTargetUser.avatarUrl,
      department: memoTargetUser.department,
      office: memoTargetUser.office,
      division: memoTargetUser.division,
      isViewed: false,
      isHandled: false,
    };

    let reqText = '';
    if (requirementType === 'phone_called') reqText = '電話がありました';
    else if (requirementType === 'has_message') reqText = '伝言があります';
    else if (requirementType === 'call_again') reqText = '再度電話します（折り返し不要）';
    else if (requirementType === 'please_call_back') reqText = '折り返し連絡下さい';
    else reqText = customRequirementText || '伝言';

    const newMemo: Memo = {
      id: `memo-${Date.now()}`,
      fromName: fromName.trim(),
      fromCompany: fromCompany.trim() || undefined,
      fromPhone: fromPhone.trim() || undefined,
      toUsers: [memoTargetUser],
      toUser: memoTargetUser,
      requirementType,
      requirementText: reqText,
      content: content.trim(),
      status: 'unread',
      createdAt: new Date().toISOString(),
      createdByUser: currentUser,
      recipientStatuses: [recipientStatus],
    };

    if (onUpdateMemos) {
      onUpdateMemos([...memos, newMemo]);
    }

    if (memoTargetUser && memoTargetUser.id !== currentUser?.id) {
      triggerPushNotification({
        targetUserId: memoTargetUser.id,
        excludeUserId: currentUser?.id,
        title: `📞 伝言メモ: ${fromCompany ? `${fromCompany} ` : ''}${fromName}様`,
        body: `【${reqText}】${content ? ` ${content.slice(0, 40)}` : ''}`,
        url: `/?tab=memo&memoId=${newMemo.id}`,
        tag: `memo-${newMemo.id}`
      });
    }

    // Reset and close
    setFromName('');
    setFromCompany('');
    setFromPhone('');
    setRequirementType('phone_called');
    setCustomRequirementText('');
    setContent('');
    setIsMemoModalOpen(false);
    setMemoTargetUser(null);
  };

  // チーム表示用の週の日付算出
  const getWeekDates = (date: Date) => {
    const current = new Date(date);
    const day = current.getDay();
    const sunday = new Date(current);
    sunday.setDate(current.getDate() - day);
    
    const dates: Date[] = [];
    for (let i = 0; i < 7; i++) {
      const next = new Date(sunday);
      next.setDate(sunday.getDate() + i);
      dates.push(next);
    }
    return dates;
  };

  // チーム週表示のレンダリング
  const renderTeamWeekView = () => {
    const dates = getWeekDates(currentDate);
    const dayNames = ['日', '月', '火', '水', '木', '金', '土'];

    // 各曜日にチームメンバーの予定があるか確認
    const dayHasEvents = dates.map(date => {
      const dateStr = getLocalDateStr(date);
      return filteredEvents.some(e => {
        if (!isEventOccurringOnDate(e, dateStr)) return false;
        return e.attendees?.some(a => a && teamMembers.some(m => m.id === a.id || String(m.id) === String(a.id) || m.name === a.name));
      });
    });

    // 縦軸を全行で完全一致させるグリッドスタイル
    // - メンバー列: 140px〜180px
    // - 平日 (月〜金) または 予定のある土日: minmax(110px, 1fr) (均等幅を維持)
    // - 予定のない土日のみ: minmax(46px, 0.45fr) (縮める)
    const memberCol = isSignageMode ? '160px' : 'minmax(140px, 180px)';
    const teamWeekGridStyle = {
      display: 'grid',
      gridTemplateColumns: `${memberCol} ${dates.map((date, idx) => {
        const isWeekend = date.getDay() === 0 || date.getDay() === 6;
        const hasEv = dayHasEvents[idx];
        if (isWeekend && !hasEv) {
          return 'minmax(46px, 0.45fr)';
        }
        return 'minmax(110px, 1fr)';
      }).join(' ')}`,
    };
    
    return (
      <div className="min-w-full h-full overflow-auto divide-y divide-slate-200 bg-white flex flex-col">
        {/* Table Header */}
        <div
          style={teamWeekGridStyle}
          className="bg-slate-50 text-slate-700 text-xs font-bold shrink-0 sticky top-0 z-20 border-b border-slate-200 shadow-2xs"
        >
          <div className="p-2 sm:p-3 border-r border-slate-200 flex items-center justify-center sticky left-0 z-30 bg-slate-50 text-[11px] sm:text-xs">
            メンバー
          </div>
          {dates.map((date, idx) => {
            const isTodayDate = isSameDay(date, new Date());
            const isWeekend = date.getDay() === 0 || date.getDay() === 6;
            const hasEv = dayHasEvents[idx];
            const isShrunk = isWeekend && !hasEv;
            const weekendColor = date.getDay() === 0 ? 'text-rose-600' : date.getDay() === 6 ? 'text-blue-600' : 'text-slate-700';
            
            return (
              <div 
                key={idx} 
                className={`p-2 sm:p-3 text-center border-r border-slate-200 last:border-r-0 flex flex-col items-center justify-center gap-0.5 transition-colors ${
                  isTodayDate
                    ? 'bg-indigo-50/70 border-b-2 border-b-indigo-500'
                    : isShrunk
                    ? 'bg-slate-100/60 text-slate-400'
                    : ''
                }`}
                title={isShrunk ? `${date.getMonth() + 1}/${date.getDate()} (${dayNames[date.getDay()]}) - 予定なし` : undefined}
              >
                <span className={`${isShrunk ? 'text-slate-400 font-medium' : weekendColor} font-extrabold text-[11px] sm:text-xs truncate`}>
                  {date.getMonth() + 1}/{date.getDate()} ({dayNames[date.getDay()]})
                </span>
                {isTodayDate && <span className="text-[9px] sm:text-[10px] bg-indigo-600 text-white font-semibold px-1 sm:px-1.5 py-0.5 rounded-full scale-90">今日</span>}
              </div>
            );
          })}
        </div>

        {/* Table Body */}
        <div className="flex-1 divide-y divide-slate-200 bg-white">
          {teamMembers.map((member) => (
            <div
              key={member.id}
              style={teamWeekGridStyle}
              className="min-h-[95px] sm:min-h-[110px] group hover:bg-slate-50/30 transition-colors"
            >
              {/* Member Column */}
              <div className="p-2 sm:p-3 border-r border-slate-200 bg-white flex flex-col justify-between shrink-0 sticky left-0 z-10 shadow-xs sm:shadow-none">
                <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                  <img
                    src={getAvatarUrl(member.avatarUrl)}
                    alt={member.name}
                    className="w-6 h-6 sm:w-8 sm:h-8 rounded-full border border-slate-200 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="font-extrabold text-[11px] sm:text-xs text-slate-800 truncate">{member.name}</p>
                    <p className="text-[9px] sm:text-[10px] text-slate-500 font-medium mt-0.5 truncate">{member.office}・{member.division}</p>
                  </div>
                </div>

                {!isSignageMode && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setMemoTargetUser(member);
                      setIsMemoModalOpen(true);
                    }}
                    className="mt-1.5 sm:mt-2 w-full flex items-center justify-center gap-1 sm:gap-1.5 px-1.5 sm:px-2 py-1 sm:py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 text-[9px] sm:text-[10px] font-extrabold rounded-lg border border-slate-200 transition-all cursor-pointer shadow-2xs"
                  >
                    <Phone className="w-2.5 h-2.5 sm:w-3 sm:h-3 text-indigo-500 shrink-0" />
                    <span className="truncate">伝言メモ</span>
                  </button>
                )}
              </div>

              {/* Day Columns */}
              {dates.map((date, idx) => {
                const dateStr = getLocalDateStr(date);
                const isWeekend = date.getDay() === 0 || date.getDay() === 6;
                const hasEv = dayHasEvents[idx];
                const isShrunk = isWeekend && !hasEv;

                const dayEvents = filteredEvents.filter(e => {
                  return isEventOccurringOnDate(e, dateStr) && e.attendees?.some(a => a && (a.id === member.id || String(a.id) === String(member.id) || a.name === member.name));
                });

                const cellKey = `team-week-${member.id}-${idx}`;
                const isDragOver = dragOverKey === cellKey;
                const isSelectedRange = isDateInSelectionRange(dateStr, member.id);

                return (
                  <div
                    key={idx}
                    onMouseDown={(e) => handleCellMouseDown(e, dateStr, [member])}
                    onMouseEnter={() => handleCellMouseEnter(dateStr)}
                    onDragOver={(e) => handleDragOver(e, cellKey)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dateStr, undefined, member.id)}
                    className={`p-1.5 sm:p-2 border-r border-slate-200 last:border-r-0 flex flex-col gap-1 sm:gap-1.5 min-h-[95px] sm:min-h-[115px] cursor-pointer relative transition-colors select-none ${
                      isSelectedRange
                        ? 'bg-indigo-100/90 ring-2 ring-indigo-500/70 z-10'
                        : isDragOver
                        ? 'bg-indigo-100/70 ring-2 ring-indigo-400'
                        : isShrunk
                        ? 'bg-slate-50/40 hover:bg-indigo-50/20'
                        : 'hover:bg-indigo-50/20'
                    }`}
                  >
                    {dayEvents.length > 0 ? (
                      sortEvents(dayEvents).map(e => {
                        const multiProps = getMultiDayStyle(e, dateStr);
                        return (
                          <div
                            key={e.id}
                            data-event-card="true"
                            draggable
                            onDragStart={(eDrag) => handleDragStart(eDrag, e.id, member.id)}
                            onMouseDown={(evt) => evt.stopPropagation()}
                            onClick={(evt) => handleEventClick(evt, e)}
                            className={`border text-[9px] sm:text-[10px] font-bold leading-snug transition-all hover:shadow-xs shadow-2xs truncate select-none ${getEventStyle(e)} ${multiProps.containerClass} ${
                              multiProps.isMultiDay ? 'py-0.5 px-1 sm:px-1.5 flex items-center h-5 sm:h-5.5' : 'p-1 sm:p-1.5'
                            }`}
                            title={`${e.title} (${formatEventTime(e)})`}
                          >
                            {multiProps.isMultiDay ? (
                              <span className="truncate font-bold tracking-tight">
                                {multiProps.showTitle ? e.title : '\u00A0'}
                              </span>
                            ) : (
                              <>
                                <div className="flex items-center gap-1 truncate text-[8px] sm:text-[9px]">
                                  <Clock className="w-2 h-2 sm:w-2.5 sm:h-2.5 shrink-0" />
                                  <span>{formatEventTime(e)}</span>
                                </div>
                                <div className="mt-0.5 truncate font-extrabold">
                                  {e.title}
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-slate-300 text-[9px] sm:text-[10px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity">
                        +
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    );
  };

  // チーム日表示のレンダリング
  const renderTeamDayView = () => {
    const dateStr = getLocalDateStr(currentDate);

    // 終了時間のないスケジュールも必ず開始+60分として扱うヘルパー
    const getEventSpan = (e: CalendarEvent) => {
      const sDate = new Date(e.start);
      let eDate = e.end ? new Date(e.end) : new Date(sDate.getTime() + 60 * 60 * 1000);
      if (isNaN(eDate.getTime()) || eDate.getTime() <= sDate.getTime()) {
        eDate = new Date(sDate.getTime() + 60 * 60 * 1000);
      }
      return { sDate, eDate };
    };

    // 当日のチームメンバー関連イベント
    const dayRelevantEvents = filteredEvents.filter(e => {
      const eStart = new Date(e.start);
      if (!isSameDay(eStart, currentDate) && !isEventOccurringOnDate(e, dateStr)) return false;
      return e.attendees?.some(a => a && teamMembers.some(m => m.id === a.id || String(m.id) === String(a.id) || m.name === a.name));
    });

    // 1. 時間範囲のフレキシブル算出 (基本は 8:00〜20:00、時間外の予定があれば自動拡張)
    let minHour = 8;
    let maxHour = 20;

    dayRelevantEvents.forEach(e => {
      if (e.isAllDay) return;
      const { sDate, eDate } = getEventSpan(e);
      if (!isNaN(sDate.getTime()) && sDate.getHours() < minHour) {
        minHour = Math.max(0, sDate.getHours());
      }
      if (!isNaN(eDate.getTime())) {
        let endH = eDate.getHours();
        if (eDate.getMinutes() > 0) endH = Math.min(23, endH);
        if (endH > maxHour) maxHour = Math.min(23, endH);
      }
    });

    const hours = Array.from({ length: maxHour - minHour + 1 }, (_, i) => i + minHour);

    // 2. チームの誰かが予定を持っている時間帯（Active Hours）を特定
    const activeHoursSet = new Set<number>();
    dayRelevantEvents.forEach(e => {
      if (e.isAllDay) return;
      const { sDate, eDate } = getEventSpan(e);
      const sH = sDate.getHours();
      let eH = eDate.getHours();
      const eMin = eDate.getMinutes();
      if (eMin === 0 && eH > sH) {
        eH = eH - 1;
      }
      for (let h = sH; h <= eH; h++) {
        if (h >= minHour && h <= maxHour) {
          activeHoursSet.add(h);
        }
      }
    });

    // 3. グリッド列のテンプレート設定（予定あり時間は見やすく広く、予定なし時間はスリムに伸縮）
    const memberColWidth = isSignageMode ? '160px' : '170px';
    const hoursGridStyle: React.CSSProperties = {
      display: 'grid',
      gridTemplateColumns: hours
        .map(h => (activeHoursSet.has(h) ? 'minmax(110px, 1.8fr)' : 'minmax(46px, 0.45fr)'))
        .join(' '),
    };

    // 4. 実測された各時間列のX軸座標（px）から正確なピクセル位置を取得
    const getXPositionFromDate = (date: Date): number => {
      const h = date.getHours();
      const m = date.getMinutes();
      const s = date.getSeconds();

      if (h < minHour) return 0;
      if (h > maxHour) {
        const lastLayout = hourLayouts[maxHour];
        return lastLayout ? lastLayout.left + lastLayout.width : (timelineTotalWidth || 1000);
      }

      const layout = hourLayouts[h];
      if (layout && layout.width > 0) {
        const frac = (m + s / 60) / 60;
        return layout.left + frac * layout.width;
      }

      // フォールバック計算
      const totalSlots = hours.length;
      const fallbackTotal = timelineTotalWidth > 0 ? timelineTotalWidth : 1000;
      const slotWidth = fallbackTotal / totalSlots;
      return (h - minHour + m / 60) * slotWidth;
    };

    return (
      <div className="min-w-full h-full overflow-auto divide-y divide-slate-200 bg-white flex flex-col">
        {/* Table Header */}
        <div className="flex bg-slate-50 text-slate-700 text-xs font-bold shrink-0 sticky top-0 z-30 border-b border-slate-200 shadow-2xs">
          <div
            style={{ width: memberColWidth, minWidth: memberColWidth }}
            className="p-2 sm:p-2.5 border-r border-slate-200 flex items-center justify-center sticky left-0 z-40 bg-slate-50 text-[11px] sm:text-xs shrink-0"
          >
            メンバー
          </div>
          <div ref={hoursHeaderRef} style={hoursGridStyle} className="flex-1">
            {hours.map((hour) => {
              const isActive = activeHoursSet.has(hour);
              return (
                <div
                  key={hour}
                  data-hour={hour}
                  className={`p-2 sm:p-2.5 text-center border-r border-slate-200 last:border-r-0 font-extrabold flex flex-col items-center justify-center transition-colors ${
                    isActive
                      ? 'bg-slate-50 text-slate-800 text-[11px] sm:text-xs'
                      : 'bg-slate-100/60 text-slate-400 text-[10px]'
                  }`}
                  title={isActive ? `${hour}:00 (予定あり)` : `${hour}:00 (チーム予定なし)`}
                >
                  <span>{String(hour).padStart(2, '0')}:00</span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Table Body */}
        <div className="flex-1 divide-y divide-slate-200 bg-white">
          {teamMembers.map((member) => {
            // 当該メンバーの当日イベント一覧
            const memberDayEvents = filteredEvents.filter(e => {
              const eStart = new Date(e.start);
              if (!isSameDay(eStart, currentDate) && !isEventOccurringOnDate(e, dateStr)) return false;
              return e.attendees?.some(a => a && (a.id === member.id || String(a.id) === String(member.id) || a.name === member.name));
            });

            // 予定の実測X軸絶対座標・レーン配置計算
            const sortedEvents = sortEvents(memberDayEvents);
            const placedEvents: { event: CalendarEvent; lane: number; leftPx: number; widthPx: number }[] = [];
            const laneEndPxList: number[] = [];

            sortedEvents.forEach((e) => {
              let leftPx = 0;
              let widthPx = timelineTotalWidth || 1000;
              if (!e.isAllDay) {
                const { sDate, eDate } = getEventSpan(e);
                
                // 当日の範囲内にクランプ
                const isStartBeforeMin = (sDate.getHours() + sDate.getMinutes() / 60) < minHour || !isSameDay(sDate, currentDate);
                const endHourFloat = eDate.getHours() + eDate.getMinutes() / 60;
                const isEndAfterMax = endHourFloat >= (maxHour + 1) || !isSameDay(eDate, currentDate);

                const startX = isStartBeforeMin ? 0 : getXPositionFromDate(sDate);
                const endX = isEndAfterMax
                  ? (hourLayouts[maxHour] ? hourLayouts[maxHour].left + hourLayouts[maxHour].width : (timelineTotalWidth || 1000))
                  : getXPositionFromDate(eDate);

                leftPx = Math.max(0, startX);
                widthPx = Math.max(28, endX - startX);
              }

              // 空いているレーン（縦の段）を検索
              let targetLane = -1;
              for (let l = 0; l < laneEndPxList.length; l++) {
                if (leftPx >= laneEndPxList[l] - 4) {
                  targetLane = l;
                  laneEndPxList[l] = leftPx + widthPx;
                  break;
                }
              }
              if (targetLane === -1) {
                targetLane = laneEndPxList.length;
                laneEndPxList.push(leftPx + widthPx);
              }

              placedEvents.push({ event: e, lane: targetLane, leftPx, widthPx });
            });

            const totalLanes = Math.max(1, laneEndPxList.length);
            const lanePitch = 48;
            const rowHeightPx = totalLanes === 1 ? 84 : Math.max(84, 12 + totalLanes * lanePitch + 12);

            return (
              <div
                key={member.id}
                style={{ minHeight: `${rowHeightPx}px` }}
                className="flex group hover:bg-slate-50/30 transition-colors relative"
              >
                {/* Member Column */}
                <div
                  style={{ width: memberColWidth, minWidth: memberColWidth }}
                  className="p-2 sm:p-2.5 border-r border-slate-200 bg-white flex flex-col justify-center shrink-0 sticky left-0 z-20 shadow-xs sm:shadow-none"
                >
                  <div className="flex items-center gap-1.5 sm:gap-2.5 min-w-0">
                    <img
                      src={getAvatarUrl(member.avatarUrl)}
                      alt={member.name}
                      className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-slate-200 shrink-0"
                      referrerPolicy="no-referrer"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="font-extrabold text-[11px] sm:text-xs text-slate-800 truncate">{member.name}</p>
                      <p className="text-[9px] sm:text-[10px] text-slate-500 font-medium mt-0.5 truncate">
                        {member.office}・{member.division}
                      </p>
                    </div>
                  </div>

                  {/* デジタルサイネージモード時は伝言メモボタンを非表示 */}
                  {!isSignageMode && (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        setMemoTargetUser(member);
                        setIsMemoModalOpen(true);
                      }}
                      className="mt-1.5 w-full flex items-center justify-center gap-1 px-1.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 text-[9px] sm:text-[10px] font-extrabold rounded-lg border border-slate-200 transition-all cursor-pointer shadow-2xs"
                    >
                      <Phone className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
                      <span className="truncate">伝言メモ</span>
                    </button>
                  )}
                </div>

                {/* Timeline Canvas Container */}
                <div className="flex-1 relative min-w-0">
                  {/* Layer 1: Background Grid (クリック追加・ドラッグ＆ドロップ受け入れ) */}
                  <div style={hoursGridStyle} className="absolute inset-0 h-full w-full">
                    {hours.map((hour) => {
                      const datetimeStr = `${dateStr}T${String(hour).padStart(2, '0')}:00`;
                      const isActive = activeHoursSet.has(hour);
                      const cellKey = `team-day-${member.id}-${hour}`;
                      const isDragOver = dragOverKey === cellKey;

                      return (
                        <div
                          key={hour}
                          onClick={() => openAddModalWithDate(datetimeStr, [member])}
                          onDragOver={(e) => handleDragOver(e, cellKey)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, dateStr, hour, member.id)}
                          className={`border-r border-slate-200 last:border-r-0 h-full cursor-pointer transition-colors ${
                            isDragOver
                              ? 'bg-indigo-100/70 ring-2 ring-indigo-400'
                              : isActive
                              ? 'hover:bg-indigo-50/20'
                              : 'bg-slate-50/40 hover:bg-indigo-50/20'
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* Layer 2: Events Absolute Overlay (実測X軸座標に正確配置された単一ブロック) */}
                  <div className="absolute inset-0 pointer-events-none p-1 overflow-hidden">
                    {placedEvents.map(({ event: e, lane, leftPx, widthPx }) => {
                      const isSingle = totalLanes === 1;
                      const topPx = isSingle ? 16 : 8 + lane * lanePitch;
                      const heightPx = isSingle ? 50 : 42;

                      // 現在リサイズ中かどうかの判定
                      const isBeingResized = resizingEvent?.event.id === e.id && resizingEvent?.direction === 'horizontal';
                      let displayWidthPx = widthPx;
                      let displayTimeString = formatEventTime(e);

                      if (isBeingResized && resizingEvent) {
                        const sDate = new Date(e.start);
                        const currEnd = new Date(resizingEvent.currentEndMs);
                        const endX = getXPositionFromDate(currEnd);
                        displayWidthPx = Math.max(28, endX - leftPx);
                        const sH = String(sDate.getHours()).padStart(2, '0');
                        const sM = String(sDate.getMinutes()).padStart(2, '0');
                        const eH = String(currEnd.getHours()).padStart(2, '0');
                        const eM = String(currEnd.getMinutes()).padStart(2, '0');
                        displayTimeString = `${sH}:${sM} ～ ${eH}:${eM}`;
                      }

                      // 時間スロット幅（1時間あたりのピクセル幅）
                      const currentStartH = new Date(e.start).getHours();
                      const activeSlotLayout = hourLayouts[currentStartH] || hourLayouts[minHour];
                      const slotW = activeSlotLayout?.width || 100;

                      return (
                        <div
                          key={e.id}
                          data-event-card="true"
                          draggable={!e.isIcal && !isBeingResized}
                          onDragStart={(eDrag) => handleDragStart(eDrag, e.id, member.id)}
                          onMouseDown={(evt) => evt.stopPropagation()}
                          onClick={(evt) => handleEventClick(evt, e)}
                          style={{
                            left: `${leftPx + 2}px`,
                            width: `${Math.max(24, displayWidthPx - 4)}px`,
                            top: `${topPx}px`,
                            height: `${heightPx}px`,
                            zIndex: isBeingResized ? 50 : 10,
                          }}
                          className={`absolute group/card border rounded-lg shadow-xs hover:shadow-md transition-all select-none cursor-pointer px-2 py-1 flex flex-col justify-center overflow-visible pointer-events-auto hover:brightness-95 ${getEventStyle(e)} ${
                            isBeingResized ? 'ring-2 ring-indigo-500 shadow-lg brightness-95' : ''
                          }`}
                          title={`${e.isIcal ? '[iCal] ' : ''}${e.title} (${displayTimeString})${e.location ? `\n場所: ${e.location}` : ''}${e.memo ? `\nメモ: ${e.memo}` : ''}`}
                        >
                          <div className="font-medium text-[11px] sm:text-xs text-slate-800 truncate leading-tight select-none pointer-events-none">
                            {e.isIcal ? `[iCal] ${e.title}` : e.title}
                          </div>
                          {displayWidthPx > 50 && (
                            <div className="text-[9px] sm:text-[10px] text-slate-500 font-medium truncate leading-tight mt-0.5 opacity-90 pointer-events-none">
                              {displayTimeString}{e.location ? ` • ${e.location}` : ''}
                            </div>
                          )}

                          {/* 横方向リサイズハンドル（右端を引っ張って15分単位で延長・短縮） */}
                          {!e.isIcal && (
                            <div
                              onMouseDown={(evt) => {
                                evt.stopPropagation();
                                evt.preventDefault();
                                const currentEnd = e.end ? new Date(e.end).getTime() : new Date(e.start).getTime() + 60 * 60 * 1000;
                                setResizingEvent({
                                  event: e,
                                  direction: 'horizontal',
                                  initialStartX: evt.clientX,
                                  initialStartY: evt.clientY,
                                  initialEndMs: currentEnd,
                                  currentEndMs: currentEnd,
                                  slotWidthPx: slotW,
                                  dateStr,
                                });
                              }}
                              className="absolute right-0 top-0 bottom-0 w-3 hover:w-3.5 cursor-ew-resize flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity z-20 group/handle"
                              title="右端をドラッグして終了時刻を15分単位で変更"
                            >
                              <div className="w-1 h-4.5 bg-slate-400/80 group-hover/handle:bg-indigo-600 rounded-full shadow-2xs transition-colors" />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  const renderTeamView = () => {
    if (teamMembers.length === 0) {
      return (
        <div className="flex flex-col items-center justify-center py-20 px-4 text-center bg-white h-full">
          <Users className="w-12 h-12 text-slate-300 mb-4" />
          <h3 className="text-sm font-bold text-slate-700">表示対象のメンバーが見つかりません</h3>
          <p className="text-xs text-slate-500 mt-1 max-w-sm">
            上部のフィルターから、対象となる拠点と部署を選択してください。
            <br />
            （チームモードでは、全社/全部署を除く特定の拠点と部署に所属するメンバーを一覧表示します）
          </p>
        </div>
      );
    }

    if (view === 'week') {
      return renderTeamWeekView();
    } else {
      return renderTeamDayView();
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, eventId: string, memberId?: string) => {
    setDraggedEventId(eventId);
    if (memberId) {
      setDraggedFromMemberId(memberId);
    } else {
      setDraggedFromMemberId(null);
    }
    e.dataTransfer.setData('text/plain', eventId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, key: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragOverKey !== key) {
      setDragOverKey(key);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOverKey(null);
  };

  const handleDrop = (e: React.DragEvent, targetDateStr: string, targetHour?: number, targetMemberId?: string) => {
    e.preventDefault();
    setDragOverKey(null);
    const eventId = draggedEventId || e.dataTransfer.getData('text/plain');
    if (!eventId) return;

    const ev = expandedEvents.find(item => item.id === eventId);
    if (!ev) return;

    let newStartIso: string;
    let newEndIso: string | undefined = undefined;

    if (ev.isAllDay) {
      newStartIso = new Date(`${targetDateStr}T00:00:00`).toISOString();
      if (ev.end) {
        const origStart = new Date(ev.start).getTime();
        const origEnd = new Date(ev.end).getTime();
        const duration = Math.max(0, origEnd - origStart);
        newEndIso = new Date(new Date(newStartIso).getTime() + duration).toISOString();
      }
    } else {
      if (targetHour !== undefined) {
        const newStart = new Date(`${targetDateStr}T${String(targetHour).padStart(2, '0')}:00:00`);
        newStartIso = newStart.toISOString();
        if (ev.end) {
          const duration = new Date(ev.end).getTime() - new Date(ev.start).getTime();
          newEndIso = new Date(newStart.getTime() + duration).toISOString();
        }
      } else {
        const oldStart = new Date(ev.start);
        const hours = String(oldStart.getHours()).padStart(2, '0');
        const minutes = String(oldStart.getMinutes()).padStart(2, '0');
        const newStart = new Date(`${targetDateStr}T${hours}:${minutes}:00`);
        newStartIso = newStart.toISOString();
        if (ev.end) {
          const duration = new Date(ev.end).getTime() - oldStart.getTime();
          newEndIso = new Date(newStart.getTime() + duration).toISOString();
        }
      }
    }

    let updatedAttendees = [...(ev.attendees || [])];
    if (targetMemberId) {
      const targetMember = (allUsers || []).find(u => u.id === targetMemberId);
      if (targetMember) {
        if (draggedFromMemberId) {
          const idx = updatedAttendees.findIndex(a => a.id === draggedFromMemberId);
          if (idx !== -1) {
            if (draggedFromMemberId !== targetMemberId) {
              const targetExistsIdx = updatedAttendees.findIndex(a => a.id === targetMemberId);
              if (targetExistsIdx !== -1) {
                updatedAttendees.splice(idx, 1);
              } else {
                updatedAttendees[idx] = targetMember;
              }
            }
          } else {
            if (!updatedAttendees.some(a => a.id === targetMemberId)) {
              updatedAttendees.push(targetMember);
            }
          }
        } else {
          updatedAttendees = updatedAttendees.filter(a => !teamMembers.some(tm => tm.id === a.id));
          updatedAttendees.push(targetMember);
        }
      }
    }

    onUpdateEvent?.({
      ...ev,
      start: newStartIso,
      end: newEndIso,
      attendees: updatedAttendees,
    });

    setDraggedEventId(null);
    setDraggedFromMemberId(null);
  };

  // Helper date calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const totalWeeks = Math.ceil((firstDay + daysInMonth) / 7);
  const totalSlots = Math.max(35, totalWeeks * 7);

  const days = Array.from({ length: totalSlots }, (_, i) => {
    const day = i - firstDay + 1;
    if (day > 0 && day <= daysInMonth) return day;
    return null;
  });

  // Week view dates (Sunday to Saturday)
  const getWeekDays = (date: Date) => {
    const startOfWeek = new Date(date);
    const dayOfWeek = startOfWeek.getDay(); // 0 = Sun
    startOfWeek.setDate(date.getDate() - dayOfWeek);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      return d;
    });
  };

  const weekDays = getWeekDays(currentDate);

  // Formatting date range for header
  const getHeaderTitle = () => {
    if (view === 'month' || view === 'list') {
      return `${year}年${month + 1}月`;
    }
    if (view === 'week') {
      const startD = weekDays[0];
      const endD = weekDays[6];
      const startM = startD.getMonth() + 1;
      const endM = endD.getMonth() + 1;
      if (startM === endM) {
        return `${startD.getFullYear()}年${startM}月${startD.getDate()}日 - ${endD.getDate()}日`;
      }
      return `${startD.getFullYear()}年${startM}月${startD.getDate()}日 - ${endM}月${endD.getDate()}日`;
    }
    if (view === 'day') {
      const dayNames = ['日', '月', '火', '水', '木', '金', '土'];
      return `${year}年${month + 1}月${currentDate.getDate()}日 (${dayNames[currentDate.getDay()]})`;
    }
    return `${year}年${month + 1}月`;
  };

  const formatEventTime = (e: CalendarEvent) => {
    if (e.isAllDay) return '終日';
    const startDate = new Date(e.start);
    const startTimeStr = startDate.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
    let endDate = e.end ? new Date(e.end) : new Date(startDate.getTime() + 60 * 60 * 1000);
    if (isNaN(endDate.getTime()) || (isSameDay(startDate, endDate) && startTimeStr === endDate.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' }))) {
      endDate = new Date(startDate.getTime() + 60 * 60 * 1000);
    }
    const endTimeStr = endDate.toLocaleTimeString('ja-JP', { timeZone: 'Asia/Tokyo', hour: '2-digit', minute: '2-digit' });
    return `${startTimeStr}〜${endTimeStr}`;
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return getLocalDateStr(d1) === getLocalDateStr(d2);
  };

  const hoursList = useMemo(() => {
    let minH = 8;
    let maxH = 20;
    filteredEvents.forEach(e => {
      if (e.isAllDay) return;
      const s = new Date(e.start);
      if (!isNaN(s.getTime()) && s.getHours() < minH) {
        minH = Math.max(0, s.getHours());
      }
      const endD = e.end ? new Date(e.end) : new Date(s.getTime() + 60 * 60 * 1000);
      if (!isNaN(endD.getTime())) {
        let endH = endD.getHours();
        if (endD.getMinutes() > 0) endH = Math.min(23, endH);
        if (endH > maxH) maxH = Math.min(23, endH);
      }
    });
    return Array.from({ length: maxH - minH + 1 }, (_, i) => i + minH);
  }, [filteredEvents]);

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-slate-900/5 overflow-hidden flex flex-col min-h-[550px] h-[calc(100vh-6.5rem)] sm:h-[calc(100vh-7.5rem)] lg:h-[calc(100vh-8rem)]">
      {/* Header Toolbar */}
      <div className="p-3 sm:p-4 border-b border-slate-200 flex flex-col xl:flex-row gap-3 sm:gap-4 items-stretch xl:items-center justify-between bg-slate-50 shrink-0">
        <div className="flex items-center justify-between sm:justify-start gap-2 sm:gap-4 min-w-0">
          <h2 className="text-base sm:text-lg xl:text-xl font-bold text-slate-800 tracking-tight min-w-0 truncate">
            {getHeaderTitle()}
          </h2>
          <div className="flex items-center gap-0.5 sm:gap-1 bg-white rounded-lg border border-slate-200 p-0.5 sm:p-1 shadow-sm shrink-0">
            <button onClick={() => changeDate(-1)} className="p-1 hover:bg-slate-100 rounded-md text-slate-600 transition-colors" title="前へ"><ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5"/></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-2 sm:px-3 py-1 text-xs sm:text-sm font-semibold hover:bg-slate-100 rounded-md text-slate-700 transition-colors">今日</button>
            <button onClick={() => changeDate(1)} className="p-1 hover:bg-slate-100 rounded-md text-slate-600 transition-colors" title="次へ"><ChevronRight className="w-4 h-4 sm:w-5 sm:h-5"/></button>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-2 sm:gap-3 w-full xl:w-auto">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-2 sm:gap-3 bg-white px-2.5 sm:px-3 py-1.5 rounded-lg border border-slate-200 text-xs sm:text-sm shadow-sm flex-1 sm:flex-none">
            {calendarMode === 'team' && (
              <>
                {/* 拠点プルダウン (チームメンバー表示用) */}
                <div className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />
                  <span className="font-semibold text-slate-600 text-xs shrink-0 hidden sm:inline">拠点:</span>
                  <select
                    value={selectedOffice}
                    onChange={e => setSelectedOffice(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded px-1.5 sm:px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    {officeNames.filter(o => o !== '全社' && o !== '全拠点').map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                {/* 部署プルダウン (チームメンバー表示用) */}
                <div className="flex items-center gap-1 pl-2 border-l border-slate-200">
                  <Users className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="font-semibold text-slate-600 text-xs shrink-0 hidden sm:inline">部署:</span>
                  <select
                    value={selectedDivision}
                    onChange={e => setSelectedDivision(e.target.value)}
                    className="bg-slate-50 border border-slate-200 rounded px-1.5 sm:px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    {divisionNames.filter(d => d !== '全部署').map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* 区分プルダウン */}
            <div className={`flex items-center gap-1 ${calendarMode === 'team' ? 'pl-2 border-l border-slate-200' : ''}`}>
              <span className="font-semibold text-slate-600 text-xs shrink-0">区分:</span>
              <select
                value={selectedTypeFilter}
                onChange={e => setSelectedTypeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded px-1.5 sm:px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">全区分</option>
                {Object.keys(typeLabels).map(key => (
                  <option key={key} value={key}>{typeLabels[key as EventType]}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Mode Selector */}
          <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5 sm:p-1 shadow-sm text-xs font-semibold shrink-0">
            <button
              onClick={() => handleToggleMode('personal')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md transition-all ${calendarMode === 'personal' ? 'bg-amber-500 text-white font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              個人
            </button>
            <button
              onClick={() => handleToggleMode('team')}
              className={`px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-md transition-all ${calendarMode === 'team' ? 'bg-indigo-600 text-white font-bold shadow-xs' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              チーム
            </button>
          </div>
          
          {/* View selector */}
          <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5 sm:p-1 shadow-sm text-xs font-semibold shrink-0">
            {calendarMode !== 'team' && (
              <button
                onClick={() => setView('month')}
                className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md transition-colors ${view === 'month' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
              >
                月
              </button>
            )}
            <button
              onClick={() => setView('week')}
              className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md transition-colors ${view === 'week' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              週
            </button>
            <button
              onClick={() => setView('day')}
              className={`px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md transition-colors ${view === 'day' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              日
            </button>
            {calendarMode !== 'team' && (
              <button
                onClick={() => setView('list')}
                className={`p-1 sm:p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
                title="リスト表示"
              >
                <ListIcon className="w-3.5 h-3.5 sm:w-4 sm:h-4"/>
              </button>
            )}
          </div>

          {/* 現在の表示条件のURLリンクをコピーするボタン */}
          <button
            type="button"
            onClick={() => {
              const dateStr = `${currentDate.getFullYear()}-${String(currentDate.getMonth() + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
              const url = buildAppUrl({
                tab: 'calendar',
                office: selectedOffice,
                division: selectedDivision,
                mode: calendarMode,
                view: view,
                date: dateStr,
                type: selectedTypeFilter !== 'all' ? selectedTypeFilter : undefined,
              });
              if (navigator.clipboard) {
                navigator.clipboard.writeText(url).then(() => {
                  setCopiedLink(true);
                  setTimeout(() => setCopiedLink(false), 2500);
                }).catch(() => {});
              }
            }}
            className={`flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all shadow-2xs cursor-pointer shrink-0 ${
              copiedLink
                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200'
                : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
            }`}
            title="この表示条件（拠点・部署・モード・表示）を共有できるURLリンクをコピー"
          >
            {copiedLink ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span className="font-bold">URLコピー完了!</span>
              </>
            ) : (
              <>
                <Share2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="hidden sm:inline">リンク共有</span>
                <span className="sm:hidden">共有</span>
              </>
            )}
          </button>

          {/* デジタルサイネージモード トグル (スケジュール・チーム・日 選択時のみ表示) */}
          {calendarMode === 'team' && view === 'day' && (
            <button
              type="button"
              onClick={() => handleToggleSignageMode(!isSignageMode)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-bold transition-all shadow-sm cursor-pointer shrink-0 ${
                isSignageMode
                  ? 'bg-rose-600 text-white border-rose-700 ring-2 ring-rose-300'
                  : 'bg-slate-800 text-white border-slate-700 hover:bg-slate-700'
              }`}
              title="デジタルサイネージモード（30秒自動更新・全画面表示）"
            >
              <Monitor className="w-4 h-4 text-amber-300 shrink-0" />
              <span className="hidden sm:inline">デジタルサイネージ</span>
              <span className="sm:hidden">サイネージ</span>
              {isSignageMode ? (
                <span className="flex h-2 w-2 relative">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
              ) : (
                <span className="text-[10px] bg-indigo-500/30 text-indigo-200 px-1.5 py-0.5 rounded font-mono">30s</span>
              )}
            </button>
          )}
          
          {onNavigateToInspectionScheduler && (
            <button
              type="button"
              onClick={onNavigateToInspectionScheduler}
              className="flex items-center justify-center gap-1 sm:gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-200 text-xs font-bold rounded-lg transition-colors shadow-2xs cursor-pointer shrink-0"
              title="Excelから毎月の点検予定を一括取込・仮配置・メンバー登録"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
              <span className="hidden sm:inline">点検予定一括登録</span>
            </button>
          )}

          <button onClick={() => openAddModalWithDate()} className="flex items-center justify-center gap-1 sm:gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-indigo-600 text-white text-xs sm:text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm ml-auto sm:ml-0 shrink-0">
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4"/>
            <span className="hidden sm:inline">予定追加</span>
            <span className="sm:hidden">追加</span>
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-auto bg-white">
        {calendarMode === 'team' ? (
          renderTeamView()
        ) : (
          <>
            {/* 1. MONTH VIEW */}
            {view === 'month' && (
              <div className="min-w-[680px] h-full flex flex-col">
                <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 shrink-0 sticky top-0 z-10">
                  {['日', '月', '火', '水', '木', '金', '土'].map((d, idx) => (
                    <div key={d} className={`py-2 text-center text-xs font-bold tracking-wider ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-slate-500'}`}>{d}</div>
                  ))}
                </div>
                <div className={`flex-1 grid grid-cols-7 ${totalWeeks >= 6 ? 'grid-rows-6' : 'grid-rows-5'}`}>
                  {days.map((day, i) => {
                    const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                    const cellDateStr = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
                    const cellEvents = cellDateStr ? filteredEvents.filter(e => isEventOccurringOnDate(e, cellDateStr)) : [];
                    const cellKey = `month-cell-${i}`;
                    const isDragOver = dragOverKey === cellKey;
                    const isSelectedRange = cellDateStr ? isDateInSelectionRange(cellDateStr) : false;
                    
                    return (
                      <div
                        key={i}
                        onMouseDown={(e) => cellDateStr && handleCellMouseDown(e, cellDateStr)}
                        onMouseEnter={() => cellDateStr && handleCellMouseEnter(cellDateStr)}
                        onDragOver={(e) => cellDateStr && handleDragOver(e, cellKey)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => cellDateStr && handleDrop(e, cellDateStr)}
                        className={`border-b border-r border-slate-100 py-1 sm:py-1.5 px-0 min-h-[90px] sm:min-h-[100px] group relative transition-colors select-none ${
                          !day ? 'bg-slate-50/50' : isSelectedRange ? 'bg-indigo-100/90 ring-2 ring-indigo-500/70 z-10' : isDragOver ? 'bg-indigo-100/70 ring-2 ring-indigo-400' : 'hover:bg-indigo-50/20 cursor-pointer'
                        }`}
                      >
                        {day && (
                          <div className="h-full flex flex-col">
                            <div className="flex items-center justify-between mb-1 px-1 sm:px-1.5">
                              <div className={`text-[11px] sm:text-xs font-semibold w-5 h-5 sm:w-6 sm:h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700'}`}>
                                {day}
                              </div>
                              <button
                                type="button"
                                onClick={(e) => { e.stopPropagation(); openAddModalWithDate(cellDateStr!, undefined, cellDateStr!, false); }}
                                className="opacity-0 group-hover:opacity-100 p-0.5 text-indigo-600 hover:bg-indigo-100 rounded transition-all"
                                title="この日に予定を追加"
                              >
                                <Plus className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
                              </button>
                            </div>
                            <div className="flex-1 space-y-0.5 sm:space-y-1 overflow-y-auto px-0">
                              {sortEvents(cellEvents).map(e => {
                                const multiProps = getMultiDayStyle(e, cellDateStr!, true);
                                return (
                                  <div
                                    key={e.id}
                                    data-event-card="true"
                                    draggable={!e.isIcal}
                                    onDragStart={(eDrag) => handleDragStart(eDrag, e.id)}
                                    onMouseDown={(eClick) => eClick.stopPropagation()}
                                    onClick={(eClick) => handleEventClick(eClick, e)}
                                    className={`text-[9px] sm:text-[10px] py-0.5 px-1 sm:px-1.5 border font-bold cursor-pointer transition-all flex items-center h-5 sm:h-5.5 select-none truncate ${getEventStyle(e)} ${multiProps.containerClass}`}
                                    title={`${e.isIcal ? '[iCal連携] ' : ''}${e.title} (${formatEventTime(e)})`}
                                  >
                                    <span className="truncate font-bold tracking-tight">
                                      {multiProps.showTitle ? (e.isIcal ? `[iCal] ${e.title}` : e.title) : '\u00A0'}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 2. WEEK VIEW */}
            {view === 'week' && (() => {
              const personalWeekHasEvents = weekDays.map(d => {
                const dateStr = getLocalDateStr(d);
                return filteredEvents.some(e => isEventOccurringOnDate(e, dateStr));
              });

              const personalWeekGridStyle = {
                display: 'grid',
                gridTemplateColumns: `60px ${weekDays.map((d, idx) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  const hasEv = personalWeekHasEvents[idx];
                  if (isWeekend && !hasEv) {
                    return 'minmax(46px, 0.45fr)';
                  }
                  return 'minmax(110px, 1fr)';
                }).join(' ')}`,
              };

              return (
                <div className="min-w-full h-full overflow-auto flex flex-col bg-white">
                  {/* Week Header */}
                  <div
                    style={personalWeekGridStyle}
                    className="border-b border-slate-200 bg-slate-50 shrink-0 sticky top-0 z-20 shadow-2xs"
                  >
                    <div className="py-2.5 sm:py-3 px-1 sm:px-2 text-center text-[11px] sm:text-xs font-bold text-slate-400 border-r border-slate-200 sticky left-0 z-30 bg-slate-50">
                      時間
                    </div>
                    {weekDays.map((d, idx) => {
                      const isToday = isSameDay(d, new Date());
                      const dayName = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
                      const dateStr = getLocalDateStr(d);
                      const isSelectedRange = isDateInSelectionRange(dateStr);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const hasEv = personalWeekHasEvents[idx];
                      const isShrunk = isWeekend && !hasEv;

                      return (
                        <div
                          key={idx}
                          onMouseDown={(e) => handleCellMouseDown(e, dateStr)}
                          onMouseEnter={() => handleCellMouseEnter(dateStr)}
                          className={`py-1.5 sm:py-2 px-1 text-center border-r border-slate-200 cursor-pointer select-none transition-colors ${
                            isSelectedRange
                              ? 'bg-indigo-100/90 ring-2 ring-indigo-500/70 z-10'
                              : isToday
                              ? 'bg-indigo-50/60'
                              : isShrunk
                              ? 'bg-slate-100/60'
                              : 'hover:bg-indigo-50/40'
                          }`}
                        >
                          <div className={`text-[11px] sm:text-xs font-semibold ${isShrunk ? 'text-slate-400' : idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-slate-500'}`}>
                            {dayName}
                          </div>
                          <div className={`text-xs sm:text-sm font-bold mt-0.5 inline-flex items-center justify-center w-6 h-6 sm:w-7 sm:h-7 rounded-full ${isToday ? 'bg-indigo-600 text-white' : isShrunk ? 'text-slate-400' : 'text-slate-800'}`}>
                            {d.getDate()}
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {/* All-Day Events row */}
                  <div
                    style={personalWeekGridStyle}
                    className="border-b border-slate-200 bg-slate-50/50 shrink-0"
                  >
                    <div className="py-2 px-1 sm:px-2 text-center text-[10px] sm:text-[11px] font-bold text-slate-500 border-r border-slate-200 flex items-center justify-center sticky left-0 z-10 bg-slate-50/95 shadow-xs sm:shadow-none">
                      終日
                    </div>
                    {weekDays.map((d, idx) => {
                      const dateStr = getLocalDateStr(d);
                      const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                      const hasEv = personalWeekHasEvents[idx];
                      const isShrunk = isWeekend && !hasEv;

                      const allDayEvs = filteredEvents.filter(e => (e.isAllDay || getLocalDateStr(e.start) !== getLocalDateStr(e.end)) && isEventOccurringOnDate(e, dateStr));
                      const slotKey = `week-allday-${idx}`;
                      const isDragOver = dragOverKey === slotKey;
                      const isSelectedRange = isDateInSelectionRange(dateStr);

                      return (
                        <div
                          key={idx}
                          onMouseDown={(e) => handleCellMouseDown(e, dateStr)}
                          onMouseEnter={() => handleCellMouseEnter(dateStr)}
                          onDragOver={(e) => handleDragOver(e, slotKey)}
                          onDragLeave={handleDragLeave}
                          onDrop={(e) => handleDrop(e, dateStr)}
                          className={`p-1 border-r border-slate-200 min-h-[36px] sm:min-h-[40px] cursor-pointer space-y-1 transition-colors select-none ${
                            isSelectedRange
                              ? 'bg-indigo-100/90 ring-2 ring-indigo-500/70 z-10'
                              : isDragOver
                              ? 'bg-indigo-100/70 ring-2 ring-indigo-400'
                              : isShrunk
                              ? 'bg-slate-50/40 hover:bg-indigo-50/20'
                              : 'hover:bg-indigo-50/30'
                          }`}
                        >
                          {sortEvents(allDayEvs).map(e => {
                            const multiProps = getMultiDayStyle(e, dateStr);
                            return (
                              <div
                                key={e.id}
                                data-event-card="true"
                                draggable={!e.isIcal}
                                onDragStart={(eDrag) => handleDragStart(eDrag, e.id)}
                                onMouseDown={(eClick) => eClick.stopPropagation()}
                                onClick={eClick => handleEventClick(eClick, e)}
                                className={`text-[9px] sm:text-[10px] py-0.5 px-1 sm:px-1.5 border font-semibold cursor-pointer transition-all flex items-center h-5 sm:h-5.5 select-none truncate ${getEventStyle(e, true)} ${multiProps.containerClass}`}
                                title={e.title}
                              >
                                <span className="truncate font-bold tracking-tight">
                                  {multiProps.showTitle ? (e.isIcal ? `[iCal] ${e.title}` : e.title) : '\u00A0'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>

                  {/* Hourly Grid */}
                  <div className="flex-1">
                    {hoursList.map(h => {
                      const hourFormatted = `${String(h).padStart(2, '0')}:00`;
                      return (
                        <div
                          key={h}
                          style={personalWeekGridStyle}
                          className="border-b border-slate-100 min-h-[45px] sm:min-h-[50px]"
                        >
                          <div className="py-2 px-1 sm:px-2 text-center text-[10px] sm:text-xs font-medium text-slate-400 border-r border-slate-200 bg-slate-50/95 sticky left-0 z-10 shadow-xs sm:shadow-none flex items-center justify-center">
                            {hourFormatted}
                          </div>
                          {weekDays.map((d, idx) => {
                            const dateStr = getLocalDateStr(d);
                            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                            const hasEv = personalWeekHasEvents[idx];
                            const isShrunk = isWeekend && !hasEv;

                            const slotDateTimeStr = `${dateStr}T${String(h).padStart(2, '0')}:00`;
                            const slotKey = `week-slot-${idx}-${h}`;
                            const isDragOver = dragOverKey === slotKey;
                            
                            const slotEvents = filteredEvents.filter(e => {
                              if (e.isAllDay) return false;
                              if (getLocalDateStr(e.start) !== dateStr) return false;
                              const eventHour = new Date(e.start).getHours();
                              return eventHour === h;
                            });

                            return (
                              <div
                                key={idx}
                                onClick={() => openAddModalWithDate(slotDateTimeStr)}
                                onDragOver={(e) => handleDragOver(e, slotKey)}
                                onDragLeave={handleDragLeave}
                                onDrop={(e) => handleDrop(e, dateStr, h)}
                                className={`border-r border-slate-100 p-0.5 sm:p-1 cursor-pointer transition-colors relative group ${
                                  isDragOver
                                    ? 'bg-indigo-100/70 ring-2 ring-indigo-400'
                                    : isShrunk
                                    ? 'bg-slate-50/30 hover:bg-indigo-50/20'
                                    : 'hover:bg-indigo-50/30'
                                }`}
                              >
                                {slotEvents.map(e => {
                                  const isBeingResized = resizingEvent?.event.id === e.id && resizingEvent?.direction === 'vertical';
                                  let displayTimeString = formatEventTime(e);
                                  if (isBeingResized && resizingEvent) {
                                    const sDate = new Date(e.start);
                                    const currEnd = new Date(resizingEvent.currentEndMs);
                                    const sH = String(sDate.getHours()).padStart(2, '0');
                                    const sM = String(sDate.getMinutes()).padStart(2, '0');
                                    const eH = String(currEnd.getHours()).padStart(2, '0');
                                    const eM = String(currEnd.getMinutes()).padStart(2, '0');
                                    displayTimeString = `${sH}:${sM} ～ ${eH}:${eM}`;
                                  }

                                  return (
                                    <div
                                      key={e.id}
                                      data-event-card="true"
                                      draggable={!e.isIcal && !isBeingResized}
                                      onDragStart={(eDrag) => handleDragStart(eDrag, e.id)}
                                      onMouseDown={(eClick) => eClick.stopPropagation()}
                                      onClick={eClick => handleEventClick(eClick, e)}
                                      className={`group/wkcard text-[10px] sm:text-[11px] p-1 sm:p-1.5 pb-2 rounded border font-medium mb-1 shadow-xs cursor-pointer transition-all relative ${getEventStyle(e)} ${
                                        isBeingResized ? 'ring-2 ring-indigo-500 shadow-md brightness-95' : ''
                                      }`}
                                      title={`${e.isIcal ? '[iCal] ' : ''}${e.title} (${displayTimeString})`}
                                    >
                                      <div className="font-bold truncate pointer-events-none">{e.isIcal ? `[iCal] ${e.title}` : e.title}</div>
                                      <div className="text-[8px] sm:text-[9px] opacity-80 pointer-events-none">{displayTimeString}</div>

                                      {/* 縦方向リサイズハンドル（下端を引っ張って15分単位で延長・短縮） */}
                                      {!e.isIcal && (
                                        <div
                                          onMouseDown={(evt) => {
                                            evt.stopPropagation();
                                            evt.preventDefault();
                                            const currentEnd = e.end ? new Date(e.end).getTime() : new Date(e.start).getTime() + 60 * 60 * 1000;
                                            setResizingEvent({
                                              event: e,
                                              direction: 'vertical',
                                              initialStartX: evt.clientX,
                                              initialStartY: evt.clientY,
                                              initialEndMs: currentEnd,
                                              currentEndMs: currentEnd,
                                              slotHeightPx: 50,
                                              dateStr,
                                            });
                                          }}
                                          className="absolute bottom-0 left-0 right-0 h-2.5 hover:h-3 cursor-ns-resize flex items-center justify-center opacity-0 group-hover/wkcard:opacity-100 transition-opacity z-20 group/handle"
                                          title="下端をドラッグして終了時刻を15分単位で変更"
                                        >
                                          <div className="w-5 h-1 bg-slate-400/80 group-hover/handle:bg-indigo-600 rounded-full shadow-2xs transition-colors" />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })()}

            {/* 3. DAY VIEW */}
            {view === 'day' && (
              <div className="w-full h-full flex flex-col p-3 sm:p-6">
                <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-3 pb-3 sm:pb-4 border-b border-slate-200 mb-3 sm:mb-4">
                  <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl sm:rounded-2xl bg-indigo-600 text-white flex flex-col items-center justify-center font-bold shadow-md shrink-0">
                      <span className="text-[10px] sm:text-xs uppercase leading-none">{['日', '月', '火', '水', '木', '金', '土'][currentDate.getDay()]}</span>
                      <span className="text-base sm:text-lg leading-none mt-0.5">{currentDate.getDate()}</span>
                    </div>
                    <div className="min-w-0">
                      <h3 className="text-base sm:text-lg font-bold text-slate-800 truncate">{getHeaderTitle()}の予定</h3>
                      <p className="text-[11px] sm:text-xs text-slate-500 truncate hidden sm:block">予定のクリックで詳細確認・編集を行えます</p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                      openAddModalWithDate(dStr);
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 sm:px-3.5 sm:py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold text-xs rounded-lg transition-colors shrink-0"
                  >
                    <Plus className="w-4 h-4"/>
                    <span>この日に追加</span>
                  </button>
                </div>

                {/* All-Day & Multi-Day Events */}
                {(() => {
                  const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                  const dayAllDayEvents = filteredEvents.filter(e => (e.isAllDay || getLocalDateStr(e.start) !== getLocalDateStr(e.end)) && isEventOccurringOnDate(e, dStr));
                  if (dayAllDayEvents.length === 0) return null;
                  return (
                    <div className="mb-4 sm:mb-6 p-3 sm:p-4 bg-slate-50 rounded-xl border border-slate-200">
                      <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                        <Clock className="w-3.5 h-3.5 text-slate-400" />
                        終日・複数日予定
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {dayAllDayEvents.map(e => {
                          const sStr = getLocalDateStr(e.start);
                          const eStr = e.end ? getLocalDateStr(e.end) : sStr;
                          const isMulti = sStr !== eStr;
                          return (
                            <div
                              key={e.id}
                              data-event-card="true"
                              draggable={!e.isIcal}
                              onDragStart={(eDrag) => handleDragStart(eDrag, e.id)}
                              onMouseDown={(eClick) => eClick.stopPropagation()}
                              onClick={eClick => handleEventClick(eClick, e)}
                              className={`p-2.5 sm:p-3 rounded-lg border font-semibold cursor-pointer transition-all ${getEventStyle(e, true)}`}
                              title="クリックで詳細"
                            >
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="font-bold text-xs sm:text-sm">{e.isIcal ? `[iCal] ${e.title}` : e.title}</div>
                                  {isMulti && <div className="text-[10px] sm:text-[11px] font-medium opacity-90">{sStr} ～ {eStr}</div>}
                                </div>
                                <span className="text-[9px] sm:text-[10px] px-2 py-0.5 bg-white/20 rounded-full font-bold">{e.isIcal ? 'iCal' : typeLabels[e.type]}</span>
                              </div>
                              {e.memo && <div className="text-[11px] sm:text-xs font-normal mt-1 opacity-90">{renderContentWithLinks(e.memo)}</div>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })()}

                {/* Timeline slots */}
                <div className="space-y-1.5 sm:space-y-2 overflow-y-auto flex-1 pr-0.5 sm:pr-1">
                  {hoursList.map(h => {
                    const hourFormatted = `${String(h).padStart(2, '0')}:00`;
                    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                    const slotDateTimeStr = `${dateStr}T${String(h).padStart(2, '0')}:00`;
                    const slotKey = `day-slot-${h}`;
                    const isDragOver = dragOverKey === slotKey;

                    const dayEvents = filteredEvents.filter(e => {
                      if (e.isAllDay) return false;
                      if (getLocalDateStr(e.start) !== dateStr) return false;
                      const eventHour = new Date(e.start).getHours();
                      return eventHour === h;
                    });

                    return (
                      <div
                        key={h}
                        onClick={() => openAddModalWithDate(slotDateTimeStr)}
                        onDragOver={(e) => handleDragOver(e, slotKey)}
                        onDragLeave={handleDragLeave}
                        onDrop={(e) => handleDrop(e, dateStr, h)}
                        className={`flex gap-2 sm:gap-4 p-2 sm:p-3 rounded-xl border transition-colors cursor-pointer group ${
                          isDragOver ? 'bg-indigo-100/70 border-indigo-400 ring-2 ring-indigo-400' : 'border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/20'
                        }`}
                      >
                        <div className="w-12 sm:w-16 shrink-0 text-[11px] sm:text-xs font-semibold text-slate-400 pt-0.5">{hourFormatted}</div>
                        <div className="flex-1 min-h-[32px] space-y-1.5 sm:space-y-2">
                          {dayEvents.length > 0 ? (
                            dayEvents.map(e => {
                              const isBeingResized = resizingEvent?.event.id === e.id && resizingEvent?.direction === 'vertical';
                              let displayTimeString = formatEventTime(e);
                              if (isBeingResized && resizingEvent) {
                                const sDate = new Date(e.start);
                                const currEnd = new Date(resizingEvent.currentEndMs);
                                const sH = String(sDate.getHours()).padStart(2, '0');
                                const sM = String(sDate.getMinutes()).padStart(2, '0');
                                const eH = String(currEnd.getHours()).padStart(2, '0');
                                const eM = String(currEnd.getMinutes()).padStart(2, '0');
                                displayTimeString = `${sH}:${sM} ～ ${eH}:${eM}`;
                              }

                              return (
                                <div
                                  key={e.id}
                                  data-event-card="true"
                                  draggable={!e.isIcal && !isBeingResized}
                                  onDragStart={(eDrag) => handleDragStart(eDrag, e.id)}
                                  onMouseDown={(eClick) => eClick.stopPropagation()}
                                  onClick={eClick => handleEventClick(eClick, e)}
                                  className={`group/daycard p-2.5 sm:p-3 pb-3.5 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 sm:gap-2 shadow-xs cursor-pointer transition-all relative ${getEventStyle(e)} ${
                                    isBeingResized ? 'ring-2 ring-indigo-500 shadow-md brightness-95' : ''
                                  }`}
                                  title="クリックで詳細"
                                >
                                  <div className="min-w-0 pointer-events-none">
                                    <div className="font-extrabold text-sm sm:text-base text-slate-900 leading-snug">{e.title}</div>
                                    <div className="text-[11px] sm:text-xs font-semibold text-slate-600 mt-0.5">{displayTimeString}</div>
                                    {e.memo && (
                                      <div className="text-[11px] sm:text-xs text-slate-700 mt-1 bg-white/50 p-1.5 rounded border border-slate-200/50">
                                        {renderContentWithLinks(e.memo)}
                                      </div>
                                    )}
                                  </div>
                                  <span className="text-[9px] sm:text-[10px] px-2 sm:px-2.5 py-0.5 sm:py-1 rounded-md font-bold border bg-white/80 self-start sm:self-center shrink-0 pointer-events-none">
                                    {typeLabels[e.type]}
                                  </span>

                                  {/* 縦方向リサイズハンドル（下端を引っ張って15分単位で延長・短縮） */}
                                  {!e.isIcal && (
                                    <div
                                      onMouseDown={(evt) => {
                                        evt.stopPropagation();
                                        evt.preventDefault();
                                        const currentEnd = e.end ? new Date(e.end).getTime() : new Date(e.start).getTime() + 60 * 60 * 1000;
                                        setResizingEvent({
                                          event: e,
                                          direction: 'vertical',
                                          initialStartX: evt.clientX,
                                          initialStartY: evt.clientY,
                                          initialEndMs: currentEnd,
                                          currentEndMs: currentEnd,
                                          slotHeightPx: 60,
                                          dateStr,
                                        });
                                      }}
                                      className="absolute bottom-0 left-0 right-0 h-3 hover:h-3.5 cursor-ns-resize flex items-center justify-center opacity-0 group-hover/daycard:opacity-100 transition-opacity z-20 group/handle"
                                      title="下端をドラッグして終了時刻を15分単位で変更"
                                    >
                                      <div className="w-8 h-1 bg-slate-400/80 group-hover/handle:bg-indigo-600 rounded-full shadow-2xs transition-colors" />
                                    </div>
                                  )}
                                </div>
                              );
                            })
                          ) : (
                            <div className="text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5 flex items-center gap-1">
                              <Plus className="w-3.5 h-3.5"/> <span className="hidden sm:inline">クリックして{hourFormatted}に予定を追加</span>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* 4. LIST VIEW */}
            {view === 'list' && (
              <div className="p-3 sm:p-6 w-full space-y-3 sm:space-y-4">
                {filteredEvents.length > 0 ? (
                  filteredEvents.sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime()).map(e => (
                    <div
                      key={e.id}
                      data-event-card="true"
                      onMouseDown={(eClick) => eClick.stopPropagation()}
                      onClick={(eClick) => handleEventClick(eClick, e)}
                      className="flex flex-col sm:flex-row gap-3 sm:gap-5 p-3.5 sm:p-5 rounded-xl border border-slate-200 hover:border-indigo-300 transition-all bg-white shadow-xs cursor-pointer hover:shadow-md"
                    >
                      <div className="sm:w-24 shrink-0 flex sm:flex-col items-center sm:items-center sm:justify-center justify-between pb-2 sm:pb-0 border-b sm:border-b-0 border-slate-100">
                        <div className="text-xs font-bold text-slate-600 uppercase tracking-wider bg-slate-100 px-2 py-0.5 rounded sm:bg-transparent sm:p-0">
                          {new Date(e.start).toLocaleDateString('ja-JP', {month:'short', day:'numeric'})}
                        </div>
                        <div className="text-xs sm:text-sm font-extrabold text-indigo-700 sm:text-slate-800 sm:mt-1">
                          {formatEventTime(e)}
                        </div>
                      </div>
                      <div className="hidden sm:block w-px bg-slate-100 shrink-0 my-1"></div>
                      <div className="flex-1 min-w-0 py-0.5">
                        <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                          <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider border ${getEventStyle(e)}`}>
                            {typeLabels[e.type]}
                          </span>
                          <h3 className="font-bold text-slate-900 truncate text-sm sm:text-base flex-1 min-w-0">{e.title}</h3>
                        </div>
                        {e.memo && (
                          <div className="text-xs text-slate-700 my-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                            {renderContentWithLinks(e.memo)}
                          </div>
                        )}
                        <div className="flex flex-wrap gap-2.5 sm:gap-4 text-xs text-slate-500 mt-2 font-medium items-center">
                          {e.attendees && e.attendees.length > 0 && (
                            <div className="flex items-center gap-1.5">
                              <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                              <div className="flex -space-x-1.5">
                                {e.attendees.map(u => (
                                  <img key={u.id} src={getAvatarUrl(u.avatarUrl)} alt={u.name} title={u.name} className="w-4 h-4 rounded-full border border-white object-cover" />
                                ))}
                              </div>
                              <span>({e.attendees.length}名)</span>
                            </div>
                          )}
                          {e.attachments && e.attachments.length > 0 && (
                            <div className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-indigo-100">
                              <Paperclip className="w-3 h-3" />
                              <span>添付 ({e.attachments.length})</span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="text-center py-12 sm:py-16">
                    <CalendarIcon className="w-10 h-10 sm:w-12 sm:h-12 text-slate-300 mx-auto mb-3 sm:mb-4" />
                    <h3 className="text-slate-800 font-semibold mb-1 text-sm sm:text-base">予定がありません</h3>
                    <p className="text-slate-500 text-xs sm:text-sm">条件に一致する予定は見つかりませんでした。</p>
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {selectedDetailEvent && (
        <GlobalEventDetailModal
          isOpen={!!selectedDetailEvent}
          event={selectedDetailEvent}
          onClose={() => setSelectedDetailEvent(null)}
          onEdit={(event) => {
            setSelectedDetailEvent(null);
            setEditingEvent(event);
            setIsCopyMode(false);
            setIsModalOpen(true);
          }}
          onCopyAndAdd={(event) => {
            setSelectedDetailEvent(null);
            setEditingEvent(event);
            setIsCopyMode(true);
            setIsModalOpen(true);
          }}
          onDelete={(event) => {
            if (onDeleteEvent) {
              onDeleteEvent(event.id);
            }
            setSelectedDetailEvent(null);
          }}
          currentUser={currentUser}
        />
      )}

      <EventModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingEvent(null); setIsCopyMode(false); }}
        onSave={handleSaveEvent}
        onDelete={onDeleteEvent}
        editingEvent={editingEvent}
        isCopyMode={isCopyMode}
        defaultInitialDate={selectedInitialDate}
        defaultEndDate={selectedEndDate}
        defaultIsAllDay={selectedIsAllDay}
        offices={offices}
        divisions={divisions}
        allUsers={allUsers}
        defaultAttendees={preselectedAttendees}
        currentUser={currentUser}
      />

      {/* 伝言メモ新規作成モーダル */}
      {isMemoModalOpen && memoTargetUser && (
        <div className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-2 sm:p-4">
          <div className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full shadow-xl overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between px-4 sm:px-5 py-3 sm:py-4 border-b border-slate-100 shrink-0 bg-slate-50">
              <div className="flex items-center gap-2 min-w-0">
                <MessageSquare className="w-4 h-4 sm:w-5 sm:h-5 text-indigo-500 shrink-0" />
                <h3 className="font-bold text-slate-800 text-xs sm:text-sm truncate">
                  {memoTargetUser.name} さんへの伝言メモ登録
                </h3>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsMemoModalOpen(false);
                  setMemoTargetUser(null);
                }}
                className="p-1 rounded-lg text-slate-400 hover:bg-slate-200 transition-colors shrink-0"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMemo} className="flex-1 overflow-y-auto p-3.5 sm:p-5 space-y-3.5 sm:space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  宛先 (メンバー)
                </label>
                <div className="flex items-center gap-2 p-2 sm:p-2.5 bg-indigo-50/50 border border-indigo-100/60 rounded-xl">
                  <img
                    src={getAvatarUrl(memoTargetUser.avatarUrl)}
                    alt={memoTargetUser.name}
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full border border-slate-200 shrink-0"
                    referrerPolicy="no-referrer"
                  />
                  <div className="min-w-0">
                    <p className="font-extrabold text-xs text-slate-800 truncate">{memoTargetUser.name}</p>
                    <p className="text-[10px] text-slate-500 mt-0.5 truncate">{memoTargetUser.office}・{memoTargetUser.division}</p>
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    相手方の会社・組織名
                  </label>
                  <input
                    type="text"
                    value={fromCompany}
                    onChange={(e) => setFromCompany(e.target.value)}
                    placeholder="例: 株式会社〇〇"
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    お名前 <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={fromName}
                    onChange={(e) => setFromName(e.target.value)}
                    placeholder="例: 鈴木様"
                    required
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  相手方の連絡先 (電話番号など)
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-400">
                    <Phone className="w-3.5 h-3.5" />
                  </span>
                  <input
                    type="text"
                    value={fromPhone}
                    onChange={(e) => setFromPhone(e.target.value)}
                    placeholder="例: 090-0000-0000"
                    className="w-full text-xs font-semibold pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 mb-2">
                  要件の種類
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-semibold">
                  <button
                    type="button"
                    onClick={() => setRequirementType('phone_called')}
                    className={`p-2 sm:p-2.5 rounded-lg border text-left transition-all ${
                      requirementType === 'phone_called'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    📞 電話がありました
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequirementType('has_message')}
                    className={`p-2 sm:p-2.5 rounded-lg border text-left transition-all ${
                      requirementType === 'has_message'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    💬 伝言があります
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequirementType('call_again')}
                    className={`p-2 sm:p-2.5 rounded-lg border text-left transition-all ${
                      requirementType === 'call_again'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    🔄 再度お電話します
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequirementType('please_call_back')}
                    className={`p-2 sm:p-2.5 rounded-lg border text-left transition-all ${
                      requirementType === 'please_call_back'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    🤙 折り返し連絡下さい
                  </button>
                  <button
                    type="button"
                    onClick={() => setRequirementType('custom')}
                    className={`p-2 sm:p-2.5 rounded-lg border text-left col-span-1 sm:col-span-2 transition-all ${
                      requirementType === 'custom'
                        ? 'bg-indigo-50 border-indigo-500 text-indigo-700 font-bold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    ✍️ その他 (自由入力)
                  </button>
                </div>
              </div>

              {requirementType === 'custom' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 mb-1">
                    カスタム要件名
                  </label>
                  <input
                    type="text"
                    value={customRequirementText}
                    onChange={(e) => setCustomRequirementText(e.target.value)}
                    placeholder="例: 来社予定など"
                    className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800"
                  />
                </div>
              )}

              <div className="relative">
                <label className="block text-xs font-bold text-slate-500 mb-1">
                  伝言内容本文 <span className="text-rose-500">*</span>
                </label>
                <UrlPastePopup
                  prompt={memoContentPasteHandler.pastePrompt}
                  onInsertCard={memoContentPasteHandler.handleInsertCard}
                  onKeepPlain={memoContentPasteHandler.handleKeepPlain}
                  onClose={memoContentPasteHandler.closePrompt}
                  positionClass="bottom-full mb-2 left-0"
                />
                <textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={memoContentPasteHandler.handlePaste}
                  placeholder="伝言の具体的な内容を入力してください。"
                  required
                  rows={4}
                  className="w-full text-xs font-semibold px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 resize-none"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-4 border-t border-slate-100 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsMemoModalOpen(false);
                    setMemoTargetUser(null);
                  }}
                  className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-lg transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-lg transition-colors shadow-sm"
                >
                  送信する
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* デジタルサイネージモード 全画面オーバーレイ */}
      {isSignageMode && (
        <div className="fixed inset-0 z-[9999] bg-slate-900 text-slate-100 flex flex-col font-sans overflow-hidden select-none">
          {/* Top Control Bar */}
          <div className="bg-slate-800/95 backdrop-blur-md border-b border-slate-700 px-4 sm:px-6 py-2.5 flex flex-wrap items-center justify-between gap-3 shrink-0 shadow-xl">
            {/* Left: Badge & Filters */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 px-3 py-1.5 bg-gradient-to-r from-indigo-600 to-indigo-800 text-white rounded-lg shadow-inner font-extrabold text-xs sm:text-sm tracking-wide">
                <Monitor className="w-4 h-4 text-amber-300 animate-pulse shrink-0" />
                <span>デジタルサイネージ</span>
              </div>

              <div className="hidden md:flex items-center gap-2.5 text-xs bg-slate-900/80 px-3 py-1.5 rounded-lg border border-slate-700">
                <div className="flex items-center gap-1">
                  <Building2 className="w-3.5 h-3.5 text-orange-400 shrink-0" />
                  <span className="text-slate-400 font-medium">拠点:</span>
                  <select
                    value={selectedOffice}
                    onChange={e => setSelectedOffice(e.target.value)}
                    className="bg-slate-800 border border-slate-600 text-white rounded px-2 py-0.5 font-bold focus:outline-none cursor-pointer"
                  >
                    {officeNames.filter(o => o !== '全社' && o !== '全拠点').map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>
                <div className="w-px h-3 bg-slate-700" />
                <div className="flex items-center gap-1">
                  <Users className="w-3.5 h-3.5 text-indigo-400 shrink-0" />
                  <span className="text-slate-400 font-medium">部署:</span>
                  <select
                    value={selectedDivision}
                    onChange={e => setSelectedDivision(e.target.value)}
                    className="bg-slate-800 border border-slate-600 text-white rounded px-2 py-0.5 font-bold focus:outline-none cursor-pointer"
                  >
                    {divisionNames.filter(d => d !== '全部署').map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>
            </div>

            {/* Center: Navigation & Real-time Clock */}
            <div className="flex items-center gap-3 sm:gap-4">
              <div className="flex items-center gap-1 bg-slate-800 border border-slate-700 rounded-lg p-0.5">
                <button
                  type="button"
                  onClick={() => changeDate(-1)}
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 transition-colors cursor-pointer"
                  title="前日"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentDate(new Date())}
                  className="px-2 py-0.5 text-xs font-bold bg-indigo-600 text-white rounded hover:bg-indigo-500 transition-colors cursor-pointer"
                >
                  今日
                </button>
                <button
                  type="button"
                  onClick={() => changeDate(1)}
                  className="p-1 hover:bg-slate-700 rounded text-slate-300 transition-colors cursor-pointer"
                  title="翌日"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>

              <div className="text-xs sm:text-sm font-extrabold text-slate-200">
                {currentDate.getFullYear()}年{currentDate.getMonth() + 1}月{currentDate.getDate()}日 (
                {['日', '月', '火', '水', '木', '金', '土'][currentDate.getDay()]})
              </div>

              <div className="flex items-center gap-1.5 bg-slate-950 px-3 py-1 rounded-lg border border-indigo-500/40 text-indigo-300 font-mono text-base sm:text-lg font-black tracking-wider shadow-inner">
                <Clock className="w-4 h-4 text-indigo-400" />
                <span>{liveClock.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
              </div>
            </div>

            {/* Right: Sync Status & Exit */}
            <div className="flex items-center gap-2.5">
              <div className="hidden lg:flex items-center gap-2 bg-emerald-950/90 border border-emerald-500/40 text-emerald-300 text-xs px-2.5 py-1 rounded-lg font-bold">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                </span>
                <span>30秒自動更新</span>
                <span className="text-[10px] text-emerald-400 font-mono ml-0.5">({countdown}s)</span>
              </div>

              <button
                type="button"
                onClick={() => {
                  if (onRefetchEvents) {
                    onRefetchEvents();
                    setLastRefetchedAt(new Date());
                    setCountdown(30);
                  }
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 border border-slate-600 rounded-lg text-xs font-bold text-slate-200 transition-all cursor-pointer shadow-xs"
                title="即時スケジュール手動更新"
              >
                <RefreshCw className="w-3.5 h-3.5 text-indigo-400" />
                <span className="hidden sm:inline">更新</span>
              </button>

              <button
                type="button"
                onClick={() => handleToggleSignageMode(false)}
                className="flex items-center gap-1 px-3 py-1.5 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-xs font-extrabold shadow-sm transition-all cursor-pointer"
                title="全画面サイネージモードを終了"
              >
                <Minimize2 className="w-4 h-4" />
                <span>解除</span>
              </button>
            </div>
          </div>

          {/* Full Screen Calendar View */}
          <div className="flex-1 overflow-auto p-2 sm:p-3 bg-slate-950">
            <div className="h-full bg-white rounded-xl shadow-2xl overflow-auto text-slate-800 border border-slate-800">
              {renderTeamDayView()}
            </div>
          </div>
        </div>
      )}
      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
