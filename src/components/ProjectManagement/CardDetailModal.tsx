import React, { useState, useMemo } from 'react';
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
} from 'lucide-react';
import { User } from '../../types';
import {
  ProjectBoard,
  ProjectCard,
  ProjectCardPriority,
  ProjectCardType,
  ProjectChecklistItem,
} from '../../types/project';
import { renderWithClickableLinks } from '../../utils/linkify';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';

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
}

const PRIORITY_OPTIONS: { id: ProjectCardPriority; label: string; textClass: string }[] = [
  { id: 'none', label: 'なし', textClass: 'text-slate-500' },
  { id: 'low', label: '低', textClass: 'text-sky-700' },
  { id: 'medium', label: '中', textClass: 'text-amber-700' },
  { id: 'high', label: '高', textClass: 'text-rose-700' },
];

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
  const [startDate, setStartDate] = useState(card?.startDate || '');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() =>
    card?.assigneeIds ? card.assigneeIds.map(String) : []
  );
  const [tags, setTags] = useState<string[]>(() => (card?.tags ? [...card.tags] : []));
  const [tagInput, setTagInput] = useState('');
  const [checklist, setChecklist] = useState<ProjectChecklistItem[]>(() =>
    card?.checklist ? card.checklist.map(c => ({ ...c })) : []
  );
  const [newCheckText, setNewCheckText] = useState('');
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
        checklist,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[92vh]"
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
              メモ・詳細内容（URLを貼るとリンクとしてそのまま開けます）
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={5}
              placeholder="作業メモ、参考URL、引き継ぎ事項、確認内容などを自由に入力..."
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
            {description && /https?:\/\//i.test(description) && (
              <div className="mt-1.5 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-700 whitespace-pre-wrap break-words">
                <div className="text-[10px] font-semibold text-slate-400 mb-1">リンクプレビュー</div>
                {renderWithClickableLinks(description)}
              </div>
            )}
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
                disabled={isSaving}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                {isSaving ? '保存中...' : card ? '変更を保存' : '作成する'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
