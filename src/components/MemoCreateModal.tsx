import React, { useState } from 'react';
import { Memo, User, OfficeMaster, DivisionMaster, RequirementType, MemoUserRecipientStatus } from '../types';
import { getAvatarUrl } from '../utils/avatar';
import { API_BASE_URL } from '../config/api';
import { triggerPushNotification } from '../utils/pushNotifications';
import { X, Phone, Building2, Users, Plus, Check } from 'lucide-react';

export interface MemoCreateModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  users: User[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  memos?: Memo[];
  onUpdateMemos?: (updatedMemos: Memo[]) => void;
}

export function MemoCreateModal({
  isOpen,
  onClose,
  currentUser,
  users = [],
  offices = [],
  divisions = [],
  memos = [],
  onUpdateMemos,
}: MemoCreateModalProps) {
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

  // エラー表示・処理中フラグ
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen) return null;

  const resetForm = () => {
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
  };

  const handleClose = () => {
    resetForm();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
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

    setIsSubmitting(true);
    setFormError(null);

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

    try {
      const res = await fetch(`${API_BASE_URL}/memos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(apiPayload)
      });

      if (!res.ok) {
        const errText = await res.text();
        let msg = `HTTP ${res.status}`;
        try {
          const errJson = JSON.parse(errText);
          if (errJson.error) msg = errJson.error;
        } catch (_) {}
        throw new Error(msg);
      }

      if (onUpdateMemos) {
        onUpdateMemos([newMemo, ...memos]);
      }

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

      handleClose();
    } catch (err: any) {
      console.error('Failed to create memo:', err);
      // Fallback local update
      if (onUpdateMemos) {
        onUpdateMemos([newMemo, ...memos]);
      }
      handleClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div
      onClick={handleClose}
      className="fixed inset-0 bg-slate-900/40 flex items-center justify-center z-50 p-4 backdrop-blur-xs overflow-y-auto"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl overflow-hidden my-8 border border-slate-100 max-h-[90vh] flex flex-col"
      >
        <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <Phone className="w-5 h-5 text-indigo-400" />
            <h2 className="text-base font-bold">新規伝言メモの登録</h2>
          </div>
          <button
            onClick={handleClose}
            type="button"
            className="p-1 text-slate-400 hover:text-white hover:bg-slate-800 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-5 overflow-y-auto flex-1">
          {formError && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs font-bold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-rose-500 animate-pulse shrink-0" />
              {formError}
            </div>
          )}

          {/* 1. 宛先指定 */}
          <div className="space-y-3 bg-slate-50 p-4 rounded-2xl border border-slate-200/80">
            <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
              <Users className="w-4 h-4 text-indigo-600" />
              宛先を選択 <span className="text-rose-500">*</span>
            </h3>

            {/* 拠点一括選択 */}
            <div>
              <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
                拠点あて指定 (複数選択可):
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
                          setSelectedTargetOffices(selectedTargetOffices.filter((o) => o !== off.name));
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

            {/* 部署一括選択 */}
            <div>
              <span className="block text-[11px] font-bold text-slate-700 mb-1.5">
                部署あて指定 (複数選択可):
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
                          setSelectedTargetDivisions(selectedTargetDivisions.filter((d) => d !== div.name));
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
                        src={getAvatarUrl(u.avatarUrl)}
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
              onClick={handleClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg transition-colors shadow-sm cursor-pointer flex items-center gap-1.5"
            >
              <Plus className="w-4 h-4" />
              <span>{isSubmitting ? '登録中...' : '伝言メモを登録'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
