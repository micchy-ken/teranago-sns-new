import React, { useState, useMemo, useRef } from 'react';
import {
  X,
  CheckCircle2,
  Circle,
  Pin,
  Trash2,
  Share2,
  Plus,
  Calendar,
  Flag,
  Users,
  StickyNote,
  CheckSquare,
  Check,
  Tag,
  Link2,
  ExternalLink,
  Paperclip,
  Eye,
  Download,
  MessageSquare,
  Send,
  Upload,
  Loader2,
  Globe,
} from 'lucide-react';
import { AttachmentFile, User } from '../../types';
import {
  ProjectBoard,
  ProjectCard,
  ProjectCardComment,
  ProjectCardLink,
  ProjectCardPriority,
  ProjectCardType,
  ProjectChecklistItem,
} from '../../types/project';
import { API_BASE_URL } from '../../config/api';
import { renderWithClickableLinks } from '../../utils/linkify';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import { fetchOgpData } from '../../utils/ogp';
import { uploadFile, resolveFileUrl } from '../../utils/fileUpload';
import { FilePreviewModal } from '../FilePreviewModal';
import { notifyProjectComment } from './projectNotifications';

interface CardDetailModalProps {
  isOpen: boolean;
  onClose: () => void;
  board: ProjectBoard;
  card?: ProjectCard | null;
  initialColumnId?: string;
  initialCardType?: ProjectCardType;
  currentUser: User;
  allUsers: User[];
  onSave: (payload: Partial<ProjectCard>) => Promise<void>;
  onDelete?: (cardId: string) => Promise<void>;
  onShareCard?: (card: ProjectCard) => Promise<void>;
  onCardPatched?: (updatedCard: ProjectCard) => void;
}

const PRIORITY_OPTIONS: { id: ProjectCardPriority; label: string }[] = [
  { id: 'none', label: 'なし' },
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
];

