import React, { useState, useRef, useEffect } from 'react';
import { X, Paperclip, Pin, Calendar as CalendarIcon, Building2, Users, Tag, Plus, Trash2 } from 'lucide-react';
import { BoardTopic, User, OfficeMaster, DivisionMaster, AttachmentFile } from '../types';

interface TopicCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSubmit: (topicData: Omit<BoardTopic, 'id' | 'createdAt' | 'views' | 'commentsCount'>) => void;
  currentUser: User;
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  existingTags: string[];
}

export function TopicCreateModal({
  isOpen,
  onClose,
  onSubmit,
  currentUser,
  offices = [],
  divisions = [],
  existingTags = [],
}: TopicCreateModalProps) {
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [selectedOffice, setSelectedOffice] = useState('全社');
  const [selectedDivision, setSelectedDivision] = useState('全部署');
  
  // タグ関連
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [isSuggestOpen, setIsSuggestOpen] = useState(false);

  // 添付ファイル
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);

  // 公開期間 (デフォルト: オフ)
  const [hasPeriod, setHasPeriod] = useState(false);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // ピン留め
  const [isPinned, setIsPinned] = useState(false);

  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTitle('');
      setContent('');
      setSelectedOffice('全社');
      setSelectedDivision('全部署');
      setTags([]);
      setTagInput('');
      setAttachments([]);
      setHasPeriod(false);
      setStartDate('');
      setEndDate('');
      setIsPinned(false);
      setError(null);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  // オートコンプリート用の候補抽出
  const filteredSuggestions = existingTags.filter(
    t => t.toLowerCase().includes((tagInput || '').trim().toLowerCase()) && !tags.includes(t)
  );

  const handleAddTag = (tagToAdd: string) => {
    const trimmed = (tagToAdd || '').trim().replace(/^#/, '');
    if (trimmed && !tags.includes(trimmed)) {
      setTags([...tags, trimmed]);
    }
    setTagInput('');
    setIsSuggestOpen(false);
  };

  const handleKeyDownTagInput = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      if (tagInput && tagInput.trim()) {
        handleAddTag(tagInput);
      }
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  // ファイル選択の擬似ハンドラー
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const filesArray = Array.from(e.target.files) as File[];
      const newAttachments: AttachmentFile[] = filesArray.map((file, idx) => ({
        id: `file-${Date.now()}-${idx}`,
        name: file.name,
        size: `${(file.size / 1024 / 1024).toFixed(1)} MB`,
        type: file.type,
      }));
      setAttachments([...attachments, ...newAttachments]);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!title || !title.trim()) {
      setError('タイトルを入力してください。');
      return;
    }
    if (!content || !content.trim()) {
      setError('本文を入力してください。');
      return;
    }

    if (hasPeriod) {
      if (!startDate || !endDate) {
        setError('公開期間の開始日と終了日を指定してください。');
        return;
      }
      if (startDate > endDate) {
        setError('公開期間の開始日は終了日より前の日付にしてください。');
        return;
      }
    }

    onSubmit({
      title: (title || '').trim(),
      content: (content || '').trim(),
      author: currentUser,
      office: selectedOffice,
      division: selectedDivision,
      tags,
      attachments,
      hasPeriod,
      startDate: hasPeriod ? startDate : undefined,
      endDate: hasPeriod ? endDate : undefined,
      isPinned,
      comments: [],
      viewers: [{ user: currentUser, viewedAt: new Date().toISOString() }],
    });

    onClose();
  };

  const officeNames = Array.from(new Set(offices.map(o => o.name)));
  const divisionNames = Array.from(new Set(divisions.map(d => d.name)));

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-2xl w-full shadow-2xl border border-slate-200 overflow-hidden my-8"
      >
        {/* Modal Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg">
              <Plus className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">新規掲示板トピック作成</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
          {error && (
            <div className="p-3 bg-red-50 border border-red-200 text-red-600 text-xs rounded-lg font-medium">
              {error}
            </div>
          )}

          {/* 公開範囲（拠点・部署） */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-slate-500" />
                公開範囲（拠点）
              </label>
              <select
                value={selectedOffice}
                onChange={e => setSelectedOffice(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="全社">全社（すべての拠点）</option>
                {officeNames.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-slate-500" />
                公開範囲（部署）
              </label>
              <select
                value={selectedDivision}
                onChange={e => setSelectedDivision(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                <option value="全部署">全部署（全チーム）</option>
                {divisionNames.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          {/* タイトル */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              タイトル <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              placeholder="例: 【重要】新しい福利厚生制度の導入について"
              value={title}
              onChange={e => setTitle(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {/* 内容 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              本文内容 <span className="text-red-500">*</span>
            </label>
            <textarea
              rows={5}
              placeholder="告知内容や詳細を詳しく記載してください..."
              value={content}
              onChange={e => setContent(e.target.value)}
              className="w-full px-3.5 py-2.5 bg-white border border-slate-200 rounded-xl text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
          </div>

          {/* モダンなタグ設定（オートコンプリート機能付き） */}
          <div className="relative">
            <label className="block text-xs font-bold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Tag className="w-4 h-4 text-indigo-500" />
              タグ設定（入力してEnterまたは選択）
            </label>

            {/* タグ一覧表示 */}
            <div className="flex flex-wrap items-center gap-1.5 mb-2">
              {tags.map(tag => (
                <span
                  key={tag}
                  className="inline-flex items-center gap-1 px-2.5 py-1 bg-indigo-50 text-indigo-700 text-xs font-semibold rounded-lg border border-indigo-200"
                >
                  #{tag}
                  <button
                    type="button"
                    onClick={() => handleRemoveTag(tag)}
                    className="hover:text-red-600 transition-colors ml-0.5"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </span>
              ))}
            </div>

            <div className="relative">
              <input
                type="text"
                placeholder="タグを入力（例: 全社告知, 総務, システム更新）"
                value={tagInput}
                onChange={e => {
                  setTagInput(e.target.value);
                  setIsSuggestOpen(true);
                }}
                onFocus={() => setIsSuggestOpen(true)}
                onKeyDown={handleKeyDownTagInput}
                className="w-full px-3.5 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
              />

              {/* 既存タグの補完候補ドロップダウン */}
              {isSuggestOpen && (tagInput || '').trim() !== '' && filteredSuggestions.length > 0 && (
                <div className="absolute z-20 top-full left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-40 overflow-y-auto py-1">
                  <div className="px-3 py-1 text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                    既存の候補タグから選択
                  </div>
                  {filteredSuggestions.map(sugg => (
                    <button
                      key={sugg}
                      type="button"
                      onClick={() => handleAddTag(sugg)}
                      className="w-full text-left px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 transition-colors flex items-center justify-between"
                    >
                      <span>#{sugg}</span>
                      <span className="text-[10px] text-slate-400">クリックで追加</span>
                    </button>
                  ))}
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
                ファイルを選択
              </button>
            </div>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              multiple
              className="hidden"
            />

            {attachments.length > 0 ? (
              <div className="space-y-1.5">
                {attachments.map(att => (
                  <div
                    key={att.id}
                    className="flex items-center justify-between p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <Paperclip className="w-4 h-4 text-slate-400 shrink-0" />
                      <span className="font-semibold text-slate-700 truncate">{att.name}</span>
                      <span className="text-[10px] text-slate-400">({att.size})</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="text-slate-400 hover:text-red-600 p-1 rounded transition-colors"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div
                onClick={() => fileInputRef.current?.click()}
                className="p-4 border-2 border-dashed border-slate-200 hover:border-indigo-300 rounded-xl text-center cursor-pointer transition-colors bg-slate-50/50"
              >
                <Paperclip className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                <p className="text-xs text-slate-500 font-medium">
                  クリックして資料・画像・ドキュメントを添付
                </p>
              </div>
            )}
          </div>

          {/* 公開期間設定 (デフォルト: オフ) */}
          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <CalendarIcon className="w-4 h-4 text-indigo-600" />
                <span className="text-xs font-bold text-slate-700">公開期間を設定する（デフォルト: 無期限）</span>
              </label>
              <input
                type="checkbox"
                checked={hasPeriod}
                onChange={e => setHasPeriod(e.target.checked)}
                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 cursor-pointer"
              />
            </div>

            {hasPeriod && (
              <div className="grid grid-cols-2 gap-3 pt-2 border-t border-slate-200">
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">開始日</label>
                  <input
                    type="date"
                    value={startDate}
                    onChange={e => setStartDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-600 mb-1">終了日</label>
                  <input
                    type="date"
                    value={endDate}
                    onChange={e => setEndDate(e.target.value)}
                    className="w-full px-3 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
              </div>
            )}
          </div>

          {/* ピン留め設定 */}
          <div className="flex items-center justify-between p-3.5 bg-amber-50/60 border border-amber-200/80 rounded-xl">
            <div className="flex items-center gap-2">
              <Pin className="w-4 h-4 text-amber-600" />
              <div>
                <div className="text-xs font-bold text-amber-900">掲示板の上部にピン留めする</div>
                <div className="text-[11px] text-amber-700">重要な告知として一覧の最上部に固定表示されます</div>
              </div>
            </div>
            <input
              type="checkbox"
              checked={isPinned}
              onChange={e => setIsPinned(e.target.checked)}
              className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500 border-amber-300 cursor-pointer"
            />
          </div>

          {/* Submit Actions */}
          <div className="pt-2 flex items-center justify-end gap-3 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors"
            >
              キャンセル
            </button>
            <button
              type="submit"
              className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all active:scale-[0.99]"
            >
              投稿を公開する
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
