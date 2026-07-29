import React, { useState, useMemo } from 'react';
import { PostForm } from './PostForm';
import { PostCard } from './PostCard';
import { Post, CalendarEvent, BoardTopic, OfficeMaster, DivisionMaster } from '../types';
import { AppTab } from './Sidebar';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  Monitor, 
  MessageSquare, 
  Eye, 
  ArrowUpRight,
  Sparkles,
  Filter,
  Check,
  Building2,
  Briefcase,
  X,
  MessageCircle,
  Loader2,
  AlertTriangle
} from 'lucide-react';
import { formatRelativeTime } from '../utils';

interface TimelineProps {
  posts: Post[];
  events?: CalendarEvent[];
  topics?: BoardTopic[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  searchQuery: string;
  selectedTag: string | null;
  onPost: (content: string, tags: string[]) => void;
  onToggleLike: (postId: string) => void;
  onSelectTag: (tag: string | null) => void;
  onChangeTab?: (tab: AppTab) => void;
  isLoading?: boolean;
  error?: string | null;
}

type TimelineFeedItem = 
  | { type: 'post'; id: string; date: string; data: Post }
  | { type: 'event'; id: string; date: string; data: CalendarEvent }
  | { type: 'topic'; id: string; date: string; data: BoardTopic };

export function Timeline({
  posts,
  events = [],
  topics = [],
  offices = [],
  divisions = [],
  searchQuery,
  selectedTag,
  onPost,
  onToggleLike,
  onSelectTag,
  onChangeTab,
  isLoading = false,
  error = null,
}: TimelineProps) {
  // 表示コンテンツ種別フィルター
  const [showPosts, setShowPosts] = useState<boolean>(true);
  const [showEvents, setShowEvents] = useState<boolean>(true);
  const [showTopics, setShowTopics] = useState<boolean>(true);

  // 拠点・部門フィルター
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');

  // 拠点オプション一覧
  const officeOptions = useMemo(() => {
    const list = offices.map((o) => o.name);
    if (!list.includes('名古屋')) list.push('名古屋');
    return Array.from(new Set(list));
  }, [offices]);

  // 部門オプション一覧
  const divisionOptions = useMemo(() => {
    const list = divisions.map((d) => d.name);
    if (!list.includes('総務')) list.push('総務');
    if (!list.includes('営業')) list.push('営業');
    return Array.from(new Set(list));
  }, [divisions]);

  // アクティブなフィルタ件数
  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (selectedOffice !== 'all') count++;
    if (selectedDivision !== 'all') count++;
    if (!showPosts) count++;
    if (!showEvents) count++;
    if (!showTopics) count++;
    return count;
  }, [selectedOffice, selectedDivision, showPosts, showEvents, showTopics]);

  // リセット
  const handleResetFilters = () => {
    setSelectedOffice('all');
    setSelectedDivision('all');
    setShowPosts(true);
    setShowEvents(true);
    setShowTopics(true);
  };

  const combinedFeed = useMemo(() => {
    const items: TimelineFeedItem[] = [];

    // 1. 社内SNS投稿
    if (showPosts) {
      posts.forEach((p) => {
        items.push({
          type: 'post',
          id: `post-${p.id}`,
          date: p.createdAt,
          data: p,
        });
      });
    }

    // 2. スケジュールイベント
    if (showEvents) {
      events.forEach((e) => {
        items.push({
          type: 'event',
          id: `event-${e.id}`,
          date: e.start,
          data: e,
        });
      });
    }

    // 3. 掲示板トピック
    if (showTopics) {
      topics.forEach((t) => {
        items.push({
          type: 'topic',
          id: `topic-${t.id}`,
          date: t.createdAt,
          data: t,
        });
      });
    }

    // 降順ソート (最新順)
    items.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // フィルタリング処理
    return items.filter((item) => {
      // --- A. 拠点フィルタ ---
      if (selectedOffice !== 'all') {
        if (item.type === 'event') {
          const matchOffice = !item.data.office || item.data.office === '全社' || item.data.office === selectedOffice;
          if (!matchOffice) return false;
        } else if (item.type === 'topic') {
          const matchOffice = !item.data.office || item.data.office === '全社' || item.data.office === selectedOffice;
          if (!matchOffice) return false;
        } else if (item.type === 'post') {
          // post author department or office check
          const dept = item.data.author.department || '';
          if (!dept.includes(selectedOffice)) {
            // もし明確に別拠点なら除外
            const otherOffices = officeOptions.filter((o) => o !== selectedOffice);
            if (otherOffices.some((o) => dept.includes(o))) return false;
          }
        }
      }

      // --- B. 部門フィルタ ---
      if (selectedDivision !== 'all') {
        if (item.type === 'event') {
          const matchDivision = !item.data.division || item.data.division === '全部署' || item.data.division === selectedDivision;
          if (!matchDivision) return false;
        } else if (item.type === 'topic') {
          const matchDivision = !item.data.division || item.data.division === '全部署' || item.data.division === selectedDivision;
          if (!matchDivision) return false;
        } else if (item.type === 'post') {
          const dept = item.data.author.department || '';
          if (!dept.includes(selectedDivision)) return false;
        }
      }

      // --- C. ハッシュタグフィルタ ---
      if (selectedTag) {
        if (item.type === 'post') {
          if (!item.data.tags.includes(selectedTag)) return false;
        } else {
          return false;
        }
      }

      // --- D. キーワード検索フィルタ ---
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        if (item.type === 'post') {
          const contentMatch = item.data.content.toLowerCase().includes(query);
          const authorMatch = item.data.author.name.toLowerCase().includes(query);
          const deptMatch = item.data.author.department.toLowerCase().includes(query);
          const tagMatch = item.data.tags.some((t) => t.toLowerCase().includes(query));
          if (!contentMatch && !authorMatch && !deptMatch && !tagMatch) return false;
        } else if (item.type === 'event') {
          const titleMatch = item.data.title.toLowerCase().includes(query);
          const memoMatch = (item.data.memo || '').toLowerCase().includes(query);
          const locMatch = (item.data.location || '').toLowerCase().includes(query);
          const officeMatch = (item.data.office || '').toLowerCase().includes(query);
          if (!titleMatch && !memoMatch && !locMatch && !officeMatch) return false;
        } else if (item.type === 'topic') {
          const titleMatch = item.data.title.toLowerCase().includes(query);
          const contentMatch = item.data.content.toLowerCase().includes(query);
          const authorMatch = item.data.author.name.toLowerCase().includes(query);
          if (!titleMatch && !contentMatch && !authorMatch) return false;
        }
      }

      return true;
    });
  }, [posts, events, topics, showPosts, showEvents, showTopics, selectedOffice, selectedDivision, selectedTag, searchQuery, officeOptions]);

  return (
    <div className="flex-1 space-y-6 min-w-0">
      <PostForm onPost={onPost} />

      {/* タイムライン表示・絞り込みフィルターコントロール */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-indigo-50 text-indigo-700 rounded-lg">
              <Filter className="w-4 h-4" />
            </div>
            <h2 className="text-xs font-bold text-slate-800">タイムライン絞り込み</h2>
            {activeFilterCount > 0 && (
              <span className="px-2 py-0.5 bg-indigo-600 text-white text-[10px] font-black rounded-full">
                {activeFilterCount} 件の絞り込み適用中
              </span>
            )}
          </div>

          {activeFilterCount > 0 && (
            <button
              onClick={handleResetFilters}
              className="text-[11px] font-bold text-slate-500 hover:text-slate-800 flex items-center gap-1 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
              フィルター解除
            </button>
          )}
        </div>

        {/* 1. コンテンツ種別トグルボタン */}
        <div className="flex items-center gap-2 flex-wrap text-xs">
          <span className="text-[11px] font-bold text-slate-400 mr-1">表示種別:</span>
          
          <button
            type="button"
            onClick={() => setShowPosts(!showPosts)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              showPosts
                ? 'bg-slate-900 text-white border-slate-900 shadow-2xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <MessageCircle className="w-3.5 h-3.5" />
            つぶやき投稿
            {showPosts && <Check className="w-3.5 h-3.5 text-indigo-400" />}
          </button>

          <button
            type="button"
            onClick={() => setShowEvents(!showEvents)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              showEvents
                ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Calendar className="w-3.5 h-3.5" />
            スケジュール
            {showEvents && <Check className="w-3.5 h-3.5 text-amber-200" />}
          </button>

          <button
            type="button"
            onClick={() => setShowTopics(!showTopics)}
            className={`px-3 py-1.5 rounded-xl border text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer ${
              showTopics
                ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                : 'bg-slate-50 text-slate-400 border-slate-200 hover:bg-slate-100'
            }`}
          >
            <Monitor className="w-3.5 h-3.5" />
            掲示板
            {showTopics && <Check className="w-3.5 h-3.5 text-indigo-200" />}
          </button>
        </div>

        {/* 2. 拠点・部門ドロップダウン選択 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2">
            <Building2 className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-xs font-bold text-slate-600 shrink-0">拠点:</span>
            <select
              value={selectedOffice}
              onChange={(e) => setSelectedOffice(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">すべての拠点</option>
              {officeOptions.map((off) => (
                <option key={off} value={off}>
                  {off}
                </option>
              ))}
            </select>
          </div>

          <div className="flex items-center gap-2">
            <Briefcase className="w-4 h-4 text-slate-400 shrink-0" />
            <span className="text-xs font-bold text-slate-600 shrink-0">部門:</span>
            <select
              value={selectedDivision}
              onChange={(e) => setSelectedDivision(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="all">すべての部門</option>
              {divisionOptions.map((div) => (
                <option key={div} value={div}>
                  {div}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Timeline Header */}
      <div className="flex items-center justify-between text-sm text-slate-500 font-medium px-1">
        <span className="flex items-center gap-1.5 font-bold text-slate-700">
          <Sparkles className="w-4 h-4 text-indigo-500" />
          {selectedTag ? `#${selectedTag} の投稿` : '統合アクティビティ・タイムライン'}
          {searchQuery && ` 「${searchQuery}」の検索結果`}
        </span>
        <span className="text-xs bg-slate-100 font-bold px-2.5 py-1 rounded-full text-slate-600">
          {combinedFeed.length} 件
        </span>
      </div>

      {/* Feed Stream */}
      <div className="space-y-4">
        {isLoading && (
          <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center shadow-2xs">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-600">タイムラインのデータを取得しています...</p>
          </div>
        )}

        {error && (
          <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4 shadow-2xs flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h4 className="text-xs font-bold text-amber-800 font-mono">データ連携エラー</h4>
              <p className="text-xs text-amber-700 leading-relaxed font-medium">{error}</p>
            </div>
          </div>
        )}

        {combinedFeed.length > 0 ? (
          combinedFeed.map((item) => {
            if (item.type === 'post') {
              return (
                <PostCard
                  key={item.id}
                  post={item.data}
                  onLike={onToggleLike}
                  onTagClick={onSelectTag}
                />
              );
            }

            if (item.type === 'event') {
              const event = item.data;
              return (
                <article
                  key={item.id}
                  className="bg-white rounded-2xl border border-amber-200/90 p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 px-3 py-1 bg-amber-500 text-white font-extrabold text-[10px] rounded-bl-xl flex items-center gap-1 shadow-2xs">
                    <Calendar className="w-3 h-3" />
                    スケジュール登録
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold shrink-0 shadow-2xs">
                      <Calendar className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-base">{event.title}</span>
                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded ${
                          event.type === 'company' ? 'bg-purple-100 text-purple-700' :
                          event.type === 'team' ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-700'
                        }`}>
                          {event.type === 'company' ? '全社' : event.type === 'team' ? 'チーム' : '個人'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        {formatRelativeTime(event.start)} に追加
                      </span>
                    </div>
                  </div>

                  <div className="bg-amber-50/50 rounded-xl p-3.5 border border-amber-100 space-y-2 mb-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-800">
                      <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>日時: {new Date(event.start).toLocaleString('ja-JP')}</span>
                    </div>

                    {event.location && (
                      <div className="flex items-center gap-2 text-xs text-slate-700">
                        <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>場所: {event.location}</span>
                      </div>
                    )}

                    {event.memo && (
                      <p className="text-xs text-slate-600 line-clamp-2 pt-1 border-t border-amber-100/80 leading-relaxed">
                        {event.memo}
                      </p>
                    )}

                    {event.attendees && event.attendees.length > 0 && (
                      <div className="flex items-center gap-2 pt-1.5 border-t border-amber-100/80">
                        <Users className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-600">参加者:</span>
                        <div className="flex items-center -space-x-1">
                          {event.attendees.slice(0, 5).map((att) => (
                            <img
                              key={att.id}
                              src={att.avatarUrl}
                              alt={att.name}
                              title={att.name}
                              className="w-5 h-5 rounded-full border border-white object-cover"
                            />
                          ))}
                          {event.attendees.length > 5 && (
                            <span className="text-[10px] font-bold text-slate-500 pl-1.5">
                              +{event.attendees.length - 5}名
                            </span>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="flex items-center justify-between text-xs pt-1">
                    <span className="text-slate-400 text-[11px]">
                      対象: {event.office || '全社'} / {event.division || '全部署'}
                    </span>
                    {onChangeTab && (
                      <button
                        onClick={() => onChangeTab('calendar')}
                        className="text-indigo-600 font-bold hover:text-indigo-800 flex items-center gap-1 hover:underline"
                      >
                        カレンダーで確認 <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </article>
              );
            }

            if (item.type === 'topic') {
              const topic = item.data;
              return (
                <article
                  key={item.id}
                  className="bg-white rounded-2xl border border-indigo-200/90 p-5 shadow-sm hover:shadow-md transition-all relative overflow-hidden"
                >
                  <div className="absolute top-0 right-0 px-3 py-1 bg-indigo-600 text-white font-extrabold text-[10px] rounded-bl-xl flex items-center gap-1 shadow-2xs">
                    <Monitor className="w-3 h-3" />
                    掲示板投稿
                  </div>

                  <div className="flex items-center gap-3 mb-3">
                    <img
                      src={topic.author.avatarUrl}
                      alt={topic.author.name}
                      className="w-10 h-10 rounded-full object-cover border border-slate-100 bg-slate-100 shrink-0"
                    />
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-slate-900 text-sm">{topic.author.name}</span>
                        <span className="text-xs px-2 py-0.5 bg-indigo-50 text-indigo-700 font-bold rounded border border-indigo-100">
                          {topic.office || '全社'} / {topic.division || '全部署'}
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">{formatRelativeTime(topic.createdAt)}</span>
                    </div>
                  </div>

                  <div className="mb-3 space-y-1.5">
                    <h3 className="font-bold text-slate-900 text-base leading-snug">{topic.title}</h3>
                    <p className="text-sm text-slate-700 line-clamp-3 whitespace-pre-wrap leading-relaxed">
                      {topic.content}
                    </p>
                  </div>

                  <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                    <div className="flex items-center gap-3 text-slate-500">
                      <span className="flex items-center gap-1">
                        <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                        {topic.commentsCount || 0} 件
                      </span>
                      <span className="flex items-center gap-1">
                        <Eye className="w-3.5 h-3.5 text-slate-400" />
                        {topic.views || 0} 回閲覧
                      </span>
                    </div>

                    {onChangeTab && (
                      <button
                        onClick={() => onChangeTab('board')}
                        className="text-indigo-600 font-bold hover:text-indigo-800 flex items-center gap-1 hover:underline"
                      >
                        掲示板で確認 <ArrowUpRight className="w-3.5 h-3.5" />
                      </button>
                    )}
                  </div>
                </article>
              );
            }

            return null;
          })
        ) : (
          <div className="text-center py-12 bg-white rounded-2xl border border-slate-200 p-5 shadow-sm ring-1 ring-slate-900/5">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔍</span>
            </div>
            <h3 className="text-slate-900 font-medium mb-1">表示できる投稿が見つかりません</h3>
            <p className="text-slate-500 text-sm">
              検索・フィルタ条件を変えるか、新しい投稿・スケジュール・掲示板トピックを作成してください。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}


