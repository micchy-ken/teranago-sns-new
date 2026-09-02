import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { Post, User } from '../types';
import { getAvatarUrl } from '../utils/avatar';

// Helper to map and sanitize API posts to match frontend types safely
export const mapPostFromApi = (apiPost: any, allUsers: User[]): Post => {
  let authorUser: User | undefined = undefined;

  if (apiPost.author && typeof apiPost.author === 'object') {
    authorUser = apiPost.author;
  } else if (apiPost.authorId) {
    authorUser = allUsers.find(u => u.id === apiPost.authorId);
  }

  if (!authorUser) {
    authorUser = {
      id: apiPost.authorId || (apiPost.author && apiPost.author.id) || 'unknown',
      name: (apiPost.author && apiPost.author.name) || '匿名',
      department: (apiPost.author && apiPost.author.department) || '未設定',
      avatarUrl: '',
    };
  }

  return {
    id: String(apiPost.id),
    author: {
      ...authorUser,
      id: String(authorUser.id),
      avatarUrl: getAvatarUrl(authorUser.avatarUrl),
      department: authorUser.department || '未設定',
    },
    content: apiPost.content || '',
    tags: Array.isArray(apiPost.tags) ? apiPost.tags : [],
    createdAt: apiPost.createdAt || new Date().toISOString(),
    likes: typeof apiPost.likes === 'number' ? apiPost.likes : 0,
    isLiked: !!apiPost.isLiked,
    nasLink: apiPost.nasLink || undefined,
  };
};

export interface UsePostManagementOptions {
  currentUser: User | null;
  usersList: User[];
  onRecordError?: (source: string, msg: string) => void;
  onClearError?: (source: string) => void;
  openConfirmModal?: (options: {
    title: string;
    message: string;
    type?: 'danger' | 'warning' | 'info';
    confirmText?: string;
    cancelText?: string;
    onConfirm: () => void;
  }) => void;
  refetchAll?: () => Promise<void>;
}

export function usePostManagement({
  currentUser,
  usersList,
  onRecordError,
  onClearError,
  openConfirmModal,
  refetchAll,
}: UsePostManagementOptions) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [isPostsLoading, setIsPostsLoading] = useState(false);
  const [postsError, setPostsError] = useState<string | null>(null);

  const refetchPosts = useCallback(async (currentUsers = usersList) => {
    setIsPostsLoading(true);
    setPostsError(null);
    try {
      const response = await fetch(`${API_BASE_URL}/posts`, {
        headers: {
          'Accept': 'application/json'
        }
      });
      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        const mapped = data.map(p => mapPostFromApi(p, currentUsers));
        setPosts(mapped);
        setPostsError(null);
        onClearError?.('posts');
      } else {
        throw new Error('Received posts data is not an array');
      }
    } catch (err: any) {
      console.warn('Failed to load posts from API:', err);
      setPostsError(err?.message || 'Failed to sync with API. Check connectivity.');
      onRecordError?.('posts', `タイムライン取得エラー: ${err?.message || '接続エラー'}`);
    } finally {
      setIsPostsLoading(false);
    }
  }, [usersList, onClearError, onRecordError]);

  // Handle new post creation with API
  const handlePost = useCallback(async (content: string, tags: string[], nasLink?: string) => {
    if (!currentUser) return;

    // Optimistic local post for instant response
    const tempId = `p-temp-${Date.now()}`;
    const newPost: Post = {
      id: tempId,
      author: currentUser,
      content,
      tags,
      createdAt: new Date().toISOString(),
      likes: 0,
      isLiked: false,
      nasLink,
    };
    setPosts(prev => [newPost, ...prev]);

    try {
      const response = await fetch(`${API_BASE_URL}/posts`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify({
          authorId: currentUser.id,
          content,
          tags,
          nasLink: nasLink || "",
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to create post: HTTP status ${response.status}`);
      }

      // Refetch posts to get the actual server-saved posts with correct IDs
      if (refetchAll) {
        await refetchAll();
      } else {
        await refetchPosts();
      }
    } catch (err) {
      console.error('Error creating post on API:', err);
      if (refetchAll) {
        await refetchAll();
      } else {
        await refetchPosts();
      }
    }
  }, [currentUser, refetchAll, refetchPosts]);

  // Handle like toggle with API
  const handleToggleLike = useCallback(async (postId: string) => {
    if (postId.startsWith('p-temp-')) return;

    // Optimistically update local state
    setPosts(prev => prev.map(post => {
      if (post.id === postId) {
        return {
          ...post,
          isLiked: !post.isLiked,
          likes: post.isLiked ? Math.max(0, post.likes - 1) : post.likes + 1,
        };
      }
      return post;
    }));

    try {
      const response = await fetch(`${API_BASE_URL}/posts/${postId}/like`, {
        method: 'POST',
        headers: {
          'Accept': 'application/json',
        }
      });
      if (!response.ok) {
        throw new Error(`Failed to like: HTTP status ${response.status}`);
      }
      
      const updatedPostData = await response.json();
      setPosts(prev => prev.map(post => {
        if (post.id === postId) {
          return mapPostFromApi(updatedPostData, usersList);
        }
        return post;
      }));
    } catch (err) {
      console.error('Error liking post on API:', err);
      if (refetchAll) {
        await refetchAll();
      } else {
        await refetchPosts();
      }
    }
  }, [usersList, refetchAll, refetchPosts]);

  // Handle delete post with API
  const handleDeletePost = useCallback(async (postId: string) => {
    if (postId.startsWith('p-temp-')) return;

    const executeDelete = async () => {
      // Optimistically remove from state
      setPosts(prev => prev.filter(post => post.id !== postId));

      try {
        const response = await fetch(`${API_BASE_URL}/posts/${postId}`, {
          method: 'DELETE',
          headers: {
            'Accept': 'application/json',
          }
        });

        if (!response.ok) {
          throw new Error(`Failed to delete: HTTP status ${response.status}`);
        }

        if (refetchAll) {
          await refetchAll();
        } else {
          await refetchPosts();
        }
      } catch (err) {
        console.error('Error deleting post on API:', err);
        if (refetchAll) {
          await refetchAll();
        } else {
          await refetchPosts();
        }
      }
    };

    if (openConfirmModal) {
      openConfirmModal({
        title: '投稿の削除',
        message: 'この投稿を削除してもよろしいですか？',
        type: 'danger',
        confirmText: '削除する',
        cancelText: 'キャンセル',
        onConfirm: executeDelete,
      });
    } else {
      await executeDelete();
    }
  }, [openConfirmModal, refetchAll, refetchPosts]);

  return {
    posts,
    setPosts,
    isPostsLoading,
    postsError,
    refetchPosts,
    handlePost,
    handleToggleLike,
    handleDeletePost,
  };
}
