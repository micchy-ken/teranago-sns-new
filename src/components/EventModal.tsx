import React, { useState } from 'react';
import { X, RefreshCw } from 'lucide-react';
import { EventType, CalendarEvent } from '../types';

interface EventModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (event: Omit<CalendarEvent, 'id'>) => void;
}

export function EventModal({ isOpen, onClose, onSave }: EventModalProps) {
  const [title, setTitle] = useState('');
  const [type, setType] = useState<EventType>('personal');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [location, setLocation] = useState('');
  const [url, setUrl] = useState('');
  const [memo, setMemo] = useState('');
  const [isGoogleSynced, setIsGoogleSynced] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !start || !end) return;
    onSave({
      title,
      type,
      start: new Date(start).toISOString(),
      end: new Date(end).toISOString(),
      location,
      url,
      memo,
      isGoogleSynced,
      attendees: []
    });
    onClose();
    // Reset
    setTitle('');
    setType('personal');
    setStart('');
    setEnd('');
    setLocation('');
    setUrl('');
    setMemo('');
    setIsGoogleSynced(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto ring-1 ring-slate-900/5">
        <div className="flex items-center justify-between p-5 border-b border-slate-100">
          <h2 className="text-lg font-bold text-slate-800">予定を追加</h2>
          <button onClick={onClose} className="p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">タイトル</label>
            <input type="text" required value={title} onChange={e => setTitle(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" placeholder="予定のタイトル" />
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">区分</label>
            <select value={type} onChange={e => setType(e.target.value as EventType)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors">
              <option value="company">会社全体</option>
              <option value="team">チーム</option>
              <option value="personal">個人</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">開始日時</label>
              <input type="datetime-local" required value={start} onChange={e => setStart(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors text-sm" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">終了日時</label>
              <input type="datetime-local" required value={end} onChange={e => setEnd(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors text-sm" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">場所</label>
              <input type="text" value={location} onChange={e => setLocation(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" placeholder="会議室など" />
            </div>
            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-1.5">URL</label>
              <input type="url" value={url} onChange={e => setUrl(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors" placeholder="https://..." />
            </div>
          </div>
          <div>
            <label className="block text-sm font-semibold text-slate-700 mb-1.5">メモ</label>
            <textarea value={memo} onChange={e => setMemo(e.target.value)} className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-colors resize-none h-24" placeholder="詳細なメモ..."></textarea>
          </div>
          <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-lg border border-slate-200">
            <input type="checkbox" id="sync" checked={isGoogleSynced} onChange={e => setIsGoogleSynced(e.target.checked)} className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer" />
            <label htmlFor="sync" className="text-sm font-semibold text-slate-700 flex items-center gap-2 cursor-pointer select-none">
              <RefreshCw className="w-4 h-4 text-blue-500" />
              Googleカレンダーと連携する
            </label>
          </div>
          <div className="flex justify-end gap-3 pt-6 border-t border-slate-100">
            <button type="button" onClick={onClose} className="px-5 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors">キャンセル</button>
            <button type="submit" className="px-6 py-2.5 text-sm font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm">保存する</button>
          </div>
        </form>
      </div>
    </div>
  );
}
