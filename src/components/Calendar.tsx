import React, { useState, useEffect, useCallback } from 'react';
import { CalendarEvent, EventType, User, OfficeMaster, DivisionMaster } from '../types';
import { ChevronLeft, ChevronRight, List as ListIcon, Calendar as CalendarIcon, Plus, MapPin, Video, AlignLeft, RefreshCw, Clock, Link as LinkIcon, Loader2, Building2, Users, Paperclip } from 'lucide-react';
import { EventModal } from './EventModal';
import { fetchIcalFeed } from '../utils/icalParser';
import { initialOffices, initialDivisions } from '../data/mockData';
import { renderWithClickableLinks } from '../utils/linkify';

interface CalendarProps {
  events: CalendarEvent[];
  onAddEvent: (event: Omit<CalendarEvent, 'id'>) => void;
  onUpdateEvent?: (event: CalendarEvent) => void;
  onDeleteEvent?: (eventId: string) => void;
  currentUser?: User;
  allUsers?: User[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
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

const icalStyle = 'bg-purple-100 text-purple-800 border-purple-300 hover:bg-purple-200';

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
  offices = initialOffices,
  divisions = initialDivisions,
}: CalendarProps) {
  const [view, setView] = useState<ViewMode>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  
  // 拠点・部署のプルダウンフィルター状態
  const [selectedOffice, setSelectedOffice] = useState<string>('全社');
  const [selectedDivision, setSelectedDivision] = useState<string>('全部署');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');
  const [showIcal, setShowIcal] = useState<boolean>(true);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | null>(null);
  const [selectedInitialDate, setSelectedInitialDate] = useState<string | undefined>(undefined);

  // iCal integration state
  const [icalEvents, setIcalEvents] = useState<CalendarEvent[]>([]);
  const [isIcalLoading, setIsIcalLoading] = useState(false);
  const [icalError, setIcalError] = useState<string | null>(null);
  
  // Drag and drop state
  const [draggedEventId, setDraggedEventId] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);

  const officeNames = Array.from(new Set(offices.map(o => o.name)));
  const divisionNames = Array.from(new Set(divisions.map(d => d.name)));

  // Fetch iCal feed when currentUser.icalUrl is set
  const loadIcalEvents = useCallback(async () => {
    if (!currentUser?.icalUrl) {
      setIcalEvents([]);
      return;
    }
    setIsIcalLoading(true);
    setIcalError(null);
    try {
      const fetched = await fetchIcalFeed(currentUser.icalUrl, currentUser);
      setIcalEvents(fetched);
    } catch (err) {
      console.error('Failed to load iCal feed:', err);
      setIcalError('iCalフィードの取得に失敗しました');
    } finally {
      setIsIcalLoading(false);
    }
  }, [currentUser?.icalUrl, currentUser]);

  useEffect(() => {
    loadIcalEvents();
  }, [loadIcalEvents]);

  const combinedEvents = [...events, ...icalEvents];
  
  // イベントのフィルタリング処理
  const filteredEvents = combinedEvents.filter(e => {
    if (e.isIcal) return showIcal;

    if (selectedTypeFilter !== 'all' && e.type !== selectedTypeFilter) {
      return false;
    }

    // 拠点フィルタ (selectedOffice)
    if (selectedOffice !== '全社' && selectedOffice !== '全拠点') {
      const eOffice = e.office;
      if (eOffice && eOffice !== '全社' && eOffice !== selectedOffice) {
        const attendeeOfficeMatch = e.attendees?.some(a => a.office === selectedOffice);
        if (!attendeeOfficeMatch) return false;
      }
    }

    // 部署フィルタ (selectedDivision)
    if (selectedDivision !== '全部署') {
      const eDiv = e.division;
      if (eDiv && eDiv !== '全部署' && eDiv !== selectedDivision) {
        const attendeeDivMatch = e.attendees?.some(a => a.division === selectedDivision);
        if (!attendeeDivMatch) return false;
      }
    }

    return true;
  });

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

  const openAddModalWithDate = (dateStr?: string) => {
    setEditingEvent(null);
    setSelectedInitialDate(dateStr);
    setIsModalOpen(true);
  };

  const handleEventClick = (e: React.MouseEvent, event: CalendarEvent) => {
    e.stopPropagation();
    setEditingEvent(event);
    setSelectedInitialDate(undefined);
    setIsModalOpen(true);
  };

  const handleSaveEvent = (eventData: Omit<CalendarEvent, 'id'> | CalendarEvent) => {
    if ('id' in eventData && eventData.id) {
      onUpdateEvent?.(eventData as CalendarEvent);
    } else {
      onAddEvent(eventData as Omit<CalendarEvent, 'id'>);
    }
  };

  // Drag & Drop handlers
  const handleDragStart = (e: React.DragEvent, eventId: string) => {
    setDraggedEventId(eventId);
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

  const handleDrop = (e: React.DragEvent, targetDateStr: string, targetHour?: number) => {
    e.preventDefault();
    setDragOverKey(null);
    const eventId = draggedEventId || e.dataTransfer.getData('text/plain');
    if (!eventId) return;

    const ev = combinedEvents.find(item => item.id === eventId);
    if (!ev || ev.isIcal) return; // iCal events are read-only from feed

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

    onUpdateEvent?.({
      ...ev,
      start: newStartIso,
      end: newEndIso,
    });

    setDraggedEventId(null);
  };

  // Helper date calculations
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();

  const getDaysInMonth = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
  const getFirstDayOfMonth = (y: number, m: number) => new Date(y, m, 1).getDay();

  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const days = Array.from({ length: 42 }, (_, i) => {
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
    const startTimeStr = startDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    if (!e.end) return `${startTimeStr}〜`;
    const endDate = new Date(e.end);
    const endTimeStr = endDate.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' });
    return `${startTimeStr}〜${endTimeStr}`;
  };

  const isSameDay = (d1: Date, d2: Date) => {
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
  };

  const hoursList = Array.from({ length: 15 }, (_, i) => i + 8); // 8:00 to 22:00

  const getEventStyle = (e: CalendarEvent) => {
    if (e.isIcal) return icalStyle;
    return typeStyles[e.type];
  };

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-slate-900/5 overflow-hidden flex flex-col min-h-[600px] lg:h-[calc(100vh-8rem)]">
      {/* Header Toolbar */}
      <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between bg-slate-50 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-lg sm:text-xl font-bold text-slate-800 tracking-tight min-w-[200px]">
            {getHeaderTitle()}
          </h2>
          <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
            <button onClick={() => changeDate(-1)} className="p-1 hover:bg-slate-100 rounded-md text-slate-600 transition-colors" title="前へ"><ChevronLeft className="w-5 h-5"/></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm font-semibold hover:bg-slate-100 rounded-md text-slate-700 transition-colors">今日</button>
            <button onClick={() => changeDate(1)} className="p-1 hover:bg-slate-100 rounded-md text-slate-600 transition-colors" title="次へ"><ChevronRight className="w-5 h-5"/></button>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          {/* Filters */}
          <div className="flex flex-wrap items-center gap-3 bg-white px-3 py-1.5 rounded-lg border border-slate-200 text-sm shadow-sm">
            {/* 拠点プルダウン (旧「会社」) */}
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-orange-500 shrink-0" />
              <span className="font-semibold text-slate-600 text-xs shrink-0">拠点:</span>
              <select
                value={selectedOffice}
                onChange={e => setSelectedOffice(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="全社">全社</option>
                {officeNames.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            {/* 部署プルダウン (旧「チーム」) */}
            <div className="flex items-center gap-1.5 pl-2.5 border-l border-slate-200">
              <Users className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              <span className="font-semibold text-slate-600 text-xs shrink-0">部署:</span>
              <select
                value={selectedDivision}
                onChange={e => setSelectedDivision(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="全部署">全部署</option>
                {divisionNames.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>

            {/* 区分プルダウン */}
            <div className="flex items-center gap-1.5 pl-2.5 border-l border-slate-200">
              <span className="font-semibold text-slate-600 text-xs shrink-0">区分:</span>
              <select
                value={selectedTypeFilter}
                onChange={e => setSelectedTypeFilter(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded px-2 py-1 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">全区分</option>
                {Object.keys(typeLabels).map(key => (
                  <option key={key} value={key}>{typeLabels[key as EventType]}</option>
                ))}
              </select>
            </div>

            {/* iCal */}
            <label className="flex items-center gap-1.5 cursor-pointer select-none pl-2 border-l border-slate-200">
              <input
                type="checkbox"
                checked={showIcal}
                onChange={e => setShowIcal(e.target.checked)}
                className="rounded border-slate-300 text-purple-600 focus:ring-purple-500 cursor-pointer"
              />
              <span className="font-medium text-purple-700 text-xs flex items-center gap-1">
                <LinkIcon className="w-3 h-3 text-purple-500" />
                iCal
              </span>
            </label>
          </div>

          {/* iCal Sync Badge */}
          {currentUser?.icalUrl && (
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-purple-50 border border-purple-200 text-purple-700 rounded-lg text-xs font-semibold shadow-xs">
              <span className="flex items-center gap-1">
                <LinkIcon className="w-3.5 h-3.5 text-purple-600" />
                iCal同期({icalEvents.length}件)
              </span>
              <button 
                onClick={loadIcalEvents} 
                disabled={isIcalLoading}
                className="p-0.5 hover:bg-purple-100 rounded transition-colors text-purple-600"
                title="iCalを再同期"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${isIcalLoading ? 'animate-spin' : ''}`} />
              </button>
            </div>
          )}
          
          {/* View selector */}
          <div className="flex items-center bg-white rounded-lg border border-slate-200 p-1 shadow-sm text-xs font-semibold">
            <button
              onClick={() => setView('month')}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${view === 'month' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              月
            </button>
            <button
              onClick={() => setView('week')}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${view === 'week' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              週
            </button>
            <button
              onClick={() => setView('day')}
              className={`px-2.5 py-1.5 rounded-md transition-colors ${view === 'day' ? 'bg-indigo-50 text-indigo-700 font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
            >
              日
            </button>
            <button
              onClick={() => setView('list')}
              className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}
              title="リスト表示"
            >
              <ListIcon className="w-4 h-4"/>
            </button>
          </div>
          
          <button onClick={() => openAddModalWithDate()} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm ml-auto sm:ml-0">
            <Plus className="w-4 h-4"/>
            予定追加
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-auto bg-white">
        {/* 1. MONTH VIEW */}
        {view === 'month' && (
          <div className="min-w-[700px] h-full flex flex-col">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 shrink-0">
              {['日', '月', '火', '水', '木', '金', '土'].map((d, idx) => (
                <div key={d} className={`py-2.5 text-center text-xs font-bold tracking-wider ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-slate-500'}`}>{d}</div>
              ))}
            </div>
            <div className="flex-1 grid grid-cols-7 grid-rows-5 lg:grid-rows-6">
              {days.slice(0, 35).map((day, i) => {
                const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                const cellDateStr = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
                const cellEvents = cellDateStr ? filteredEvents.filter(e => e.start.startsWith(cellDateStr)) : [];
                const cellKey = `month-cell-${i}`;
                const isDragOver = dragOverKey === cellKey;
                
                return (
                  <div
                    key={i}
                    onClick={() => cellDateStr && openAddModalWithDate(cellDateStr)}
                    onDragOver={(e) => cellDateStr && handleDragOver(e, cellKey)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => cellDateStr && handleDrop(e, cellDateStr)}
                    className={`border-b border-r border-slate-100 p-1.5 min-h-[100px] group relative transition-colors ${
                      !day ? 'bg-slate-50/50' : isDragOver ? 'bg-indigo-100/70 ring-2 ring-indigo-400' : 'hover:bg-indigo-50/20 cursor-pointer'
                    }`}
                  >
                    {day && (
                      <div className="h-full flex flex-col">
                        <div className="flex items-center justify-between mb-1.5">
                          <div className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full ${isToday ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700'}`}>
                            {day}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); openAddModalWithDate(cellDateStr!); }}
                            className="opacity-0 group-hover:opacity-100 p-0.5 text-indigo-600 hover:bg-indigo-100 rounded transition-all"
                            title="この日に予定を追加"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <div className="flex-1 space-y-1 overflow-y-auto pr-1">
                          {cellEvents.map(e => (
                            <div
                              key={e.id}
                              draggable={!e.isIcal}
                              onDragStart={(eDrag) => handleDragStart(eDrag, e.id)}
                              onClick={(eClick) => handleEventClick(eClick, e)}
                              className={`text-[10px] px-1.5 py-0.5 rounded truncate border font-medium cursor-pointer transition-all shadow-xs ${getEventStyle(e)}`}
                              title={`${e.isIcal ? '[iCal連携] ' : ''}${e.title} (${formatEventTime(e)})`}
                            >
                              <span className="font-bold mr-1">
                                {e.isIcal ? '[iCal]' : e.isAllDay ? '[終日]' : new Date(e.start).toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'})}
                              </span>
                              {e.title}
                            </div>
                          ))}
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
        {view === 'week' && (
          <div className="min-w-[800px] h-full flex flex-col">
            {/* Week Header */}
            <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50 shrink-0 sticky top-0 z-10">
              <div className="py-3 px-2 text-center text-xs font-bold text-slate-400 border-r border-slate-200">時間</div>
              {weekDays.map((d, idx) => {
                const isToday = isSameDay(d, new Date());
                const dayName = ['日', '月', '火', '水', '木', '金', '土'][d.getDay()];
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                return (
                  <div
                    key={idx}
                    onClick={() => openAddModalWithDate(dateStr)}
                    className={`py-2 px-1 text-center border-r border-slate-200 cursor-pointer hover:bg-indigo-50/40 transition-colors ${isToday ? 'bg-indigo-50/60' : ''}`}
                  >
                    <div className={`text-xs font-semibold ${idx === 0 ? 'text-red-500' : idx === 6 ? 'text-blue-500' : 'text-slate-500'}`}>{dayName}</div>
                    <div className={`text-sm font-bold mt-0.5 inline-flex items-center justify-center w-7 h-7 rounded-full ${isToday ? 'bg-indigo-600 text-white' : 'text-slate-800'}`}>
                      {d.getDate()}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* All-Day Events row */}
            <div className="grid grid-cols-8 border-b border-slate-200 bg-slate-50/50 shrink-0">
              <div className="py-2 px-2 text-center text-[11px] font-bold text-slate-500 border-r border-slate-200 flex items-center justify-center">終日</div>
              {weekDays.map((d, idx) => {
                const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                const allDayEvs = filteredEvents.filter(e => e.isAllDay && e.start.startsWith(dateStr));
                const slotKey = `week-allday-${idx}`;
                const isDragOver = dragOverKey === slotKey;

                return (
                  <div
                    key={idx}
                    onClick={() => openAddModalWithDate(dateStr)}
                    onDragOver={(e) => handleDragOver(e, slotKey)}
                    onDragLeave={handleDragLeave}
                    onDrop={(e) => handleDrop(e, dateStr)}
                    className={`p-1 border-r border-slate-200 min-h-[40px] cursor-pointer space-y-1 transition-colors ${
                      isDragOver ? 'bg-indigo-100/70 ring-2 ring-indigo-400' : 'hover:bg-indigo-50/30'
                    }`}
                  >
                    {allDayEvs.map(e => (
                      <div
                        key={e.id}
                        draggable={!e.isIcal}
                        onDragStart={(eDrag) => handleDragStart(eDrag, e.id)}
                        onClick={eClick => handleEventClick(eClick, e)}
                        className={`text-[10px] px-1.5 py-0.5 rounded truncate border font-semibold cursor-pointer shadow-xs transition-all ${getEventStyle(e)}`}
                        title={e.title}
                      >
                        {e.isIcal ? `[iCal] ${e.title}` : e.title}
                      </div>
                    ))}
                  </div>
                );
              })}
            </div>

            {/* Hourly Grid */}
            <div className="flex-1 overflow-y-auto">
              {hoursList.map(h => {
                const hourFormatted = `${String(h).padStart(2, '0')}:00`;
                return (
                  <div key={h} className="grid grid-cols-8 border-b border-slate-100 min-h-[50px]">
                    <div className="py-2 px-2 text-center text-xs font-medium text-slate-400 border-r border-slate-200 bg-slate-50/30">
                      {hourFormatted}
                    </div>
                    {weekDays.map((d, idx) => {
                      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                      const slotDateTimeStr = `${dateStr}T${String(h).padStart(2, '0')}:00`;
                      const slotKey = `week-slot-${idx}-${h}`;
                      const isDragOver = dragOverKey === slotKey;
                      
                      const slotEvents = filteredEvents.filter(e => {
                        if (e.isAllDay) return false;
                        if (!e.start.startsWith(dateStr)) return false;
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
                          className={`border-r border-slate-100 p-1 cursor-pointer transition-colors relative group ${
                            isDragOver ? 'bg-indigo-100/70 ring-2 ring-indigo-400' : 'hover:bg-indigo-50/30'
                          }`}
                        >
                          {slotEvents.map(e => (
                            <div
                              key={e.id}
                              draggable={!e.isIcal}
                              onDragStart={(eDrag) => handleDragStart(eDrag, e.id)}
                              onClick={eClick => handleEventClick(eClick, e)}
                              className={`text-[11px] p-1.5 rounded border font-medium mb-1 shadow-xs cursor-pointer transition-all ${getEventStyle(e)}`}
                              title={`${e.isIcal ? '[iCal] ' : ''}${e.title} (${formatEventTime(e)})`}
                            >
                              <div className="font-bold truncate">{e.isIcal ? `[iCal] ${e.title}` : e.title}</div>
                              <div className="text-[9px] opacity-80">{formatEventTime(e)}</div>
                            </div>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* 3. DAY VIEW */}
        {view === 'day' && (
          <div className="max-w-4xl mx-auto h-full flex flex-col p-4 sm:p-6">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-2xl bg-indigo-600 text-white flex flex-col items-center justify-center font-bold shadow-md">
                  <span className="text-xs uppercase leading-none">{['日', '月', '火', '水', '木', '金', '土'][currentDate.getDay()]}</span>
                  <span className="text-lg leading-none mt-0.5">{currentDate.getDate()}</span>
                </div>
                <div>
                  <h3 className="text-lg font-bold text-slate-800">{getHeaderTitle()}の予定</h3>
                  <p className="text-xs text-slate-500">予定のクリックで詳細確認・編集を行えます</p>
                </div>
              </div>
              <button
                onClick={() => {
                  const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                  openAddModalWithDate(dStr);
                }}
                className="flex items-center gap-1 px-3.5 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold text-xs rounded-lg transition-colors"
              >
                <Plus className="w-4 h-4"/>
                この日に追加
              </button>
            </div>

            {/* All-Day Events */}
            {(() => {
              const dStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
              const dayAllDayEvents = filteredEvents.filter(e => e.isAllDay && e.start.startsWith(dStr));
              if (dayAllDayEvents.length === 0) return null;
              return (
                <div className="mb-6 p-4 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-slate-400" />
                    終日の予定
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {dayAllDayEvents.map(e => (
                      <div
                        key={e.id}
                        draggable={!e.isIcal}
                        onDragStart={(eDrag) => handleDragStart(eDrag, e.id)}
                        onClick={eClick => handleEventClick(eClick, e)}
                        className={`p-3 rounded-lg border font-semibold cursor-pointer transition-all ${getEventStyle(e)}`}
                        title="クリックで詳細"
                      >
                        <div className="flex items-center justify-between">
                          <span>{e.isIcal ? `[iCal] ${e.title}` : e.title}</span>
                          <span className="text-[10px] px-2 py-0.5 bg-white/60 rounded-full">{e.isIcal ? 'iCal連携' : typeLabels[e.type]}</span>
                        </div>
                        {e.memo && <div className="text-xs font-normal mt-1 opacity-90">{renderWithClickableLinks(e.memo)}</div>}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}

            {/* Timeline slots */}
            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {hoursList.map(h => {
                const hourFormatted = `${String(h).padStart(2, '0')}:00`;
                const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(currentDate.getDate()).padStart(2, '0')}`;
                const slotDateTimeStr = `${dateStr}T${String(h).padStart(2, '0')}:00`;
                const slotKey = `day-slot-${h}`;
                const isDragOver = dragOverKey === slotKey;

                const dayEvents = filteredEvents.filter(e => {
                  if (e.isAllDay) return false;
                  if (!e.start.startsWith(dateStr)) return false;
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
                    className={`flex gap-4 p-3 rounded-xl border transition-colors cursor-pointer group ${
                      isDragOver ? 'bg-indigo-100/70 border-indigo-400 ring-2 ring-indigo-400' : 'border-slate-100 hover:border-indigo-200 hover:bg-indigo-50/20'
                    }`}
                  >
                    <div className="w-16 shrink-0 text-xs font-semibold text-slate-400 pt-0.5">{hourFormatted}</div>
                    <div className="flex-1 min-h-[32px] space-y-2">
                      {dayEvents.length > 0 ? (
                        dayEvents.map(e => (
                          <div
                            key={e.id}
                            draggable={!e.isIcal}
                            onDragStart={(eDrag) => handleDragStart(eDrag, e.id)}
                            onClick={eClick => handleEventClick(eClick, e)}
                            className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-2 shadow-xs cursor-pointer transition-all ${getEventStyle(e)}`}
                            title="クリックで詳細"
                          >
                            <div>
                              <div className="font-bold text-sm text-slate-900">{e.isIcal ? `[iCal] ${e.title}` : e.title}</div>
                              <div className="text-xs font-medium text-slate-600 mt-0.5">{formatEventTime(e)} {e.location ? `• ${e.location}` : ''}</div>
                              {e.memo && (
                                <div className="text-xs text-slate-700 mt-1 bg-white/50 p-1.5 rounded border border-slate-200/50">
                                  {renderWithClickableLinks(e.memo)}
                                </div>
                              )}
                            </div>
                            <span className="text-[10px] px-2.5 py-1 rounded-md font-bold border bg-white/80 self-start sm:self-center">
                              {e.isIcal ? 'iCal連携' : typeLabels[e.type]}
                            </span>
                          </div>
                        ))
                      ) : (
                        <div className="text-xs text-slate-300 opacity-0 group-hover:opacity-100 transition-opacity pt-0.5 flex items-center gap-1">
                          <Plus className="w-3.5 h-3.5"/> クリックして{hourFormatted}に予定を追加
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
          <div className="p-6 max-w-4xl mx-auto space-y-4">
            {filteredEvents.length > 0 ? (
              filteredEvents.sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime()).map(e => (
                <div
                  key={e.id}
                  onClick={(eClick) => handleEventClick(eClick, e)}
                  className="flex gap-5 p-5 rounded-xl border border-slate-200 hover:border-indigo-300 transition-all bg-white shadow-sm cursor-pointer hover:shadow-md"
                >
                  <div className="w-20 shrink-0 text-center flex flex-col justify-center">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{new Date(e.start).toLocaleDateString('ja-JP', {month:'short', day:'numeric'})}</div>
                    <div className="text-sm font-bold text-slate-800 mt-1">{formatEventTime(e)}</div>
                  </div>
                  <div className="w-px bg-slate-100 shrink-0 my-1"></div>
                  <div className="flex-1 min-w-0 py-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider border ${getEventStyle(e)}`}>
                        {e.isIcal ? 'iCal連携' : typeLabels[e.type]}
                      </span>
                      <h3 className="font-bold text-slate-900 truncate text-base">{e.title}</h3>
                      {e.isIcal && <LinkIcon className="w-4 h-4 text-purple-600 ml-1" title="iCal連携カレンダー" />}
                    </div>
                    {e.memo && (
                      <div className="text-xs text-slate-700 my-2 bg-slate-50 p-2 rounded-lg border border-slate-100">
                        {renderWithClickableLinks(e.memo)}
                      </div>
                    )}
                    <div className="flex flex-wrap gap-4 text-xs text-slate-500 mt-2 font-medium items-center">
                      {e.location && <div className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400"/> {e.location}</div>}
                      {e.attendees && e.attendees.length > 0 && (
                        <div className="flex items-center gap-1.5">
                          <Users className="w-4 h-4 text-slate-400" />
                          <div className="flex -space-x-1.5">
                            {e.attendees.map(u => (
                              <img key={u.id} src={u.avatarUrl} alt={u.name} title={u.name} className="w-4 h-4 rounded-full border border-white object-cover" />
                            ))}
                          </div>
                          <span>({e.attendees.length}名)</span>
                        </div>
                      )}
                      {e.attachments && e.attachments.length > 0 && (
                        <div className="flex items-center gap-1 text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full text-[11px] font-semibold border border-indigo-100">
                          <Paperclip className="w-3 h-3" />
                          <span>添付ファイル ({e.attachments.length})</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-16">
                <CalendarIcon className="w-12 h-12 text-slate-300 mx-auto mb-4" />
                <h3 className="text-slate-800 font-semibold mb-1">予定がありません</h3>
                <p className="text-slate-500 text-sm">条件に一致する予定は見つかりませんでした。</p>
              </div>
            )}
          </div>
        )}
      </div>

      <EventModal
        isOpen={isModalOpen}
        onClose={() => { setIsModalOpen(false); setEditingEvent(null); }}
        onSave={handleSaveEvent}
        onDelete={onDeleteEvent}
        editingEvent={editingEvent}
        defaultInitialDate={selectedInitialDate}
        offices={offices}
        divisions={divisions}
        allUsers={allUsers}
      />
    </div>
  );
}
