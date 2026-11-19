import React, { useMemo, useState } from 'react';
import {
  Building2,
  Layers,
  Briefcase,
  Users,
  Check,
  CheckCircle2,
  XCircle,
  Sliders,
  FolderKanban,
  ClipboardList,
  FileCheck2,
  HardHat,
  Boxes,
  RotateCcw,
  RefreshCw,
  Shield,
  Info,
  Eye,
  EyeOff,
} from 'lucide-react';
import {
  User,
  OfficeMaster,
  DivisionMaster,
  PositionMaster,
  ToggleableMenuKey,
} from '../../types';
import {
  TOGGLEABLE_MENUS,
  getMenuVisibilitySettings,
} from '../../utils/menuVisibility';
import {
  doesUserMatchOffice,
  doesUserMatchDivision,
  doesUserMatchPosition,
  getUserOfficeName,
  getUserDivisionName,
} from '../../utils/masterResolver';
import { sortUsersByDivision } from '../../utils/userSort';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';
import { ConfirmModal, ConfirmModalState } from '../ConfirmModal';

interface BulkMenuVisibilityAdminProps {
  allUsers: User[];
  offices: OfficeMaster[];
  divisions: DivisionMaster[];
  positions?: PositionMaster[];
  onUpdateUser: (user: User) => void | Promise<void>;
}

const renderMenuIcon = (key: ToggleableMenuKey, className = 'w-4 h-4 shrink-0') => {
  switch (key) {
    case 'projects':
      return <FolderKanban className={`${className} text-indigo-600`} />;
    case 'daily_report':
      return <ClipboardList className={`${className} text-teal-600`} />;
    case 'inspection_report':
      return <FileCheck2 className={`${className} text-emerald-600`} />;
    case 'site_management':
      return <HardHat className={`${className} text-amber-600`} />;
    case 'assets':
      return <Boxes className={`${className} text-sky-600`} />;
  }
};

const getMenuAdminTitle = (key: ToggleableMenuKey): string => {
  if (key === 'daily_report') return '週報 / 保守日報';
  const def = TOGGLEABLE_MENUS.find((m) => m.key === key);
  return def ? def.label : key;
};

