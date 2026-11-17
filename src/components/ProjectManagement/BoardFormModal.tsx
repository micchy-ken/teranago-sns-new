import React, { useState, useMemo } from 'react';
import { X, Lock, Users, Building2, Globe, Pin, Trash2, Check, Search } from 'lucide-react';
import { User, OfficeMaster, DivisionMaster, CalendarMemberGroup } from '../../types';
import { ProjectBoard, ProjectBoardType, ProjectBoardVisibility } from '../../types/project';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';

interface BoardFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  editingBoard?: ProjectBoard | null;
  currentUser: User;
  allUsers: User[];
  offices: OfficeMaster[];
  divisions: DivisionMaster[];
  onSave: (payload: Partial<ProjectBoard>) => Promise<void>;
  onDelete?: (boardId: string) => Promise<void>;
}

const COLOR_OPTIONS: { id: string; label: string; dotClass: string }[] = [
  { id: 'indigo', label: 'インディゴ', dotClass: 'bg-indigo-600' },
  { id: 'sky', label: 'スカイ', dotClass: 'bg-sky-600' },
  { id: 'emerald', label: 'エメラルド', dotClass: 'bg-emerald-600' },
  { id: 'amber', label: 'アンバー', dotClass: 'bg-amber-500' },
  { id: 'rose', label: 'ローズ', dotClass: 'bg-rose-600' },
  { id: 'violet', label: 'バイオレット', dotClass: 'bg-violet-600' },
];

