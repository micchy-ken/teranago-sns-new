import React, { useState } from 'react';
import { BoardTopic, BoardCategory } from '../types';
import { MessageSquare, Eye, Plus, Search } from 'lucide-react';

interface BoardProps {
  topics: BoardTopic[];
}

const categoryLabels: Record<BoardCategory, string> = {
  all: 'すべて',
  general: '全社告知',
  hr: '人事・総務',
  it: 'IT・システム'
};

const categoryColors: Record<BoardCategory, string> = {
  all: 'bg-slate-100 text-slate-700',
  general: 'bg-blue-100 text-blue-700',
  hr: 'bg-pink-100 text-pink-700',
  it: 'bg-emerald-100 text-emerald-700'
};

export function Board({ topics }: BoardProps) {
  const [activeCategory, setActiveCategory] = useState<BoardCategory>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredTopics = topics.filter(t => {
    if (activeCategory !== 'all' && t.category !== activeCategory) return false;
    if (searchQuery && !t.title.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-8rem)]">
      <div className="p-5 border-b border-slate-200 bg-slate-50 shrink-0">
        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between">
          <div className="flex gap-2 p-1 bg-slate-200/50 rounded-lg overflow-x-auto w-full sm:w-auto">
            {(Object.keys(categoryLabels) as BoardCategory[]).map(cat => (
              <button 
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-4 py-2 text-sm font-semibold rounded-md transition-all whitespace-nowrap ${
                  activeCategory === cat 
                    ? 'bg-white text-slate-800 shadow-sm' 
                    : 'text-slate-500 hover:text-slate-700'
                }`}
              >
                {categoryLabels[cat]}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-64">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="トピックを検索..." 
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-shadow text-sm"
              />
            </div>
            <button className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-sm font-semibold rounded-lg hover:bg-indigo-700 transition-colors shadow-sm whitespace-nowrap">
              <Plus className="w-4 h-4"/>
              新規作成
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/30">
        <div className="max-w-5xl mx-auto space-y-3">
          {filteredTopics.length > 0 ? (
            filteredTopics.map(topic => (
              <div key={topic.id} className="bg-white border border-slate-200 rounded-xl p-5 hover:border-indigo-300 hover:shadow-md transition-all cursor-pointer group">
                <div className="flex items-start gap-4">
                  <div className="hidden sm:block">
                    <img src={topic.author.avatarUrl} alt={topic.author.name} className="w-10 h-10 rounded-full border border-slate-200" />
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${categoryColors[topic.category]}`}>
                        {categoryLabels[topic.category]}
                      </span>
                      <span className="text-xs text-slate-400">
                        {new Date(topic.createdAt).toLocaleDateString('ja-JP')}
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 leading-tight mb-2 group-hover:text-indigo-600 transition-colors">
                      {topic.title}
                    </h3>
                    <p className="text-sm text-slate-600 line-clamp-2 mb-3">
                      {topic.content}
                    </p>
                    <div className="flex items-center gap-4 text-xs font-semibold text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <img src={topic.author.avatarUrl} alt={topic.author.name} className="w-5 h-5 rounded-full sm:hidden border border-slate-200" />
                        <span>{topic.author.name}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <Eye className="w-4 h-4" />
                        <span>{topic.views}</span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MessageSquare className="w-4 h-4" />
                        <span>{topic.commentsCount}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-16 bg-white rounded-xl border border-slate-200">
              <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-slate-800 font-semibold mb-1">トピックがありません</h3>
              <p className="text-slate-500 text-sm">現在、表示できるトピックはありません。</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
