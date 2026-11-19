import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
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
  LayoutGrid,
  List,
  UserCheck,
  BookOpen,
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
import { notifyProjectAssignees } from './projectNotifications';
import { ProjectListView } from './ProjectListView';
import { MyTasksView } from './MyTasksView';
import { markProjectCardAsRead } from '../../utils/notifications';

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
  initialProjectView,
  onClearInitialParams,
  onUpdateUser,
}) => {
  const [boards, setBoards] = useState<ProjectBoard[]>([]);
  const [cards, setCards] = useState<ProjectCard[]>([]);
  const [countsByBoard, setCountsByBoard] = useState<Record<string, ProjectBoardCountStats>>({});
  const [selectedBoardId, setSelectedBoardId] = useState<string>(initialProjectId || '');
  const [activeView, setActiveView] = useState<'kanban' | 'list' | 'mytasks'>(
    initialProjectView || 'kanban'
  );
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // フィルター＆クイック作成
  const [boardSearch, setBoardSearch] = useState('');
  const [cardSearch, setCardSearch] = useState('');
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

  // 上部ボード切替ドロップダウン（案B）
  const [isBoardSwitcherOpen, setIsBoardSwitcherOpen] = useState(false);
  const boardSwitcherRef = useRef<HTMLDivElement>(null);

  // 1行目（資料欄）の折り畳み＆カテゴリ追加状態（ユーザーごとに記憶）
  const [isMemoRowCollapsed, setIsMemoRowCollapsed] = useState<boolean>(() => {
    if (!currentUser?.id) return false;
    try {
      return localStorage.getItem(`teranago_project_memo_collapsed_${currentUser.id}`) === 'true';
    } catch {
      return false;
    }
  });
  const [isAddingMemoCat, setIsAddingMemoCat] = useState(false);
  const [newMemoCatTitle, setNewMemoCatTitle] = useState('');
  const [isSavingMemoCat, setIsSavingMemoCat] = useState(false);

  // 2行目（Todo欄）の「自分がアサインされているものだけ抽出」チェック状態（ユーザーごとに記憶）
  const [onlyMyTodo, setOnlyMyTodo] = useState<boolean>(() => {
    if (!currentUser?.id) return false;
    try {
      return localStorage.getItem(`teranago_project_todo_only_mine_${currentUser.id}`) === 'true';
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (!currentUser?.id) return;
    try {
      setIsMemoRowCollapsed(
        localStorage.getItem(`teranago_project_memo_collapsed_${currentUser.id}`) === 'true'
      );
      setOnlyMyTodo(
        localStorage.getItem(`teranago_project_todo_only_mine_${currentUser.id}`) === 'true'
      );
    } catch {
      setIsMemoRowCollapsed(false);
      setOnlyMyTodo(false);
    }
  }, [currentUser?.id]);

  const updateMemoRowCollapsed = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setIsMemoRowCollapsed(prev => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        if (currentUser?.id) {
          try {
            localStorage.setItem(
              `teranago_project_memo_collapsed_${currentUser.id}`,
              resolved ? 'true' : 'false'
            );
          } catch (_) {}
        }
        return resolved;
      });
    },
    [currentUser?.id]
  );

  const updateOnlyMyTodo = useCallback(
    (next: boolean | ((prev: boolean) => boolean)) => {
      setOnlyMyTodo(prev => {
        const resolved = typeof next === 'function' ? next(prev) : next;
        if (currentUser?.id) {
          try {
            localStorage.setItem(
              `teranago_project_todo_only_mine_${currentUser.id}`,
              resolved ? 'true' : 'false'
            );
          } catch (_) {}
        }
        return resolved;
      });
    },
    [currentUser?.id]
  );

  useEffect(() => {
    if (!isBoardSwitcherOpen) return;
    const handlePointerDown = (e: MouseEvent) => {
      if (boardSwitcherRef.current && !boardSwitcherRef.current.contains(e.target as Node)) {
        setIsBoardSwitcherOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsBoardSwitcherOpen(false);
      }
    };
    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isBoardSwitcherOpen]);

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

  // カード詳細モーダルを開いたタイミングで、該当カードの割り当て・最新コメント通知を既読化
  useEffect(() => {
    if (!isCardModalOpen || !editingCard || !currentUser?.id) return;
    const myIdStr = String(currentUser.id);
    markProjectCardAsRead(currentUser.id, String(editingCard.id));
    if (Array.isArray(editingCard.comments) && editingCard.comments.length > 0) {
      const otherComments = editingCard.comments.filter(c => c && String(c.authorId || '') !== myIdStr);
      if (otherComments.length > 0) {
        const latestComment = otherComments[otherComments.length - 1];
        markProjectCardAsRead(currentUser.id, `cmt_${editingCard.id}_${latestComment.id}`);
      }
    }
  }, [isCardModalOpen, editingCard?.id, editingCard?.comments?.length, currentUser?.id]);

  useEffect(() => {
    if (initialProjectView) {
      setActiveView(initialProjectView);
    }
  }, [initialProjectView]);

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

  // 1行目（資料カテゴリ列）と2行目（Todo進行列）を分離
  const memoColumns = useMemo(
    () => (activeBoard?.columns || []).filter(c => c.kind === 'memo'),
    [activeBoard?.columns]
  );
  const todoColumns = useMemo(
    () => (activeBoard?.columns || []).filter(c => c.kind !== 'memo'),
    [activeBoard?.columns]
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

  // 自分がアサインされているTodoか判定（個人ボードは未アサインでも自分のカード扱い）
  const isTodoAssignedToMe = useCallback(
    (card: ProjectCard, board: ProjectBoard | null): boolean => {
      const myUid = String(currentUser.id);
      if ((card.assigneeIds || []).map(String).includes(myUid)) return true;
      if (
        board?.boardType === 'personal' &&
        (String(card.createdBy || '') === myUid || (card.assigneeIds || []).length === 0)
      ) {
        return true;
      }
      return false;
    },
    [currentUser.id]
  );

  // アクティブボード内のカード集計＆キーワード検索フィルタ
  const activeBoardCards = useMemo(() => {
    if (!activeBoard) return [];
    const q = cardSearch.trim().toLowerCase();
    return cards
      .filter(c => c.projectId === activeBoard.id && !c.isArchived)
      .filter(c => {
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
  }, [cards, activeBoard, cardSearch]);

  // Todo欄用カード（「自分の担当のみ」チェック時はアサイン済みのTodoのみ抽出）
  const visibleTodoCards = useMemo(() => {
    if (!onlyMyTodo) return activeBoardCards;
    return activeBoardCards.filter(c => isTodoAssignedToMe(c, activeBoard));
  }, [activeBoardCards, onlyMyTodo, isTodoAssignedToMe, activeBoard]);

  // リストビュー用カード（資料カテゴリは全員共有のため常時表示、Todoのみ「自分の担当のみ」を反映）
  const listViewCards = useMemo(() => {
    if (!onlyMyTodo) return activeBoardCards;
    return activeBoardCards.filter(c => c.cardType === 'memo' || isTodoAssignedToMe(c, activeBoard));
  }, [activeBoardCards, onlyMyTodo, isTodoAssignedToMe, activeBoard]);

  // Todo欄ヘッダー表示用の件数集計（抽出ON時は自分の担当件数を反映）
  const todoHeaderCounts = useMemo(() => {
    if (!activeBoard) return { active: 0, completed: 0 };
    const todoColIdSet = new Set(todoColumns.map(c => c.id));
    const baseTodos = cards.filter(
      c =>
        c.projectId === activeBoard.id &&
        !c.isArchived &&
        c.cardType !== 'memo' &&
        (todoColIdSet.size === 0 || todoColIdSet.has(c.columnId))
    );
    const scoped = onlyMyTodo
      ? baseTodos.filter(c => isTodoAssignedToMe(c, activeBoard))
      : baseTodos;
    return {
      active: scoped.filter(c => !c.isCompleted).length,
      completed: scoped.filter(c => c.isCompleted).length,
    };
  }, [cards, activeBoard, todoColumns, onlyMyTodo, isTodoAssignedToMe]);

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

  // 1行目（資料欄）へ資料カテゴリ列をクイック追加
  const handleAddMemoCategories = async (titles: string[]) => {
    if (!activeBoard) return;
    const cleanTitles = titles.map(t => t.trim()).filter(Boolean);
    if (cleanTitles.length === 0) return;

    setIsSavingMemoCat(true);
    try {
      const existingMemos = activeBoard.columns.filter(c => c.kind === 'memo');
      const existingTodos = activeBoard.columns.filter(c => c.kind !== 'memo');
      const added: ProjectBoardColumn[] = cleanTitles.map((t, i) => ({
        id: `col-memo-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
        title: t,
        kind: 'memo',
        color: 'amber',
        sortOrder: existingMemos.length + i + 1,
      }));
      const nextColumns = [...existingMemos, ...added, ...existingTodos].map((c, idx) => ({
        ...c,
        sortOrder: idx + 1,
      }));

      const res = await fetch(`${API_BASE_URL}/projects/boards/${encodeURIComponent(activeBoard.id)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ columns: nextColumns }),
      });
      if (!res.ok) {
        throw new Error('資料カテゴリの追加に失敗しました');
      }
      const data = await res.json();
      const saved: ProjectBoard = data.board;
      setBoards(prev => prev.map(b => (b.id === saved.id ? saved : b)));
      setNewMemoCatTitle('');
      setIsAddingMemoCat(false);
      updateMemoRowCollapsed(false);
      showToast(`資料カテゴリ「${cleanTitles.join('」「')}」を追加しました`);
    } catch (err: any) {
      showToast(err?.message || '資料カテゴリの追加に失敗しました');
    } finally {
      setIsSavingMemoCat(false);
    }
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

  // ボード複製（雛形コピー）
  const handleCloneBoard = async (boardId: string) => {
    const res = await fetch(`${API_BASE_URL}/projects/boards/${encodeURIComponent(boardId)}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ownerId: currentUser.id,
        ownerName: currentUser.name,
        includeCards: true,
        resetCompletion: true,
      }),
    });
    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      throw new Error(errData.error || 'ボードの複製に失敗しました');
    }
    const data = await res.json();
    const clonedBoard: ProjectBoard = data.board;
    const clonedCards: ProjectCard[] = Array.isArray(data.cards) ? data.cards : [];
    setBoards(prev => [...prev, clonedBoard]);
    if (clonedCards.length > 0) {
      setCards(prev => [...prev, ...clonedCards]);
    }
    setSelectedBoardId(clonedBoard.id);
    setActiveView(prev => (prev === 'mytasks' ? 'kanban' : prev));
    showToast(`ボード「${clonedBoard.title}」を複製しました`);
  };

  // リストビュー用クイック作成
  const handleQuickCreateInList = async (title: string) => {
    if (!activeBoard) return;
    const trimmed = title.trim();
    if (!trimmed) return;
    const targetCol =
      activeBoard.columns.find(c => c.kind === 'todo') ||
      activeBoard.columns.find(c => c.kind !== 'done') ||
      activeBoard.columns[0];
    if (!targetCol) return;

    const isUrlOnly = /^https?:\/\/\S+$/i.test(trimmed);
    const cardType: ProjectCardType = targetCol.kind === 'memo' ? 'memo' : 'task';
    const res = await fetch(`${API_BASE_URL}/projects/cards`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        projectId: activeBoard.id,
        columnId: targetCol.id,
        cardType,
        title: isUrlOnly ? trimmed.replace(/^https?:\/\//i, '').slice(0, 60) : trimmed,
        description: isUrlOnly ? trimmed : '',
        assigneeIds:
          cardType === 'memo'
            ? []
            : activeBoard.boardType === 'personal' || onlyMyTodo
            ? [String(currentUser.id)]
            : [],
        createdBy: currentUser.id,
        createdByName: currentUser.name,
      }),
    });
    if (!res.ok) {
      showToast('カードの追加に失敗しました');
      throw new Error('作成に失敗しました');
    }
    const data = await res.json();
    setCards(prev => [...prev, data.card]);
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
          assigneeIds:
            cardType === 'memo'
              ? []
              : activeBoard.boardType === 'personal' || onlyMyTodo
              ? [String(currentUser.id)]
              : [],
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
    const prevCard = isEdit ? cards.find(c => c.id === payload.id) : undefined;
    const prevAssigneeSet = new Set((prevCard?.assigneeIds || []).map(String));
    const isMemoCard = payload.cardType === 'memo';

    const url = isEdit
      ? `${API_BASE_URL}/projects/cards/${encodeURIComponent(String(payload.id))}`
      : `${API_BASE_URL}/projects/cards`;
    const res = await fetch(url, {
      method: isEdit ? 'PUT' : 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...payload,
        assigneeIds: isMemoCard ? [] : payload.assigneeIds,
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
    window.dispatchEvent(new Event('projects_updated'));

    // 新規追加された担当者（操作本人以外）へ Web Push + メール通知を配信（資料カテゴリは担当者なしのため除外）
    if (saved.cardType !== 'memo') {
      const targetBoard = boards.find(b => b.id === saved.projectId) || activeBoard;
      const newlyAssignedIds = (saved.assigneeIds || [])
        .map(String)
        .filter(id => id !== String(currentUser.id) && (!isEdit || !prevAssigneeSet.has(id)));
      if (targetBoard && newlyAssignedIds.length > 0) {
        void notifyProjectAssignees({
          board: targetBoard,
          card: saved,
          targetUserIds: newlyAssignedIds,
          actor: currentUser,
          allUsers,
          isNewCard: !isEdit,
        });
      }
    }

    showToast(isEdit ? 'カードを更新しました' : 'カードを追加しました');
    window.dispatchEvent(new Event('projects_updated'));
  };

  const handleDeleteCard = async (cardId: string) => {
    const res = await fetch(`${API_BASE_URL}/projects/cards/${encodeURIComponent(cardId)}`, {
      method: 'DELETE',
    });
    if (!res.ok) {
      throw new Error('カードの削除に失敗しました');
    }
    setCards(prev => prev.filter(c => c.id !== cardId));
    window.dispatchEvent(new Event('projects_updated'));
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
      if (nextCompleted && currentUser?.id) {
        markProjectCardAsRead(currentUser.id, String(card.id));
      }
      window.dispatchEvent(new Event('projects_updated'));
    } catch {
      showToast('完了状態の更新に失敗しました');
    }
  };

  // ドラッグ＆ドロップまたはボタンでの列移動（資料⇔Todo間の相互移動は不可）
  const handleMoveCardToColumn = async (card: ProjectCard, targetColumnId: string) => {
    const targetBoard = boards.find(b => b.id === card.projectId) || activeBoard;
    if (!targetBoard || card.columnId === targetColumnId) return;
    const targetCol = targetBoard.columns.find(c => c.id === targetColumnId);
    if (!targetCol) return;

    const isCardMemo = card.cardType === 'memo';
    const isTargetMemo = targetCol.kind === 'memo';
    if (isCardMemo !== isTargetMemo) {
      showToast('資料とTodoの間では移動できません');
      return;
    }

    const nextCompleted =
      isCardMemo
        ? false
        : targetCol.kind === 'done'
        ? true
        : false;

    // 楽観的更新
    setCards(prev =>
      prev.map(c =>
        c.id === card.id
          ? {
              ...c,
              columnId: targetColumnId,
              isCompleted: nextCompleted,
            }
          : c
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
    if (activeView === 'mytasks') {
      const shareParams = {
        tab: 'projects' as const,
        projectView: 'mytasks' as const,
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
          title: 'マイタスク（横断一覧）',
          subtitle: `${currentUser.name}の担当タスク`,
          params: shareParams,
        });
        onUpdateUser(updatedUser);
        showToast('マイタスクのURLをコピーし、お気に入りに登録しました');
      } else {
        showToast('マイタスクのURLをコピーしました');
      }
      return;
    }

    if (!activeBoard) return;
    const shareParams = {
      tab: 'projects' as const,
      projectId: activeBoard.id,
      projectView: activeView,
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
        subtitle:
          (activeBoard.boardType === 'personal' ? 'マイボード（個人）' : 'チームボード') +
          (activeView === 'list' ? ' · リスト' : ''),
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
    const targetBoard = boards.find(b => b.id === card.projectId) || activeBoard;
    if (!targetBoard) return;
    const shareParams = {
      tab: 'projects' as const,
      projectId: targetBoard.id,
      taskId: card.id,
    };
    const url = buildAppUrl(shareParams);
    await copyTextToClipboard(url);
    if (currentUser && onUpdateUser) {
      const { updatedUser } = upsertBookmarkForUser(currentUser, {
        category: 'projects',
        title: card.title,
        subtitle: `${targetBoard.title} · ${card.cardType === 'memo' ? 'メモ・資料' : 'Todo'}`,
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

  const renderCardItem = (
    card: ProjectCard,
    options?: { nextCol?: ProjectBoardColumn; hideNextArrow?: boolean }
  ) => {
    const checkTotal = (card.checklist || []).length;
    const checkDone = (card.checklist || []).filter(c => c.done).length;
    const isOverdue = Boolean(!card.isCompleted && card.cardType !== 'memo' && card.dueDate && card.dueDate < todayStr);
    const isTodayDue = Boolean(!card.isCompleted && card.cardType !== 'memo' && card.dueDate && card.dueDate === todayStr);
    const nextCol = !options?.hideNextArrow && card.cardType !== 'memo' ? options?.nextCol : undefined;

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

            {/* 担当者アバター ＋ 次の列へ移動アクション（資料カテゴリは担当者なしのため非表示） */}
            {card.cardType !== 'memo' && ((card.assigneeIds || []).length > 0 || (nextCol && !card.isCompleted)) && (
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
                    className="opacity-0 group-hover:opacity-100 inline-flex items-center gap-0.5 px-1.5 py-0.5 text-[10px] font-medium text-slate-500 hover:text-indigo-700 hover:bg-indigo-50 rounded transition-opacity cursor-pointer whitespace-nowrap max-w-[115px]"
                  >
                    <span className="truncate">{nextCol.title}</span>
                    <ArrowRight className="w-2.5 h-2.5 shrink-0" />
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  };

  const renderBoardIcon = (board: ProjectBoard) => {
    if (board.boardType === 'personal') {
      return <Lock className="w-4 h-4 text-amber-600 shrink-0" />;
    }
    const dotClass = BOARD_ACCENT_DOT[board.color || 'indigo'] || 'bg-indigo-600';
    return <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${dotClass}`} />;
  };

  const renderBoardSwitcher = (isMyTasksMode = false) => {
    const switcherLabel = isMyTasksMode
      ? activeBoard
        ? `ボード切替（${activeBoard.title}）`
        : 'ボードを選択'
      : activeBoard?.title || 'ボードを選択';

    return (
      <div className="flex flex-wrap items-center gap-2 min-w-0">
        <div ref={boardSwitcherRef} className="relative min-w-0">
          <button
            type="button"
            onClick={() => setIsBoardSwitcherOpen(prev => !prev)}
            aria-expanded={isBoardSwitcherOpen}
            aria-haspopup="listbox"
            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-left transition-colors cursor-pointer max-w-full shadow-2xs ${
              isBoardSwitcherOpen
                ? 'border-indigo-400 bg-indigo-50/70 text-indigo-900'
                : 'border-slate-200 bg-white hover:bg-slate-50 hover:border-indigo-300 text-slate-900'
            }`}
            title="クリックしてプロジェクト／メモボードを切り替え"
          >
            {!isMyTasksMode && activeBoard ? (
              renderBoardIcon(activeBoard)
            ) : (
              <FolderKanban className="w-4 h-4 text-indigo-600 shrink-0" />
            )}
            <span className="text-sm sm:text-base font-bold truncate max-w-[210px] sm:max-w-[340px]">
              {switcherLabel}
            </span>
            <ChevronDown
              className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
                isBoardSwitcherOpen ? 'rotate-180 text-indigo-600' : ''
              }`}
            />
          </button>

          {isBoardSwitcherOpen && (
            <div className="absolute left-0 top-full mt-1.5 w-80 sm:w-96 max-w-[calc(100vw-2rem)] bg-white rounded-xl border border-slate-200 shadow-xl z-40 overflow-hidden">
              <div className="p-2.5 border-b border-slate-100 bg-slate-50/70">
                <div className="relative">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={boardSearch}
                    onChange={e => setBoardSearch(e.target.value)}
                    placeholder="ボード名・説明で検索..."
                    autoFocus
                    className="w-full pl-8 pr-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                </div>
              </div>

              <div className="max-h-80 overflow-y-auto p-2 space-y-3">
                {isLoading && boards.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">読み込み中...</div>
                ) : filteredBoards.length === 0 ? (
                  <div className="py-6 text-center text-xs text-slate-400">
                    該当するボードはありません
                  </div>
                ) : (
                  <>
                    {personalBoards.length > 0 && (
                      <div>
                        <div className="px-2 mb-1 text-[11px] font-semibold text-slate-400">
                          個人専用ボード ({personalBoards.length})
                        </div>
                        <div className="space-y-0.5">
                          {personalBoards.map(b => {
                            const active = activeBoard?.id === b.id && activeView !== 'mytasks';
                            const stats = liveStatsForBoard(b.id);
                            return (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => {
                                  setSelectedBoardId(b.id);
                                  if (activeView === 'mytasks') setActiveView('kanban');
                                  setIsBoardSwitcherOpen(false);
                                  setBoardSearch('');
                                }}
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
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[11px] text-slate-400 tabular-nums">
                                    {stats.activeTasks + stats.memos}
                                  </span>
                                  {active && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {teamBoards.length > 0 && (
                      <div>
                        <div className="px-2 mb-1 text-[11px] font-semibold text-slate-400">
                          チーム共有ボード ({teamBoards.length})
                        </div>
                        <div className="space-y-0.5">
                          {teamBoards.map(b => {
                            const active = activeBoard?.id === b.id && activeView !== 'mytasks';
                            const stats = liveStatsForBoard(b.id);
                            const dotClass = BOARD_ACCENT_DOT[b.color || 'indigo'] || 'bg-indigo-600';
                            return (
                              <button
                                key={b.id}
                                type="button"
                                onClick={() => {
                                  setSelectedBoardId(b.id);
                                  if (activeView === 'mytasks') setActiveView('kanban');
                                  setIsBoardSwitcherOpen(false);
                                  setBoardSearch('');
                                }}
                                className={`w-full flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg text-left text-xs transition-colors cursor-pointer ${
                                  active
                                    ? 'bg-indigo-50 text-indigo-800 font-semibold'
                                    : 'text-slate-700 hover:bg-slate-50'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className={`w-2 h-2 rounded-full shrink-0 ${dotClass}`} />
                                  <div className="min-w-0">
                                    <div className="truncate">{b.title}</div>
                                    <div className="text-[10px] font-normal text-slate-400 truncate">
                                      {getVisibilityLabel(b)}
                                    </div>
                                  </div>
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  {b.isPinned && <Pin className="w-3 h-3 text-amber-500" />}
                                  <span className="text-[11px] text-slate-400 tabular-nums">
                                    {stats.activeTasks + stats.memos}
                                  </span>
                                  {active && <Check className="w-3.5 h-3.5 text-indigo-600" />}
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="p-2 border-t border-slate-100 bg-slate-50/70">
                <button
                  type="button"
                  onClick={() => {
                    setIsBoardSwitcherOpen(false);
                    setEditingBoard(null);
                    setIsBoardModalOpen(true);
                  }}
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>新しいボードを作成</span>
                </button>
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            setIsBoardSwitcherOpen(false);
            setEditingBoard(null);
            setIsBoardModalOpen(true);
          }}
          title="新しいプロジェクト・メモボードを作成"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>新規ボード</span>
        </button>
      </div>
    );
  };

  return (
    <div className="flex-1 min-w-0 w-full space-y-4">
      {toastMsg && (
        <div className="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-lg bg-slate-900 text-white text-xs font-medium shadow-lg">
          {toastMsg}
        </div>
      )}

      {/* メインワークスペース：全幅使用（上部ドロップダウンボード切替 ＋ 幅フィットカンバン） */}
      <section className="bg-white rounded-xl border border-slate-200 min-w-0 w-full">
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

        {activeView === 'mytasks' ? (
          <>
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 space-y-1.5">
                <div className="flex flex-wrap items-center gap-2.5">
                  <div className="flex items-center gap-2">
                    <UserCheck className="w-4 h-4 text-indigo-600 shrink-0" />
                    <h2 className="text-base sm:text-lg font-bold text-slate-900 truncate">
                      マイタスク（全ボード横断）
                    </h2>
                  </div>
                  {renderBoardSwitcher(true)}
                </div>
                <p className="text-xs text-slate-500">
                  個人ボード・共有ボードで自分が担当しているタスクを期限順にまとめて表示しています
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div className="flex items-center gap-0.5 p-1 bg-slate-100 border border-slate-200 rounded-lg">
                  {[
                    { id: 'kanban', label: 'カンバン', icon: LayoutGrid },
                    { id: 'list', label: 'リスト', icon: List },
                    { id: 'mytasks', label: 'マイタスク', icon: UserCheck },
                  ].map(v => {
                    const VIcon = v.icon;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setActiveView(v.id as 'kanban' | 'list' | 'mytasks')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          activeView === v.id
                            ? 'bg-white text-indigo-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <VIcon className="w-3.5 h-3.5" />
                        <span>{v.label}</span>
                      </button>
                    );
                  })}
                </div>

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
              </div>
            </div>

            <MyTasksView
              currentUser={currentUser}
              boards={boards}
              cards={cards}
              todayStr={todayStr}
              onSelectCard={card => {
                setEditingCard(card);
                setIsCardModalOpen(true);
              }}
              onJumpToBoard={boardId => {
                setSelectedBoardId(boardId);
                setActiveView('kanban');
              }}
              onToggleComplete={handleToggleComplete}
            />
          </>
        ) : !activeBoard ? (
          <div className="p-10 text-center space-y-4">
            <div className="text-sm text-slate-500">
              ボードがまだありません。「新規ボード」からプロジェクト・メモボードを作成してください。
            </div>
            <div className="flex justify-center">
              <button
                type="button"
                onClick={() => {
                  setEditingBoard(null);
                  setIsBoardModalOpen(true);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>最初のボードを作成</span>
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ボードヘッダー（ドロップダウン切替統合） */}
            <div className="px-4 sm:px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1 space-y-1.5">
                {renderBoardSwitcher(false)}

                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500 tabular-nums">
                  <span className="inline-flex items-center gap-1 font-medium text-slate-600">
                    {activeBoard.boardType === 'personal' ? (
                      <Lock className="w-3 h-3 text-amber-600" />
                    ) : activeBoard.visibility === 'org' ? (
                      <Globe className="w-3 h-3 text-indigo-600" />
                    ) : activeBoard.visibility === 'office' || activeBoard.visibility === 'division' ? (
                      <Building2 className="w-3 h-3 text-indigo-600" />
                    ) : (
                      <Users className="w-3 h-3 text-indigo-600" />
                    )}
                    <span>{getVisibilityLabel(activeBoard)}</span>
                  </span>
                  <span aria-hidden="true">·</span>
                  <span>未完了 {liveStatsForBoard(activeBoard.id).activeTasks}件</span>
                  <span aria-hidden="true">·</span>
                  <span>メモ・資料 {liveStatsForBoard(activeBoard.id).memos}件</span>
                  <span aria-hidden="true">·</span>
                  <span>完了 {liveStatsForBoard(activeBoard.id).completedTasks}件</span>
                  {activeBoard.description && (
                    <>
                      <span aria-hidden="true" className="hidden sm:inline">·</span>
                      <span className="text-slate-500 truncate max-w-md">{activeBoard.description}</span>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {/* ビュー切替（カンバン / リスト / マイタスク） */}
                <div className="flex items-center gap-0.5 p-1 bg-slate-100 border border-slate-200 rounded-lg">
                  {[
                    { id: 'kanban', label: 'カンバン', icon: LayoutGrid },
                    { id: 'list', label: 'リスト', icon: List },
                    { id: 'mytasks', label: 'マイタスク', icon: UserCheck },
                  ].map(v => {
                    const VIcon = v.icon;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => setActiveView(v.id as 'kanban' | 'list' | 'mytasks')}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                          activeView === v.id
                            ? 'bg-white text-indigo-700 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                      >
                        <VIcon className="w-3.5 h-3.5" />
                        <span>{v.label}</span>
                      </button>
                    );
                  })}
                </div>

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

                {activeView === 'list' && memoColumns.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCard(null);
                      setModalInitialColId(memoColumns[0].id);
                      setModalInitialCardType('memo');
                      setIsCardModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>資料追加</span>
                  </button>
                )}

                {todoColumns.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingCard(null);
                      setModalInitialColId(todoColumns[0].id);
                      setModalInitialCardType('task');
                      setIsCardModalOpen(true);
                    }}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Todo追加</span>
                  </button>
                )}
              </div>
            </div>

            {/* ツールバー（キーワード検索） */}
            <div className="px-4 sm:px-5 py-2.5 border-b border-slate-200 bg-slate-50/50 flex flex-wrap items-center justify-between gap-3">
              <div className="relative w-full sm:w-72">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={cardSearch}
                  onChange={e => setCardSearch(e.target.value)}
                  placeholder="カード・メモ・タグを検索..."
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                />
              </div>

              {activeView === 'list' && (
                <label
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-medium transition-colors cursor-pointer select-none whitespace-nowrap ${
                    onlyMyTodo
                      ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                  }`}
                  title="自分がアサインされているTodoのみ抽出します（資料は全員共有のため常時表示・設定は記憶されます）"
                >
                  <input
                    type="checkbox"
                    checked={onlyMyTodo}
                    onChange={e => updateOnlyMyTodo(e.target.checked)}
                    className="w-3.5 h-3.5 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                  />
                  <span>自分の担当Todoのみ</span>
                </label>
              )}
            </div>

            {activeView === 'list' ? (
              <ProjectListView
                board={activeBoard}
                cards={listViewCards}
                allUsers={allUsers}
                todayStr={todayStr}
                onSelectCard={card => {
                  setEditingCard(card);
                  setIsCardModalOpen(true);
                }}
                onToggleComplete={handleToggleComplete}
                onMoveColumn={handleMoveCardToColumn}
                onQuickCreateInList={handleQuickCreateInList}
              />
            ) : (
              /* 2段構成ボード（1行目：資料欄（カテゴリ別・進行なし）／ 2行目：Todo欄（左→右に進行）） */
              <div className="divide-y divide-slate-200">
                {/* 1行目：資料・ドキュメント欄 */}
                <div className="bg-amber-50/20">
                  <div className="px-4 sm:px-5 py-2.5 bg-amber-50/60 border-b border-amber-200/70 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <div className="inline-flex items-center gap-1.5">
                        <BookOpen className="w-4 h-4 text-amber-600 shrink-0" />
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                          1. 資料欄
                        </h3>
                      </div>
                      <span className="px-1.5 py-0.5 text-[11px] font-semibold bg-amber-100 text-amber-800 rounded tabular-nums">
                        {activeBoardCards.filter(c => memoColumns.some(mc => mc.id === c.columnId)).length}件
                      </span>
                      <span className="text-[11px] text-slate-500 hidden sm:inline">
                        {activeBoard.boardType === 'personal'
                          ? '進行しない固定資料（個人メモ・URLなどカテゴリ別に管理）'
                          : '進行しない固定資料（担当者なし・メンバー全員で共有）'}
                      </span>
                    </div>

                      <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                        {isAddingMemoCat ? (
                          <form
                            onSubmit={e => {
                              e.preventDefault();
                              handleAddMemoCategories([newMemoCatTitle]);
                            }}
                            className="flex items-center gap-1"
                          >
                            <input
                              type="text"
                              value={newMemoCatTitle}
                              onChange={e => setNewMemoCatTitle(e.target.value)}
                              placeholder="例: 業務計画関係"
                              autoFocus
                              disabled={isSavingMemoCat}
                              className="w-36 px-2 py-1 text-xs bg-white border border-amber-300 rounded-md focus:outline-none focus:border-amber-500"
                            />
                            <button
                              type="submit"
                              disabled={isSavingMemoCat || !newMemoCatTitle.trim()}
                              className="px-2 py-1 text-xs font-semibold bg-amber-600 hover:bg-amber-700 text-white rounded-md disabled:opacity-40 cursor-pointer whitespace-nowrap"
                            >
                              追加
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                setIsAddingMemoCat(false);
                                setNewMemoCatTitle('');
                              }}
                              className="px-2 py-1 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                            >
                              戻る
                            </button>
                          </form>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setIsAddingMemoCat(true)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md border border-amber-300/80 bg-white hover:bg-amber-50 text-amber-800 text-xs font-medium cursor-pointer whitespace-nowrap"
                          >
                            <Plus className="w-3 h-3" />
                            <span>カテゴリ追加</span>
                          </button>
                        )}

                        {memoColumns.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingCard(null);
                              setModalInitialColId(memoColumns[0].id);
                              setModalInitialCardType('memo');
                              setIsCardModalOpen(true);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap"
                          >
                            <Plus className="w-3 h-3" />
                            <span>資料追加</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => updateMemoRowCollapsed(prev => !prev)}
                          title="資料欄の折り畳み状態はユーザーごとに記憶されます"
                          className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-xs font-medium text-slate-600 hover:bg-amber-100/60 cursor-pointer whitespace-nowrap"
                        >
                          {isMemoRowCollapsed ? (
                            <>
                              <ChevronRight className="w-3.5 h-3.5" />
                              <span>開く</span>
                            </>
                          ) : (
                            <>
                              <ChevronDown className="w-3.5 h-3.5" />
                              <span>折り畳む</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>

                    {!isMemoRowCollapsed && (
                      <div className="p-3 sm:p-4 overflow-x-auto">
                        {memoColumns.length === 0 ? (
                          <div className="py-4 px-4 rounded-xl border border-dashed border-amber-300 bg-white/70 flex flex-wrap items-center justify-between gap-3">
                            <p className="text-xs text-slate-600">
                              資料カテゴリがまだ設定されていません。「業務計画関係」「ミーティング関係」などを作成して資料を分類できます。
                            </p>
                            <button
                              type="button"
                              disabled={isSavingMemoCat}
                              onClick={() => handleAddMemoCategories(['業務計画関係', 'ミーティング関係'])}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap disabled:opacity-50"
                            >
                              <Plus className="w-3.5 h-3.5" />
                              <span>「業務計画関係」「ミーティング関係」を追加</span>
                            </button>
                          </div>
                        ) : (
                          <div
                            className="grid gap-3 items-start"
                            style={{
                              gridTemplateColumns: `repeat(${memoColumns.length}, minmax(235px, 1fr))`,
                            }}
                          >
                            {memoColumns.map(col => {
                              const colCards = activeBoardCards.filter(c => c.columnId === col.id);
                              const isDropTarget = dragOverColId === col.id;
                              return (
                                <div
                                  key={col.id}
                                  onDragOver={e => {
                                    const dragged = draggingCardId
                                      ? cards.find(c => c.id === draggingCardId)
                                      : undefined;
                                    if (!dragged || dragged.cardType !== 'memo') return;
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
                                      if (dragged && dragged.cardType === 'memo') {
                                        handleMoveCardToColumn(dragged, col.id);
                                      }
                                      setDraggingCardId(null);
                                    }
                                  }}
                                  className={`min-w-0 rounded-xl border p-2.5 sm:p-3 transition-colors ${
                                    isDropTarget
                                      ? 'border-amber-400 bg-amber-50'
                                      : 'border-amber-200/80 bg-white'
                                  }`}
                                >
                                  <div className="flex items-center justify-between gap-2 mb-2">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      <StickyNote className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                                      <h4 className="text-xs font-bold text-slate-800 truncate">
                                        {col.title}
                                      </h4>
                                      <span className="text-[11px] font-medium text-slate-400 tabular-nums shrink-0">
                                        {colCards.length}
                                      </span>
                                    </div>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditingCard(null);
                                        setModalInitialColId(col.id);
                                        setModalInitialCardType('memo');
                                        setIsCardModalOpen(true);
                                      }}
                                      title={`「${col.title}」に資料・メモを追加`}
                                      className="p-1 rounded hover:bg-amber-100/70 text-slate-500 hover:text-amber-800 cursor-pointer shrink-0"
                                    >
                                      <Plus className="w-3.5 h-3.5" />
                                    </button>
                                  </div>

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
                                      placeholder="＋ 資料タイトル・URLを入力してEnter"
                                      className="w-full px-2.5 py-1.5 text-xs bg-slate-50/70 border border-slate-200 rounded-lg placeholder:text-slate-400 focus:bg-white focus:outline-none focus:border-amber-400"
                                    />
                                  </div>

                                  <div className="space-y-2">
                                    {colCards.map(c => renderCardItem(c, { hideNextArrow: true }))}
                                    {colCards.length === 0 && (
                                      <div className="py-3 text-center text-[11px] text-slate-400">
                                        資料はありません
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                {/* 2行目：Todo・タスク進行欄 */}
                <div>
                  <div className="px-4 sm:px-5 py-2.5 bg-slate-50/70 border-b border-slate-200/80 flex flex-wrap items-center justify-between gap-2">
                    <div className="flex flex-wrap items-center gap-2 min-w-0">
                      <div className="inline-flex items-center gap-1.5">
                        <CheckSquare className="w-4 h-4 text-indigo-600 shrink-0" />
                        <h3 className="text-xs sm:text-sm font-bold text-slate-900">
                          2. Todo欄
                        </h3>
                      </div>
                      <span className="px-1.5 py-0.5 text-[11px] font-semibold bg-indigo-50 text-indigo-700 rounded tabular-nums">
                        {onlyMyTodo ? '自分の担当: ' : ''}未完了 {todoHeaderCounts.active}件 / 完了 {todoHeaderCounts.completed}件
                      </span>
                      <span className="text-[11px] text-slate-500 hidden lg:inline">
                        左の列から右の列へ進捗を移動（ドラッグまたはカード右下の「→」）
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 shrink-0">
                      <label
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border text-xs font-medium transition-colors cursor-pointer select-none whitespace-nowrap ${
                          onlyMyTodo
                            ? 'border-indigo-400 bg-indigo-50 text-indigo-800'
                            : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                        }`}
                        title="自分がアサインされているTodoのみ抽出します（設定は記憶されます）"
                      >
                        <input
                          type="checkbox"
                          checked={onlyMyTodo}
                          onChange={e => updateOnlyMyTodo(e.target.checked)}
                          className="w-3.5 h-3.5 rounded border-slate-300 accent-indigo-600 cursor-pointer"
                        />
                        <span>自分の担当のみ</span>
                      </label>

                      {todoColumns.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setEditingCard(null);
                            setModalInitialColId(todoColumns[0].id);
                            setModalInitialCardType('task');
                            setIsCardModalOpen(true);
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer whitespace-nowrap shrink-0"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Todo追加</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="p-3 sm:p-4 overflow-x-auto">
                    {todoColumns.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">
                        Todo列がありません。「ボード設定」から進行列を追加してください。
                      </div>
                    ) : (
                      <div
                        className="grid gap-3 items-start"
                        style={{
                          gridTemplateColumns: `repeat(${todoColumns.length}, minmax(215px, 1fr))`,
                        }}
                      >
                        {todoColumns.map((col, colIndex) => {
                          const colCards = visibleTodoCards.filter(c => c.columnId === col.id);
                            const isDoneColumn = col.kind === 'done';
                            const activeCardsInCol = isDoneColumn
                              ? []
                              : colCards.filter(c => !c.isCompleted || c.cardType === 'memo');
                            const completedCardsInCol = isDoneColumn
                              ? colCards
                              : colCards.filter(c => c.isCompleted && c.cardType !== 'memo');
                            const isDoneExpanded = Boolean(expandedDoneCols[col.id]);
                            const isDropTarget = dragOverColId === col.id;
                            const nextCol = todoColumns[colIndex + 1];

                            return (
                              <div
                                key={col.id}
                                onDragOver={e => {
                                  const dragged = draggingCardId
                                    ? cards.find(c => c.id === draggingCardId)
                                    : undefined;
                                  if (!dragged || dragged.cardType === 'memo') return;
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
                                    if (dragged && dragged.cardType !== 'memo') {
                                      handleMoveCardToColumn(dragged, col.id);
                                    }
                                    setDraggingCardId(null);
                                  }
                                }}
                                className={`min-w-0 rounded-xl border p-2.5 sm:p-3 transition-colors ${
                                  isDropTarget
                                    ? 'border-indigo-400 bg-indigo-50/40'
                                    : 'border-slate-200 bg-slate-50/70'
                                }`}
                              >
                                {/* 列ヘッダー */}
                                <div className="flex items-center justify-between gap-2 mb-2.5">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <h4 className="text-xs font-bold text-slate-800 truncate">
                                      {col.title}
                                    </h4>
                                    <span className="text-[11px] font-medium text-slate-400 tabular-nums shrink-0">
                                      {colCards.length}
                                    </span>
                                  </div>
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setEditingCard(null);
                                      setModalInitialColId(col.id);
                                      setModalInitialCardType('task');
                                      setIsCardModalOpen(true);
                                    }}
                                    title="詳細画面で追加"
                                    className="p-1 rounded hover:bg-slate-200/70 text-slate-500 hover:text-slate-800 cursor-pointer shrink-0"
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
                                      placeholder="＋ タスクを入力してEnter"
                                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg placeholder:text-slate-400 focus:outline-none focus:border-indigo-400"
                                    />
                                  </div>
                                )}

                                {/* 未完了カード一覧 */}
                                {!isDoneColumn && (
                                  <div className="space-y-2">
                                    {activeCardsInCol.map(c => renderCardItem(c, { nextCol }))}
                                      {activeCardsInCol.length === 0 && completedCardsInCol.length === 0 && (
                                        <div className="py-5 text-center text-[11px] text-slate-400">
                                          {onlyMyTodo ? '自分の担当タスクはありません' : 'タスクはありません'}
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
                                        <span className="inline-flex items-center gap-1.5 min-w-0">
                                          {isDoneExpanded ? (
                                            <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                          ) : (
                                            <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                          )}
                                          <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                          <span className="truncate">
                                            {isDoneExpanded
                                              ? '完了済みを折り畳む'
                                              : `完了済み (${completedCardsInCol.length}件) を表示`}
                                          </span>
                                        </span>
                                        <span className="text-[11px] text-slate-400 tabular-nums shrink-0">
                                          {completedCardsInCol.length}
                                        </span>
                                      </button>

                                      {isDoneExpanded && (
                                        <div className="mt-2 space-y-2">
                                          {completedCardsInCol.map(c => renderCardItem(c, { nextCol }))}
                                        </div>
                                      )}
                                    </div>
                                  )}

                                  {isDoneColumn && completedCardsInCol.length === 0 && (
                                    <div className="py-5 text-center text-[11px] text-slate-400">
                                      {onlyMyTodo ? '自分の完了カードはありません' : '完了カードはありません'}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>
              </div>
            )}
          </>
        )}
      </section>

      {isBoardModalOpen && (
        <BoardFormModal
          key={editingBoard?.id || 'new'}
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
          onClone={handleCloneBoard}
        />
      )}

      {isCardModalOpen && (editingCard ? (boards.find(b => b.id === editingCard.projectId) || activeBoard) : activeBoard) && (
        <CardDetailModal
          key={editingCard?.id || `new-${modalInitialColId || 'card'}`}
          isOpen={isCardModalOpen}
          onClose={() => {
            setIsCardModalOpen(false);
            setEditingCard(null);
          }}
          board={(editingCard ? (boards.find(b => b.id === editingCard.projectId) || activeBoard) : activeBoard)!}
          card={editingCard}
          initialColumnId={modalInitialColId}
          initialCardType={modalInitialCardType}
          currentUser={currentUser}
          allUsers={allUsers}
          onSave={handleSaveCard}
          onDelete={handleDeleteCard}
          onShareCard={handleShareSingleCard}
          onCardPatched={updatedCard => {
            setCards(prev => prev.map(c => (c.id === updatedCard.id ? updatedCard : c)));
            setEditingCard(prev => (prev && prev.id === updatedCard.id ? updatedCard : prev));
            window.dispatchEvent(new Event('projects_updated'));
          }}
        />
      )}
    </div>
  );
};
