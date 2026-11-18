import React, { useState, useMemo, useRef, useEffect } from 'react';
import { User, OfficeMaster, DivisionMaster } from '../../types';
import { Search, ChevronDown, X, Check, Building2, User as UserIcon } from 'lucide-react';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import { sortUsersByDivision } from '../../utils/userSort';
import { doesUserMatchOffice } from '../../utils/masterResolver';

export interface SingleMemberSelectProps {
  label: string;
  allUsers: User[];
  selectedUserId: string;
  fallbackName?: string;
  onChange: (userId: string, user?: User | null) => void;
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  preferredOfficeId?: string;
  preferredOfficeName?: string;
  placeholder?: string;
  disabled?: boolean;
}

export const SingleMemberSelect: React.FC<SingleMemberSelectProps> = ({
  label,
  allUsers,
  selectedUserId,
  fallbackName,
  onChange,
  offices = [],
  divisions = [],
  preferredOfficeId,
  preferredOfficeName,
  placeholder = 'メンバーから選択...',
  disabled = false,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [onlyPreferredOffice, setOnlyPreferredOffice] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const selectedUser = useMemo(() => {
    if (!selectedUserId) return undefined;
    return allUsers.find((u) => String(u.id) === String(selectedUserId));
  }, [allUsers, selectedUserId]);

  const officeFilterKey = preferredOfficeId || preferredOfficeName || '';

  const isUserInPreferredOffice = (u: User) => {
    if (!officeFilterKey) return false;
    return doesUserMatchOffice(u, officeFilterKey, offices);
  };

  const sortedAndFilteredUsers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = allUsers.filter((u) => {
      if (onlyPreferredOffice && officeFilterKey && !isUserInPreferredOffice(u)) {
        return false;
      }
      if (!q) return true;
      return (
        u.name?.toLowerCase().includes(q) ||
        u.kanaName?.toLowerCase().includes(q) ||
        u.office?.toLowerCase().includes(q) ||
        u.division?.toLowerCase().includes(q) ||
        u.position?.toLowerCase().includes(q) ||
        u.department?.toLowerCase().includes(q)
      );
    });

    const sorted = sortUsersByDivision(filtered, divisions);
    if (!officeFilterKey) return sorted;

    // 編集中の拠点に所属するメンバーを先頭に優先表示
    const inOffice: User[] = [];
    const others: User[] = [];
    for (const u of sorted) {
      if (isUserInPreferredOffice(u)) {
        inOffice.push(u);
      } else {
        others.push(u);
      }
    }
    return [...inOffice, ...others];
  }, [allUsers, divisions, offices, searchQuery, onlyPreferredOffice, officeFilterKey]);

  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => searchInputRef.current?.focus(), 30);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  const handleSelect = (user: User | null) => {
    if (disabled) return;
    onChange(user ? String(user.id) : '', user);
    setIsOpen(false);
  };

  const displayName = selectedUser?.name || (selectedUserId ? fallbackName || selectedUserId : '');
  const displaySub = selectedUser
    ? [selectedUser.office, selectedUser.division, selectedUser.position].filter(Boolean).join(' / ')
    : '';

  return (
    <div ref={containerRef} className="relative">
      <label className="block text-xs font-bold text-slate-700 mb-1">
        {label}
      </label>

      <div className="relative flex items-center">
        <button
          type="button"
          disabled={disabled}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-lg border text-left transition-all cursor-pointer ${
            isOpen
              ? 'bg-white border-indigo-500 ring-2 ring-indigo-500/20'
              : 'bg-slate-50 border-slate-200 hover:bg-white hover:border-slate-300'
          } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
        >
          {displayName ? (
            <div className="flex items-center gap-2 min-w-0 flex-1 pr-5">
              {selectedUser ? (
                <img
                  src={getAvatarUrl(selectedUser.avatarUrl)}
                  alt={selectedUser.name}
                  onError={handleAvatarError}
                  className="w-5 h-5 rounded-full object-cover shrink-0 border border-slate-200"
                />
              ) : (
                <div className="w-5 h-5 rounded-full bg-slate-200 flex items-center justify-center shrink-0">
                  <UserIcon className="w-3 h-3 text-slate-500" />
                </div>
              )}
              <div className="min-w-0 flex-1">
                <span className="text-xs font-bold text-slate-800 block truncate">
                  {displayName}
                </span>
                {displaySub && (
                  <span className="text-[10px] text-slate-500 block truncate leading-tight">
                    {displaySub}
                  </span>
                )}
              </div>
            </div>
          ) : (
            <span className="text-xs text-slate-400 font-medium truncate">
              {placeholder}
            </span>
          )}

          <ChevronDown
            className={`w-4 h-4 text-slate-400 shrink-0 transition-transform ${
              isOpen ? 'rotate-180 text-indigo-600' : ''
            }`}
          />
        </button>

        {displayName && !disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              handleSelect(null);
            }}
            title="選択を解除"
            className="absolute right-8 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-full transition-colors cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-1.5 z-50 bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden">
          <div className="p-2 border-b border-slate-100 bg-slate-50/80 space-y-1.5">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                ref={searchInputRef}
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="氏名・フリガナ・部署で検索..."
                className="w-full pl-8 pr-7 py-1.5 bg-white border border-slate-200 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3 h-3" />
                </button>
              )}
            </div>

            {officeFilterKey && (
              <div className="flex items-center justify-between gap-2 px-0.5">
                <button
                  type="button"
                  onClick={() => setOnlyPreferredOffice((prev) => !prev)}
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                    onlyPreferredOffice
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Building2 className="w-3 h-3" />
                  <span>{preferredOfficeName ? `${preferredOfficeName}のみ` : 'この拠点のみ'}</span>
                </button>
                <span className="text-[10px] text-slate-400 font-medium">
                  {sortedAndFilteredUsers.length} 名
                </span>
              </div>
            )}
          </div>

          <div className="max-h-52 overflow-y-auto divide-y divide-slate-50">
            <button
              type="button"
              onClick={() => handleSelect(null)}
              className={`w-full px-3 py-2 text-left text-xs flex items-center justify-between hover:bg-slate-50 transition-colors cursor-pointer ${
                !selectedUserId ? 'bg-indigo-50/50 text-indigo-700 font-bold' : 'text-slate-500'
              }`}
            >
              <span>（未設定）</span>
              {!selectedUserId && <Check className="w-3.5 h-3.5 text-indigo-600 shrink-0" />}
            </button>

            {sortedAndFilteredUsers.length === 0 ? (
              <div className="px-3 py-4 text-center text-xs text-slate-400">
                該当するメンバーが見つかりません
              </div>
            ) : (
              sortedAndFilteredUsers.map((u) => {
                const isSelected = String(u.id) === String(selectedUserId);
                const isSameOffice = isUserInPreferredOffice(u);
                const subText = [u.office, u.division, u.position].filter(Boolean).join(' / ');

                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelect(u)}
                    className={`w-full px-3 py-2 text-left flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                      isSelected
                        ? 'bg-indigo-50 text-indigo-950'
                        : 'hover:bg-slate-50 text-slate-800'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      <img
                        src={getAvatarUrl(u.avatarUrl)}
                        alt={u.name}
                        onError={handleAvatarError}
                        className="w-6 h-6 rounded-full object-cover shrink-0 border border-slate-200"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs truncate ${isSelected ? 'font-bold text-indigo-900' : 'font-semibold text-slate-800'}`}>
                            {u.name}
                          </span>
                          {isSameOffice && (
                            <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-emerald-50 text-emerald-700 border border-emerald-200 shrink-0 whitespace-nowrap">
                              同拠点
                            </span>
                          )}
                        </div>
                        {subText && (
                          <p className="text-[10px] text-slate-500 truncate leading-tight mt-0.5">
                            {subText}
                          </p>
                        )}
                      </div>
                    </div>
                    {isSelected && <Check className="w-4 h-4 text-indigo-600 shrink-0" />}
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </div>
  );
};
