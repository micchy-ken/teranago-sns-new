import React, { useEffect, useMemo, useState } from 'react';
import {
  X,
  FolderKanban,
  CheckSquare,
  StickyNote,
  Calendar,
  Flag,
  Users,
  Loader2,
  Check,
  AlertCircle,
} from 'lucide-react';
import { AttachmentFile, User } from '../../types';
import {
  ProjectBoard,
  ProjectCard,
  ProjectCardLink,
  ProjectCardPriority,
  ProjectCardType,
} from '../../types/project';
import { API_BASE_URL } from '../../config/api';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import { notifyProjectAssignees } from './projectNotifications';

interface QuickTaskFromSourceModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  allUsers: User[];
  initialTitle: string;
  initialDescription: string;
  initialTags?: string[];
  initialLinks?: ProjectCardLink[];
  initialAttachments?: AttachmentFile[];
  initialAssigneeIds?: string[];
  sourceLabel?: string;
  onCreated?: (card: ProjectCard, board: ProjectBoard) => void;
}

const PRIORITY_OPTIONS: { id: ProjectCardPriority; label: string }[] = [
  { id: 'none', label: 'なし' },
  { id: 'low', label: '低' },
  { id: 'medium', label: '中' },
  { id: 'high', label: '高' },
];

export const QuickTaskFromSourceModal: React.FC<QuickTaskFromSourceModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  allUsers,
  initialTitle,
  initialDescription,
  initialTags = [],
  initialLinks = [],
  initialAttachments = [],
  initialAssigneeIds,
  sourceLabel = 'プロジェクトへ登録',
  onCreated,
}) => {
  const [boards, setBoards] = useState<ProjectBoard[]>([]);
  const [loadingBoards, setLoadingBoards] = useState(false);
  const [selectedBoardId, setSelectedBoardId] = useState('');
  const [selectedColumnId, setSelectedColumnId] = useState('');
  const [cardType, setCardType] = useState<ProjectCardType>('task');
  const [title, setTitle] = useState(initialTitle);
  const [description, setDescription] = useState(initialDescription);
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<ProjectCardPriority>('medium');
  const [assigneeIds, setAssigneeIds] = useState<string[]>(() =>
    initialAssigneeIds && initialAssigneeIds.length > 0
      ? initialAssigneeIds.map(String)
      : [String(currentUser.id)]
  );
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setTitle(initialTitle);
    setDescription(initialDescription);
    setDueDate('');
    setPriority('medium');
    setCardType('task');
    setErrorMsg(null);
    setAssigneeIds(
      initialAssigneeIds && initialAssigneeIds.length > 0
        ? initialAssigneeIds.map(String)
        : [String(currentUser.id)]
    );

    let cancelled = false;
    const loadBoards = async () => {
      setLoadingBoards(true);
      try {
        const params = new URLSearchParams({
          userId: String(currentUser.id),
          userName: currentUser.name || '',
          officeId: currentUser.officeId || '',
          office: currentUser.office || '',
          divisionId: currentUser.divisionId || '',
          division: currentUser.division || '',
          isAdmin: String(Boolean(currentUser.isAdmin || currentUser.role === 'admin')),
          includeCards: 'false',
        });
        const res = await fetch(`${API_BASE_URL}/projects/boards?${params.toString()}`);
        if (!res.ok) throw new Error('ボード一覧の取得に失敗しました');
        const data = await res.json();
        if (cancelled) return;
        const list: ProjectBoard[] = Array.isArray(data.boards) ? data.boards : [];
        const activeBoards = list.filter(b => !b.isArchived);
        setBoards(activeBoards);

        const defaultBoard =
          activeBoards.find(b => b.boardType === 'personal') || activeBoards[0] || null;
        if (defaultBoard) {
          setSelectedBoardId(defaultBoard.id);
          const defaultCol =
            defaultBoard.columns.find(c => c.kind === 'todo') ||
            defaultBoard.columns.find(c => c.kind !== 'done') ||
            defaultBoard.columns[0];
          setSelectedColumnId(defaultCol?.id || '');
        }
      } catch (err: any) {
        if (!cancelled) {
          setErrorMsg(err?.message || 'ボード情報の読み込みに失敗しました');
        }
      } finally {
        if (!cancelled) setLoadingBoards(false);
      }
    };
    loadBoards();
    return () => {
      cancelled = true;
    };
  }, [isOpen, currentUser.id]);

  const selectedBoard = useMemo(
    () => boards.find(b => b.id === selectedBoardId) || boards[0] || null,
    [boards, selectedBoardId]
  );

  const selectableUsers = useMemo(() => {
    if (!selectedBoard) return [currentUser];
    if (selectedBoard.boardType === 'personal') return [currentUser];
    if (selectedBoard.visibility === 'members' && selectedBoard.memberIds?.length > 0) {
      const set = new Set(selectedBoard.memberIds.map(String));
      const matched = allUsers.filter(u => set.has(String(u.id)));
      if (matched.length > 0) return matched;
    }
    return [...allUsers].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
  }, [selectedBoard, allUsers, currentUser]);

  if (!isOpen) return null;

  const handleBoardChange = (boardId: string) => {
    setSelectedBoardId(boardId);
    const nextBoard = boards.find(b => b.id === boardId);
    if (nextBoard) {
      const preferredKind = cardType === 'memo' ? 'memo' : 'todo';
      const col =
        nextBoard.columns.find(c => c.kind === preferredKind) ||
        nextBoard.columns.find(c => c.kind !== 'done') ||
        nextBoard.columns[0];
      setSelectedColumnId(col?.id || '');
      if (nextBoard.boardType === 'personal') {
        setAssigneeIds([String(currentUser.id)]);
      }
    }
  };

  const handleTypeChange = (nextType: ProjectCardType) => {
    setCardType(nextType);
    if (selectedBoard) {
      const col = selectedBoard.columns.find(
        c => c.kind === (nextType === 'memo' ? 'memo' : 'todo')
      );
      if (col) setSelectedColumnId(col.id);
    }
  };

  const toggleAssignee = (uid: string) => {
    const idStr = String(uid);
    setAssigneeIds(prev =>
      prev.includes(idStr) ? prev.filter(id => id !== idStr) : [...prev, idStr]
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBoard) {
      setErrorMsg('登録先ボードが見つかりません');
      return;
    }
    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setErrorMsg('タイトルを入力してください');
      return;
    }
    const finalColumnId =
      selectedColumnId ||
      selectedBoard.columns.find(c => c.kind !== 'done')?.id ||
      selectedBoard.columns[0]?.id ||
      'col-todo';

    const finalAssignees =
      selectedBoard.boardType === 'personal' ? [String(currentUser.id)] : assigneeIds;

    setIsSaving(true);
    setErrorMsg(null);
    try {
      const res = await fetch(`${API_BASE_URL}/projects/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: selectedBoard.id,
          columnId: finalColumnId,
          cardType,
          title: trimmedTitle,
          description: description.trim(),
          priority,
          dueDate: dueDate || undefined,
          assigneeIds: finalAssignees,
          tags: initialTags,
          links: initialLinks,
          attachments: initialAttachments,
          createdBy: currentUser.id,
          createdByName: currentUser.name,
        }),
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'タスクの作成に失敗しました');
      }
      const data = await res.json();
      const createdCard: ProjectCard = data.card;

      if (finalAssignees.some(id => String(id) !== String(currentUser.id))) {
        void notifyProjectAssignees({
          board: selectedBoard,
          card: createdCard,
          targetUserIds: finalAssignees,
          actor: currentUser,
          allUsers,
          isNewCard: true,
        });
      }

      window.dispatchEvent(new Event('projects_updated'));
      onCreated?.(createdCard, selectedBoard);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || '登録に失敗しました');
    } finally {
      setIsSaving(false);
    }
  };

  const personalBoards = boards.filter(b => b.boardType === 'personal');
  const teamBoards = boards.filter(b => b.boardType === 'team');

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-3 sm:p-4 backdrop-blur-xs"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-2xl bg-white border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[92vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-1.5 bg-emerald-500/20 text-emerald-300 rounded-lg shrink-0">
              <FolderKanban className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold truncate">{sourceLabel}</h3>
              <p className="text-[11px] text-slate-300 truncate">
                プロジェクトのマイボードまたはチームボードへ保存します
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 text-xs">
          {errorMsg && (
            <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-medium flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* 登録先ボード & 列 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                登録先ボード
              </label>
              {loadingBoards ? (
                <div className="px-3 py-2 border border-slate-200 rounded-lg text-slate-400 flex items-center gap-1.5">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>読込中...</span>
                </div>
              ) : (
                <select
                  value={selectedBoard?.id || ''}
                  onChange={e => handleBoardChange(e.target.value)}
                  className="w-full px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 font-medium focus:outline-none focus:border-indigo-400"
                >
                  {personalBoards.length > 0 && (
                    <optgroup label="マイボード（個人専用）">
                      {personalBoards.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                  {teamBoards.length > 0 && (
                    <optgroup label="チームボード">
                      {teamBoards.map(b => (
                        <option key={b.id} value={b.id}>
                          {b.title}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </select>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                登録先の列
              </label>
              <select
                value={selectedColumnId}
                onChange={e => setSelectedColumnId(e.target.value)}
                disabled={!selectedBoard}
                className="w-full px-2.5 py-2 border border-slate-200 rounded-lg bg-white text-slate-800 font-medium focus:outline-none focus:border-indigo-400"
              >
                {(selectedBoard?.columns || []).map(col => (
                  <option key={col.id} value={col.id}>
                    {col.title}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* カード種別 */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleTypeChange('task')}
              className={`flex-1 py-2 px-3 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                cardType === 'task'
                  ? 'bg-emerald-50 border-emerald-400 text-emerald-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <CheckSquare className="w-3.5 h-3.5" />
              <span>Todo / タスク</span>
            </button>
            <button
              type="button"
              onClick={() => handleTypeChange('memo')}
              className={`flex-1 py-2 px-3 rounded-lg border font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                cardType === 'memo'
                  ? 'bg-amber-50 border-amber-400 text-amber-800'
                  : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <StickyNote className="w-3.5 h-3.5" />
              <span>メモ・資料ストック</span>
            </button>
          </div>

          {/* タイトル */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              タイトル <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              required
              placeholder="タスクまたはメモのタイトル"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-800 font-medium focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* 内容・補足 */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 mb-1">
              内容・補足
            </label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={4}
              placeholder="詳細なメモやリンクなど"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-slate-700 leading-relaxed focus:outline-none focus:border-indigo-400 resize-y"
            />
          </div>

          {/* 期限 & 優先度 */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700 mb-1">
                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                期限日（任意）
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full px-2.5 py-1.5 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:border-indigo-400"
              />
            </div>

            <div>
              <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700 mb-1">
                <Flag className="w-3.5 h-3.5 text-slate-400" />
                優先度
              </label>
              <div className="grid grid-cols-4 gap-1">
                {PRIORITY_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => setPriority(opt.id)}
                    className={`py-1.5 rounded-lg border text-[11px] font-bold transition-colors cursor-pointer ${
                      priority === opt.id
                        ? 'bg-slate-800 text-white border-slate-800'
                        : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* 担当者（チームボード選択時） */}
          {selectedBoard?.boardType === 'team' && (
            <div>
              <label className="flex items-center gap-1 text-[11px] font-bold text-slate-700 mb-1.5">
                <Users className="w-3.5 h-3.5 text-slate-400" />
                担当者（選択メンバーへ通知されます）
              </label>
              <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg p-2 grid grid-cols-2 gap-1.5 bg-slate-50/50">
                {selectableUsers.map(u => {
                  const selected = assigneeIds.includes(String(u.id));
                  return (
                    <button
                      key={u.id}
                      type="button"
                      onClick={() => toggleAssignee(String(u.id))}
                      className={`flex items-center gap-2 px-2 py-1.5 rounded-lg border text-left transition-colors cursor-pointer ${
                        selected
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-900 font-bold'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
                      }`}
                    >
                      <img
                        src={getAvatarUrl(u.avatarUrl)}
                        alt={u.name}
                        onError={handleAvatarError}
                        className="w-5 h-5 rounded-full object-cover shrink-0 border border-slate-200"
                      />
                      <span className="truncate flex-1 text-[11px]">{u.name}</span>
                      {selected && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {initialAttachments.length > 0 && (
            <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200 text-[11px] text-slate-600">
              📎 元データの添付ファイル {initialAttachments.length} 件も引き継がれます
            </div>
          )}

          <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 font-bold hover:bg-slate-50 transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSaving || loadingBoards || !selectedBoard}
              className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:bg-emerald-300 text-white font-bold flex items-center gap-1.5 transition-colors cursor-pointer shadow-xs"
            >
              {isSaving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>登録中...</span>
                </>
              ) : (
                <>
                  <CheckSquare className="w-3.5 h-3.5" />
                  <span>プロジェクトに登録</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
