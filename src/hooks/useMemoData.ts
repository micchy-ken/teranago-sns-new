import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { Memo, User } from '../types';

export function useMemoData(
  currentUser: User | null,
  onRecordError: (source: string, msg: string) => void,
  onClearError: (source: string) => void
) {
  const [memos, setMemos] = useState<Memo[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchMemos = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/memos`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: メモ取得失敗`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setMemos(data);
        onClearError('memos');
      }
    } catch (err: any) {
      console.warn('[useMemoData] Fetch error:', err);
      onRecordError('memos', err.message || '回覧メモの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onRecordError, onClearError]);

  return {
    memos,
    setMemos,
    loading,
    fetchMemos,
  };
}
