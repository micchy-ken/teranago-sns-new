import React from 'react';
import { 
  X, 
  Users, 
  Building2, 
  Briefcase, 
  Check, 
  Settings, 
  Plus, 
  ChevronRight, 
  Sparkles,
  Filter
} from 'lucide-react';
import { User, CalendarMemberGroup, EventType } from '../types';

export interface MobileTeamSettingsModalProps {
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
  memberGroups: CalendarMemberGroup[];
  allUsers?: User[];
  teamMembersCount: number;
  selectedTypeFilter: string;
  onSelectTypeFilter: (type: string) => void;
  typeLabels: Record<EventType, string>;
  onOpenManageGroups: () => void;
}

export const MobileTeamSettingsModal: React.FC<MobileTeamSettingsModalProps> = ({
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
  memberGroups,
  allUsers = [],
  teamMembersCount,
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

  // 所属（拠点・部署）での対象ユーザー名プレビュー
  const orgMatchingUsers = isOrgMode
    ? allUsers.filter(u => {
        const matchOffice = !selectedOffice || selectedOffice === '全社' || selectedOffice === '全拠点' || u.office === selectedOffice;
        const matchDiv = !selectedDivision || selectedDivision === '全部署' || u.division === selectedDivision;
        return matchOffice && matchDiv;
      })
    : [];

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
        <div className="px-4 py-3.5 bg-gradient-to-r from-indigo-50/90 via-white to-blue-50/80 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2 min-w-0">
            <div className="p-2 bg-indigo-600 text-white rounded-xl shadow-xs">
              <Users className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-900 leading-tight">チーム・マイグループ設定</h3>
              <p className="text-[11px] text-slate-500 truncate">スマホ表示時のカレンダー対象メンバーを設定</p>
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
                    ? 'bg-white text-indigo-700 shadow-xs border border-indigo-200'
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
              パターンA: 所属（拠点・部署）選択
          ======================================================== */}
          {isOrgMode && (
            <div className="space-y-3 bg-slate-50/70 p-3.5 rounded-xl border border-slate-200/80">
              <div className="flex items-center gap-1.5 text-slate-800 font-bold text-xs pb-1 border-b border-slate-200/60">
                <Building2 className="w-3.5 h-3.5 text-indigo-600" />
                <span>拠点・部署の選択</span>
              </div>

              {/* 拠点選択 */}
              <div>
                <label className="text-[11px] font-bold text-slate-600 mb-1 block">拠点（オフィス）</label>
                <select
                  value={selectedOffice}
                  onChange={e => onSelectOffice(e.target.value)}
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
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
                  className="w-full bg-white border border-slate-300 rounded-lg px-3 py-2 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs cursor-pointer"
                >
                  {divisionNames.filter(d => d !== '全部署').map(d => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
              </div>

              {/* 対象メンバープレビュー */}
              <div className="pt-2 border-t border-slate-200/80">
                <div className="flex items-center justify-between text-[11px] font-bold text-slate-600 mb-1.5">
                  <span>カレンダー表示対象</span>
                  <span className="text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full font-bold">
                    {teamMembersCount}名
                  </span>
                </div>
                <div className="flex flex-wrap gap-1 max-h-24 overflow-y-auto pr-0.5">
                  {orgMatchingUsers.slice(0, 8).map(u => (
                    <span key={u.id} className="text-[10px] px-2 py-0.5 bg-white border border-slate-200 rounded-md text-slate-700 font-medium">
                      {u.name}
                    </span>
                  ))}
                  {orgMatchingUsers.length > 8 && (
                    <span className="text-[10px] px-2 py-0.5 bg-slate-100 text-slate-500 rounded-md font-bold">
                      他{orgMatchingUsers.length - 8}名
                    </span>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* ========================================================
              パターンB: マイグループ選択・管理
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

              {/* マイグループリスト */}
              {memberGroups.length > 0 ? (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-0.5">
                  {memberGroups.map(group => {
                    const isSelected = selectedGroupId === group.id;
                    const groupUsers = group.memberIds
                      .map(id => userMap.get(String(id)))
                      .filter(Boolean) as User[];

                    return (
                      <div
                        key={group.id}
                        onClick={() => onSelectGroupId(group.id)}
                        className={`p-2.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                          isSelected
                            ? 'bg-white border-indigo-500 ring-2 ring-indigo-200/80 shadow-xs'
                            : 'bg-white/80 border-slate-200 hover:border-indigo-300 hover:bg-white'
                        }`}
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="font-bold text-slate-900 text-xs truncate">
                              👥 {group.name}
                            </span>
                            <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded-full font-bold shrink-0">
                              {group.memberIds.length}名
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-500 truncate">
                            {groupUsers.map(u => u.name).join(', ') || 'メンバー未登録'}
                          </div>
                        </div>

                        {isSelected ? (
                          <div className="w-5 h-5 rounded-full bg-indigo-600 text-white flex items-center justify-center shrink-0">
                            <Check className="w-3 h-3 stroke-[3]" />
                          </div>
                        ) : (
                          <div className="w-5 h-5 rounded-full border border-slate-300 shrink-0" />
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="py-4 px-3 bg-white rounded-xl border border-dashed border-indigo-300 text-center space-y-2">
                  <Users className="w-8 h-8 text-indigo-300 mx-auto" />
                  <div>
                    <p className="text-xs font-bold text-slate-800">マイグループが未登録です</p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      よく確認するメンバーをまとめて登録すると、ワンタップでカレンダーを切り替えられます
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
            className="flex-1 py-2 px-4 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer flex items-center justify-center gap-1.5"
          >
            <Check className="w-4 h-4" />
            <span>この設定で表示する</span>
          </button>
        </div>
      </div>
    </div>
  );
};
