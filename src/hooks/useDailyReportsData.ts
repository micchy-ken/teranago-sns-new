import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { DailyReport, User } from '../types';

export function useDailyReportsData(
  currentUser: User | null,
  onRecordError: (source: string, msg: string) => void,
  onClearError: (source: string) => void
) {
  const [reports, setReports] = useState<DailyReport[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchReports = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/reports`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: 日報取得失敗`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setReports(data);
        onClearError('reports');
      }
    } catch (err: any) {
      console.warn('[useDailyReportsData] Fetch error:', err);
      onRecordError('reports', err.message || '日報データの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onRecordError, onClearError]);

  return {
    reports,
    setReports,
    loading,
    fetchReports,
  };
}
