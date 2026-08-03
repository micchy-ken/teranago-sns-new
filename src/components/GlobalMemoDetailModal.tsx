import React from 'react';
import { X, User, Building2, Phone, Mail, Clock, Calendar, Check, AlertCircle, RefreshCw } from 'lucide-react';
import { Memo, User as UserType } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { isMemoUnread } from '../utils/notifications';

interface GlobalMemoDetailModalProps {
  isOpen: boolean;
  memo: Memo | null;
  currentUser: UserType;
  onClose: () => void;
  onToggleStatus: (memoId: string) => void;
}

const requirementLabels: Record<string, string> = {
  phone_called: '電話がありました',
  has_message: '伝言があります',
  call_again: '再度電話します',
  please_call_back: '折り返し連絡下さい',
  custom: '伝言メモ',
};

const requirementStyles: Record<string, string> = {
  phone_called: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  has_message: 'bg-blue-50 text-blue-700 border-blue-200',
  call_again: 'bg-amber-50 text-amber-700 border-amber-200',
  please_call_back: 'bg-rose-50 text-rose-700 border-rose-200',
  custom: 'bg-slate-50 text-slate-700 border-slate-200',
};

export function GlobalMemoDetailModal({
  isOpen,
  memo,
  currentUser,
  onClose,
  onToggleStatus,
}: GlobalMemoDetailModalProps) {
  if (!isOpen || !memo) return null;

  const isUnread = isMemoUnread(memo, currentUser, []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${requirementStyles[memo.requirementType] || requirementStyles.custom}`}>
              {requirementLabels[memo.requirementType] || memo.requirementText || '伝言'}
            </span>
            {isUnread ? (
              <span className="px-2 py-0.5 bg-rose-500 text-white font-extrabold text-[10px] rounded-full flex items-center gap-1 shadow-2xs">
                <Clock className="w-3 h-3" /> 未対応
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-extrabold text-[10px] rounded-full flex items-center gap-1 border border-emerald-200">
                <Check className="w-3 h-3 text-emerald-600" /> 対応完了
              </span>
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-200/50 cursor-pointer relative z-10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 max-h-[70vh] overflow-y-auto">
          
          {/* Sender Detail Block */}
          <div className="bg-slate-50 p-4 rounded-xl border border-slate-150 space-y-2.5">
            <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
              発信元 / 相手方
            </div>
            
            <div className="flex items-center gap-2.5 text-slate-800">
              <User className="w-4.5 h-4.5 text-slate-400 shrink-0" />
              <span className="font-extrabold text-base text-slate-900">
                {memo.fromName} <span className="text-xs font-medium text-slate-500">様</span>
              </span>
            </div>

            {memo.fromCompany && (
              <div className="flex items-center gap-2.5 text-sm text-slate-700">
                <Building2 className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                <span className="font-medium">{memo.fromCompany}</span>
              </div>
            )}

            {memo.fromPhone && (
              <div className="flex items-center gap-2.5 text-sm text-slate-700">
                <Phone className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                <a
                  href={`tel:${memo.fromPhone}`}
                  className="font-semibold text-indigo-600 hover:underline"
                >
                  {memo.fromPhone}
                </a>
              </div>
            )}

            {memo.fromEmail && (
              <div className="flex items-center gap-2.5 text-sm text-slate-700">
                <Mail className="w-4.5 h-4.5 text-slate-400 shrink-0" />
                <span className="font-medium select-all">{memo.fromEmail}</span>
              </div>
            )}
          </div>

          {/* Memo Message Body */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              伝言内容
            </h4>
            <div className="p-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[100px] shadow-2xs">
              {memo.content}
            </div>
          </div>

          {/* Metadata: Created info */}
          <div className="flex flex-col gap-1 text-[11px] text-slate-400 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>受付日時: {new Date(memo.createdAt).toLocaleString('ja-JP')}</span>
            </div>
            {memo.createdByUser && (
              <div className="flex items-center gap-1.5 mt-0.5">
                <img
                  src={getAvatarUrl(memo.createdByUser.avatarUrl)}
                  alt={memo.createdByUser.name}
                  referrerPolicy="no-referrer"
                  className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                />
                <span>受付登録者: {memo.createdByUser.name}</span>
              </div>
            )}
          </div>

        </div>

        {/* Footer controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3">
          <button
            onClick={() => onToggleStatus(memo.id)}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border cursor-pointer relative z-10 transition-all ${
              isUnread
                ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/10'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
            }`}
          >
            {isUnread ? (
              <>
                <Check className="w-3.5 h-3.5" />
                対応完了にする
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                未対応に戻す
              </>
            )}
          </button>
          
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer relative z-10 transition-colors"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  );
}
