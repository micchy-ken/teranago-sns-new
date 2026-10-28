import React, { useState, useEffect, useRef, useMemo } from 'react';
import { X, MessageSquare, Eye, Pin, Paperclip, Calendar as CalendarIcon, Send, Trash2, Building2, Users, Tag, CheckCircle2, Edit3, Save, Plus, Loader2, Eye as EyeIcon, Download, UploadCloud, Share2, Check, Star, BarChart2, AlertCircle, Clock, CheckSquare, Lock, RotateCcw } from 'lucide-react';
import { BoardTopic, User, OfficeMaster, DivisionMaster, AttachmentFile, BoardViewer, BoardPollVote, BoardPoll } from '../types';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';
import { uploadMultipleFiles, deleteAttachmentFile, deleteAttachmentFiles, resolveFileUrl, isPreviewable } from '../utils/fileUpload';
import { FilePreviewModal } from './FilePreviewModal';
import { renderContentWithLinks } from '../utils/renderContentWithLinks';
import { UrlPastePopup, useUrlPasteHandler } from './common/UrlPastePopup';
import { markTopicAsRead } from '../utils/notifications';
import { triggerOpenUserModal } from '../utils/userModal';
import { buildAppUrl, copyTextToClipboard } from '../utils/urlParams';
import { API_BASE_URL } from '../config/api';
import { isTopicCurrentlyPinned, formatPinnedUntilBadge, getPollDeadlineMs } from '../utils/boardHelpers';

export const getRestoredPollOptions = (poll: BoardPoll | undefined | null): Array<{ id: string; text: string; requireComment: boolean }> => {
  if (!poll) {
    return [
      { id: 'opt-1', text: '選択肢 1', requireComment: false },
      { id: 'opt-2', text: '選択肢 2', requireComment: false },
      { id: 'opt-3', text: '選択肢 3', requireComment: false },
    ];
  }
  if (Array.isArray(poll.options) && poll.options.length > 0) {
    return poll.options.map(o => ({
      id: o.id,
      text: o.text || '',
      requireComment: !!o.requireComment,
    }));
  }
  const votes = poll.votes || [];
  const votedIds = Array.from(new Set(votes.flatMap(v => v.selectedOptionIds || [])));
  votedIds.sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  if (votedIds.length > 0) {
    return votedIds.map((optId, idx) => ({
      id: optId,
      text: optId === 'opt-1' ? '選択肢 1' : optId === 'opt-2' ? '選択肢 2' : optId === 'opt-3' ? '選択肢 3' : `選択肢 ${idx + 1}`,
      requireComment: false,
    }));
  }
  return [
    { id: 'opt-1', text: '選択肢 1', requireComment: false },
    { id: 'opt-2', text: '選択肢 2', requireComment: false },
    { id: 'opt-3', text: '選択肢 3', requireComment: false },
  ];
};

interface TopicDetailModalProps {
  topic: BoardTopic | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUpdateTopic: (updatedTopic: BoardTopic) => void;
  onDeleteTopic?: (topicId: string) => void;
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  isFavorite?: boolean;
  onToggleFavorite?: (topicId: string) => void;
  users?: User[];
}

