import React, { useState } from 'react';
import { CalendarEvent, EventType } from '../types';
import { ChevronLeft, ChevronRight, List as ListIcon, Calendar as CalendarIcon, Plus, MapPin, Video, AlignLeft, RefreshCw } from 'lucide-react';
import { EventModal } from './EventModal';

interface CalendarProps {
  events: CalendarEvent[];
  onAddEvent: (event: Omit<CalendarEvent, 'id'>) => void;
}

const typeStyles: Record<EventType, string> = {
  company: 'bg-orange-100 text-orange-700 border-orange-200',
  team: 'bg-indigo-100 text-indigo-700 border-indigo-200',
  personal: 'bg-emerald-100 text-emerald-700 border-emerald-200'
};

const typeLabels: Record<EventType, string> = {
  company: '会社全体',
  team: 'チーム',
  personal: '個人'
};

export function Calendar({ events, onAddEvent }: CalendarProps) {
  const [view, setView] = useState<'month' | 'list'>('month');
  const [currentDate, setCurrentDate] = useState(new Date());
  const [filters, setFilters] = useState({ company: true, team: true, personal: true });
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filteredEvents = events.filter(e => filters[e.type]);

  const changeMonth = (offset: number) => {
    const newDate = new Date(currentDate);
    newDate.setMonth(currentDate.getMonth() + offset);
    setCurrentDate(newDate);
  };

  const getDaysInMonth = (year: number, month: number) => new Date(year, month + 1, 0).getDate();
  const getFirstDayOfMonth = (year: number, month: number) => new Date(year, month, 1).getDay();

  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);

  const days = Array.from({ length: 42 }, (_, i) => {
    const day = i - firstDay + 1;
    if (day > 0 && day <= daysInMonth) return day;
    return null;
  });

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm ring-1 ring-slate-900/5 overflow-hidden flex flex-col min-h-[600px] lg:h-[calc(100vh-8rem)]">
      {/* Header Toolbar */}
      <div className="p-4 border-b border-slate-200 flex flex-col xl:flex-row gap-4 items-start xl:items-center justify-between bg-slate-50 shrink-0">
        <div className="flex items-center gap-4">
          <h2 className="text-xl font-bold text-slate-800 w-32 tracking-tight">
            {year}年{month + 1}月
          </h2>
          <div className="flex items-center gap-1 bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
            <button onClick={() => changeMonth(-1)} className="p-1 hover:bg-slate-100 rounded-md text-slate-600 transition-colors"><ChevronLeft className="w-5 h-5"/></button>
            <button onClick={() => setCurrentDate(new Date())} className="px-3 py-1 text-sm font-semibold hover:bg-slate-100 rounded-md text-slate-700 transition-colors">今日</button>
            <button onClick={() => changeMonth(1)} className="p-1 hover:bg-slate-100 rounded-md text-slate-600 transition-colors"><ChevronRight className="w-5 h-5"/></button>
          </div>
        </div>
        
        <div className="flex flex-wrap items-center gap-3 w-full xl:w-auto">
          <div className="flex items-center gap-4 bg-white px-4 py-2 rounded-lg border border-slate-200 text-sm shadow-sm">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={filters.company} onChange={e => setFilters(f => ({...f, company: e.target.checked}))} className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"/>
              <span className="font-medium text-slate-700">会社</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={filters.team} onChange={e => setFilters(f => ({...f, team: e.target.checked}))} className="rounded border-slate-300 text-indigo-500 focus:ring-indigo-500"/>
              <span className="font-medium text-slate-700">チーム</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input type="checkbox" checked={filters.personal} onChange={e => setFilters(f => ({...f, personal: e.target.checked}))} className="rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"/>
              <span className="font-medium text-slate-700">個人</span>
            </label>
          </div>
          
          <div className="flex items-center bg-white rounded-lg border border-slate-200 p-1 shadow-sm">
            <button onClick={() => setView('month')} className={`p-1.5 rounded-md transition-colors ${view === 'month' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><CalendarIcon className="w-4 h-4"/></button>
            <button onClick={() => setView('list')} className={`p-1.5 rounded-md transition-colors ${view === 'list' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-500 hover:bg-slate-50'}`}><ListIcon className="w-4 h-4"/></button>
          </div>
          
          <button onClick={() => setIsModalOpen(true)} className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm">
            <Plus className="w-4 h-4"/>
            予定追加
          </button>
        </div>
      </div>

      {/* Main View Area */}
      <div className="flex-1 overflow-auto bg-white">
        {view === 'month' ? (
          <div className="min-w-[700px] h-full flex flex-col">
            <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 shrink-0">
              {['日', '月', '火', '水', '木', '金', '土'].map(d => (
                <div key={d} className="py-2.5 text-center text-xs font-bold text-slate-500 tracking-wider">{d}</div>
              ))}
            </div>
            <div className="flex-1 grid grid-cols-7 grid-rows-5 lg:grid-rows-6">
              {days.slice(0, 35).map((day, i) => {
                const isToday = day === new Date().getDate() && month === new Date().getMonth() && year === new Date().getFullYear();
                const cellDateStr = day ? `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}` : null;
                const cellEvents = cellDateStr ? filteredEvents.filter(e => e.start.startsWith(cellDateStr)) : [];
                
                return (
                  <div key={i} className={`border-b border-r border-slate-100 p-1.5 min-h-[100px] ${!day ? 'bg-slate-50/50' : 'hover:bg-slate-50/30 transition-colors'}`}>
                    {day && (
                      <div className="h-full flex flex-col">
                        <div className={`text-xs font-semibold w-6 h-6 flex items-center justify-center rounded-full mb-1.5 ${isToday ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-700'}`}>
                          {day}
                        </div>
                        <div className="flex-1 space-y-1 overflow-y-auto pr-1">
                          {cellEvents.map(e => (
                            <div key={e.id} className={`text-[10px] px-1.5 py-1 rounded truncate border font-medium cursor-default transition-transform hover:scale-[1.02] ${typeStyles[e.type]}`} title={e.title}>
                              {new Date(e.start).toLocaleTimeString('ja-JP', {hour: '2-digit', minute:'2-digit'})} {e.title}
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
        ) : (
          <div className="p-6 max-w-4xl mx-auto space-y-4">
            {filteredEvents.length > 0 ? (
              filteredEvents.sort((a,b) => new Date(a.start).getTime() - new Date(b.start).getTime()).map(e => (
                <div key={e.id} className="flex gap-5 p-5 rounded-xl border border-slate-200 hover:border-indigo-300 transition-colors bg-white shadow-sm">
                  <div className="w-16 shrink-0 text-center flex flex-col justify-center">
                    <div className="text-xs font-semibold text-slate-500 uppercase tracking-wider">{new Date(e.start).toLocaleDateString('ja-JP', {month:'short', day:'numeric'})}</div>
                    <div className="text-lg font-bold text-slate-800">{new Date(e.start).toLocaleTimeString('ja-JP', {hour:'2-digit', minute:'2-digit'})}</div>
                  </div>
                  <div className="w-px bg-slate-100 shrink-0 my-1"></div>
                  <div className="flex-1 min-w-0 py-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold tracking-wider border ${typeStyles[e.type]}`}>{typeLabels[e.type]}</span>
                      <h3 className="font-bold text-slate-900 truncate text-base">{e.title}</h3>
                      {e.isGoogleSynced && <RefreshCw className="w-4 h-4 text-blue-500 ml-1" title="Googleカレンダー同期済み" />}
                    </div>
                    <div className="flex flex-wrap gap-5 text-xs text-slate-500 mt-2.5 font-medium">
                      {e.location && <div className="flex items-center gap-1.5"><MapPin className="w-4 h-4 text-slate-400"/> {e.location}</div>}
                      {e.url && <div className="flex items-center gap-1.5"><Video className="w-4 h-4 text-slate-400"/> オンライン</div>}
                      {e.memo && <div className="flex items-center gap-1.5"><AlignLeft className="w-4 h-4 text-slate-400"/> 詳細あり</div>}
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

      <EventModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} onSave={onAddEvent} />
    </div>
  );
}
