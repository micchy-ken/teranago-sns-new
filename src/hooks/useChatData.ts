import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { ChatRoom, User } from '../types';

export function useChatData(
  currentUser: User | null,
  onRecordError: (source: string, msg: string) => void,
  onClearError: (source: string) => void
) {
  const [rooms, setRooms] = useState<ChatRoom[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchRooms = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/chat/rooms`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: チャットルーム取得失敗`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setRooms(data);
        onClearError('chat');
      }
    } catch (err: any) {
      console.warn('[useChatData] Fetch error:', err);
      onRecordError('chat', err.message || 'チャットルームの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onRecordError, onClearError]);

  return {
    rooms,
    setRooms,
    loading,
    fetchRooms,
  };
}
