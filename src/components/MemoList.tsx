import React, { useState } from 'react';
import { Memo, User, OfficeMaster, DivisionMaster, RequirementType, MemoUserRecipientStatus } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { MemberSelector } from './MemberSelector';
import { API_BASE_URL } from '../config/api';
import { markMemoAsRead, isMemoUnhandled } from '../utils/notifications';
import { triggerPushNotification } from '../utils/pushNotifications';
import { dispatchNotificationEmail } from '../utils/emailNotificationDispatcher';
import { 
  Phone, 
  Check, 
  Clock, 
  Plus, 
  Building2, 
  Users, 
  Mail, 
  Smartphone, 
  CheckCircle2, 
  X, 
  Eye, 
  UserCheck, 
  Briefcase, 
  Filter,
  FileText,
  User as UserIcon,
  ArrowUpRight,
  Trash2,
  Inbox,
  Send
} from 'lucide-react';
import { ConfirmModal, ConfirmModalState } from './ConfirmModal';
import { renderContentWithLinks } from '../utils/renderContentWithLinks';
import { UrlPastePopup, useUrlPasteHandler } from './common/UrlPastePopup';

interface MemoListProps {
  memos: Memo[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  users?: User[];
  currentUser?: User;
  onUpdateMemos?: (memos: Memo[]) => void;
  onDeleteMemo?: (memoId: string) => void;
  initialMemoId?: string;
  initialOpenCreate?: boolean;
  initialRecipientId?: string;
  onCloseCreateModal?: () => void;
  onSelectUser?: (user: User) => void;
}

export function MemoList({
  memos: initialMemos,
  offices = [],
  divisions = [],
  users = [],
  currentUser,
  onUpdateMemos,
  onDeleteMemo,
  initialMemoId,
  initialOpenCreate = false,
  initialRecipientId,
  onCloseCreateModal,
  onSelectUser,
}: MemoListProps) {
  const [memos, setMemos] = useState<Memo[]>(initialMemos);
  const [scope, setScope] = useState<'inbox' | 'sent' | 'all'>('inbox');
  const [filter, setFilter] = useState<'all' | 'unread' | 'handled'>('unread');
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({ isOpen: false, title: '', message: '' });

  const handleDeleteMemoClick = (memoId: string) => {
    setConfirmModal({
      isOpen: true,
      title: '伝言メモの削除',
      message: 'この伝言メモを削除してもよろしいですか？この操作は取り消せません。',
      type: 'danger',
      confirmText: '削除する',
      cancelText: 'キャンセル',
      onConfirm: () => {
        if (onDeleteMemo) {
          onDeleteMemo(memoId);
        }
        setMemos(prev => prev.filter(m => m.id !== memoId));
        if (detailMemo && detailMemo.id === memoId) {
          setDetailMemo(null);
        }
      }
    });
  };

  React.useEffect(() => {
    setMemos(initialMemos);
  }, [initialMemos]);
  const [selectedOfficeFilter, setSelectedOfficeFilter] = useState<string>('all');

  // モーダル制御
  const [isCreateOpen, setIsCreateOpen] = useState(initialOpenCreate || !!initialRecipientId);
  const [detailMemo, setDetailMemo] = useState<Memo | null>(null);

  React.useEffect(() => {
    if (initialOpenCreate || initialRecipientId) {
      setIsCreateOpen(true);
      if (initialRecipientId) {
        setSelectedToUserIds([initialRecipientId]);
      }
    }
  }, [initialOpenCreate, initialRecipientId]);

  const handleCloseCreateModal = () => {
    setIsCreateOpen(false);
    if (onCloseCreateModal) {
      onCloseCreateModal();
    }
  };

  const processedInitialMemoIdRef = React.useRef<string | null>(null);

  React.useEffect(() => {
    if (initialMemoId && processedInitialMemoIdRef.current !== initialMemoId) {
      const target = initialMemos.find(m => m.id === initialMemoId);
      if (target) {
        processedInitialMemoIdRef.current = initialMemoId;
        handleOpenDetail(target);
      }
    }
  }, [initialMemoId, initialMemos, currentUser?.id]);

  // 新規伝言フォーム状態
  const [fromName, setFromName] = useState('');
  const [fromCompany, setFromCompany] = useState('');
  const [fromPhone, setFromPhone] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [notificationMobileEmail, setNotificationMobileEmail] = useState('');

  const [selectedToUserIds, setSelectedToUserIds] = useState<string[]>([]);

  // 要件
  const [requirementType, setRequirementType] = useState<RequirementType>('phone_called');
  const [customRequirementText, setCustomRequirementText] = useState('');
  const [content, setContent] = useState('');
  const memoPasteHandler = useUrlPasteHandler(content, setContent);

  // エラー表示
  const [formError, setFormError] = useState<string | null>(null);

  // 伝言更新ヘルパー
  const updateMemosState = (newMemos: Memo[]) => {
    setMemos(newMemos);
    if (onUpdateMemos) {
      onUpdateMemos(newMemos);
    }
  };

  // 閲覧日時の記録処理（自分が宛名メンバーの場合のみ閲覧日時を記録し、第3者を宛先に追加しない）
  const handleOpenDetail = (memo: Memo) => {
    const nowIso = new Date().toISOString();
    let updated = false;

    const statuses = memo.recipientStatuses || [];
    const isRecipient = currentUser ? statuses.some((st) => st.userId === currentUser.id) : false;

    let updatedStatuses = statuses;
    if (isRecipient && currentUser) {
      updatedStatuses = statuses.map((st) => {
        if (st.userId === currentUser.id && !st.isViewed) {
          updated = true;
          return {
            ...st,
            isViewed: true,
            viewedAt: nowIso,
          };
        }
        return st;
      });
    }

    // ⚠️ 宛先に含まれていない第3者が閲覧しても、絶対に updatedStatuses に push しない！

    const newMemoState = updated
      ? { ...memo, recipientStatuses: updatedStatuses }
      : memo;

    if (updated) {
      const nextMemos = memos.map((m) => (m.id === memo.id ? newMemoState : m));
      updateMemosState(nextMemos);
    }

    if (currentUser?.id) {
      markMemoAsRead(currentUser.id, memo.id);
    }
    setDetailMemo(newMemoState);
  };

  // 個人対応の切り替え（対応完了/未対応に戻す）
  const handleToggleUserHandled = (memoId: string, targetUserId: string) => {
    const nowIso = new Date().toISOString();

    const nextMemos = memos.map((m) => {
      if (m.id !== memoId) return m;

      const statuses = m.recipientStatuses || [];
      const hasTarget = statuses.some((st) => st.userId === targetUserId);
      if (!hasTarget) return m; // 宛先リストに存在しないユーザーの操作は無視

      const nextRecipientStatuses = statuses.map((st) => {
        if (st.userId === targetUserId) {
          const nextHandled = !st.isHandled;
          return {
            ...st,
            isViewed: true,
            viewedAt: st.viewedAt || nowIso,
            isHandled: nextHandled,
            handledAt: nextHandled ? nowIso : undefined,
            handledByUserId: nextHandled ? (currentUser?.id || '') : undefined,
            handledByUserName: nextHandled ? (currentUser?.name || '') : undefined,
          };
        }
        return st;
      });

      // 全員が対応完了しているかチェック
      const allHandled = nextRecipientStatuses.length > 0 && nextRecipientStatuses.every((s) => s.isHandled);
      const nextOverallStatus: 'unread' | 'read' | 'handled' = allHandled ? 'handled' : 'read';

      const updatedMemo = {
        ...m,
        status: nextOverallStatus,
        recipientStatuses: nextRecipientStatuses,
      };

      if (detailMemo && detailMemo.id === memoId) {
        setDetailMemo(updatedMemo);
      }

      return updatedMemo;
    });

    updateMemosState(nextMemos);
  };

  // 全体簡易トグル（自分の対応完了化）
  const handleToggleMyHandled = (memo: Memo) => {
    const statuses = memo.recipientStatuses || [];
    const isRecipient = statuses.some((st) => st.userId === currentUser.id);
    if (!isRecipient) return;
    handleToggleUserHandled(memo.id, currentUser.id);
  };

  // 要件ラベルテキストの取得
  const getRequirementLabel = (memo: Memo) => {
    switch (memo.requirementType) {
      case 'phone_called':
        return { text: '電話がありました', color: 'bg-amber-100 text-amber-800 border-amber-200' };
      case 'has_message':
        return { text: '伝言があります', color: 'bg-blue-100 text-blue-800 border-blue-200' };
      case 'call_again':
        return { text: '再度電話します（折り返し不要）', color: 'bg-emerald-100 text-emerald-800 border-emerald-200' };
      case 'please_call_back':
        return { text: '折り返し連絡下さい', color: 'bg-rose-100 text-rose-800 border-rose-200' };
      case 'custom':
      default:
        return { text: memo.requirementText || '要件入力あり', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' };
    }
  };

  // 新規伝言送信ハンドラ
  const handleCreateMemo = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fromName || !fromName.trim()) {
      setFormError('依頼者のお名前を入力してください。');
      return;
    }
    if (!content || !content.trim()) {
      setFormError('伝言の本文内容を入力してください。');
      return;
    }
    if (selectedToUserIds.length === 0) {
      setFormError('宛先メンバーを1つ以上選択してください。');
      return;
    }

    // 対象受領ユーザーの抽出
    const targetUserMap = new Map<string, User>();

    users.filter((u) => selectedToUserIds.includes(u.id)).forEach((u) => {
      targetUserMap.set(u.id, u);
    });

    const targetUsers = Array.from(targetUserMap.values());

    // 対象者のステータス初期生成
    const recipientStatuses: MemoUserRecipientStatus[] = targetUsers.map((u) => ({
      userId: u.id,
      userName: u.name,
      avatarUrl: u.avatarUrl,
      department: u.department,
      office: u.office,
      division: u.division,
      isViewed: false,
      isHandled: false,
    }));

    let reqText = '';
    if (requirementType === 'phone_called') reqText = '電話がありました';
    else if (requirementType === 'has_message') reqText = '伝言があります';
    else if (requirementType === 'call_again') reqText = '再度電話します（折り返し不要）';
    else if (requirementType === 'please_call_back') reqText = '折り返し連絡下さい';
    else reqText = customRequirementText || '伝言';

    const derivedTargetOffices = Array.from(new Set(targetUsers.map((u) => u.office).filter(Boolean))) as string[];
    const derivedTargetDivisions = Array.from(new Set(targetUsers.map((u) => u.division).filter(Boolean))) as string[];

    const newMemo: Memo = {
      id: `memo-${Date.now()}`,
      fromName: (fromName || '').trim(),
      fromCompany: (fromCompany || '').trim() || undefined,
      fromPhone: (fromPhone || '').trim() || undefined,
      fromEmail: (fromEmail || '').trim() || undefined,
      notificationEmail: (notificationEmail || '').trim() || undefined,
      notificationMobileEmail: (notificationMobileEmail || '').trim() || undefined,
      targetOffices: derivedTargetOffices,
      targetDivisions: derivedTargetDivisions,
      toUsers: targetUsers,
      toUser: targetUsers[0] || currentUser,
      requirementType,
      requirementText: reqText,
      content: (content || '').trim(),
      status: 'unread',
      createdAt: new Date().toISOString(),
      createdByUser: currentUser,
      recipientStatuses,
    };

    const targetReceiver = (targetUsers[0] && targetUsers[0].id) || currentUser.id;
    const recipientStatusesJsonStr = JSON.stringify(recipientStatuses);

    const apiPayload = {
      id: newMemo.id,
      senderId: currentUser.id,
      receiverId: targetReceiver,
      toUserId: targetReceiver,
      toUserName: (targetUsers[0] && targetUsers[0].name) || '',
      content: (content || '').trim(),
      fromName: (fromName || '').trim(),
      fromCompany: (fromCompany || '').trim() || '',
      fromPhone: (fromPhone || '').trim() || '',
      requirementType,
      requirementText: reqText,
      recipientStatusesJson: recipientStatusesJsonStr,
      recipientStatuses: recipientStatusesJsonStr,
      recipient_statuses_json: recipientStatusesJsonStr,
      toUsersJson: JSON.stringify(targetUsers.map(u => u.id)),
      details: {
        fromEmail: (fromEmail || '').trim() || undefined,
        notificationEmail: (notificationEmail || '').trim() || undefined,
        notificationMobileEmail: (notificationMobileEmail || '').trim() || undefined,
        targetOffices: derivedTargetOffices,
        targetDivisions: derivedTargetDivisions,
        requirementType,
        requirementText: reqText,
        recipientStatuses
      }
    };

    fetch(`${API_BASE_URL}/memos`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiPayload)
    })
      .then(async (res) => {
        if (!res.ok) {
          const errText = await res.text();
          let msg = `HTTP ${res.status}`;
          try {
            const errJson = JSON.parse(errText);
            if (errJson.error) msg = errJson.error;
          } catch (_) {}
          throw new Error(msg);
        }
        return res.json();
      })
      .then(() => {
        updateMemosState([newMemo, ...memos]);

        // Push通知送信
        const targetIds = targetUsers.map(u => u.id).filter(id => id && id !== currentUser.id);

        triggerPushNotification({
          targetUserIds: targetIds.length > 0 ? targetIds : undefined,
          excludeUserId: currentUser.id,
          title: `📞 伝言メモ: ${fromCompany ? `${fromCompany} ` : ''}${fromName}様`,
          body: `【${reqText}】${content ? ` ${content.slice(0, 40)}` : ''}`,
          url: `/?tab=memo&memoId=${newMemo.id}`,
          tag: `memo-${newMemo.id}`
        });

        // メール通知を通知センター設定に応じて配信
        const targetRecipients = targetUsers.filter(u => u.id && u.id !== currentUser.id);
        if (targetRecipients.length > 0) {
          dispatchNotificationEmail(targetRecipients, {
            category: 'memo',
            categoryLabel: '伝言メモ',
            title: `伝言メモ: ${fromCompany ? `${fromCompany} ` : ''}${fromName}様`,
            actorName: currentUser.name,
            details: [
              { label: '相手様名', value: `${fromCompany ? `${fromCompany} ` : ''}${fromName} 様` },
              { label: 'お電話番号', value: fromPhone || 'なし' },
              { label: 'ご用件', value: reqText },
              { label: '登録担当者', value: currentUser.name },
            ],
            mainContent: content || undefined,
            pathParams: `tab=memo&memoId=${newMemo.id}`,
          }, currentUser);
        }

        // リセット
        setFromName('');
        setFromCompany('');
        setFromPhone('');
        setFromEmail('');
        setNotificationEmail('');
        setNotificationMobileEmail('');
        setSelectedToUserIds([]);
        setRequirementType('phone_called');
        setCustomRequirementText('');
        setContent('');
        setFormError(null);
        handleCloseCreateModal();
      })
      .catch((err) => {
        console.error('Failed to create memo via API:', err);
        setFormError(`APIへの送信・保存に失敗しました: ${err.message}`);
      });
  };

  // フィルタリング処理
  const inboxUnhandledCount = memos.filter((m) => isMemoUnhandled(m, currentUser)).length;
  const inboxTotalCount = memos.filter((m) => {
    const statuses = m.recipientStatuses || [];
    return statuses.some((st) => st.userId === currentUser?.id) ||
      (m.toUsers && m.toUsers.some((u) => u.id === currentUser?.id)) ||
      (m.toUser && m.toUser.id === currentUser?.id);
  }).length;
  const sentCount = memos.filter(
    (m) => m.createdByUser?.id === currentUser?.id || m.senderId === currentUser?.id
  ).length;
  const allCount = memos.length;

  const filteredMemos = memos.filter((m) => {
    const statuses = m.recipientStatuses || [];
    const isRecipient = statuses.some((st) => st.userId === currentUser?.id) ||
      (m.toUsers && m.toUsers.some((u) => u.id === currentUser?.id)) ||
      (m.toUser && m.toUser.id === currentUser?.id);
    const isCreator = (m.createdByUser?.id === currentUser?.id || m.senderId === currentUser?.id);

    // 1. スコープフィルター (自分宛て / 作成した伝言 / すべて)
    if (scope === 'inbox' && !isRecipient) return false;
    if (scope === 'sent' && !isCreator) return false;

    // 2. ステータスフィルター
    const myStatus = statuses.find((st) => st.userId === currentUser?.id);
    const isHandledForMe = isRecipient
      ? (myStatus ? myStatus.isHandled : m.status === 'handled')
      : (m.status === 'handled' || (statuses.length > 0 && statuses.every((s) => s.isHandled)));

    if (filter === 'unread' && isHandledForMe) return false;
    if (filter === 'handled' && !isHandledForMe) return false;

    // 3. 拠点フィルター
    if (selectedOfficeFilter !== 'all') {
      const matchOffice = m.targetOffices?.includes(selectedOfficeFilter);
      const matchUserOffice = statuses.some((st) => st.office === selectedOfficeFilter);
      if (!matchOffice && !matchUserOffice) return false;
    }

    return true;
  });

  return (
    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[calc(100vh-8rem)]">
      {/* 伝言メモ ヘッダー */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/80 shrink-0 space-y-3">
        {/* 上段: スコープタブ (自分宛て / 作成した伝言 / 全体共有) & 新規作成ボタン */}
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-1.5 p-1 bg-slate-200/80 rounded-xl">
            <button
              onClick={() => setScope('inbox')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                scope === 'inbox'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Inbox className="w-4 h-4 text-indigo-600" />
              <span>自分宛て（受信）</span>
              {inboxUnhandledCount > 0 ? (
                <span className="px-1.5 py-0.2 bg-rose-500 text-white text-[10px] font-extrabold rounded-full animate-pulse">
                  {inboxUnhandledCount}
                </span>
              ) : (
                <span className="text-[10px] font-medium text-slate-400">({inboxTotalCount})</span>
              )}
            </button>

            <button
              onClick={() => setScope('sent')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                scope === 'sent'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Send className="w-3.5 h-3.5 text-indigo-600" />
              <span>作成した伝言（送信）</span>
              <span className="text-[10px] font-medium text-slate-400">({sentCount})</span>
            </button>

            <button
              onClick={() => setScope('all')}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                scope === 'all'
                  ? 'bg-white text-indigo-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="w-3.5 h-3.5 text-indigo-600" />
              <span>すべての伝言（共有）</span>
              <span className="text-[10px] font-medium text-slate-400">({allCount})</span>
            </button>
          </div>

          <button
            onClick={() => {
              setFormError(null);
              setIsCreateOpen(true);
            }}
            className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-sm cursor-pointer ml-auto"
          >
            <Plus className="w-4 h-4" />
            新規伝言メモを作成
          </button>
        </div>

        {/* 下段: サブステータスフィルター & 拠点絞り込み */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex gap-1 p-0.5 bg-slate-200/50 rounded-lg border border-slate-200/60">
              <button
                onClick={() => setFilter('unread')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  filter === 'unread' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                未対応・進行中
              </button>
              <button
                onClick={() => setFilter('handled')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  filter === 'handled' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                対応完了
              </button>
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1 text-xs font-bold rounded-md transition-all cursor-pointer ${
                  filter === 'all' ? 'bg-white text-slate-800 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                すべて表示
              </button>
            </div>

            <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg px-2.5 py-1 text-xs font-bold text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-400" />
              <span>拠点絞り込み:</span>
              <select
                value={selectedOfficeFilter}
                onChange={(e) => setSelectedOfficeFilter(e.target.value)}
                className="bg-transparent font-bold focus:outline-none cursor-pointer"
              >
                <option value="all">すべての拠点</option>
                {offices.map((off) => (
                  <option key={off.id} value={off.name}>
                    {off.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="text-xs text-slate-400 font-medium">
            該当: <span className="font-bold text-slate-700">{filteredMemos.length}</span> 件
          </div>
        </div>
      </div>

      {/* 伝言メモ 一覧カード表示 */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/40">
        <div className="w-full space-y-4">
          {filteredMemos.length > 0 ? (
            filteredMemos.map((memo) => {
              const reqBadge = getRequirementLabel(memo);
              const statuses = memo.recipientStatuses || [];
              const isRecipient = statuses.some((st) => st.userId === currentUser.id);
              const myStatus = statuses.find((st) => st.userId === currentUser.id);
              const isHandled = myStatus ? myStatus.isHandled : (memo.status === 'handled');
              const isCreator = memo.createdByUser?.id === currentUser?.id || memo.senderId === currentUser?.id;
              const viewedCount = statuses.filter((s) => s.isViewed).length;
              const handledCount = statuses.filter((s) => s.isHandled).length;
              const totalRecipients = statuses.length;

              return (
                <div
                  key={memo.id}
                  className={`bg-white border rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all flex flex-col sm:flex-row gap-4 items-start relative overflow-hidden ${
                    isRecipient && !isHandled
                      ? 'border-l-4 border-l-rose-500 border-slate-200 ring-1 ring-rose-500/20'
                      : memo.status === 'unread'
                      ? 'border-l-4 border-l-amber-500 border-slate-200'
                      : 'border-slate-200 opacity-90'
                  }`}
                >
                  <div
                    className={`p-3 rounded-2xl shrink-0 ${
                      isRecipient && !isHandled
                        ? 'bg-rose-100 text-rose-700'
                        : memo.status === 'unread'
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-slate-100 text-slate-500'
                    }`}
                  >
                    <Phone className="w-6 h-6" />
                  </div>

                  <div className="flex-1 min-w-0 space-y-3 w-full">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-extrabold px-2.5 py-0.5 rounded-md border ${reqBadge.color}`}
                          >
                            {reqBadge.text}
                          </span>

                          {isRecipient ? (
                            !isHandled ? (
                              <span className="px-2 py-0.5 bg-rose-500 text-white font-extrabold text-[10px] rounded-full flex items-center gap-1 shadow-2xs">
                                <Clock className="w-3 h-3" /> あなた宛 (未対応)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-extrabold text-[10px] rounded-full flex items-center gap-1 border border-emerald-200">
                                <Check className="w-3 h-3 text-emerald-600" /> 対応完了
                              </span>
                            )
                          ) : isCreator ? (
                            <span className="px-2 py-0.5 bg-indigo-100 text-indigo-800 font-extrabold text-[10px] rounded-full flex items-center gap-1 border border-indigo-200">
                              あなたが受付・登録
                            </span>
                          ) : (
                            <span className="px-2 py-0.5 bg-slate-100 text-slate-600 font-bold text-[10px] rounded-full flex items-center gap-1 border border-slate-200">
                              閲覧専用
                            </span>
                          )}

                          <span className="text-xs text-slate-400 font-mono">
                            {new Date(memo.createdAt).toLocaleString('ja-JP')}
                          </span>
                        </div>

                        <h3 className="text-base font-bold text-slate-900 flex items-center gap-2 pt-1 flex-wrap">
                          <span>{memo.fromName} 様</span>
                          {memo.fromCompany && (
                            <span className="text-xs font-semibold text-slate-500 flex items-center gap-1 bg-slate-100 px-2 py-0.5 rounded">
                              <Building2 className="w-3.5 h-3.5 text-slate-400" />
                              {memo.fromCompany}
                            </span>
                          )}
                        </h3>
                      </div>

                      <div className="flex items-center gap-2">
                        {isRecipient && (
                          <button
                            onClick={() => handleToggleMyHandled(memo)}
                            className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                              isHandled
                                ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                                : 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700 shadow-xs'
                            }`}
                          >
                            <Check className="w-3.5 h-3.5" />
                            {isHandled ? '未対応に戻す' : '対応済にする'}
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenDetail(memo)}
                          className="px-3 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5 text-indigo-600" />
                          詳細・ログ
                        </button>

                        {(isCreator || currentUser?.role === 'admin') && (
                          <button
                            onClick={() => handleDeleteMemoClick(memo.id)}
                            className="px-3 py-1.5 text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                            title="削除する"
                          >
                            <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                            削除
                          </button>
                        )}
                      </div>
                    </div>

                    {/* 宛先指定バッジ情報 */}
                    <div className="flex items-center gap-2 text-xs text-slate-600 bg-slate-50 p-2.5 rounded-xl border border-slate-100 flex-wrap">
                      <span className="font-bold text-slate-700 flex items-center gap-1 shrink-0">
                        <Users className="w-3.5 h-3.5 text-indigo-600" /> 宛先:
                      </span>

                      {memo.targetOffices && memo.targetOffices.length > 0 && (
                        <span className="bg-amber-100 text-amber-900 text-[11px] font-bold px-2 py-0.5 rounded">
                          拠点: {memo.targetOffices.join(', ')}
                        </span>
                      )}

                      {memo.targetDivisions && memo.targetDivisions.length > 0 && (
                        <span className="bg-purple-100 text-purple-900 text-[11px] font-bold px-2 py-0.5 rounded">
                          部署: {memo.targetDivisions.join(', ')}
                        </span>
                      )}

                      {statuses.length > 0 ? (
                        statuses.map((st) => (
                          <span
                            key={st.userId}
                            className={`text-[11px] font-bold px-2 py-0.5 rounded inline-flex items-center gap-1 ${
                              st.userId === currentUser.id
                                ? 'bg-indigo-600 text-white'
                                : 'bg-indigo-50 text-indigo-900 border border-indigo-200'
                            }`}
                          >
                            {st.userName}
                            {st.isHandled && <Check className="w-3 h-3 text-emerald-400" />}
                          </span>
                        ))
                      ) : (
                        memo.toUsers && memo.toUsers.length > 0 && (
                          <span className="bg-indigo-100 text-indigo-900 text-[11px] font-bold px-2 py-0.5 rounded">
                            {memo.toUsers.map((u) => u.name).join(', ')}
                          </span>
                        )
                      )}
                    </div>

                    {/* 連絡先＆本文 */}
                    <div className="space-y-1.5">
                      {(memo.fromPhone || memo.fromEmail) && (
                        <div className="flex items-center gap-3 text-xs text-slate-600">
                          {memo.fromPhone && (
                            <a
                              href={`tel:${memo.fromPhone}`}
                              className="font-mono text-indigo-600 font-bold hover:underline flex items-center gap-1"
                            >
                              <Phone className="w-3.5 h-3.5 text-indigo-500" />
                              {memo.fromPhone}
                            </a>
                          )}
                          {memo.fromEmail && (
                            <a
                              href={`mailto:${memo.fromEmail}`}
                              className="text-slate-600 hover:underline flex items-center gap-1"
                            >
                              <Mail className="w-3.5 h-3.5 text-slate-400" />
                              {memo.fromEmail}
                            </a>
                          )}
                        </div>
                      )}

                      <div className="p-3 bg-slate-50/80 rounded-xl text-xs text-slate-700 whitespace-pre-wrap border border-slate-100 leading-relaxed font-medium">
                        {renderContentWithLinks(memo.content)}
                      </div>
                    </div>

                    {/* 閲覧・対応進捗ログサマリー */}
                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 border-t border-slate-100">
                      <span>受付作成: {memo.createdByUser?.name || 'システム'}</span>

                      <div className="flex items-center gap-3 font-bold">
                        <span className="text-slate-600">
                          👁️ 閲覧: {viewedCount}/{totalRecipients}名
                        </span>
                        <span className={handledCount === totalRecipients ? 'text-emerald-600' : 'text-amber-600'}>
                          ✅ 対応: {handledCount}/{totalRecipients}名
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          ) : (
            <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 shadow-2xs">
              <Phone className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <h3 className="text-slate-800 font-bold text-sm mb-1">
                {scope === 'inbox'
                  ? 'あなた宛ての伝言メモはありません'
                  : scope === 'sent'
                  ? 'あなたが作成した伝言メモはありません'
                  : '表示できる伝言メモがありません'}
              </h3>
              <p className="text-slate-500 text-xs">
                {scope === 'inbox'
                  ? '新しい伝言メモが届くとここに表示されます。'
                  : '上部の「新規伝言メモを作成」から宛先を指定してメッセージを登録できます。'}
              </p>
            </div>
          )}
        </div>
      </div>

      {/* モーダル 1: 新規伝言メモ作成 */}
      {isCreateOpen && (
        <div
          onClick={handleCloseCreateModal}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col border border-slate-100"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold">新規伝言メモを作成</h2>
              </div>
              <button
                onClick={handleCloseCreateModal}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateMemo} className="p-6 overflow-y-auto space-y-5 flex-1">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold">
                  {formError}
                </div>
              )}

              {/* 1. 宛先指定（MemberSelector オブジェクト） */}
              <div>
                <MemberSelector
                  allUsers={users}
                  selectedUserIds={selectedToUserIds}
                  onChangeSelectedUserIds={setSelectedToUserIds}
                  offices={offices}
                  divisions={divisions}
                  label="宛先メンバー指定 (複数選択可能)"
                />
              </div>

              {/* 2. 依頼者情報 */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100">
                  依頼者情報
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      依頼者名 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      required
                      placeholder="例: 山田 太郎 様"
                      value={fromName}
                      onChange={(e) => setFromName(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">依頼者所属・会社名</label>
                    <input
                      type="text"
                      placeholder="例: 株式会社ABC"
                      value={fromCompany}
                      onChange={(e) => setFromCompany(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">依頼者連絡先（電話番号）</label>
                    <input
                      type="tel"
                      placeholder="例: 090-1234-5678"
                      value={fromPhone}
                      onChange={(e) => setFromPhone(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">依頼者メールアドレス</label>
                    <input
                      type="email"
                      placeholder="例: yamada@example.com"
                      value={fromEmail}
                      onChange={(e) => setFromEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* 3. 通知先 */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-slate-400 uppercase tracking-wider pb-1 border-b border-slate-100">
                  通知先設定
                </h3>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">通知先メールアドレス</label>
                    <input
                      type="email"
                      placeholder="例: target@teraoka-ads.co.jp"
                      value={notificationEmail}
                      onChange={(e) => setNotificationEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">通知先携帯メールアドレス</label>
                    <input
                      type="email"
                      placeholder="例: mobile@example.com"
                      value={notificationMobileEmail}
                      onChange={(e) => setNotificationMobileEmail(e.target.value)}
                      className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white"
                    />
                  </div>
                </div>
              </div>

              {/* 4. 要件選択 */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700">要件種別</label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-xs">
                  {[
                    { id: 'phone_called', label: '電話がありました' },
                    { id: 'has_message', label: '伝言があります' },
                    { id: 'call_again', label: '再度電話します（折り返し不要）' },
                    { id: 'please_call_back', label: '折り返し連絡下さい' },
                    { id: 'custom', label: '自由記入' },
                  ].map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setRequirementType(item.id as RequirementType)}
                      className={`px-3 py-2 rounded-xl text-xs font-bold border transition-all text-left cursor-pointer ${
                        requirementType === item.id
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                          : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>

                {requirementType === 'custom' && (
                  <input
                    type="text"
                    placeholder="自由記入の要件を入力してください"
                    value={customRequirementText}
                    onChange={(e) => setCustomRequirementText(e.target.value)}
                    className="w-full mt-2 px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                )}
              </div>

              {/* 5. 本文内容 */}
              <div className="relative">
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  本文内容 <span className="text-rose-500">*</span>
                </label>
                <UrlPastePopup
                  prompt={memoPasteHandler.pastePrompt}
                  onInsertCard={memoPasteHandler.handleInsertCard}
                  onKeepPlain={memoPasteHandler.handleKeepPlain}
                  onClose={memoPasteHandler.closePrompt}
                  positionClass="bottom-full mb-2 left-0"
                />
                <textarea
                  required
                  rows={4}
                  placeholder="伝言の詳細内容をご記入ください"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  onPaste={memoPasteHandler.handlePaste}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={handleCloseCreateModal}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
                >
                  キャンセル
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors shadow-sm cursor-pointer"
                >
                  伝言メモを登録
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* モーダル 2: 伝言詳細 & 複数人の閲覧・対応日時トラッキングログ */}
      {detailMemo && (
        <div
          onClick={() => setDetailMemo(null)}
          className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-xs overflow-y-auto"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-8 max-h-[90vh] flex flex-col border border-slate-100"
          >
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Phone className="w-5 h-5 text-indigo-400" />
                <h2 className="text-base font-bold">伝言メモ詳細 & 閲覧・対応ステータス</h2>
              </div>
              <button
                onClick={() => setDetailMemo(null)}
                className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 flex-1">
              {/* 要件＆日時 */}
              <div className="flex items-center justify-between gap-2 flex-wrap pb-3 border-b border-slate-100">
                <span
                  className={`inline-flex items-center gap-1 text-xs font-extrabold px-3 py-1 rounded-lg border ${
                    getRequirementLabel(detailMemo).color
                  }`}
                >
                  {getRequirementLabel(detailMemo).text}
                </span>

                <span className="text-xs text-slate-400 font-mono">
                  投稿日時: {new Date(detailMemo.createdAt).toLocaleString('ja-JP')}
                </span>
              </div>

              {/* 依頼者情報カード */}
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-2">
                <div className="text-xs font-bold text-slate-400 uppercase tracking-wider">依頼者情報</div>
                <div className="text-base font-bold text-slate-900">
                  {detailMemo.fromName} 様 {detailMemo.fromCompany && <span className="text-sm font-normal text-slate-600">({detailMemo.fromCompany})</span>}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-2 border-t border-slate-200/60">
                  {detailMemo.fromPhone && (
                    <a
                      href={`tel:${detailMemo.fromPhone}`}
                      className="font-mono text-indigo-600 font-bold hover:underline flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl border border-slate-200"
                    >
                      <Phone className="w-4 h-4 text-indigo-500" />
                      発信: {detailMemo.fromPhone}
                    </a>
                  )}

                  {detailMemo.fromEmail && (
                    <a
                      href={`mailto:${detailMemo.fromEmail}`}
                      className="text-indigo-600 font-medium hover:underline flex items-center gap-1.5 bg-white px-3 py-2 rounded-xl border border-slate-200 truncate"
                    >
                      <Mail className="w-4 h-4 text-indigo-500 shrink-0" />
                      メール: {detailMemo.fromEmail}
                    </a>
                  )}
                </div>
              </div>

              {/* 本文内容 */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold text-slate-700">伝言内容</label>
                <div className="p-4 bg-amber-50/40 border border-amber-200/80 rounded-2xl text-xs text-slate-800 whitespace-pre-wrap leading-relaxed font-medium">
                  {renderContentWithLinks(detailMemo.content)}
                </div>
              </div>

              {/* 対象受領者の閲覧・対応状況トラッキングテーブル */}
              <div className="space-y-3 pt-2">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-600" />
                    対象社員の閲覧・対応完了日時
                  </h3>
                  <span className="text-[11px] text-slate-400 font-bold">
                    全 {detailMemo.recipientStatuses.length} 名
                  </span>
                </div>

                <div className="border border-slate-200 rounded-2xl overflow-hidden divide-y divide-slate-100 bg-white">
                  {detailMemo.recipientStatuses.map((st) => (
                    <div
                      key={st.userId}
                      className="p-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-3">
                        <img
                          src={getAvatarUrl(st.avatarUrl)}
                          alt={st.userName}
                          className="w-8 h-8 rounded-full object-cover border border-slate-200 shrink-0"
                        />
                        <div>
                          <div className="text-xs font-bold text-slate-900 flex items-center gap-2">
                            <span>{st.userName}</span>
                            {st.userId === currentUser.id && (
                              <span className="px-1.5 py-0.5 bg-indigo-100 text-indigo-800 text-[10px] font-extrabold rounded">
                                あなた
                              </span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-400">
                            {st.office || ''} {st.division || ''}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 text-right">
                        {/* 閲覧日時 */}
                        <div className="text-[11px]">
                          <div className="font-bold text-slate-500">閲覧状況</div>
                          {st.isViewed ? (
                            <span className="text-emerald-600 font-bold flex items-center gap-1">
                              <Eye className="w-3 h-3" />
                              {st.viewedAt ? new Date(st.viewedAt).toLocaleString('ja-JP') : '閲覧済'}
                            </span>
                          ) : (
                            <span className="text-slate-400 font-bold">未閲覧</span>
                          )}
                        </div>

                        {/* 対応日時 */}
                        <div className="text-[11px] min-w-[120px]">
                          <div className="font-bold text-slate-500">対応状況</div>
                          {st.isHandled ? (
                            <div className="flex items-center gap-1.5 justify-end">
                              <span className="text-emerald-600 font-bold flex items-center gap-1">
                                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                                {st.handledAt ? new Date(st.handledAt).toLocaleString('ja-JP') : '対応完了'}
                              </span>
                              {(st.userId === currentUser.id || detailMemo.createdByUser?.id === currentUser.id || currentUser.role === 'admin') && (
                                <button
                                  type="button"
                                  onClick={() => handleToggleUserHandled(detailMemo.id, st.userId)}
                                  className="px-2 py-0.5 bg-slate-100 hover:bg-slate-200 text-slate-600 rounded text-[10px] font-bold transition-colors cursor-pointer"
                                  title="未対応に戻す"
                                >
                                  戻す
                                </button>
                              )}
                            </div>
                          ) : (
                            (st.userId === currentUser.id || detailMemo.createdByUser?.id === currentUser.id || currentUser.role === 'admin') ? (
                              <button
                                type="button"
                                onClick={() => handleToggleUserHandled(detailMemo.id, st.userId)}
                                className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-bold text-[10px] transition-colors cursor-pointer"
                              >
                                対応完了にする
                              </button>
                            ) : (
                              <span className="text-amber-600 font-bold">未対応</span>
                            )
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* フッター */}
              <div className="flex items-center justify-between pt-4 border-t border-slate-100">
                {(detailMemo.createdByUser?.id === currentUser.id || currentUser.role === 'admin') ? (
                  <button
                    type="button"
                    onClick={() => handleDeleteMemoClick(detailMemo.id)}
                    className="px-4 py-2 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 rounded-xl transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <Trash2 className="w-4 h-4 text-rose-500" />
                    この伝言メモを削除
                  </button>
                ) : (
                  <div />
                )}

                <button
                  type="button"
                  onClick={() => setDetailMemo(null)}
                  className="px-5 py-2 text-xs font-bold text-white bg-slate-800 hover:bg-slate-900 rounded-xl transition-colors cursor-pointer"
                >
                  閉じる
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* ----------------- 確認ダイアログ ----------------- */}
      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
}
