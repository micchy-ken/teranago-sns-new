import React, { useState, useRef } from 'react';
import { Send, Image as ImageIcon, Paperclip, Hash, X, Loader2, UploadCloud, Trash2 } from 'lucide-react';
import { User, AttachmentFile } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { uploadMultipleFiles } from '../utils/fileUpload';

interface PostFormProps {
  onPost: (content: string, tags: string[], nasLink?: string) => void;
  currentUser?: User;
}

export function PostForm({ onPost, currentUser }: PostFormProps) {
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [nasLinkInput, setNasLinkInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);
  const [attachments, setAttachments] = useState<AttachmentFile[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const processUploadedFiles = async (files: FileList | File[]) => {
    if (files && files.length > 0) {
      setIsUploading(true);
      try {
        const uploaded = await uploadMultipleFiles(files);
        setAttachments(prev => [...prev, ...uploaded]);
        setIsExpanded(true);
      } catch (err) {
        console.error(err);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      await processUploadedFiles(e.target.files);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDraggingOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await processUploadedFiles(e.dataTransfer.files);
    }
  };

  const handleRemoveAttachment = (id: string) => {
    setAttachments(attachments.filter(a => a.id !== id));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content && attachments.length === 0) return;

    let finalContent = content.trim();

    // Append attachments if present
    if (attachments.length > 0) {
      const attText = attachments.map(a => `${a.name}\n${a.url}`).join('\n\n');
      finalContent = finalContent ? `${finalContent}\n\n📎 添付ファイル:\n${attText}` : `📎 添付ファイル:\n${attText}`;
    }

    const tags = (tagsInput || '')
      .split(',')
      .map(t => (t || '').trim())
      .filter(t => t.length > 0);

    onPost(finalContent, tags, (nasLinkInput || '').trim() || undefined);
    
    // Reset form
    setContent('');
    setTagsInput('');
    setNasLinkInput('');
    setAttachments([]);
    setIsExpanded(false);
  };

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`bg-white rounded-xl border p-5 shadow-sm ring-1 ring-slate-900/5 mb-6 transition-all duration-300 relative ${
        isDraggingOver ? 'border-2 border-dashed border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-300' : 'border-slate-200'
      }`}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        multiple
        className="hidden"
      />

      {isDraggingOver && (
        <div className="absolute inset-0 bg-indigo-50/90 rounded-xl z-20 flex flex-col items-center justify-center gap-2 text-indigo-700 pointer-events-none p-4">
          <UploadCloud className="w-8 h-8 animate-bounce text-indigo-600" />
          <p className="text-sm font-bold">タイムライン投稿にファイルをドロップして添付</p>
        </div>
      )}

      <div className="flex items-start gap-4">
        <img
          src={getAvatarUrl(currentUser?.avatarUrl)}
          alt={currentUser?.name || 'ユーザー'}
          className="w-10 h-10 rounded-full border border-slate-100 object-cover shrink-0"
        />
        <form onSubmit={handleSubmit} className="flex-1">
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={() => setIsExpanded(true)}
              placeholder="今日学んだことや共有したいことを書こう... (ファイルをドラッグ＆ドロップして添付可)"
              className={`w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-none transition-all ${
                isExpanded ? 'min-h-[100px]' : 'min-h-[48px]'
              }`}
            />
          </div>

          {/* Uploading progress indicator */}
          {isUploading && (
            <div className="mt-2 flex items-center gap-2 p-2 bg-indigo-50/80 border border-indigo-100 rounded-lg text-xs text-indigo-700">
              <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
              <span>ファイルをアップロード中...</span>
            </div>
          )}

          {/* Attached Files List */}
          {attachments.length > 0 && (
            <div className="mt-3 space-y-1.5">
              {attachments.map(att => (
                <div key={att.id} className="flex items-center justify-between p-2 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <Paperclip className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                    <span className="font-semibold text-slate-800 truncate">{att.name}</span>
                    <span className="text-[10px] text-slate-400 shrink-0">({att.size})</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRemoveAttachment(att.id)}
                    className="p-1 text-slate-400 hover:text-red-600 rounded hover:bg-slate-200/50 transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {isExpanded && (
            <div className="mt-3 space-y-3 animate-in fade-in slide-in-from-top-2 duration-200">
              <div className="flex items-center px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <Hash className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={tagsInput}
                  onChange={(e) => setTagsInput(e.target.value)}
                  placeholder="タグをカンマ区切りで入力 (例: 営業, 報告, React)"
                  className="bg-transparent border-none focus:ring-0 text-xs w-full text-slate-600 placeholder-slate-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center px-3 py-2 bg-slate-50 rounded-lg border border-slate-100">
                <Paperclip className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
                <input
                  type="text"
                  value={nasLinkInput}
                  onChange={(e) => setNasLinkInput(e.target.value)}
                  placeholder="NASフォルダ/ファイルのパスを入力 (任意, 例: \\nas01\Shared\doc.pdf)"
                  className="bg-transparent border-none focus:ring-0 text-xs w-full text-slate-600 placeholder-slate-400 focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between pt-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold border border-slate-200"
                    title="画像を添付"
                  >
                    <ImageIcon className="w-4 h-4 text-indigo-500" />
                    <span className="hidden sm:inline">画像・動画</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="p-2 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors flex items-center gap-1.5 text-xs font-semibold border border-slate-200"
                    title="ファイルを添付"
                  >
                    <Paperclip className="w-4 h-4 text-slate-500" />
                    <span className="hidden sm:inline">ファイル</span>
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsExpanded(false);
                      setContent('');
                      setTagsInput('');
                      setNasLinkInput('');
                      setAttachments([]);
                    }}
                    className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={(!content || !content.trim()) && attachments.length === 0}
                    className="flex items-center gap-2 px-5 py-2 bg-indigo-600 text-white rounded-lg text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    <Send className="w-4 h-4" />
                    投稿する
                  </button>
                </div>
              </div>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