const getDefaultDeadlineDate = () => {
  const d = new Date();
  d.setDate(d.getDate() + 7);
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export function TopicDetailModal({
  topic,
  isOpen,
  onClose,
  currentUser,
  onUpdateTopic,
  onDeleteTopic,
  offices = [],
  divisions = [],
  isFavorite = false,
  onToggleFavorite,
  users = [],
}: TopicDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'content' | 'viewers'>('content');
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });
  const [commentText, setCommentText] = useState('');
  const commentPasteHandler = useUrlPasteHandler(commentText, setCommentText);

  // コメント添付ファイル関連
  const [commentAttachments, setCommentAttachments] = useState<AttachmentFile[]>([]);
  const [isCommentUploading, setIsCommentUploading] = useState(false);
  const commentFileInputRef = useRef<HTMLInputElement>(null);

  // プレビュー関連
  const [previewFile, setPreviewFile] = useState<AttachmentFile | null>(null);
  const [isPreviewOpen, setIsPreviewOpen] = useState(false);

  // 編集モード関連 (投稿者本人のみ使用)
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const editPasteHandler = useUrlPasteHandler(editContent, setEditContent);
  const [editOffice, setEditOffice] = useState('');
  const [editDivision, setEditDivision] = useState('');
  const [editIsStrictScope, setEditIsStrictScope] = useState(false);
  const [editIsPinned, setEditIsPinned] = useState(false);
  const [editPinnedPeriod, setEditPinnedPeriod] = useState<'1week' | '1month' | 'forever'>('1week');
  const [editHasPeriod, setEditHasPeriod] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState('');
  const [editAttachments, setEditAttachments] = useState<AttachmentFile[]>([]);
  const [isEditingUploading, setIsEditingUploading] = useState(false);
  const [isEditingDraggingOver, setIsEditingDraggingOver] = useState(false);
  const [isCommentDraggingOver, setIsCommentDraggingOver] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // アンケート投票用 State
  const [selectedPollOptionIds, setSelectedPollOptionIds] = useState<string[]>([]);
  const [pollComment, setPollComment] = useState('');
  const [isChangingVote, setIsChangingVote] = useState(false);
  const [isVoting, setIsVoting] = useState(false);
  const [pollFeedback, setPollFeedback] = useState<string | null>(null);
  const [pollError, setPollError] = useState<string | null>(null);

  // 編集モード時のアンケート設定用 State
  const [editHasPoll, setEditHasPoll] = useState(false);
  const [editPollOptions, setEditPollOptions] = useState<Array<{ id: string; text: string; requireComment: boolean }>>([]);
  const [editPollDeadline, setEditPollDeadline] = useState('');
  const [editPollAutoPin, setEditPollAutoPin] = useState(true);
  const [editPollAllowMultiple, setEditPollAllowMultiple] = useState(false);
  const [editPollIsAnonymous, setEditPollIsAnonymous] = useState(false);

  const handleAddEditOption = () => {
    if (editPollOptions.length >= 10) return;
    const existingIds = new Set(editPollOptions.map(o => o.id));
    let nextId = '';
    for (let i = 1; i <= 20; i++) {
      const candidate = `opt-${i}`;
      if (!existingIds.has(candidate)) {
        nextId = candidate;
        break;
      }
    }
    if (!nextId) {
      nextId = `opt-${Date.now()}`;
    }
    setEditPollOptions([
      ...editPollOptions,
      { id: nextId, text: '', requireComment: false },
    ]);
  };

  const handleUpdateEditOptionText = (id: string, text: string) => {
    setEditPollOptions(editPollOptions.map(o => o.id === id ? { ...o, text } : o));
  };

  const handleToggleEditOptionRequireComment = (id: string) => {
    setEditPollOptions(editPollOptions.map(o => o.id === id ? { ...o, requireComment: !o.requireComment } : o));
  };

  const handleRemoveEditOption = (id: string) => {
    if (editPollOptions.length <= 2) return;
    setEditPollOptions(editPollOptions.filter(o => o.id !== id));
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleShareTopic = async () => {
    if (!topic) return;
    const url = buildAppUrl({ tab: 'board', topicId: topic.id });
    const success = await copyTextToClipboard(url);
    if (success) {
      setCopiedLink(true);
      setTimeout(() => setCopiedLink(false), 2500);
    }
  };

  const officeNames = React.useMemo(() => {
    const list = Array.from(new Set(offices.map(o => o.name).filter(Boolean)));
    if (topic?.office && topic.office !== '全社' && !list.includes(topic.office)) {
      list.push(topic.office);
    }
    return list;
  }, [offices, topic?.office]);

  const divisionNames = React.useMemo(() => {
    const list = Array.from(new Set(divisions.map(d => d.name).filter(Boolean)));
    if (topic?.division && topic.division !== '全部署' && !list.includes(topic.division)) {
      list.push(topic.division);
    }
    return list;
  }, [divisions, topic?.division]);

  const viewersList = useMemo(() => {
    const list = (topic?.viewers || [])
      .map((v: any) => {
        if (!v) return null;
        const uId = typeof v.user === 'string' ? v.user : (v.userId || v.user_id || v.id || v.user?.id || v.user?.userId);
        const uName = v.user?.name || v.name || (typeof v.user === 'string' ? v.user : undefined);
        const uLoginId = v.user?.loginId || v.loginId;

        // Try to match user from users prop or currentUser
        const matchedUser = (users || []).find(u => 
          (uId && (String(u.id) === String(uId) || String(u.loginId) === String(uId))) ||
          (uLoginId && (String(u.loginId) === String(uLoginId) || String(u.id) === String(uLoginId))) ||
          (uName && u.name === uName)
        ) || (currentUser && (
          (uId && (String(currentUser.id) === String(uId) || String(currentUser.loginId) === String(uId))) ||
          (uLoginId && (String(currentUser.loginId) === String(uLoginId) || String(currentUser.id) === String(uLoginId))) ||
          (uName && currentUser.name === uName)
        ) ? currentUser : null);

        let resolvedUser: User;
        if (matchedUser) {
          resolvedUser = typeof v.user === 'object' && v.user ? { ...v.user, ...matchedUser } : matchedUser;
        } else if (typeof v.user === 'object' && v.user) {
          resolvedUser = v.user;
        } else if (v.name || v.id) {
          resolvedUser = v as unknown as User;
        } else {
          return null;
        }

        if (!resolvedUser.name || resolvedUser.name === 'ユーザー情報取得中...') {
          resolvedUser = { ...resolvedUser, name: matchedUser?.name || 'メンバー' };
        }

        return {
          ...v,
          id: v.id || uId,
          user: resolvedUser,
          viewedAt: v.viewedAt || v.viewed_at || new Date().toISOString()
        };
      })
      .filter(Boolean) as BoardViewer[];

    // currentUser が閲覧中の場合、万が一API同期待ち等で未反映でも画面上に常時表示を維持
    if (currentUser?.id && topic && !list.some(v => String(v.user?.id) === String(currentUser.id) || v.user?.name === currentUser.name)) {
      list.push({
        id: currentUser.id,
        user: {
          ...currentUser,
          name: (!currentUser.name || currentUser.name === 'ユーザー情報取得中...') ? 'メンバー' : currentUser.name
        },
        viewedAt: new Date().toISOString()
      });
    }

    return list;
  }, [topic?.viewers, currentUser, users, topic?.id]);

  // 既読記録済みのトピックIDを記憶し、無限更新ループを防止
  const viewRecordedTopicIdsRef = useRef<Set<string>>(new Set());
  const lastInitializedTopicIdRef = useRef<string | null>(null);

  // モーダルが開かれた時に自動的に既読（閲覧メンバー）を記録、及び編集用フォーム初期化
  useEffect(() => {
    if (isOpen && topic) {
      // 編集フォーム初期化（トピックIDが切り替わった時のみ実行）
      if (lastInitializedTopicIdRef.current !== topic.id) {
        lastInitializedTopicIdRef.current = topic.id;
        if (!isEditing) {
          setEditTitle(topic.title || '');
          setEditContent(topic.content || '');
          setEditOffice(topic.office || '全社');
          setEditDivision(topic.division || '全部署');
          setEditIsStrictScope(!!topic.isStrictScope);
          setEditIsPinned(!!topic.isPinned);
          if (topic.isPinned) {
            if (topic.pinnedDuration) {
              setEditPinnedPeriod(topic.pinnedDuration);
            } else if (topic.pinnedUntil) {
              const untilMs = new Date(topic.pinnedUntil).getTime();
              const nowMs = Date.now();
              const diffDays = Math.ceil((untilMs - nowMs) / (1000 * 60 * 60 * 24));
              if (diffDays <= 10) {
                setEditPinnedPeriod('1week');
              } else {
                setEditPinnedPeriod('1month');
              }
            } else {
              setEditPinnedPeriod('forever');
            }
          } else {
            setEditPinnedPeriod('1week');
          }
          setEditHasPeriod(!!topic.hasPeriod);
          setEditStartDate(topic.startDate || '');
          setEditEndDate(topic.endDate || '');
          setEditTags(topic.tags || []);
          setEditAttachments((topic.attachments || []).map((a, i) => ({
            ...a,
            id: a.id || `att-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
          })));

          if (topic.poll) {
            setEditHasPoll(true);
            setEditPollOptions(getRestoredPollOptions(topic.poll));
            setEditPollDeadline(topic.poll.deadline || getDefaultDeadlineDate());
            setEditPollAutoPin(topic.poll.autoPinUntilDeadline !== false);
            setEditPollAllowMultiple(!!topic.poll.allowMultiple);
            setEditPollIsAnonymous(!!topic.poll.isAnonymous);
          } else {
            setEditHasPoll(false);
            setEditPollOptions([
              { id: 'opt-1', text: '選択肢 1', requireComment: false },
              { id: 'opt-2', text: '選択肢 2', requireComment: false },
              { id: 'opt-3', text: '選択肢 3', requireComment: false },
            ]);
            setEditPollDeadline(getDefaultDeadlineDate());
            setEditPollAutoPin(true);
            setEditPollAllowMultiple(false);
            setEditPollIsAnonymous(false);
          }
        }

        // アンケート投票状態初期化
        if (topic.poll) {
          const myVote = (topic.poll.votes || []).find(v => String(v.userId) === String(currentUser?.id));
          if (myVote) {
            setSelectedPollOptionIds(myVote.selectedOptionIds || []);
            setPollComment(myVote.comment || '');
            setIsChangingVote(false);
          } else {
            setSelectedPollOptionIds([]);
            setPollComment('');
            setIsChangingVote(false);
          }
          setPollFeedback(null);
          setPollError(null);
        } else {
          setSelectedPollOptionIds([]);
          setPollComment('');
          setIsChangingVote(false);
          setPollFeedback(null);
          setPollError(null);
        }

        setCommentAttachments([]);
        setIsCommentUploading(false);
        setIsEditingUploading(false);
      }

      // 既読・閲覧者記録（1トピックにつき初回1度のみ安全に実行）
      if (currentUser?.id && !viewRecordedTopicIdsRef.current.has(topic.id)) {
        viewRecordedTopicIdsRef.current.add(topic.id);
        markTopicAsRead(currentUser.id, topic.id);

        const effectiveUser = (currentUser.name && currentUser.name !== 'ユーザー情報取得中...')
          ? currentUser
          : (users.find(u => String(u.id) === String(currentUser.id)) || currentUser);
        const payloadUser = {
          ...effectiveUser,
          name: (!effectiveUser.name || effectiveUser.name === 'ユーザー情報取得中...') ? 'メンバー' : effectiveUser.name
        };

        // サーバー側の既読登録APIを直接呼び出し（永続化を確実にする）
        fetch(`${API_BASE_URL}/bulletins/${topic.id}/viewers`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: currentUser.id, user: payloadUser })
        }).catch(err => console.warn('Failed to post viewer to API:', err));

        const isAlreadyViewer = (topic.viewers || []).some(v => {
          const vUserId = v?.user?.id || (v as any)?.userId || (v as any)?.id;
          return vUserId === currentUser.id;
        });

        if (!isAlreadyViewer) {
          const newViewers = [
            ...(topic.viewers || []),
            { user: currentUser, viewedAt: new Date().toISOString() }
          ];
          const updatedTopic: BoardTopic = {
            ...topic,
            views: (topic.views || 0) + 1,
            viewers: newViewers,
          };
          onUpdateTopic(updatedTopic);
        }
      }
    } else if (!isOpen) {
      lastInitializedTopicIdRef.current = null;
      setIsEditing(false);
    }
  }, [isOpen, topic?.id, currentUser?.id]);

  const isAuthor = Boolean(
    topic && (
      topic.author?.id === currentUser?.id || 
      (topic.author?.loginId && currentUser?.loginId && topic.author.loginId === currentUser.loginId) ||
      topic.author?.name === currentUser?.name
    )
  );

  const isAdmin = !!(currentUser && (currentUser.isAdmin || currentUser.role === 'admin'));
  const canDeleteTopic = isAuthor || isAdmin;

  // アンケート投票処理
  const handleVote = async () => {
    if (!topic || !topic.poll || !currentUser) return;
    if (selectedPollOptionIds.length === 0) {
      setPollError('選択肢を1つ以上選んでください。');
      return;
    }

    // 必須コメントチェック
    const currentOptions = getRestoredPollOptions(topic.poll);
    const isCommentRequired = selectedPollOptionIds.some(id => 
      currentOptions.find(o => o.id === id)?.requireComment
    );
    if (isCommentRequired && !pollComment.trim()) {
      setPollError('選択された項目は理由コメントの記入が必須です。');
      return;
    }

    setIsVoting(true);
    setPollError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/bulletins/${topic.id}/poll/vote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatarUrl: currentUser.avatarUrl,
          selectedOptionIds: selectedPollOptionIds,
          comment: pollComment.trim() || undefined,
        }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => ({}));
        throw new Error(errJson.error || '投票に失敗しました');
      }

      const resData = await res.json();
      let updatedPoll = resData.poll || {
        ...topic.poll,
        votes: [
          ...(topic.poll.votes || []).filter(v => String(v.userId) !== String(currentUser.id)),
          resData.vote,
        ],
      };
      if (!updatedPoll.options || !Array.isArray(updatedPoll.options) || updatedPoll.options.length === 0) {
        updatedPoll = {
          ...updatedPoll,
          options: currentOptions,
        };
      }

      const updatedTopic: BoardTopic = {
        ...topic,
        poll: updatedPoll,
      };

      onUpdateTopic(updatedTopic);
      setIsChangingVote(false);
      setPollFeedback('投票を受け付けました！');
      setTimeout(() => setPollFeedback(null), 3000);
    } catch (err: any) {
      console.error('Poll vote fallback:', err);
      // フォールバック: クライアント側で即時反映
      const nowIso = new Date().toISOString();
      const newVote: BoardPollVote = {
        id: `vote-${Date.now()}`,
        userId: currentUser.id,
        userName: currentUser.name,
        userAvatarUrl: currentUser.avatarUrl,
        selectedOptionIds: selectedPollOptionIds,
        comment: pollComment.trim() || undefined,
        votedAt: nowIso,
      };
      const votes = [
        ...(topic.poll.votes || []).filter(v => String(v.userId) !== String(currentUser.id)),
        newVote,
      ];
      const updatedTopic: BoardTopic = {
        ...topic,
        poll: {
          ...topic.poll,
          votes,
        },
      };
      onUpdateTopic(updatedTopic);
      setIsChangingVote(false);
      setPollFeedback('投票を保存しました');
      setTimeout(() => setPollFeedback(null), 3000);
    } finally {
      setIsVoting(false);
    }
  };

  // 保存処理 (本人編集)
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle || !editTitle.trim() || !editContent || !editContent.trim()) return;

    let finalIsPinned = editIsPinned;
    let finalPinnedUntil: string | null = null;

    let updatedPoll: BoardPoll | undefined = undefined;
    if (editHasPoll) {
      const validOptions = editPollOptions
        .map(o => ({ ...o, text: (o.text || '').trim() }))
        .filter(o => o.text.length > 0);
      if (validOptions.length >= 2 && editPollDeadline) {
        updatedPoll = {
          id: topic.poll?.id || `poll-${Date.now()}`,
          options: validOptions.map(o => ({
            id: o.id,
            text: o.text,
            requireComment: !!o.requireComment,
          })),
          deadline: editPollDeadline,
          autoPinUntilDeadline: editPollAutoPin,
          allowMultiple: editPollAllowMultiple,
          isAnonymous: editPollIsAnonymous,
          votes: topic.poll?.votes || [],
        };

        if (editPollAutoPin && editPollDeadline) {
          finalIsPinned = true;
          finalPinnedUntil = new Date(`${editPollDeadline}T23:59:59.999+09:00`).toISOString();
        }
      }
    }

    if (!finalPinnedUntil && editIsPinned) {
      if (editPinnedPeriod === '1week') {
        const d = new Date();
        d.setDate(d.getDate() + 7);
        finalPinnedUntil = d.toISOString();
      } else if (editPinnedPeriod === '1month') {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        finalPinnedUntil = d.toISOString();
      } else {
        finalPinnedUntil = null;
      }
    }

    const updatedTopic: BoardTopic = {
      ...topic,
      title: (editTitle || '').trim(),
      content: (editContent || '').trim(),
      office: editOffice,
      division: editDivision,
      isStrictScope: editIsStrictScope,
      isPinned: finalIsPinned,
      pinnedUntil: finalPinnedUntil,
      pinnedDuration: editIsPinned ? editPinnedPeriod : undefined,
      hasPeriod: editHasPeriod,
      startDate: editHasPeriod ? editStartDate : undefined,
      endDate: editHasPeriod ? editEndDate : undefined,
      tags: editTags,
      attachments: editAttachments,
      poll: updatedPoll,
    };

    onUpdateTopic(updatedTopic);
    setIsEditing(false);
  };

  // タグ追加
  const handleAddTag = (tagToAdd: string) => {
    const trimmed = (tagToAdd || '').trim().replace(/^#/, '');
    if (trimmed && !editTags.includes(trimmed)) {
      setEditTags([...editTags, trimmed]);
    }
    setEditTagInput('');
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setEditTags(editTags.filter(t => t !== tagToRemove));
  };

  // 添付ファイル変更 (非同期アップロード)
  const processEditingUploadedFiles = async (files: FileList | File[]) => {
    if (files && files.length > 0) {
      setIsEditingUploading(true);
      try {
        const uploaded = await uploadMultipleFiles(files);
        setEditAttachments(prev => [...prev, ...uploaded]);
      } catch (err) {
        console.error(err);
      } finally {
        setIsEditingUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processEditingUploadedFiles(e.target.files);
    }
  };

  const handleEditingDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditingDraggingOver(true);
  };

  const handleEditingDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditingDraggingOver(false);
  };

  const handleEditingDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsEditingDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processEditingUploadedFiles(e.dataTransfer.files);
    }
  };

  // コメント添付ファイル選択 (非同期アップロード)
  const processCommentUploadedFiles = async (files: FileList | File[]) => {
    if (files && files.length > 0) {
      setIsCommentUploading(true);
      try {
        const uploaded = await uploadMultipleFiles(files);
        setCommentAttachments(prev => [...prev, ...uploaded]);
      } catch (err) {
        console.error(err);
      } finally {
        setIsCommentUploading(false);
        if (commentFileInputRef.current) {
          commentFileInputRef.current.value = '';
        }
      }
    }
  };

  const handleCommentFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processCommentUploadedFiles(e.target.files);
    }
  };

  const handleCommentDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCommentDraggingOver(true);
  };

  const handleCommentDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCommentDraggingOver(false);
  };

  const handleCommentDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsCommentDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processCommentUploadedFiles(e.dataTransfer.files);
    }
  };

  // コメント追加
  const handleAddComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText || !commentText.trim()) return;

    const newComment = {
      id: `cm-${Date.now()}`,
      author: currentUser,
      content: (commentText || '').trim(),
      createdAt: new Date().toISOString(),
      attachments: commentAttachments,
    };

    // ① 先にコメント作成専用 API を直接呼び出して DB 保存を確実に完了させる
    try {
      await fetch(`${API_BASE_URL}/bulletins/${topic.id}/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: newComment.id,
          author: currentUser,
          authorId: currentUser?.id,
          content: newComment.content,
          createdAt: newComment.createdAt,
          attachments: newComment.attachments,
        })
      });
    } catch (err) {
      console.warn('Failed to post comment via direct API:', err);
    }

    // ② ローカル状態の更新および onUpdateTopic 呼び出し
    const updatedComments = [...(topic.comments || []), newComment];
    const updatedTopic: BoardTopic = {
      ...topic,
      comments: updatedComments,
      commentsCount: updatedComments.length,
    };

    onUpdateTopic(updatedTopic);
    setCommentText('');
    setCommentAttachments([]);
  };

  // コメント削除
  const handleDeleteComment = async (commentId: string) => {
    const commentToDelete = (topic.comments || []).find(c => c.id === commentId);
    if (commentToDelete && commentToDelete.attachments && commentToDelete.attachments.length > 0) {
      await deleteAttachmentFiles(commentToDelete.attachments);
    }

    // バックエンドのコメント削除 API を直接呼び出し（DBから確実に消去）
    try {
      await fetch(`${API_BASE_URL}/bulletins/${topic.id}/comments/${commentId}`, {
        method: 'DELETE'
      });
    } catch (err) {
      console.warn('Failed to delete comment via direct API:', err);
    }

    const updatedComments = (topic.comments || []).filter(c => c.id !== commentId);
    const updatedTopic: BoardTopic = {
      ...topic,
      comments: updatedComments,
      commentsCount: updatedComments.length,
    };
    onUpdateTopic(updatedTopic);
  };

  const confirmDeleteComment = (commentId: string) => {
    setConfirmModal({
      isOpen: true,
      title: 'コメントの削除',
      message: 'このコメントを削除してもよろしいですか？添付ファイルも含めて削除されます。',
      type: 'danger',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      onConfirm: async () => {
        await handleDeleteComment(commentId);
      }
    });
  };

  if (!isOpen || !topic) return null;

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-3xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8 flex flex-col max-h-[85vh]"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0 pr-4">
            {topic && isTopicCurrentlyPinned(topic) && !isEditing && (
              <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100 text-amber-800 rounded-lg text-xs font-bold shrink-0">
                <Pin className="w-3.5 h-3.5 text-amber-600" />
                <span>ピン留め</span>
                <span className="text-[10px] text-amber-700 font-medium">
                  {formatPinnedUntilBadge(topic.pinnedUntil)}
                </span>
              </span>
            )}
            <h2 className="text-lg font-bold text-slate-800 truncate">
              {isEditing ? 'トピック内容の編集 (投稿者専用)' : topic.title}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {!isEditing && onToggleFavorite && (
              <button
                type="button"
                onClick={() => onToggleFavorite(topic.id)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                  isFavorite
                    ? 'bg-amber-50 text-amber-600 border-amber-300 ring-2 ring-amber-200'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:text-amber-500'
                }`}
                title={isFavorite ? 'お気に入りから解除' : 'お気に入りに追加'}
              >
                <Star className={`w-3.5 h-3.5 ${isFavorite ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} />
                <span className="hidden sm:inline">{isFavorite ? 'お気に入り中' : 'お気に入り'}</span>
              </button>
            )}
            {!isEditing && (
              <button
                type="button"
                onClick={handleShareTopic}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all shadow-2xs cursor-pointer ${
                  copiedLink
                    ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200'
                    : 'bg-white hover:bg-slate-100 text-slate-700 border-slate-200 hover:text-indigo-600'
                }`}
                title="このトピックを開く共有リンク（URL）をコピー"
              >
                {copiedLink ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    <span>URLコピー完了!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                    <span className="hidden sm:inline">共有リンク</span>
                    <span className="sm:hidden">共有</span>
                  </>
                )}
              </button>
            )}
            {isAuthor && !isEditing && (
              <button
                onClick={() => {
                  setEditTitle(topic.title);
                  setEditContent(topic.content);
                  setEditOffice(topic.office || '全社');
                  setEditDivision(topic.division || '全部署');
                  setEditIsPinned(!!topic.isPinned);
                  setEditHasPeriod(!!topic.hasPeriod);
                  setEditStartDate(topic.startDate || '');
                  setEditEndDate(topic.endDate || '');
                  setEditTags(topic.tags || []);
                  setEditAttachments((topic.attachments || []).map((a, i) => ({
                    ...a,
                    id: a.id || `att-${i}-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`
                  })));
                  if (topic.poll) {
                    setEditHasPoll(true);
                    setEditPollOptions(getRestoredPollOptions(topic.poll));
                    setEditPollDeadline(topic.poll.deadline || getDefaultDeadlineDate());
                    setEditPollAutoPin(topic.poll.autoPinUntilDeadline !== false);
                    setEditPollAllowMultiple(!!topic.poll.allowMultiple);
                    setEditPollIsAnonymous(!!topic.poll.isAnonymous);
                  } else {
                    setEditHasPoll(false);
                    setEditPollOptions([
                      { id: 'opt-1', text: '選択肢 1', requireComment: false },
                      { id: 'opt-2', text: '選択肢 2', requireComment: false },
                      { id: 'opt-3', text: '選択肢 3', requireComment: false },
                    ]);
                    setEditPollDeadline(getDefaultDeadlineDate());
                    setEditPollAutoPin(true);
                    setEditPollAllowMultiple(false);
                    setEditPollIsAnonymous(false);
                  }
                  setIsEditing(true);
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                編集する
              </button>
            )}
            {canDeleteTopic && onDeleteTopic && !isEditing && (
              <button
                onClick={() => {
                  setConfirmModal({
                    isOpen: true,
                    title: 'トピックの削除',
                    message: 'このトピックを削除してもよろしいですか？添付ファイルも含めて削除されます。',
                    type: 'danger',
                    confirmText: '削除する',
                    cancelText: 'キャンセル',
                    onConfirm: async () => {
                      // トピック本文の添付ファイルと全コメントの添付ファイルをすべて収集して一括物理削除
                      const allAttachments = [
                        ...(topic.attachments || []),
                        ...(topic.comments || []).flatMap(c => c.attachments || [])
                      ];
                      if (allAttachments.length > 0) {
                        await deleteAttachmentFiles(allAttachments);
                      }
                      onDeleteTopic(topic.id);
                    }
                  });
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-50 hover:bg-red-100 text-red-700 font-bold text-xs rounded-xl border border-red-200 transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                削除する
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Sub-Header Meta & Tabs */}
        {!isEditing && (
          <div className="px-6 py-3 bg-white border-b border-slate-100 flex flex-wrap items-center justify-between gap-3 shrink-0">
            <div 
              onClick={() => topic.author && triggerOpenUserModal(topic.author)}
              className="flex items-center gap-3 cursor-pointer group/author hover:opacity-90 transition-opacity"
              title={`${topic.author.name}のプロフィールを表示`}
            >
              <img
                src={getAvatarUrl(topic.author?.id === currentUser?.id ? (currentUser?.avatarUrl || topic.author?.avatarUrl) : topic.author?.avatarUrl)}
                alt={topic.author?.name}
                onError={handleAvatarError}
                className="w-9 h-9 rounded-full border border-slate-200 object-cover group-hover/author:ring-2 ring-indigo-200 transition-all"
              />
              <div>
                <div className="text-xs font-bold text-slate-800 group-hover/author:text-indigo-600 transition-colors">
                  {topic.author.name}
                </div>
                <div className="text-[11px] text-slate-400">
                  {new Date(topic.createdAt).toLocaleString('ja-JP')} 投稿
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 bg-slate-100 p-1 rounded-xl">
              <button
                onClick={() => setActiveTab('content')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  activeTab === 'content'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                内容 & コメント ({topic.commentsCount})
              </button>
              <button
                onClick={() => setActiveTab('viewers')}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center gap-1 ${
                  activeTab === 'viewers'
                    ? 'bg-white text-indigo-600 shadow-xs'
                    : 'text-slate-500 hover:text-slate-800'
                }`}
              >
                <Eye className="w-3.5 h-3.5" />
                閲覧メンバー ({viewersList.length})
              </button>
            </div>
          </div>
        )}

        {/* Main Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {isEditing ? (
            /* EDIT FORM (Author Only) */
            <form onSubmit={handleSaveEdit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">タイトル <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={e => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-bold focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Building2 className="w-3.5 h-3.5 text-slate-500" />
                    公開拠点
                  </label>
                  <select
                    value={editOffice}
                    onChange={e => setEditOffice(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="全社">全社</option>
                    {officeNames.map(o => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-slate-500" />
                    公開部署
                  </label>
                  <select
                    value={editDivision}
                    onChange={e => setEditDivision(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                  >
                    <option value="全部署">全部署</option>
                    {divisionNames.map(d => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-xl">
                <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-700 hover:text-indigo-900 transition-colors">
                  <input
                    type="checkbox"
                    checked={editIsStrictScope}
                    onChange={e => setEditIsStrictScope(e.target.checked)}
                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
                  />
                  <span className="flex items-center gap-1">
                    <Lock className="w-3.5 h-3.5 text-indigo-600" />
                    公開範囲のみ表示（指定拠点・部署以外のユーザーには限定非表示）
                  </span>
                </label>
              </div>

              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 mb-1">内容 <span className="text-red-500">*</span></label>
                <UrlPastePopup
                  prompt={editPasteHandler.pastePrompt}
                  onInsertCard={editPasteHandler.handleInsertCard}
                  onKeepPlain={editPasteHandler.handleKeepPlain}
                  onClose={editPasteHandler.closePrompt}
                  positionClass="bottom-full mb-2 left-0"
                />
                <textarea
                  required
                  rows={6}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
                  onPaste={editPasteHandler.handlePaste}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-none"
                />
              </div>

              {/* タグ設定 */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1 flex items-center gap-1">
                  <Tag className="w-3.5 h-3.5 text-indigo-500" />
                  タグ編集
                </label>
                <div className="flex flex-wrap items-center gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl">
                  {editTags.map(tag => (
                    <span key={tag} className="inline-flex items-center gap-1 bg-indigo-50 text-indigo-700 text-xs font-bold px-2.5 py-1 rounded-lg border border-indigo-100">
                      #{tag}
                      <button type="button" onClick={() => handleRemoveTag(tag)} className="hover:text-red-600">
                        <X className="w-3 h-3" />
                      </button>
                    </span>
                  ))}
                  <input
                    type="text"
                    value={editTagInput}
                    onChange={e => setEditTagInput(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (editTagInput && editTagInput.trim()) handleAddTag(editTagInput);
                      }
                    }}
                    placeholder="タグ入力してEnter"
                    className="flex-1 min-w-[120px] bg-transparent text-xs font-medium focus:outline-none px-1"
                  />
                </div>
              </div>

              {/* ピン留め & 公開期間 */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="editPinned" className="text-xs font-bold text-slate-700 flex items-center gap-2 cursor-pointer">
                    <Pin className="w-4 h-4 text-amber-500" />
                    トップにピン留め表示する
                  </label>
                  <input
                    type="checkbox"
                    id="editPinned"
                    checked={editIsPinned}
                    onChange={e => setEditIsPinned(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </div>

                {editIsPinned && (
                  <div className="pt-2 border-t border-slate-200">
                    <label className="block text-[11px] font-bold text-slate-700 mb-1.5">
                      ピン留め期間
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setEditPinnedPeriod('1week')}
                        className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition-all text-center cursor-pointer ${
                          editPinnedPeriod === '1week'
                            ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        1週間
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditPinnedPeriod('1month')}
                        className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition-all text-center cursor-pointer ${
                          editPinnedPeriod === '1month'
                            ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        1ヶ月
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditPinnedPeriod('forever')}
                        className={`py-1.5 px-2 rounded-lg border text-xs font-bold transition-all text-center cursor-pointer ${
                          editPinnedPeriod === 'forever'
                            ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                        }`}
                      >
                        期限なし
                      </button>
                    </div>
                  </div>
                )}

                <div className="pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="editPeriod" className="text-xs font-bold text-slate-700 flex items-center gap-2 cursor-pointer">
                      <CalendarIcon className="w-4 h-4 text-indigo-500" />
                      公開期間を設定する
                    </label>
                    <input
                      type="checkbox"
                      id="editPeriod"
                      checked={editHasPeriod}
                      onChange={e => setEditHasPeriod(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                    />
                  </div>
                  {editHasPeriod && (
                    <div className="grid grid-cols-2 gap-2 pt-1">
                      <input
                        type="date"
                        value={editStartDate}
                        onChange={e => setEditStartDate(e.target.value)}
                        className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                      <input
                        type="date"
                        value={editEndDate}
                        onChange={e => setEditEndDate(e.target.value)}
                        className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs"
                      />
                    </div>
                  )}
                </div>

                {/* アンケート設定編集（新規追加・既存編集対応） */}
                <div className="pt-2 border-t border-slate-200">
                  <div className="flex items-center justify-between mb-2">
                    <label htmlFor="editPollToggle" className="text-xs font-bold text-sky-900 flex items-center gap-1.5 cursor-pointer">
                      <BarChart2 className="w-4 h-4 text-sky-600" />
                      アンケート / 意思決定投票を設定する
                    </label>
                    <input
                      type="checkbox"
                      id="editPollToggle"
                      checked={editHasPoll}
                      onChange={e => setEditHasPoll(e.target.checked)}
                      className="w-4 h-4 rounded border-sky-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
                    />
                  </div>

                  {editHasPoll && (
                    <div className="p-3 bg-sky-50/70 border border-sky-200 rounded-xl space-y-3 mt-2">
                      {/* 選択肢リスト */}
                      <div>
                        <div className="flex items-center justify-between mb-1.5">
                          <label className="text-xs font-bold text-sky-900">
                            選択肢（最低2つ）<span className="text-red-500">*</span>
                          </label>
                          <span className="text-[10px] text-sky-600">
                            理由コメント必須化設定可能
                          </span>
                        </div>
                        <div className="space-y-1.5">
                          {editPollOptions.map((opt, idx) => (
                            <div key={opt.id} className="p-2 bg-white rounded-lg border border-sky-200/80 shadow-2xs space-y-1.5">
                              <div className="flex items-center gap-1.5">
                                <span className="w-4 h-4 rounded-full bg-sky-100 text-sky-700 text-[10px] font-bold flex items-center justify-center shrink-0">
                                  {idx + 1}
                                </span>
                                <input
                                  type="text"
                                  value={opt.text}
                                  onChange={e => handleUpdateEditOptionText(opt.id, e.target.value)}
                                  placeholder="選択肢を入力..."
                                  className="flex-1 px-2.5 py-1 bg-slate-50 border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-sky-500"
                                />
                                {editPollOptions.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveEditOption(opt.id)}
                                    className="p-1 text-slate-400 hover:text-red-500 rounded cursor-pointer"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                              <div className="flex items-center justify-between pl-6 pr-1">
                                <label className="flex items-center gap-1.5 cursor-pointer select-none text-[10px] text-slate-600 hover:text-slate-900">
                                  <input
                                    type="checkbox"
                                    checked={opt.requireComment}
                                    onChange={() => handleToggleEditOptionRequireComment(opt.id)}
                                    className="w-3 h-3 rounded text-amber-600 focus:ring-amber-500 border-slate-300 cursor-pointer"
                                  />
                                  <span>⚠️ 選択時に理由コメントを必須にする</span>
                                </label>
                                {opt.requireComment && (
                                  <span className="text-[9px] bg-amber-100 text-amber-800 font-bold px-1 rounded">
                                    理由必須
                                  </span>
                                )}
                              </div>
                            </div>
                          ))}
                        </div>
                        {editPollOptions.length === 0 && (
                          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs space-y-2 mb-2">
                            <p className="text-amber-800 font-semibold">
                              選択肢が未設定です。既存の投票データ（{topic.poll?.votes?.length || 0}件）に対応する選択肢を自動復元できます。
                            </p>
                            <button
                              type="button"
                              onClick={() => setEditPollOptions(getRestoredPollOptions(topic.poll))}
                              className="px-3 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              既存の投票データから選択肢を復元する
                            </button>
                          </div>
                        )}
                        {editPollOptions.length < 10 && (
                          <button
                            type="button"
                            onClick={handleAddEditOption}
                            className="mt-1.5 w-full py-1.5 bg-white hover:bg-sky-100/60 border border-dashed border-sky-300 text-sky-700 text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            選択肢を追加
                          </button>
                        )}
                      </div>

                      {/* 期限 & 自動ピン留め */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2 border-t border-sky-200/70">
                        <div>
                          <label className="block text-[11px] font-bold text-sky-950 mb-1">
                            回答期限日（JST）<span className="text-red-500">*</span>
                          </label>
                          <input
                            type="date"
                            value={editPollDeadline}
                            onChange={e => setEditPollDeadline(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-sky-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-sky-500"
                          />
                        </div>
                        <div className="flex items-center pt-2 sm:pt-4">
                          <label className="flex items-center gap-1.5 cursor-pointer select-none text-xs font-semibold text-sky-950">
                            <input
                              type="checkbox"
                              checked={editPollAutoPin}
                              onChange={e => setEditPollAutoPin(e.target.checked)}
                              className="w-4 h-4 rounded text-sky-600 focus:ring-sky-500 border-sky-300 cursor-pointer"
                            />
                            <span>📌 回答期限まで自動ピン留め</span>
                          </label>
                        </div>
                      </div>

                      {/* 複数選択 & 匿名設定 */}
                      <div className="pt-2 border-t border-sky-200/70 flex flex-wrap gap-4 text-xs font-medium text-sky-950">
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editPollAllowMultiple}
                            onChange={e => setEditPollAllowMultiple(e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-sky-600 focus:ring-sky-500 border-sky-300 cursor-pointer"
                          />
                          <span>複数選択許可</span>
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={editPollIsAnonymous}
                            onChange={e => setEditPollIsAnonymous(e.target.checked)}
                            className="w-3.5 h-3.5 rounded text-sky-600 focus:ring-sky-500 border-sky-300 cursor-pointer"
                          />
                          <span>匿名投票</span>
                        </label>
                      </div>
                    </div>
                  )}
                </div>
              </div>

              {/* 添付ファイル */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <Paperclip className="w-4 h-4 text-slate-500" />
                    添付ファイル
                  </label>
                  <button
                    type="button"
                    disabled={isEditingUploading}
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 disabled:opacity-50"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    追加
                  </button>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                  multiple
                  className="hidden"
                />

                <div
                  onDragOver={handleEditingDragOver}
                  onDragLeave={handleEditingDragLeave}
                  onDrop={handleEditingDrop}
                  className={`relative rounded-xl transition-all ${
                    isEditingDraggingOver
                      ? 'border-2 border-dashed border-indigo-500 bg-indigo-50/80 p-3 text-center ring-2 ring-indigo-300'
                      : ''
                  }`}
                >
                  {isEditingDraggingOver ? (
                    <div className="flex flex-col items-center justify-center gap-1 text-indigo-700 pointer-events-none py-1">
                      <UploadCloud className="w-5 h-5 animate-bounce text-indigo-600" />
                      <p className="text-xs font-bold">ここにファイルをドロップして添付</p>
                    </div>
                  ) : (
                    <>
                      {isEditingUploading && (
                        <div className="flex items-center gap-2 p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-500 mb-1.5">
                          <Loader2 className="w-4 h-4 text-indigo-500 animate-spin" />
                          <span>ファイルをアップロード中...</span>
                        </div>
                      )}

                      <div className="space-y-1.5">
                        {editAttachments.map((att, attIdx) => (
                          <div key={att.id || att.url || `edit-att-${attIdx}`} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                            <span className="font-semibold text-slate-700 truncate">{att.name}</span>
                            <button
                              type="button"
                              disabled={isEditingUploading}
                              onClick={() => {
                                const target = att;
                                // UI状態から即座に取り除く (レスポンス待ちによる保存データの競合を防ぐ)
                                setEditAttachments(prev => prev.filter(a => {
                                  if (target.id && a.id) return a.id !== target.id;
                                  if (target.url && a.url) return a.url !== target.url;
                                  return a.name !== target.name;
                                }));
                                if (target.url) {
                                  deleteAttachmentFile(target.url).catch(err => console.error('Attachment delete file error:', err));
                                }
                              }}
                              className="text-slate-400 hover:text-red-600 p-0.5 disabled:opacity-50"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                        {!isEditingUploading && (
                          <div
                            onClick={() => !isEditingUploading && fileInputRef.current?.click()}
                            className="p-2 border border-dashed border-slate-200 hover:border-indigo-400 hover:bg-indigo-50/30 rounded-lg text-center cursor-pointer transition-all bg-slate-50/50"
                          >
                            <p className="text-xs text-slate-500 font-medium flex items-center justify-center gap-1">
                              <UploadCloud className="w-3.5 h-3.5 text-indigo-500" />
                              ドラッグ＆ドロップまたはクリックでファイルを添付
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isEditingUploading}
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl disabled:opacity-50"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  disabled={isEditingUploading}
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs flex items-center gap-1.5 disabled:opacity-50"
                >
                  {isEditingUploading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Save className="w-3.5 h-3.5" />
                  )}
                  {isEditingUploading ? 'ファイル処理中...' : '更新内容を保存'}
                </button>
              </div>
            </form>
          ) : (
            /* STANDARD VIEW MODE */
            <>
              {/* Metadata Badges */}
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                  <Building2 className="w-3.5 h-3.5 text-slate-500" />
                  拠点: {topic.office || '全社'}
                </span>
                <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-lg">
                  <Users className="w-3.5 h-3.5 text-slate-500" />
                  部署: {topic.division || '全部署'}
                </span>

                {topic.isStrictScope && (
                  <span className="inline-flex items-center gap-1 text-xs font-bold px-2.5 py-1 bg-rose-50 text-rose-800 border border-rose-200 rounded-lg" title="指定拠点・部署以外のユーザーには限定非表示">
                    <Lock className="w-3.5 h-3.5 text-rose-600" />
                    公開範囲限定
                  </span>
                )}

                {topic.hasPeriod && topic.startDate && topic.endDate && (
                  <span className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 bg-amber-50 text-amber-800 border border-amber-200 rounded-lg">
                    <CalendarIcon className="w-3.5 h-3.5 text-amber-600" />
                    公開期間: {topic.startDate} ～ {topic.endDate}
                  </span>
                )}

                {topic.tags && topic.tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-0.5 text-xs font-semibold px-2.5 py-1 bg-indigo-50 text-indigo-700 rounded-lg border border-indigo-100"
                  >
                    <Tag className="w-3 h-3 text-indigo-500" />
                    #{tag}
                  </span>
                ))}
              </div>

              {activeTab === 'content' ? (
                <>
                  {/* Content Text */}
                  <div className="text-sm text-slate-800 leading-relaxed whitespace-pre-wrap bg-slate-50/50 p-4 rounded-xl border border-slate-200/80 min-h-[120px]">
                    {renderContentWithLinks(topic.content)}
                  </div>

                  {/* Attachments Section */}
                  {topic.attachments && topic.attachments.length > 0 && (
                    <div className="space-y-2 pt-2 border-t border-slate-100">
                      <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Paperclip className="w-4 h-4 text-indigo-500" />
                        添付ファイル ({topic.attachments.length})
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        {topic.attachments.map(att => (
                          <div
                            key={att.id}
                            className="flex items-center justify-between p-3 bg-white border border-slate-200 hover:border-indigo-300 rounded-xl transition-all"
                          >
                            <div className="flex items-center gap-2 min-w-0 pr-2">
                              <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                              <div className="min-w-0">
                                <div className="text-xs font-bold text-slate-800 truncate">{att.name}</div>
                                <div className="text-[10px] text-slate-400">{att.size}</div>
                              </div>
                            </div>
                            <div className="flex items-center gap-1.5 shrink-0">
                              {isPreviewable(att.name, att.type) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewFile({ ...att, url: resolveFileUrl(att.url) });
                                    setIsPreviewOpen(true);
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer"
                                >
                                  プレビュー
                                </button>
                              )}
                              <a
                                href={resolveFileUrl(att.url) || '#'}
                                download={att.name}
                                onClick={(e) => {
                                  if (!att.url) {
                                    e.preventDefault();
                                    setConfirmModal({
                                      isOpen: true,
                                      title: 'ファイルダウンロード',
                                      message: `ファイル「${att.name}」のダウンロードを開始します。`,
                                      type: 'info',
                                      confirmText: 'OK'
                                    });
                                  }
                                }}
                                className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shrink-0"
                              >
                                ダウンロード
                              </a>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Poll / Survey Section */}
                  {topic.poll && (
                    (() => {
                      const poll = topic.poll;
                      const votes = poll.votes || [];
                      const totalVotes = votes.length;
                      const myVote = votes.find(v => String(v.userId) === String(currentUser?.id));
                      const hasVoted = !!myVote;

                      // 期限判定
                      const deadlineMs = poll.deadline ? getPollDeadlineMs(poll.deadline) : NaN;
                      const isExpired = !isNaN(deadlineMs) && Date.now() > deadlineMs;
                      const remainingDays = !isNaN(deadlineMs) && !isExpired
                        ? Math.max(1, Math.ceil((deadlineMs - Date.now()) / (1000 * 60 * 60 * 24)))
                        : 0;

                      // 選択肢の安全な取得（万一optionsが欠落または空でも、votesまたはデフォルトから復元）
                      const safeOptions = getRestoredPollOptions(poll);

                      // 選択中の選択肢の中に理由コメント必須のものがあるか
                      const selectedOptions = safeOptions.filter(o => selectedPollOptionIds.includes(o.id));
                      const isCommentRequired = selectedOptions.some(o => o.requireComment);
                      const requiredCommentOption = selectedOptions.find(o => o.requireComment);

                      // 投票モードか結果表示モードか
                      const showVotingForm = (!hasVoted || isChangingVote) && !isExpired;

                      // 選択肢ごとの得票集計
                      const optionStats = safeOptions.map(opt => {
                        const optVotes = votes.filter(v => (v.selectedOptionIds || []).includes(opt.id));
                        const count = optVotes.length;
                        const percent = totalVotes > 0 ? Math.round((count / totalVotes) * 100) : 0;
                        const isMySelection = myVote ? (myVote.selectedOptionIds || []).includes(opt.id) : false;
                        return {
                          ...opt,
                          count,
                          percent,
                          isMySelection,
                          voters: optVotes,
                        };
                      });

                      // 理由コメントがある投票一覧
                      const votesWithComments = votes.filter(v => v.comment && v.comment.trim().length > 0);

                      const handleOptionSelect = (optionId: string) => {
                        if (poll.allowMultiple) {
                          if (selectedPollOptionIds.includes(optionId)) {
                            setSelectedPollOptionIds(selectedPollOptionIds.filter(id => id !== optionId));
                          } else {
                            setSelectedPollOptionIds([...selectedPollOptionIds, optionId]);
                          }
                        } else {
                          setSelectedPollOptionIds([optionId]);
                        }
                      };

                      return (
                        <div className="p-4 sm:p-5 bg-gradient-to-br from-sky-50/70 via-indigo-50/40 to-white rounded-2xl border-2 border-sky-200/90 shadow-xs space-y-4">
                          {/* アンケートヘッダー */}
                          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sky-100 pb-3">
                            <div className="flex items-center gap-2">
                              <div className="p-2 bg-sky-500 text-white rounded-xl shadow-xs">
                                <BarChart2 className="w-5 h-5" />
                              </div>
                              <div>
                                <h4 className="text-sm font-bold text-slate-800 flex items-center gap-1.5">
                                  <span>{poll.title || (poll as any).question || 'アンケート / 意思決定投票'}</span>
                                  {poll.allowMultiple && (
                                    <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded">
                                      複数選択可
                                    </span>
                                  )}
                                  {poll.isAnonymous && (
                                    <span className="text-[10px] bg-slate-100 text-slate-600 font-bold px-1.5 py-0.5 rounded">
                                      匿名投票
                                    </span>
                                  )}
                                </h4>
                                <div className="text-[11px] text-slate-500 flex items-center gap-2 mt-0.5">
                                  <span>回答総数: <strong className="text-slate-800">{totalVotes}名</strong></span>
                                  {poll.deadline && (
                                    <span className={`flex items-center gap-1 font-semibold ${isExpired ? 'text-slate-500' : 'text-sky-700'}`}>
                                      <Clock className="w-3.5 h-3.5" />
                                      {isExpired
                                        ? `期限終了 (${poll.deadline})`
                                        : `期限: 〜${poll.deadline}（あと${remainingDays}日）`}
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* 自動ピン留め・ステータスバッジ */}
                            <div className="flex items-center gap-1.5">
                              {poll.autoPinUntilDeadline && !isExpired && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-100/80 text-amber-900 text-[11px] font-bold rounded-lg border border-amber-200 shadow-2xs">
                                  <Pin className="w-3.5 h-3.5 text-amber-700" />
                                  回答期限まで自動固定
                                </span>
                              )}
                              {hasVoted && !showVotingForm && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-100 text-emerald-800 text-[11px] font-bold rounded-lg border border-emerald-200">
                                  <Check className="w-3.5 h-3.5" />
                                  回答済み
                                </span>
                              )}
                              {isExpired && (
                                <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-slate-200 text-slate-700 text-[11px] font-bold rounded-lg">
                                  受付終了
                                </span>
                              )}
                            </div>
                          </div>

                          {/* フィードバック / エラー表示 */}
                          {pollFeedback && (
                            <div className="p-2.5 bg-emerald-50 border border-emerald-200 text-emerald-700 text-xs rounded-xl font-bold flex items-center gap-1.5">
                              <CheckCircle2 className="w-4 h-4" />
                              {pollFeedback}
                            </div>
                          )}
                          {pollError && (
                            <div className="p-2.5 bg-red-50 border border-red-200 text-red-600 text-xs rounded-xl font-bold flex items-center gap-1.5">
                              <AlertCircle className="w-4 h-4" />
                              {pollError}
                            </div>
                          )}

                          {/* 投票受付フォーム */}
                          {showVotingForm ? (
                            <div className="space-y-3.5">
                              <div className="text-xs font-bold text-slate-700">
                                {hasVoted ? '回答を変更する選択肢を選んでください：' : 'あなたの意見を選択してください：'}
                              </div>

                              <div className="space-y-2">
                                {safeOptions.map((opt) => {
                                  const isSelected = selectedPollOptionIds.includes(opt.id);
                                  return (
                                    <label
                                      key={opt.id}
                                      onClick={() => handleOptionSelect(opt.id)}
                                      className={`flex items-start gap-3 p-3 rounded-xl border transition-all cursor-pointer select-none ${
                                        isSelected
                                          ? 'bg-sky-500/10 border-sky-500 text-sky-950 ring-2 ring-sky-300 shadow-xs'
                                          : 'bg-white border-slate-200 hover:border-sky-300 text-slate-800'
                                      }`}
                                    >
                                      <input
                                        type={poll.allowMultiple ? 'checkbox' : 'radio'}
                                        name="poll-option"
                                        checked={isSelected}
                                        onChange={() => {}}
                                        className="w-4 h-4 text-sky-600 focus:ring-sky-500 border-slate-300 cursor-pointer mt-0.5 shrink-0"
                                      />
                                      <div className="flex-1">
                                        <div className="text-xs font-bold flex items-center gap-1.5">
                                          <span>{opt.text}</span>
                                          {opt.requireComment && (
                                            <span className="text-[10px] px-1.5 py-0.5 bg-amber-100 text-amber-800 font-bold rounded">
                                              理由コメント必須
                                            </span>
                                          )}
                                        </div>
                                      </div>
                                    </label>
                                  );
                                })}
                              </div>

                              {/* 理由コメント入力欄（理由必須選択肢または任意コメント） */}
                              <div className={`p-3 rounded-xl border transition-all space-y-1.5 ${
                                isCommentRequired
                                  ? 'bg-amber-50/70 border-amber-300 text-amber-900'
                                  : 'bg-white border-slate-200'
                              }`}>
                                <div className="flex items-center justify-between">
                                  <label className="text-xs font-bold flex items-center gap-1.5">
                                    {isCommentRequired ? (
                                      <>
                                        <AlertCircle className="w-3.5 h-3.5 text-amber-600" />
                                        <span className="text-amber-900">
                                          「{requiredCommentOption?.text}」の理由・背景をご記入ください <span className="text-red-500">*</span>
                                        </span>
                                      </>
                                    ) : (
                                      <span className="text-slate-700">理由・コメント（任意）</span>
                                    )}
                                  </label>
                                  {isCommentRequired && (
                                    <span className="text-[10px] font-bold text-amber-700">記入必須</span>
                                  )}
                                </div>
                                <textarea
                                  rows={2}
                                  value={pollComment}
                                  onChange={e => setPollComment(e.target.value)}
                                  placeholder={isCommentRequired ? "理由や懸念点、対案を具体的に記入してください..." : "投票に添えるコメントや補足があれば記入してください（任意）"}
                                  className={`w-full px-3 py-2 bg-white rounded-lg text-xs focus:outline-none focus:ring-2 resize-none ${
                                    isCommentRequired
                                      ? 'border border-amber-300 focus:ring-amber-500 text-slate-800'
                                      : 'border border-slate-200 focus:ring-sky-500 text-slate-800'
                                  }`}
                                />
                              </div>

                              {/* アクションボタン */}
                              <div className="flex items-center justify-end gap-2 pt-1">
                                {isChangingVote && (
                                  <button
                                    type="button"
                                    onClick={() => {
                                      setIsChangingVote(false);
                                      if (myVote) {
                                        setSelectedPollOptionIds(myVote.selectedOptionIds || []);
                                        setPollComment(myVote.comment || '');
                                      }
                                    }}
                                    className="px-3.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                                  >
                                    変更をキャンセル
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={isVoting || selectedPollOptionIds.length === 0 || (isCommentRequired && !pollComment.trim())}
                                  onClick={handleVote}
                                  className="px-5 py-2 bg-sky-600 hover:bg-sky-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-[0.98] flex items-center gap-1.5 cursor-pointer"
                                >
                                  {isVoting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                                  {isVoting ? '送信中...' : (hasVoted ? '投票内容を更新する' : '投票を送信する')}
                                </button>
                              </div>
                            </div>
                          ) : (
                            /* 集計結果表示モード */
                            <div className="space-y-4">
                              <div className="space-y-2.5">
                                {optionStats.map((opt) => (
                                  <div
                                    key={opt.id}
                                    className={`p-3 rounded-xl border transition-all ${
                                      opt.isMySelection
                                        ? 'bg-sky-50/80 border-sky-400 shadow-2xs ring-1 ring-sky-300'
                                        : 'bg-white border-slate-200'
                                    }`}
                                  >
                                    <div className="flex items-center justify-between text-xs mb-1.5">
                                      <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                        <span>{opt.text}</span>
                                        {opt.isMySelection && (
                                          <span className="px-1.5 py-0.5 bg-sky-500 text-white text-[10px] rounded font-bold">
                                            あなたの回答
                                          </span>
                                        )}
                                      </div>
                                      <div className="font-bold text-slate-700 flex items-center gap-1">
                                        <span className="text-sky-700 text-sm font-extrabold">{opt.percent}%</span>
                                        <span className="text-slate-400 text-[11px]">({opt.count}票)</span>
                                      </div>
                                    </div>

                                    {/* プログレスバー */}
                                    <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden border border-slate-200/60">
                                      <div
                                        style={{ width: `${opt.percent}%` }}
                                        className={`h-full transition-all duration-500 rounded-full ${
                                          opt.isMySelection ? 'bg-sky-500' : 'bg-slate-400'
                                        }`}
                                      />
                                    </div>

                                    {/* 投票者アバター一覧（実名投票の場合） */}
                                    {!poll.isAnonymous && opt.voters.length > 0 && (
                                      <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-slate-100">
                                        <span className="text-[10px] text-slate-400 font-semibold mr-1">投票者:</span>
                                        {opt.voters.map((v, vIdx) => (
                                          <div
                                            key={v.id || `voter-${vIdx}`}
                                            className="flex items-center gap-1 bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded-full text-[10px] text-slate-700 font-medium transition-colors"
                                            title={`${v.userName}${v.comment ? ` : 「${v.comment}」` : ''}`}
                                          >
                                            <img
                                              src={getAvatarUrl(v.userAvatarUrl)}
                                              alt={v.userName}
                                              onError={handleAvatarError}
                                              className="w-4 h-4 rounded-full object-cover"
                                            />
                                            <span>{v.userName}</span>
                                          </div>
                                        ))}
                                      </div>
                                    )}
                                  </div>
                                ))}
                              </div>

                              {/* 投票された理由コメント一覧 */}
                              {votesWithComments.length > 0 && (
                                <div className="p-3.5 bg-white rounded-xl border border-sky-100 shadow-2xs space-y-2">
                                  <div className="text-xs font-bold text-slate-700 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                      <MessageSquare className="w-3.5 h-3.5 text-sky-600" />
                                      投票者の理由・意見コメント ({votesWithComments.length}件)
                                    </span>
                                  </div>
                                  <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                                    {votesWithComments.map((v) => {
                                      const chosenTexts = (v.selectedOptionIds || [])
                                        .map(id => safeOptions.find(o => o.id === id)?.text)
                                        .filter(Boolean)
                                        .join(', ');
                                      return (
                                        <div key={v.id} className="p-2.5 bg-slate-50 border border-slate-200/70 rounded-lg text-xs space-y-1">
                                          <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-1.5 font-bold text-slate-800">
                                              {!poll.isAnonymous ? (
                                                <>
                                                  <img
                                                    src={getAvatarUrl(v.userAvatarUrl)}
                                                    alt={v.userName}
                                                    onError={handleAvatarError}
                                                    className="w-4 h-4 rounded-full object-cover"
                                                  />
                                                  <span>{v.userName}</span>
                                                </>
                                              ) : (
                                                <span className="text-slate-500 font-semibold">匿名メンバー</span>
                                              )}
                                              <span className="text-[10px] font-bold text-sky-700 bg-sky-100 px-1.5 py-0.2 rounded">
                                                {chosenTexts || '選択'}
                                              </span>
                                            </div>
                                            <span className="text-[10px] text-slate-400">
                                              {v.votedAt ? new Date(v.votedAt).toLocaleDateString('ja-JP') : ''}
                                            </span>
                                          </div>
                                          <p className="text-slate-700 pl-5 whitespace-pre-wrap leading-relaxed">
                                            {v.comment}
                                          </p>
                                        </div>
                                      );
                                    })}
                                  </div>
                                </div>
                              )}

                              {/* 回答変更ボタン（期限内かつ投票済みの場合） */}
                              {!isExpired && hasVoted && (
                                <div className="flex justify-end pt-1">
                                  <button
                                    type="button"
                                    onClick={() => setIsChangingVote(true)}
                                    className="px-4 py-1.5 bg-white hover:bg-sky-50 border border-sky-300 text-sky-700 text-xs font-bold rounded-xl transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                                  >
                                    <Edit3 className="w-3.5 h-3.5" />
                                    回答を変更・再投票する
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })()
                  )}

                  {/* Comments Section */}
                  <div className="pt-4 border-t border-slate-200 space-y-4">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4 text-indigo-600" />
                      コメント ({topic.comments?.length || 0})
                    </h3>

                    {/* Comment List */}
                    <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                      {topic.comments && topic.comments.length > 0 ? (
                        topic.comments.map(c => (
                          <div key={c.id} className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl text-xs space-y-1.5">
                            <div className="flex items-center justify-between">
                              <div 
                                onClick={() => c.author && triggerOpenUserModal(c.author)}
                                className="flex items-center gap-2 cursor-pointer hover:opacity-80 transition-opacity"
                                title={`${c.author.name}のプロフィールを表示`}
                              >
                                <img
                                  src={getAvatarUrl(c.author?.id === currentUser?.id ? (currentUser?.avatarUrl || c.author?.avatarUrl) : c.author?.avatarUrl)}
                                  alt={c.author?.name}
                                  onError={handleAvatarError}
                                  className="w-6 h-6 rounded-full border border-slate-200 object-cover"
                                />
                                <span className="font-bold text-slate-800 hover:text-indigo-600 transition-colors">{c.author.name}</span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(c.createdAt).toLocaleString('ja-JP')}
                                </span>
                              </div>
                              {(c.author.id === currentUser.id || isAdmin) && (
                                <button
                                  type="button"
                                  onClick={() => confirmDeleteComment(c.id)}
                                  className="text-slate-400 hover:text-red-600 transition-colors"
                                  title="コメントを削除"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                            <div className="text-slate-700 whitespace-pre-wrap pl-8">
                              {renderContentWithLinks(c.content)}
                            </div>

                            {/* コメント添付ファイル一覧 */}
                            {c.attachments && c.attachments.length > 0 && (
                              <div className="pl-8 pt-2 flex flex-wrap gap-2">
                                {c.attachments.map(att => (
                                  <div
                                    key={att.id}
                                    className="inline-flex items-center gap-1.5 px-2 py-1 bg-white border border-slate-200 rounded-lg text-[10px]"
                                  >
                                    <Paperclip className="w-3 h-3 text-slate-400 shrink-0" />
                                    <span className="font-semibold text-slate-600 truncate max-w-[150px]">{att.name}</span>
                                    <div className="flex gap-1 border-l border-slate-200 pl-1.5 ml-1.5 shrink-0 font-bold">
                                      {isPreviewable(att.name, att.type) && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPreviewFile({ ...att, url: resolveFileUrl(att.url) });
                                            setIsPreviewOpen(true);
                                          }}
                                          className="text-emerald-600 hover:text-emerald-800 cursor-pointer"
                                        >
                                          プレビュー
                                        </button>
                                      )}
                                      <a
                                        href={resolveFileUrl(att.url) || '#'}
                                        download={att.name}
                                        onClick={(e) => {
                                          if (!att.url) {
                                            e.preventDefault();
                                            setConfirmModal({
                                              isOpen: true,
                                              title: 'ファイルダウンロード',
                                              message: `ファイル「${att.name}」のダウンロードを開始します。`,
                                              type: 'info',
                                              confirmText: 'OK'
                                            });
                                          }
                                        }}
                                        className="text-indigo-600 hover:text-indigo-800"
                                      >
                                        DL
                                      </a>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                          まだコメントはありません。最初のコメントを投稿しましょう。
                        </div>
                      )}
                    </div>

                    {/* Comment Input Container with D&D */}
                    <div
                      onDragOver={handleCommentDragOver}
                      onDragLeave={handleCommentDragLeave}
                      onDrop={handleCommentDrop}
                      className={`relative rounded-xl transition-all ${
                        isCommentDraggingOver
                          ? 'border-2 border-dashed border-indigo-500 bg-indigo-50/90 p-3 ring-2 ring-indigo-300'
                          : ''
                      }`}
                    >
                      {isCommentDraggingOver ? (
                        <div className="flex items-center justify-center gap-2 text-indigo-700 pointer-events-none py-1.5">
                          <UploadCloud className="w-5 h-5 animate-bounce text-indigo-600" />
                          <p className="text-xs font-bold">ここにファイルをドロップしてコメントに添付</p>
                        </div>
                      ) : (
                        <>
                          {/* Comment Attachments Preview */}
                          {commentAttachments.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 p-2 bg-slate-50 border border-slate-200 rounded-xl mb-2">
                              {commentAttachments.map(att => (
                                <div
                                  key={att.id}
                                  className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white border border-slate-200 rounded-lg text-xs font-semibold"
                                >
                                  <Paperclip className="w-3.5 h-3.5 text-slate-400" />
                                  <span className="text-slate-700 truncate max-w-[150px]">{att.name}</span>
                                  <button
                                    type="button"
                                    onClick={() => setCommentAttachments(commentAttachments.filter(a => a.id !== att.id))}
                                    className="text-slate-400 hover:text-red-500 font-bold ml-1 transition-colors"
                                  >
                                    <X className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}

                          {isCommentUploading && (
                            <div className="flex items-center gap-1.5 text-xs text-slate-500 font-semibold p-1 mb-1">
                              <Loader2 className="w-3.5 h-3.5 text-indigo-500 animate-spin" />
                              <span>ファイルアップロード中...</span>
                            </div>
                          )}

                          {/* Comment Input */}
                          <form onSubmit={handleAddComment} className="flex gap-2 items-center relative">
                            <UrlPastePopup
                              prompt={commentPasteHandler.pastePrompt}
                              onInsertCard={commentPasteHandler.handleInsertCard}
                              onKeepPlain={commentPasteHandler.handleKeepPlain}
                              onClose={commentPasteHandler.closePrompt}
                              positionClass="bottom-full mb-2 left-0"
                            />
                            <button
                              type="button"
                              disabled={isCommentUploading}
                              onClick={() => commentFileInputRef.current?.click()}
                              className="p-2.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded-xl border border-slate-200 transition-colors shrink-0 disabled:opacity-50"
                              title="ファイルを添付（ドラッグ＆ドロップ可）"
                            >
                              <Paperclip className="w-4 h-4" />
                            </button>
                            <input
                              type="file"
                              ref={commentFileInputRef}
                              onChange={handleCommentFileChange}
                              multiple
                              className="hidden"
                            />
                            <input
                              type="text"
                              placeholder="コメントを入力... (ファイルをドラッグ＆ドロップ可)"
                              value={commentText}
                              onChange={e => setCommentText(e.target.value)}
                              onPaste={commentPasteHandler.handlePaste}
                              className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                            />
                            <button
                              type="submit"
                              disabled={((!commentText || !commentText.trim()) && commentAttachments.length === 0) || isCommentUploading}
                              className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0"
                            >
                              <Send className="w-3.5 h-3.5" />
                              送信
                            </button>
                          </form>
                        </>
                      )}
                    </div>
                  </div>
                </>
              ) : (
                /* Viewers Tab */
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-bold text-slate-800 flex items-center gap-2">
                      <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                      閲覧者一覧（既読メンバー）
                    </h3>
                    <span className="text-xs text-slate-500 font-semibold">
                      合計 {viewersList.length} 名が確認済み
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pr-1">
                    {viewersList.map((v, idx) => (
                      <div
                        key={v.user?.id || idx}
                        onClick={() => v.user && triggerOpenUserModal(v.user)}
                        className="flex items-center justify-between p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-300 rounded-xl text-xs cursor-pointer transition-colors group/viewer"
                        title={`${v.user?.name || ''}のプロフィールを表示`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <img
                            src={getAvatarUrl(v.user?.id === currentUser?.id ? (currentUser?.avatarUrl || v.user?.avatarUrl) : v.user?.avatarUrl)}
                            alt={v.user?.name || ''}
                            onError={handleAvatarError}
                            className="w-8 h-8 rounded-full border border-slate-200 object-cover group-hover/viewer:border-indigo-400 shrink-0"
                          />
                          <div className="min-w-0">
                            <div className="font-bold text-slate-800 group-hover/viewer:text-indigo-600 transition-colors truncate">{v.user?.name || 'メンバー'}</div>
                            <div className="text-[10px] text-slate-500 truncate">
                              {v.user?.office || ''} {v.user?.division || ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200 shrink-0 ml-2">
                          {v.viewedAt ? `${new Date(v.viewedAt).toLocaleDateString('ja-JP')} ${new Date(v.viewedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}` : ''}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal(prev => ({ ...prev, isOpen: false }))}
      />

      <FilePreviewModal
        isOpen={isPreviewOpen}
        onClose={() => setIsPreviewOpen(false)}
        file={previewFile}
      />
    </div>
  );
}
