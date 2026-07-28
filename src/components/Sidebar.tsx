import { Hash, Home, Bookmark, User, Calendar as CalendarIcon, FileText, MessageSquare, Phone, ClipboardList, Monitor, Shield } from 'lucide-react';
import { Post, User as UserType } from '../types';

export type AppTab = 'timeline' | 'calendar' | 'workflow' | 'board' | 'chat' | 'memo' | 'daily_report' | 'mypage' | 'admin';

interface SidebarProps {
  posts: Post[];
  selectedTag: string | null;
  onSelectTag: (tag: string | null) => void;
  activeTab: AppTab;
  onChangeTab: (tab: AppTab) => void;
  currentUser?: UserType;
}

export function Sidebar({ posts, selectedTag, onSelectTag, activeTab, onChangeTab, currentUser }: SidebarProps) {
  // Extract and count tags
  const tagCounts = posts.reduce((acc, post) => {
    post.tags.forEach((tag) => {
      acc[tag] = (acc[tag] || 0) + 1;
    });
    return acc;
  }, {} as Record<string, number>);

  // Sort tags by frequency
  const sortedTags = Object.entries(tagCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10); // Show top 10

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 flex flex-col gap-8 shrink-0 shadow-sm ring-1 ring-slate-900/5 sticky top-24">
      <nav className="space-y-1">
        <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">メニュー</div>
        <button
          onClick={() => onChangeTab('timeline')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'timeline'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Home className="w-4 h-4" />
          タイムライン
        </button>
        <button
          onClick={() => onChangeTab('calendar')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'calendar'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <CalendarIcon className="w-4 h-4" />
          カレンダー
        </button>
        <button
          onClick={() => onChangeTab('workflow')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'workflow'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <FileText className="w-4 h-4" />
          ワークフロー
        </button>
        <button
          onClick={() => onChangeTab('board')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'board'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Monitor className="w-4 h-4" />
          掲示板
        </button>
        <button
          onClick={() => onChangeTab('chat')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'chat'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <MessageSquare className="w-4 h-4" />
          チャットルーム
        </button>
        <button
          onClick={() => onChangeTab('memo')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'memo'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <Phone className="w-4 h-4" />
          伝言メモ
        </button>
        <button
          onClick={() => onChangeTab('daily_report')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'daily_report'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <ClipboardList className="w-4 h-4" />
          日報
        </button>
        <button
          onClick={() => onChangeTab('mypage')}
          className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'mypage'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <User className="w-4 h-4" />
          マイページ
        </button>

        <button
          onClick={() => onChangeTab('admin')}
          className={`w-full flex items-center justify-between px-3 py-2 rounded-lg font-medium transition-colors ${
            activeTab === 'admin'
              ? 'bg-indigo-50 text-indigo-700'
              : 'text-slate-600 hover:bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-3">
            <Shield className="w-4 h-4 text-indigo-600" />
            管理者メニュー
          </div>
          {currentUser?.isAdmin && (
            <span className="text-[10px] px-1.5 py-0.5 rounded font-bold bg-indigo-100 text-indigo-700">
              管理者
            </span>
          )}
        </button>
      </nav>

      {activeTab === 'timeline' && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">人気のタグ</div>
          <div className="flex flex-wrap gap-2">
            {sortedTags.map(([tag]) => (
              <button
                key={tag}
                onClick={() => onSelectTag(tag)}
                className={`px-3 py-1.5 rounded-full text-xs transition-colors ${
                  selectedTag === tag
                    ? 'bg-indigo-600 text-white font-medium'
                    : 'bg-slate-100 hover:bg-indigo-100 hover:text-indigo-700 text-slate-600'
                }`}
              >
                # {tag}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
