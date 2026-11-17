import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  FolderKanban,
  Plus,
  Search,
  Lock,
  Users,
  Building2,
  Globe,
  Settings,
  Share2,
  Check,
  Pin,
  ChevronRight,
  ChevronDown,
  CheckCircle2,
  Circle,
  StickyNote,
  Calendar as CalendarIcon,
  Flag,
  CheckSquare,
  RefreshCw,
  ArrowRight,
  Paperclip,
  MessageSquare,
  Link2,
} from 'lucide-react';
import { User, OfficeMaster, DivisionMaster } from '../../types';
import {
  ProjectBoard,
  ProjectBoardColumn,
  ProjectBoardCountStats,
  ProjectCard,
  ProjectCardType,
} from '../../types/project';
import { API_BASE_URL } from '../../config/api';
import { buildAppUrl, copyTextToClipboard } from '../../utils/urlParams';
import { upsertBookmarkForUser } from '../../utils/bookmarks';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import { getUserOfficeName, getUserDivisionName } from '../../utils/masterResolver';
import { BoardFormModal } from './BoardFormModal';
import { CardDetailModal } from './CardDetailModal';

interface ProjectManagementProps {
  currentUser: User;
  allUsers: User[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  initialProjectId?: string;
  initialTaskId?: string;
  initialProjectView?: 'kanban' | 'list' | 'mytasks';
  onClearInitialParams?: () => void;
  onUpdateUser?: (user: User) => void;
}

function getJstTodayStr(): string {
  const now = new Date();
  const jstMs = now.getTime() + 9 * 60 * 60 * 1000;
  return new Date(jstMs).toISOString().slice(0, 10);
}

const BOARD_ACCENT_DOT: Record<string, string> = {
  indigo: 'bg-indigo-600',
  sky: 'bg-sky-600',
  emerald: 'bg-emerald-600',
  amber: 'bg-amber-500',
  rose: 'bg-rose-600',
  violet: 'bg-violet-600',
};

export const ProjectManagement: React.FC<ProjectManagementProps> = ({
  currentUser,
  allUsers,
  offices = [],
  divisions = [],
  initialProjectId,
  initialTaskId,
  onClearInitialParams,
  onUpdateUser,
}) => {
  const [boards, setBoards] = useState<ProjectBoard[]>([]);
  const [cards, setCards] = useState<ProjectCard[]>([]);
  const [countsByBoard, setCountsByBoard] = useState<Record<string, ProjectBoardCountStats>>({});
  const [selectedBoardId, setSelectedBoardId] = useState<string>(initialProjectId || '');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // フィルター＆クイック作成
  const [boardSearch, setBoardSearch] = useState('');
  const [cardSearch, setCardSearch] = useState('');
  const [cardTypeFilter, setCardTypeFilter] = useState<'all' | 'task' | 'memo' | 'mine'>('all');
  const [quickDraftByCol, setQuickDraftByCol] = useState<Record<string, string>>({});
  const [creatingColId, setCreatingColId] = useState<string | null>(null);

  // 完了カードの折り畳み管理（デフォルトは折り畳み = false）
  const [expandedDoneCols, setExpandedDoneCols] = useState<Record<string, boolean>>({});
  const [draggingCardId, setDraggingCardId] = useState<string | null>(null);
  const [dragOverColId, setDragOverColId] = useState<string | null>(null);

  // モーダル
  const [isBoardModalOpen, setIsBoardModalOpen] = useState(false);
  const [editingBoard, setEditingBoard] = useState<ProjectBoard | null>(null);
  const [isCardModalOpen, setIsCardModalOpen] = useState(false);
  const [editingCard, setEditingCard] = useState<ProjectCard | null>(null);
  const [modalInitialColId, setModalInitialColId] = useState<string | undefined>(undefined);
  const [modalInitialCardType, setModalInitialCardType] = useState<ProjectCardType | undefined>(undefined);

  // 共有・お気に入りフィードバック
  const [copiedBoardUrl, setCopiedBoardUrl] = useState(false);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    window.setTimeout(() => {
      setToastMsg(prev => (prev === msg ? null : prev));
    }, 3500);
  }, []);

  const userOfficeName = useMemo(() => getUserOfficeName(currentUser, offices) || currentUser.office || '', [currentUser, offices]);
  const userDivisionName = useMemo(() => getUserDivisionName(currentUser, divisions) || currentUser.division || '', [currentUser, divisions]);

  const fetchBoardsAndCards = useCallback(async () => {
    if (!currentUser?.id) return;
    setIsLoading(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      qs.set('userId', String(currentUser.id));
      if (currentUser.name) qs.set('userName', currentUser.name);
      if (currentUser.officeId) qs.set('officeId', String(currentUser.officeId));
      if (userOfficeName) qs.set('office', userOfficeName);
      if (currentUser.divisionId) qs.set('divisionId', String(currentUser.divisionId));
      if (userDivisionName) qs.set('division', userDivisionName);
      if (currentUser.isAdmin || currentUser.role === 'admin') qs.set('isAdmin', 'true');
      qs.set('includeCards', 'true');

      const res = await fetch(`${API_BASE_URL}/projects/boards?${qs.toString()}`);
      if (!res.ok) {
        throw new Error(`プロジェクトデータの取得に失敗しました (${res.status})`);
      }
      const data = await res.json();
      const loadedBoards: ProjectBoard[] = Array.isArray(data.boards) ? data.boards : [];
      const loadedCards: ProjectCard[] = Array.isArray(data.cards) ? data.cards : [];

      setBoards(loadedBoards);
      setCards(loadedCards);
      setCountsByBoard(data.cardsCountByBoard || {});

      // 初期表示ボード決定
      setSelectedBoardId(prev => {
        if (initialProjectId && loadedBoards.some(b => b.id === initialProjectId)) {
          return initialProjectId;
        }
        if (initialTaskId) {
          const cardMatch = loadedCards.find(c => c.id === initialTaskId);
          if (cardMatch && loadedBoards.some(b => b.id === cardMatch.projectId)) {
            return cardMatch.projectId;
          }
        }
        if (prev && loadedBoards.some(b => b.id === prev)) return prev;
        try {
          const savedId = localStorage.getItem(`teranago_last_project_board_${currentUser.id}`);
          if (savedId && loadedBoards.some(b => b.id === savedId)) return savedId;
        } catch (_) {}
        return loadedBoards[0]?.id || '';
      });
    } catch (err: any) {
      console.error('Fetch projects error:', err);
      setError(err?.message || 'プロジェクトの読み込みに失敗しました');
    } finally {
      setIsLoading(false);
    }
  }, [currentUser?.id, currentUser?.name, currentUser?.officeId, currentUser?.divisionId, currentUser?.isAdmin, currentUser?.role, userOfficeName, userDivisionName, initialProjectId, initialTaskId]);

  useEffect(() => {
    fetchBoardsAndCards();
  }, [fetchBoardsAndCards]);

  // URL / ブックマークからタスク単体が指定された場合に自動オープン
  useEffect(() => {
    if (!initialTaskId || cards.length === 0) return;
    const found = cards.find(c => c.id === initialTaskId);
    if (found) {
      setSelectedBoardId(found.projectId);
      setEditingCard(found);
      setIsCardModalOpen(true);
      onClearInitialParams?.();
    }
  }, [initialTaskId, cards, onClearInitialParams]);

  // 選択中ボードを記憶
  useEffect(() => {
    if (selectedBoardId && currentUser?.id) {
      try {
        localStorage.setItem(`teranago_last_project_board_${currentUser.id}`, selectedBoardId);
      } catch (_) {}
    }
  }, [selectedBoardId, currentUser?.id]);

  const activeBoard = useMemo(
    () => boards.find(b => b.id === selectedBoardId) || boards[0] || null,
    [boards, selectedBoardId]
  );

  // サイドバー用ボード分類
  const filteredBoards = useMemo(() => {
    const q = boardSearch.trim().toLowerCase();
    if (!q) return boards;
    return boards.filter(
      b =>
        b.title.toLowerCase().includes(q) ||
        (b.description && b.description.toLowerCase().includes(q))
    );
  }, [boards, boardSearch]);

  const personalBoards = useMemo(
    () => filteredBoards.filter(b => b.boardType === 'personal'),
    [filteredBoards]
  );
  const teamBoards = useMemo(
    () => filteredBoards.filter(b => b.boardType !== 'personal'),
    [filteredBoards]
  );

  // アクティブボード内のカード集計＆フィルタ
  const activeBoardCards = useMemo(() => {
    if (!activeBoard) return [];
    const q = cardSearch.trim().toLowerCase();
    return cards
      .filter(c => c.projectId === activeBoard.id && !c.isArchived)
      .filter(c => {
        if (cardTypeFilter === 'task' && c.cardType !== 'task') return false;
        if (cardTypeFilter === 'memo' && c.cardType !== 'memo') return false;
        if (cardTypeFilter === 'mine' && !(c.assigneeIds || []).includes(String(currentUser.id))) {
          return false;
        }
        if (q) {
          const hay = [
            c.title,
            c.description || '',
            ...(c.tags || []),
            ...(c.checklist || []).map(ch => ch.text),
          ]
            .join(' ')
            .toLowerCase();
          return hay.includes(q);
        }
        return true;
      })
      .sort((a, b) => {
        if (a.isPinned !== b.isPinned) return a.isPinned ? -1 : 1;
        return (a.sortOrder || 0) - (b.sortOrder || 0);
      });
  }, [cards, activeBoard, cardSearch, cardTypeFilter, currentUser.id]);

  // ボードごとの統計リアルタイム再計算
  const liveStatsForBoard = useCallback(
    (boardId: string): ProjectBoardCountStats => {
      const list = cards.filter(c => c.projectId === boardId && !c.isArchived);
      if (list.length === 0 && countsByBoard[boardId]) return countsByBoard[boardId];
      return {
        total: list.length,
        activeTasks: list.filter(c => c.cardType !== 'memo' && !c.isCompleted).length,
        completedTasks: list.filter(c => c.cardType !== 'memo' && c.isCompleted).length,
        memos: list.filter(c => c.cardType === 'memo').length,
      };
    },
    [cards, countsByBoard]
  );

  // ボード作成・編集
  const handleSaveBoard = async (payload: Partial<ProjectBoard>) => {
    const isEdit = Boolean(payload.id);
    const url = isEdit
      ? `${API_BASE_URL}/projects/boards/${encodeURIComponent(String(payload.id))}`
      : `${API_BASE_URL}/projects/boards`;
    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        ownerId: editingBoard?.ownerId || currentUser.id,
        ownerName: editingBoard?.ownerName || currentUser.name,
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'ボードの保存に失敗しました');
    }
    const data = await res.json();
    const saved: ProjectBoard = data.board;
    setBoards(prev => {
      const exists = prev.some(b => b.id === saved.id);
      return exists ? prev.map(b => (b.id === saved.id ? saved : b)) : [...prev, saved];
    });
    setSelectedBoardId(saved.id);
    showToast(isEdit ? 'ボード設定を更新しました' : `ボード「${saved.title}」を作成しました`);
  };

  const handleDeleteBoard = async (boardId: string) => {
    const res = await fetch(`${API_BASE_URL}/projects/boards/${encodeURIComponent(boardId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'ボードの削除に失敗しました');
    }
    setBoards(prev => {
      const next = prev.filter(b => b.id !== boardId);
      if (selectedBoardId === boardId) {
        setSelectedBoardId(next[0]?.id || '');
      }
      return next;
    });
    setCards(prev => prev.filter(c => c.projectId !== boardId));
    showToast('ボードを削除しました');
  };

  // クイック追加 (列上部で1行入力してEnter)
  const handleQuickCreateCard = async (col: ProjectBoardColumn) => {
    if (!activeBoard) return;
    const raw = (quickDraftByCol[col.id] || '').trim();
    if (!raw) return;

    setCreatingColId(col.id);
    try {
      const isUrlOnly = /^https?:\/\/\S+$/i.test(raw);
      const cardType: ProjectCardType = col.kind === 'memo' ? 'memo' : 'task';
      const res = await fetch(`${API_BASE_URL}/projects/cards`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectId: activeBoard.id,
          columnId: col.id,
          cardType,
          title: isUrlOnly ? raw.replace(/^https?:\/\//i, '').slice(0, 60) : raw,
          description: isUrlOnly ? raw : '',
          assigneeIds: activeBoard.boardType === 'personal' ? [String(currentUser.id)] : [],
          createdBy: currentUser.id,
          createdByName: currentUser.name,
        }),
      });
      if (!res.ok) {
        throw new Error('作成に失敗しました');
      }
      const data = await res.json();
      setCards(prev => [...prev, data.card]);
      setQuickDraftByCol(prev => ({ ...prev, [col.id]: '' }));
    } catch (err: any) {
      showToast(err?.message || 'カードの追加に失敗しました');
    } finally {
      setCreatingColId(null);
    }
  };

  // カード詳細保存
  const handleSaveCard = async (payload: Partial<ProjectCard>) => {
    const isEdit = Boolean(payload.id);
    const url = isEdit
      ? `${API_BASE_URL}/projects/cards/${encodeURIComponent(String(payload.id))}`
      : `${API_BASE_URL}/projects/cards`;
    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        createdBy: isEdit ? undefined : currentUser.id,
        createdByName: isEdit ? undefined : currentUser.name,
        updatedBy: currentUser.id,
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'カードの保存に失敗しました');
    }
    const data = await res.json();
    const saved: ProjectCard = data.card;
    setCards(prev => {
      const exists = prev.some(c => c.id === saved.id);
      return exists ? prev.map(c => (c.id === saved.id ? saved : c)) : [...prev, saved];
    });
    showToast(isEdit ? 'カードを更新しました' : 'カードを追加しました');
  };

  const handleDeleteCard = async (cardId: string) => {
    const res = await fetch(`${API_BASE_URL}/projects/cards/${encodeURIComponent(cardId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error('カードの削除に失敗しました');
    }
    setCards(prev => prev.filter(c => c.id !== cardId));
    showToast('カードを削除しました');
  };

  // ワンクリック完了トグル
  const handleToggleComplete = async (card: ProjectCard, e: React.MouseEvent) => {
    e.stopPropagation();
    if (card.cardType === 'memo') return;
    const nextCompleted = !card.isCompleted;
    try {
      const res = await fetch(`${API_BASE_URL}/projects/cards/${encodeURIComponent(card.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          isCompleted: nextCompleted,
          completedBy: currentUser.id,
          updatedBy: currentUser.id,
          syncColumn: true,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCards(prev => prev.map(c => (c.id === card.id ? data.card : c)));
    } catch {
      showToast('完了状態の更新に失敗しました');
    }
  };

  // ドラッグ＆ドロップまたはボタンでの列移動
  const handleMoveCardToColumn = async (card: ProjectCard, targetColumnId: string) => {
    if (!activeBoard || card.columnId === targetColumnId) return;
    const targetCol = activeBoard.columns.find(c => c.id === targetColumnId);
    const nextCompleted =
      card.cardType === 'memo'
        ? false
        : targetCol?.kind === 'done'
        ? true
        : false;

    // 楽観的更新
    setCards(prev =>
      prev.map(c =>
        c.id === card.id ? { ...c, columnId: targetColumnId, isCompleted: nextCompleted } : c
      )
    );

    try {
      const res = await fetch(`${API_BASE_URL}/projects/cards/${encodeURIComponent(card.id)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          columnId: targetColumnId,
          updatedBy: currentUser.id,
        }),
      });
      if (!res.ok) throw new Error();
      const data = await res.json();
      setCards(prev => prev.map(c => (c.id === card.id ? data.card : c)));
    } catch {
      fetchBoardsAndCards();
    }
  };

  // ボード共有＆お気に入り登録
  const handleShareBoard = async () => {
    if (!activeBoard) return;
    const shareParams = {
      tab: 'projects' as const,
      projectId: activeBoard.id,
      projectView: 'kanban' as const,
    };
    const url = buildAppUrl(shareParams);
    const ok = await copyTextToClipboard(url);
    if (ok) {
      setCopiedBoardUrl(true);
      window.setTimeout(() => setCopiedBoardUrl(false), 2500);
    }
    if (currentUser && onUpdateUser) {
      const { updatedUser } = upsertBookmarkForUser(currentUser, {
        category: 'projects',
        title: activeBoard.title,
        subtitle: activeBoard.boardType === 'personal' ? 'マイボード（個人）' : 'チームボード',
        params: shareParams,
      });
      onUpdateUser(updatedUser);
      showToast('ボードのURLをコピーし、お気に入りに登録しました');
    } else {
      showToast('ボードのURLをコピーしました');
    }
  };

  // タスク単体共有＆お気に入り登録
  const handleShareSingleCard = async (card: ProjectCard) => {
    if (!activeBoard) return;
    const shareParams = {
      tab: 'projects' as const,
      projectId: activeBoard.id,
      taskId: card.id,
    };
    const url = buildAppUrl(shareParams);
    await copyTextToClipboard(url);
    if (currentUser && onUpdateUser) {
      const { updatedUser } = upsertBookmarkForUser(currentUser, {
        category: 'projects',
        title: card.title,
        subtitle: `${activeBoard.title} · ${card.cardType === 'memo' ? 'メモ・資料' : 'Todo'}`,
        params: shareParams,
      });
      onUpdateUser(updatedUser);
      showToast('カードのURLをコピーし、お気に入りに登録しました');
    } else {
      showToast('カードのURLをコピーしました');
    }
  };

  const todayStr = getJstTodayStr();

  const getVisibilityLabel = (board: ProjectBoard) => {
    if (board.boardType === 'personal' || board.visibility === 'private') return '個人専用';
    if (board.visibility === 'org') return '全社公開';
    if (board.visibility === 'office') return board.office || '拠点公開';
    if (board.visibility === 'division') {
      return [board.office, board.division].filter(Boolean).join(' / ') || '部署公開';
    }
    return `メンバー ${board.memberIds?.length || 1}名`;
  };

  const renderCardItem = (card: ProjectCard, colIndex: number) => {
    const checkTotal = (card.checklist || []).length;
    const checkDone = (card.checklist || []).filter(c => c.done).length;
    const isOverdue = Boolean(!card.isCompleted && card.cardType !== 'memo' && card.dueDate && card.dueDate < todayStr);
    const isTodayDue = Boolean(!card.isCompleted && card.cardType !== 'memo' && card.dueDate && card.dueDate === todayStr);
    const nextCol = activeBoard?.columns[colIndex + 1];

    return (
      <div
        key={card.id}
        draggable
        onDragStart={() => setDraggingCardId(card.id)}
        onDragEnd={() => {
          setDraggingCardId(null);
          setDragOverColId(null);
        }}
        onClick={() => {
          setEditingCard(card);
          setIsCardModalOpen(true);
        }}
        className={`group rounded-lg border bg-white p-3 transition-colors cursor-pointer ${
          draggingCardId === card.id
            ? 'opacity-50 border-indigo-400'
            : card.isCompleted
            ? 'border-slate-200/80 bg-slate-50/70 opacity-85 hover:opacity-100'
            : 'border-slate-200 hover:border-indigo-300 shadow-2xs'
        }`}
      >
        <div className="flex items-start gap-2">
          {card.cardType === 'memo' ? (
            <StickyNote className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
          ) : (
            <button
              type="button"
              onClick={e => handleToggleComplete(card, e)}
              title={card.isCompleted ? '未完了に戻す' : '完了にする'}
              className="mt-0.5 text-slate-400 hover:text-emerald-600 cursor-pointer shrink-0 transition-colors"
            >
              {card.isCompleted ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              ) : (
                <Circle className="w-4 h-4" />
              )}
            </button>
          )}

          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-1.5">
              <div
                className={`text-sm font-medium leading-snug break-words ${
                  card.isCompleted ? 'line-through text-slate-400' : 'text-slate-900'
                }`}
              >
                {card.title}
              </div>
              {card.isPinned && <Pin className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" />}
            </div>

            {card.description && (
              <p className="mt-1 text-xs text-slate-500 line-clamp-2 break-words">
                {card.description}
              </p>
            )}

            {/* 静的なメタデータ（アンボックス表記） */}
            <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-500 tabular-nums">
              {card.priority !== 'none' && card.cardType !== 'memo' && (
                <span
                  className={`inline-flex items-center gap-0.5 font-semibold ${
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

              {card.dueDate && card.cardType !== 'memo' && (
                <span
                  className={`inline-flex items-center gap-1 ${
                    isOverdue
                      ? 'text-rose-600 font-semibold'
                      : isTodayDue
                      ? 'text-amber-600 font-semibold'
                      : 'text-slate-500'
                  }`}
                >
                  <CalendarIcon className="w-3 h-3" />
                  <span>{card.dueDate.slice(5).replace('-', '/')}</span>
                </span>
              )}

              {checkTotal > 0 && (
                <span className="inline-flex items-center gap-1">
                  <CheckSquare className="w-3 h-3" />
                  <span>
                    {checkDone}/{checkTotal}
                  </span>
                </span>
              )}

              {(card.links?.length || 0) > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Link2 className="w-3 h-3" />
                  <span>{card.links.length}</span>
                </span>
              )}

              {(card.attachments?.length || 0) > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <Paperclip className="w-3 h-3" />
                  <span>{card.attachments.length}</span>
                </span>
              )}

              {(card.comments?.length || 0) > 0 && (
                <span className="inline-flex items-center gap-0.5">
                  <MessageSquare className="w-3 h-3" />
                  <span>{card.comments.length}</span>
                </span>
              )}

              {(card.tags || []).slice(0, 2).map(tag => (
                <span key={tag} className="text-slate-400">
                  #{tag}
                </span>
              ))}
            </div>

            {/* 担当者アバター ＋ 次の列へ移動アクション */}
            <div className="mt-2 flex items-center justify-between gap-2">
              <div className="flex -space-x-1.5 overflow-hidden">
                {(card.assigneeIds || []).slice(0, 4).map(uid => {
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
              </div>

              {nextCol && !card.isCompleted && (
                <button
                  type="button"
                  onClick={e => {
                    e.stopPropagation();
                    handleMoveCardToColumn(card, nextCol.id);
                  }}
                  title={`「${nextCol.title}」へ移動`}
                  className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-opacity cursor-pointer whitespace-nowrap"
                >
                  <span>{nextCol.title}</span>
                  <ArrowRight className="w-2.5 h-2.5" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-4">
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-medium shadow-lg">
          {toastMsg}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-4 items-start">
        {/* 左ペイン：ボード一覧（マイボード ＋ チームボード） */}
        <aside className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 font-bold text-slate-900 text-sm">
              <FolderKanban className="w-4 h-4 text-indigo-600" />
              <span>ボード一覧</span>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingBoard(null);
                setIsBoardModalOpen(true);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>新規</span>
            </button>
          </div>

          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={boardSearch}
              onChange={e => setBoardSearch(e.target.value)}
              placeholder="ボード名で検索..."
              className="w-full pl-8 pr-2.5 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>

          {isLoading && boards.length === 0 ? (
            <div className="py-6 text-center text-xs text-slate-400">読み込み中...</div>
          ) : (
            <div className="space-y-4">
              {/* マイボード */}
              <div>
                <div className="px-1.5 mb-1 text-[11px] font-semibold text-slate-400">
                  個人専用ボード
                </div>
                <div className="space-y-0.5">
                  {personalBoards.map(b => {
                    const active = activeBoard?.id === b.id;
                    const stats = liveStatsForBoard(b.id);
                    return (
                      <button
                        key={b.id}
                        type="button"
                        onClick={() => setSelectedBoardId(b.id)}
                        className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                          active
                            ? 'bg-indigo-50 text-indigo-800 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <Lock className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                          <span className="truncate">{b.title}</span>
                        </div>
                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                          {stats.activeTasks + stats.memos}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* チームボード */}
              <div>
                <div className="px-1.5 mb-1 text-[11px] font-semibold text-slate-400">
                  チーム共有ボード
                </div>
                {teamBoards.length === 0 ? (
                  <div className="px-2 py-3 text-[11px] text-slate-400 border border-dashed border-slate-200 rounded-lg text-center">
                    共有ボードはまだありません
                  </div>
                ) : (
                  <div className="space-y-0.5">
                    {teamBoards.map(b => {
                      const active = activeBoard?.id === b.id;
                      const stats = liveStatsForBoard(b.id);
                      const dotClass = BOARD_ACCENT_DOT[b.color || 'indigo'] || 'bg-indigo-600';
                      return (
                        <button
                          key={b.id}
                          type="button"
                          onClick={() => setSelectedBoardId(b.id)}
                          className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                            active
                              ? 'bg-indigo-50 text-indigo-800 font-semibold'
                              : 'text-slate-700 hover:bg-slate-50'
                          }`}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                            <span className="truncate">{b.title}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {b.isPinned && <Pin className="w-3 h-3 text-amber-500" />}
                            <span className="text-[11px] text-slate-400 tabular-nums">
                              {stats.activeTasks + stats.memos}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}
        </aside>

        {/* メインワークスペース：選択中ボードのカンバン */}
        <section className="bg-white rounded-xl border border-slate-200 min-w-0 overflow-hidden">
          {error && (
            <div className="m-4 px-4 py-3 text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between">
              <span>{error}</span>
              <button
                type="button"
                onClick={fetchBoardsAndCards}
                className="underline font-semibold cursor-pointer"
              >
                再読み込み
              </button>
            </div>
          )}

          {!activeBoard ? (
            <div className="p-12 text-center text-sm text-slate-500">
              ボードを選択するか、「＋ 新規」からプロジェクト・メモボードを作成してください。
            </div>
          ) : (
            <>
              {/* ボードヘッダー */}
              <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    {activeBoard.boardType === 'personal' ? (
                      <Lock className="w-4 h-4 text-amber-600 shrink-0" />
                    ) : activeBoard.visibility === 'org' ? (
                      <Globe className="w-4 h-4 text-indigo-600 shrink-0" />
                    ) : activeBoard.visibility === 'office' || activeBoard.visibility === 'division' ? (
                      <Building2 className="w-4 h-4 text-indigo-600 shrink-0" />
                    ) : (
                      <Users className="w-4 h-4 text-indigo-600 shrink-0" />
                    )}
                    <h2 className="text-lg font-bold text-slate-900 truncate">{activeBoard.title}</h2>
                  </div>

                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 tabular-nums">
                    <span>{getVisibilityLabel(activeBoard)}</span>
                    <span aria-hidden="true">·</span>
                    <span>未完了 {liveStatsForBoard(activeBoard.id).activeTasks}件</span>
                    <span aria-hidden="true">·</span>
                    <span>メモ・資料 {liveStatsForBoard(activeBoard.id).memos}件</span>
                    <span aria-hidden="true">·</span>
                    <span>完了 {liveStatsForBoard(activeBoard.id).completedTasks}件</span>
                  </div>

                  {activeBoard.description && (
                    <p className="mt-1.5 text-xs text-slate-600">{activeBoard.description}</p>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={fetchBoardsAndCards}
                    title="最新の状態に更新"
                    className="p-2 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-800 hover:bg-slate-50 cursor-pointer"
                  >
                    <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
                  </button>

                  <button
                    type="button"
                    onClick={handleShareBoard}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium cursor-pointer whitespace-nowrap"
                  >
                    {copiedBoardUrl ? (
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                    ) : (
                      <Share2 className="w-3.5 h-3.5" />
                    )}
                    <span>{copiedBoardUrl ? 'URLコピー済' : '共有・お気に入り'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingBoard(activeBoard);
                      setIsBoardModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-50 text-xs font-medium cursor-pointer whitespace-nowrap"
                  >
                    <Settings className="w-3.5 h-3.5" />
                    <span>ボード設定</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingCard(null);
                      setModalInitialColId(undefined);
                      setModalInitialCardType('task');
                      setIsCardModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>カード追加</span>
                  </button>
                </div>
              </div>

              {/* ツールバー（キーワード検索＆種別切替） */}
              <div className="px-5 py-2.5 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1 p-1 bg-slate-200/70 rounded-lg">
                  {[
                    { id: 'all', label: 'すべて' },
                    { id: 'task', label: 'Todo' },
                    { id: 'memo', label: 'メモ・資料' },
                    { id: 'mine', label: '自分の担当' },
                  ].map(tab => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setCardTypeFilter(tab.id as any)}
                      className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                        cardTypeFilter === tab.id
                          ? 'bg-white text-slate-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>

                <div className="relative w-full sm:w-64">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={cardSearch}
                    onChange={e => setCardSearch(e.target.value)}
                    placeholder="カード・メモ・タグを検索..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              {/* カンバン列エリア */}
              <div className="p-4 overflow-x-auto">
                <div className="flex items-start gap-3.5 min-w-max">
                  {activeBoard.columns.map((col, colIndex) => {
                    const colCards = activeBoardCards.filter(c => c.columnId === col.id);
                    const isDoneColumn = col.kind === 'done';
                    const activeCardsInCol = isDoneColumn
                      ? []
                      : colCards.filter(c => !c.isCompleted || c.cardType === 'memo');
                    const completedCardsInCol = isDoneColumn
                      ? colCards
                      : colCards.filter(c => c.isCompleted && c.cardType !== 'memo');
                    const isDoneExpanded = Boolean(expandedDoneCols[col.id]);
                    const isDropTarget = dragOverColId === col.id;

                    return (
                      <div
                        key={col.id}
                        onDragOver={e => {
                          e.preventDefault();
                          if (dragOverColId !== col.id) setDragOverColId(col.id);
                        }}
                        onDragLeave={() => {
                          if (dragOverColId === col.id) setDragOverColId(null);
                        }}
                        onDrop={e => {
                          e.preventDefault();
                          setDragOverColId(null);
                          if (draggingCardId) {
                            const dragged = cards.find(c => c.id === draggingCardId);
                            if (dragged) handleMoveCardToColumn(dragged, col.id);
                            setDraggingCardId(null);
                          }
                        }}
                        className={`w-[300px] shrink-0 rounded-xl border p-3 transition-colors ${
                          isDropTarget
                            ? 'border-indigo-400 bg-indigo-50/40'
                            : 'border-slate-200 bg-slate-50/70'
                        }`}
                      >
                        {/* 列ヘッダー */}
                        <div className="flex items-center justify-between gap-2 mb-2.5">
                          <div className="flex items-center gap-2 min-w-0">
                            <h3 className="text-xs font-bold text-slate-800 truncate">
                              {col.title}
                            </h3>
                            <span className="text-[11px] font-medium text-slate-400 tabular-nums">
                              {colCards.length}
                            </span>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCard(null);
                              setModalInitialColId(col.id);
                              setModalInitialCardType(col.kind === 'memo' ? 'memo' : 'task');
                              setIsCardModalOpen(true);
                            }}
                            title="詳細画面で追加"
                            className="p-1 rounded hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 cursor-pointer"
                          >
                            <Plus className="w-3.5 h-3.5" />
                          </button>
                        </div>

                        {/* クイック1行入力 */}
                        {!isDoneColumn && (
                          <div className="mb-2.5">
                            <input
                              type="text"
                              value={quickDraftByCol[col.id] || ''}
                              onChange={e =>
                                setQuickDraftByCol(prev => ({ ...prev, [col.id]: e.target.value }))
                              }
                              onKeyDown={e => {
                                if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
                                  e.preventDefault();
                                  handleQuickCreateCard(col);
                                }
                              }}
                              disabled={creatingColId === col.id}
                              placeholder={
                                col.kind === 'memo'
                                  ? '＋ メモ・URLを入力してEnter'
                                  : '＋ タイトルを入力してEnter'
                              }
                              className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
                            />
                          </div>
                        )}

                        {/* 未完了カード・メモカード一覧 */}
                        {!isDoneColumn && (
                          <div className="space-y-2">
                            {activeCardsInCol.map(c => renderCardItem(c, colIndex))}
                            {activeCardsInCol.length === 0 && completedCardsInCol.length === 0 && (
                              <div className="py-5 text-center text-[11px] text-slate-400">
                                カードはありません
                              </div>
                            )}
                          </div>
                        )}

                        {/* 完了カードの折り畳みセクション */}
                        {completedCardsInCol.length > 0 && (
                          <div className={!isDoneColumn && activeCardsInCol.length > 0 ? 'mt-3 pt-2 border-t border-slate-200/80' : ''}>
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedDoneCols(prev => ({
                                  ...prev,
                                  [col.id]: !prev[col.id],
                                }))
                              }
                              className="w-full flex items-center justify-between px-2.5 py-2 rounded-lg bg-white/80 hover:bg-white border border-slate-200 text-xs font-medium text-slate-600 transition-colors cursor-pointer"
                            >
                              <span className="inline-flex items-center gap-1.5">
                                {isDoneExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                                )}
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                <span>
                                  {isDoneExpanded
                                    ? '完了済みを折り畳む'
                                    : `完了済み (${completedCardsInCol.length}件) を表示`}
                                </span>
                              </span>
                              <span className="text-[11px] text-slate-400 tabular-nums">
                                {completedCardsInCol.length}
                              </span>
                            </button>

                            {isDoneExpanded && (
                              <div className="mt-2 space-y-2">
                                {completedCardsInCol.map(c => renderCardItem(c, colIndex))}
                              </div>
                            )}
                          </div>
                        )}

                        {isDoneColumn && completedCardsInCol.length === 0 && (
                          <div className="py-5 text-center text-[11px] text-slate-400">
                            完了カードはありません
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </section>
      </div>

      {isBoardModalOpen && (
        <BoardFormModal
          isOpen={isBoardModalOpen}
          onClose={() => {
            setIsBoardModalOpen(false);
            setEditingBoard(null);
          }}
          editingBoard={editingBoard}
          currentUser={currentUser}
          allUsers={allUsers}
          offices={offices}
          divisions={divisions}
          onSave={handleSaveBoard}
          onDelete={handleDeleteBoard}
        />
      )}

      {isCardModalOpen && activeBoard && (
        <CardDetailModal
          isOpen={isCardModalOpen}
          onClose={() => {
            setIsCardModalOpen(false);
            setEditingCard(null);
          }}
          board={activeBoard}
          card={editingCard}
          initialColumnId={modalInitialColId}
          initialCardType={modalInitialCardType}
          currentUser={currentUser}
          allUsers={allUsers}
          onSave={handleSaveCard}
          onDelete={handleDeleteCard}
          onShareCard={handleShareSingleCard}
        />
      )}
    </div>
  );
};
