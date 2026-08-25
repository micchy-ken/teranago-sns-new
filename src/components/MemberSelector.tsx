import React, { useState, useMemo } from 'react';
import { User, OfficeMaster, DivisionMaster } from '../types';
import { 
  Users, 
  Check, 
  X, 
  Search, 
  ChevronDown, 
  ChevronUp, 
  CheckSquare, 
  Square,
  Building2,
  Briefcase,
  Filter
} from 'lucide-react';
import { getAvatarUrl } from '../utils/avatar';

export interface MemberSelectorProps {
  allUsers: User[];
  selectedUserIds: string[];
  onChangeSelectedUserIds: (ids: string[]) => void;
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  disabled?: boolean;
  label?: string;
  placeholder?: string;
  className?: string;
  defaultExpanded?: boolean;
}

export const MemberSelector: React.FC<MemberSelectorProps> = ({
  allUsers = [],
  selectedUserIds = [],
  onChangeSelectedUserIds,
  offices = [],
  divisions = [],
  disabled = false,
  label = 'メンバー選択',
  className = '',
  defaultExpanded = true
}) => {
  // 絞り込みフィルター状態
  const [selectedOffice, setSelectedOffice] = useState<string>('all');
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // 抽出メンバー表示のトグル状態
  const [isExpanded, setIsExpanded] = useState<boolean>(defaultExpanded);

  // 利用可能な拠点リストの抽出 (Master＋allUsersからの集約)
  const officeOptions = useMemo(() => {
    const list = new Set<string>();
    offices.forEach(o => { if (o.name) list.add(o.name); });
    allUsers.forEach(u => {
      if (u.office) list.add(u.office);
      // department から拠点を抽出する代替ロジック (例: "名古屋 営業" -> "名古屋")
      else if (u.department) {
        const parts = u.department.split(/\s+/);
        if (parts.length > 0 && parts[0]) list.add(parts[0]);
      }
    });
    return Array.from(list);
  }, [offices, allUsers]);

  // 利用可能な部署リストの抽出
  const divisionOptions = useMemo(() => {
    const list = new Set<string>();
    divisions.forEach(d => { if (d.name) list.add(d.name); });
    allUsers.forEach(u => {
      if (u.division) list.add(u.division);
      else if (u.department) {
        const parts = u.department.split(/\s+/);
        if (parts.length > 1 && parts[1]) list.add(parts[1]);
      }
    });
    return Array.from(list);
  }, [divisions, allUsers]);

  // 条件によるユーザーの絞り込み
  const filteredUsers = useMemo(() => {
    return allUsers.filter(u => {
      // 拠点での絞り込み
      if (selectedOffice !== 'all') {
        const userOffice = u.office || u.department?.split(/\s+/)[0] || '';
        if (userOffice !== selectedOffice) return false;
      }

      // 部署での絞り込み
      if (selectedDivision !== 'all') {
        const userDivision = u.division || u.department?.split(/\s+/)[1] || u.department || '';
        if (!userDivision.includes(selectedDivision)) return false;
      }

      // 検索ワードでの絞り込み (名前、フリガナ、メール等)
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = u.name?.toLowerCase().includes(q);
        const matchKana = u.kanaName?.toLowerCase().includes(q);
        const matchDepartment = u.department?.toLowerCase().includes(q);
        const matchEmail = u.email?.toLowerCase().includes(q);
        if (!matchName && !matchKana && !matchDepartment && !matchEmail) {
          return false;
        }
      }

      return true;
    });
  }, [allUsers, selectedOffice, selectedDivision, searchQuery]);

  // 選択中ユーザーオブジェクト一覧
  const selectedUsers = useMemo(() => {
    return allUsers.filter(u => selectedUserIds.includes(u.id));
  }, [allUsers, selectedUserIds]);

  // 抽出メンバーが全員選択されているかチェック
  const isAllFilteredSelected = useMemo(() => {
    if (filteredUsers.length === 0) return false;
    return filteredUsers.every(u => selectedUserIds.includes(u.id));
  }, [filteredUsers, selectedUserIds]);

  // 抽出メンバーの全選択/全解除切り替え
  const handleToggleSelectAllFiltered = () => {
    if (disabled) return;
    if (isAllFilteredSelected) {
      // 抽出されたメンバーの選択を解除（他の条件で選択中のメンバーは維持）
      const filteredIds = new Set(filteredUsers.map(u => u.id));
      const nextIds = selectedUserIds.filter(id => !filteredIds.has(id));
      onChangeSelectedUserIds(nextIds);
    } else {
      // 抽出されたメンバーをすべて追加（重複なし）
      const nextSet = new Set(selectedUserIds);
      filteredUsers.forEach(u => nextSet.add(u.id));
      onChangeSelectedUserIds(Array.from(nextSet));
    }
  };

  // 個別ユーザーの選択トグル
  const handleToggleUser = (userId: string) => {
    if (disabled) return;
    if (selectedUserIds.includes(userId)) {
      onChangeSelectedUserIds(selectedUserIds.filter(id => id !== userId));
    } else {
      onChangeSelectedUserIds([...selectedUserIds, userId]);
    }
  };

  // 選択中のメンバーを全てクリア
  const handleClearAll = () => {
    if (disabled) return;
    onChangeSelectedUserIds([]);
  };

  // 絞り込み条件の表示用テキスト
  const filterLabel = useMemo(() => {
    const parts: string[] = [];
    if (selectedOffice !== 'all') parts.push(`拠点「${selectedOffice}」`);
    if (selectedDivision !== 'all') parts.push(`部署「${selectedDivision}」`);
    if (searchQuery) parts.push(`検索「${searchQuery}」`);
    if (parts.length === 0) return '全員';
    return parts.join(' / ');
  }, [selectedOffice, selectedDivision, searchQuery]);

  return (
    <div className={`space-y-3 bg-white p-3.5 rounded-xl border border-slate-200 shadow-2xs ${className}`}>
      {/* ヘッダー & 選択中人数カウント */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2.5">
        <div className="flex items-center gap-2">
          <Users className="w-4 h-4 text-indigo-600 shrink-0" />
          <span className="text-xs font-bold text-slate-800">{label}</span>
          <span className="text-xs font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200">
            {selectedUserIds.length} 名選択中
          </span>
        </div>

        {selectedUserIds.length > 0 && !disabled && (
          <button
            type="button"
            onClick={handleClearAll}
            className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 hover:underline transition-colors cursor-pointer"
          >
            全選択解除
          </button>
        )}
      </div>

      {/* 選択済みメンバーのタグバッジ表示エリア */}
      {selectedUsers.length > 0 && (
        <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto p-2 bg-indigo-50/50 rounded-lg border border-indigo-100/80 text-xs">
          {selectedUsers.map(u => (
            <span
              key={u.id}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-white text-slate-800 border border-indigo-200 text-xs font-medium shadow-2xs group"
            >
              <img
                src={getAvatarUrl(u.avatarUrl)}
                alt={u.name}
                className="w-4 h-4 rounded-full object-cover shrink-0"
              />
              <span className="truncate max-w-[120px]">{u.name}</span>
              {!disabled && (
                <button
                  type="button"
                  onClick={() => handleToggleUser(u.id)}
                  className="text-slate-400 hover:text-rose-600 p-0.5 rounded-full hover:bg-rose-50 transition-colors cursor-pointer"
                  title={`${u.name} を選択解除`}
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </span>
          ))}
        </div>
      )}

      {/* 絞り込みコントロール (拠点、部署、キーワード) */}
      <div className="space-y-2 pt-1">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
          {/* 拠点絞り込み */}
          <div className="relative">
            <Building2 className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedOffice}
              onChange={e => setSelectedOffice(e.target.value)}
              disabled={disabled}
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
            >
              <option value="all">全拠点</option>
              {officeOptions.map(off => (
                <option key={off} value={off}>{off}</option>
              ))}
            </select>
          </div>

          {/* 部署絞り込み */}
          <div className="relative">
            <Briefcase className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={selectedDivision}
              onChange={e => setSelectedDivision(e.target.value)}
              disabled={disabled}
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
            >
              <option value="all">全部署</option>
              {divisionOptions.map(div => (
                <option key={div} value={div}>{div}</option>
              ))}
            </select>
          </div>

          {/* メンバー検索 */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="メンバー名で検索..."
              disabled={disabled}
              className="w-full text-xs pl-8 pr-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-slate-700"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-0.5"
              >
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        </div>

        {/* 「全員にチェック」全選択・全解除アクションボタン */}
        <div className="flex items-center justify-between bg-slate-50/80 px-3 py-2 rounded-lg border border-slate-200">
          <div className="text-xs text-slate-600 font-medium truncate max-w-[240px] sm:max-w-xs">
            <span className="text-slate-500 font-normal">条件: </span>
            <span className="font-bold text-slate-800">{filterLabel}</span>
            <span className="ml-1 text-[11px] text-slate-500">({filteredUsers.length}名該当)</span>
          </div>

          <button
            type="button"
            disabled={disabled || filteredUsers.length === 0}
            onClick={handleToggleSelectAllFiltered}
            className={`flex items-center gap-1.5 px-3 py-1 rounded-md text-xs font-bold transition-all cursor-pointer ${
              isAllFilteredSelected
                ? 'bg-amber-100 text-amber-800 border border-amber-300 hover:bg-amber-200'
                : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-2xs'
            } disabled:opacity-40 disabled:cursor-not-allowed`}
          >
            {isAllFilteredSelected ? (
              <>
                <CheckSquare className="w-3.5 h-3.5" />
                <span>抽出メンバーの選択を解除</span>
              </>
            ) : (
              <>
                <Square className="w-3.5 h-3.5" />
                <span>全員にチェック</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 抽出メンバー表示のトグルバー */}
      <div>
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="w-full flex items-center justify-between px-3 py-2 bg-slate-100/80 hover:bg-slate-200/70 text-slate-700 rounded-lg text-xs font-bold transition-colors cursor-pointer"
        >
          <span className="flex items-center gap-1.5">
            <Filter className="w-3.5 h-3.5 text-indigo-600" />
            <span>抽出メンバーを表示 ({filteredUsers.length}名)</span>
          </span>
          {isExpanded ? (
            <ChevronUp className="w-4 h-4 text-slate-500" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-500" />
          )}
        </button>

        {/* トグル展開時の抽出メンバー一覧 */}
        {isExpanded && (
          <div className="mt-2.5 max-h-52 overflow-y-auto p-2 border border-slate-200 rounded-lg bg-slate-50/50 space-y-1">
            {filteredUsers.length === 0 ? (
              <p className="text-xs text-slate-400 text-center py-4">
                条件に該当するメンバーが見つかりませんでした。
              </p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-1.5">
                {filteredUsers.map(user => {
                  const isSelected = selectedUserIds.includes(user.id);
                  const userDept = user.department || `${user.office || ''} ${user.division || ''}`.trim();

                  return (
                    <button
                      key={user.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => handleToggleUser(user.id)}
                      className={`flex items-center justify-between p-2 rounded-lg text-xs font-medium border transition-all text-left cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50 border-indigo-400 text-indigo-950 font-bold shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100 hover:border-slate-300'
                      } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      <div className="flex items-center gap-2 min-w-0 pr-1">
                        <img
                          src={getAvatarUrl(user.avatarUrl)}
                          alt={user.name}
                          className="w-6 h-6 rounded-full object-cover shrink-0"
                        />
                        <div className="min-w-0">
                          <p className="truncate text-xs font-semibold leading-tight">{user.name}</p>
                          {userDept && (
                            <p className="truncate text-[10px] text-slate-500 leading-tight mt-0.5">{userDept}</p>
                          )}
                        </div>
                      </div>

                      <div className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border ${
                        isSelected 
                          ? 'bg-indigo-600 border-indigo-600 text-white' 
                          : 'border-slate-300 bg-white'
                      }`}>
                        {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
