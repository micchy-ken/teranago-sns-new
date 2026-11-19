import { useState, useCallback, useEffect, useRef } from 'react';
import { API_BASE_URL, getAuthToken } from '../config/api';
import { OfficeMaster, DivisionMaster, PositionMaster, ItemMaster, ApprovalFlowRule } from '../types';

export interface UseMasterManagementOptions {
  onRecordError?: (source: string, msg: string) => void;
  onClearError?: (source: string) => void;
  showMasterErrorModal?: (title: string, errorMsg: string) => void;
}

export function useMasterManagement(
  optionsOrOnRecordError?: UseMasterManagementOptions | ((source: string, msg: string) => void),
  onClearErrorArg?: (source: string) => void,
  showMasterErrorModalArg?: (title: string, errorMsg: string) => void
) {
  let onRecordError: ((source: string, msg: string) => void) | undefined;
  let onClearError: ((source: string) => void) | undefined;
  let showMasterErrorModal: ((title: string, errorMsg: string) => void) | undefined;

  if (typeof optionsOrOnRecordError === 'object' && optionsOrOnRecordError !== null) {
    onRecordError = optionsOrOnRecordError.onRecordError;
    onClearError = optionsOrOnRecordError.onClearError;
    showMasterErrorModal = optionsOrOnRecordError.showMasterErrorModal;
  } else if (typeof optionsOrOnRecordError === 'function') {
    onRecordError = optionsOrOnRecordError;
    onClearError = onClearErrorArg;
    showMasterErrorModal = showMasterErrorModalArg;
  }

  const onRecordErrorRef = useRef(onRecordError);
  const onClearErrorRef = useRef(onClearError);
  const showMasterErrorModalRef = useRef(showMasterErrorModal);
  useEffect(() => {
    onRecordErrorRef.current = onRecordError;
    onClearErrorRef.current = onClearError;
    showMasterErrorModalRef.current = showMasterErrorModal;
  });

  const [offices, setOffices] = useState<OfficeMaster[]>([]);
  const [divisions, setDivisions] = useState<DivisionMaster[]>([]);
  const [positions, setPositions] = useState<PositionMaster[]>([]);
  const [approvalFlows, setApprovalFlows] = useState<ApprovalFlowRule[]>([]);
  const [itemMasters, setItemMasters] = useState<ItemMaster[]>([]);

  const isFetchingRef = useRef(false);

  const getMasterErrorMessage = async (response: Response): Promise<string> => {
    try {
      const data = await response.json();
      return data.error || data.message || `HTTP ${response.status}`;
    } catch (_) {
      try {
        const text = await response.text();
        return text || `HTTP ${response.status}`;
      } catch (_) {
        return `HTTP ${response.status}`;
      }
    }
  };

  const refetchMasters = useCallback(async () => {
    if (!getAuthToken()) return;
    if (isFetchingRef.current) return;
    isFetchingRef.current = true;

    const parseError = async (res: Response, label: string) => {
      let msg = `${label}取得エラー (HTTP ${res.status})`;
      try {
        const clone = res.clone();
        const errData = await clone.json();
        if (errData && errData.error) {
          return `${msg}: ${errData.error}${errData.details ? ' (' + errData.details + ')' : ''}`;
        }
      } catch (_) {}
      try {
        const errText = await res.text();
        if (errText) {
          return `${msg}: ${errText.slice(0, 150)}`;
        }
      } catch (_) {}
      return msg;
    };

    try {
      // 拠点マスタ
      try {
        const offRes = await fetch(`${API_BASE_URL}/masters/offices`);
        if (offRes.ok) {
          const data = await offRes.json();
          if (Array.isArray(data)) {
            setOffices(data);
            onClearErrorRef.current?.('offices');
          }
        } else {
          const errMsg = await parseError(offRes, '拠点マスタ');
          onRecordErrorRef.current?.('offices', errMsg);
        }
      } catch (e: any) {
        onRecordErrorRef.current?.('offices', '拠点マスタ接続エラー: ' + e.message);
      }

      // 部署マスタ
      try {
        const divRes = await fetch(`${API_BASE_URL}/masters/divisions`);
        if (divRes.ok) {
          const data = await divRes.json();
          if (Array.isArray(data)) {
            setDivisions(data);
            onClearErrorRef.current?.('divisions');
          }
        } else {
          const errMsg = await parseError(divRes, '部署マスタ');
          onRecordErrorRef.current?.('divisions', errMsg);
        }
      } catch (e: any) {
        onRecordErrorRef.current?.('divisions', '部署マスタ接続エラー: ' + e.message);
      }

      // 役職マスタ
      try {
        const posRes = await fetch(`${API_BASE_URL}/masters/positions`);
        if (posRes.ok) {
          const data = await posRes.json();
          if (Array.isArray(data)) {
            setPositions(data.filter((p: any) => p && p.name !== '一般'));
            onClearErrorRef.current?.('positions');
          }
        } else {
          const errMsg = await parseError(posRes, '役職マスタ');
          onRecordErrorRef.current?.('positions', errMsg);
        }
      } catch (e: any) {
        onRecordErrorRef.current?.('positions', '役職マスタ接続エラー: ' + e.message);
      }

      // 品目マスタ
      try {
        const itemRes = await fetch(`${API_BASE_URL}/masters/item-masters`);
        if (itemRes.ok) {
          const data = await itemRes.json();
          if (Array.isArray(data)) {
            const normalized: ItemMaster[] = data.map((item: any) => {
              const rawPrice = item.defaultUnitPrice !== undefined && item.defaultUnitPrice !== null && item.defaultUnitPrice !== ''
                ? item.defaultUnitPrice
                : item.unitPrice !== undefined && item.unitPrice !== null && item.unitPrice !== ''
                ? item.unitPrice
                : item.price !== undefined && item.price !== null && item.price !== ''
                ? item.price
                : undefined;
              const price = rawPrice !== undefined ? Number(rawPrice) : undefined;
              return {
                ...item,
                defaultUnitPrice: price,
                unitPrice: price,
              };
            });
            setItemMasters(normalized);
            onClearErrorRef.current?.('items');
          }
        } else {
          const errMsg = await parseError(itemRes, '品目マスタ');
          onRecordErrorRef.current?.('items', errMsg);
        }
      } catch (e: any) {
        onRecordErrorRef.current?.('items', '品目マスタ接続エラー: ' + e.message);
      }

      // 承認フローマスタ
      try {
        const flowRes = await fetch(`${API_BASE_URL}/masters/approval-flows`);
        if (flowRes.ok) {
          const data = await flowRes.json();
          if (Array.isArray(data)) {
            setApprovalFlows(
              data.map((f: any) => ({
                ...f,
                targetOfficeIds: Array.isArray(f?.targetOfficeIds) ? f.targetOfficeIds : [],
                priority: Number.isFinite(Number(f?.priority)) ? Number(f.priority) : 0,
                steps: Array.isArray(f?.steps) ? f.steps : [],
              }))
            );
            onClearErrorRef.current?.('flows');
          }
        } else {
          const errMsg = await parseError(flowRes, '承認フロー');
          onRecordErrorRef.current?.('flows', errMsg);
        }
      } catch (e: any) {
        onRecordErrorRef.current?.('flows', '承認フロー接続エラー: ' + e.message);
      }
    } finally {
      isFetchingRef.current = false;
    }
  }, []);

  // 拠点操作
  const handleAddOffice = async (officeData: Omit<OfficeMaster, 'id'>) => {
    const originalOffices = [...offices];
    const newOffice: OfficeMaster = {
      ...officeData,
      id: `off-${Date.now()}`,
    };
    setOffices(prev => [...prev, newOffice]);
    try {
      const response = await fetch(`${API_BASE_URL}/masters/offices`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newOffice)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to add office:', e);
      setOffices(originalOffices);
      showMasterErrorModal?.('拠点マスターの追加', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  const handleUpdateOffice = async (updatedOffice: OfficeMaster) => {
    const originalOffices = [...offices];
    setOffices(prev => prev.map((o) => (o.id === updatedOffice.id ? updatedOffice : o)));
    try {
      const response = await fetch(`${API_BASE_URL}/masters/offices/${updatedOffice.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedOffice)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to update office:', e);
      setOffices(originalOffices);
      showMasterErrorModal?.('拠点マスターの更新', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  const handleDeleteOffice = async (officeId: string) => {
    const originalOffices = [...offices];
    setOffices(prev => prev.filter((o) => o.id !== officeId));
    try {
      const response = await fetch(`${API_BASE_URL}/masters/offices/${officeId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to delete office:', e);
      setOffices(originalOffices);
      showMasterErrorModal?.('拠点マスターの削除', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  // 部署操作
  const handleAddDivision = async (divisionData: Omit<DivisionMaster, 'id'>) => {
    const originalDivisions = [...divisions];
    const newDivision: DivisionMaster = {
      ...divisionData,
      id: `div-${Date.now()}`,
    };
    setDivisions(prev => [...prev, newDivision]);
    try {
      const response = await fetch(`${API_BASE_URL}/masters/divisions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newDivision)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to add division:', e);
      setDivisions(originalDivisions);
      showMasterErrorModal?.('部署マスターの追加', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  const handleUpdateDivision = async (updatedDivision: DivisionMaster) => {
    const originalDivisions = [...divisions];
    setDivisions(prev => prev.map((d) => (d.id === updatedDivision.id ? updatedDivision : d)));
    try {
      const response = await fetch(`${API_BASE_URL}/masters/divisions/${updatedDivision.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedDivision)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to update division:', e);
      setDivisions(originalDivisions);
      showMasterErrorModal?.('部署マスターの更新', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  const handleDeleteDivision = async (divisionId: string) => {
    const originalDivisions = [...divisions];
    setDivisions(prev => prev.filter((d) => d.id !== divisionId));
    try {
      const response = await fetch(`${API_BASE_URL}/masters/divisions/${divisionId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to delete division:', e);
      setDivisions(originalDivisions);
      showMasterErrorModal?.('部署マスターの削除', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  // 役職操作
  const handleAddPosition = async (positionData: Omit<PositionMaster, 'id'>) => {
    const originalPositions = [...positions];
    const newPosition: PositionMaster = {
      ...positionData,
      id: `pos-${Date.now()}`,
    };
    setPositions(prev => [...prev, newPosition]);
    try {
      const response = await fetch(`${API_BASE_URL}/masters/positions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newPosition)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to add position:', e);
      setPositions(originalPositions);
      showMasterErrorModal?.('役職マスターの追加', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  const handleUpdatePosition = async (updatedPosition: PositionMaster) => {
    const originalPositions = [...positions];
    setPositions(prev => prev.map((p) => (p.id === updatedPosition.id ? updatedPosition : p)));
    try {
      const response = await fetch(`${API_BASE_URL}/masters/positions/${updatedPosition.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedPosition)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to update position:', e);
      setPositions(originalPositions);
      showMasterErrorModal?.('役職マスターの更新', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  const handleDeletePosition = async (positionId: string) => {
    const originalPositions = [...positions];
    setPositions(prev => prev.filter((p) => p.id !== positionId));
    try {
      const response = await fetch(`${API_BASE_URL}/masters/positions/${positionId}`, { method: 'DELETE' });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.error('Failed to delete position:', e);
      setPositions(originalPositions);
      showMasterErrorModal?.('役職マスターの削除', e.message || 'ネットワークエラーが発生しました。');
    }
  };

  // 品目マスタ操作
  const handleAddItemMaster = async (item: Omit<ItemMaster, 'id'>) => {
    const rawPrice = item.defaultUnitPrice ?? item.unitPrice;
    const price = rawPrice !== undefined && rawPrice !== null ? Number(rawPrice) : undefined;
    const newItem: ItemMaster = {
      ...item,
      defaultUnitPrice: price,
      unitPrice: price,
      id: `itm_${Date.now()}`
    };
    setItemMasters(prev => [...prev, newItem]);
    try {
      await fetch(`${API_BASE_URL}/masters/item-masters`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newItem)
      });
      await refetchMasters();
    } catch (e) { console.error('Failed to save item master:', e); }
  };

  const handleUpdateItemMaster = async (updatedItem: ItemMaster) => {
    const rawPrice = updatedItem.defaultUnitPrice ?? updatedItem.unitPrice;
    const price = rawPrice !== undefined && rawPrice !== null ? Number(rawPrice) : undefined;
    const normalizedItem: ItemMaster = {
      ...updatedItem,
      defaultUnitPrice: price,
      unitPrice: price,
    };
    setItemMasters(prev => prev.map(i => i.id === normalizedItem.id ? normalizedItem : i));
    try {
      await fetch(`${API_BASE_URL}/masters/item-masters/${normalizedItem.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(normalizedItem)
      });
      await refetchMasters();
    } catch (e) { console.error('Failed to update item master:', e); }
  };

  const handleDeleteItemMaster = async (id: string) => {
    setItemMasters(prev => prev.filter(i => i.id !== id));
    try {
      await fetch(`${API_BASE_URL}/masters/item-masters/${id}`, { method: 'DELETE' });
      await refetchMasters();
    } catch (e) { console.error('Failed to delete item master:', e); }
  };

  // 承認フローマスタ操作
  const sendApprovalFlowRequest = async (
    url: string,
    init: RequestInit,
    fallbackPostBody?: ApprovalFlowRule
  ): Promise<Response> => {
    try {
      const res = await fetch(url, init);
      if ((res.status === 404 || res.status === 405) && fallbackPostBody) {
        return await fetch(`${API_BASE_URL}/masters/approval-flows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fallbackPostBody),
        });
      }
      return res;
    } catch (firstErr) {
      // リバースプロキシのkeep-alive切断や一時的なサーバー再起動に対して1回自動リトライ（更新時はPOST upsertへフォールバック）
      await new Promise((resolve) => setTimeout(resolve, 350));
      if (fallbackPostBody) {
        return await fetch(`${API_BASE_URL}/masters/approval-flows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(fallbackPostBody),
        });
      }
      return await fetch(url, init);
    }
  };

  const handleAddApprovalFlow = async (flowData: Omit<ApprovalFlowRule, 'id'>) => {
    const originalFlows = [...approvalFlows];
    const newFlow: ApprovalFlowRule = {
      ...flowData,
      id: `flow-${Date.now()}`,
      targetOfficeIds: Array.isArray(flowData.targetOfficeIds) ? flowData.targetOfficeIds : [],
      priority: Number.isFinite(Number(flowData.priority)) ? Number(flowData.priority) : 0,
    };
    setApprovalFlows(prev => [...prev, newFlow]);
    try {
      const response = await sendApprovalFlowRequest(`${API_BASE_URL}/masters/approval-flows`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newFlow)
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.warn('Failed to add approval flow:', e);
      setApprovalFlows(originalFlows);
      showMasterErrorModal?.(
        '承認フローの追加',
        e?.message && e.message !== 'Failed to fetch'
          ? e.message
          : 'APIサーバーとの通信に失敗しました。サーバーの稼働状況・ネットワーク接続をご確認のうえ、再度お試しください。'
      );
    }
  };

  const handleUpdateApprovalFlow = async (updatedFlow: ApprovalFlowRule) => {
    const originalFlows = [...approvalFlows];
    const normalizedFlow: ApprovalFlowRule = {
      ...updatedFlow,
      targetOfficeIds: Array.isArray(updatedFlow.targetOfficeIds) ? updatedFlow.targetOfficeIds : [],
      priority: Number.isFinite(Number(updatedFlow.priority)) ? Number(updatedFlow.priority) : 0,
    };
    setApprovalFlows(prev => prev.map(f => f.id === normalizedFlow.id ? normalizedFlow : f));
    try {
      const encodedId = encodeURIComponent(String(normalizedFlow.id));
      const response = await sendApprovalFlowRequest(
        `${API_BASE_URL}/masters/approval-flows/${encodedId}`,
        {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(normalizedFlow)
        },
        normalizedFlow
      );
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.warn('Failed to update approval flow:', e);
      setApprovalFlows(originalFlows);
      showMasterErrorModal?.(
        '承認フローの更新',
        e?.message && e.message !== 'Failed to fetch'
          ? e.message
          : 'APIサーバーとの通信に失敗しました。サーバーの稼働状況・ネットワーク接続をご確認のうえ、再度お試しください。'
      );
    }
  };

  const handleDeleteApprovalFlow = async (id: string) => {
    const originalFlows = [...approvalFlows];
    setApprovalFlows(prev => prev.filter(f => f.id !== id));
    try {
      const encodedId = encodeURIComponent(String(id));
      const response = await sendApprovalFlowRequest(`${API_BASE_URL}/masters/approval-flows/${encodedId}`, {
        method: 'DELETE'
      });
      if (!response.ok) {
        const errMsg = await getMasterErrorMessage(response);
        throw new Error(errMsg);
      }
      await refetchMasters();
    } catch (e: any) {
      console.warn('Failed to delete approval flow:', e);
      setApprovalFlows(originalFlows);
      showMasterErrorModal?.(
        '承認フローの削除',
        e?.message && e.message !== 'Failed to fetch'
          ? e.message
          : 'APIサーバーとの通信に失敗しました。サーバーの稼働状況・ネットワーク接続をご確認のうえ、再度お試しください。'
      );
    }
  };

  useEffect(() => {
    refetchMasters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return {
    offices,
    divisions,
    positions,
    itemMasters,
    approvalFlows,
    refetchMasters,
    handleAddOffice,
    handleUpdateOffice,
    handleDeleteOffice,
    handleAddDivision,
    handleUpdateDivision,
    handleDeleteDivision,
    handleAddPosition,
    handleUpdatePosition,
    handleDeletePosition,
    handleAddItemMaster,
    handleUpdateItemMaster,
    handleDeleteItemMaster,
    handleAddApprovalFlow,
    handleUpdateApprovalFlow,
    handleDeleteApprovalFlow,
  };
}
