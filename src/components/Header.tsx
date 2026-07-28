import { Search, Bell, Menu, Shield } from 'lucide-react';
import { User } from '../types';

interface HeaderProps {
  searchQuery: string;
  onSearchChange: (query: string) => void;
  currentUser: User;
  allUsers?: User[];
  onSwitchUser?: (user: User) => void;
}

export function Header({ searchQuery, onSearchChange, currentUser, allUsers, onSwitchUser }: HeaderProps) {
  return (
    <header className="sticky top-0 z-40 bg-white border-b border-slate-200 shrink-0 shadow-xs">
      <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between gap-4">
        {/* Logo area */}
        <div className="flex items-center gap-2">
          <button className="p-2 -ml-2 text-slate-500 hover:bg-slate-100 rounded-full lg:hidden">
            <Menu className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center shadow-xs">
              <span className="text-white font-bold text-lg leading-none">K</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-slate-800 hidden sm:block">
              Knowledge<span className="text-indigo-600">Sync</span>
            </span>
          </div>
        </div>

        {/* Search area */}
        <div className="flex-1 max-w-xl px-2 sm:px-12">
          <div className="relative group">
            <div className="absolute inset-y-0 left-3 flex items-center pointer-events-none text-slate-400">
              <Search className="h-4 w-4" />
            </div>
            <input
              type="text"
              className="w-full bg-slate-100 border-transparent focus:bg-white focus:ring-2 focus:ring-indigo-500 rounded-full py-2 pl-10 pr-4 text-sm transition-all"
              placeholder="キーワードでナレッジを検索..."
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
            />
          </div>
        </div>

        {/* Right actions */}
        <div className="flex items-center gap-4">
          <button className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
            <Bell className="w-5 h-5" />
            <span className="absolute top-1.5 right-1.5 block w-2 h-2 rounded-full bg-red-500 ring-2 ring-white" />
          </button>
          
          <div className="flex items-center gap-3 pl-4 border-l border-slate-200 hidden sm:flex">
            <div className="text-right">
              <div className="text-sm font-semibold text-slate-800 flex items-center justify-end gap-1">
                <span>{currentUser.name}</span>
                {currentUser.isAdmin && (
                  <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.2 rounded font-bold">管理者</span>
                )}
              </div>
              <div className="text-xs text-slate-500">{currentUser.department}</div>
            </div>
            <img 
              src={currentUser.avatarUrl} 
              alt={currentUser.name} 
              className="w-9 h-9 rounded-full bg-indigo-100 border border-indigo-200 object-cover"
            />
          </div>
        </div>
      </div>
    </header>
  );
}
