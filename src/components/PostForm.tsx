import React, { useState } from 'react';
import { Send, Image as ImageIcon, Paperclip, Hash } from 'lucide-react';
import { currentUser } from '../data/mockData';

interface PostFormProps {
  onPost: (content: string, tags: string[], nasLink?: string) => void;
}

export function PostForm({ onPost }: PostFormProps) {
  const [content, setContent] = useState('');
  const [tagsInput, setTagsInput] = useState('');
  const [nasLinkInput, setNasLinkInput] = useState('');
  const [isExpanded, setIsExpanded] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) return;

    const tags = tagsInput
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0);

    onPost(content, tags, nasLinkInput.trim() || undefined);
    
    // Reset form
    setContent('');
    setTagsInput('');
    setNasLinkInput('');
    setIsExpanded(false);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm ring-1 ring-slate-900/5 mb-6 transition-all duration-300">
      <div className="flex items-start gap-4">
        <img
          src={currentUser.avatarUrl}
          alt={currentUser.name}
          className="w-10 h-10 rounded-full border border-slate-100 object-cover shrink-0"
        />
        <form onSubmit={handleSubmit} className="flex-1">
          <div className="relative">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onFocus={() => setIsExpanded(true)}
              placeholder="今日学んだことや共有したいことを書こう..."
              className={`w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white resize-none transition-all ${
                isExpanded ? 'min-h-[100px]' : 'min-h-[48px]'
              }`}
            />
          </div>

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
                <div className="flex gap-1">
                  <button type="button" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
                    <ImageIcon className="w-5 h-5" />
                  </button>
                  <button type="button" className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-full transition-colors">
                    <Paperclip className="w-5 h-5" />
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
                    }}
                    className="px-4 py-2 text-sm font-medium text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors"
                  >
                    キャンセル
                  </button>
                  <button
                    type="submit"
                    disabled={!content.trim()}
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
