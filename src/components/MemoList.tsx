import React, { useState } from 'react';
import { Memo, User, OfficeMaster, DivisionMaster, RequirementType, MemoUserRecipientStatus } from '../types';
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
  ArrowUpRight
} from 'lucide-react';
import { initialOffices, initialDivisions, allUsers as defaultAllUsers, currentUser as defaultCurrentUser } from '../data/mockData';
import { getApiUrl } from '../utils/api';

interface MemoListProps {
  memos: Memo[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  users?: User[];
  currentUser?: User;
  onUpdateMemos?: (memos: Memo[]) => void;
}

export function MemoList({
  memos: initialMemos,
  offices = initialOffices,
  divisions = initialDivisions,
  users = defaultAllUsers,
  currentUser = defaultCurrentUser,
  onUpdateMemos,
}: MemoListProps) {
  const [memos, setMemos] = useState<Memo[]>(initialMemos);
  const [filter, setFilter] = useState<'all' | 'unread' | 'handled'>('unread');

  React.useEffect(() => {
    setMemos(initialMemos);
  }, [initialMemos]);
  const [selectedOfficeFilter, setSelectedOfficeFilter] = useState<string>('all');

  // モーダル制御
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [detailMemo, setDetailMemo] = useState<Memo | null>(null);

  // 新規伝言フォーム状態
  const [fromName, setFromName] = useState('');
  const [fromCompany, setFromCompany] = useState('');
  const [fromPhone, setFromPhone] = useState('');
  const [fromEmail, setFromEmail] = useState('');
  const [notificationEmail, setNotificationEmail] = useState('');
  const [notificationMobileEmail, setNotificationMobileEmail] = useState('');

  // 宛先選択（複数可）
  const [selectedTargetOffices, setSelectedTargetOffices] = useState<string[]>([]);
  const [selectedTargetDivisions, setSelectedTargetDivisions] = useState<string[]>([]);
  const [selectedToUserIds, setSelectedToUserIds] = useState<string[]>([]);

  // 要件
  const [requirementType, setRequirementType] = useState<RequirementType>('phone_called');
  const [customRequirementText, setCustomRequirementText] = useState('');
  const [content, setContent] = useState('');

  // エラー表示
  const [formError, setFormError] = useState<string | null>(null);

  // 伝言更新ヘルパー
  const updateMemosState = (newMemos: Memo[]) => {
    setMemos(newMemos);
    if (onUpdateMemos) {
      onUpdateMemos(newMemos);
    }
  };

  // 閲覧日時の記録処理
  const handleOpenDetail = (memo: Memo) => {
    const nowIso = new Date().toISOString();
    let updated = false;

    // 自分の受領ステータスを既読(isViewed=true, viewedAt=now)にする
    const statuses = memo.recipientStatuses || [];
    const updatedStatuses = statuses.map((st) => {
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

    // 宛先に含まれていなくてもログ用に追加・閲覧記録
    const hasMyStatus = updatedStatuses.some((st) => st.userId === currentUser.id);
    if (!hasMyStatus) {
      updatedStatuses.push({
        userId: currentUser.id,
        userName: currentUser.name,
        avatarUrl: currentUser.avatarUrl,
        department: currentUser.department,
        office: currentUser.office,
        division: currentUser.division,
        isViewed: true,
        viewedAt: nowIso,
        isHandled: false,
      });
      updated = true;
    }

    const newMemoState = updated
      ? { ...memo, recipientStatuses: updatedStatuses }
      : memo;

    if (updated) {
      const nextMemos = memos.map((m) => (m.id === memo.id ? newMemoState : m));
      updateMemosState(nextMemos);
    }

    setDetailMemo(newMemoState);
  };

  // 個人対応の切り替え（対応完了/未対応に戻す）
  const handleToggleUserHandled = (memoId: string, targetUserId: string) => {
    const nowIso = new Date().toISOString();

    const nextMemos = memos.map((m) => {
      if (m.id !== memoId) return m;

      const statuses = m.recipientStatuses || [];
      const nextRecipientStatuses = statuses.map((st) => {
        if (st.userId === targetUserId) {
          const nextHandled = !st.isHandled;
          return {
            ...st,
            isViewed: true,
            viewedAt: st.viewedAt || nowIso,
            isHandled: nextHandled,
            handledAt: nextHandled ? nowIso : undefined,
            handledByUserId: nextHandled ? currentUser.id : undefined,
            handledByUserName: nextHandled ? currentUser.name : undefined,
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
    if (
      selectedTargetOffices.length === 0 &&
      selectedTargetDivisions.length === 0 &&
      selectedToUserIds.length === 0
    ) {
      setFormError('宛先（拠点、部署、個人のいずれか）を1つ以上選択してください。');
      return;
    }

    // 対象受領ユーザーの抽出
    const targetUserMap = new Map<string, User>();

    // 1. 指定された個人ユーザー
    users.filter((u) => selectedToUserIds.includes(u.id)).forEach((u) => {
      targetUserMap.set(u.id, u);
    });

    // 2. 指定された拠点のユーザー
    if (selectedTargetOffices.length > 0) {
      users.filter((u) => u.office && selectedTargetOffices.includes(u.office)).forEach((u) => {
        targetUserMap.set(u.id, u);
      });
    }

    // 3. 指定された部署のユーザー
    if (selectedTargetDivisions.length > 0) {
      users.filter((u) => u.division && selectedTargetDivisions.includes(u.division)).forEach((u) => {
        targetUserMap.set(u.id, u);
      });
    }

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

    const newMemo: Memo = {
      id: `memo-${Date.now()}`,
      fromName: (fromName || '').trim(),
      fromCompany: (fromCompany || '').trim() || undefined,
      fromPhone: (fromPhone || '').trim() || undefined,
      fromEmail: (fromEmail || '').trim() || undefined,
      notificationEmail: (notificationEmail || '').trim() || undefined,
      notificationMobileEmail: (notificationMobileEmail || '').trim() || undefined,
      targetOffices: selectedTargetOffices,
      targetDivisions: selectedTargetDivisions,
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
        targetOffices: selectedTargetOffices,
        targetDivisions: selectedTargetDivisions,
        requirementType,
        requirementText: reqText,
        recipientStatuses
      }
    };

    fetch(getApiUrl('/api/memos'), {
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

        // リセット
        setFromName('');
        setFromCompany('');
        setFromPhone('');
        setFromEmail('');
        setNotificationEmail('');
        setNotificationMobileEmail('');
        setSelectedTargetOffices([]);
        setSelectedTargetDivisions([]);
        setSelectedToUserIds([]);
        setRequirementType('phone_called');
        setCustomRequirementText('');
        setContent('');
        setFormError(null);
        setIsCreateOpen(false);
      })
      .catch((err) => {
        console.error('Failed to create memo via API:', err);
        setFormError(`APIへの送信・保存に失敗しました: ${err.message}`);
      });
  };

  // フィルタリング処理
  const filteredMemos = memos.filter((m) => {
    // ステータスフィルター
    if (filter === 'unread' && m.status === 'handled') return false;
    if (filter === 'handled' && m.status !== 'handled') return false;

    // 拠点フィルター
    if (selectedOfficeFilter !== 'all') {
      const matchOffice = m.targetOffices?.includes(selectedOfficeFilter);
      const matchUserOffice = (m.recipientStatuses || []).some((st) => st.office === selectedOfficeFilter);
      if (!matchOffice && !matchUserOffice) return false;
    }

    return true;
  });

  return (
    <div className="flex-1 bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col h-[calc(100vh-8rem)]">
      {/* 伝言メモ ヘッダー */}
      <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-50/80 shrink-0 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex gap-1 p-1 bg-slate-200/60 rounded-xl">
            <button
              onClick={() => setFilter('unread')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filter === 'unread' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              未対応・進行中
            </button>
            <button
              onClick={() => setFilter('handled')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filter === 'handled' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              対応完了
            </button>
            <button
              onClick={() => setFilter('all')}
              className={`px-3.5 py-1.5 text-xs font-bold rounded-lg transition-all cursor-pointer ${
                filter === 'all' ? 'bg-white text-slate-800 shadow-xs' : 'text-slate-600 hover:text-slate-900'
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

        <button
          onClick={() => {
            setFormError(null);
            setIsCreateOpen(true);
          }}
          className="flex items-center gap-1.5 px-4 py-2 bg-indigo-600 text-white text-xs font-bold rounded-xl hover:bg-indigo-700 transition-all shadow-sm cursor-pointer"
        >
          <Plus className="w-4 h-4" />
          新規伝言メモを作成
        </button>
      </div>

      {/* 伝言メモ 一覧カード表示 */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50/40">
        <div className="max-w-4xl mx-auto space-y-4">
          {filteredMemos.length > 0 ? (
            filteredMemos.map((memo) => {
              const reqBadge = getRequirementLabel(memo);
              const myStatus = memo.recipientStatuses.find((st) => st.userId === currentUser.id);
              const isHandled = memo.status === 'handled' || (myStatus && myStatus.isHandled);
              const viewedCount = memo.recipientStatuses.filter((s) => s.isViewed).length;
              const handledCount = memo.recipientStatuses.filter((s) => s.isHandled).length;
              const totalRecipients = memo.recipientStatuses.length;

              return (
                <div
                  key={memo.id}
                  className={`bg-white border rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all flex flex-col sm:flex-row gap-4 items-start relative overflow-hidden ${
                    memo.status === 'unread'
                      ? 'border-l-4 border-l-amber-500 border-slate-200'
                      : 'border-slate-200 opacity-90'
                  }`}
                >
                  <div
                    className={`p-3 rounded-2xl shrink-0 ${
                      memo.status === 'unread' ? 'bg-amber-100 text-amber-700' : 'bg-slate-100 text-slate-500'
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
                        <button
                          onClick={() => handleToggleMyHandled(memo)}
                          className={`px-3 py-1.5 text-xs font-bold rounded-lg border transition-all cursor-pointer flex items-center gap-1 ${
                            isHandled
                              ? 'bg-slate-100 text-slate-600 border-slate-200 hover:bg-slate-200'
                              : 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                          }`}
                        >
                          <Check className="w-3.5 h-3.5" />
                          {isHandled ? '未対応に戻す' : '対応済にする'}
                        </button>

                        <button
                          onClick={() => handleOpenDetail(memo)}
                          className="px-3 py-1.5 text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 hover:bg-indigo-100 rounded-lg transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <Eye className="w-3.5 h-3.5 text-indigo-600" />
                          詳細・ログ
                        </button>
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

                      {memo.toUsers && memo.toUsers.length > 0 && (
                        <span className="bg-indigo-100 text-indigo-900 text-[11px] font-bold px-2 py-0.5 rounded">
                          個人: {memo.toUsers.map((u) => u.name).join(', ')}
                        </span>
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
                        {memo.content}
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
              <h3 className="text-slate-800 font-bold text-sm mb-1">表示できる伝言メモがありません</h3>
              <p className="text-slate-500 text-xs">
                条件を変更するか、「新規伝言メモを作成」から伝言を投稿してください。
              </p>
            </div>
          )}
        </div>
      </div>

      {/* モーダル 1: 新規伝言メモ作成 */}
      {isCreateOpen && (
        <div
          onClick={() => setIsCreateOpen(false)}
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
                onClick={() => setIsCreateOpen(false)}
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

              {/* 1. 宛先選択（拠点、部署、個人 複数選択） */}
              <div className="space-y-3 bg-indigo-50/50 p-4 rounded-2xl border border-indigo-100">
                <label className="block text-xs font-extrabold text-indigo-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-600" />
                  宛先指定（複数選択可能）
                </label>

                {/* 拠点選択 */}
                <div>
                  <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    拠点あて指定 (複数可):
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {offices.map((off) => {
                      const isSelected = selectedTargetOffices.includes(off.name);
                      return (
                        <button
                          key={off.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTargetOffices(selectedTargetOffices.filter((n) => n !== off.name));
                            } else {
                              setSelectedTargetOffices([...selectedTargetOffices, off.name]);
                            }
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-amber-500 text-white border-amber-500 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {off.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 部署選択 */}
                <div>
                  <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    部署あて指定 (複数可):
                  </span>
                  <div className="flex items-center gap-2 flex-wrap">
                    {divisions.map((div) => {
                      const isSelected = selectedTargetDivisions.includes(div.name);
                      return (
                        <button
                          key={div.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedTargetDivisions(selectedTargetDivisions.filter((n) => n !== div.name));
                            } else {
                              setSelectedTargetDivisions([...selectedTargetDivisions, div.name]);
                            }
                          }}
                          className={`px-3 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer ${
                            isSelected
                              ? 'bg-purple-600 text-white border-purple-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          {div.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* 個人ユーザー選択 */}
                <div>
                  <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
                    個人あて指定 (複数選択):
                  </span>
                  <div className="flex items-center gap-2 flex-wrap max-h-32 overflow-y-auto p-1">
                    {users.map((u) => {
                      const isSelected = selectedToUserIds.includes(u.id);
                      return (
                        <button
                          key={u.id}
                          type="button"
                          onClick={() => {
                            if (isSelected) {
                              setSelectedToUserIds(selectedToUserIds.filter((id) => id !== u.id));
                            } else {
                              setSelectedToUserIds([...selectedToUserIds, u.id]);
                            }
                          }}
                          className={`px-2.5 py-1 rounded-lg text-xs font-bold border transition-all cursor-pointer flex items-center gap-1.5 ${
                            isSelected
                              ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                          }`}
                        >
                          <img
                            src={u.avatarUrl}
                            alt={u.name}
                            className="w-4 h-4 rounded-full object-cover"
                          />
                          <span>{u.name}</span>
                          <span className="text-[10px] opacity-70">({u.office || ''} {u.division || ''})</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
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
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  本文内容 <span className="text-rose-500">*</span>
                </label>
                <textarea
                  required
                  rows={4}
                  placeholder="伝言の詳細内容をご記入ください"
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:bg-white leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCreateOpen(false)}
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
                  {detailMemo.content}
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
                          src={st.avatarUrl || 'https://i.pravatar.cc/150'}
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
                            <span className="text-indigo-600 font-bold flex items-center gap-1 justify-end">
                              <CheckCircle2 className="w-3.5 h-3.5 text-indigo-600" />
                              {st.handledAt ? new Date(st.handledAt).toLocaleString('ja-JP') : '対応完了'}
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => handleToggleUserHandled(detailMemo.id, st.userId)}
                              className="px-2.5 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 border border-amber-200 rounded-lg font-bold text-[10px] transition-colors cursor-pointer"
                            >
                              対応完了にする
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* フッター */}
              <div className="flex items-center justify-end pt-4 border-t border-slate-100">
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
    </div>
  );
}
