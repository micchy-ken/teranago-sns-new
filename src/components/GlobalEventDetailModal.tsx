import React from 'react';
import { X, Calendar as CalendarIcon, Clock, MapPin, ExternalLink, FileText, Users, Building2, Tag, Edit2 } from 'lucide-react';
import { CalendarEvent, EventType, User } from '../types';
import { getAvatarUrl } from '../utils/avatar';

interface GlobalEventDetailModalProps {
  isOpen: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onEditInCalendar?: (eventId: string) => void;
}

const typeStyles: Record<EventType, string> = {
  personal: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  construction: 'bg-amber-50 text-amber-700 border-amber-200',
  inspection: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  replacement: 'bg-cyan-50 text-cyan-700 border-cyan-200',
  repair: 'bg-rose-50 text-rose-700 border-rose-200',
  visitor: 'bg-orange-50 text-orange-700 border-orange-200',
  business_trip: 'bg-sky-50 text-sky-700 border-sky-200'
};

const typeLabels: Record<EventType, string> = {
  personal: '個人用務',
  construction: '工事予定',
  inspection: '点検検査',
  replacement: '機器交換',
  repair: '修理・保守',
  visitor: '来客・応対',
  business_trip: '出張予定'
};

export function GlobalEventDetailModal({
  isOpen,
  event,
  onClose,
  onEditInCalendar,
}: GlobalEventDetailModalProps) {
  if (!isOpen || !event) return null;

  const formatDate = (isoStr?: string) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    return d.toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStyle = () => {
    if (event.isIcal) return 'bg-purple-50 text-purple-700 border-purple-200';
    return typeStyles[event.type] || 'bg-slate-50 text-slate-700 border-slate-200';
  };

  const getLabel = () => {
    if (event.isIcal) return 'iCal予定';
    return typeLabels[event.type] || '予定';
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-xl bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200">
        
        {/* Header bar with tag colored accents */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${getStyle()}`}>
              {getLabel()}
            </span>
            {event.office && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[11px] font-semibold flex items-center gap-1">
                <Building2 className="w-3 h-3" />
                {event.office}
              </span>
            )}
            {event.division && (
              <span className="px-2 py-0.5 bg-slate-100 text-slate-600 border border-slate-200 rounded-full text-[11px] font-semibold">
                {event.division}
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          <div>
            <h3 className="text-lg font-extrabold text-slate-900 leading-snug">
              {event.title}
            </h3>
          </div>

          <div className="space-y-3.5 bg-slate-50 p-4 rounded-xl border border-slate-150">
            {/* Start & End Date Time */}
            <div className="flex items-start gap-2.5 text-sm text-slate-700">
              <Clock className="w-4.5 h-4.5 text-slate-400 shrink-0 mt-0.5" />
              <div>
                <div className="font-semibold text-slate-800">
                  {formatDate(event.start)}
                  {event.isAllDay && <span className="ml-2 text-xs bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded">終日</span>}
                </div>
                {event.end && !event.isAllDay && (
                  <div className="text-xs text-slate-500 mt-0.5">
                    〜 {formatDate(event.end)}
                  </div>
                )}
              </div>
            </div>

            {/* Location */}
            {event.location && (
              <div className="flex items-center gap-2.5 text-sm text-slate-700 border-t border-slate-200/60 pt-3">
                <MapPin className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                <span className="font-medium text-slate-800">{event.location}</span>
              </div>
            )}

            {/* External URL */}
            {event.url && (
              <div className="flex items-center gap-2.5 text-sm text-slate-700 border-t border-slate-200/60 pt-3">
                <ExternalLink className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                >
                  リンク先を開く
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            )}
          </div>

          {/* Attendees */}
          {event.attendees && event.attendees.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-indigo-500" />
                参加者 ({event.attendees.length}名)
              </h4>
              <div className="flex flex-wrap gap-2 p-3 bg-white border border-slate-200 rounded-xl">
                {event.attendees.map((user: User) => (
                  <div
                    key={user.id}
                    className="flex items-center gap-1.5 bg-slate-50 border border-slate-100 pl-1.5 pr-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700"
                  >
                    <img
                      src={getAvatarUrl(user.avatarUrl)}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                      className="w-5 h-5 rounded-full object-cover"
                    />
                    <span>{user.name}</span>
                    {user.department && <span className="text-[10px] text-slate-400">({user.department})</span>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Memo / Description */}
          {event.memo && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                <FileText className="w-4 h-4 text-indigo-500" />
                詳細・メモ
              </h4>
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-xl text-xs text-slate-700 whitespace-pre-wrap leading-relaxed">
                {event.memo}
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          {onEditInCalendar ? (
            <button
              onClick={() => {
                onEditInCalendar(event.id);
                onClose();
              }}
              className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 border border-indigo-200 hover:border-indigo-300 rounded-xl transition-all"
            >
              <Edit2 className="w-3.5 h-3.5" />
              カレンダーで表示・編集する
            </button>
          ) : <div />}
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs transition-colors"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  );
}
