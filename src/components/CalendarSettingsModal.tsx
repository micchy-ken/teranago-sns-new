import React, { useState, useMemo, useEffect } from 'react';
import { CalendarViewSettings, CalendarMemberGroup, User } from '../types';
import { 
  X, 
  Calendar, 
  Clock, 
  Sliders, 
  Check, 
  SlidersHorizontal, 
  Users, 
  Plus, 
  Trash2, 
  Edit3, 
  Search, 
  ArrowLeft,
  UserCheck
} from 'lucide-react';

interface CalendarSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentSettings?: CalendarViewSettings;
  onSave?: (settings: CalendarViewSettings) => Promise<void> | void;
  onSaveSettings?: (settings: CalendarViewSettings) => Promise<void> | void;
  allUsers?: User[];
  memberGroups?: CalendarMemberGroup[];
  onSaveMemberGroups?: (groups: CalendarMemberGroup[]) => Promise<void> | void;
  initialTab?: 'display' | 'groups';
}

export function CalendarSettingsModal({
  isOpen,
  onClose,
  currentSettings,
  onSave,
  onSaveSettings,
  allUsers = [],
  memberGroups = [],
  onSaveMemberGroups,
  initialTab = 'display',
}: CalendarSettingsModalProps) {
  const [activeTab, setActiveTab] = useState<'display' | 'groups'>(initialTab);

  // --- 表示設定ステート ---
  const [hideWeekends, setHideWeekends] = useState<boolean>(currentSettings?.hideWeekends ?? false);
  const [isTimeFilterActive, setIsTimeFilterActive] = useState<boolean>(currentSettings?.isTimeFilterActive ?? false);
  const [workStartHour, setWorkStartHour] = useState<number>(currentSettings?.workStartHour ?? 8);
  const [workEndHour, setWorkEndHour] = useState<number>(currentSettings?.workEndHour ?? 19);
  const [density, setDensity] = useState<'standard' | 'compact'>(currentSettings?.density ?? 'standard');
  const [isSavingSettings, setIsSavingSettings] = useState(false);

  // --- マイグループ管理ステート ---
  const [localGroups, setLocalGroups] = useState<CalendarMemberGroup[]>(memberGroups);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null); // 'new' | existingId | null
  const [groupNameInput, setGroupNameInput] = useState('');
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [memberSearchQuery, setMemberSearchQuery] = useState('');
  const [selectedOfficeFilter, setSelectedOfficeFilter] = useState<string>('all');
  const [selectedDivisionFilter, setSelectedDivisionFilter] = useState<string>('all');
  const [isSavingGroup, setIsSavingGroup] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [groupSuccessMsg, setGroupSuccessMsg] = useState<string | null>(null);

  // モーダルが開いた時の初期化
  useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
      setHideWeekends(currentSettings?.hideWeekends ?? false);
      setIsTimeFilterActive(currentSettings?.isTimeFilterActive ?? false);
      setWorkStartHour(currentSettings?.workStartHour ?? 8);
      setWorkEndHour(currentSettings?.workEndHour ?? 19);
      setDensity(currentSettings?.density ?? 'standard');
      setIsSavingSettings(false);
      setLocalGroups(memberGroups);
      setEditingGroupId(null);
      setDeleteConfirmId(null);
      setGroupSuccessMsg(null);
    }
  }, [isOpen, initialTab, currentSettings, memberGroups]);

  // 全ユーザーから抽出する拠点・部署リスト
  const availableOffices = useMemo(() => {
    const set = new Set<string>();
    allUsers.forEach(u => {
      if (u.office && u.office !== '全社' && u.office !== '全拠点') set.add(u.office);
    });
    return Array.from(set).sort();
  }, [allUsers]);

  const availableDivisions = useMemo(() => {
    const set = new Set<string>();
    allUsers.forEach(u => {
      if (u.division && u.division !== '全部署') set.add(u.division);
    });
    return Array.from(set).sort();
  }, [allUsers]);

  // メンバー選択用：フィルタリングされたユーザー一覧
  const filteredUsers = useMemo(() => {
    const q = memberSearchQuery.trim().toLowerCase();
    return allUsers.filter(u => {
      if (selectedOfficeFilter !== 'all' && u.office !== selectedOfficeFilter) return false;
      if (selectedDivisionFilter !== 'all' && u.division !== selectedDivisionFilter) return false;
      if (q) {
        const nameMatch = (u.name || '').toLowerCase().includes(q);
        const kanaMatch = (u.kanaName || '').toLowerCase().includes(q);
        const deptMatch = (u.department || '').toLowerCase().includes(q);
        const officeMatch = (u.office || '').toLowerCase().includes(q);
        const divMatch = (u.division || '').toLowerCase().includes(q);
        if (!nameMatch && !kanaMatch && !deptMatch && !officeMatch && !divMatch) return false;
      }
      return true;
    });
  }, [allUsers, memberSearchQuery, selectedOfficeFilter, selectedDivisionFilter]);

  if (!isOpen) return null;

  // 表示設定の保存
  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    const saveFn = onSaveSettings || onSave;
    try {
      if (saveFn) {
        await saveFn({
          hideWeekends,
          isTimeFilterActive,
          workStartHour: Number(workStartHour),
          workEndHour: Number(workEndHour),
          density,
        });
      }
      onClose();
    } catch (err) {
      console.error('Failed to save calendar view settings:', err);
    } finally {
      setIsSavingSettings(false);
    }
  };

  // 新規グループ作成開始
  const handleStartCreateGroup = () => {
    setEditingGroupId('new');
    setGroupNameInput('');
    setSelectedUserIds([]);
    setMemberSearchQuery('');
    setSelectedOfficeFilter('all');
    setSelectedDivisionFilter('all');
  };

  // 既存グループ編集開始
  const handleStartEditGroup = (group: CalendarMemberGroup) => {
    setEditingGroupId(group.id);
    setGroupNameInput(group.name);
    setSelectedUserIds([...group.memberIds]);
    setMemberSearchQuery('');
    setSelectedOfficeFilter('all');
    setSelectedDivisionFilter('all');
  };

  // グループ作成・編集キャンセル
  const handleCancelEditGroup = () => {
    setEditingGroupId(null);
    setGroupNameInput('');
    setSelectedUserIds([]);
  };

  // グループ保存実行
  const handleSaveGroup = async () => {
    if (!groupNameInput.trim()) {
      alert('グループ名を入力してください');
      return;
    }
    if (selectedUserIds.length === 0) {
      alert('少なくとも1名のメンバーを選択してください');
      return;
    }

    setIsSavingGroup(true);
    try {
      let updated: CalendarMemberGroup[];
      if (editingGroupId === 'new') {
        const newGroup: CalendarMemberGroup = {
          id: `group_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          name: groupNameInput.trim(),
          memberIds: selectedUserIds,
          createdAt: new Date().toISOString(),
        };
        updated = [...localGroups, newGroup];
      } else {
        updated = localGroups.map(g => {
          if (g.id === editingGroupId) {
            return {
              ...g,
              name: groupNameInput.trim(),
              memberIds: selectedUserIds,
            };
          }
          return g;
        });
      }

      setLocalGroups(updated);
      if (onSaveMemberGroups) {
        await onSaveMemberGroups(updated);
      }
      setEditingGroupId(null);
      setGroupSuccessMsg(editingGroupId === 'new' ? 'グループを作成しました' : 'グループを更新しました');
      setTimeout(() => setGroupSuccessMsg(null), 3000);
    } catch (err) {
      console.error('Failed to save member group:', err);
      alert('グループの保存に失敗しました');
    } finally {
      setIsSavingGroup(false);
    }
  };

  // グループ削除
  const handleDeleteGroup = async (groupId: string) => {
    const updated = localGroups.filter(g => g.id !== groupId);
    setLocalGroups(updated);
    setDeleteConfirmId(null);
    if (onSaveMemberGroups) {
      await onSaveMemberGroups(updated);
    }
    setGroupSuccessMsg('グループを削除しました');
    setTimeout(() => setGroupSuccessMsg(null), 3000);
  };

  // メンバー選択切り替え
  const toggleUserSelection = (userId: string) => {
    setSelectedUserIds(prev => {
      if (prev.includes(userId)) {
        return prev.filter(id => id !== userId);
      } else {
        return [...prev, userId];
      }
    });
  };

  // 現在フィルターされているユーザーを全選択
  const handleSelectAllFiltered = () => {
    const filteredIds = filteredUsers.map(u => u.id);
    setSelectedUserIds(prev => Array.from(new Set([...prev, ...filteredIds])));
  };

  // 現在フィルターされているユーザーを全解除
  const handleDeselectAllFiltered = () => {
    const filteredIdSet = new Set(filteredUsers.map(u => u.id));
    setSelectedUserIds(prev => prev.filter(id => !filteredIdSet.has(id)));
  };

  const hoursOptions = Array.from({ length: 24 }, (_, i) => i);
  const usersMap = new Map(allUsers.map(u => [u.id, u]));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="bg-white rounded-2xl shadow-xl border border-slate-200 w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh] animate-in zoom-in-95 duration-150"
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shadow-2xs">
              {activeTab === 'display' ? <SlidersHorizontal className="w-4 h-4" /> : <Users className="w-4 h-4" />}
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-800">カレンダー設定</h3>
              <p className="text-[11px] text-slate-500">表示形式・時間帯やカスタムグループを設定できます</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            title="閉じる"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Switcher */}
        <div className="px-5 pt-3 pb-0 bg-slate-50/60 border-b border-slate-200 flex gap-2">
          <button
            type="button"
            onClick={() => {
              setActiveTab('display');
              setEditingGroupId(null);
            }}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'display'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-100/60 rounded-t-lg'
            }`}
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            <span>表示設定</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('groups')}
            className={`flex items-center gap-1.5 px-3.5 py-2 text-xs font-bold border-b-2 transition-all cursor-pointer ${
              activeTab === 'groups'
                ? 'border-indigo-600 text-indigo-700 bg-white rounded-t-lg shadow-2xs'
                : 'border-transparent text-slate-600 hover:text-slate-800 hover:bg-slate-100/60 rounded-t-lg'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>マイグループ</span>
            {localGroups.length > 0 && (
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-bold ${
                activeTab === 'groups' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-700'
              }`}>
                {localGroups.length}
              </span>
            )}
          </button>
        </div>

        {/* Success Feedback Banner */}
        {groupSuccessMsg && (
          <div className="bg-emerald-50 border-b border-emerald-200 px-5 py-2 text-xs font-bold text-emerald-800 flex items-center gap-1.5 animate-in fade-in">
            <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span>{groupSuccessMsg}</span>
          </div>
        )}

        {/* ========================================================
            TAB 1: 表示設定 (平日のみ / 時間帯 / 密度)
        ======================================================== */}
        {activeTab === 'display' && (
          <>
            <div className="p-5 overflow-y-auto space-y-6 flex-1 text-sm">
              {/* Section 1: 平日のみ表示 (土日非表示) */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-4 h-4 text-indigo-600" />
                    <span className="font-bold text-slate-800">平日のみ表示（土日非表示）</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={hideWeekends}
                      onChange={(e) => setHideWeekends(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  土曜日と日曜日をカレンダー（月表示・週表示・チーム週表示）から除外して、月曜日〜金曜日の5日間を大きくワイドに表示します。
                </p>
              </div>

              <hr className="border-slate-100" />

              {/* Section 2: 時間帯の絞り込み (就業時間帯表示) */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Clock className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-slate-800">時間帯の絞り込み（就業時間帯表示）</span>
                  </div>
                  <label className="relative inline-flex items-center cursor-pointer">
                    <input
                      type="checkbox"
                      checked={isTimeFilterActive}
                      onChange={(e) => setIsTimeFilterActive(e.target.checked)}
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                  </label>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  週表示や日表示・チームタイムラインで、指定した業務時間帯のみを表示し、早朝や深夜の不要な余白をカットします。
                </p>

                {isTimeFilterActive && (
                  <div className="bg-slate-50 rounded-xl p-3.5 border border-slate-200/80 space-y-2">
                    <div className="text-xs font-semibold text-slate-700">表示する時間帯:</div>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <label className="text-[11px] text-slate-500 block mb-1">開始時刻</label>
                        <select
                          value={workStartHour}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setWorkStartHour(val);
                            if (val >= workEndHour) {
                              setWorkEndHour(Math.min(23, val + 1));
                            }
                          }}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                        >
                          {hoursOptions.filter(h => h < 23).map(h => (
                            <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                          ))}
                        </select>
                      </div>
                      <span className="text-slate-400 font-bold self-end mb-2">〜</span>
                      <div className="flex-1">
                        <label className="text-[11px] text-slate-500 block mb-1">終了時刻</label>
                        <select
                          value={workEndHour}
                          onChange={(e) => setWorkEndHour(Number(e.target.value))}
                          className="w-full bg-white border border-slate-300 rounded-lg px-2.5 py-1.5 text-xs font-bold text-slate-800 focus:outline-none focus:ring-2 focus:ring-indigo-500 shadow-2xs"
                        >
                          {hoursOptions.filter(h => h > workStartHour).map(h => (
                            <option key={h} value={h}>{String(h).padStart(2, '0')}:00</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <hr className="border-slate-100" />

              {/* Section 3: 表示密度 */}
              <div className="space-y-3">
                <div className="flex items-center gap-2">
                  <Sliders className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-800">表示密度</span>
                </div>
                <p className="text-xs text-slate-500 leading-relaxed">
                  画面に表示する予定の文字サイズやマスの高さを調整します。
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    onClick={() => setDensity('standard')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      density === 'standard'
                        ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-200'
                        : 'border-slate-200 hover:bg-slate-50 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-800">標準</span>
                      {density === 'standard' && <Check className="w-4 h-4 text-indigo-600" />}
                    </div>
                    <span className="text-[11px] text-slate-500 leading-tight">
                      標準の余白と文字サイズで、視認性と押しやすさを重視します。
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDensity('compact')}
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col gap-1 ${
                      density === 'compact'
                        ? 'border-indigo-600 bg-indigo-50/60 ring-2 ring-indigo-200'
                        : 'border-slate-200 hover:bg-slate-50 bg-white'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-800">コンパクト</span>
                      {density === 'compact' && <Check className="w-4 h-4 text-indigo-600" />}
                    </div>
                    <span className="text-[11px] text-slate-500 leading-tight">
                      マスの高さや余白を小さくし、一度に多くの予定・メンバーを表示します。
                    </span>
                  </button>
                </div>
              </div>
            </div>

            {/* Footer for Display Settings */}
            <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={onClose}
                disabled={isSavingSettings}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSaveSettings}
                disabled={isSavingSettings}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                {isSavingSettings ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    <span>保存中...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>設定を保存</span>
                  </>
                )}
              </button>
            </div>
          </>
        )}

        {/* ========================================================
            TAB 2: マイグループ管理 (登録・編集・削除)
        ======================================================== */}
        {activeTab === 'groups' && (
          <div className="flex flex-col flex-1 overflow-hidden">
            {editingGroupId === null ? (
              // ----------------------------------------------------
              // 1. グループ一覧表示モード
              // ----------------------------------------------------
              <>
                <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
                  <div className="flex items-center justify-between">
                    <div>
                      <h4 className="text-xs sm:text-sm font-bold text-slate-800">登録済みマイグループ</h4>
                      <p className="text-[11px] text-slate-500">
                        プロジェクトや現場班など、よく予定を確認するメンバーをグループ化できます
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleStartCreateGroup}
                      className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white text-xs font-bold rounded-xl shadow-2xs transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                    >
                      <Plus className="w-4 h-4" />
                      <span>新規グループ</span>
                    </button>
                  </div>

                  {localGroups.length === 0 ? (
                    <div className="py-12 px-4 text-center border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50/50">
                      <div className="w-12 h-12 rounded-2xl bg-indigo-50 text-indigo-600 flex items-center justify-center mx-auto mb-3">
                        <Users className="w-6 h-6" />
                      </div>
                      <h5 className="text-xs sm:text-sm font-bold text-slate-700 mb-1">
                        マイグループが登録されていません
                      </h5>
                      <p className="text-xs text-slate-500 max-w-sm mx-auto mb-4 leading-relaxed">
                        プロジェクトメンバーや他部署の連携相手を登録すると、チームカレンダー上で素早く切り替えて一覧表示できます。
                      </p>
                      <button
                        type="button"
                        onClick={handleStartCreateGroup}
                        className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-4 h-4" />
                        <span>最初のグループを作成</span>
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {localGroups.map(group => {
                        const members = group.memberIds
                          .map(id => usersMap.get(id))
                          .filter((u): u is User => Boolean(u));

                        return (
                          <div
                            key={group.id}
                            className="p-3.5 bg-white border border-slate-200 rounded-xl hover:border-slate-300 transition-all shadow-2xs flex flex-col gap-2.5"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-2">
                                  <span className="font-bold text-slate-800 text-xs sm:text-sm truncate">
                                    {group.name}
                                  </span>
                                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 font-bold shrink-0">
                                    {group.memberIds.length}名
                                  </span>
                                </div>
                              </div>

                              {/* 操作ボタン */}
                              <div className="flex items-center gap-1 shrink-0">
                                <button
                                  type="button"
                                  onClick={() => handleStartEditGroup(group)}
                                  className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer"
                                  title="グループを編集"
                                >
                                  <Edit3 className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteConfirmId(group.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                                  title="グループを削除"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* 削除確認ダイアログ */}
                            {deleteConfirmId === group.id && (
                              <div className="p-2.5 bg-rose-50 border border-rose-200 rounded-lg flex items-center justify-between gap-2 text-xs text-rose-800 animate-in fade-in">
                                <span>グループ「{group.name}」を削除しますか？</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button
                                    type="button"
                                    onClick={() => setDeleteConfirmId(null)}
                                    className="px-2 py-1 text-slate-600 hover:bg-slate-200/60 rounded text-[11px] font-semibold"
                                  >
                                    キャンセル
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleDeleteGroup(group.id)}
                                    className="px-2 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded text-[11px] font-bold"
                                  >
                                    削除する
                                  </button>
                                </div>
                              </div>
                            )}

                            {/* メンバーのアバター・名前プレビュー */}
                            <div className="flex items-center gap-2 pt-1 border-t border-slate-100 flex-wrap">
                              <div className="flex items-center -space-x-1.5 overflow-hidden py-0.5">
                                {members.slice(0, 6).map((m, idx) => (
                                  <div
                                    key={m.id || idx}
                                    className="relative inline-block w-6 h-6 rounded-full ring-2 ring-white overflow-hidden bg-slate-200 shrink-0"
                                    title={`${m.name} (${m.office || ''} ${m.division || ''})`}
                                  >
                                    {m.avatarUrl ? (
                                      <img src={m.avatarUrl} alt={m.name} className="w-full h-full object-cover" />
                                    ) : (
                                      <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 text-[9px] font-bold">
                                        {(m.name || '').substring(0, 1)}
                                      </div>
                                    )}
                                  </div>
                                ))}
                                {members.length > 6 && (
                                  <div className="relative inline-flex items-center justify-center w-6 h-6 rounded-full ring-2 ring-white bg-slate-100 text-slate-600 text-[9px] font-bold">
                                    +{members.length - 6}
                                  </div>
                                )}
                              </div>
                              <span className="text-[11px] text-slate-500 truncate max-w-xs">
                                {members.map(m => m.name).join('、 ')}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="px-5 py-3 bg-slate-50 border-t border-slate-200 flex items-center justify-end">
                  <button
                    type="button"
                    onClick={onClose}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
                  >
                    閉じる
                  </button>
                </div>
              </>
            ) : (
              // ----------------------------------------------------
              // 2. グループ作成・編集モード
              // ----------------------------------------------------
              <>
                <div className="p-4 sm:p-5 overflow-y-auto flex-1 space-y-4">
                  {/* Back button and title */}
                  <div className="flex items-center gap-2 pb-2 border-b border-slate-100">
                    <button
                      type="button"
                      onClick={handleCancelEditGroup}
                      className="p-1 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                      title="一覧に戻る"
                    >
                      <ArrowLeft className="w-4 h-4" />
                    </button>
                    <h4 className="text-xs sm:text-sm font-bold text-slate-800">
                      {editingGroupId === 'new' ? '新規グループの作成' : 'グループの編集'}
                    </h4>
                  </div>

                  {/* グループ名入力 */}
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1.5">
                      グループ名 <span className="text-rose-500">*</span>
                    </label>
                    <input
                      type="text"
                      value={groupNameInput}
                      onChange={(e) => setGroupNameInput(e.target.value)}
                      placeholder="例: プロジェクトA、現場点検班、役員会"
                      className="w-full bg-slate-50 border border-slate-300 rounded-xl px-3 py-2 text-xs text-slate-800 font-semibold focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white transition-all shadow-2xs"
                      autoFocus
                    />
                  </div>

                  {/* メンバー選択セクション */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <label className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                        <Users className="w-3.5 h-3.5 text-indigo-600" />
                        <span>所属メンバーの選択</span>
                        <span className="text-rose-500">*</span>
                      </label>
                      <div className="text-[11px] font-bold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full">
                        選択中: {selectedUserIds.length}名
                      </div>
                    </div>

                    {/* 絞り込みフィルターバー */}
                    <div className="space-y-1.5">
                      <div className="relative">
                        <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                        <input
                          type="text"
                          value={memberSearchQuery}
                          onChange={(e) => setMemberSearchQuery(e.target.value)}
                          placeholder="氏名・部署・拠点で絞り込み検索..."
                          className="w-full bg-slate-50 border border-slate-200 rounded-lg pl-8 pr-3 py-1.5 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>

                      <div className="flex items-center gap-2 text-xs">
                        <select
                          value={selectedOfficeFilter}
                          onChange={(e) => setSelectedOfficeFilter(e.target.value)}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none"
                        >
                          <option value="all">全拠点</option>
                          {availableOffices.map(o => (
                            <option key={o} value={o}>{o}</option>
                          ))}
                        </select>

                        <select
                          value={selectedDivisionFilter}
                          onChange={(e) => setSelectedDivisionFilter(e.target.value)}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-lg px-2 py-1 text-[11px] font-semibold text-slate-700 focus:outline-none"
                        >
                          <option value="all">全部署</option>
                          {availableDivisions.map(d => (
                            <option key={d} value={d}>{d}</option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={handleSelectAllFiltered}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold cursor-pointer shrink-0 transition-colors"
                        >
                          全選択
                        </button>
                        <button
                          type="button"
                          onClick={handleDeselectAllFiltered}
                          className="px-2 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded text-[11px] font-semibold cursor-pointer shrink-0 transition-colors"
                        >
                          全解除
                        </button>
                      </div>
                    </div>

                    {/* メンバー選択リスト */}
                    <div className="border border-slate-200 rounded-xl overflow-hidden max-h-56 overflow-y-auto divide-y divide-slate-100 bg-white">
                      {filteredUsers.length === 0 ? (
                        <div className="p-6 text-center text-xs text-slate-400">
                          該当するメンバーが見つかりません
                        </div>
                      ) : (
                        filteredUsers.map(user => {
                          const isSelected = selectedUserIds.includes(user.id);
                          return (
                            <div
                              key={user.id}
                              onClick={() => toggleUserSelection(user.id)}
                              className={`px-3 py-2 flex items-center justify-between gap-2.5 cursor-pointer transition-colors ${
                                isSelected ? 'bg-indigo-50/70 hover:bg-indigo-50' : 'hover:bg-slate-50'
                              }`}
                            >
                              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                <div className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 transition-colors ${
                                  isSelected ? 'bg-indigo-600 border-indigo-600 text-white' : 'border-slate-300 bg-white'
                                }`}>
                                  {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                                </div>

                                <div className="w-7 h-7 rounded-full overflow-hidden bg-slate-200 shrink-0">
                                  {user.avatarUrl ? (
                                    <img src={user.avatarUrl} alt={user.name} className="w-full h-full object-cover" />
                                  ) : (
                                    <div className="w-full h-full flex items-center justify-center bg-indigo-100 text-indigo-700 text-xs font-bold">
                                      {(user.name || '').substring(0, 1)}
                                    </div>
                                  )}
                                </div>

                                <div className="min-w-0 flex-1 truncate">
                                  <div className="flex items-center gap-1.5">
                                    <span className="font-bold text-xs text-slate-800 truncate">{user.name}</span>
                                    {user.position && (
                                      <span className="text-[10px] text-slate-400 font-medium truncate">
                                        ({user.position})
                                      </span>
                                    )}
                                  </div>
                                  <div className="text-[10px] text-slate-500 truncate">
                                    {user.office && <span>{user.office} </span>}
                                    {user.division && <span>{user.division}</span>}
                                  </div>
                                </div>
                              </div>

                              {isSelected && (
                                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-100/60 px-1.5 py-0.5 rounded shrink-0">
                                  参加
                                </span>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>

                {/* Footer for Group Edit Mode */}
                <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-end gap-2.5">
                  <button
                    type="button"
                    onClick={handleCancelEditGroup}
                    disabled={isSavingGroup}
                    className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 hover:bg-slate-200/80 rounded-xl transition-colors cursor-pointer"
                  >
                    キャンセル
                  </button>
                  <button
                    type="button"
                    onClick={handleSaveGroup}
                    disabled={isSavingGroup}
                    className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                  >
                    {isSavingGroup ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                        <span>保存中...</span>
                      </>
                    ) : (
                      <>
                        <UserCheck className="w-4 h-4" />
                        <span>グループを保存</span>
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
