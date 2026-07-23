import React from 'react';
import { Heart, MessageCircle, Share2, MoreHorizontal } from 'lucide-react';
import { Post } from '../types';
import { formatRelativeTime } from '../utils';

interface PostCardProps {
  post: Post;
  onLike: (postId: string) => void;
  onTagClick: (tag: string) => void;
}

export const PostCard: React.FC<PostCardProps> = ({ post, onLike, onTagClick }) => {
  return (
    <article className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-shadow">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="flex items-center gap-3 w-full">
          <img
            src={post.author.avatarUrl}
            alt={post.author.name}
            className="w-10 h-10 rounded-full object-cover border border-slate-100 bg-slate-100 shrink-0"
          />
          <div className="flex flex-col sm:flex-row sm:items-center justify-between w-full gap-1 sm:gap-4">
            <div className="flex items-center gap-2">
              <span className="font-bold text-slate-800">{post.author.name}</span>
              <span className="text-xs px-2 py-0.5 bg-slate-100 text-slate-500 rounded">{post.author.department}</span>
            </div>
            <span className="text-xs text-slate-400">{formatRelativeTime(post.createdAt)}</span>
          </div>
        </div>
        <button className="text-slate-400 hover:text-slate-600 p-1 rounded-full hover:bg-slate-50 transition-colors ml-2 shrink-0">
          <MoreHorizontal className="w-5 h-5" />
        </button>
      </div>

      {/* Content */}
      <div className="mb-4">
        <p className="mt-2 text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
          {post.content}
        </p>
        
        {post.nasLink && (
          <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-lg flex items-start gap-2">
            <span className="text-xs font-bold text-slate-500 bg-white border border-slate-200 px-1.5 py-0.5 rounded shadow-sm shrink-0">NAS</span>
            <a href="#" className="text-sm text-indigo-600 hover:underline break-all" title="NASパスをコピーする">
              {post.nasLink}
            </a>
          </div>
        )}
      </div>

      {/* Tags */}
      {post.tags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2 mb-4">
          {post.tags.map((tag) => (
            <button
              key={tag}
              onClick={() => onTagClick(tag)}
              className="text-xs text-indigo-600 font-medium bg-indigo-50 hover:bg-indigo-100 px-2 py-0.5 rounded transition-colors"
            >
              #{tag}
            </button>
          ))}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-6 pt-3 border-t border-slate-100">
        <button
          onClick={() => onLike(post.id)}
          className={`flex items-center gap-1.5 text-xs font-medium transition-colors ${
            post.isLiked
              ? 'text-pink-600'
              : 'text-slate-500 hover:text-pink-600'
          }`}
        >
          <Heart
            className={`w-4 h-4 ${post.isLiked ? 'fill-current' : ''}`}
          />
          <span>{post.likes > 0 ? post.likes : 'いいね'}</span>
        </button>

        <button className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors">
          <MessageCircle className="w-4 h-4" />
          <span>コメント</span>
        </button>

        <button className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-emerald-600 transition-colors ml-auto">
          <Share2 className="w-4 h-4" />
          <span className="hidden sm:inline">共有</span>
        </button>
      </div>
    </article>
  );
}