function formatJstTimestamp(iso?: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export const CardDetailModal: React.FC<CardDetailModalProps> = ({
  isOpen,
  onClose,
  board,
  card,
  initialColumnId,
  initialCardType,
  currentUser,
  allUsers,
  onSave,
  onDelete,
  onShareCard,
  onCardPatched,
}) => {
  const defaultColumnId = useMemo(() => {
    if (card?.columnId) return card.columnId;
    if (initialColumnId) return initialColumnId;
    const preferred =
      board.columns.find(c => c.kind === (initialCardType === 'memo' ? 'memo' : 'todo')) ||
      board.columns[0];
    return preferred?.id || 'col-todo';
  }, [card?.columnId, initialColumnId, initialCardType, board.columns]);

  const [cardType, setCardType] = useState<ProjectCardType>(
    card?.cardType || initialCardType || 'task'
  );
  const [title, setTitle] = useState(card?.title || '');
  const [description, setDescription] = useState(card?.description || '');
  const [columnId, setColumnId] = useState(defaultColumnId);
  const [priority, setPriority] = useState<ProjectCardPriority>(card?.priority || 'none');
  const [dueDate, setDueDate] = useState(card?.dueDate || '');
  const [startDate] = useState(card?.startDate || '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() =>
    card?.assigneeIds ? card.assigneeIds.map(String) : []
  );
  const [tags, setTags] = useState<string[]>(() => (card?.tags ? [...card.tags] : []));
  const [tagInput, setTagInput] = useState('');

  // URLリンクカード
  const [links, setLinks] = useState<ProjectCardLink[]>(() =>
    card?.links ? card.links.map(l => ({ ...l })) : []
  );
  const [newLinkUrl, setNewLinkUrl] = useState('');
  const [newLinkLabel, setNewLinkLabel] = useState('');
  const [isFetchingOgp, setIsFetchingOgp] = useState(false);

  // 添付ファイル＆プレビュー
  const [attachments, setAttachments] = useState<AttachmentFile[]>(() =>
    card?.attachments ? card.attachments.map(a => ({ ...a })) : []
  );
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [isDragOverFile, setIsDragOverFile] = useState(false);
  const [previewFile, setPreviewFile] = useState<AttachmentFile | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // チェックリスト
  const [checklist, setChecklist] = useState<ProjectChecklistItem[]>(() =>
    card?.checklist ? card.checklist.map(c => ({ ...c })) : []
  );
  const [newCheckText, setNewCheckText] = useState('');

  // コメント
  const [comments, setComments] = useState<ProjectCardComment[]>(() =>
    card?.comments ? card.comments.map(c => ({ ...c })) : []
  );
  const [commentText, setCommentText] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<AttachmentFile[]>([]);
  const [isSendingComment, setIsSendingComment] = useState(false);
  const commentFileInputRef = useRef<HTMLInputElement>(null);

  const [isPinned, setIsPinned] = useState(Boolean(card?.isPinned));
  const [isCompleted, setIsCompleted] = useState(Boolean(card?.isCompleted));
  const [showAssigneePicker, setShowAssigneePicker] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [copiedCardLink, setCopiedCardLink] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const selectableUsers = useMemo(() => {
    if (board.boardType === 'personal') {
      return [currentUser];
    }
    if (board.visibility === 'members' && board.memberIds?.length > 0) {
      const memberSet = new Set(board.memberIds.map(String));
      const matched = allUsers.filter(u => memberSet.has(String(u.id)));
      if (matched.length > 0) return matched;
    }
    return [...allUsers].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
  }, [board, allUsers, currentUser]);

  if (!isOpen) return null;

  const toggleAssignee = (uid: string) => {
    const strId = String(uid);
    setAssigneeIds(prev => (prev.includes(strId) ? prev.filter(id => id !== strId) : [...prev, strId]));
  };

  const handleAddTag = () => {
    const t = tagInput.trim();
    if (!t) return;
    if (!tags.includes(t)) {
      setTags(prev => [...prev, t]);
    }
    setTagInput('');
  };

  // URL追加（OGP取得付き）
  const handleAddLink = async () => {
    let raw = newLinkUrl.trim();
    if (!raw) return;
    if (!/^https?:\/\//i.test(raw)) {
      raw = `https://${raw}`;
    }
    const label = newLinkLabel.trim();
    setIsFetchingOgp(true);
    try {
      const ogp = await fetchOgpData(raw);
      const item: ProjectCardLink = {
        id: `lnk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        url: ogp.url || raw,
        label: label || undefined,
        title: ogp.title || ogp.hostname || raw,
        favicon: ogp.favicon || undefined,
      };
      setLinks(prev => [...prev, item]);
      setNewLinkUrl('');
      setNewLinkLabel('');
    } catch {
      setLinks(prev => [
        ...prev,
        {
          id: `lnk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          url: raw,
          label: label || undefined,
          title: label || raw,
        },
      ]);
      setNewLinkUrl('');
      setNewLinkLabel('');
    } finally {
      setIsFetchingOgp(false);
    }
  };

  const handleRemoveLink = (id: string) => {
    setLinks(prev => prev.filter(l => l.id !== id));
  };

  // ファイルアップロード（選択・D&D・スクショ貼付）
  const handleUploadFiles = async (fileList: FileList | File[], target: 'card' | 'comment' = 'card') => {
    const files = Array.from(fileList || []);
    if (files.length === 0) return;
    setIsUploadingFile(true);
    setErrorMsg(null);
    try {
      const uploaded: AttachmentFile[] = [];
      for (const file of files) {
        const resFile = await uploadFile(file);
        uploaded.push(resFile);
      }
      if (target === 'comment') {
        setCommentAttachments(prev => [...prev, ...uploaded]);
      } else {
        setAttachments(prev => [...prev, ...uploaded]);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'ファイルのアップロードに失敗しました');
    } finally {
      setIsUploadingFile(false);
    }
  };

  const handleModalPaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    const pastedImages: File[] = [];
    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (it.kind === 'file') {
        const f = it.getAsFile();
        if (f) pastedImages.push(f);
      }
    }
    if (pastedImages.length > 0) {
      e.preventDefault();
      handleUploadFiles(pastedImages, 'card');
    }
  };

  const handleAddChecklistItem = () => {
    const text = newCheckText.trim();
    if (!text) return;
    setChecklist(prev => [
      ...prev,
      { id: `chk-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, text, done: false },
    ]);
    setNewCheckText('');
  };

  const handleToggleChecklistItem = (id: string) => {
    setChecklist(prev => prev.map(item => (item.id === id ? { ...item, done: !item.done } : item)));
  };

  const handleRemoveChecklistItem = (id: string) => {
    setChecklist(prev => prev.filter(item => item.id !== id));
  };

  // コメント投稿・削除
  const handlePostComment = async () => {
    if (!card?.id) return;
    const text = commentText.trim();
    if (!text && commentAttachments.length === 0) return;
    setIsSendingComment(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/cards/${encodeURIComponent(card.id)}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          authorId: currentUser.id,
          authorName: currentUser.name,
          authorAvatar: currentUser.avatarUrl,
          content: text,
          attachments: commentAttachments,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'コメントの送信に失敗しました');
      }
      const data = await res.json();
      const nextComments: ProjectCardComment[] = Array.isArray(data.card?.comments)
        ? data.card.comments
        : [...comments, data.comment];
      setComments(nextComments);
      setCommentText('');
      setCommentAttachments([]);
      if (data.card && onCardPatched) {
        onCardPatched(data.card);
      }
      void notifyProjectComment({
        board,
        card: data.card || card,
        commentText: text || (commentAttachments.length > 0 ? 'ファイルを添付しました' : ''),
        actor: currentUser,
        allUsers,
      });
    } catch (err: any) {
      setErrorMsg(err?.message || 'コメントの送信に失敗しました');
    } finally {
      setIsSendingComment(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (!card?.id) return;
    try {
      const res = await fetch(
        `${API_BASE_URL}/projects/cards/${encodeURIComponent(card.id)}/comments/${encodeURIComponent(commentId)}`,
        { method: 'DELETE' }
      );
      if (!res.ok) throw new Error('削除に失敗しました');
      const data = await res.json();
      const nextComments = Array.isArray(data.card?.comments)
        ? data.card.comments
        : comments.filter(c => c.id !== commentId);
      setComments(nextComments);
      if (data.card && onCardPatched) {
        onCardPatched(data.card);
      }
    } catch (err: any) {
      setErrorMsg(err?.message || 'コメントの削除に失敗しました');
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg('タイトルを入力してください');
      return;
    }
    setErrorMsg(null);
    setIsSaving(true);
    try {
      await onSave({
        id: card?.id,
        projectId: board.id,
        columnId,
        cardType,
        title: trimmedTitle,
        description,
        priority,
        dueDate: dueDate || undefined,
        startDate: startDate || undefined,
        assigneeIds,
        tags,
        links,
        attachments,
        checklist,
        comments,
        isPinned,
        isCompleted: cardType === 'memo' ? false : isCompleted,
        syncColumn: false,
      } as any);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || '保存に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!card || !onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsSaving(true);
    try {
      await onDelete(card.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || '削除に失敗しました');
      setConfirmDelete(false);
    } finally {
      setIsSaving(false);
    }
  };

  const handleShareClick = async () => {
    if (!card || !onShareCard) return;
    await onShareCard(card);
    setCopiedCardLink(true);
    setTimeout(() => setCopiedCardLink(false), 2500);
  };

  const doneCount = checklist.filter(c => c.done).length;
  const isAdminUser = Boolean(currentUser.isAdmin || currentUser.role === 'admin');

  return (
    <>
      <div
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4"
        onClick={onClose}
        onPaste={handleModalPaste}
      >
        <div
          className="w-full max-w-3xl bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[92vh]"
          onClick={e => e.stopPropagation()}
        >
          {/* Header Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 border-b border-slate-200 bg-slate-50/70">
            <div className="flex items-center gap-1 p-0.5 bg-slate-200/70 rounded-lg">
              <button
                type="button"
                onClick={() => setCardType('task')}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  cardType === 'task' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <CheckSquare className="w-3.5 h-3.5 text-indigo-600" />
                <span>Todo</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setCardType('memo');
                  setIsCompleted(false);
                }}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  cardType === 'memo' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <StickyNote className="w-3.5 h-3.5 text-amber-600" />
                <span>メモ・資料</span>
              </button>
            </div>

            <div className="flex items-center gap-1.5">
              {cardType === 'task' && (
                <button
                  type="button"
                  onClick={() => setIsCompleted(prev => !prev)}
                  className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    isCompleted
                      ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  {isCompleted ? <CheckCircle2 className="w-3.5 h-3.5" /> : <Circle className="w-3.5 h-3.5" />}
                  <span>{isCompleted ? '完了済み' : '完了にする'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => setIsPinned(prev => !prev)}
                title="列の先頭にピン留め"
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                  isPinned
                    ? 'border-amber-400 bg-amber-50 text-amber-800'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                <Pin className="w-3.5 h-3.5" />
                <span>固定</span>
              </button>
              {card && onShareCard && (
                <button
                  type="button"
                  onClick={handleShareClick}
                  title="このカードの共有URLをコピー＆お気に入り登録"
                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-indigo-700 hover:border-indigo-300 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  {copiedCardLink ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Share2 className="w-3.5 h-3.5" />}
                  <span>{copiedCardLink ? 'コピー済' : '共有'}</span>
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4">
            {errorMsg && (
              <div className="px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
                {errorMsg}
              </div>
            )}

            {/* Title */}
            <div>
              <input
                type="text"
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder={cardType === 'memo' ? 'メモ・資料タイトル（例: 見積テンプレートURL・規定リンク）' : 'タスク名を入力...'}
                className="w-full px-3 py-2 text-base font-bold text-slate-900 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
                autoFocus={!card}
              />
            </div>

            {/* Core Attributes Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-slate-500 mb-1">ステータス（列）</label>
                <select
                  value={columnId}
                  onChange={e => {
                    const nextColId = e.target.value;
                    setColumnId(nextColId);
                    const col = board.columns.find(c => c.id === nextColId);
                    if (cardType === 'task' && col?.kind === 'done') setIsCompleted(true);
                  }}
                  className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800"
                >
                  {board.columns.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </div>

              {cardType === 'task' && (
                <>
                  <div>
                    <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 mb-1">
                      <Flag className="w-3 h-3" />
                      <span>優先度</span>
                    </label>
                    <select
                      value={priority}
                      onChange={e => setPriority(e.target.value as ProjectCardPriority)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800"
                    >
                      {PRIORITY_OPTIONS.map(p => (
                        <option key={p.id} value={p.id}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 mb-1">
                      <Calendar className="w-3 h-3" />
                      <span>期限</span>
                    </label>
                    <input
                      type="date"
                      value={dueDate}
                      onChange={e => setDueDate(e.target.value)}
                      className="w-full px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-800 tabular-nums"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Assignees */}
            {board.boardType === 'team' && (
              <div className="pt-1">
                <div className="flex items-center justify-between mb-1.5">
                  <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500">
                    <Users className="w-3 h-3" />
                    <span>担当者</span>
                  </label>
                  <div className="flex items-center gap-2">
                    {currentUser?.id && !assigneeIds.includes(String(currentUser.id)) && (
                      <button
                        type="button"
                        onClick={() => toggleAssignee(String(currentUser.id))}
                        className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 cursor-pointer"
                      >
                        ＋ 自分を追加
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setShowAssigneePicker(prev => !prev)}
                      className="text-[11px] font-medium text-slate-600 hover:text-slate-900 cursor-pointer"
                    >
                      {showAssigneePicker ? '選択を閉じる' : 'メンバーを選択'}
                    </button>
                  </div>
                </div>

                {assigneeIds.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 mb-2">
                    {assigneeIds.map(id => {
                      const u = allUsers.find(user => String(user.id) === String(id));
                      const name = u?.name || '不明';
                      return (
                        <button
                          key={id}
                          type="button"
                          onClick={() => toggleAssignee(id)}
                          className="inline-flex items-center gap-1.5 pl-1 pr-2 py-0.5 rounded-full bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 cursor-pointer transition-colors"
                        >
                          <img
                            src={getAvatarUrl(u?.avatarUrl)}
                            alt={name}
                            onError={handleAvatarError}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                          <span>{name}</span>
                          <X className="w-3 h-3 text-slate-400" />
                        </button>
                      );
                    })}
                  </div>
                )}

                {showAssigneePicker && (
                  <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                    {selectableUsers.map(u => {
                      const checked = assigneeIds.includes(String(u.id));
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => toggleAssignee(String(u.id))}
                          className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-slate-50 cursor-pointer ${
                            checked ? 'bg-indigo-50/50' : ''
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <img
                              src={getAvatarUrl(u.avatarUrl)}
                              alt={u.name}
                              onError={handleAvatarError}
                              className="w-5 h-5 rounded-full object-cover shrink-0"
                            />
                            <span className="font-medium text-slate-800 truncate">{u.name}</span>
                            <span className="text-[11px] text-slate-400 truncate">{u.department}</span>
                          </div>
                          {checked && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {/* Description / Memo body + Linkify */}
            <div>
              <label className="block text-[11px] font-semibold text-slate-500 mb-1">
                メモ・詳細内容（本文内のURLもクリック可能）
              </label>
              <textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                rows={4}
                placeholder="作業メモ、引き継ぎ事項、確認内容などを自由に入力..."
                className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              />
              {description && /https?:\/\//i.test(description) && (
                <div className="mt-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 whitespace-pre-wrap break-words">
                  <div className="text-[10px] font-semibold text-slate-400 mb-1">本文内リンク</div>
                  {renderWithClickableLinks(description)}
                </div>
              )}
            </div>

            {/* 参考URLリンクカード */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Link2 className="w-3.5 h-3.5 text-indigo-600" />
                  <span>参考URL・リンク集 ({links.length})</span>
                </label>
              </div>

              {links.length > 0 && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mb-2.5">
                  {links.map(link => (
                    <div
                      key={link.id}
                      className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50/70 hover:border-indigo-300 transition-colors"
                    >
                      <a
                        href={link.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 min-w-0 flex-1 group"
                      >
                        {link.favicon ? (
                          <img
                            src={link.favicon}
                            alt=""
                            className="w-4 h-4 rounded-xs shrink-0"
                            onError={e => {
                              e.currentTarget.style.display = 'none';
                            }}
                          />
                        ) : (
                          <Globe className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <div className="min-w-0">
                          <div className="text-xs font-medium text-indigo-700 group-hover:underline truncate">
                            {link.label || link.title || link.url}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate">{link.url}</div>
                        </div>
                        <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
                      </a>
                      <button
                        type="button"
                        onClick={() => handleRemoveLink(link.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                        title="URLを削除"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <input
                  type="text"
                  value={newLinkLabel}
                  onChange={e => setNewLinkLabel(e.target.value)}
                  placeholder="表示ラベル（任意・例: 見積フォルダ）"
                  className="sm:w-44 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-400"
                />
                <input
                  type="text"
                  value={newLinkUrl}
                  onChange={e => setNewLinkUrl(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddLink();
                    }
                  }}
                  placeholder="https://... (URLを入力して追加)"
                  className="flex-1 px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-400"
                />
                <button
                  type="button"
                  onClick={handleAddLink}
                  disabled={isFetchingOgp || !newLinkUrl.trim()}
                  className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded-lg border border-indigo-200 disabled:opacity-40 cursor-pointer whitespace-nowrap"
                >
                  {isFetchingOgp ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
                  <span>URL追加</span>
                </button>
              </div>
            </div>

            {/* 資料・添付ファイル（D&D・画像貼り付け・プレビュー対応） */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <label className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <Paperclip className="w-3.5 h-3.5 text-indigo-600" />
                  <span>資料・添付ファイル ({attachments.length})</span>
                </label>
                <span className="text-[10px] text-slate-400">ドラッグ＆ドロップ・Ctrl+Vスクショ貼付対応</span>
              </div>

              {attachments.length > 0 && (
                <div className="space-y-1.5 mb-2.5">
                  {attachments.map(att => (
                    <div
                      key={att.id}
                      className="flex items-center justify-between gap-2 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50/70"
                    >
                      <button
                        type="button"
                        onClick={() => setPreviewFile(att)}
                        className="flex items-center gap-2 min-w-0 flex-1 text-left cursor-pointer group"
                      >
                        <Paperclip className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        <span className="text-xs font-medium text-slate-800 group-hover:text-indigo-700 truncate">
                          {att.name}
                        </span>
                        {att.size && (
                          <span className="text-[10px] text-slate-400 tabular-nums shrink-0">{att.size}</span>
                        )}
                      </button>
                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => setPreviewFile(att)}
                          title="プレビュー"
                          className="p-1 text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded cursor-pointer"
                        >
                          <Eye className="w-3.5 h-3.5" />
                        </button>
                        <a
                          href={resolveFileUrl(att.url)}
                          download={att.name}
                          target="_blank"
                          rel="noopener noreferrer"
                          title="ダウンロード"
                          className="p-1 text-slate-500 hover:text-slate-800 hover:bg-slate-200/60 rounded"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </a>
                        <button
                          type="button"
                          onClick={() => setAttachments(prev => prev.filter(x => x.id !== att.id))}
                          title="添付を削除"
                          className="p-1 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragOverFile(true);
                }}
                onDragLeave={() => setIsDragOverFile(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragOverFile(false);
                  if (e.dataTransfer?.files?.length) {
                    handleUploadFiles(e.dataTransfer.files, 'card');
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`px-3 py-3 rounded-lg border border-dashed text-center text-xs transition-colors cursor-pointer ${
                  isDragOverFile
                    ? 'border-indigo-500 bg-indigo-50/70 text-indigo-700'
                    : 'border-slate-300 bg-slate-50/40 text-slate-500 hover:border-indigo-400 hover:bg-slate-50'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  className="hidden"
                  onChange={e => {
                    if (e.target.files?.length) {
                      handleUploadFiles(e.target.files, 'card');
                      e.target.value = '';
                    }
                  }}
                />
                {isUploadingFile ? (
                  <span className="inline-flex items-center gap-1.5 text-indigo-600 font-medium">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    アップロード中...
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5">
                    <Upload className="w-3.5 h-3.5" />
                    クリックしてファイル選択、またはここにドラッグ＆ドロップ（PDF / Excel / Word / 画像）
                  </span>
                )}
              </div>
            </div>

            {/* Checklist / Subtasks */}
            <div className="pt-2 border-t border-slate-100">
              <div className="flex items-center justify-between mb-2">
                <label className="text-xs font-semibold text-slate-700">
                  チェックリスト（小項目）
                  {checklist.length > 0 && (
                    <span className="ml-2 text-[11px] font-normal text-slate-500 tabular-nums">
                      {doneCount} / {checklist.length} 完了
                    </span>
                  )}
                </label>
              </div>

              {checklist.length > 0 && (
                <div className="space-y-1.5 mb-2.5">
                  {checklist.map(item => (
                    <div
                      key={item.id}
                      className="flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50/50"
                    >
                      <button
                        type="button"
                        onClick={() => handleToggleChecklistItem(item.id)}
                        className="flex items-center gap-2 text-left text-xs flex-1 min-w-0 cursor-pointer"
                      >
                        {item.done ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                        ) : (
                          <Circle className="w-4 h-4 text-slate-400 shrink-0" />
                        )}
                        <span className={item.done ? 'line-through text-slate-400 truncate' : 'text-slate-800 truncate'}>
                          {item.text}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRemoveChecklistItem(item.id)}
                        className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer shrink-0"
                        title="小項目を削除"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCheckText}
                  onChange={e => setNewCheckText(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddChecklistItem();
                    }
                  }}
                  placeholder="小項目を入力してEnter（例: 見積書作成）..."
                  className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-400"
                />
                <button
                  type="button"
                  onClick={handleAddChecklistItem}
                  className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>追加</span>
                </button>
              </div>
            </div>

            {/* Tags */}
            <div className="pt-2 border-t border-slate-100">
              <label className="flex items-center gap-1 text-[11px] font-semibold text-slate-500 mb-1.5">
                <Tag className="w-3 h-3" />
                <span>タグ（任意）</span>
              </label>
              <div className="flex flex-wrap items-center gap-1.5">
                {tags.map(t => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTags(prev => prev.filter(x => x !== t))}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-xs text-slate-700 cursor-pointer"
                  >
                    <span>#{t}</span>
                    <X className="w-3 h-3 text-slate-400" />
                  </button>
                ))}
                <input
                  type="text"
                  value={tagInput}
                  onChange={e => setTagInput(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTag();
                    }
                  }}
                  placeholder="タグ追加..."
                  className="px-2.5 py-1 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 w-32"
                />
              </div>
            </div>

            {/* コメントスレッド (既存カードのみ即時投稿可) */}
            {card?.id && (
              <div className="pt-3 border-t border-slate-200 space-y-2.5">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                  <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                  <span>コメント・連絡 ({comments.length})</span>
                </div>

                {comments.length > 0 && (
                  <div className="space-y-2 max-h-52 overflow-y-auto pr-1">
                    {comments.map(cmt => {
                      const canDelete = isAdminUser || String(cmt.authorId) === String(currentUser.id);
                      return (
                        <div key={cmt.id} className="p-2.5 rounded-lg bg-slate-50 border border-slate-200/80 text-xs">
                          <div className="flex items-center justify-between gap-2 mb-1">
                            <div className="flex items-center gap-2 min-w-0">
                              <img
                                src={getAvatarUrl(cmt.authorAvatar)}
                                alt={cmt.authorName}
                                onError={handleAvatarError}
                                className="w-5 h-5 rounded-full object-cover shrink-0 bg-slate-200"
                              />
                              <span className="font-semibold text-slate-800 truncate">{cmt.authorName}</span>
                              <span className="text-[10px] text-slate-400 tabular-nums shrink-0">
                                {formatJstTimestamp(cmt.createdAt)}
                              </span>
                            </div>
                            {canDelete && (
                              <button
                                type="button"
                                onClick={() => handleDeleteComment(cmt.id)}
                                className="p-1 text-slate-400 hover:text-rose-600 cursor-pointer"
                                title="コメント削除"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            )}
                          </div>
                          {cmt.content && (
                            <div className="text-slate-700 whitespace-pre-wrap break-words pl-7">
                              {renderWithClickableLinks(cmt.content)}
                            </div>
                          )}
                          {cmt.attachments && cmt.attachments.length > 0 && (
                            <div className="mt-1.5 pl-7 flex flex-wrap gap-1.5">
                              {cmt.attachments.map(att => (
                                <button
                                  key={att.id}
                                  type="button"
                                  onClick={() => setPreviewFile(att)}
                                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-white border border-slate-200 hover:border-indigo-300 text-[11px] text-indigo-700 cursor-pointer"
                                >
                                  <Paperclip className="w-3 h-3" />
                                  <span className="truncate max-w-[180px]">{att.name}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                )}

                {commentAttachments.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {commentAttachments.map(att => (
                      <span
                        key={att.id}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-indigo-50 border border-indigo-200 text-[11px] text-indigo-800"
                      >
                        <Paperclip className="w-3 h-3" />
                        <span>{att.name}</span>
                        <button
                          type="button"
                          onClick={() => setCommentAttachments(prev => prev.filter(x => x.id !== att.id))}
                          className="text-indigo-500 hover:text-rose-600 cursor-pointer"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="flex items-start gap-2">
                  <textarea
                    value={commentText}
                    onChange={e => setCommentText(e.target.value)}
                    rows={2}
                    placeholder="コメント・進捗連絡を入力（即時投稿）..."
                    className="flex-1 px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                  <div className="flex flex-col gap-1.5 shrink-0">
                    <input
                      ref={commentFileInputRef}
                      type="file"
                      multiple
                      className="hidden"
                      onChange={e => {
                        if (e.target.files?.length) {
                          handleUploadFiles(e.target.files, 'comment');
                          e.target.value = '';
                        }
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => commentFileInputRef.current?.click()}
                      disabled={isUploadingFile}
                      title="コメントにファイル添付"
                      className="inline-flex items-center justify-center p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-indigo-700 hover:bg-slate-50 cursor-pointer"
                    >
                      <Paperclip className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={handlePostComment}
                      disabled={isSendingComment || (!commentText.trim() && commentAttachments.length === 0)}
                      className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      <Send className="w-3 h-3" />
                      <span>送信</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200">
              <div>
                {card && onDelete && (
                  <button
                    type="button"
                    onClick={handleDeleteClick}
                    disabled={isSaving}
                    className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                      confirmDelete
                        ? 'bg-rose-600 text-white hover:bg-rose-700'
                        : 'text-rose-600 hover:bg-rose-50'
                    }`}
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>{confirmDelete ? '本当に削除する' : '削除'}</span>
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isSaving || isUploadingFile}
                  className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
                >
                  {isSaving ? '保存中...' : card ? '変更を保存' : '作成する'}
                </button>
              </div>
            </div>
          </form>
        </div>
      </div>

      <FilePreviewModal
        isOpen={Boolean(previewFile)}
        onClose={() => setPreviewFile(null)}
        file={previewFile}
      />
    </>
  );
};
