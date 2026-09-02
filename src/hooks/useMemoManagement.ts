import { useState, useCallback } from 'react';
import { API_BASE_URL } from '../config/api';
import { Memo, User } from '../types';

export interface UseMemoManagementOptions {
  currentUser: User | null;
  usersList: User[];
  onRecordError?: (source: string, msg: string) => void;
  onClearError?: (source: string) => void;
}

export function useMemoManagement({
  currentUser,
  usersList,
  onRecordError,
  onClearError,
}: UseMemoManagementOptions) {
  const [memos, setMemos] = useState<Memo[]>([]);

  const refetchMemos = useCallback(async (currentUsers = usersList) => {
    try {
      const response = await fetch(`${API_BASE_URL}/memos`, {
        headers: { 'Accept': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`HTTP status ${response.status}`);
      }
      const data = await response.json();
      if (Array.isArray(data)) {
        let deletedMemoIds: string[] = [];
        try {
          const stored = localStorage.getItem('deleted_memo_ids');
          if (stored) deletedMemoIds = JSON.parse(stored);
        } catch (_) {}

        const mapped = data
          .filter((m: any) => !deletedMemoIds.includes(String(m.id)))
          .map((m: any) => {
            let detailsObj: any = {};
            if (m.details) {
              if (typeof m.details === 'object') {
                detailsObj = m.details;
              } else if (typeof m.details === 'string') {
                try { detailsObj = JSON.parse(m.details); } catch (_) {}
              }
            }
            if (m.content && typeof m.content === 'string' && m.content.startsWith('{')) {
              try { detailsObj = { ...detailsObj, ...JSON.parse(m.content) }; } catch (_) {}
            }
            const activeUsers = currentUsers;
            const targetUser = activeUsers.find(u => u.id === m.receiverId || u.id === m.toUserId) || activeUsers[0];

            // Determine overall status
            const isHandledStatus = m.status === 'handled' || (detailsObj && detailsObj.status === 'handled');
            const isReadStatus = isHandledStatus || m.status === 'read' || (detailsObj && detailsObj.status === 'read') || m.isRead === 1 || m.isRead === true;

            const defaultRecipientStatus = [{
              userId: targetUser?.id || 'u1',
              userName: targetUser?.name || '担当者',
              avatarUrl: targetUser?.avatarUrl || '',
              department: targetUser?.department || '',
              office: targetUser?.office || '',
              division: targetUser?.division || '',
              isViewed: isReadStatus,
              isHandled: isHandledStatus
            }];

            // Parse recipientStatusesJson / recipient_statuses_json / recipientStatuses
            let parsedRecipientStatuses: any[] | null = null;
            const repJson = m.recipientStatusesJson || m.recipient_statuses_json || m.recipientStatuses || (detailsObj && (detailsObj.recipientStatuses || detailsObj.recipientStatusesJson || detailsObj.recipient_statuses_json));
            if (repJson) {
              try {
                const parsed = typeof repJson === 'string' ? JSON.parse(repJson) : repJson;
                if (Array.isArray(parsed)) {
                  parsedRecipientStatuses = parsed;
                } else if (parsed && typeof parsed === 'object') {
                  // DB stores as { "u3": { "isRead": false, "readAt": null } }
                  parsedRecipientStatuses = Object.entries(parsed).map(([uid, val]: [string, any]) => {
                    const uObj = activeUsers.find(u => u.id === uid);
                    return {
                      userId: uid,
                      userName: uObj?.name || '担当者',
                      avatarUrl: uObj?.avatarUrl || '',
                      department: uObj?.department || '',
                      office: uObj?.office || '',
                      division: uObj?.division || '',
                      isViewed: val.isRead || val.isViewed || false,
                      viewedAt: val.readAt || val.viewedAt || undefined,
                      isHandled: val.isHandled !== undefined ? val.isHandled : (val.isRead || false),
                      handledAt: val.handledAt || undefined,
                    };
                  });
                }
              } catch (_) {}
            }

            const mergedRecipientStatuses = (parsedRecipientStatuses && parsedRecipientStatuses.length > 0)
              ? parsedRecipientStatuses
              : defaultRecipientStatus;

            const mergedTargetOffices = (Array.isArray(m.targetOffices) && m.targetOffices.length > 0)
              ? m.targetOffices
              : (detailsObj && Array.isArray(detailsObj.targetOffices) ? detailsObj.targetOffices : []);

            const mergedTargetDivisions = (Array.isArray(m.targetDivisions) && m.targetDivisions.length > 0)
              ? m.targetDivisions
              : (detailsObj && Array.isArray(detailsObj.targetDivisions) ? detailsObj.targetDivisions : []);

            let parsedToUsers: any[] | null = null;
            const toUsersJsonStr = m.toUsersJson || m.to_users_json;
            if (toUsersJsonStr) {
              try {
                const parsed = typeof toUsersJsonStr === 'string' ? JSON.parse(toUsersJsonStr) : toUsersJsonStr;
                if (Array.isArray(parsed)) {
                  parsedToUsers = parsed.map((uid: string) => activeUsers.find(u => u.id === uid)).filter(Boolean);
                }
              } catch (_) {}
            }

            const mergedToUsers = parsedToUsers || (Array.isArray(m.toUsers) ? m.toUsers : (detailsObj && Array.isArray(detailsObj.toUsers) ? detailsObj.toUsers : (targetUser ? [targetUser] : [])));

            return {
              id: String(m.id),
              fromName: m.fromName || (detailsObj && detailsObj.fromName) || '不詳',
              fromCompany: m.fromCompany || (detailsObj && detailsObj.fromCompany) || '',
              fromPhone: m.fromPhone || (detailsObj && detailsObj.fromPhone) || '',
              content: m.content || (detailsObj && detailsObj.content) || '',
              createdAt: m.createdAt || (detailsObj && detailsObj.createdAt) || new Date().toISOString(),
              ...detailsObj,
              ...m,
              targetOffices: mergedTargetOffices,
              targetDivisions: mergedTargetDivisions,
              recipientStatuses: mergedRecipientStatuses,
              toUsers: mergedToUsers,
              toUser: targetUser,
              createdByUser: activeUsers.find(u => u.id === (m.senderId || (detailsObj && detailsObj.senderId))),
              status: m.status ? m.status : ((detailsObj && detailsObj.status) ? detailsObj.status : (isHandledStatus ? 'handled' : (isReadStatus ? 'read' : 'unread'))),
            };
          });

        setMemos(mapped);
        onClearError?.('memos');
      }
    } catch (err: any) {
      console.warn('Failed to load memos from API:', err);
      onRecordError?.('memos', `伝言メモ取得エラー: ${err?.message || '接続エラー'}`);
    }
  }, [usersList, onClearError, onRecordError]);

  const handleDeleteMemo = useCallback(async (memoId: string) => {
    try {
      let deletedIds: string[] = [];
      const stored = localStorage.getItem('deleted_memo_ids');
      if (stored) deletedIds = JSON.parse(stored);
      if (!deletedIds.includes(memoId)) {
        deletedIds.push(memoId);
        localStorage.setItem('deleted_memo_ids', JSON.stringify(deletedIds));
      }
    } catch (_) {}

    setMemos(prevMemos => prevMemos.filter(memo => memo.id !== memoId));
    try {
      await fetch(`${API_BASE_URL}/memos/${memoId}`, {
        method: 'DELETE'
      });
      await refetchMemos();
    } catch (err) {
      console.error('Failed to delete memo via API:', err);
    }
  }, [refetchMemos]);

  const handleUpdateMemos = useCallback(async (updatedMemos: any[]) => {
    // 1. 楽観的UIアップデート
    setMemos(updatedMemos);
    window.dispatchEvent(new CustomEvent('notifications_updated'));

    try {
      const changedMemos = updatedMemos.filter(updatedMemo => {
        const originalMemo = memos.find(m => m.id === updatedMemo.id);
        if (!originalMemo) return true; // 新規メモ

        const isStatusChanged = originalMemo.status !== updatedMemo.status;
        const isRecipientStatusesChanged = JSON.stringify(originalMemo.recipientStatuses) !== JSON.stringify(updatedMemo.recipientStatuses);
        
        return isStatusChanged || isRecipientStatusesChanged;
      });

      if (changedMemos.length === 0) {
        return;
      }

      const existingIds = new Set(memos.map(m => m.id));

      await Promise.all(
        changedMemos.map(async (memo) => {
          const recipientStatusesJsonStr = JSON.stringify(memo.recipientStatuses);
          if (!existingIds.has(memo.id)) {
            // 新規メモ作成
            await fetch(`${API_BASE_URL}/memos`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                id: memo.id,
                senderId: currentUser?.id || 'u1',
                receiverId: memo.toUserId || memo.toUser?.id || 'u1',
                fromName: memo.fromName,
                fromCompany: memo.fromCompany,
                fromPhone: memo.fromPhone,
                content: memo.content,
                requirementType: memo.requirementType || 'phone_called',
                requirementText: memo.requirementText || '',
                recipientStatusesJson: recipientStatusesJsonStr,
                recipient_statuses_json: recipientStatusesJsonStr,
                recipientStatuses: recipientStatusesJsonStr,
                details: {
                  requirementType: memo.requirementType,
                  requirementText: memo.requirementText,
                  targetOffices: memo.targetOffices,
                  targetDivisions: memo.targetDivisions,
                  recipientStatuses: memo.recipientStatuses,
                },
                isRead: (memo.status === 'handled' || memo.status === 'read') ? 1 : 0,
                status: memo.status,
                createdAt: memo.createdAt || new Date().toISOString()
              })
            });
          } else {
            // 既存メモの更新
            await fetch(`${API_BASE_URL}/memos/${memo.id}`, {
              method: 'PUT',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                isRead: (memo.status === 'handled' || memo.status === 'read') ? 1 : 0,
                status: memo.status,
                recipientStatusesJson: recipientStatusesJsonStr,
                recipient_statuses_json: recipientStatusesJsonStr,
                recipientStatuses: recipientStatusesJsonStr,
                details: {
                  requirementType: memo.requirementType,
                  requirementText: memo.requirementText,
                  targetOffices: memo.targetOffices,
                  targetDivisions: memo.targetDivisions,
                  recipientStatuses: memo.recipientStatuses,
                }
              })
            });
          }
        })
      );

      await refetchMemos();
    } catch (err) {
      console.warn('Failed to sync memos via API:', err);
    } finally {
      window.dispatchEvent(new CustomEvent('notifications_updated'));
    }
  }, [currentUser?.id, memos, refetchMemos]);

  return {
    memos,
    setMemos,
    refetchMemos,
    handleDeleteMemo,
    handleUpdateMemos,
  };
}
