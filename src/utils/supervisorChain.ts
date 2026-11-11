import { User, ReportApprovalRecord, PositionMaster, OfficeMaster } from '../types';
import { getPositionRoleType, isSameOffice } from './masterResolver';

/**
 * 支店長（または最終承認権限者）かどうかを判定する
 * 役職マスターの level (>= 80) / code を最優先し、フォールバックとして役職名・部署名を判定
 */
export function isBranchManager(
  user: Partial<User> | null | undefined,
  positions: PositionMaster[] = []
): boolean {
  if (!user) return false;
  if (getPositionRoleType(user, positions) === 'branch_manager') {
    return true;
  }
  const pos = (user.position || '').toLowerCase();
  const dept = (user.department || '').toLowerCase();
  const div = (user.division || '').toLowerCase();

  return (
    pos.includes('支店長') ||
    pos.includes('所長') ||
    pos.includes('代表取締役') ||
    pos.includes('社長') ||
    pos.includes('役員') ||
    pos.includes('支部長') ||
    dept.includes('支店長') ||
    dept.includes('所長') ||
    div.includes('役員')
  );
}

/**
 * 課長（または第2承認権限者）かどうかを判定する
 * 役職マスターの level (50〜79) / code を優先し、フォールバックとして役職名を判定
 */
export function isSectionManager(
  user: Partial<User> | null | undefined,
  positions: PositionMaster[] = []
): boolean {
  if (!user) return false;
  if (getPositionRoleType(user, positions) === 'section_manager') {
    return true;
  }
  const pos = (user.position || '').toLowerCase();
  return pos.includes('課長') || pos.includes('次長') || pos.includes('マネージャー');
}

/**
 * 係長・主任（または第1承認権限者）かどうかを判定する
 * 役職マスターの level (30〜49) / code を優先し、フォールバックとして役職名を判定
 */
export function isChiefOrAssistant(
  user: Partial<User> | null | undefined,
  positions: PositionMaster[] = []
): boolean {
  if (!user) return false;
  if (getPositionRoleType(user, positions) === 'chief') {
    return true;
  }
  const pos = (user.position || '').toLowerCase();
  return pos.includes('係長') || pos.includes('主任') || pos.includes('リーダー') || pos.includes('チーフ');
}

/**
 * 作成者から支店長（最終承認者）までの多段階上長チェーンを動的解決する
 * 例: [係長 水野] -> [課長 山道] -> [支店長 寺岡]
 */
export function resolveSupervisorChain(
  author: User | null | undefined,
  allUsers: User[] = [],
  positions: PositionMaster[] = [],
  offices: OfficeMaster[] = []
): User[] {
  if (!author || !Array.isArray(allUsers) || allUsers.length === 0) return [];

  const chain: User[] = [];
  const visited = new Set<string>();
  visited.add(author.id);

  let current: User | undefined = author;

  // 上長リンク (supervisorId) を辿る
  while (current && current.supervisorId) {
    if (visited.has(current.supervisorId)) break; // 循環参照ガード
    const nextSup = allUsers.find(u => u && u.id === current!.supervisorId);
    if (!nextSup) break;

    visited.add(nextSup.id);
    chain.push(nextSup);
    current = nextSup;

    // 支店長（最終承認者）に到達した場合はチェーン終了
    if (isBranchManager(nextSup, positions)) {
      break;
    }
  }

  // もしチェーン末尾が支店長で終わっておらず、拠点内に支店長/所長が存在する場合は最終承認者として補完
  const lastApprover = chain.length > 0 ? chain[chain.length - 1] : author;
  if (!isBranchManager(lastApprover, positions)) {
    const targetOffice = author.officeId || author.office || lastApprover?.officeId || lastApprover?.office;
    const branchManager = allUsers.find(
      u =>
        u.id !== author.id &&
        !visited.has(u.id) &&
        isBranchManager(u, positions) &&
        (!targetOffice || !(u.officeId || u.office) || isSameOffice(u.officeId || u.office, targetOffice, offices))
    );
    if (branchManager) {
      chain.push(branchManager);
    }
  }

  return chain;
}

/**
 * 現在の確認者（または指定上長）から見た「次の上長（回覧先）」を取得する
 * 支店長の場合は最終承認のため null を返す
 */
export function getNextSupervisor(
  currentApprover: User | null | undefined,
  author: User | null | undefined,
  allUsers: User[] = [],
  positions: PositionMaster[] = [],
  offices: OfficeMaster[] = []
): User | null {
  if (!currentApprover || !Array.isArray(allUsers) || allUsers.length === 0) return null;

  // 既に支店長（最終承認者）の場合は次の上長はいない（自身が最終承認）
  if (isBranchManager(currentApprover, positions)) {
    return null;
  }

  // 1. 直属の上長設定がある場合
  if (currentApprover.supervisorId && currentApprover.supervisorId !== currentApprover.id) {
    const directSup = allUsers.find(u => u && u.id === currentApprover.supervisorId);
    if (directSup && directSup.id !== currentApprover.id) {
      return directSup;
    }
  }

  // 2. 作成者からの承認チェーンに基づいて、次のステップの承認者を取得
  if (author) {
    const chain = resolveSupervisorChain(author, allUsers, positions, offices);
    const currIdx = chain.findIndex(u => u.id === currentApprover.id);
    if (currIdx >= 0 && currIdx < chain.length - 1) {
      return chain[currIdx + 1];
    }
    // currentApprover がチェーンに含まれておらず、チェーンの最後が支店長の場合
    if (currIdx === -1 && chain.length > 0) {
      const branchManager = chain[chain.length - 1];
      if (branchManager.id !== currentApprover.id) {
        return branchManager;
      }
    }
  }

  // 3. 拠点の支店長/所長を探す（フォールバック）
  const targetOffice = currentApprover.officeId || currentApprover.office || author?.officeId || author?.office;
  const branchManager = allUsers.find(
    u =>
      u.id !== currentApprover.id &&
      isBranchManager(u, positions) &&
      (!targetOffice || !(u.officeId || u.office) || isSameOffice(u.officeId || u.office, targetOffice, offices))
  );

  return branchManager || null;
}

/**
 * 印鑑用フォーマット（姓および承認日付 MM.DD）
 */
export function formatStampNameAndDate(name: string, isoDate?: string): { surname: string; dateStr: string } {
  const cleanName = (name || '').trim();
  const surname = cleanName.split(/[\s　]+/)[0] || cleanName.slice(0, 3) || '印';

  let dateStr = '';
  if (isoDate) {
    try {
      const d = new Date(isoDate);
      if (!isNaN(d.getTime())) {
        const m = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        dateStr = `${m}.${day}`;
      }
    } catch {
      dateStr = '';
    }
  }

  return { surname, dateStr };
}
