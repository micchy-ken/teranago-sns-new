import React, { useState, useMemo } from 'react';
import { BoardTopic, User, OfficeMaster, DivisionMaster } from '../types';
import { MessageSquare, Eye, Plus, Search, Pin, Paperclip, Calendar as CalendarIcon, Building2, Users, Flame, Tag } from 'lucide-react';
import { TopicCreateModal } from './TopicCreateModal';
import { TopicDetailModal } from './TopicDetailModal';

interface BoardProps {
  topics: BoardTopic[];
  onAddTopic?: (topicData: Omit<BoardTopic, 'id' | 'createdAt' | 'views' | 'commentsCount'>) => void;
  onUpdateTopic?: (topic: BoardTopic) => void;
  currentUser: User;
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
}

export function Board({
  topics,
  onAddTopic,
  onUpdateTopic,
  currentUser,
  offices = [],
  divisions = [],
}: BoardProps) {
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [selectedOffice, setSelectedOffice] = useState<string>('全社');
  const [selectedDivision, setSelectedDivision] = useState<string>('全部署');
  const [searchQuery, setSearchQuery] = useState('');

  // モーダル管理
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<BoardTopic | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);

  // 全トピックのタグを集計して「人気のタグ」を算出（使用頻度の高い順）
  const popularTags = useMemo(() => {
    const counts: Record<string, number> = {};
    topics.forEach(t => {
      t.tags?.forEach(tag => {
        counts[tag] = (counts[tag] || 0) + 1;
      });
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .map(([tag, count]) => ({ tag, count }));
  }, [topics]);

  // すべてのユニークタグ（オートコンプリート用）
  const existingTagsList = useMemo(() => {
    return popularTags.map(p => p.tag);
  }, [popularTags]);

  // トピックのフィルタリング & ピン留め優先ソート
  const filteredAndSortedTopics = useMemo(() => {
    return topics
      .filter(t => {
        // タグフィルタ
        if (selectedTag !== 'ALL') {
          if (!t.tags || !t.tags.includes(selectedTag)) return false;
        }

        // 拠点フィルタ
        if (selectedOffice !== '全社') {
          const tOffice = t.office || '全社';
          if (tOffice !== '全社' && tOffice !== selectedOffice) return false;
        }

        // 部署フィルタ
        if (selectedDivision !== '全部署') {
          const tDivision = t.division || '全部署';
          if (tDivision !== '全部署' && tDivision !== selectedDivision) return false;
        }

        // 検索クエリ
        if (searchQuery && searchQuery.trim()) {
          const query = searchQuery.toLowerCase();
          const matchTitle = t.title.toLowerCase().includes(query);
          const matchContent = t.content.toLowerCase().includes(query);
          const matchAuthor = t.author.name.toLowerCase().includes(query);
          const matchTags = t.tags?.some(tag => tag.toLowerCase().includes(query));
          if (!matchTitle && !matchContent && !matchAuthor && !matchTags) return false;
        }

        return true;
      })
      .sort((a, b) => {
        // ピン留めフラグがあるものを最優先
        if (a.isPinned && !b.isPinned) return -1;
        if (!a.isPinned && b.isPinned) return 1;
        // 日付降順
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [topics, selectedTag, selectedOffice, selectedDivision, searchQuery]);

  const handleOpenDetail = (topic: BoardTopic) => {
    setSelectedTopic(topic);
    setIsDetailModalOpen(true);
  };

  const handleCreateSubmit = (topicData: Omit<BoardTopic, 'id' | 'createdAt' | 'views' | 'commentsCount'>) => {
    if (onAddTopic) {
      onAddTopic(topicData);
    }
  };

  const handleUpdateTopicInternal = (updatedTopic: BoardTopic) => {
    if (onUpdateTopic) {
      onUpdateTopic(updatedTopic);
    }
    setSelectedTopic(updatedTopic);
  };

  const officeNames = Array.from(new Set(offices.map(o => o.name)));
  const divisionNames = Array.from(new Set(divisions.map(d => d.name)));

  return (
    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-8rem)]">
      {/* Top Filter & Header Area */}
      <div className="p-5 border-b border-slate-200 bg-slate-50/80 shrink-0 space-y-4">
        {/* Popular Tags Row (旧カテゴリーのリプレース) */}
        <div>
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mb-2 uppercase tracking-wider">
            <Flame className="w-4 h-4 text-amber-500 fill-amber-500" />
            人気のタグ（カテゴリー・絞り込み）
          </div>
          <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedTag('ALL')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-xl transition-all whitespace-nowrap flex items-center gap-1 ${
                selectedTag === 'ALL'
                  ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30'
                  : 'bg-white text-slate-600 hover:bg-slate-200/60 border border-slate-200'
              }`}
            >
              すべて表示
            </button>

            {popularTags.map(({ tag, count }) => (
              <button
                key={tag}
                onClick={() => setSelectedTag(tag)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-xl transition-all whitespace-nowrap flex items-center gap-1.5 ${
                  selectedTag === tag
                    ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-600/30 font-bold'
                    : 'bg-white text-slate-700 hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200'
                }`}
              >
                <Tag className="w-3 h-3 text-indigo-400" />
                <span>#{tag}</span>
                <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  selectedTag === tag ? 'bg-indigo-700 text-white' : 'bg-slate-100 text-slate-500'
                }`}>
                  {count}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Search & Office/Division Filters */}
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between pt-1 border-t border-slate-200/60">
          <div className="flex flex-wrap items-center gap-2.5">
            {/* 拠点フィルタ */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
              <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="font-semibold text-slate-500 shrink-0">拠点:</span>
              <select
                value={selectedOffice}
                onChange={e => setSelectedOffice(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="全社">全社（全拠点）</option>
                {officeNames.map(o => (
                  <option key={o} value={o}>{o}</option>
                ))}
              </select>
            </div>

            {/* 部署フィルタ */}
            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs">
              <Users className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="font-semibold text-slate-500 shrink-0">部署:</span>
              <select
                value={selectedDivision}
                onChange={e => setSelectedDivision(e.target.value)}
                className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer"
              >
                <option value="全部署">全部署（全チーム）</option>
                {divisionNames.map(d => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="relative flex-1 md:w-60">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="掲示板内を検索..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-9 pr-4 py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium"
              />
            </div>

            <button
              onClick={() => setIsCreateModalOpen(true)}
              className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition-all shadow-md active:scale-[0.99] whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4" />
              新規トピック作成
            </button>
          </div>
        </div>
      </div>

      {/* Main Board Topic List */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/40">
        <div className="max-w-5xl mx-auto space-y-3">
          {filteredAndSortedTopics.length > 0 ? (
            filteredAndSortedTopics.map(topic => {
              const viewersCount = topic.viewers?.length || 0;
              const hasAttachments = topic.attachments && topic.attachments.length > 0;

              return (
                <div
                  key={topic.id}
                  onClick={() => handleOpenDetail(topic)}
                  className={`bg-white border rounded-2xl p-5 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group relative ${
                    topic.isPinned
                      ? 'border-amber-300/80 bg-gradient-to-r from-amber-50/30 via-white to-white'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-4">
                    {/* User Avatar */}
                    <img
                      src={topic.author.avatarUrl}
                      alt={topic.author.name}
                      className="w-10 h-10 rounded-full border border-slate-200 object-cover shrink-0 hidden sm:block"
                    />

                    <div className="flex-1 min-w-0">
                      {/* Meta badges row */}
                      <div className="flex flex-wrap items-center gap-2 mb-2">
                        {topic.isPinned && (
                          <span className="inline-flex items-center gap-1 text-[11px] font-bold px-2 py-0.5 bg-amber-500 text-white rounded-md shadow-xs">
                            <Pin className="w-3 h-3 fill-white" />
                            ピン留め
                          </span>
                        )}

                        <span className="text-[11px] font-semibold px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md">
                          {topic.office || '全社'} / {topic.division || '全部署'}
                        </span>

                        {topic.hasPeriod && topic.startDate && topic.endDate && (
                          <span className="text-[10px] font-semibold px-2 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md flex items-center gap-1">
                            <CalendarIcon className="w-3 h-3 text-amber-600" />
                            {topic.startDate} ～ {topic.endDate}
                          </span>
                        )}

                        <span className="text-xs text-slate-400 ml-auto">
                          {new Date(topic.createdAt).toLocaleDateString('ja-JP')}
                        </span>
                      </div>

                      {/* Title */}
                      <h3 className="text-base sm:text-lg font-bold text-slate-900 leading-snug mb-2 group-hover:text-indigo-600 transition-colors">
                        {topic.title}
                      </h3>

                      {/* Snippet */}
                      <p className="text-xs sm:text-sm text-slate-600 line-clamp-2 mb-3 leading-relaxed">
                        {topic.content}
                      </p>

                      {/* Tags List */}
                      {topic.tags && topic.tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1.5 mb-3">
                          {topic.tags.map(tag => (
                            <span
                              key={tag}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTag(tag);
                              }}
                              className="text-[11px] font-semibold px-2 py-0.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md transition-colors border border-indigo-100"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Card Footer Info */}
                      <div className="flex flex-wrap items-center justify-between gap-3 text-xs font-semibold text-slate-500 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-2">
                          <img
                            src={topic.author.avatarUrl}
                            alt={topic.author.name}
                            className="w-5 h-5 rounded-full sm:hidden border border-slate-200"
                          />
                          <span className="text-slate-800">{topic.author.name}</span>
                        </div>

                        <div className="flex items-center gap-4">
                          {hasAttachments && (
                            <div className="flex items-center gap-1 text-slate-600" title="添付ファイルあり">
                              <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
                              <span className="text-[11px]">{topic.attachments?.length}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-1 hover:text-indigo-600 transition-colors" title="閲覧数/確認済み人数">
                            <Eye className="w-3.5 h-3.5 text-slate-400" />
                            <span>{topic.views}</span>
                            <span className="text-[10px] text-slate-400">({viewersCount}確認)</span>
                          </div>

                          <div className="flex items-center gap-1 hover:text-indigo-600 transition-colors" title="コメント数">
                            <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                            <span>{topic.commentsCount}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200">
              <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-slate-800 font-bold mb-1">該当するトピックがありません</h3>
              <p className="text-slate-500 text-xs">
                条件を変更するか、新しいトピックを作成してください。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* 新規トピック作成モーダル */}
      <TopicCreateModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onSubmit={handleCreateSubmit}
        currentUser={currentUser}
        offices={offices}
        divisions={divisions}
        existingTags={existingTagsList}
      />

      {/* トピック詳細モーダル */}
      <TopicDetailModal
        topic={selectedTopic}
        isOpen={isDetailModalOpen}
        onClose={() => setIsDetailModalOpen(false)}
        currentUser={currentUser}
        onUpdateTopic={handleUpdateTopicInternal}
      />
    </div>
  );
}
