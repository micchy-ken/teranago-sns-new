import React from 'react';
import {
  X,
  User as UserIcon,
  Users,
  Building2,
  Check,
  Settings,
  Plus,
  Filter,
} from 'lucide-react';
import { User, CalendarMemberGroup, EventType, OfficeMaster, DivisionMaster } from '../types';
import { doesUserMatchOffice, doesUserMatchDivision, getUserOfficeName, getUserDivisionName } from '../utils/masterResolver';
import { getAvatarUrl, handleAvatarError } from '../utils/avatar';

export interface PersonalMemberSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedGroupId: string; // 'org' または group.id
  onSelectGroupId: (groupId: string) => void;
  selectedOffice: string;
  onSelectOffice: (office: string) => void;
  officeNames: string[];
  selectedDivision: string;
  onSelectDivision: (division: string) => void;
  divisionNames: string[];
  selectedUserId: string;
  onSelectUserId: (userId: string) => void;
  memberGroups: CalendarMemberGroup[];
  allUsers?: User[];
  currentUser?: User;
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  selectedTypeFilter: string;
  onSelectTypeFilter: (type: string) => void;
  typeLabels: Record<EventType, string>;
  onOpenManageGroups: () => void;
}

export const PersonalMemberSettingsModal: React.FC<PersonalMemberSettingsModalProps> = ({
  isOpen,
  onClose,
  selectedGroupId,
  onSelectGroupId,
  selectedOffice,
  onSelectOffice,
  officeNames,
  selectedDivision,
  onSelectDivision,
  divisionNames,
  selectedUserId,
  onSelectUserId,
  memberGroups,
  allUsers = [],
  currentUser,
  offices = [],
  divisions = [],
  selectedTypeFilter,
  onSelectTypeFilter,
  typeLabels,
  onOpenManageGroups,
}) => {
  if (!isOpen) return null;

  const isOrgMode = selectedGroupId === 'org';
  const userMap = new Map((allUsers || []).map(u => [String(u.id), u]));

  // 現在選択中のマイグループオブジェクト
  const activeGroup = !isOrgMode ? memberGroups.find(g => g.id === selectedGroupId) : null;

  // 所属（拠点・部署マスターID照合）での対象ユーザー一覧
  const orgMatchingUsers = isOrgMode
    ? allUsers.filter(u => {
        const matchOffice =
          !selectedOffice ||
          selectedOffice === '全社' ||
          selectedOffice === '全拠点' ||
          doesUserMatchOffice(u, selectedOffice, offices);
        const matchDiv =
          !selectedDivision ||
          selectedDivision === '全部署' ||
          doesUserMatchDivision(u, selectedDivision, divisions);
        return matchOffice && matchDiv;
      })
    : [];

  // マイグループ選択時の対象ユーザー一覧
  const groupMatchingUsers = !isOrgMode && activeGroup
    ? activeGroup.memberIds
        .map(id => userMap.get(String(id)))
        .filter((u): u is User => Boolean(u))
    : [];

  const candidateUsers = isOrgMode ? orgMatchingUsers : groupMatchingUsers;

  return (
    <div className="fixed inset-0 z-[70] flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-0 sm:p-4">
      {/* 背景クリックで閉じる */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* モーダル本体 (スマホ下部シート / PC中央ポップアップ) */}
      <div
        className="relative w-full sm:max-w-md bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] text-slate-800 animate-in fade-in slide-in-from-bottom-4 duration-200"
        onClick={e => e.stopPropagation()}
      >
        {/* ヘッダー */}
        <div className="px-4 py-3.5 bg-gradient-to-r from-amber-50/90 via-white to-orange-50/80 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 bg-amber-500 text-white rounded-xl shadow-xs">
              <UserIcon className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 leading-tight">個人カレンダー表示対象の設定</h3>
              <p className="text-[11px] text-slate-500 truncate">所属（拠点・部署）またはマイグループから個人を選択</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full transition-colors cursor-pointer"
            title="閉じる"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* スクロール可能コンテンツ */}
        <div className="p-4 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* 表示タイプ切り替え (所属 vs マイグループ) */}
          <div>
            <label className="text-[11px] font-bold text-slate-600 mb-1.5 block">表示対象の基準</label>
            <div className="grid grid-cols-2 gap-2 bg-slate-100/90 p-1 rounded-xl border border-slate-200">
              <button
                type="button"
                onClick={() => onSelectGroupId('org')}
                className={`py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  isOrgMode
                    ? 'bg-white text-amber-800 shadow-xs border border-amber-300'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Building2 className="w-3.5 h-3.5" />
                <span>🏢 所属（拠点・部署）</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (memberGroups.length > 0) {
                    if (isOrgMode) {
                      onSelectGroupId(memberGroups[0].id);
                    }
                  } else {
                    onSelectGroupId('mygroup_new');
                  }
                }}
                className={`py-2 px-3 rounded-lg font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                  !isOrgMode
                    ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/50'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                <span>👥 マイグループ</span>
                {memberGroups.length > 0 && (
                  <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded-full font-bold">
                    {memberGroups.length}
                  </span>
                )}
              </button>
            </div>
          </div>

          {/* ========================================================
              パターンA: 所属（拠点・部署・個人名）選択
          ======================================================== */}
          {isOrgMode && (
            <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs pb-1 border-b border-slate-200/60">
                <Building2 className="w-3.5 h-3.5 text-amber-600" />
                <span>拠点・部署・個人名の選択</span>
              </div>

              {/* 拠点選択 */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">拠点（オフィス）</label>
                <select
                  value={selectedOffice}
                  onChange={e => onSelectOffice(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer"
                >
                  {officeNames.filter(o => o !== '全社' && o !== '全拠点').map(o => (
                    <option key={o} value={o}>{o}</option>
                  ))}
                </select>
              </div>

              {/* 部署選択 */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">部署（部門）</label>
                <select
                  value={selectedDivision}
                  onChange={e => onSelectDivision(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer"
                >
                  {divisionNames.filter(d => d !== '全部署').map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* 個人名プルダウン */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-slate-600">個人名（メンバー）</label>
                  <span className="text-[10px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full font-bold">
                    該当 {candidateUsers.length}名
                  </span>
                </div>
                {candidateUsers.length > 0 ? (
                  <>
                    <select
                      value={selectedUserId}
                      onChange={e => onSelectUserId(e.target.value)}
                      className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-500 shadow-2xs cursor-pointer mb-2"
                    >
                      {candidateUsers.map(u => (
                        <option key={u.id} value={u.id}>
                          👤 {u.name}{u.position ? ` (${u.position})` : ''}
                        </option>
                      ))}
                    </select>

                    {/* タップで素早く選べるメンバー一覧 */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-44 overflow-y-auto pr-0.5 pt-1">
                      {candidateUsers.map(u => {
                        const isSelected = String(u.id) === String(selectedUserId);
                        const avatarSrc = getAvatarUrl(
                          currentUser && String(u.id) === String(currentUser.id)
                            ? (currentUser.avatarUrl || u.avatarUrl)
                            : u.avatarUrl
                        );
                        return (
                          <button
                            key={u.id}
                            type="button"
                            onClick={() => onSelectUserId(String(u.id))}
                            className={`flex items-center justify-between gap-2 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-amber-50/90 border-amber-500 ring-2 ring-amber-200/80 shadow-2xs'
                                : 'bg-white border-slate-200 hover:border-amber-300 hover:bg-amber-50/30'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0">
                              <img
                                src={avatarSrc}
                                alt={u.name}
                                onError={handleAvatarError}
                                className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                                referrerPolicy="no-referrer"
                              />
                              <div className="min-w-0">
                                <div className="font-bold text-xs text-slate-900 truncate">{u.name}</div>
                                {u.position && (
                                  <div className="text-[10px] text-slate-500 truncate">{u.position}</div>
                                )}
                              </div>
                            </div>
                            {isSelected && (
                              <div className="w-4 h-4 rounded-full bg-amber-500 text-white flex items-center justify-center shrink-0">
                                <Check className="w-2.5 h-2.5 stroke-[3]" />
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </>
                ) : (
                  <div className="py-3 px-3 bg-white rounded-lg border border-dashed border-slate-300 text-center text-slate-500 text-[11px]">
                    選択された拠点・部署に該当するメンバーがいません
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ========================================================
              パターンB: マイグループから個人名を選択
          ======================================================== */}
          {!isOrgMode && (
            <div className="space-y-3 bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-200/80">
              <div className="flex items-center justify-between pb-1 border-b border-indigo-200/60">
                <div className="flex items-center gap-1.5 text-indigo-950 font-bold text-xs">
                  <Users className="w-3.5 h-3.5 text-indigo-600" />
                  <span>登録済みマイグループ</span>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    onOpenManageGroups();
                  }}
                  className="flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-300 rounded-lg text-[11px] font-bold shadow-2xs transition-colors cursor-pointer"
                >
                  <Settings className="w-3 h-3 text-indigo-600" />
                  <span>グループ管理・作成</span>
                </button>
              </div>

              {memberGroups.length > 0 ? (
                <>
                  {/* マイグループ選択 */}
                  <div>
                    <label className="text-[11px] font-bold text-slate-600 mb-1 block">マイグループ</label>
                    <select
                      value={selectedGroupId}
                      onChange={e => onSelectGroupId(e.target.value)}
                      className="w-full bg-white border border-indigo-300 rounded-lg px-3 py-2 text-xs font-bold text-indigo-950 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
                    >
                      {memberGroups.map(g => (
                        <option key={g.id} value={g.id}>
                          👥 {g.name} ({g.memberIds.length}名)
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* グループ内メンバー選択 */}
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="text-[11px] font-bold text-slate-600">個人名（メンバー）</label>
                      <span className="text-[10px] text-indigo-800 bg-indigo-100 px-2 py-0.5 rounded-full font-bold">
                        {candidateUsers.length}名
                      </span>
                    </div>
                    {candidateUsers.length > 0 ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 max-h-48 overflow-y-auto pr-0.5">
                        {candidateUsers.map(u => {
                          const isSelected = String(u.id) === String(selectedUserId);
                          const offName = getUserOfficeName(u, offices);
                          const divName = getUserDivisionName(u, divisions);
                          const avatarSrc = getAvatarUrl(
                            currentUser && String(u.id) === String(currentUser.id)
                              ? (currentUser.avatarUrl || u.avatarUrl)
                              : u.avatarUrl
                          );
                          return (
                            <button
                              key={u.id}
                              type="button"
                              onClick={() => onSelectUserId(String(u.id))}
                              className={`flex items-center justify-between gap-2 p-2 rounded-xl border text-left transition-all cursor-pointer ${
                                isSelected
                                  ? 'bg-white border-indigo-500 ring-2 ring-indigo-200/80 shadow-xs'
                                  : 'bg-white/80 border-slate-200 hover:border-indigo-300 hover:bg-white'
                              }`}
                            >
                              <div className="flex items-center gap-2 min-w-0">
                                <img
                                  src={avatarSrc}
                                  alt={u.name}
                                  onError={handleAvatarError}
                                  className="w-6 h-6 rounded-full object-cover border border-slate-200 shrink-0"
                                  referrerPolicy="no-referrer"
                                />
                                <div className="min-w-0">
                                  <div className="font-bold text-xs text-slate-900 truncate">{u.name}</div>
                                  <div className="text-[10px] text-slate-500 truncate">
                                    {[offName, divName].filter(Boolean).join(' / ')}
                                  </div>
                                </div>
                              </div>
                              {isSelected && (
                                <div className="w-4 h-4 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                                  <Check className="w-2.5 h-2.5 stroke-[3]" />
                                </div>
                              )}
                            </button>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-3 px-3 bg-white rounded-lg border border-dashed border-indigo-200 text-center text-slate-500 text-[11px]">
                        このグループにはメンバーが登録されていません
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="py-4 px-3 bg-white rounded-xl border border-dashed border-indigo-300 text-center space-y-2">
                  <Users className="w-8 h-8 text-indigo-300 mx-auto" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">マイグループが未登録です</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      よく確認するメンバーをまとめて登録すると、素早く個人・チームを切り替えられます
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      onClose();
                      onOpenManageGroups();
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer mt-1"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>マイグループを新規作成する</span>
                  </button>
                </div>
              )}
            </div>
          )}

          {/* ========================================================
              セクション3: 予定区分フィルター
          ======================================================== */}
          <div className="bg-slate-50/70 p-3 rounded-xl border border-slate-200/80">
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-bold text-slate-600 flex items-center gap-1">
                <Filter className="w-3 h-3 text-slate-500" />
                <span>予定区分フィルター</span>
              </label>
              {selectedTypeFilter !== 'all' && (
                <button
                  type="button"
                  onClick={() => onSelectTypeFilter('all')}
                  className="text-[10px] text-indigo-600 font-bold hover:underline"
                >
                  解除（全区分）
                </button>
              )}
            </div>
            <select
              value={selectedTypeFilter}
              onChange={e => onSelectTypeFilter(e.target.value)}
              className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
            >
              <option value="all">全区分</option>
              {Object.keys(typeLabels).map(key => (
                <option key={key} value={key}>{typeLabels[key as EventType]}</option>
              ))}
            </select>
          </div>
        </div>

        {/* フッター */}
        <div className="px-4 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0 gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-300 transition-colors cursor-pointer"
          >
            閉じる
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2 px-4 bg-amber-500 hover:bg-amber-600 active:bg-amber-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>この設定で表示する</span>
          </button>
        </div>
      </div>
    </div>
  );
};