export const BoardFormModal: React.FC<BoardFormModalProps> = ({
  isOpen,
  onClose,
  editingBoard,
  currentUser,
  allUsers,
  offices,
  divisions,
  onSave,
  onDelete,
}) => {
  const isDefaultPersonal = Boolean(editingBoard?.id?.startsWith('personal-'));

  const [title, setTitle] = useState(editingBoard?.title || '');
  const [description, setDescription] = useState(editingBoard?.description || '');
  const [boardType, setBoardType] = useState<ProjectBoardType>(editingBoard?.boardType || 'team');
  const [visibility, setVisibility] = useState<ProjectBoardVisibility>(
    editingBoard?.visibility || (editingBoard?.boardType === 'personal' ? 'private' : 'members')
  );
  const [officeId, setOfficeId] = useState(editingBoard?.officeId || '');
  const [office, setOffice] = useState(editingBoard?.office || '');
  const [divisionId, setDivisionId] = useState(editingBoard?.divisionId || '');
  const [division, setDivision] = useState(editingBoard?.division || '');
  const [memberIds, setMemberIds] = useState<string[]>(() => {
    if (editingBoard?.memberIds?.length) return editingBoard.memberIds.map(String);
    return currentUser?.id ? [String(currentUser.id)] : [];
  });
  const [color, setColor] = useState(editingBoard?.color || 'indigo');
  const [isPinned, setIsPinned] = useState(Boolean(editingBoard?.isPinned));
  const [memberSearch, setMemberSearch] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const memberGroups: CalendarMemberGroup[] = useMemo(() => {
    return Array.isArray(currentUser?.preferences?.calendarMemberGroups)
      ? currentUser.preferences.calendarMemberGroups
      : [];
  }, [currentUser?.preferences?.calendarMemberGroups]);

  const filteredUsers = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const sorted = [...(allUsers || [])].sort((a, b) => (a.sortOrder ?? 9999) - (b.sortOrder ?? 9999));
    if (!q) return sorted;
    return sorted.filter(
      u =>
        u.name.toLowerCase().includes(q) ||
        (u.department && u.department.toLowerCase().includes(q)) ||
        (u.office && u.office.toLowerCase().includes(q)) ||
        (u.division && u.division.toLowerCase().includes(q))
    );
  }, [allUsers, memberSearch]);

  if (!isOpen) return null;

  const handleBoardTypeChange = (next: ProjectBoardType) => {
    setBoardType(next);
    if (next === 'personal') {
      setVisibility('private');
      if (color === 'indigo') setColor('amber');
    } else if (visibility === 'private') {
      setVisibility('members');
    }
  };

  const toggleMember = (uid: string) => {
    const strId = String(uid);
    if (editingBoard?.ownerId && String(editingBoard.ownerId) === strId) return;
    if (!editingBoard && String(currentUser.id) === strId) return;
    setMemberIds(prev => (prev.includes(strId) ? prev.filter(id => id !== strId) : [...prev, strId]));
  };

  const handleApplyMyGroup = (group: CalendarMemberGroup) => {
    const next = new Set(memberIds);
    (group.memberIds || []).forEach(id => next.add(String(id)));
    if (currentUser?.id) next.add(String(currentUser.id));
    setMemberIds(Array.from(next));
  };

  const handleOfficeSelect = (val: string) => {
    const found = offices.find(o => String(o.id) === val || o.name === val);
    if (found) {
      setOfficeId(String(found.id));
      setOffice(found.name);
    } else {
      setOfficeId('');
      setOffice(val);
    }
  };

  const handleDivisionSelect = (val: string) => {
    const found = divisions.find(d => String(d.id) === val || d.name === val);
    if (found) {
      setDivisionId(String(found.id));
      setDivision(found.name);
    } else {
      setDivisionId('');
      setDivision(val);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = title.trim();
    if (!trimmed) {
      setErrorMsg('ボード名を入力してください');
      return;
    }
    setErrorMsg(null);
    setIsSubmitting(true);
    try {
      await onSave({
        id: editingBoard?.id,
        title: trimmed,
        description: description.trim(),
        boardType,
        visibility: boardType === 'personal' ? 'private' : visibility,
        officeId: visibility === 'office' || visibility === 'division' ? officeId || undefined : undefined,
        office: visibility === 'office' || visibility === 'division' ? office || undefined : undefined,
        divisionId: visibility === 'division' ? divisionId || undefined : undefined,
        division: visibility === 'division' ? division || undefined : undefined,
        memberIds: boardType === 'personal' ? [String(currentUser.id)] : memberIds,
        color,
        isPinned,
      });
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || '保存に失敗しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDeleteClick = async () => {
    if (!editingBoard || !onDelete) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setIsSubmitting(true);
    try {
      await onDelete(editingBoard.id);
      onClose();
    } catch (err: any) {
      setErrorMsg(err?.message || '削除に失敗しました');
      setConfirmDelete(false);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/45 p-4" onClick={onClose}>
      <div
        className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 bg-slate-50/60">
          <h3 className="text-base font-bold text-slate-900">
            {editingBoard ? 'ボード設定の編集' : '新規プロジェクト・メモボード作成'}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="overflow-y-auto p-5 space-y-4">
          {errorMsg && (
            <div className="px-3 py-2 text-xs font-medium text-rose-700 bg-rose-50 border border-rose-200 rounded-lg">
              {errorMsg}
            </div>
          )}

          {!isDefaultPersonal && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">ボード種別</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => handleBoardTypeChange('team')}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                    boardType === 'team'
                      ? 'border-indigo-500 bg-indigo-50/70 text-indigo-900 font-semibold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <div>
                    <div>チーム共有ボード</div>
                    <div className="text-[11px] font-normal text-slate-500">部署・メンバー間で案件・資料を共有</div>
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => handleBoardTypeChange('personal')}
                  className={`flex items-center gap-2 px-3 py-2.5 rounded-lg border text-left text-xs transition-colors cursor-pointer ${
                    boardType === 'personal'
                      ? 'border-amber-500 bg-amber-50/70 text-amber-900 font-semibold'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  <Lock className="w-4 h-4 shrink-0" />
                  <div>
                    <div>個人専用ボード</div>
                    <div className="text-[11px] font-normal text-slate-500">自分だけ見られるメモ・リンク・Todo</div>
                  </div>
                </button>
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              ボード名 <span className="text-rose-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="例: 営業部 見込み案件フォロー / 総務 年末調整手順 / 個人メモ"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">説明・用途メモ</label>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={2}
              placeholder="ボードの目的やルールなど（任意）"
              className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-500"
            />
          </div>

          {boardType === 'team' && (
            <div className="space-y-3 pt-1 border-t border-slate-100">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">閲覧・参加範囲</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {[
                    { id: 'members', label: '指定メンバー', icon: Users },
                    { id: 'division', label: '部署', icon: Building2 },
                    { id: 'office', label: '拠点', icon: Building2 },
                    { id: 'org', label: '全社公開', icon: Globe },
                  ].map(opt => {
                    const Icon = opt.icon;
                    const active = visibility === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setVisibility(opt.id as ProjectBoardVisibility)}
                        className={`flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg border text-xs whitespace-nowrap transition-colors cursor-pointer ${
                          active
                            ? 'border-indigo-500 bg-indigo-50 text-indigo-800 font-semibold'
                            : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5 shrink-0" />
                        <span>{opt.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {(visibility === 'office' || visibility === 'division') && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-slate-600 mb-1">
                      対象拠点 {visibility === 'division' && '（任意・絞り込み）'}
                    </label>
                    <select
                      value={officeId || office}
                      onChange={e => handleOfficeSelect(e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                    >
                      <option value="">指定なし</option>
                      {offices.map(o => (
                        <option key={o.id} value={String(o.id)}>
                          {o.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  {visibility === 'division' && (
                    <div>
                      <label className="block text-xs font-medium text-slate-600 mb-1">対象部署</label>
                      <select
                        value={divisionId || division}
                        onChange={e => handleDivisionSelect(e.target.value)}
                        className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white"
                      >
                        <option value="">部署を選択</option>
                        {divisions.map(d => (
                          <option key={d.id} value={String(d.id)}>
                            {d.name}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>
              )}

              <div>
                <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                  <label className="text-xs font-semibold text-slate-700">
                    参加メンバー ({memberIds.length}名)
                  </label>
                  {memberGroups.length > 0 && (
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
                  )}
                </div>

                <div className="relative mb-2">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={memberSearch}
                    onChange={e => setMemberSearch(e.target.value)}
                    placeholder="社員名・拠点・部署で検索..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-200 rounded-lg focus:outline-none focus:border-indigo-400"
                  />
                </div>

                <div className="max-h-40 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100">
                  {filteredUsers.map(u => {
                    const checked = memberIds.includes(String(u.id));
                    const isOwner = editingBoard
                      ? String(editingBoard.ownerId) === String(u.id)
                      : String(currentUser.id) === String(u.id);
                    return (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => toggleMember(String(u.id))}
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
                          {isOwner && <span className="text-[10px] text-slate-400">作成者</span>}
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
                </div>
              </div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-slate-600">カラー:</span>
              <div className="flex items-center gap-1.5">
                {COLOR_OPTIONS.map(c => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => setColor(c.id)}
                    title={c.label}
                    className={`w-5 h-5 rounded-full ${c.dotClass} cursor-pointer transition-transform ${
                      color === c.id ? 'ring-2 ring-offset-2 ring-slate-700 scale-110' : 'opacity-70 hover:opacity-100'
                    }`}
                  />
                ))}
              </div>
            </div>

            <button
              type="button"
              onClick={() => setIsPinned(p => !p)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium cursor-pointer transition-colors ${
                isPinned
                  ? 'border-amber-400 bg-amber-50 text-amber-800'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              <Pin className="w-3.5 h-3.5" />
              <span>ボード一覧の先頭に固定</span>
            </button>
          </div>

          <div className="flex items-center justify-between gap-3 pt-3 border-t border-slate-200">
            <div>
              {editingBoard && !isDefaultPersonal && onDelete && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  disabled={isSubmitting}
                  className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    confirmDelete
                      ? 'bg-rose-600 text-white hover:bg-rose-700'
                      : 'text-rose-600 hover:bg-rose-50'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{confirmDelete ? '本当に削除する（配下カードも削除）' : 'ボードを削除'}</span>
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-xs font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 cursor-pointer"
              >
                {isSubmitting ? '保存中...' : editingBoard ? '変更を保存' : 'ボードを作成'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
};
