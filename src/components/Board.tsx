import React, { useState, useMemo } from 'react';
import { BoardTopic, User, OfficeMaster, DivisionMaster } from '../types';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';
import { markTopicAsRead } from '../utils/notifications';
import { deleteAttachmentFiles } from '../utils/fileUpload';
import { MessageSquare, Eye, Plus, Search, Pin, Paperclip, Calendar as CalendarIcon, Building2, Users, Flame, Tag, Trash2, Share2, Check, Star } from 'lucide-react';
import { TopicCreateModal } from './TopicCreateModal';
import { TopicDetailModal } from './TopicDetailModal';
import { ConfirmModal } from './ConfirmModal';
import { buildAppUrl, copyTextToClipboard } from '../utils/urlParams';
import { isTopicCurrentlyPinned, formatPinnedUntilBadge } from '../utils/boardHelpers';

interface BoardProps {
  topics: BoardTopic[];
  onAddTopic?: (topicData: Omit<BoardTopic, 'id' | 'createdAt' | 'views' | 'commentsCount'>) => void;
  onUpdateTopic?: (topic: BoardTopic) => void;
  onDeleteTopic?: (topicId: string) => void;
  currentUser: User;
  users?: User[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  initialTopicId?: string;
  onUpdateUser?: (updatedUser: User) => void;
}

export function Board({
  topics,
  onAddTopic,
  onUpdateTopic,
  onDeleteTopic,
  currentUser,
  users = [],
  offices = [],
  divisions = [],
  initialTopicId,
  onUpdateUser,
}: BoardProps) {
  const [selectedTag, setSelectedTag] = useState<string>('ALL');
  const [selectedOffice, setSelectedOffice] = useState<string>('全社');
  const [selectedDivision, setSelectedDivision] = useState<string>('全部署');
  const [searchQuery, setSearchQuery] = useState('');

  // お気に入り管理
  const favoriteTopicIds: string[] = useMemo(() => {
    return currentUser?.preferences?.favoriteTopicIds || [];
  }, [currentUser?.preferences?.favoriteTopicIds]);
  const favoriteSet = useMemo(() => new Set(favoriteTopicIds), [favoriteTopicIds]);
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const [favoriteFeedback, setFavoriteFeedback] = useState<string | null>(null);

  const handleToggleFavorite = (topicId: string, e?: React.MouseEvent) => {
    if (e) {
      e.stopPropagation();
    }
    if (!currentUser || !onUpdateUser) return;

    const currentIds = currentUser.preferences?.favoriteTopicIds || [];
    const isAlreadyFavorite = currentIds.includes(topicId);
    const updatedIds = isAlreadyFavorite
      ? currentIds.filter(id => id !== topicId)
      : [topicId, ...currentIds];

    const updatedUser: User = {
      ...currentUser,
      preferences: {
        ...(currentUser.preferences || {}),
        favoriteTopicIds: updatedIds,
      },
    };

    onUpdateUser(updatedUser);
    setFavoriteFeedback(isAlreadyFavorite ? 'お気に入りを解除しました' : 'お気に入りに追加しました');
    setTimeout(() => setFavoriteFeedback(null), 2500);
  };

  // モーダル管理
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState<BoardTopic | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [topicToDelete, setTopicToDelete] = useState<string | null>(null);
  const [copiedTopicId, setCopiedTopicId] = useState<string | null>(null);

  const handleShareTopic = async (topicId: string) => {
    const url = buildAppUrl({ tab: 'board', topicId });
    const success = await copyTextToClipboard(url);
    if (success) {
      setCopiedTopicId(topicId);
      setTimeout(() => {
        setCopiedTopicId(prev => (prev === topicId ? null : prev));
      }, 2500);
    }
  };

  const handleOpenDetail = (topic: BoardTopic) => {
    markTopicAsRead(currentUser?.id, topic.id);
    const alreadyViewed = topic.viewers?.some(v => v?.user?.id === currentUser?.id);
    if (!alreadyViewed && onUpdateTopic) {
      const newViewers = [...(topic.viewers || []), { user: currentUser, viewedAt: new Date().toISOString() }];
      onUpdateTopic({ ...topic, viewers: newViewers, views: (topic.views || 0) + 1 });
    }
    setSelectedTopic(topic);
    setIsDetailModalOpen(true);
  };

  const processedInitialTopicIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (initialTopicId && processedInitialTopicIdRef.current !== initialTopicId) {
      const target = topics.find(t => t.id === initialTopicId);
      if (target) {
        processedInitialTopicIdRef.current = initialTopicId;
        handleOpenDetail(target);
      }
    }
  }, [initialTopicId, topics]);

  // topicsプロパティ更新時に選択中のトピック(selectedTopic)も最新化
  React.useEffect(() => {
    if (selectedTopic) {
      const updated = topics.find(t => t.id === selectedTopic.id);
      if (updated && updated !== selectedTopic) {
        setSelectedTopic(updated);
      }
    }
  }, [topics]);

  // 作成者および管理者のみ削除可能
  const canDeleteTopic = (topic: BoardTopic) => {
    if (!currentUser) return false;
    const isAdmin = currentUser.isAdmin || currentUser.role === 'admin';
    const isAuthor = currentUser.id === topic.author?.id;
    return isAdmin || isAuthor;
  };

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

        // お気に入り絞り込み
        if (onlyFavorites && !favoriteSet.has(t.id)) {
          return false;
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
        // 有効なピン留め（期限内）があるものを最優先
        const aPinned = isTopicCurrentlyPinned(a);
        const bPinned = isTopicCurrentlyPinned(b);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        // 日付降順
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });
  }, [topics, selectedTag, selectedOffice, selectedDivision, searchQuery, onlyFavorites, favoriteSet]);

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
    <div className="flex-1 bg-white rounded-xl sm:rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col h-[calc(100vh-7rem)] sm:h-[calc(100vh-8rem)]">
      {/* Top Filter & Header Area */}
      <div className="p-3 sm:p-5 border-b border-slate-200 bg-slate-50/90 shrink-0 space-y-2.5 sm:space-y-3.5">
        {/* Row 1: Search & New Topic Button */}
        <div className="flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-3.5 h-3.5 sm:w-4 sm:h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder="掲示板内を検索..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-8 sm:pl-9 pr-3 py-1.5 sm:py-2 bg-white border border-slate-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-medium shadow-2xs"
            />
          </div>

          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl transition-all shadow-xs shrink-0 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 sm:w-4 sm:h-4 stroke-[2.5]" />
            <span className="hidden sm:inline">新規トピック作成</span>
            <span className="inline sm:hidden">新規作成</span>
          </button>
        </div>

        {/* Row 2: Office & Division Filter (2 columns on mobile, flex on desktop) */}
        <div className="grid grid-cols-2 sm:flex sm:flex-wrap items-center gap-2">
          {/* 拠点フィルタ */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs shadow-2xs min-w-0">
            <Building2 className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-semibold text-slate-500 shrink-0 hidden sm:inline">拠点:</span>
            <select
              value={selectedOffice}
              onChange={e => setSelectedOffice(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer w-full truncate"
            >
              <option value="全社">全社（全拠点）</option>
              {officeNames.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          {/* 部署フィルタ */}
          <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs shadow-2xs min-w-0">
            <Users className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <span className="font-semibold text-slate-500 shrink-0 hidden sm:inline">部署:</span>
            <select
              value={selectedDivision}
              onChange={e => setSelectedDivision(e.target.value)}
              className="bg-transparent font-bold text-slate-800 focus:outline-none cursor-pointer w-full truncate"
            >
              <option value="全部署">全部署（全チーム）</option>
              {divisionNames.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Row 3: Tags & Favorites Quick Scroll Bar */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 scrollbar-none">
          <button
            onClick={() => {
              setSelectedTag('ALL');
              setOnlyFavorites(false);
            }}
            className={`px-3 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer shrink-0 ${
              selectedTag === 'ALL' && !onlyFavorites
                ? 'bg-indigo-600 text-white shadow-2xs font-bold'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            すべて
          </button>

          {/* お気に入りフィルターボタン */}
          <button
            onClick={() => setOnlyFavorites(prev => !prev)}
            className={`px-2.5 py-1 text-xs font-bold rounded-lg transition-all whitespace-nowrap flex items-center gap-1 cursor-pointer shrink-0 ${
              onlyFavorites
                ? 'bg-amber-500 text-white shadow-2xs font-bold'
                : favoriteTopicIds.length > 0
                ? 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-300'
                : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
            }`}
            title="お気に入りに登録したトピックのみ表示"
          >
            <Star className={`w-3.5 h-3.5 ${onlyFavorites ? 'fill-white text-white' : favoriteTopicIds.length > 0 ? 'fill-amber-400 text-amber-500' : 'text-slate-400'}`} />
            <span>お気に入り</span>
            {favoriteTopicIds.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                onlyFavorites ? 'bg-amber-600 text-white' : 'bg-amber-200/80 text-amber-900'
              }`}>
                {favoriteTopicIds.length}
              </span>
            )}
          </button>

          {popularTags.map(({ tag, count }) => (
            <button
              key={tag}
              onClick={() => setSelectedTag(tag)}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-all whitespace-nowrap flex items-center gap-1 shrink-0 cursor-pointer ${
                selectedTag === tag
                  ? 'bg-indigo-600 text-white shadow-2xs font-bold'
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

      {/* Main Board Topic List */}
      <div className="flex-1 overflow-y-auto p-2.5 sm:p-5 bg-slate-50/40">
        <div className="w-full space-y-2.5 sm:space-y-3">
          {filteredAndSortedTopics.length > 0 ? (
            filteredAndSortedTopics.map(topic => {
              const viewersCount = topic.viewers?.length || 0;
              const hasAttachments = topic.attachments && topic.attachments.length > 0;

              return (
                <div
                  key={topic.id}
                  onClick={() => handleOpenDetail(topic)}
                  className={`bg-white border rounded-xl sm:rounded-2xl p-3 sm:p-5 hover:border-indigo-400 hover:shadow-md transition-all cursor-pointer group relative ${
                    isTopicCurrentlyPinned(topic)
                      ? 'border-amber-300/80 bg-gradient-to-r from-amber-50/30 via-white to-white'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start gap-3 sm:gap-4">
                    {/* User Avatar (Desktop) */}
                    <img
                      src={getAvatarUrl(topic.author?.id === currentUser?.id ? (currentUser?.avatarUrl || topic.author?.avatarUrl) : topic.author?.avatarUrl)}
                      alt={topic.author?.name}
                      onError={handleAvatarError}
                      className="w-10 h-10 rounded-full border border-slate-200 object-cover shrink-0 hidden sm:block"
                    />

                    <div className="flex-1 min-w-0">
                      {/* Meta badges row */}
                      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1.5 sm:mb-2">
                        {/* Badges Left */}
                        <div className="flex flex-wrap items-center gap-1.5 min-w-0">
                          {isTopicCurrentlyPinned(topic) && (
                            <span className="inline-flex items-center gap-1 text-[10px] sm:text-[11px] font-bold px-1.5 sm:px-2 py-0.5 bg-amber-500 text-white rounded-md shadow-2xs shrink-0">
                              <Pin className="w-3 h-3 fill-white" />
                              <span>ピン留め</span>
                              <span className="text-[9px] sm:text-[10px] text-amber-100 font-normal">
                                {formatPinnedUntilBadge(topic.pinnedUntil)}
                              </span>
                            </span>
                          )}

                          <span className="text-[10px] sm:text-[11px] font-semibold px-1.5 sm:px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md shrink-0">
                            {topic.office || '全社'} / {topic.division || '全部署'}
                          </span>

                          {topic.hasPeriod && topic.startDate && topic.endDate && (
                            <span className="text-[10px] font-semibold px-1.5 py-0.5 bg-amber-50 text-amber-800 border border-amber-200 rounded-md flex items-center gap-1 shrink-0">
                              <CalendarIcon className="w-3 h-3 text-amber-600" />
                              <span>{topic.startDate} ～ {topic.endDate}</span>
                            </span>
                          )}
                        </div>

                        {/* Actions Right */}
                        <div className="flex items-center gap-1 shrink-0 ml-auto" onClick={e => e.stopPropagation()}>
                          <span className="text-[11px] sm:text-xs text-slate-400 mr-0.5">
                            {new Date(topic.createdAt).toLocaleDateString('ja-JP')}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => handleToggleFavorite(topic.id, e)}
                            className={`p-1 sm:px-2 sm:py-1 rounded-lg border transition-all flex items-center gap-1 text-[11px] font-semibold cursor-pointer ${
                              favoriteSet.has(topic.id)
                                ? 'bg-amber-50 text-amber-600 border-amber-300 ring-2 ring-amber-200 shadow-2xs'
                                : 'text-slate-400 bg-slate-50 hover:bg-slate-100 hover:text-amber-500 border-slate-200 shadow-2xs'
                            }`}
                            title={favoriteSet.has(topic.id) ? 'お気に入りを解除' : 'お気に入りに追加'}
                          >
                            <Star className={`w-3.5 h-3.5 ${favoriteSet.has(topic.id) ? 'fill-amber-400 text-amber-500' : ''}`} />
                            <span className="hidden sm:inline">{favoriteSet.has(topic.id) ? '登録中' : ''}</span>
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              handleShareTopic(topic.id);
                            }}
                            className={`p-1 sm:px-2 sm:py-1 rounded-lg border transition-all flex items-center gap-1 text-[11px] font-semibold cursor-pointer ${
                              copiedTopicId === topic.id
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-300 ring-2 ring-emerald-200'
                                : 'text-slate-500 bg-slate-50 hover:bg-slate-100 hover:text-indigo-600 border-slate-200 shadow-2xs'
                            }`}
                            title="このトピックを開く共有リンク（URL）をコピー"
                          >
                            {copiedTopicId === topic.id ? (
                              <>
                                <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                                <span className="text-emerald-700 font-bold hidden sm:inline">コピー完了!</span>
                              </>
                            ) : (
                              <>
                                <Share2 className="w-3.5 h-3.5 shrink-0" />
                                <span className="hidden sm:inline">共有</span>
                              </>
                            )}
                          </button>
                          {onDeleteTopic && canDeleteTopic(topic) && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setTopicToDelete(topic.id);
                              }}
                              className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                              title="トピックを削除"
                            >
                              <Trash2 className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                            </button>
                          )}
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="text-sm sm:text-base font-bold text-slate-900 leading-snug mb-1.5 sm:mb-2 group-hover:text-indigo-600 transition-colors break-words">
                        {topic.title}
                      </h3>

                      {/* Snippet */}
                      <p className="text-xs sm:text-sm text-slate-600 line-clamp-2 mb-2 sm:mb-3 leading-relaxed break-words">
                        {topic.content}
                      </p>

                      {/* Tags List */}
                      {topic.tags && topic.tags.length > 0 && (
                        <div className="flex flex-wrap items-center gap-1 sm:gap-1.5 mb-2.5 sm:mb-3">
                          {topic.tags.map(tag => (
                            <span
                              key={tag}
                              onClick={(e) => {
                                e.stopPropagation();
                                setSelectedTag(tag);
                              }}
                              className="text-[10px] sm:text-[11px] font-semibold px-1.5 sm:px-2 py-0.5 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-md transition-colors border border-indigo-100 cursor-pointer"
                            >
                              #{tag}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Card Footer Info */}
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500 pt-2 border-t border-slate-100">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <img
                            src={getAvatarUrl(topic.author?.id === currentUser?.id ? (currentUser?.avatarUrl || topic.author?.avatarUrl) : topic.author?.avatarUrl)}
                            alt={topic.author?.name}
                            onError={handleAvatarError}
                            className="w-4 h-4 sm:w-5 sm:h-5 rounded-full sm:hidden border border-slate-200 object-cover shrink-0"
                          />
                          <span className="text-slate-800 text-[11px] sm:text-xs font-bold truncate max-w-[110px] sm:max-w-none">{topic.author?.name}</span>
                        </div>

                        <div className="flex items-center gap-2.5 sm:gap-4 text-[11px] sm:text-xs">
                          {hasAttachments && (
                            <div className="flex items-center gap-0.5 text-slate-600 shrink-0" title="添付ファイルあり">
                              <Paperclip className="w-3.5 h-3.5 text-indigo-500" />
                              <span>{topic.attachments?.length}</span>
                            </div>
                          )}

                          <div className="flex items-center gap-0.5 hover:text-indigo-600 transition-colors shrink-0" title="閲覧数/確認済み人数">
                            <Eye className="w-3.5 h-3.5 text-slate-400" />
                            <span>{topic.views}</span>
                            <span className="text-[10px] text-slate-400">({viewersCount})</span>
                          </div>

                          <div className="flex items-center gap-0.5 hover:text-indigo-600 transition-colors shrink-0" title="コメント数">
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
              {onlyFavorites ? (
                <>
                  <Star className="w-12 h-12 text-amber-300 mx-auto mb-3 fill-amber-100" />
                  <h3 className="text-slate-800 font-bold mb-1">お気に入りのトピックはありません</h3>
                  <p className="text-slate-500 text-xs">
                    各トピックの「★」アイコンをクリックすると、ここにお気に入りが集まります。
                  </p>
                </>
              ) : (
                <>
                  <MessageSquare className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <h3 className="text-slate-800 font-bold mb-1">該当するトピックがありません</h3>
                  <p className="text-slate-500 text-xs">
                    条件を変更するか、新しいトピックを作成してください。
                  </p>
                </>
              )}
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
        users={users}
        onUpdateTopic={handleUpdateTopicInternal}
        onDeleteTopic={(topicId) => {
          setIsDetailModalOpen(false);
          if (onDeleteTopic) {
            onDeleteTopic(topicId);
          }
        }}
        offices={offices}
        divisions={divisions}
        isFavorite={selectedTopic ? favoriteSet.has(selectedTopic.id) : false}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* 削除確認モーダル */}
      <ConfirmModal
        isOpen={!!topicToDelete}
        title="トピックの削除"
        message="このトピックを削除してもよろしいですか？添付ファイルも含めて削除されます。"
        type="danger"
        confirmText="削除する"
        cancelText="キャンセル"
        onConfirm={async () => {
          if (topicToDelete && onDeleteTopic) {
            const targetTopic = topics.find(t => t.id === topicToDelete);
            if (targetTopic) {
              const allAttachments = [
                ...(targetTopic.attachments || []),
                ...(targetTopic.comments || []).flatMap(c => c.attachments || [])
              ];
              if (allAttachments.length > 0) {
                await deleteAttachmentFiles(allAttachments);
              }
            }
            onDeleteTopic(topicToDelete);
          }
          setTopicToDelete(null);
        }}
        onClose={() => setTopicToDelete(null)}
      />

      {/* お気に入り操作トースト通知 */}
      {favoriteFeedback && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 bg-slate-900/95 text-white px-4 py-2.5 rounded-xl shadow-2xl border border-slate-700 text-xs font-semibold backdrop-blur-xs animate-in fade-in slide-in-from-bottom-2">
          <Star className="w-4 h-4 text-amber-400 fill-amber-400 shrink-0" />
          <span>{favoriteFeedback}</span>
        </div>
      )}
    </div>
  );
}
