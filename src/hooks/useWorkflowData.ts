import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { WorkflowApplication, User } from '../types';

export function useWorkflowData(
  currentUser: User | null, 
  allUsers: User[],
  onRecordError: (source: string, msg: string) => void,
  onClearError: (source: string) => void
) {
  const [applications, setApplications] = useState<WorkflowApplication[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchWorkflows = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/workflows`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ワークフロー取得失敗`);
      }
      const data = await res.json();
      if (Array.isArray(data)) {
        setApplications(data);
        onClearError('workflows');
      }
    } catch (err: any) {
      console.warn('[useWorkflowData] Fetch error:', err);
      onRecordError('workflows', err.message || 'ワークフローデータの取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onRecordError, onClearError]);

  return {
    applications,
    setApplications,
    loading,
    fetchWorkflows,
  };
}
