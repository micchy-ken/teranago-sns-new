import React, { useState, useMemo } from 'react';
import { CalendarEvent, User } from '../types';
import { Phone } from 'lucide-react';
import { getAvatarUrl } from '../utils/avatar';

export interface TeamDayMemberRowProps {
  member: User;
  memberEvents: CalendarEvent[];
  hours: number[];
  activeHoursSet: Set<number>;
  hoursGridStyle: React.CSSProperties;
  hourLayouts: Record<number, { left: number; width: number }>;
  timelineTotalWidth: number;
  minHour: number;
  maxHour: number;
  dateStr: string;
  memberColWidth: string;
  isSignageMode: boolean;
  draggedEventId: string | null;
  resizingEvent: {
    event: CalendarEvent;
    direction: 'horizontal' | 'vertical';
    currentEndMs: number;
  } | null;
  onEventClick: (e: React.MouseEvent, event: CalendarEvent) => void;
  onDragStart: (e: React.DragEvent, eventId: string, memberId?: string) => void;
  onDragEnd: () => void;
  onDrop: (
    e: React.DragEvent,
    dateStr: string,
    hour?: number,
    memberId?: string,
    minute?: number
  ) => void;
  onOpenAddModal: (datetimeStr: string, member: User) => void;
  onOpenMemoModal: (member: User) => void;
  startResize: (params: any) => void;
  getEventStyle: (e: CalendarEvent, forceSolid?: boolean) => string;
  formatEventTime: (e: CalendarEvent) => string;
  getXPositionFromDate: (date: Date) => number;
  getEventSpan: (e: CalendarEvent) => { sDate: Date; eDate: Date };
  lockTimelineForResize: () => void;
}

