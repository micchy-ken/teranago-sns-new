import React, { useState, useEffect, useRef } from 'react';
import { X, MessageSquare, Eye, Pin, Paperclip, Calendar as CalendarIcon, Send, Trash2, Building2, Users, Tag, CheckCircle2, Edit3, Save, Plus, Loader2, Eye as EyeIcon, Download, UploadCloud, Share2, Check } from 'lucide-react';
import { BoardTopic, User, OfficeMaster, DivisionMaster, AttachmentFile } from '../types';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import { getAvatarUrl } from '../utils/avatar';
import { uploadMultipleFiles, deleteAttachmentFile, deleteAttachmentFiles, resolveFileUrl } from '../utils/fileUpload';
import { FilePreviewModal } from './FilePreviewModal';
import { renderContentWithLinks } from '../utils/renderContentWithLinks';
import { UrlPastePopup, useUrlPasteHandler } from './common/UrlPastePopup';
import { markTopicAsRead } from '../utils/notifications';
import { triggerOpenUserModal } from '../utils/userModal';
import { buildAppUrl, copyTextToClipboard } from '../utils/urlParams';

interface TopicDetailModalProps {
  topic: BoardTopic | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUpdateTopic: (updatedTopic: BoardTopic) => void;
  onDeleteTopic?: (topicId: string) => void;
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
}

