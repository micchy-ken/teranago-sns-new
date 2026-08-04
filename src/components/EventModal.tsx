import React, { useState, useEffect, useRef } from 'react';
import { X, RefreshCw, Trash2, AlertCircle, Link as LinkIcon, Building2, Users, Paperclip, Plus, Check, UserCheck, Copy } from 'lucide-react';
import { EventType, CalendarEvent, OfficeMaster, DivisionMaster, User, AttachmentFile } from '../types';
import { getAvatarUrl } from '../utils/avatar';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Omit<CalendarEvent, 'id'> | CalendarEvent) => void;
  onDelete?: (eventId: string) => void;
  editingEvent?: CalendarEvent | null;
  defaultInitialDate?: string; // YYYY-MM-DD or YYYY-MM-DDTHH:mm
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  allUsers?: User[];
}

const toLocalDatetimeInput = (isoStr?: string) => {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return isoStr;
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day}T${hours}:${minutes}`;
};

export function EventModal({
  isOpen,
  onClose,
  onSave,
  onDelete,
  editingEvent,
  defaultInitialDate,
  offices = [],
  divisions = [],
  allUsers = [],
}: EventModalProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('personal');
  const [office, setOffice] = useState<string>('全社');
  const [division, setDivision] = useState<string>('全部署');
  const [isAllDay, setIsAllDay] = useState(false);
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [memo, setMemo] = useState('');
  const [isGoogleSynced, setIsGoogleSynced] = useState(false);
  const [selectedAttendees, setSelectedAttendees] = useState<User[]>([]);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const officeNames = Array.from(new Set(offices.map(o => o.name)));
  const divisionNames = Array.from(new Set(divisions.map(d => d.name)));

  const [currentEditingEvent, setCurrentEditingEvent] = useState<CalendarEvent | null>(editingEvent || null);

  useEffect(() => {
    setCurrentEditingEvent(editingEvent || null);
  }, [editingEvent]);

  const handleCopyAndAdd = () => {
    const newTitle = title.includes('(コピー)') ? title : `${title} (コピー)`;
    setTitle(newTitle);
    setCurrentEditingEvent(null); // IDを解除して新規追加扱いにする
    setError('内容を複製しました。日時やタイトルなどを確認し「保存する」を押してください。');
  };
  useEffect(() => {
    setError(null);
    if (isOpen) {
      if (editingEvent) {
        setTitle(editingEvent.title);
        setType(editingEvent.type);
        setOffice(editingEvent.office || '全社');
        setDivision(editingEvent.division || '全部署');
        setIsAllDay(!!editingEvent.isAllDay);
        setStart(toLocalDatetimeInput(editingEvent.start));
        setEnd(editingEvent.end ? toLocalDatetimeInput(editingEvent.end) : '');
        setLocation(editingEvent.location || '');
        setMemo(editingEvent.memo || '');
        setIsGoogleSynced(!!editingEvent.isGoogleSynced);
        setSelectedAttendees(editingEvent.attendees || []);
        setAttachments(editingEvent.attachments || []);
      } else if (defaultInitialDate) {
        if (defaultInitialDate.includes('T')) {
          setStart(defaultInitialDate);
        } else {
          setStart(`${defaultInitialDate}T09:00`);
        }
        setEnd('');
        setTitle('');
        setType('personal');
        setOffice('全社');
        setDivision('全部署');
        setIsAllDay(false);
        setLocation('');
        setMemo('');
        setIsGoogleSynced(false);
        setSelectedAttendees([]);
        setAttachments([]);
      } else {
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const hours = String(now.getHours()).padStart(2, '0');
        setStart(`${year}-${month}-${day}T${hours}:00`);
        setEnd('');
        setTitle('');
        setType('personal');
        setOffice('全社');
        setDivision('全部署');
        setIsAllDay(false);
        setLocation('');
        setMemo('');
        setIsGoogleSynced(false);
        setSelectedAttendees([]);
        setAttachments([]);
      }
    }
  }, [isOpen, editingEvent, defaultInitialDate]);

  if (!isOpen) return null;

  const toggleAttendee = (user: User) => {
    if (selectedAttendees.some(u => u.id === user.id)) {
      setSelectedAttendees(selectedAttendees.filter(u => u.id !== user.id));
    } else {
      setSelectedAttendees([...selectedAttendees, user]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files) as File[];
      const newAttachments: AttachmentFile[] = filesArray.map((file, idx) => ({
        id: `event-file-${Date.now()}-${idx}`,
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        type: file.type,
      }));
      setAttachments([...attachments, ...newAttachments]);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!title || !title.trim() || !start) {
      setError('タイトルと開始日時は必須です。');
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
      startIso = new Date(`${startDatePart}T00:00:00`).toISOString();

      if (end) {
        const endDatePart = end.split('T')[0];
        endIso = new Date(`${endDatePart}T23:59:59`).toISOString();
      }
    } else {
      startIso = new Date(start).toISOString();
      if (end) {
        endIso = new Date(end).toISOString();
      }
    }

    if (currentEditingEvent) {
      onSave({
        ...currentEditingEvent,
        title: (title || '').trim(),
        type,
        office,
        division,
        start: startIso,
        end: endIso,
        isAllDay,
        location,
        memo,
        isGoogleSynced: false,
        attendees: selectedAttendees,
        attachments,
      });
    } else {
      onSave({
        title: (title || '').trim(),
        type,
        office,
        division,
        start: startIso,
        end: endIso,
        isAllDay,
        location,
        memo,
        isGoogleSynced: false,
        attendees: selectedAttendees,
        attachments,
      });
    }

    onClose();
  };

  const handleDelete = () => {
    if (editingEvent && onDelete) {
      onDelete(editingEvent.id);
      onClose();
    }
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm overflow-y-auto"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg my-8 max-h-[90vh] overflow-y-auto ring-1 ring-slate-900/5"
      >
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">
            {currentEditingEvent ? '予定を編集' : '予定を追加'}
          </h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {editingEvent?.isIcal && (
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
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">タイトル <span className="text-red-500">*</span></label>
            <input
              type="text"
              required
              value={title}
              onChange={e => { setTitle(e.target.value); setError(null); }}
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
              placeholder="予定のタイトル"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">区分</label>
              <select
                value={type}
                onChange={e => setType(e.target.value as EventType)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
              >
                <option value="personal">個人</option>
                <option value="construction">工事</option>
                <option value="inspection">点検</option>
                <option value="replacement">取替</option>
                <option value="repair">修理</option>
                <option value="visitor">来客</option>
                <option value="business_trip">出張</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Building2 className="w-3.5 h-3.5 text-slate-500" />
                拠点
              </label>
              <select
                value={office}
                onChange={e => setOffice(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
              >
                <option value="全社">全社</option>
                {officeNames.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1">
                <Users className="w-3.5 h-3.5 text-slate-500" />
                部署
              </label>
              <select
                value={division}
                onChange={e => setDivision(e.target.value)}
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors"
              >
                <option value="全部署">全部署</option>
                {divisionNames.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2 pt-1">
            <input
              type="checkbox"
              id="isAllDay"
              checked={isAllDay}
              onChange={e => { setIsAllDay(e.target.checked); setError(null); }}
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
            />
            <label htmlFor="isAllDay" className="text-sm font-semibold text-slate-700 cursor-pointer select-none">
              終日予定として設定
            </label>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                開始{isAllDay ? '日' : '日時'} <span className="text-red-500">*</span>
              </label>
              {isAllDay ? (
                <input
                  type="date"
                  required
                  value={start.split('T')[0] || ''}
                  onChange={e => {
                    setStart(e.target.value ? `${e.target.value}T00:00` : '');
                    setError(null);
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors text-sm"
                />
              ) : (
                <input
                  type="datetime-local"
                  required
                  value={start}
                  onChange={e => { setStart(e.target.value); setError(null); }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors text-sm"
                />
              )}
            </div>

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                終了{isAllDay ? '日' : '日時'} <span className="text-slate-400 font-normal text-xs">(任意)</span>
              </label>
              {isAllDay ? (
                <input
                  type="date"
                  value={end ? end.split('T')[0] : ''}
                  onChange={e => {
                    setEnd(e.target.value ? `${e.target.value}T23:59` : '');
                    setError(null);
                  }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors text-sm"
                />
              ) : (
                <input
                  type="datetime-local"
                  value={end}
                  onChange={e => { setEnd(e.target.value); setError(null); }}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors text-sm"
                />
              )}
            </div>
          </div>

          {/* 参加者の選択 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <UserCheck className="w-4 h-4 text-indigo-600" />
                参加者メンバー ({selectedAttendees.length}名選択中)
              </span>
            </label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-slate-50 border border-slate-200 rounded-xl">
              {allUsers.map(user => {
                const isSelected = selectedAttendees.some(u => u.id === user.id);
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleAttendee(user)}
                    className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all border ${
                      isSelected
                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                    }`}
                  >
                    <img
                      src={getAvatarUrl(user.avatarUrl)}
                      alt={user.name}
                      className="w-4 h-4 rounded-full object-cover shrink-0"
                    />
                    <span>{user.name}</span>
                    {isSelected && <Check className="w-3 h-3 text-white ml-0.5" />}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">場所</label>
            <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" placeholder="会議室など" />
          </div>

          {/* 添付ファイル設定 */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                <Paperclip className="w-4 h-4 text-slate-500" />
                添付ファイル
              </label>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
              >
                <Plus className="w-3.5 h-3.5" />
                追加
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />
            {attachments.length > 0 ? (
              <div className="space-y-1.5">
                {attachments.map(att => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-700 truncate">{att.name}</span>
                      <span className="text-[10px] text-slate-400">({att.size})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="text-slate-400 hover:text-red-600 p-0.5 rounded transition-colors"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-3 border border-dashed border-slate-200 hover:border-indigo-300 rounded-xl text-center cursor-pointer transition-colors bg-slate-50/50"
              >
                <p className="text-xs text-slate-500 font-medium">
                  クリックして資料・議事録などを添付
                </p>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">内容</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors resize-none h-24 text-sm" placeholder="詳細な内容... (URLを入力すると自動的にリンクになります)"></textarea>
          </div>

          <div className="flex items-center justify-between pt-6 border-t border-slate-100">
            <div className="flex items-center gap-2">
              {currentEditingEvent && (
                <button
                  type="button"
                  onClick={handleCopyAndAdd}
                  className="flex items-center gap-1.5 px-3.5 py-2.5 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors shadow-2xs"
                  title="この予定をコピーして新規登録画面にします"
                >
                  <Copy className="w-3.5 h-3.5 text-indigo-600" />
                  <span>コピーして追加</span>
                </button>
              )}

              {currentEditingEvent && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  className="flex items-center gap-1.5 px-3 py-2.5 text-xs font-bold text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  削除
                </button>
              )}
            </div>

            <div className="flex justify-end gap-2.5">
              <button type="button" onClick={onClose} className="px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">キャンセル</button>
              <button type="submit" className="px-5 py-2.5 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm">
                {currentEditingEvent ? '更新する' : '保存する'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
