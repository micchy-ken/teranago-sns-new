import React, { useState, useMemo } from 'react';
import { Building2, Users, Lock, Search, Check, X } from 'lucide-react';
import { User, CalendarMemberGroup } from '../types';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';

export type TopicScopeMode = 'org' | 'members';

interface TopicScopeSelectorProps {
  scopeMode: TopicScopeMode;
  onScopeModeChange: (mode: TopicScopeMode) => void;
  selectedOffice: string;
  onOfficeChange: (office: string) => void;
  selectedDivision: string;
  onDivisionChange: (division: string) => void;
  officeNames: string[];
  divisionNames: string[];
  targetUserIds: string[];
  onTargetUserIdsChange: (ids: string[]) => void;
  targetGroupName: string;
  onTargetGroupNameChange: (name: string) => void;
  isStrictScope: boolean;
  onStrictScopeChange: (strict: boolean) => void;
  currentUser: User;
  authorId?: string;
  users?: User[];
}

export const TopicScopeSelector: React.FC<TopicScopeSelectorProps> = ({
  scopeMode,
  onScopeModeChange,
  selectedOffice,
  onOfficeChange,
  selectedDivision,
  onDivisionChange,
  officeNames,
  divisionNames,
  targetUserIds,
  onTargetUserIdsChange,
  targetGroupName,
  onTargetGroupNameChange,
  isStrictScope,
  onStrictScopeChange,
  currentUser,
  authorId,
  users = [],
}) => {
  const [memberSearch, setMemberSearch] = useState('');

  const ownerIdStr = String(authorId || currentUser?.id || '');

  const memberGroups: CalendarMemberGroup[] = useMemo(() => {
    return Array.isArray(currentUser?.preferences?.calendarMemberGroups)
      ? currentUser.preferences.calendarMemberGroups
      : [];
  }, [currentUser?.preferences?.calendarMemberGroups]);

  // currentUser が users 配列に未含の場合でも確実に候補へ含める
  const normalizedUsers = useMemo(() => {
    const map = new Map<string, User>();
    (users || []).forEach(u => {
      if (u?.id) map.set(String(u.id), u);
    });
    if (currentUser?.id && !map.has(String(currentUser.id))) {
      map.set(String(currentUser.id), currentUser);
    }
    return Array.from(map.values()).sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
  }, [users, currentUser]);

  const filteredUsers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    if (!q) return normalizedUsers;
    return normalizedUsers.filter(
      u =>
        (u.name && u.name.toLowerCase().includes(q)) ||
        (u.department && u.department.toLowerCase().includes(q)) ||
        (u.office && u.office.toLowerCase().includes(q)) ||
        (u.division && u.division.toLowerCase().includes(q))
    );
  }, [normalizedUsers, memberSearch]);

  const selectedIdSet = useMemo(() => {
    const set = new Set((targetUserIds || []).map(String).filter(Boolean));
    if (ownerIdStr) set.add(ownerIdStr);
    return set;
  }, [targetUserIds, ownerIdStr]);

  const toggleMember = (uid: string) => {
    const strId = String(uid);
    if (ownerIdStr && strId === ownerIdStr) return; // 投稿者自身は外せない
    const next = new Set(selectedIdSet);
    if (next.has(strId)) {
      next.delete(strId);
    } else {
      next.add(strId);
    }
    if (ownerIdStr) next.add(ownerIdStr);
    onTargetUserIdsChange(Array.from(next));
  };

  const handleApplyMyGroup = (group: CalendarMemberGroup) => {
    const next = new Set(selectedIdSet);
    (group.memberIds || []).forEach(id => {
      if (id) next.add(String(id));
    });
    if (ownerIdStr) next.add(ownerIdStr);
    onTargetUserIdsChange(Array.from(next));

    const gName = (group.name || '').trim();
    if (gName) {
      const currentLabel = (targetGroupName || '').trim();
      if (!currentLabel) {
        onTargetGroupNameChange(gName);
      } else if (!currentLabel.split('・').includes(gName)) {
        onTargetGroupNameChange(`${currentLabel}・${gName}`);
      }
    }
  };

  const handleClearNonOwnerMembers = () => {
    onTargetUserIdsChange(ownerIdStr ? [ownerIdStr] : []);
    onTargetGroupNameChange('');
  };

  return (
    <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
      {/* 公開範囲の指定方式切替（プロジェクト作成画面準拠） */}
      <div>
        <label className="block text-xs font-semibold text-slate-700 mb-1.5">公開範囲の指定方法</label>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onScopeModeChange('org')}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs whitespace-nowrap transition-colors cursor-pointer ${
              scopeMode === 'org'
                ? 'border-indigo-500 bg-indigo-50 text-indigo-800 font-bold'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-semibold'
            }`}
          >
            <Building2 className="w-3.5 h-3.5 shrink-0" />
            <span>拠点・部署で指定</span>
          </button>
          <button
            type="button"
            onClick={() => {
              onScopeModeChange('members');
              if (ownerIdStr && !targetUserIds.map(String).includes(ownerIdStr)) {
                onTargetUserIdsChange(Array.from(new Set([...targetUserIds.map(String), ownerIdStr])));
              }
            }}
            className={`flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg border text-xs whitespace-nowrap transition-colors cursor-pointer ${
              scopeMode === 'members'
                ? 'border-indigo-500 bg-indigo-50 text-indigo-800 font-bold'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 font-semibold'
            }`}
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>マイグループ・指定メンバー</span>
          </button>
        </div>
      </div>

      {scopeMode === 'org' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-slate-500" />
              公開範囲（拠点）
            </label>
            <select
              value={selectedOffice}
              onChange={e => onOfficeChange(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="全社">全社（すべての拠点）</option>
              {officeNames.map(o => (
                <option key={o} value={o}>{o}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5 flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-500" />
              公開範囲（部署）
            </label>
            <select
              value={selectedDivision}
              onChange={e => onDivisionChange(e.target.value)}
              className="w-full px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs font-semibold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
            >
              <option value="全部署">全部署（全チーム）</option>
              {divisionNames.map(d => (
                <option key={d} value={d}>{d}</option>
              ))}
            </select>
          </div>
        </div>
      ) : (
        <div className="space-y-2.5">
          {/* 対象メンバー数ヘッダー & マイグループから追加（BoardFormModal準拠） */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <label className="text-xs font-semibold text-slate-700">
                対象メンバー ({selectedIdSet.size}名)
              </label>
              {selectedIdSet.size > (ownerIdStr ? 1 : 0) && (
                <button
                  type="button"
                  onClick={handleClearNonOwnerMembers}
                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-slate-500 hover:text-rose-600 transition-colors cursor-pointer"
                  title="投稿者以外の選択をクリア"
                >
                  <X className="w-3 h-3" />
                  クリア
                </button>
              )}
            </div>

            {memberGroups.length > 0 ? (
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-slate-400">マイグループから追加:</span>
                {memberGroups.map(g => (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => handleApplyMyGroup(g)}
                    className="px-2 py-0.5 text-[11px] font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 rounded border border-indigo-200 transition-colors cursor-pointer whitespace-nowrap"
                  >
                    ＋ {g.name}
                  </button>
                ))}
              </div>
            ) : (
              <span className="text-[11px] text-slate-400">
                ※ マイグループはカレンダー設定で作成できます
              </span>
            )}
          </div>

          {/* 公開範囲の表示名（グループ名ラベル） */}
          <div>
            <input
              type="text"
              value={targetGroupName}
              onChange={e => onTargetGroupNameChange(e.target.value)}
              placeholder="表示グループ名（任意・例: 〇〇プロジェクトメンバー / 未入力時は「指定メンバー」）"
              className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400 text-slate-700"
            />
          </div>

          {/* メンバー検索 */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={memberSearch}
              onChange={e => setMemberSearch(e.target.value)}
              placeholder="社員名・拠点・部署で検索..."
              className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
            />
          </div>

          {/* メンバーチェックリスト（BoardFormModal準拠） */}
          <div className="max-h-36 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 bg-white">
            {filteredUsers.map(u => {
              const uid = String(u.id);
              const checked = selectedIdSet.has(uid);
              const isOwner = ownerIdStr === uid;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => toggleMember(uid)}
                  className={`w-full flex items-center justify-between px-3 py-1.5 text-left text-xs hover:bg-slate-50 transition-colors cursor-pointer ${
                    checked ? 'bg-indigo-50/40' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <img
                      src={getAvatarUrl(u.avatarUrl)}
                      alt={u.name}
                      onError={handleAvatarError}
                      className="w-6 h-6 rounded-full object-cover shrink-0 bg-slate-100"
                    />
                    <span className="font-medium text-slate-800 truncate">{u.name}</span>
                    <span className="text-[11px] text-slate-400 truncate">{u.department}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {isOwner && <span className="text-[10px] text-slate-400">投稿者</span>}
                    <div
                      className={`w-4 h-4 rounded border flex items-center justify-center ${
                        checked
                          ? 'bg-indigo-600 border-indigo-600 text-white'
                          : 'border-slate-300 bg-white'
                      }`}
                    >
                      {checked && <Check className="w-3 h-3" />}
                    </div>
                  </div>
                </button>
              );
            })}
            {filteredUsers.length === 0 && (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                該当する社員が見つかりません
              </div>
            )}
          </div>
        </div>
      )}

      {/* 限定公開オプション（拠点・部署 / マイグループ両対応） */}
      <div className="pt-2 border-t border-slate-200/60 flex items-center">
        <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-700 hover:text-indigo-900 transition-colors">
          <input
            type="checkbox"
            checked={isStrictScope}
            onChange={e => onStrictScopeChange(e.target.checked)}
            className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 cursor-pointer"
          />
          <span className="flex items-center gap-1">
            <Lock className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            {scopeMode === 'members'
              ? '公開範囲のみ表示（指定メンバー以外のユーザーには限定非表示）'
              : '公開範囲のみ表示（指定拠点・部署以外のユーザーには限定非表示）'}
          </span>
        </label>
      </div>
    </div>
  );
};
