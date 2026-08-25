import React, { useState } from 'react';
import { 
  X, 
  Mail, 
  Phone, 
  Smartphone, 
  Building2, 
  Briefcase, 
  Award, 
  Copy, 
  Check, 
  MessageSquare, 
  Calendar, 
  ShieldCheck, 
  ExternalLink,
  PhoneCall
} from 'lucide-react';
import { User } from '../types';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';

export interface UserDetailModalProps {
  isOpen: boolean;
  user: User | null;
  onClose: () => void;
  onSendMemo?: (user: User) => void;
  onViewSchedule?: (user: User) => void;
  onOpenChat?: (user: User) => void;
  currentUser?: User;
}

export function UserDetailModal({
  isOpen,
  user,
  onClose,
  onSendMemo,
  onViewSchedule,
  onOpenChat,
  currentUser,
}: UserDetailModalProps) {
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  if (!isOpen || !user) return null;

  const handleCopy = async (text: string, key: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      if (navigator.clipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedKey(key);
        setTimeout(() => setCopiedKey(null), 2000);
      }
    } catch (err) {
      console.error('Failed to copy: ', err);
    }
  };

  const isSelf = currentUser?.id === user.id;

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div 
        className="bg-white w-full max-w-lg rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] animate-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header Banner */}
        <div className="relative bg-gradient-to-r from-indigo-700 via-indigo-600 to-indigo-800 p-6 text-white shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="absolute top-4 right-4 p-2 bg-black/20 hover:bg-black/40 text-white/90 hover:text-white rounded-full transition-colors cursor-pointer"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-start gap-4">
            <div className="relative shrink-0">
              <img
                src={getAvatarUrl(user.avatarUrl)}
                onError={handleAvatarError}
                alt={user.name}
                className="w-20 h-20 rounded-2xl object-cover ring-4 ring-white/30 shadow-lg bg-white"
              />
              {user.isAdmin && (
                <div 
                  className="absolute -bottom-1.5 -right-1.5 bg-amber-500 text-white p-1 rounded-full shadow-md"
                  title="管理者"
                >
                  <ShieldCheck className="w-4 h-4" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0 pt-1">
              {user.kanaName && (
                <div className="text-xs text-indigo-200 tracking-wider font-medium">
                  {user.kanaName}
                </div>
              )}
              <h2 className="text-xl font-bold text-white tracking-tight truncate flex items-center gap-2">
                <span>{user.name}</span>
                {isSelf && (
                  <span className="text-[10px] bg-white/20 px-2 py-0.5 rounded-full font-normal">
                    あなた
                  </span>
                )}
              </h2>

              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {user.office && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold bg-white/15 text-white border border-white/20">
                    <Building2 className="w-3 h-3 text-indigo-200" />
                    {user.office}
                  </span>
                )}
                {user.division && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-white/15 text-white border border-white/20">
                    <Briefcase className="w-3 h-3 text-indigo-200" />
                    {user.division}
                  </span>
                )}
                {user.position && (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-amber-400/20 text-amber-200 border border-amber-300/30">
                    <Award className="w-3 h-3 text-amber-300" />
                    {user.position}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5 text-slate-700 divide-y divide-slate-100">
          {/* 所属・役職詳細 */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-indigo-600" />
              所属・組織情報
            </h3>
            
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="text-[11px] text-slate-500 font-medium">支店・拠点</div>
                <div className="text-sm font-semibold text-slate-800 mt-0.5">
                  {user.office || '未設定'}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="text-[11px] text-slate-500 font-medium">部署</div>
                <div className="text-sm font-semibold text-slate-800 mt-0.5">
                  {user.division || '未設定'}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="text-[11px] text-slate-500 font-medium">役職</div>
                <div className="text-sm font-semibold text-slate-800 mt-0.5">
                  {user.position || '一般'}
                </div>
              </div>
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl p-3">
                <div className="text-[11px] text-slate-500 font-medium">表示用部署名</div>
                <div className="text-sm font-semibold text-slate-800 mt-0.5 truncate" title={user.department}>
                  {user.department || `${user.office || ''} ${user.division || ''}`.trim() || '未設定'}
                </div>
              </div>
            </div>
          </div>

          {/* メールアドレス */}
          <div className="pt-4 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Mail className="w-3.5 h-3.5 text-indigo-600" />
              メールアドレス
            </h3>

            <div className="space-y-2">
              {/* PCメール */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-indigo-50/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500 font-medium">PCメール</div>
                    {user.email ? (
                      <a
                        href={`mailto:${user.email}`}
                        className="text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline truncate block"
                      >
                        {user.email}
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">未登録</span>
                    )}
                  </div>
                </div>
                {user.email && (
                  <button
                    type="button"
                    onClick={(e) => handleCopy(user.email!, 'pc_email', e)}
                    className="p-1.5 text-slate-400 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-200 shrink-0 ml-2"
                    title="メールアドレスをコピー"
                  >
                    {copiedKey === 'pc_email' ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>

              {/* 携帯メール */}
              <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200/80 hover:bg-indigo-50/40 transition-colors">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-lg bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
                    <Smartphone className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-[11px] text-slate-500 font-medium">携帯メール</div>
                    {user.mobileEmail ? (
                      <a
                        href={`mailto:${user.mobileEmail}`}
                        className="text-sm font-semibold text-purple-600 hover:text-purple-800 hover:underline truncate block"
                      >
                        {user.mobileEmail}
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">未登録</span>
                    )}
                  </div>
                </div>
                {user.mobileEmail && (
                  <button
                    type="button"
                    onClick={(e) => handleCopy(user.mobileEmail!, 'mobile_email', e)}
                    className="p-1.5 text-slate-400 hover:text-purple-600 hover:bg-white rounded-lg transition-colors cursor-pointer border border-transparent hover:border-slate-200 shrink-0 ml-2"
                    title="携帯メールアドレスをコピー"
                  >
                    {copiedKey === 'mobile_email' ? (
                      <Check className="w-4 h-4 text-emerald-600" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* 電話番号 */}
          <div className="pt-4 space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Phone className="w-3.5 h-3.5 text-indigo-600" />
              電話番号（外線・内線・携帯）
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {/* 外線電話 */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
                <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between">
                  <span>外線番号</span>
                  {(user.phoneOutside || user.phone) && (
                    <button
                      type="button"
                      onClick={(e) => handleCopy(user.phoneOutside || user.phone || '', 'phone_out', e)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                      title="外線番号をコピー"
                    >
                      {copiedKey === 'phone_out' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
                <div className="mt-1">
                  {(user.phoneOutside || user.phone) ? (
                    <a
                      href={`tel:${user.phoneOutside || user.phone}`}
                      className="text-sm font-bold text-slate-800 hover:text-indigo-600 hover:underline block truncate"
                    >
                      {user.phoneOutside || user.phone}
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">未登録</span>
                  )}
                </div>
              </div>

              {/* 内線電話 */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
                <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between">
                  <span>内線番号</span>
                  {user.phoneExtension && (
                    <button
                      type="button"
                      onClick={(e) => handleCopy(user.phoneExtension || '', 'phone_ext', e)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                      title="内線番号をコピー"
                    >
                      {copiedKey === 'phone_ext' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
                <div className="mt-1">
                  {user.phoneExtension ? (
                    <span className="text-sm font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-200/60 inline-block">
                      {user.phoneExtension}
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400">未登録</span>
                  )}
                </div>
              </div>

              {/* 携帯電話 */}
              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200/80 flex flex-col justify-between">
                <div className="text-[11px] text-slate-500 font-medium flex items-center justify-between">
                  <span>携帯番号</span>
                  {user.mobilePhone && (
                    <button
                      type="button"
                      onClick={(e) => handleCopy(user.mobilePhone || '', 'phone_mob', e)}
                      className="text-slate-400 hover:text-slate-700 cursor-pointer"
                      title="携帯番号をコピー"
                    >
                      {copiedKey === 'phone_mob' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    </button>
                  )}
                </div>
                <div className="mt-1">
                  {user.mobilePhone ? (
                    <a
                      href={`tel:${user.mobilePhone}`}
                      className="text-sm font-bold text-slate-800 hover:text-indigo-600 hover:underline block truncate"
                    >
                      {user.mobilePhone}
                    </a>
                  ) : (
                    <span className="text-xs text-slate-400">未登録</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Bottom Action Footer */}
        <div className="bg-slate-50 p-4 border-t border-slate-200/80 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            {onViewSchedule && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onViewSchedule(user);
                }}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer shadow-2xs"
                title="カレンダーで予定を確認"
              >
                <Calendar className="w-3.5 h-3.5 text-indigo-600" />
                <span>予定を見る</span>
              </button>
            )}
            {onOpenChat && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenChat(user);
                }}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 px-3 py-2 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-100 border border-slate-200 rounded-xl transition-colors cursor-pointer shadow-2xs"
                title="チャットを開く"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>チャット</span>
              </button>
            )}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            {onSendMemo && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onSendMemo(user);
                }}
                className="flex-1 sm:flex-none inline-flex items-center justify-center gap-2 px-4 py-2 text-sm font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl transition-all cursor-pointer shadow-sm hover:shadow"
                title="この社員を宛先にして伝言メモを作成"
              >
                <PhoneCall className="w-4 h-4" />
                <span>伝言を送る</span>
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-2 text-xs font-medium text-slate-600 hover:text-slate-800 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
            >
              閉じる
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