export const TeamDayMemberRow: React.FC<TeamDayMemberRowProps> = React.memo(({
  member,
  memberEvents,
  hours,
  activeHoursSet,
  hoursGridStyle,
  hourLayouts,
  timelineTotalWidth,
  minHour,
  maxHour,
  dateStr,
  memberColWidth,
  isSignageMode,
  draggedEventId,
  resizingEvent,
  onEventClick,
  onDragStart,
  onDragEnd,
  onDrop,
  onOpenAddModal,
  onOpenMemoModal,
  startResize,
  getEventStyle,
  formatEventTime,
  getXPositionFromDate,
  getEventSpan,
  lockTimelineForResize,
}) => {
  // ★ この行内部だけでドラッグオーバー状態を自己管理（他のメンバー行は一切再レンダリングされない！）
  const [localDragOverSlot, setLocalDragOverSlot] = useState<string | null>(null);

  // 当日予定のレーン計算（重なり判定）
  const placedEvents = useMemo(() => {
    const sorted = [...memberEvents].sort((a, b) => {
      const { sDate: as, eDate: ae } = getEventSpan(a);
      const { sDate: bs, eDate: be } = getEventSpan(b);
      const startDiff = as.getTime() - bs.getTime();
      if (startDiff !== 0) return startDiff;
      return (be.getTime() - bs.getTime()) - (ae.getTime() - as.getTime());
    });

    const result: Array<{
      event: CalendarEvent;
      lane: number;
      leftPx: number;
      widthPx: number;
    }> = [];
    const laneEndPxList: number[] = [];

    sorted.forEach((e) => {
      const { sDate, eDate } = getEventSpan(e);
      const isStartBeforeMin = (sDate.getHours() + sDate.getMinutes() / 60) < minHour;
      const endHourFloat = eDate.getHours() + eDate.getMinutes() / 60;
      const isEndAfterMax = endHourFloat >= (maxHour + 1);

      const leftPx = isStartBeforeMin ? 0 : getXPositionFromDate(sDate);
      const rightPx = isEndAfterMax
        ? (hourLayouts[maxHour] ? hourLayouts[maxHour].left + hourLayouts[maxHour].width : (timelineTotalWidth || 1000))
        : getXPositionFromDate(eDate);

      const widthPx = Math.max(28, rightPx - leftPx);

      let targetLane = -1;
      for (let l = 0; l < laneEndPxList.length; l++) {
        if (leftPx >= laneEndPxList[l] - 2) {
          targetLane = l;
          laneEndPxList[l] = leftPx + widthPx;
          break;
        }
      }

      if (targetLane === -1) {
        targetLane = laneEndPxList.length;
        laneEndPxList.push(leftPx + widthPx);
      }

      result.push({ event: e, lane: targetLane, leftPx, widthPx });
    });

    return { result, totalLanes: Math.max(1, laneEndPxList.length) };
  }, [memberEvents, hourLayouts, timelineTotalWidth, minHour, maxHour, getEventSpan, getXPositionFromDate]);

  const totalLanes = placedEvents.totalLanes;
  const lanePitch = 48;
  const rowHeightPx = totalLanes === 1 ? 84 : Math.max(84, 12 + totalLanes * lanePitch + 12);

  // タイムライン行内での座標から時間と :00/:30 を算出するヘルパー
  const calculateSlotFromX = (offsetX: number) => {
    let targetH = hours[0];
    let is30 = false;
    for (const h of hours) {
      const layout = hourLayouts[h];
      if (layout && offsetX >= layout.left && offsetX <= layout.left + layout.width) {
        targetH = h;
        is30 = (offsetX - layout.left) > layout.width / 2;
        break;
      }
    }
    return { targetH, is30 };
  };

  // ドラッグガイド枠の正確な座標と幅（週表示並みに明瞭なガイド表示用）
  const activeDragLayout = useMemo(() => {
    if (!localDragOverSlot) return null;
    const parts = localDragOverSlot.split('-');
    const h = parseInt(parts[0], 10);
    const is30 = parts[1] === '30';
    const layout = hourLayouts[h];
    if (!layout) return null;
    const halfWidth = layout.width / 2;
    const leftPx = layout.left + (is30 ? halfWidth : 0);
    return {
      left: leftPx,
      width: halfWidth,
      timeText: `${h}:${is30 ? '30' : '00'}`,
    };
  }, [localDragOverSlot, hourLayouts]);

  return (
    <div
      style={{ minHeight: `${rowHeightPx}px` }}
      className="flex group hover:bg-slate-50/30 transition-colors relative"
      onDragLeave={(e) => {
        const related = e.relatedTarget as HTMLElement | null;
        if (!related || !e.currentTarget.contains(related)) {
          setLocalDragOverSlot(null);
        }
      }}
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
              onOpenMemoModal(member);
            }}
            className="mt-1.5 w-full flex items-center justify-center gap-1 px-1.5 py-1 bg-slate-50 hover:bg-slate-100 text-slate-600 hover:text-indigo-600 text-[9px] sm:text-[10px] font-extrabold rounded-lg border border-slate-200 transition-all cursor-pointer shadow-2xs"
          >
            <Phone className="w-2.5 h-2.5 text-indigo-500 shrink-0" />
            <span className="truncate">伝言メモ</span>
          </button>
        )}
      </div>

      {/* Timeline Canvas Container: 行全体で dragover / drop を一元受信 */}
      <div
        className="flex-1 relative min-w-0"
        data-timeline-row="true"
        onDragOver={(e) => {
          e.preventDefault();
          e.dataTransfer.dropEffect = 'move';
          const rect = e.currentTarget.getBoundingClientRect();
          const offsetX = e.clientX - rect.left;
          const { targetH, is30 } = calculateSlotFromX(offsetX);
          const nextSlot = `${targetH}-${is30 ? '30' : '00'}`;
          if (localDragOverSlot !== nextSlot) {
            setLocalDragOverSlot(nextSlot);
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          setLocalDragOverSlot(null);
          const rect = e.currentTarget.getBoundingClientRect();
          const offsetX = e.clientX - rect.left;
          const { targetH, is30 } = calculateSlotFromX(offsetX);
          onDrop(e, dateStr, targetH, member.id, is30 ? 30 : 0);
        }}
      >
        {/* Layer 1: Background Grid */}
        <div style={hoursGridStyle} className="absolute inset-0 h-full w-full pointer-events-none">
          {hours.map((hour) => {
            const isActive = activeHoursSet.has(hour);

            return (
              <div
                key={hour}
                className={`border-r border-slate-200 last:border-r-0 h-full relative flex ${
                  isActive ? 'bg-white' : 'bg-slate-50/40'
                }`}
              >
                {/* 30分スプリット線 */}
                <div className="w-1/2 h-full border-r border-dashed border-slate-200/50" />
                <div className="w-1/2 h-full" />
              </div>
            );
          })}
        </div>

        {/* Layer 1.5: クリック用透明レイヤー（新規登録用） */}
        <div style={hoursGridStyle} className="absolute inset-0 h-full w-full pointer-events-auto">
          {hours.map((hour) => (
            <div
              key={hour}
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const isRight = (e.clientX - rect.left) > rect.width / 2;
                onOpenAddModal(`${dateStr}T${String(hour).padStart(2, '0')}:${isRight ? '30' : '00'}`, member);
              }}
              className="h-full cursor-pointer hover:bg-indigo-50/20 transition-colors"
            />
          ))}
        </div>

        {/* Layer 2: クッキリ目立つドラッグガイド枠（週表示と同じく直感的な青枠＋時間バッジ） */}
        {activeDragLayout && (
          <div
            style={{
              left: `${activeDragLayout.left}px`,
              width: `${Math.max(20, activeDragLayout.width)}px`,
            }}
            className="absolute inset-y-1 bg-indigo-500/20 ring-2 ring-indigo-500 rounded-sm z-30 pointer-events-none flex flex-col justify-start p-1 transition-all duration-75 shadow-xs"
          >
            <span className="inline-block self-start bg-indigo-600 text-white text-[9px] sm:text-[10px] font-extrabold px-1.5 py-0.5 rounded shadow-xs">
              {activeDragLayout.timeText}
            </span>
          </div>
        )}

        {/* Layer 3: Events Absolute Overlay */}
        <div className="absolute inset-0 pointer-events-none p-1 overflow-hidden z-10">
          {placedEvents.result.map(({ event: e, lane, leftPx, widthPx }) => {
            const cardHeight = 36;
            const topPx = 4 + lane * lanePitch;
            const heightPx = cardHeight;
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

            const currentStartH = new Date(e.start).getHours();
            const activeSlotLayout = hourLayouts[currentStartH] || hourLayouts[minHour];
            const slotW = activeSlotLayout?.width || 100;

            const isDraggedThis = draggedEventId === e.id;

            return (
              <div
                key={e.id}
                data-event-card="true"
                draggable={!e.isIcal && !isBeingResized}
                onDragStart={(eDrag) => onDragStart(eDrag, e.id, member.id)}
                onDragEnd={onDragEnd}
                onMouseDown={(evt) => evt.stopPropagation()}
                onClick={(evt) => onEventClick(evt, e)}
                style={{
                  left: `${leftPx + 2}px`,
                  width: `${Math.max(24, displayWidthPx - 4)}px`,
                  top: `${topPx}px`,
                  height: `${heightPx}px`,
                  zIndex: isBeingResized ? 50 : (isDraggedThis ? 40 : 10),
                }}
                className={`absolute group/card border rounded-lg shadow-xs hover:shadow-md transition-all select-none cursor-pointer px-2 py-1 flex flex-col justify-center overflow-visible hover:brightness-95 ${getEventStyle(e)} ${
                  isDraggedThis
                    ? 'opacity-40 select-none pointer-events-auto ring-2 ring-indigo-400 shadow-md'
                    : (draggedEventId ? 'pointer-events-none' : 'pointer-events-auto')
                } ${
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

                {/* 横方向リサイズハンドル */}
                {!e.isIcal && (
                  <div
                    onMouseDown={(evt) => {
                      evt.stopPropagation();
                      evt.preventDefault();
                      const currentEnd = e.end ? new Date(e.end).getTime() : new Date(e.start).getTime() + 60 * 60 * 1000;
                      lockTimelineForResize();
                      startResize({
                        event: e,
                        direction: 'horizontal',
                        initialStartX: evt.clientX,
                        initialStartY: evt.clientY,
                        initialEndMs: currentEnd,
                        currentEndMs: currentEnd,
                        slotWidthPx: slotW,
                        dateStr,
                        initialEndX: getXPositionFromDate(new Date(currentEnd)),
                        hourLayouts: hourLayouts,
                      });
                    }}
                    className="absolute right-0 top-0 bottom-0 w-4 hover:w-5 cursor-ew-resize flex items-center justify-center opacity-0 group-hover/card:opacity-100 transition-opacity z-20 group/handle"
                    title="右端をドラッグして終了時刻を15分単位で変更"
                  >
                    <div className="w-1.5 h-6 bg-slate-400/80 group-hover/handle:bg-indigo-600 rounded-full shadow-2xs transition-colors" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
});

TeamDayMemberRow.displayName = 'TeamDayMemberRow';