export function TopicDetailModal({
  topic,
  isOpen,
  onClose,
  currentUser,
  onUpdateTopic,
  onDeleteTopic,
  offices = [],
  divisions = [],
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
  const [editIsPinned, setEditIsPinned] = useState(false);
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

  // モーダルが開かれた時に自動的に既読（閲覧メンバー）を記録、及び編集用フォーム初期化
  useEffect(() => {
    if (isOpen && topic) {
      if (currentUser?.id) {
        markTopicAsRead(currentUser.id, topic.id);
      }
      setIsEditing(false);
      setEditTitle(topic.title);
      setEditContent(topic.content);
      setEditOffice(topic.office || '全社');
      setEditDivision(topic.division || '全部署');
      setEditIsPinned(!!topic.isPinned);
      setEditHasPeriod(!!topic.hasPeriod);
      setEditStartDate(topic.startDate || '');
      setEditEndDate(topic.endDate || '');
      setEditTags(topic.tags || []);
      setEditAttachments(topic.attachments || []);
      setCommentAttachments([]);
      setIsCommentUploading(false);
      setIsEditingUploading(false);

      const isAlreadyViewer = topic.viewers?.some(v => v.user.id === currentUser.id);
      if (!isAlreadyViewer) {
        const newViewers = [
          ...(topic.viewers || []),
          { user: currentUser, viewedAt: new Date().toISOString() }
        ];
        const updatedTopic: BoardTopic = {
          ...topic,
          views: topic.views + 1,
          viewers: newViewers,
        };
        onUpdateTopic(updatedTopic);
      }
    }
  }, [isOpen, topic?.id]);

  if (!isOpen || !topic) return null;

  const isAuthor = 
    topic.author.id === currentUser.id || 
    (topic.author.loginId && currentUser.loginId && topic.author.loginId === currentUser.loginId) ||
    topic.author.name === currentUser.name;

  const isAdmin = !!(currentUser && (currentUser.isAdmin || currentUser.role === 'admin'));
  const canDeleteTopic = isAuthor || isAdmin;

  // 保存処理 (本人編集)
  const handleSaveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editTitle || !editTitle.trim() || !editContent || !editContent.trim()) return;

    const updatedTopic: BoardTopic = {
      ...topic,
      title: (editTitle || '').trim(),
      content: (editContent || '').trim(),
      office: editOffice,
      division: editDivision,
      isPinned: editIsPinned,
      hasPeriod: editHasPeriod,
      startDate: editHasPeriod ? editStartDate : undefined,
      endDate: editHasPeriod ? editEndDate : undefined,
      tags: editTags,
      attachments: editAttachments,
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
  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText || !commentText.trim()) return;

    const newComment = {
      id: `cm-${Date.now()}`,
      author: currentUser,
      content: (commentText || '').trim(),
      createdAt: new Date().toISOString(),
      attachments: commentAttachments, // 添付ファイルを追加
    };

    const updatedComments = [...(topic.comments || []), newComment];
    const updatedTopic: BoardTopic = {
      ...topic,
      comments: updatedComments,
      commentsCount: updatedComments.length,
    };

    onUpdateTopic(updatedTopic);
    setCommentText('');
    setCommentAttachments([]); // リセット
  };

  // コメント削除
  const handleDeleteComment = async (commentId: string) => {
    const commentToDelete = (topic.comments || []).find(c => c.id === commentId);
    if (commentToDelete && commentToDelete.attachments && commentToDelete.attachments.length > 0) {
      await deleteAttachmentFiles(commentToDelete.attachments);
    }

    const updatedComments = (topic.comments || []).filter(c => c.id !== commentId);
    const updatedTopic: BoardTopic = {
      ...topic,
      comments: updatedComments,
      commentsCount: updatedComments.length,
    };
    onUpdateTopic(updatedTopic);
  };

  const viewersList = topic.viewers || [];

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
            {topic.isPinned && !isEditing && (
              <span className="p-1.5 bg-amber-100 text-amber-700 rounded-lg shrink-0">
                <Pin className="w-4 h-4" />
              </span>
            )}
            <h2 className="text-lg font-bold text-slate-800 truncate">
              {isEditing ? 'トピック内容の編集 (投稿者専用)' : topic.title}
            </h2>
          </div>
          <div className="flex items-center gap-2 shrink-0">
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
                onClick={() => setIsEditing(true)}
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
                src={getAvatarUrl(topic.author.avatarUrl)}
                alt={topic.author.name}
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
                        {editAttachments.map(att => (
                          <div key={att.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                            <span className="font-semibold text-slate-700 truncate">{att.name}</span>
                            <button
                              type="button"
                              disabled={isEditingUploading}
                              onClick={async () => {
                                if (att.url) {
                                  await deleteAttachmentFile(att.url);
                                }
                                setEditAttachments(editAttachments.filter(a => a.id !== att.id));
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
                              {(att.type?.startsWith('image/') || /\.pdf$/i.test(att.name) || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(att.name)) && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setPreviewFile({ ...att, url: resolveFileUrl(att.url) });
                                    setIsPreviewOpen(true);
                                  }}
                                  className="px-2.5 py-1 text-[11px] font-bold text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors"
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
                                  src={getAvatarUrl(c.author.avatarUrl)}
                                  alt={c.author.name}
                                  className="w-6 h-6 rounded-full border border-slate-200"
                                />
                                <span className="font-bold text-slate-800 hover:text-indigo-600 transition-colors">{c.author.name}</span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(c.createdAt).toLocaleString('ja-JP')}
                                </span>
                              </div>
                              {(c.author.id === currentUser.id || isAdmin) && (
                                <button
                                  type="button"
                                  onClick={() => handleDeleteComment(c.id)}
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
                                      {(att.type?.startsWith('image/') || /\.pdf$/i.test(att.name) || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(att.name)) && (
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setPreviewFile({ ...att, url: resolveFileUrl(att.url) });
                                            setIsPreviewOpen(true);
                                          }}
                                          className="text-emerald-600 hover:text-emerald-800"
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

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-80 overflow-y-auto pr-1">
                    {viewersList.map((v, idx) => (
                      <div
                        key={idx}
                        onClick={() => v.user && triggerOpenUserModal(v.user)}
                        className="flex items-center justify-between p-3 bg-slate-50 hover:bg-indigo-50/50 border border-slate-200 hover:border-indigo-200 rounded-xl text-xs cursor-pointer transition-all group/viewer"
                        title={`${v.user.name}のプロフィールを表示`}
                      >
                        <div className="flex items-center gap-2.5">
                          <img
                            src={getAvatarUrl(v.user.avatarUrl)}
                            alt={v.user.name}
                            className="w-8 h-8 rounded-full border border-slate-200 object-cover group-hover/viewer:ring-1 ring-indigo-200"
                          />
                          <div>
                            <div className="font-bold text-slate-800 group-hover/viewer:text-indigo-600 transition-colors">{v.user.name}</div>
                            <div className="text-[10px] text-slate-500">
                              {v.user.office || ''} {v.user.division || ''}
                            </div>
                          </div>
                        </div>
                        <div className="text-[10px] font-mono text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                          {new Date(v.viewedAt).toLocaleDateString('ja-JP')} {new Date(v.viewedAt).toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
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
