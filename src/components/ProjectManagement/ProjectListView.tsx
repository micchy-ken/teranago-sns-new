import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  StickyNote,
  Pin,
  Calendar as CalendarIcon,
  Flag,
  CheckSquare,
  Link2,
  Paperclip,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  ArrowUpDown,
  Plus,
} from 'lucide-react';
import { User } from '../../types';
import { ProjectBoard, ProjectCard } from '../../types/project';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';

interface ProjectListViewProps {
  board: ProjectBoard;
  cards: ProjectCard[];
  allUsers: User[];
  todayStr: string;
  onSelectCard: (card: ProjectCard) => void;
  onToggleComplete: (card: ProjectCard, e: React.MouseEvent) => void;
  onMoveColumn: (card: ProjectCard, columnId: string) => void;
  onQuickCreateInList?: (title: string) => Promise<void>;
}

type SortKey = 'default' | 'title' | 'status' | 'priority' | 'dueDate' | 'updatedAt';

const PRIORITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

export const ProjectListView: React.FC<ProjectListViewProps> = ({
  board,
  cards,
  allUsers,
  todayStr,
  onSelectCard,
  onToggleComplete,
  onMoveColumn,
  onQuickCreateInList,
}) => {
  const [sortKey, setSortKey] = useState<SortKey>('default');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');
  const [showCompleted, setShowCompleted] = useState(false);
  const [quickTitle, setQuickTitle] = useState('');
  const [isCreating, setIsCreating] = useState(false);

  const columnMap = useMemo(() => {
    const map = new Map<string, { title: string; sortOrder: number; kind: string }>();
    board.columns.forEach((c, idx) => {
      map.set(c.id, { title: c.title, sortOrder: c.sortOrder ?? idx, kind: c.kind });
    });
    return map;
  }, [board.columns]);

  const handleToggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  };

  const sortCards = (list: ProjectCard[]) => {
    const copy = [...list];
    const dir = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      if (a.isPinned !== b.isPinned && sortKey === 'default') {
        return a.isPinned ? -1 : 1;
      }
      if (sortKey === 'title') {
        return a.title.localeCompare(b.title, 'ja') * dir;
      }
      if (sortKey === 'status') {
        const ao = columnMap.get(a.columnId)?.sortOrder ?? 999;
        const bo = columnMap.get(b.columnId)?.sortOrder ?? 999;
        return (ao - bo) * dir;
      }
      if (sortKey === 'priority') {
        return ((PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3)) * dir;
      }
      if (sortKey === 'dueDate') {
        if (!a.dueDate && !b.dueDate) return 0;
        if (!a.dueDate) return 1;
        if (!b.dueDate) return -1;
        return a.dueDate.localeCompare(b.dueDate) * dir;
      }
      if (sortKey === 'updatedAt') {
        return (a.updatedAt || '').localeCompare(b.updatedAt || '') * dir;
      }
      const ao = columnMap.get(a.columnId)?.sortOrder ?? 999;
      const bo = columnMap.get(b.columnId)?.sortOrder ?? 999;
      if (ao !== bo) return ao - bo;
      return (a.sortOrder || 0) - (b.sortOrder || 0);
    });
    return copy;
  };

  const activeCards = useMemo(
    () => sortCards(cards.filter(c => c.cardType === 'memo' || !c.isCompleted)),
    [cards, sortKey, sortDir, columnMap]
  );

  const completedCards = useMemo(
    () => sortCards(cards.filter(c => c.cardType !== 'memo' && c.isCompleted)),
    [cards, sortKey, sortDir, columnMap]
  );

  const handleQuickSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = quickTitle.trim();
    if (!trimmed || !onQuickCreateInList) return;
    setIsCreating(true);
    try {
      await onQuickCreateInList(trimmed);
      setQuickTitle('');
    } finally {
      setIsCreating(false);
    }
  };

  const renderRow = (card: ProjectCard) => {
    const checkTotal = (card.checklist || []).length;
    const checkDone = (card.checklist || []).filter(c => c.done).length;
    const isOverdue = Boolean(!card.isCompleted && card.cardType !== 'memo' && card.dueDate && card.dueDate < todayStr);
    const isTodayDue = Boolean(!card.isCompleted && card.cardType !== 'memo' && card.dueDate && card.dueDate === todayStr);

    return (
      <tr
        key={card.id}
        onClick={() => onSelectCard(card)}
        className={`border-b border-slate-100 hover:bg-indigo-50/35 transition-colors cursor-pointer ${
          card.isCompleted ? 'bg-slate-50/50 text-slate-400' : 'bg-white'
        }`}
      >
        <td className="py-2.5 pl-4 pr-2 w-9 align-middle">
          {card.cardType === 'memo' ? (
            <StickyNote className="w-4 h-4 text-amber-500" />
          ) : (
            <button
              type="button"
              onClick={e => onToggleComplete(card, e)}
              className="text-slate-400 hover:text-emerald-600 cursor-pointer flex items-center"
              title={card.isCompleted ? '未完了に戻す' : '完了にする'}
            >
              {card.isCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <Circle className="w-4 h-4" />
              )}
            </button>
          )}
        </td>

        <td className="py-2.5 px-2 min-w-[240px] align-middle">
          <div className="flex items-center gap-2 min-w-0">
            {card.isPinned && <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0" />}
            <span
              className={`text-sm font-medium truncate ${
                card.isCompleted ? 'line-through text-slate-400' : 'text-slate-900'
              }`}
            >
              {card.title}
            </span>
          </div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[11px] text-slate-400 tabular-nums">
            <span>{card.cardType === 'memo' ? 'メモ・資料' : 'Todo'}</span>
            {checkTotal > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <CheckSquare className="w-3 h-3" />
                {checkDone}/{checkTotal}
              </span>
            )}
            {(card.links?.length || 0) > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Link2 className="w-3 h-3" />
                {card.links.length}
              </span>
            )}
            {(card.attachments?.length || 0) > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <Paperclip className="w-3 h-3" />
                {card.attachments.length}
              </span>
            )}
            {(card.comments?.length || 0) > 0 && (
              <span className="inline-flex items-center gap-0.5">
                <MessageSquare className="w-3 h-3" />
                {card.comments.length}
              </span>
            )}
            {(card.tags || []).slice(0, 2).map(tag => (
              <span key={tag}>#{tag}</span>
            ))}
          </div>
        </td>

        <td className="py-2.5 px-2 w-40 align-middle" onClick={e => e.stopPropagation()}>
          <select
            value={card.columnId}
            onChange={e => onMoveColumn(card, e.target.value)}
            className="w-full px-2 py-1 text-xs border border-slate-200 rounded-md bg-white text-slate-700 cursor-pointer"
          >
            {board.columns.map(col => (
              <option key={col.id} value={col.id}>
                {col.title}
              </option>
            ))}
          </select>
        </td>

        <td className="py-2.5 px-2 w-24 align-middle text-xs">
          {card.cardType === 'memo' ? (
            <span className="text-slate-300">-</span>
          ) : card.priority !== 'none' ? (
            <span
              className={`inline-flex items-center gap-1 font-semibold whitespace-nowrap ${
                card.priority === 'high'
                  ? 'text-rose-600'
                  : card.priority === 'medium'
                  ? 'text-amber-600'
                  : 'text-sky-600'
              }`}
            >
              <Flag className="w-3 h-3" />
              {card.priority === 'high' ? '高' : card.priority === 'medium' ? '中' : '低'}
            </span>
          ) : (
            <span className="text-slate-300">-</span>
          )}
        </td>

        <td className="py-2.5 px-2 w-28 align-middle text-xs tabular-nums whitespace-nowrap">
          {card.dueDate && card.cardType !== 'memo' ? (
            <span
              className={`inline-flex items-center gap-1 ${
                isOverdue
                  ? 'text-rose-600 font-semibold'
                  : isTodayDue
                  ? 'text-amber-600 font-semibold'
                  : 'text-slate-600'
              }`}
            >
              <CalendarIcon className="w-3 h-3" />
              {card.dueDate.slice(5).replace('-', '/')}
            </span>
          ) : (
            <span className="text-slate-300">-</span>
          )}
        </td>

        <td className="py-2.5 pl-2 pr-4 w-36 align-middle">
          {(card.assigneeIds || []).length > 0 ? (
            <div className="flex items-center -space-x-1.5">
              {card.assigneeIds.slice(0, 4).map(uid => {
                const u = allUsers.find(x => String(x.id) === String(uid));
                if (!u) return null;
                return (
                  <img
                    key={uid}
                    src={getAvatarUrl(u.avatarUrl)}
                    alt={u.name}
                    title={u.name}
                    onError={handleAvatarError}
                    className="w-5 h-5 rounded-full ring-2 ring-white object-cover bg-slate-100"
                  />
                );
              })}
              {card.assigneeIds.length > 4 && (
                <span className="pl-2 text-[11px] text-slate-500 tabular-nums">
                  +{card.assigneeIds.length - 4}
                </span>
              )}
            </div>
          ) : (
            <span className="text-xs text-slate-300">-</span>
          )}
        </td>
      </tr>
    );
  };

  const SortHeader = ({ label, id, className = '' }: { label: string; id: SortKey; className?: string }) => (
    <th className={`py-2 px-2 text-left text-[11px] font-semibold text-slate-500 whitespace-nowrap ${className}`}>
      <button
        type="button"
        onClick={() => handleToggleSort(id)}
        className="inline-flex items-center gap-1 hover:text-slate-900 cursor-pointer"
      >
        <span>{label}</span>
        <ArrowUpDown className={`w-3 h-3 ${sortKey === id ? 'text-indigo-600' : 'text-slate-300'}`} />
      </button>
    </th>
  );

  return (
    <div className="divide-y divide-slate-200">
      {onQuickCreateInList && (
        <form onSubmit={handleQuickSubmit} className="px-4 py-2.5 bg-slate-50/40 flex items-center gap-2">
          <input
            type="text"
            value={quickTitle}
            onChange={e => setQuickTitle(e.target.value)}
            disabled={isCreating}
            placeholder="＋ 新規タスク / メモ・URLを入力してEnter..."
            className="flex-1 px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
          />
          <button
            type="submit"
            disabled={isCreating || !quickTitle.trim()}
            className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-40 cursor-pointer whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>追加</span>
          </button>
        </form>
      )}

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-slate-50/70 border-b border-slate-200">
            <tr>
              <th className="py-2 pl-4 pr-2 w-9" />
              <SortHeader label="タイトル" id="title" />
              <SortHeader label="ステータス" id="status" />
              <SortHeader label="優先度" id="priority" />
              <SortHeader label="期限" id="dueDate" />
              <th className="py-2 pl-2 pr-4 text-left text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                担当者
              </th>
            </tr>
          </thead>
          <tbody>
            {activeCards.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-xs text-slate-400">
                  表示する未完了カード・メモはありません
                </td>
              </tr>
            ) : (
              activeCards.map(renderRow)
            )}
          </tbody>
        </table>
      </div>

      {completedCards.length > 0 && (
        <div className="bg-slate-50/60">
          <button
            type="button"
            onClick={() => setShowCompleted(prev => !prev)}
            className="w-full flex items-center justify-between px-4 py-2.5 text-xs font-medium text-slate-600 hover:bg-slate-100/70 cursor-pointer transition-colors"
          >
            <span className="inline-flex items-center gap-1.5">
              {showCompleted ? (
                <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
              )}
              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
              <span>
                {showCompleted
                  ? '完了済みを折り畳む'
                  : `完了済み (${completedCards.length}件) を表示`}
              </span>
            </span>
            <span className="text-[11px] text-slate-400 tabular-nums">{completedCards.length}</span>
          </button>

          {showCompleted && (
            <div className="overflow-x-auto border-t border-slate-200">
              <table className="w-full border-collapse">
                <tbody>{completedCards.map(renderRow)}</tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
