import React, { useEffect, useState } from 'react';
import { Trash2, UserMinus, Users, X, Check, ChevronRight } from 'lucide-react';
import { CalendarEvent, User } from '../types';

export type TeamDeleteMemberScope = 'this_member' | 'all_members';

interface TeamEventDeleteModalProps {
  isOpen: boolean;
  event: CalendarEvent | null;
  targetMember: User | null;
  isRecurring: boolean;
  instanceDate?: string;
  onClose: () => void;
  onConfirm: (scope: TeamDeleteMemberScope) => void;
}

export function TeamEventDeleteModal({
  isOpen,
  event,
  targetMember,
  isRecurring,
  instanceDate,
  onClose,
  onConfirm,
}: TeamEventDeleteModalProps) {
  const [selectedScope, setSelectedScope] = useState<TeamDeleteMemberScope>('this_member');

  useEffect(() => {
    if (isOpen) {
      setSelectedScope('this_member');
    }
  }, [isOpen, event?.id, targetMember?.id]);

  if (!isOpen || !event || !targetMember) return null;

  const attendeesCount = event.attendees?.length || 0;

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-150 select-none"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
        className="relative w-full max-w-md bg-white rounded-2xl shadow-2xl border border-slate-100 overflow-hidden"
      >
        {/* Header */}
        <div className="p-4.5 border-b border-slate-100 flex items-center justify-between bg-rose-50/70">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-xl bg-rose-100 text-rose-600 shrink-0">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-slate-800 truncate">
                予定の削除方法を選択
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 truncate">
                {event.title || '予定'}
                {instanceDate ? ` (${instanceDate})` : ''}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 transition-colors cursor-pointer shrink-0"
            title="閉じる"
          >
            <X className="w-4.5 h-4.5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
            この予定には複数メンバー（<span className="font-bold text-slate-800">{attendeesCount}名</span>）が登録されています。削除の対象を選択してください。
          </p>

          <div className="space-y-2.5">
            {/* Option 1: この1名のみを削除 */}
            <label
              onClick={() => setSelectedScope('this_member')}
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedScope === 'this_member'
                  ? 'border-indigo-300 bg-indigo-50/40 text-indigo-900 shadow-xs ring-1 ring-indigo-400/30'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="team_delete_member_scope"
                checked={selectedScope === 'this_member'}
                onChange={() => setSelectedScope('this_member')}
                className="mt-1 h-4 w-4 text-indigo-600 focus:ring-indigo-500 border-slate-300"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <UserMinus className="w-4 h-4 text-indigo-600 shrink-0" />
                    <span>この1名のみを削除</span>
                  </span>
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap shrink-0">
                    メンバー調整
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  予定自体は削除せず、参加者から <span className="font-bold text-slate-700">{targetMember.name}</span> さんだけを外します。他のメンバーの予定は残ります。
                </p>
              </div>
            </label>

            {/* Option 2: 全員のスケジュールを削除 */}
            <label
              onClick={() => setSelectedScope('all_members')}
              className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                selectedScope === 'all_members'
                  ? 'border-rose-300 bg-rose-50/40 text-rose-900 shadow-xs ring-1 ring-rose-400/30'
                  : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <input
                type="radio"
                name="team_delete_member_scope"
                checked={selectedScope === 'all_members'}
                onChange={() => setSelectedScope('all_members')}
                className="mt-1 h-4 w-4 text-rose-600 focus:ring-rose-500 border-slate-300"
              />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-bold text-slate-800 flex items-center justify-between gap-2">
                  <span className="flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>全員のスケジュールを削除</span>
                  </span>
                  <span className="text-[10px] bg-rose-100 text-rose-700 px-1.5 py-0.5 rounded font-semibold whitespace-nowrap shrink-0">
                    全{attendeesCount}名
                  </span>
                </div>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  この予定そのものを削除し、登録されている全員のカレンダーから削除します。
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
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            キャンセル
          </button>
          <button
            type="button"
            onClick={() => onConfirm(selectedScope)}
            className={`px-5 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-all active:scale-95 flex items-center gap-1.5 cursor-pointer ${
              selectedScope === 'all_members'
                ? 'bg-rose-600 hover:bg-rose-700'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {isRecurring ? (
              <>
                <span>次へ（繰り返し範囲の選択）</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </>
            ) : (
              <>
                {selectedScope === 'all_members' ? (
                  <Trash2 className="w-3.5 h-3.5" />
                ) : (
                  <Check className="w-3.5 h-3.5" />
                )}
                <span>{selectedScope === 'all_members' ? '全員の予定を削除' : 'この1名のみ外す'}</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
