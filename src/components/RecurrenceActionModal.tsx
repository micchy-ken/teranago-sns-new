import React, { useState } from 'react';
import { RefreshCw, Trash2, Calendar, Check, X, AlertTriangle } from 'lucide-react';

export type RecurrenceActionScope = 'this_only' | 'this_and_following' | 'all';

interface RecurrenceActionModalProps {
  isOpen: boolean;
  mode: 'edit' | 'delete';
  title?: string;
  instanceDate?: string;
  onClose: () => void;
  onConfirm: (scope: RecurrenceActionScope) => void;
}

export function RecurrenceActionModal({
  isOpen,
  mode,
  title = '定期予定の変更',
  instanceDate,
  onClose,
  onConfirm,
}: RecurrenceActionModalProps) {
  const [selectedScope, setSelectedScope] = useState<RecurrenceActionScope>('this_only');

  if (!isOpen) return null;

  const isDelete = mode === 'delete';

  return (
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden">
        {/* Header */}
        <div className={`p-4.5 border-b border-slate-100 flex items-center justify-between ${isDelete ? 'bg-rose-50/70' : 'bg-indigo-50/70'}`}>
          <div className="flex items-center gap-2.5">
            <div className={`p-2 rounded-xl ${isDelete ? 'bg-rose-100 text-rose-600' : 'bg-indigo-100 text-indigo-600'}`}>
              {isDelete ? <Trash2 className="w-5 h-5" /> : <RefreshCw className="w-5 h-5" />}
            </div>
            <div>
              <h3 className="text-base font-bold text-slate-800">
                {isDelete ? '定期予定の削除' : '定期予定の変更'}
              </h3>
              {instanceDate && (
                <p className="text-xs text-slate-500 mt-0.5">
                  対象日: {instanceDate}
                </p>
              )}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs sm:text-sm text-slate-600">
            これは繰り返しの定期予定です。{isDelete ? '削除' : '変更'}の適用範囲を選択してください。
          </p>

          <div className="space-y-2.5">
            {/* Option 1: この予定のみ */}
            <label
              onClick={() => setSelectedScope('this_only')}
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedScope === 'this_only'
                  ? isDelete
                    ? 'border-rose-300 bg-rose-50/40 text-rose-900 shadow-xs ring-1 ring-rose-400/30'
                    : 'border-indigo-300 bg-indigo-50/40 text-indigo-900 shadow-xs ring-1 ring-indigo-400/30'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="recurrence_scope"
                checked={selectedScope === 'this_only'}
                onChange={() => setSelectedScope('this_only')}
                className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800 flex items-center justify-between">
                  <span>この予定のみ{isDelete ? '削除' : '変更'}</span>
                  <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-medium">個別</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  {instanceDate ? `${instanceDate} の予定` : 'この日時の予定'}のみを{isDelete ? '削除' : '変更'}します。他の日時の予定には影響しません。
                </p>
              </div>
            </label>

            {/* Option 2: これ以降すべての予定 */}
            <label
              onClick={() => setSelectedScope('this_and_following')}
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedScope === 'this_and_following'
                  ? isDelete
                    ? 'border-rose-300 bg-rose-50/40 text-rose-900 shadow-xs ring-1 ring-rose-400/30'
                    : 'border-indigo-300 bg-indigo-50/40 text-indigo-900 shadow-xs ring-1 ring-indigo-400/30'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="recurrence_scope"
                checked={selectedScope === 'this_and_following'}
                onChange={() => setSelectedScope('this_and_following')}
                className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800 flex items-center justify-between">
                  <span>これ以降すべての予定を{isDelete ? '削除' : '変更'}</span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-medium">以降一括</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  この日以降の定期予定をすべて{isDelete ? '削除' : '更新'}します。過去の予定はそのまま残ります。
                </p>
              </div>
            </label>

            {/* Option 3: すべての予定 */}
            <label
              onClick={() => setSelectedScope('all')}
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedScope === 'all'
                  ? isDelete
                    ? 'border-rose-300 bg-rose-50/40 text-rose-900 shadow-xs ring-1 ring-rose-400/30'
                    : 'border-indigo-300 bg-indigo-50/40 text-indigo-900 shadow-xs ring-1 ring-indigo-400/30'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="recurrence_scope"
                checked={selectedScope === 'all'}
                onChange={() => setSelectedScope('all')}
                className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800 flex items-center justify-between">
                  <span>すべての予定を{isDelete ? '削除' : '変更'}</span>
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-medium">全体</span>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                  定期予定シリーズ全体のすべての予定（過去を含む）を一括で{isDelete ? '削除' : '変更'}します。
                </p>
              </div>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedScope)}
            className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1.5 ${
              isDelete
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isDelete ? <Trash2 className="w-3.5 h-3.5" /> : <Check className="w-3.5 h-3.5" />}
            <span>決定する</span>
          </button>
        </div>
      </div>
    </div>
  );
}
