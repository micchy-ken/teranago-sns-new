import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { CalendarEvent, User } from '../types';

export function useCalendarData(
  currentUser: User | null,
  onRecordError: (source: string, msg: string) => void,
  onClearError: (source: string) => void
) {
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchEvents = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/events`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: カレンダーイベント取得失敗`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setEvents(data);
        onClearError('events');
      }
    } catch (err: any) {
      console.warn('[useCalendarData] Fetch error:', err);
      onRecordError('events', err.message || 'カレンダーイベントの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onRecordError, onClearError]);

  return {
    events,
    setEvents,
    loading,
    fetchEvents,
  };
}
