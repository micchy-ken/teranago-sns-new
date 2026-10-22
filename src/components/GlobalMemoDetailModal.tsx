import React, { useState, useEffect } from 'react';
import { X, User, Building2, Phone, Mail, Clock, Calendar, Check, AlertCircle, RefreshCw, Users, MessageSquare, Lock, Globe, Send, Trash2 } from 'lucide-react';
import { Memo, User as UserType } from '../types';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';
import { isMemoUnhandled, markMemoAsRead } from '../utils/notifications';
import { renderContentWithLinks } from '../utils/renderContentWithLinks';
import { triggerOpenUserModal } from '../utils/userModal';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';

interface GlobalMemoDetailModalProps {
  isOpen: boolean;
  memo: Memo | null;
  currentUser: UserType;
  onClose: () => void;
  onToggleStatus: (memoId: string) => void;
  onAddComment?: (memoId: string, content: string, isPrivate: boolean) => Promise<void> | void;
  onDeleteComment?: (memoId: string, commentId: string) => Promise<void> | void;
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
  onAddComment,
  onDeleteComment,
}: GlobalMemoDetailModalProps) {
  const [newCommentText, setNewCommentText] = useState('');
  const [newCommentIsPrivate, setNewCommentIsPrivate] = useState(false);
  const [isSubmittingComment, setIsSubmittingComment] = useState(false);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });

  useEffect(() => {
    if (isOpen && memo && currentUser?.id) {
      markMemoAsRead(currentUser.id, memo.id);
    }
  }, [isOpen, memo, currentUser?.id]);

  if (!isOpen || !memo) return null;

  const isUnhandled = isMemoUnhandled(memo, currentUser);
  const statuses = memo.recipientStatuses || [];
  const isRecipient = statuses.some((st) => st.userId === currentUser?.id);
  const myStatus = statuses.find((st) => st.userId === currentUser?.id);
  const isMyHandled = myStatus?.isHandled || memo.status === 'handled';
  const isCreator = memo.createdByUser?.id === currentUser?.id || memo.senderId === currentUser?.id;

  const handleAddCommentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim() || isSubmittingComment || !memo) return;
    setIsSubmittingComment(true);
    try {
      if (onAddComment) {
        await onAddComment(memo.id, newCommentText.trim(), newCommentIsPrivate);
      }
      setNewCommentText('');
    } finally {
      setIsSubmittingComment(false);
    }
  };

  const handleDeleteCommentClick = (commentId: string) => {
    if (!memo) return;
    setConfirmModal({
      isOpen: true,
      title: 'コメントの削除',
      message: 'このコメントを削除してもよろしいですか？この操作は取り消せません。',
      type: 'danger',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      onConfirm: async () => {
        if (onDeleteComment) {
          await onDeleteComment(memo.id, commentId);
        }
      }
    });
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="relative w-full max-w-lg bg-white rounded-2xl shadow-xl border border-slate-100 overflow-hidden animate-in fade-in-50 zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
        
        {/* Header */}
        <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50 shrink-0">
          <div className="flex items-center gap-2">
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-bold border ${requirementStyles[memo.requirementType] || requirementStyles.custom}`}>
              {requirementLabels[memo.requirementType] || memo.requirementText || '伝言'}
            </span>
            {isRecipient ? (
              isUnhandled ? (
                <span className="px-2 py-0.5 bg-rose-500 text-white font-extrabold text-[10px] rounded-full flex items-center gap-1 shadow-2xs">
                  <Clock className="w-3 h-3" /> 未対応 (あなた宛)
                </span>
              ) : (
                <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-extrabold text-[10px] rounded-full flex items-center gap-1 border border-emerald-200">
                  <Check className="w-3 h-3 text-emerald-600" /> 対応完了
                </span>
              )
            ) : isCreator ? (
              <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-extrabold text-[10px] rounded-full flex items-center gap-1 border border-indigo-200">
                あなたが受付・登録
              </span>
            ) : (
              <span className="px-2 py-0.5 bg-slate-200 text-slate-700 font-bold text-[10px] rounded-full flex items-center gap-1">
                閲覧専用
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
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          
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

          {/* Recipients info */}
          <div className="p-3 bg-indigo-50/50 rounded-xl border border-indigo-100 flex items-start gap-2 text-xs">
            <Users className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
            <div className="min-w-0 flex-1">
              <span className="font-bold text-indigo-900 block mb-0.5">宛名メンバー（対象社員）:</span>
              <div className="flex flex-wrap gap-1.5 pt-0.5">
                {statuses.length > 0 ? (
                  statuses.map((st) => (
                    <button
                      key={st.userId}
                      type="button"
                      onClick={() => triggerOpenUserModal(st.userId)}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold cursor-pointer transition-all hover:opacity-80 ${
                        st.userId === currentUser?.id
                          ? 'bg-indigo-600 text-white'
                          : 'bg-white text-slate-700 border border-slate-200 hover:border-indigo-300'
                      }`}
                      title={`${st.userName}のプロフィールを表示`}
                    >
                      {st.userName}
                      {st.isHandled && <Check className="w-3 h-3 text-emerald-400" />}
                    </button>
                  ))
                ) : (
                  <span className="text-slate-600">{memo.toUsers?.map(u => u.name).join(', ') || '指定なし'}</span>
                )}
              </div>
            </div>
          </div>

          {/* Memo Message Body */}
          <div className="space-y-1.5">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider">
              伝言内容
            </h4>
            <div className="p-4 bg-white border border-slate-200 rounded-xl text-sm text-slate-700 whitespace-pre-wrap leading-relaxed min-h-[100px] shadow-2xs">
              {renderContentWithLinks(memo.content)}
            </div>
          </div>

          {/* Metadata: Created info */}
          <div className="flex flex-col gap-1 text-[11px] text-slate-400 border-t border-slate-100 pt-4">
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span>受付日時: {new Date(memo.createdAt).toLocaleString('ja-JP')}</span>
            </div>
            {memo.createdByUser && (
              <div 
                onClick={() => memo.createdByUser && triggerOpenUserModal(memo.createdByUser)}
                className="flex items-center gap-1.5 mt-0.5 cursor-pointer hover:text-indigo-600 transition-colors w-fit"
                title={`${memo.createdByUser.name}のプロフィールを表示`}
              >
                <img
                  src={getAvatarUrl(memo.createdByUser.id === currentUser.id ? (currentUser.avatarUrl || memo.createdByUser.avatarUrl) : memo.createdByUser.avatarUrl)}
                  alt={memo.createdByUser.name}
                  onError={handleAvatarError}
                  referrerPolicy="no-referrer"
                  className="w-3.5 h-3.5 rounded-full object-cover shrink-0"
                />
                <span>受付登録者: {memo.createdByUser.name}</span>
              </div>
            )}
          </div>

          {/* 対応コメント・社内メモ (公開・非公開[宛先担当者本人のみ閲覧可能]対応) */}
          {(() => {
            const visibleComments = (memo.comments || []).filter(c => {
              if (!c.isPrivate) return true;
              return c.author?.id === currentUser?.id || currentUser?.role === 'admin';
            });

            return (
              <div className="space-y-3 pt-3 border-t border-slate-100">
                <div className="flex items-center justify-between flex-wrap gap-1">
                  <div className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <MessageSquare className="w-4 h-4 text-indigo-600" />
                    <span>対応コメント・社内メモ ({visibleComments.length}件)</span>
                  </div>
                  <span className="text-[10px] text-slate-400">
                    折り返し結果や自分専用の非公開メモを記録できます
                  </span>
                </div>

                {/* コメント一覧 */}
                <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                  {visibleComments.length === 0 ? (
                    <div className="text-center py-4 text-xs text-slate-400 bg-slate-50/70 rounded-xl border border-dashed border-slate-200">
                      コメント・対応メモはまだありません
                    </div>
                  ) : (
                    visibleComments.map((comment) => {
                      const isAuthor = comment.author?.id === currentUser?.id;
                      const canDelete = isAuthor || currentUser?.role === 'admin';

                      return (
                        <div
                          key={comment.id}
                          className={`p-2.5 rounded-xl border transition-all text-xs ${
                            comment.isPrivate
                              ? 'bg-amber-50/70 border-amber-200/90 text-amber-950'
                              : 'bg-slate-50/80 border-slate-200/80 text-slate-800'
                          }`}
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5 flex-wrap">
                            <div className="flex items-center gap-1.5">
                              <img
                                src={getAvatarUrl(comment.author?.avatarUrl)}
                                onError={handleAvatarError}
                                className="w-5 h-5 rounded-full object-cover border border-slate-200"
                                alt={comment.author?.name || '担当者'}
                              />
                              <span className="font-bold text-[11px] text-slate-900">
                                {comment.author?.name || '担当者'}
                              </span>
                              {comment.author?.department && (
                                <span className="text-[10px] text-slate-500">
                                  ({comment.author.department})
                                </span>
                              )}
                              <span className="text-[10px] text-slate-400">
                                {new Date(comment.createdAt).toLocaleString('ja-JP', {
                                  month: 'numeric',
                                  day: 'numeric',
                                  hour: '2-digit',
                                  minute: '2-digit'
                                })}
                              </span>
                            </div>

                            <div className="flex items-center gap-1.5">
                              {comment.isPrivate ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-amber-100 text-amber-800 border border-amber-300">
                                  <Lock className="w-2.5 h-2.5 text-amber-700" />
                                  非公開（自分のみ）
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md bg-blue-50 text-blue-700 border border-blue-200">
                                  <Globe className="w-2.5 h-2.5 text-blue-600" />
                                  公開
                                </span>
                              )}

                              {canDelete && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteCommentClick(comment.id)}
                                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-white rounded transition-colors cursor-pointer"
                                  title="コメントを削除"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="whitespace-pre-wrap break-words pl-6 text-[12px] leading-relaxed">
                            {renderContentWithLinks(comment.content)}
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>

                {/* 新規コメント投稿フォーム */}
                <form
                  onSubmit={handleAddCommentSubmit}
                  className="pt-2 border-t border-slate-100 space-y-2"
                >
                  <div className="relative">
                    <textarea
                      value={newCommentText}
                      onChange={(e) => setNewCommentText(e.target.value)}
                      placeholder="対応結果や折り返し状況、自分専用の備忘録メモを入力..."
                      rows={2}
                      className="w-full text-xs p-2.5 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none bg-white font-medium"
                    />
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2">
                    {/* 公開 / 非公開 切り替え */}
                    <div className="flex items-center gap-2 text-xs">
                      <label className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                        !newCommentIsPrivate
                          ? 'bg-blue-50 border-blue-300 text-blue-700 ring-1 ring-blue-300'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}>
                        <input
                          type="radio"
                          name="globalMemoCommentPrivacy"
                          checked={!newCommentIsPrivate}
                          onChange={() => setNewCommentIsPrivate(false)}
                          className="sr-only"
                        />
                        <Globe className="w-3.5 h-3.5 text-blue-600" />
                        <span>公開（全員に共有）</span>
                      </label>

                      <label className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-bold cursor-pointer transition-all ${
                        newCommentIsPrivate
                          ? 'bg-amber-50 border-amber-300 text-amber-800 ring-1 ring-amber-300'
                          : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}>
                        <input
                          type="radio"
                          name="globalMemoCommentPrivacy"
                          checked={newCommentIsPrivate}
                          onChange={() => setNewCommentIsPrivate(true)}
                          className="sr-only"
                        />
                        <Lock className="w-3.5 h-3.5 text-amber-700" />
                        <span>非公開（自分のみ閲覧可能）</span>
                      </label>
                    </div>

                    <button
                      type="submit"
                      disabled={!newCommentText.trim() || isSubmittingComment}
                      className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold transition-colors flex items-center gap-1 cursor-pointer disabled:cursor-not-allowed shadow-2xs"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>コメントを投稿</span>
                    </button>
                  </div>

                  {newCommentIsPrivate && (
                    <p className="text-[10px] text-amber-700 flex items-center gap-1 pt-0.5">
                      <Lock className="w-3 h-3 shrink-0" />
                      非公開コメントは宛先担当者（あなた）のみに表示され、受付作成者や他メンバーには表示されません。
                    </p>
                  )}
                </form>
              </div>
            );
          })()}

        </div>

        {/* Footer controls */}
        <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-3 shrink-0">
          {isRecipient ? (
            <button
              onClick={() => onToggleStatus(memo.id)}
              className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold rounded-xl border cursor-pointer relative z-10 transition-all ${
                !isMyHandled
                  ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-sm shadow-emerald-600/10'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              {!isMyHandled ? (
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
          ) : (
            <span className="text-[11px] text-slate-400 font-medium italic">
              ※ 宛名メンバー本人のみ対応ステータスを操作できます
            </span>
          )}
          
          <button
            onClick={onClose}
            className="px-5 py-2 bg-slate-800 hover:bg-slate-900 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer relative z-10 transition-colors ml-auto"
          >
            閉じる
          </button>
        </div>

      </div>

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}

