import React, { useState, useEffect, useRef } from 'react';
import { X, MessageSquare, Eye, Pin, Paperclip, Calendar as CalendarIcon, Send, Trash2, Building2, Users, Tag, CheckCircle2, Edit3, Save, Plus } from 'lucide-react';
import { BoardTopic, User, OfficeMaster, DivisionMaster, AttachmentFile } from '../types';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';

interface TopicDetailModalProps {
  topic: BoardTopic | null;
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUpdateTopic: (updatedTopic: BoardTopic) => void;
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
}

export function TopicDetailModal({
  topic,
  isOpen,
  onClose,
  currentUser,
  onUpdateTopic,
  offices = [],
  divisions = [],
}: TopicDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'content' | 'viewers'>('content');
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });
  const [commentText, setCommentText] = useState('');

  // 編集モード関連 (投稿者本人のみ使用)
  const [isEditing, setIsEditing] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editOffice, setEditOffice] = useState('');
  const [editDivision, setEditDivision] = useState('');
  const [editIsPinned, setEditIsPinned] = useState(false);
  const [editHasPeriod, setEditHasPeriod] = useState(false);
  const [editStartDate, setEditStartDate] = useState('');
  const [editEndDate, setEditEndDate] = useState('');
  const [editTags, setEditTags] = useState<string[]>([]);
  const [editTagInput, setEditTagInput] = useState('');
  const [editAttachments, setEditAttachments] = useState<AttachmentFile[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const officeNames = Array.from(new Set(offices.map(o => o.name)));
  const divisionNames = Array.from(new Set(divisions.map(d => d.name)));

  // モーダルが開かれた時に自動的に既読（閲覧メンバー）を記録、及び編集用フォーム初期化
  useEffect(() => {
    if (isOpen && topic) {
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

  // 添付ファイル変更
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files) as File[];
      const newAttachments: AttachmentFile[] = filesArray.map((file, idx) => ({
        id: `file-edit-${Date.now()}-${idx}`,
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        type: file.type,
      }));
      setEditAttachments([...editAttachments, ...newAttachments]);
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
    };

    const updatedComments = [...(topic.comments || []), newComment];
    const updatedTopic: BoardTopic = {
      ...topic,
      comments: updatedComments,
      commentsCount: updatedComments.length,
    };

    onUpdateTopic(updatedTopic);
    setCommentText('');
  };

  // コメント削除
  const handleDeleteComment = (commentId: string) => {
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
            {isAuthor && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-colors"
              >
                <Edit3 className="w-3.5 h-3.5" />
                編集する
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
            <div className="flex items-center gap-3">
              <img
                src={topic.author.avatarUrl}
                alt={topic.author.name}
                className="w-9 h-9 rounded-full border border-slate-200 object-cover"
              />
              <div>
                <div className="text-xs font-bold text-slate-800">{topic.author.name}</div>
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

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">内容 <span className="text-red-500">*</span></label>
                <textarea
                  required
                  rows={6}
                  value={editContent}
                  onChange={e => setEditContent(e.target.value)}
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
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 flex items-center gap-1"
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
                <div className="space-y-1.5">
                  {editAttachments.map(att => (
                    <div key={att.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                      <span className="font-semibold text-slate-700 truncate">{att.name}</span>
                      <button
                        type="button"
                        onClick={() => setEditAttachments(editAttachments.filter(a => a.id !== att.id))}
                        className="text-slate-400 hover:text-red-600 p-0.5"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex justify-end gap-3 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsEditing(false)}
                  className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  更新内容を保存
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
                    {topic.content}
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
                            <a
                              href="#"
                              onClick={(e) => {
                                e.preventDefault();
                                setConfirmModal({
                                  isOpen: true,
                                  title: 'ファイルダウンロード',
                                  message: `ファイル「${att.name}」のダウンロードを開始します。`,
                                  type: 'info',
                                  confirmText: 'OK'
                                });
                              }}
                              className="px-2.5 py-1 text-[11px] font-bold text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors shrink-0"
                            >
                              ダウンロード
                            </a>
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
                              <div className="flex items-center gap-2">
                                <img
                                  src={c.author.avatarUrl}
                                  alt={c.author.name}
                                  className="w-6 h-6 rounded-full border border-slate-200"
                                />
                                <span className="font-bold text-slate-800">{c.author.name}</span>
                                <span className="text-[10px] text-slate-400">
                                  {new Date(c.createdAt).toLocaleString('ja-JP')}
                                </span>
                              </div>
                              {c.author.id === currentUser.id && (
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
                            <p className="text-slate-700 whitespace-pre-wrap pl-8">{c.content}</p>
                          </div>
                        ))
                      ) : (
                        <div className="text-center py-6 text-xs text-slate-400 bg-slate-50/50 rounded-xl border border-dashed border-slate-200">
                          まだコメントはありません。最初のコメントを投稿しましょう。
                        </div>
                      )}
                    </div>

                    {/* Comment Input */}
                    <form onSubmit={handleAddComment} className="flex gap-2 pt-2">
                      <input
                        type="text"
                        placeholder="コメントを入力..."
                        value={commentText}
                        onChange={e => setCommentText(e.target.value)}
                        className="flex-1 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                      />
                      <button
                        type="submit"
                        disabled={!commentText || !commentText.trim()}
                        className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold rounded-xl shadow-xs transition-all flex items-center gap-1.5 shrink-0"
                      >
                        <Send className="w-3.5 h-3.5" />
                        送信
                      </button>
                    </form>
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
                        className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                      >
                        <div className="flex items-center gap-2.5">
                          <img
                            src={v.user.avatarUrl}
                            alt={v.user.name}
                            className="w-8 h-8 rounded-full border border-slate-200 object-cover"
                          />
                          <div>
                            <div className="font-bold text-slate-800">{v.user.name}</div>
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
    </div>
  );
}
