import React, { useState, useMemo } from 'react';
import { PostForm } from './PostForm';
import { Post, CalendarEvent, BoardTopic, OfficeMaster, DivisionMaster, User } from '../types';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';
import { AppTab } from './Sidebar';
import { 
  Calendar, 
  Clock, 
  MapPin, 
  Users, 
  Monitor, 
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
  AlertTriangle,
  ChevronRight,
  Heart,
  Share2,
  Trash2,
  MessageSquare
} from 'lucide-react';
import { formatRelativeTime } from '../utils';
import { API_BASE_URL } from '../config/api';

interface TimelineProps {
  posts: Post[];
  events?: CalendarEvent[];
  topics?: BoardTopic[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  searchQuery: string;
  selectedTag: string | null;
  onPost: (content: string, tags: string[], nasLink?: string) => void;
  onToggleLike: (postId: string) => void;
  onSelectTag: (tag: string | null) => void;
  onChangeTab?: (tab: AppTab) => void;
  isLoading?: boolean;
  error?: string | null;
  onRefetchPosts?: () => Promise<void>;
  onDeletePost?: (postId: string) => void;
  currentUser?: User;
}

type TimelineFeedItem = 
  | { type: 'post'; id: string; date: string; data: Post }
  | { type: 'event'; id: string; date: string; data: CalendarEvent }
  | { type: 'topic'; id: string; date: string; data: BoardTopic };

export function Timeline({
  posts = [],
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
  onRefetchPosts,
  onDeletePost,
  currentUser,
}: TimelineProps) {
  // 表示コンテンツ種別フィルター
  const [showPosts, setShowPosts] = useState<boolean>(true);
  const [showEvents, setShowEvents] = useState<boolean>(true);
  const [showTopics, setShowTopics] = useState<boolean>(true);

  // 拠点・部門フィルター
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');

  // 選択詳細アイテム
  const [selectedDetailItem, setSelectedDetailItem] = useState<TimelineFeedItem | null>(null);

  // 拠点オプション一覧
  const officeOptions = useMemo(() => {
    const list = offices.map((o) => o.name);
    return Array.from(new Set(list));
  }, [offices]);

  // 部門オプション一覧
  const divisionOptions = useMemo(() => {
    const list = divisions.map((d) => d.name);
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
    if (showPosts && posts && Array.isArray(posts)) {
      posts.forEach((p) => {
        items.push({
          type: 'post',
          id: `post-${p.id}`,
          date: p.createdAt,
          data: p,
        });
      });
    }

    // 2. スケジュールイベント（繰り返し登録時は最初の登録のみ表示、個別更新された予定も表示）
    if (showEvents && events && Array.isArray(events)) {
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
    if (showTopics && topics && Array.isArray(topics)) {
      topics.forEach((t) => {
        items.push({
          type: 'topic',
          id: `topic-${t.id}`,
          date: t.createdAt,
          data: t,
        });
      });
    }

    // 降順ソート (登録・更新の最新順)
    const getItemTimestamp = (item: TimelineFeedItem) => {
      const data = item.data as any;
      const timeStr = data.updatedAt || data.createdAt || data.start || item.date;
      const t = new Date(timeStr).getTime();
      return isNaN(t) ? 0 : t;
    };

    items.sort((a, b) => getItemTimestamp(b) - getItemTimestamp(a));

    // フィルタリング処理
    return items.filter((item) => {
      // --- A. 拠点フィルタ ---
      if (selectedOffice !== 'all') {
        if (item.type === 'event') {
          const matchOffice = item.data.attendees ? item.data.attendees.some((a: any) => !a.office || a.office === selectedOffice) : true;
          if (!matchOffice) return false;
        } else if (item.type === 'topic') {
          const matchOffice = !item.data.office || item.data.office === '全社' || item.data.office === selectedOffice;
          if (!matchOffice) return false;
        } else if (item.type === 'post') {
          // post author department or office check
          const dept = item.data.author?.department || '';
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
          const matchDivision = item.data.attendees ? item.data.attendees.some((a: any) => !a.division || a.division === selectedDivision) : true;
          if (!matchDivision) return false;
        } else if (item.type === 'topic') {
          const matchDivision = !item.data.division || item.data.division === '全部署' || item.data.division === selectedDivision;
          if (!matchDivision) return false;
        } else if (item.type === 'post') {
          const dept = item.data.author?.department || '';
          if (!dept.includes(selectedDivision)) return false;
        }
      }

      // --- C. ハッシュタグフィルタ ---
      if (selectedTag) {
        if (item.type === 'post') {
          if (!item.data.tags?.includes(selectedTag)) return false;
        } else {
          return false;
        }
      }

      // --- D. キーワード検索フィルタ ---
      if (searchQuery && searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        if (item.type === 'post') {
          const contentMatch = (item.data.content || '').toLowerCase().includes(query);
          const authorMatch = (item.data.author?.name || '').toLowerCase().includes(query);
          const deptMatch = (item.data.author?.department || '').toLowerCase().includes(query);
          const tagMatch = (item.data.tags || []).some((t) => t.toLowerCase().includes(query));
          if (!contentMatch && !authorMatch && !deptMatch && !tagMatch) return false;
        } else if (item.type === 'event') {
          const titleMatch = (item.data.title || '').toLowerCase().includes(query);
          const memoMatch = (item.data.memo || '').toLowerCase().includes(query);
          const locMatch = (item.data.location || '').toLowerCase().includes(query);
          const attMatch = (item.data.attendees || []).some((a: any) => (a.name || '').toLowerCase().includes(query));
          if (!titleMatch && !memoMatch && !locMatch && !attMatch) return false;
        } else if (item.type === 'topic') {
          const titleMatch = (item.data.title || '').toLowerCase().includes(query);
          const contentMatch = (item.data.content || '').toLowerCase().includes(query);
          const authorMatch = (item.data.author?.name || '').toLowerCase().includes(query);
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
          <div className="space-y-2">
            {combinedFeed.map((item) => {
              if (item.type === 'post') {
                const post = item.data;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedDetailItem(item)}
                    className="bg-white rounded-xl border border-slate-200/90 hover:border-slate-300 p-3 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="px-2 py-0.5 bg-slate-100 text-slate-700 font-extrabold text-[11px] rounded shrink-0 flex items-center gap-1 border border-slate-200">
                        <MessageCircle className="w-3 h-3 text-slate-500" />
                        つぶやき
                      </span>
                      <img
                        src={getAvatarUrl(post.author?.avatarUrl)}
                        onError={handleAvatarError}
                        alt={post.author?.name || '匿名'}
                        className="w-6 h-6 rounded-full object-cover border border-slate-100 bg-slate-100 shrink-0"
                      />
                      <span className="font-bold text-xs text-slate-800 shrink-0">
                        {post.author?.name || '匿名'}
                      </span>
                      <span className="text-xs text-slate-600 font-medium truncate min-w-0">
                        {post.content}
                      </span>
                      {post.tags && post.tags.length > 0 && (
                        <span className="text-[10px] text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded font-semibold shrink-0 hidden sm:inline-block">
                          #{post.tags[0]}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
                        {formatRelativeTime(post.createdAt)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                );
              }

              if (item.type === 'event') {
                const event = item.data;
                const eventUser = (event as any).createdBy || (event.attendees && event.attendees.length > 0 ? event.attendees[0] : null);
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedDetailItem(item)}
                    className="bg-white rounded-xl border border-amber-200/90 hover:border-amber-300 p-3 shadow-2xs hover:shadow-xs transition-all flex flex-col gap-1.5 cursor-pointer group"
                  >
                    {/* 1行目: 種別バッジ + 顔アイコン + 名前 */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="px-2 py-0.5 bg-amber-50 text-amber-700 font-extrabold text-[11px] rounded shrink-0 flex items-center gap-1 border border-amber-200">
                          <Calendar className="w-3 h-3 text-amber-600" />
                          予定
                        </span>
                        {eventUser && (
                          <div className="flex items-center gap-1.5 min-w-0">
                            <img
                              src={getAvatarUrl(eventUser.avatarUrl)}
                              onError={handleAvatarError}
                              alt={eventUser.name}
                              className="w-5 h-5 rounded-full object-cover border border-slate-100 bg-slate-100 shrink-0"
                            />
                            <span className="font-bold text-xs text-slate-800 truncate">
                              {eventUser.name}
                            </span>
                            {event.attendees && event.attendees.length > 1 && (
                              <span className="text-[10px] text-slate-500 font-medium shrink-0">
                                他{event.attendees.length - 1}名
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-amber-600 group-hover:translate-x-0.5 transition-all shrink-0" />
                    </div>

                    {/* 2行目: 内容、日時 */}
                    <div className="flex items-center justify-between gap-3 text-xs pl-0.5">
                      <div className="flex items-center gap-2 min-w-0 flex-1">
                        <span className="font-semibold text-slate-900 truncate min-w-0">
                          {event.title}
                        </span>
                        {event.location && (
                          <span className="text-[11px] text-slate-500 font-medium truncate shrink-0 hidden sm:inline-block">
                            📍 {event.location}
                          </span>
                        )}
                      </div>
                      <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap shrink-0">
                        {formatRelativeTime(event.start)}
                      </span>
                    </div>
                  </div>
                );
              }

              if (item.type === 'topic') {
                const topic = item.data;
                return (
                  <div
                    key={item.id}
                    onClick={() => setSelectedDetailItem(item)}
                    className="bg-white rounded-xl border border-indigo-200/90 hover:border-indigo-300 p-3 shadow-2xs hover:shadow-xs transition-all flex items-center justify-between gap-3 cursor-pointer group"
                  >
                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                      <span className="px-2 py-0.5 bg-indigo-50 text-indigo-700 font-extrabold text-[11px] rounded shrink-0 flex items-center gap-1 border border-indigo-200">
                        <Monitor className="w-3 h-3 text-indigo-600" />
                        掲示板
                      </span>
                      <img
                        src={getAvatarUrl(topic.author?.avatarUrl)}
                        onError={handleAvatarError}
                        alt={topic.author?.name || '匿名'}
                        className="w-6 h-6 rounded-full object-cover border border-slate-100 bg-slate-100 shrink-0"
                      />
                      <span className="font-bold text-xs text-slate-900 truncate min-w-0">
                        {topic.title}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <span className="text-[11px] text-slate-400 font-medium whitespace-nowrap">
                        {formatRelativeTime(topic.createdAt)}
                      </span>
                      <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-indigo-600 group-hover:translate-x-0.5 transition-all" />
                    </div>
                  </div>
                );
              }

              return null;
            })}
          </div>
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

      {/* 詳細ダイアログ (モーダル) */}
      {selectedDetailItem && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedDetailItem(null)}
        >
          <div
            className="bg-white rounded-2xl border border-slate-200 max-w-lg w-full shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 bg-slate-50/50 shrink-0">
              <div className="flex items-center gap-2">
                {selectedDetailItem.type === 'post' && (
                  <span className="px-2.5 py-1 bg-slate-800 text-white font-extrabold text-xs rounded-md flex items-center gap-1">
                    <MessageCircle className="w-3.5 h-3.5" /> つぶやき詳細
                  </span>
                )}
                {selectedDetailItem.type === 'event' && (
                  <span className="px-2.5 py-1 bg-amber-500 text-white font-extrabold text-xs rounded-md flex items-center gap-1">
                    <Calendar className="w-3.5 h-3.5" /> スケジュール詳細
                  </span>
                )}
                {selectedDetailItem.type === 'topic' && (
                  <span className="px-2.5 py-1 bg-indigo-600 text-white font-extrabold text-xs rounded-md flex items-center gap-1">
                    <Monitor className="w-3.5 h-3.5" /> 掲示板詳細
                  </span>
                )}
              </div>
              <button
                onClick={() => setSelectedDetailItem(null)}
                className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-sm text-slate-700">
              {selectedDetailItem.type === 'post' && (() => {
                const post = selectedDetailItem.data;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <img
                          src={getAvatarUrl(post.author?.avatarUrl)}
                          onError={handleAvatarError}
                          alt={post.author?.name || '匿名'}
                          className="w-10 h-10 rounded-full object-cover border border-slate-100 bg-slate-100"
                        />
                        <div>
                          <div className="font-bold text-slate-900 text-sm">{post.author?.name || '匿名'}</div>
                          <div className="text-xs text-slate-400">{post.author?.department || '未設定'}</div>
                        </div>
                      </div>
                      <span className="text-xs text-slate-400">{formatRelativeTime(post.createdAt)}</span>
                    </div>

                    <div className="text-slate-800 leading-relaxed whitespace-pre-wrap bg-slate-50/60 p-4 rounded-xl border border-slate-100">
                      {post.content}
                    </div>

                    {post.nasLink && (
                      <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-center justify-between gap-2">
                        <div className="flex items-start gap-2 min-w-0">
                          <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-xs shrink-0">NAS</span>
                          <a
                            href={`${API_BASE_URL}/nas-file?path=${encodeURIComponent(post.nasLink)}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-indigo-600 hover:underline break-all font-semibold"
                          >
                            {post.nasLink}
                          </a>
                        </div>
                        <button
                          onClick={() => navigator.clipboard.writeText(post.nasLink || '')}
                          className="text-[10px] font-bold text-slate-500 hover:text-slate-700 bg-white border border-slate-200 px-2 py-1 rounded shrink-0"
                        >
                          コピー
                        </button>
                      </div>
                    )}

                    {post.tags && post.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5">
                        {post.tags.map(tag => (
                          <span
                            key={tag}
                            onClick={() => {
                              onSelectTag(tag);
                              setSelectedDetailItem(null);
                            }}
                            className="text-xs text-indigo-600 font-bold bg-indigo-50 hover:bg-indigo-100 px-2.5 py-1 rounded-md cursor-pointer transition-colors"
                          >
                            #{tag}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                      <button
                        onClick={() => onToggleLike(post.id)}
                        className={`flex items-center gap-1.5 text-xs font-bold transition-colors ${
                          post.isLiked ? 'text-pink-600' : 'text-slate-500 hover:text-pink-600'
                        }`}
                      >
                        <Heart className={`w-4 h-4 ${post.isLiked ? 'fill-current' : ''}`} />
                        <span>{post.likes > 0 ? `${post.likes} いいね` : 'いいね'}</span>
                      </button>

                      {onDeletePost && currentUser && (currentUser.isAdmin || currentUser.role === 'admin' || currentUser.id === post.author?.id) && (
                        <button
                          onClick={() => {
                            onDeletePost(post.id);
                            setSelectedDetailItem(null);
                          }}
                          className="text-xs font-bold text-rose-500 hover:text-rose-700 flex items-center gap-1"
                        >
                          <Trash2 className="w-3.5 h-3.5" /> 削除する
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}

              {selectedDetailItem.type === 'event' && (() => {
                const event = selectedDetailItem.data;
                return (
                  <div className="space-y-4">
                    <div>
                      <h3 className="font-bold text-slate-900 text-lg">{event.title}</h3>
                      <span className="text-xs text-slate-400">{formatRelativeTime(event.start)} に追加</span>
                    </div>

                    <div className="bg-amber-50/60 rounded-xl p-4 border border-amber-100 space-y-2 text-xs">
                      <div className="flex items-center gap-2 font-bold text-slate-800">
                        <Clock className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>日時: {new Date(event.start).toLocaleString('ja-JP')}</span>
                      </div>
                      {event.location && (
                        <div className="flex items-center gap-2 text-slate-700">
                          <MapPin className="w-4 h-4 text-amber-600 shrink-0" />
                          <span>場所: {event.location}</span>
                        </div>
                      )}
                      {event.memo && (
                        <p className="text-slate-700 pt-2 border-t border-amber-100 whitespace-pre-wrap leading-relaxed">
                          {event.memo}
                        </p>
                      )}
                      {event.attendees && event.attendees.length > 0 && (
                        <div className="pt-2 border-t border-amber-100">
                          <span className="font-bold text-slate-700 mb-1.5 block">参加メンバー ({event.attendees.length}名):</span>
                          <div className="flex flex-wrap gap-2">
                            {event.attendees.map(a => (
                              <div key={a.id} className="flex items-center gap-1.5 bg-white border border-amber-200 px-2 py-1 rounded-md">
                                <img src={getAvatarUrl(a.avatarUrl)} onError={handleAvatarError} alt={a.name} className="w-4 h-4 rounded-full object-cover" />
                                <span className="font-bold text-[11px] text-slate-800">{a.name}</span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {onChangeTab && (
                      <div className="pt-2 flex justify-end">
                        <button
                          onClick={() => {
                            setSelectedDetailItem(null);
                            onChangeTab('calendar');
                          }}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                        >
                          カレンダーで確認 <ArrowUpRight className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                );
              })()}

              {selectedDetailItem.type === 'topic' && (() => {
                const topic = selectedDetailItem.data;
                return (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <img
                        src={getAvatarUrl(topic.author?.avatarUrl)}
                        onError={handleAvatarError}
                        alt={topic.author?.name || '匿名'}
                        className="w-10 h-10 rounded-full object-cover border border-slate-100 bg-slate-100"
                      />
                      <div>
                        <div className="font-bold text-slate-900 text-sm">{topic.author?.name || '匿名'}</div>
                        <div className="text-xs text-slate-400">{topic.office || '全社'} / {topic.division || '全部署'}</div>
                      </div>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-900 text-base mb-2">{topic.title}</h3>
                      <div className="text-slate-800 leading-relaxed whitespace-pre-wrap bg-slate-50/60 p-4 rounded-xl border border-slate-100">
                        {topic.content}
                      </div>
                    </div>

                    <div className="flex items-center justify-between text-xs pt-3 border-t border-slate-100">
                      <div className="flex items-center gap-3 text-slate-500">
                        <span className="flex items-center gap-1">
                          <MessageSquare className="w-3.5 h-3.5 text-slate-400" />
                          {topic.commentsCount || 0} 件のコメント
                        </span>
                        <span className="flex items-center gap-1">
                          <Eye className="w-3.5 h-3.5 text-slate-400" />
                          {topic.views || 0} 回閲覧
                        </span>
                      </div>

                      {onChangeTab && (
                        <button
                          onClick={() => {
                            setSelectedDetailItem(null);
                            onChangeTab('board');
                          }}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs transition-colors"
                        >
                          掲示板で確認 <ArrowUpRight className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}


