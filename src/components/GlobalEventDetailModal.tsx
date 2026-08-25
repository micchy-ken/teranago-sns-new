import React, { useEffect } from 'react';
import { 
  X, 
  Calendar as CalendarIcon, 
  Clock, 
  MapPin, 
  ExternalLink, 
  FileText, 
  Users, 
  Building2, 
  Tag, 
  Edit2, 
  Paperclip, 
  Repeat, 
  Copy, 
  Trash2, 
  UserCheck, 
  Link2 
} from 'lucide-react';
import { CalendarEvent, EventType, User } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { getRecurrenceLabel, isRecurringEvent } from '../utils/recurrenceUtils';
import { renderContentWithLinks } from '../utils/renderContentWithLinks';
import { markEventAsRead } from '../utils/notifications';
import { triggerOpenUserModal } from '../utils/userModal';

export interface GlobalEventDetailModalProps {
  isOpen: boolean;
  event: CalendarEvent | null;
  onClose: () => void;
  onEdit?: (event: CalendarEvent) => void;
  onCopyAndAdd?: (event: CalendarEvent) => void;
  onDelete?: (event: CalendarEvent) => void;
  onEditInCalendar?: (eventId: string) => void;
  currentUser?: User;
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
  onEdit,
  onCopyAndAdd,
  onDelete,
  onEditInCalendar,
  currentUser,
}: GlobalEventDetailModalProps) {
  useEffect(() => {
    if (isOpen && event && currentUser?.id) {
      markEventAsRead(currentUser.id, event.id);
      if (event.recurrenceParentId) {
        markEventAsRead(currentUser.id, event.recurrenceParentId);
      }
    }
  }, [isOpen, event, currentUser?.id]);

  if (!isOpen || !event) return null;

  const formatDateWithDay = (isoStr?: string, includeTime = true) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return isoStr;
    const days = ['日', '月', '火', '水', '木', '金', '土'];
    const y = d.getFullYear();
    const m = d.getMonth() + 1;
    const date = d.getDate();
    const day = days[d.getDay()];
    if (!includeTime) {
      return `${y}年${m}月${date}日(${day})`;
    }
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}年${m}月${date}日(${day}) ${h}:${min}`;
  };

  const formatTimeOnly = (isoStr?: string) => {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${h}:${min}`;
  };

  const getStyle = () => {
    return typeStyles[event.type] || 'bg-slate-50 text-slate-700 border-slate-200';
  };

  const getLabel = () => {
    return typeLabels[event.type] || '予定';
  };

  const isSameDay = (startIso?: string, endIso?: string) => {
    if (!startIso || !endIso) return true;
    const d1 = new Date(startIso);
    const d2 = new Date(endIso);
    return d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate();
  };

  const isIcal = event.isIcal === true;

  return (
    <div 
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div 
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-lg sm:max-w-xl bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200 flex flex-col max-h-[90vh]"
      >
        
        {/* Header bar */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center flex-wrap gap-2">
            <span className={`px-2.5 py-1 rounded-lg text-xs font-bold border ${getStyle()}`}>
              {getLabel()}
            </span>
            {event.isAllDay && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                終日
              </span>
            )}
            {isRecurringEvent(event) && event.recurrence && event.recurrence.frequency !== 'none' && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-purple-50 text-purple-700 border border-purple-200 flex items-center gap-1">
                <Repeat className="w-3 h-3" />
                定期予定
              </span>
            )}
            {isIcal && (
              <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200 flex items-center gap-1">
                <Link2 className="w-3 h-3" />
                iCal連携
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/60 transition-colors cursor-pointer"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-5 sm:p-6 space-y-4 overflow-y-auto flex-1">
          {/* Title */}
          <div>
            <h3 className="text-lg sm:text-xl font-bold text-slate-900 leading-snug">
              {event.title}
            </h3>
          </div>

          {/* Key Info Card */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-xl border border-slate-200/70">
            {/* Start & End Date Time */}
            <div className="flex items-start gap-2.5 text-sm text-slate-700">
              <Clock className="w-4.5 h-4.5 text-indigo-500 shrink-0 mt-0.5" />
              <div>
                {event.isAllDay ? (
                  <div className="font-bold text-slate-800">
                    {isSameDay(event.start, event.end) ? (
                      formatDateWithDay(event.start, false)
                    ) : (
                      <>
                        {formatDateWithDay(event.start, false)} 〜 {formatDateWithDay(event.end, false)}
                      </>
                    )}
                    <span className="ml-2 text-xs font-semibold bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded-md">
                      終日
                    </span>
                  </div>
                ) : (
                  <div className="font-bold text-slate-800">
                    {isSameDay(event.start, event.end) ? (
                      <>
                        {formatDateWithDay(event.start, true)} 〜 {formatTimeOnly(event.end)}
                      </>
                    ) : (
                      <>
                        {formatDateWithDay(event.start, true)} 〜 {formatDateWithDay(event.end, true)}
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Recurrence Rule Detail */}
            {isRecurringEvent(event) && event.recurrence && event.recurrence.frequency !== 'none' && (
              <div className="flex items-center gap-2.5 text-xs text-purple-800 border-t border-slate-200/60 pt-2.5">
                <Repeat className="w-4 h-4 text-purple-600 shrink-0" />
                <span className="font-semibold bg-purple-50 text-purple-700 px-2 py-0.5 rounded-md">
                  繰り返し: {getRecurrenceLabel(event.recurrence)}
                </span>
              </div>
            )}

            {/* Target Office & Division */}
            {(event.office || event.division) && (
              <div className="flex items-center gap-2.5 text-xs text-slate-700 border-t border-slate-200/60 pt-2.5">
                <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
                <span className="font-medium text-slate-700">
                  対象: <span className="font-bold">{event.office || '全社'}</span> / <span className="font-bold">{event.division || '全部署'}</span>
                </span>
              </div>
            )}

            {/* Location */}
            {event.location && (
              <div className="flex items-center gap-2.5 text-xs text-slate-700 border-t border-slate-200/60 pt-2.5">
                <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                <span className="font-medium text-slate-800">{event.location}</span>
              </div>
            )}

            {/* External URL */}
            {event.url && (
              <div className="flex items-center gap-2.5 text-xs text-slate-700 border-t border-slate-200/60 pt-2.5">
                <ExternalLink className="w-4 h-4 text-indigo-500 shrink-0" />
                <a
                  href={event.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-indigo-600 hover:underline flex items-center gap-1"
                >
                  {event.url}
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}

            {/* Registered / Created by */}
            {(event.createdBy || event.createdViaInspection || (event.type === 'inspection' && event.targetYearMonth)) && (
              <div className="flex items-center gap-2.5 text-xs text-slate-600 border-t border-slate-200/60 pt-2.5">
                <UserCheck className="w-4 h-4 text-slate-400 shrink-0" />
                <span>
                  登録者:{' '}
                  {event.createdBy && !event.createdViaInspection && !(event.type === 'inspection' && event.targetYearMonth) ? (
                    <button
                      type="button"
                      onClick={() => triggerOpenUserModal(event.createdBy!)}
                      className="font-bold text-slate-800 hover:text-indigo-600 cursor-pointer underline transition-colors"
                      title={`${event.createdBy.name}のプロフィールを表示`}
                    >
                      {event.createdBy.name}
                    </button>
                  ) : (
                    <strong className="text-slate-800">
                      {(event.createdViaInspection || (event.createdBy && event.createdBy.name === '点検登録') || (event.type === 'inspection' && event.targetYearMonth))
                        ? '点検登録'
                        : event.createdBy?.name || '不明'}
                    </strong>
                  )}
                </span>
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
                    onClick={() => triggerOpenUserModal(user)}
                    className="flex items-center gap-1.5 bg-slate-50 hover:bg-indigo-50/60 border border-slate-150 hover:border-indigo-200 pl-1.5 pr-2.5 py-1 rounded-lg text-xs font-semibold text-slate-700 hover:text-indigo-700 cursor-pointer transition-all group/attendee"
                    title={`${user.name}のプロフィールを表示`}
                  >
                    <img
                      src={getAvatarUrl(user.avatarUrl)}
                      alt={user.name}
                      referrerPolicy="no-referrer"
                      className="w-5 h-5 rounded-full object-cover group-hover/attendee:ring-1 ring-indigo-200"
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
                {renderContentWithLinks(event.memo)}
              </div>
            </div>
          )}

          {/* Attachments Section */}
          {event.attachments && event.attachments.length > 0 && (
            <div className="space-y-2 border-t border-slate-100 pt-3">
              <h4 className="text-xs font-bold text-slate-500 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-indigo-500" />
                添付ファイル ({event.attachments.length})
              </h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {event.attachments.map(att => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-3 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl transition-all"
                  >
                    <div className="flex items-center gap-2 min-w-0 pr-2">
                      <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-slate-800 truncate">{att.name}</div>
                        <div className="text-[10px] text-slate-400">{att.size}</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <a
                        href={att.url || '#'}
                        target="_blank"
                        rel="noopener noreferrer"
                        download={att.name}
                        className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shrink-0"
                      >
                        ダウンロード
                      </a>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2.5 shrink-0">
          <div className="flex items-center gap-2">
            {onDelete && !isIcal && (
              <button
                type="button"
                onClick={() => {
                  onDelete(event);
                }}
                className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-rose-200 rounded-xl transition-all cursor-pointer"
                title="予定を削除します"
              >
                <Trash2 className="w-3.5 h-3.5" />
                削除
              </button>
            )}
            {onEditInCalendar && (
              <button
                type="button"
                onClick={() => {
                  onEditInCalendar(event.id);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
              >
                <CalendarIcon className="w-3.5 h-3.5 text-indigo-600" />
                カレンダーで開く
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            {onCopyAndAdd && (
              <button
                type="button"
                onClick={() => {
                  onCopyAndAdd(event);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 hover:border-indigo-300 rounded-xl transition-all shadow-2xs cursor-pointer"
                title="この予定をもとに複製して新規作成します"
              >
                <Copy className="w-3.5 h-3.5 text-indigo-600" />
                コピーして追加
              </button>
            )}
            {onEdit && !isIcal && (
              <button
                type="button"
                onClick={() => {
                  onEdit(event);
                  onClose();
                }}
                className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
                title="予定を再編集します"
              >
                <Edit2 className="w-3.5 h-3.5" />
                編集
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-bold text-xs rounded-xl transition-colors cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}
