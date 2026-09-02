import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { User, OfficeMaster, DivisionMaster, PositionMaster, ItemMaster } from '../types';

export function useMasterData(
  onRecordError: (source: string, msg: string) => void,
  onClearError: (source: string) => void
) {
  const [usersList, setUsersList] = useState<User[]>([]);
  const [offices, setOffices] = useState<OfficeMaster[]>([]);
  const [divisions, setDivisions] = useState<DivisionMaster[]>([]);
  const [positions, setPositions] = useState<PositionMaster[]>([]);
  const [items, setItems] = useState<ItemMaster[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE_URL}/users`);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data)) {
          setUsersList(data);
          onClearError('users');
        }
      }
    } catch (err: any) {
      console.warn('[useMasterData] Fetch users error:', err);
      onRecordError('users', err.message || 'ユーザー情報の取得に失敗しました');
    }
  }, [onRecordError, onClearError]);

  const fetchMasters = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE_URL}/masters`);
      if (res.ok) {
        const data = await res.json();
        if (data.offices) setOffices(data.offices);
        if (data.divisions) setDivisions(data.divisions);
        if (data.positions) setPositions(data.positions);
        if (data.items) setItems(data.items);
        onClearError('masters');
      }
    } catch (err: any) {
      console.warn('[useMasterData] Fetch masters error:', err);
      onRecordError('masters', err.message || 'マスタ情報の取得に失敗しました');
    } finally {
      setLoading(false);
    }
  }, [onRecordError, onClearError]);

  return {
    usersList,
    setUsersList,
    offices,
    setOffices,
    divisions,
    setDivisions,
    positions,
    setPositions,
    items,
    setItems,
    loading,
    fetchUsers,
    fetchMasters,
  };
}
