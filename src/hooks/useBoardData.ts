import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { BoardTopic, User } from '../types';

export function useBoardData(
  currentUser: User | null,
  onRecordError: (source: string, msg: string) => void,
  onClearError: (source: string) => void
) {
  const [topics, setTopics] = useState<BoardTopic[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchTopics = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/bulletins`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: 掲示板トピック取得失敗`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setTopics(data);
        onClearError('bulletins');
      }
    } catch (err: any) {
      console.warn('[useBoardData] Fetch error:', err);
      onRecordError('bulletins', err.message || '掲示板トピックの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onRecordError, onClearError]);

  return {
    topics,
    setTopics,
    loading,
    fetchTopics,
  };
}
