import React, { useMemo } from 'react';
import { PostForm } from './PostForm';
import { PostCard } from './PostCard';
import { Post } from '../types';

interface TimelineProps {
  posts: Post[];
  searchQuery: string;
  selectedTag: string | null;
  onPost: (content: string, tags: string[]) => void;
  onToggleLike: (postId: string) => void;
  onSelectTag: (tag: string | null) => void;
}

export function Timeline({ posts, searchQuery, selectedTag, onPost, onToggleLike, onSelectTag }: TimelineProps) {
  const filteredPosts = useMemo(() => {
    return posts.filter(post => {
      // 1. Tag filter
      if (selectedTag && !post.tags.includes(selectedTag)) {
        return false;
      }

      // 2. Search query filter
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const contentMatch = post.content.toLowerCase().includes(query);
        const authorMatch = post.author.name.toLowerCase().includes(query);
        const departmentMatch = post.author.department.toLowerCase().includes(query);
        const tagMatch = post.tags.some(tag => tag.toLowerCase().includes(query));

        if (!contentMatch && !authorMatch && !departmentMatch && !tagMatch) {
          return false;
        }
      }

      return true;
    });
  }, [posts, searchQuery, selectedTag]);

  return (
    <div className="flex-1 space-y-6 min-w-0">
      <PostForm onPost={onPost} />

      {/* Timeline Header */}
      <div className="flex items-center justify-between text-sm text-slate-500 font-medium px-1">
        <span>
          {selectedTag ? `#${selectedTag} の投稿` : '最新の投稿'}
          {searchQuery && ` 「${searchQuery}」の検索結果`}
        </span>
        <span>{filteredPosts.length} 件</span>
      </div>

      {/* Feed */}
      <div className="space-y-4">
        {filteredPosts.length > 0 ? (
          filteredPosts.map(post => (
            <PostCard
              key={post.id}
              post={post}
              onLike={onToggleLike}
              onTagClick={onSelectTag}
            />
          ))
        ) : (
          <div className="text-center py-12 bg-white rounded-xl border border-slate-200 p-5 shadow-sm ring-1 ring-slate-900/5">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
              <span className="text-2xl">🔍</span>
            </div>
            <h3 className="text-slate-900 font-medium mb-1">投稿が見つかりません</h3>
            <p className="text-slate-500 text-sm">
              検索条件を変えるか、新しい投稿を作成してください。
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