export const BulkMenuVisibilityAdmin: React.FC<BulkMenuVisibilityAdminProps> = ({
  allUsers,
  offices,
  divisions,
  positions = [],
  onUpdateUser,
}) => {
  const [selectedMenuKeys, setSelectedMenuKeys] = useState<ToggleableMenuKey[]>([]);
  const [selectedOfficeIds, setSelectedOfficeIds] = useState<string[]>([]);
  const [selectedDivisionIds, setSelectedDivisionIds] = useState<string[]>([]);
  const [selectedPositionId, setSelectedPositionId] = useState<string>('all');
  const [includeAdmins, setIncludeAdmins] = useState<boolean>(true);
  const [isApplying, setIsApplying] = useState<boolean>(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [resultBanner, setResultBanner] = useState<{
    type: 'success' | 'info' | 'error';
    text: string;
  } | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModalState>({
    isOpen: false,
    title: '',
    message: '',
  });

  const toggleMenuKey = (key: ToggleableMenuKey) => {
    setSelectedMenuKeys((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  const toggleOfficeId = (officeId: string) => {
    setSelectedOfficeIds((prev) =>
      prev.includes(officeId) ? prev.filter((id) => id !== officeId) : [...prev, officeId]
    );
  };

  const toggleDivisionId = (divisionId: string) => {
    setSelectedDivisionIds((prev) =>
      prev.includes(divisionId) ? prev.filter((id) => id !== divisionId) : [...prev, divisionId]
    );
  };

  const hasScopeFilter =
    selectedOfficeIds.length > 0 ||
    selectedDivisionIds.length > 0 ||
    selectedPositionId !== 'all' ||
    !includeAdmins;

  const handleResetFilters = () => {
    setSelectedOfficeIds([]);
    setSelectedDivisionIds([]);
    setSelectedPositionId('all');
    setIncludeAdmins(true);
  };

  // 拠点・部署（部門）・役職・管理者条件で絞り込んだ対象メンバー
  const matchedUsers = useMemo(() => {
    const filtered = allUsers.filter((u) => {
      if (!includeAdmins && (u.isAdmin === true || u.role === 'admin')) {
        return false;
      }
      if (
        selectedOfficeIds.length > 0 &&
        !selectedOfficeIds.some((offId) => doesUserMatchOffice(u, offId, offices))
      ) {
        return false;
      }
      if (
        selectedDivisionIds.length > 0 &&
        !selectedDivisionIds.some((divId) => doesUserMatchDivision(u, divId, divisions))
      ) {
        return false;
      }
      if (
        selectedPositionId !== 'all' &&
        !doesUserMatchPosition(u, selectedPositionId, positions)
      ) {
        return false;
      }
      return true;
    });
    return sortUsersByDivision(filtered, divisions);
  }, [
    allUsers,
    offices,
    divisions,
    positions,
    selectedOfficeIds,
    selectedDivisionIds,
    selectedPositionId,
    includeAdmins,
  ]);

  // 対象メンバーにおける各メニューの現在ON/OFF件数集計
  const menuStats = useMemo(() => {
    const stats: Record<ToggleableMenuKey, { on: number; off: number }> = {
      projects: { on: 0, off: 0 },
      daily_report: { on: 0, off: 0 },
      inspection_report: { on: 0, off: 0 },
      site_management: { on: 0, off: 0 },
      assets: { on: 0, off: 0 },
    };
    for (const u of matchedUsers) {
      const vis = getMenuVisibilitySettings(u);
      for (const m of TOGGLEABLE_MENUS) {
        if (vis[m.key]) {
          stats[m.key].on += 1;
        } else {
          stats[m.key].off += 1;
        }
      }
    }
    return stats;
  }, [matchedUsers]);

  // 実際に変更が発生する人数を計算
  const getChangedUsersForTarget = (targetEnable: boolean): User[] => {
    if (selectedMenuKeys.length === 0) return [];
    return matchedUsers.filter((u) => {
      const vis = getMenuVisibilitySettings(u);
      return selectedMenuKeys.some((k) => vis[k] !== targetEnable);
    });
  };

  const usersToTurnOn = useMemo(
    () => getChangedUsersForTarget(true),
    [matchedUsers, selectedMenuKeys]
  );
  const usersToTurnOff = useMemo(
    () => getChangedUsersForTarget(false),
    [matchedUsers, selectedMenuKeys]
  );

  const scopeSummaryText = useMemo(() => {
    const officeLabel =
      selectedOfficeIds.length === 0
        ? '全拠点'
        : offices
            .filter((o) => selectedOfficeIds.includes(String(o.id)))
            .map((o) => o.name)
            .join('・');
    const divisionLabel =
      selectedDivisionIds.length === 0
        ? '全部署（部門）'
        : divisions
            .filter((d) => selectedDivisionIds.includes(String(d.id)))
            .map((d) => d.name)
            .join('・');
    const posLabel =
      selectedPositionId === 'all'
        ? null
        : positions.find((p) => String(p.id) === selectedPositionId)?.name || null;

    const parts = [`拠点: ${officeLabel}`, `部署: ${divisionLabel}`];
    if (posLabel) parts.push(`役職: ${posLabel}`);
    if (!includeAdmins) parts.push('管理者除外');
    return parts.join(' / ');
  }, [
    selectedOfficeIds,
    selectedDivisionIds,
    selectedPositionId,
    includeAdmins,
    offices,
    divisions,
    positions,
  ]);

  const executeBulkUpdate = async (targetEnable: boolean, targetUsers: User[]) => {
    if (targetUsers.length === 0 || selectedMenuKeys.length === 0) return;

    setIsApplying(true);
    setResultBanner(null);
    setProgress({ done: 0, total: targetUsers.length });

    const menuLabels = selectedMenuKeys.map((k) => getMenuAdminTitle(k)).join('・');
    const skippedCount = matchedUsers.length - targetUsers.length;
    const CHUNK_SIZE = 5;
    let completed = 0;

    try {
      for (let i = 0; i < targetUsers.length; i += CHUNK_SIZE) {
        const chunk = targetUsers.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (u) => {
            const currentVis = getMenuVisibilitySettings(u);
            const nextVis = { ...currentVis };
            for (const key of selectedMenuKeys) {
              nextVis[key] = targetEnable;
            }
            const updatedUser: User = {
              ...u,
              preferences: {
                ...(u.preferences || {}),
                menuVisibility: nextVis,
              },
            };
            await Promise.resolve(onUpdateUser(updatedUser));
          })
        );
        completed += chunk.length;
        setProgress({ done: completed, total: targetUsers.length });
      }

      const skipNote = skippedCount > 0 ? `（既に${targetEnable ? 'ON' : 'OFF'}の${skippedCount}名はスキップ）` : '';
      setResultBanner({
        type: 'success',
        text: `${targetUsers.length}名の「${menuLabels}」を一括で ${targetEnable ? 'ON（表示）' : 'OFF（非表示）'} に更新しました。${skipNote}`,
      });
    } catch (err: any) {
      setResultBanner({
        type: 'error',
        text: `一括更新中にエラーが発生しました: ${err?.message || '不明なエラー'}`,
      });
    } finally {
      setIsApplying(false);
      setProgress(null);
    }
  };

  const handleRequestBulkApply = (targetEnable: boolean) => {
    if (selectedMenuKeys.length === 0 || matchedUsers.length === 0 || isApplying) return;

    const targetUsers = targetEnable ? usersToTurnOn : usersToTurnOff;
    const menuLabels = selectedMenuKeys.map((k) => getMenuAdminTitle(k)).join('・');

    if (targetUsers.length === 0) {
      setResultBanner({
        type: 'info',
        text: `対象メンバー（${matchedUsers.length}名）は全員すでに「${menuLabels}」が ${targetEnable ? 'ON（表示）' : 'OFF（非表示）'} に設定されています。`,
      });
      return;
    }

    const hasMyPageLinked = selectedMenuKeys.some(
      (k) => k === 'projects' || k === 'daily_report'
    );
    const previewNames = targetUsers
      .slice(0, 8)
      .map((u) => `・${u.name}（${getUserOfficeName(u, offices) || '拠点未設定'} / ${getUserDivisionName(u, divisions) || '部署未設定'}）`)
      .join('\n');
    const moreText = targetUsers.length > 8 ? `\n…ほか ${targetUsers.length - 8}名` : '';

    const skippedCount = matchedUsers.length - targetUsers.length;
    const myPageNote = hasMyPageLinked
      ? `\n※「プロジェクト」「週報 / 保守日報」はマイページ内の対応カードも連動して${targetEnable ? '表示' : '非表示'}になります。`
      : '';

    setConfirmModal({
      isOpen: true,
      title: `主要メニューを一括 ${targetEnable ? 'ON（表示）' : 'OFF（非表示）'} にする`,
      message: `以下の条件で主要メニューの表示設定を一括更新しますか？\n\n【対象メニュー】\n${menuLabels}\n\n【対象範囲】\n${scopeSummaryText}\n\n【更新対象】\n${targetUsers.length}名${skippedCount > 0 ? `（変更不要の ${skippedCount}名はスキップ）` : ''}\n${previewNames}${moreText}${myPageNote}`,
      confirmText: `${targetUsers.length}名を一括 ${targetEnable ? 'ON' : 'OFF'} にする`,
      cancelText: 'キャンセル',
      type: targetEnable ? 'info' : 'warning',
      onConfirm: () => {
        executeBulkUpdate(targetEnable, targetUsers);
      },
    });
  };

  return (
    <div className="space-y-5">
      {/* ヘッダー説明＆完了通知 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center shrink-0">
              <Sliders className="w-5 h-5 text-emerald-700" />
            </div>
            <div>
              <h3 className="text-sm font-extrabold text-slate-900">
                主要メニュー 一括 ON / OFF 設定
              </h3>
              <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">
                対象メニューと「拠点」「部署（部門）」を選択して、複数メンバーのメニュー表示を一括で切り替えられます。マイページにカードがある項目も連動して切り替わります。
              </p>
            </div>
          </div>
          {hasScopeFilter && (
            <button
              type="button"
              onClick={handleResetFilters}
              className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:text-indigo-700 bg-slate-100 hover:bg-indigo-50 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0 self-start"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>絞り込みをリセット</span>
            </button>
          )}
        </div>

        {resultBanner && (
          <div
            className={`px-4 py-3 rounded-xl text-xs font-bold flex items-center justify-between gap-3 border ${
              resultBanner.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                : resultBanner.type === 'info'
                ? 'bg-indigo-50 text-indigo-800 border-indigo-200'
                : 'bg-rose-50 text-rose-800 border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {resultBanner.type === 'success' ? (
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : resultBanner.type === 'info' ? (
                <Info className="w-4 h-4 text-indigo-600 shrink-0" />
              ) : (
                <XCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{resultBanner.text}</span>
            </div>
            <button
              type="button"
              onClick={() => setResultBanner(null)}
              className="text-[11px] underline opacity-75 hover:opacity-100 cursor-pointer shrink-0 whitespace-nowrap"
            >
              閉じる
            </button>
          </div>
        )}
      </div>

      {/* STEP 1: メニュー選択 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-3.5">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black tracking-wider whitespace-nowrap">
              STEP 1
            </span>
            <h4 className="text-xs font-extrabold text-slate-800">
              一括設定するメニューを選択（複数選択可）
            </h4>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setSelectedMenuKeys(TOGGLEABLE_MENUS.map((m) => m.key))}
              className="px-2.5 py-1 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
            >
              すべて選択
            </button>
            {selectedMenuKeys.length > 0 && (
              <button
                type="button"
                onClick={() => setSelectedMenuKeys([])}
                className="px-2.5 py-1 text-[11px] font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 border border-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
              >
                選択解除
              </button>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2.5">
          {TOGGLEABLE_MENUS.map((def) => {
            const isSelected = selectedMenuKeys.includes(def.key);
            const stat = menuStats[def.key];
            const title = getMenuAdminTitle(def.key);
            return (
              <button
                key={def.key}
                type="button"
                onClick={() => toggleMenuKey(def.key)}
                className={`p-3 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between gap-2.5 ${
                  isSelected
                    ? 'border-indigo-500 bg-indigo-50/70 ring-2 ring-indigo-500/20 shadow-xs'
                    : 'border-slate-200 bg-white hover:border-slate-300 hover:bg-slate-50/80'
                }`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    {renderMenuIcon(def.key)}
                    <span className="text-xs font-extrabold text-slate-800 leading-tight">
                      {title}
                    </span>
                  </div>
                  <div
                    className={`w-4 h-4 rounded flex items-center justify-center shrink-0 border transition-colors ${
                      isSelected
                        ? 'bg-indigo-600 border-indigo-600 text-white'
                        : 'bg-white border-slate-300'
                    }`}
                  >
                    {isSelected && <Check className="w-3 h-3 stroke-[3]" />}
                  </div>
                </div>

                <div className="space-y-1.5">
                  {def.mypageSectionId && (
                    <span className="inline-block px-1.5 py-0.5 text-[10px] font-bold text-indigo-700 bg-white border border-indigo-200 rounded whitespace-nowrap">
                      マイページ連動
                    </span>
                  )}
                  <div className="flex items-center gap-1.5 text-[11px] font-bold pt-1 border-t border-slate-200/70">
                    <span className="text-emerald-700 whitespace-nowrap">ON {stat.on}</span>
                    <span className="text-slate-300">/</span>
                    <span className={stat.off > 0 ? 'text-rose-600 whitespace-nowrap' : 'text-slate-400 whitespace-nowrap'}>
                      OFF {stat.off}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* STEP 2: 拠点・部署（部門）選択 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black tracking-wider whitespace-nowrap">
            STEP 2
          </span>
          <h4 className="text-xs font-extrabold text-slate-800">
            対象となる拠点・部署（部門）を選択（複数選択可）
          </h4>
        </div>

        {/* 拠点フィルター */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Building2 className="w-3.5 h-3.5 text-indigo-600" />
            <span>拠点（営業所・支店）</span>
            <span className="text-[11px] font-medium text-slate-400">
              {selectedOfficeIds.length === 0 ? '※未選択時はすべての拠点が対象' : `${selectedOfficeIds.length}拠点を選択中`}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedOfficeIds([])}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                selectedOfficeIds.length === 0
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              すべての拠点 ({allUsers.length}名)
            </button>
            {offices.map((off) => {
              const idStr = String(off.id);
              const active = selectedOfficeIds.includes(idStr);
              const count = allUsers.filter((u) => doesUserMatchOffice(u, off.id, offices)).length;
              return (
                <button
                  key={off.id}
                  type="button"
                  onClick={() => toggleOfficeId(idStr)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    active
                      ? 'bg-indigo-600 text-white border-indigo-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50'
                  }`}
                >
                  {active && <Check className="w-3 h-3 stroke-[3]" />}
                  <span>{off.name}</span>
                  <span className={`text-[10px] ${active ? 'text-indigo-100' : 'text-slate-400'}`}>
                    ({count}名)
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="border-t border-slate-100" />

        {/* 部署（部門）フィルター */}
        <div className="space-y-2">
          <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
            <Layers className="w-3.5 h-3.5 text-emerald-600" />
            <span>部署・部門</span>
            <span className="text-[11px] font-medium text-slate-400">
              {selectedDivisionIds.length === 0 ? '※未選択時はすべての部署が対象' : `${selectedDivisionIds.length}部署を選択中`}
            </span>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <button
              type="button"
              onClick={() => setSelectedDivisionIds([])}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap ${
                selectedDivisionIds.length === 0
                  ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                  : 'bg-slate-50 text-slate-600 border-slate-200 hover:bg-slate-100'
              }`}
            >
              すべての部署 ({allUsers.length}名)
            </button>
            {divisions.map((div) => {
              const idStr = String(div.id);
              const active = selectedDivisionIds.includes(idStr);
              const count = allUsers.filter((u) => doesUserMatchDivision(u, div.id, divisions)).length;
              return (
                <button
                  key={div.id}
                  type="button"
                  onClick={() => toggleDivisionId(idStr)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                    active
                      ? 'bg-emerald-600 text-white border-emerald-600 shadow-2xs'
                      : 'bg-white text-slate-700 border-slate-200 hover:border-emerald-300 hover:bg-emerald-50/50'
                  }`}
                >
                  {active && <Check className="w-3 h-3 stroke-[3]" />}
                  <span>{div.name}</span>
                  <span className={`text-[10px] ${active ? 'text-emerald-100' : 'text-slate-400'}`}>
                    ({count}名)
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 追加条件（役職・管理者含む） */}
        <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-4">
          {positions.length > 0 && (
            <label className="flex items-center gap-2 text-xs font-bold text-slate-700">
              <Briefcase className="w-3.5 h-3.5 text-purple-600 shrink-0" />
              <span className="whitespace-nowrap">役職絞り込み:</span>
              <select
                value={selectedPositionId}
                onChange={(e) => setSelectedPositionId(e.target.value)}
                className="bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="all">すべての役職</option>
                {positions.map((pos) => (
                  <option key={pos.id} value={String(pos.id)}>
                    {pos.name}
                  </option>
                ))}
              </select>
            </label>
          )}

          <label className="flex items-center gap-2 text-xs font-bold text-slate-700 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={includeAdmins}
              onChange={(e) => setIncludeAdmins(e.target.checked)}
              className="w-4 h-4 text-indigo-600 rounded focus:ring-indigo-500 cursor-pointer"
            />
            <Shield className="w-3.5 h-3.5 text-indigo-600 shrink-0" />
            <span>管理者アカウントも対象に含める</span>
          </label>
        </div>
      </div>

      {/* STEP 3: 一括実行アクションバー */}
      <div className="bg-white rounded-2xl border border-indigo-200 p-5 shadow-xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded-md bg-indigo-600 text-white text-[10px] font-black tracking-wider whitespace-nowrap">
                STEP 3
              </span>
              <h4 className="text-xs font-extrabold text-slate-800">
                選択条件の確認 ＆ 一括反映
              </h4>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-indigo-100 text-indigo-800 border border-indigo-200 whitespace-nowrap">
                対象メンバー: {matchedUsers.length}名
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              {scopeSummaryText}
              {selectedMenuKeys.length > 0
                ? ` ｜ 選択メニュー: ${selectedMenuKeys.map((k) => getMenuAdminTitle(k)).join('・')}`
                : ' ｜ ※ STEP 1 から対象メニューを1つ以上選択してください'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              disabled={isApplying || selectedMenuKeys.length === 0 || matchedUsers.length === 0}
              onClick={() => handleRequestBulkApply(true)}
              className="px-4 py-2.5 rounded-xl text-xs font-extrabold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              {isApplying ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Eye className="w-4 h-4" />
              )}
              <span>
                一括 ON（表示）
                {selectedMenuKeys.length > 0 && matchedUsers.length > 0
                  ? ` [${usersToTurnOn.length}名変更]`
                  : ''}
              </span>
            </button>

            <button
              type="button"
              disabled={isApplying || selectedMenuKeys.length === 0 || matchedUsers.length === 0}
              onClick={() => handleRequestBulkApply(false)}
              className="px-4 py-2.5 rounded-xl text-xs font-extrabold text-white bg-slate-700 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition-all flex items-center gap-2 cursor-pointer whitespace-nowrap"
            >
              {isApplying ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <EyeOff className="w-4 h-4" />
              )}
              <span>
                一括 OFF（非表示）
                {selectedMenuKeys.length > 0 && matchedUsers.length > 0
                  ? ` [${usersToTurnOff.length}名変更]`
                  : ''}
              </span>
            </button>
          </div>
        </div>

        {progress && (
          <div className="space-y-1.5 pt-2 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs font-bold text-indigo-700">
              <span>メンバー設定を一括更新中...</span>
              <span>
                {progress.done} / {progress.total}名
              </span>
            </div>
            <progress
              value={progress.done}
              max={Math.max(1, progress.total)}
              className="w-full h-2 rounded-full overflow-hidden accent-indigo-600 [&::-webkit-progress-bar]:bg-slate-100 [&::-webkit-progress-value]:bg-indigo-600 [&::-moz-progress-bar]:bg-indigo-600"
            />
          </div>
        )}
      </div>

      {/* 対象メンバーの現在ステータス一覧 */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-indigo-600" />
            <span className="text-xs font-extrabold text-slate-800">
              対象メンバーの現在の表示状態（{matchedUsers.length}名）
            </span>
          </div>
          <span className="text-[11px] text-slate-500">
            青枠の列が STEP 1 で選択中のメニューです
          </span>
        </div>

        {matchedUsers.length === 0 ? (
          <div className="p-10 text-center space-y-2">
            <Users className="w-8 h-8 text-slate-300 mx-auto" />
            <p className="text-xs font-bold text-slate-500">
              選択された条件に該当するメンバーがいません。
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto max-h-[420px] overflow-y-auto">
            <table className="w-full text-left border-collapse">
              <thead className="sticky top-0 z-10 bg-slate-50 border-b border-slate-200 text-[11px] font-extrabold text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 whitespace-nowrap">メンバー</th>
                  <th className="py-2.5 px-3 whitespace-nowrap">拠点 / 部署</th>
                  {TOGGLEABLE_MENUS.map((m) => {
                    const isSelected = selectedMenuKeys.includes(m.key);
                    return (
                      <th
                        key={m.key}
                        className={`py-2.5 px-2.5 text-center whitespace-nowrap ${
                          isSelected ? 'bg-indigo-50 text-indigo-800' : ''
                        }`}
                      >
                        {getMenuAdminTitle(m.key)}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {matchedUsers.map((u) => {
                  const vis = getMenuVisibilitySettings(u);
                  return (
                    <tr key={u.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-2.5 px-4 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <img
                            src={getAvatarUrl(u.avatarUrl)}
                            alt={u.name}
                            onError={handleAvatarError}
                            className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                          />
                          <div className="flex items-center gap-1.5">
                            <span className="font-bold text-slate-800">{u.name}</span>
                            {u.isAdmin && (
                              <span className="px-1.5 py-0.5 text-[10px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200 rounded whitespace-nowrap">
                                管理者
                              </span>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-700">
                          {getUserOfficeName(u, offices) || '拠点未設定'}
                        </span>
                        <span className="mx-1 text-slate-300">/</span>
                        <span>{getUserDivisionName(u, divisions) || '部署未設定'}</span>
                      </td>
                      {TOGGLEABLE_MENUS.map((m) => {
                        const isSelected = selectedMenuKeys.includes(m.key);
                        const isOn = vis[m.key];
                        return (
                          <td
                            key={m.key}
                            className={`py-2.5 px-2.5 text-center whitespace-nowrap ${
                              isSelected ? 'bg-indigo-50/40' : ''
                            }`}
                          >
                            <span
                              className={`inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-extrabold border whitespace-nowrap ${
                                isOn
                                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              {isOn ? 'ON' : 'OFF'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmModal
        {...confirmModal}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
      />
    </div>
  );
};
