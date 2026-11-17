import React, { useState, useMemo } from 'react';
import {
  CheckCircle2,
  Circle,
  Calendar as CalendarIcon,
  Flag,
  ChevronDown,
  ChevronRight,
  ExternalLink,
  CheckSquare,
  Link2,
  Paperclip,
  MessageSquare,
} from 'lucide-react';
import { User } from '../../types';
import { ProjectBoard, ProjectCard } from '../../types/project';

interface MyTasksViewProps {
  currentUser: User;
  boards: ProjectBoard[];
  cards: ProjectCard[];
  todayStr: string;
  onSelectCard: (card: ProjectCard) => void;
  onJumpToBoard: (boardId: string) => void;
  onToggleComplete: (card: ProjectCard, e: React.MouseEvent) => void;
}

function addDaysJst(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00+09:00`);
  d.setDate(d.getDate() + days);
  const jstMs = d.getTime() + 9 * 60 * 60 * 1000;
  return new Date(jstMs).toISOString().slice(0, 10);
}

const PRIORITY_RANK: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
  none: 3,
};

export const MyTasksView: React.FC<MyTasksViewProps> = ({
  currentUser,
  boards,
  cards,
  todayStr,
  onSelectCard,
  onJumpToBoard,
  onToggleComplete,
}) => {
  const [showCompleted, setShowCompleted] = useState(false);

  const boardMap = useMemo(() => {
    const map = new Map<string, ProjectBoard>();
    boards.forEach(b => map.set(b.id, b));
    return map;
  }, [boards]);

  const myUid = String(currentUser.id);
  const soonStr = useMemo(() => addDaysJst(todayStr, 3), [todayStr]);

  const myRelevantCards = useMemo(() => {
    return cards.filter(c => {
      if (c.isArchived || c.cardType === 'memo') return false;
      const b = boardMap.get(c.projectId);
      if (!b) return false;
      const isAssigned = Array.isArray(c.assigneeIds) && c.assigneeIds.map(String).includes(myUid);
      const isPersonalOwn =
        b.boardType === 'personal' &&
        (String(c.createdBy || '') === myUid || (c.assigneeIds || []).length === 0);
      return isAssigned || isPersonalOwn;
    });
  }, [cards, boardMap, myUid]);

  const activeTasks = useMemo(() => {
    return [...myRelevantCards.filter(c => !c.isCompleted)].sort((a, b) => {
      if (a.dueDate && b.dueDate && a.dueDate !== b.dueDate) return a.dueDate.localeCompare(b.dueDate);
      if (a.dueDate && !b.dueDate) return -1;
      if (!a.dueDate && b.dueDate) return 1;
      return (PRIORITY_RANK[a.priority] ?? 3) - (PRIORITY_RANK[b.priority] ?? 3);
    });
  }, [myRelevantCards]);

  const completedTasks = useMemo(() => {
    return [...myRelevantCards.filter(c => c.isCompleted)].sort((a, b) =>
      (b.completedAt || b.updatedAt || '').localeCompare(a.completedAt || a.updatedAt || '')
    );
  }, [myRelevantCards]);

  const overdueList = useMemo(
    () => activeTasks.filter(c => c.dueDate && c.dueDate < todayStr),
    [activeTasks, todayStr]
  );
  const dueSoonList = useMemo(
    () => activeTasks.filter(c => c.dueDate && c.dueDate >= todayStr && c.dueDate <= soonStr),
    [activeTasks, todayStr, soonStr]
  );
  const otherList = useMemo(
    () => activeTasks.filter(c => !c.dueDate || c.dueDate > soonStr),
    [activeTasks, soonStr]
  );

  const renderTaskRow = (card: ProjectCard) => {
    const board = boardMap.get(card.projectId);
    const colTitle = board?.columns.find(col => col.id === card.columnId)?.title || '';
    const checkTotal = (card.checklist || []).length;
    const checkDone = (card.checklist || []).filter(ch => ch.done).length;
    const isOverdue = Boolean(!card.isCompleted && card.dueDate && card.dueDate < todayStr);
    const isToday = Boolean(!card.isCompleted && card.dueDate && card.dueDate === todayStr);

    return (
      <div
        key={card.id}
        onClick={() => onSelectCard(card)}
        className="flex items-start justify-between gap-3 px-4 py-2.5 bg-white hover:bg-indigo-50/35 border-b border-slate-100 last:border-b-0 transition-colors cursor-pointer"
      >
        <div className="flex items-start gap-2.5 min-w-0 flex-1">
          <button
            type="button"
            onClick={e => onToggleComplete(card, e)}
            className="mt-0.5 text-slate-400 hover:text-emerald-600 cursor-pointer shrink-0"
            title={card.isCompleted ? '未完了に戻す' : '完了にする'}
          >
            {card.isCompleted ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
            ) : (
              <Circle className="w-4 h-4" />
            )}
          </button>

          <div className="min-w-0 flex-1">
            <div
              className={`text-sm font-medium break-words ${
                card.isCompleted ? 'line-through text-slate-400' : 'text-slate-900'
              }`}
            >
              {card.title}
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-[11px] text-slate-500 tabular-nums">
              {board && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    onJumpToBoard(board.id);
                  }}
                  className="inline-flex items-center gap-1 text-indigo-700 hover:underline font-medium cursor-pointer"
                >
                  <span>{board.title}</span>
                  <ExternalLink className="w-2.5 h-2.5" />
                </button>
              )}
              {colTitle && (
                <>
                  <span aria-hidden="true">·</span>
                  <span>{colTitle}</span>
                </>
              )}
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
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 shrink-0 text-xs tabular-nums">
          {card.priority !== 'none' && (
            <span
              className={`inline-flex items-center gap-0.5 font-semibold whitespace-nowrap ${
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
          )}
          {card.dueDate && (
            <span
              className={`inline-flex items-center gap-1 whitespace-nowrap ${
                isOverdue
                  ? 'text-rose-600 font-semibold'
                  : isToday
                  ? 'text-amber-600 font-semibold'
                  : 'text-slate-500'
              }`}
            >
              <CalendarIcon className="w-3 h-3" />
              {card.dueDate.slice(5).replace('-', '/')}
            </span>
          )}
        </div>
      </div>
    );
  };

  const renderSection = (title: string, items: ProjectCard[], tone: 'danger' | 'warn' | 'normal') => {
    if (items.length === 0) return null;
    const headerText =
      tone === 'danger'
        ? 'text-rose-700 bg-rose-50/70'
        : tone === 'warn'
        ? 'text-amber-800 bg-amber-50/70'
        : 'text-slate-700 bg-slate-50/70';
    return (
      <div className="border-b border-slate-200 last:border-b-0">
        <div className={`px-4 py-2 text-xs font-bold flex items-center justify-between border-b border-slate-200 ${headerText}`}>
          <span>{title}</span>
          <span className="tabular-nums text-[11px] font-semibold">{items.length}件</span>
        </div>
        <div>{items.map(renderTaskRow)}</div>
      </div>
    );
  };

  return (
    <div>
      {/* 上部サマリー帯 */}
      <div className="px-5 py-3 border-b border-slate-200 bg-slate-50/40 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 tabular-nums">
        <span>
          自分の未完了タスク <strong className="text-slate-900">{activeTasks.length}件</strong>
        </span>
        <span aria-hidden="true">·</span>
        <span className={overdueList.length > 0 ? 'text-rose-600 font-semibold' : ''}>
          期限切れ {overdueList.length}件
        </span>
        <span aria-hidden="true">·</span>
        <span className={dueSoonList.length > 0 ? 'text-amber-700 font-semibold' : ''}>
          3日以内 {dueSoonList.length}件
        </span>
        <span aria-hidden="true">·</span>
        <span>完了済み {completedTasks.length}件</span>
      </div>

      {activeTasks.length === 0 ? (
        <div className="py-12 text-center text-xs text-slate-400">
          担当中の未完了タスクはありません
        </div>
      ) : (
        <div>
          {renderSection('期限切れのタスク', overdueList, 'danger')}
          {renderSection('本日・3日以内が期限のタスク', dueSoonList, 'warn')}
          {renderSection('その他の担当タスク', otherList, 'normal')}
        </div>
      )}

      {completedTasks.length > 0 && (
        <div className="bg-slate-50/60 border-t border-slate-200">
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
                  : `完了済み (${completedTasks.length}件) を表示`}
              </span>
            </span>
            <span className="text-[11px] text-slate-400 tabular-nums">{completedTasks.length}</span>
          </button>

          {showCompleted && (
            <div className="border-t border-slate-200">
              {completedTasks.slice(0, 50).map(renderTaskRow)}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
