import React, { useState } from 'react';
import { CalendarEvent, User } from '../types';
import { Clock, Phone } from 'lucide-react';
import { getAvatarUrl } from '../utils/avatar';
import { getLocalDateStr } from '../utils/dateUtils';

export interface TeamWeekMemberRowProps {
  member: User;
  dates: Date[];
  dayHasEvents: boolean[];
  eventDictionary: Map<string, CalendarEvent[]>;
  teamWeekGridStyle: React.CSSProperties;
  draggedEventId: string | null;
  isSignageMode: boolean;
  onCellMouseDown: (e: React.MouseEvent, dateStr: string, members: User[]) => void;
  onCellMouseEnter: (dateStr: string) => void;
  onEventClick: (e: React.MouseEvent, event: CalendarEvent) => void;
  onDragStart: (e: React.DragEvent, eventId: string, memberId?: string) => void;
  onDragEnd: () => void;
  onDrop: (
    e: React.DragEvent,
    dateStr: string,
    hour?: number,
    memberId?: string
  ) => void;
  onOpenMemoModal: (member: User) => void;
  getEventStyle: (e: CalendarEvent, forceSolid?: boolean) => string;
  getMultiDayStyle: (e: CalendarEvent, cellDateStr: string, isMonth?: boolean) => any;
  formatEventTime: (e: CalendarEvent) => string;
  sortEvents: (events: CalendarEvent[]) => CalendarEvent[];
  isDateInSelectionRange: (dateStr: string, memberId?: string) => boolean;
}

export const TeamWeekMemberRow: React.FC<TeamWeekMemberRowProps> = React.memo(({
  member,
  dates,
  dayHasEvents,
  eventDictionary,
  teamWeekGridStyle,
  draggedEventId,
  isSignageMode,
  onCellMouseDown,
  onCellMouseEnter,
  onEventClick,
  onDragStart,
  onDragEnd,
  onDrop,
  onOpenMemoModal,
  getEventStyle,
  getMultiDayStyle,
  formatEventTime,
  sortEvents,
  isDateInSelectionRange,
}) => {
  // ★ この行内部だけでドラッグオーバーの日付インデックスを自己管理
  const [localDragOverIdx, setLocalDragOverIdx] = useState<number | null>(null);

  return (
    <div
      style={teamWeekGridStyle}
      className="min-h-[95px] sm:min-h-[110px] group hover:bg-slate-50/30 transition-colors"
      onDragLeave={(e) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (!related || !e.currentTarget.contains(related)) {
          setLocalDragOverIdx(null);
        }
      }}
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
              onOpenMemoModal(member);
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

        const dayEvents = eventDictionary.get(`date_${dateStr}_user_${member.id}`) || [];
        const isDragOver = localDragOverIdx === idx;
        const isSelectedRange = isDateInSelectionRange(dateStr, member.id);

        return (
          <div
            key={idx}
            onMouseDown={(e) => onCellMouseDown(e, dateStr, [member])}
            onMouseEnter={() => onCellMouseEnter(dateStr)}
            onDragOver={(e) => {
              e.preventDefault();
              e.dataTransfer.dropEffect = 'move';
              if (localDragOverIdx !== idx) {
                setLocalDragOverIdx(idx);
              }
            }}
            onDrop={(e) => {
              e.preventDefault();
              setLocalDragOverIdx(null);
              onDrop(e, dateStr, undefined, member.id);
            }}
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
            {dayEvents.length > 0 &&
              sortEvents(dayEvents).map((e) => {
                const multiProps = getMultiDayStyle(e, dateStr);
                return (
                  <div
                    key={e.id}
                    data-event-card="true"
                    draggable
                    onDragStart={(eDrag) => onDragStart(eDrag, e.id, member.id)}
                    onDragEnd={onDragEnd}
                    onDragOver={(eDragOver) => {
                      eDragOver.stopPropagation();
                      eDragOver.preventDefault();
                      eDragOver.dataTransfer.dropEffect = 'move';
                      if (localDragOverIdx !== idx) {
                        setLocalDragOverIdx(idx);
                      }
                    }}
                    onDrop={(eDrop) => {
                      eDrop.stopPropagation();
                      eDrop.preventDefault();
                      setLocalDragOverIdx(null);
                      onDrop(eDrop, dateStr, undefined, member.id);
                    }}
                    onMouseDown={(evt) => evt.stopPropagation()}
                    onClick={(evt) => onEventClick(evt, e)}
                    className={`border text-[9px] sm:text-[10px] font-bold leading-snug transition-all hover:shadow-xs shadow-2xs truncate select-none ${getEventStyle(e)} ${multiProps.containerClass} ${
                      draggedEventId === e.id ? 'opacity-40 select-none' : (draggedEventId ? 'pointer-events-none' : '')
                    } ${
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
              })}
          </div>
        );
      })}
    </div>
  );
});

TeamWeekMemberRow.displayName = 'TeamWeekMemberRow';
