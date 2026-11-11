import { User, OfficeMaster, DivisionMaster, PositionMaster } from '../types';

/**
 * 拠点名のゆらぎ吸収用正規化（末尾の「支店」「営業所」「本社」などを除去したベース名を返す）
 */
export function normalizeOfficeKeyword(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = String(raw).trim();
  if (!trimmed || trimmed === 'all' || trimmed === '全社' || trimmed === '全拠点' || trimmed === 'すべての拠点') {
    return trimmed;
  }
  const stripped = trimmed.replace(/(支店|営業所|本社|出張所|事務所|センター)$/, '').trim();
  return stripped || trimmed;
}

/**
 * 任意の識別子（ID / コード / 名称）から OfficeMaster を解決する
 */
export function resolveOffice(
  idOrCodeOrName: string | undefined | null,
  offices: OfficeMaster[] = []
): OfficeMaster | undefined {
  if (!idOrCodeOrName || !offices || offices.length === 0) return undefined;
  const target = String(idOrCodeOrName).trim();
  if (!target || target === 'all' || target === '全社' || target === '全拠点' || target === 'すべての拠点') {
    return undefined;
  }
  const lower = target.toLowerCase();

  // 1. ID 完全一致
  const byId = offices.find((o) => String(o.id).trim().toLowerCase() === lower);
  if (byId) return byId;

  // 2. Code 完全一致
  const byCode = offices.find((o) => o.code && String(o.code).trim().toLowerCase() === lower);
  if (byCode) return byCode;

  // 3. Name 完全一致
  const byName = offices.find((o) => o.name && String(o.name).trim() === target);
  if (byName) return byName;

  // 4. 正規化ベース名での照合（例: "名古屋支店" <-> "名古屋"）
  const normTarget = normalizeOfficeKeyword(target);
  if (normTarget) {
    const matches = offices.filter((o) => normalizeOfficeKeyword(o.name) === normTarget);
    if (matches.length === 1) return matches[0];
  }

  return undefined;
}

/**
 * 任意の識別子（ID / コード / 名称）から正規の拠点ID（マスター未登録時は正規化文字列）を返す
 */
export function resolveOfficeId(
  idOrCodeOrName: string | undefined | null,
  offices: OfficeMaster[] = []
): string {
  if (!idOrCodeOrName) return '';
  const trimmed = String(idOrCodeOrName).trim();
  if (!trimmed) return '';
  if (trimmed === 'all' || trimmed === '全社' || trimmed === '全拠点' || trimmed === 'すべての拠点') {
    return 'all';
  }
  const resolved = resolveOffice(trimmed, offices);
  if (resolved) return String(resolved.id);
  return normalizeOfficeKeyword(trimmed) || trimmed;
}

/**
 * 任意の識別子から表示用の拠点名を返す
 */
export function resolveOfficeName(
  idOrCodeOrName: string | undefined | null,
  offices: OfficeMaster[] = []
): string {
  if (!idOrCodeOrName) return '';
  const trimmed = String(idOrCodeOrName).trim();
  if (!trimmed) return '';
  if (trimmed === 'all' || trimmed === '全社' || trimmed === '全拠点' || trimmed === 'すべての拠点') {
    return trimmed;
  }
  const resolved = resolveOffice(trimmed, offices);
  return resolved ? resolved.name : trimmed;
}

/**
 * ユーザーの所属拠点マスターを解決する
 */
export function getUserOffice(
  user: Partial<User> | undefined | null,
  offices: OfficeMaster[] = []
): OfficeMaster | undefined {
  if (!user) return undefined;
  const prefOfficeId = (user.preferences as any)?.officeId;
  if (user.officeId) {
    const byId = resolveOffice(user.officeId, offices);
    if (byId) return byId;
  }
  if (prefOfficeId) {
    const byPrefId = resolveOffice(prefOfficeId, offices);
    if (byPrefId) return byPrefId;
  }
  if (user.office) {
    const byName = resolveOffice(user.office, offices);
    if (byName) return byName;
  }
  if (user.department) {
    const firstPart = user.department.trim().split(/\s+/)[0];
    if (firstPart && firstPart !== '未設定') {
      const byDept = resolveOffice(firstPart, offices);
      if (byDept) return byDept;
    }
  }
  return undefined;
}

/**
 * ユーザーの正規拠点ID（またはフォールバック識別子）を取得する
 */
export function getUserOfficeId(
  user: Partial<User> | undefined | null,
  offices: OfficeMaster[] = []
): string {
  if (!user) return '';
  const resolved = getUserOffice(user, offices);
  if (resolved) return String(resolved.id);
  const raw =
    user.officeId ||
    (user.preferences as any)?.officeId ||
    user.office ||
    (user.department ? user.department.trim().split(/\s+/)[0] : '');
  if (!raw || raw === '未設定') return '';
  return resolveOfficeId(raw, offices);
}

/**
 * ユーザーの最新拠点表示名を取得する
 */
export function getUserOfficeName(
  user: Partial<User> | undefined | null,
  offices: OfficeMaster[] = []
): string {
  if (!user) return '';
  const resolved = getUserOffice(user, offices);
  if (resolved) return resolved.name;
  return user.office || (user.department ? user.department.trim().split(/\s+/)[0] : '') || '';
}

/**
 * 2つの拠点識別子（ID/コード/名称）が同じ拠点を指しているか判定する
 */
export function isSameOffice(
  a: string | undefined | null,
  b: string | undefined | null,
  offices: OfficeMaster[] = []
): boolean {
  if (!a || !b) return false;
  const idA = resolveOfficeId(a, offices);
  const idB = resolveOfficeId(b, offices);
  if (!idA || !idB) return false;
  return idA === idB;
}

/**
 * ユーザーが指定された拠点フィルター（ID / コード / 名称 / 'all'）に一致するか判定する
 */
export function doesUserMatchOffice(
  user: Partial<User> | undefined | null,
  filterValue: string | undefined | null,
  offices: OfficeMaster[] = []
): boolean {
  if (!filterValue || filterValue === 'all' || filterValue === '全社' || filterValue === '全拠点' || filterValue === 'すべての拠点') {
    return true;
  }
  if (!user) return false;
  const targetOfficeId = resolveOfficeId(filterValue, offices);
  const userOfficeId = getUserOfficeId(user, offices);
  if (!targetOfficeId || !userOfficeId) return false;
  return userOfficeId === targetOfficeId;
}

// ============================================================================
// 部署マスター (DivisionMaster) 解決ヘルパー
// ============================================================================

/**
 * 任意の識別子（ID / コード / 名称）から DivisionMaster を解決する
 */
export function resolveDivision(
  idOrCodeOrName: string | undefined | null,
  divisions: DivisionMaster[] = []
): DivisionMaster | undefined {
  if (!idOrCodeOrName || !divisions || divisions.length === 0) return undefined;
  const target = String(idOrCodeOrName).trim();
  if (!target || target === 'all' || target === '全部署' || target === 'すべての部署') {
    return undefined;
  }
  const lower = target.toLowerCase();

  // 1. ID 完全一致
  const byId = divisions.find((d) => String(d.id).trim().toLowerCase() === lower);
  if (byId) return byId;

  // 2. Code 完全一致
  const byCode = divisions.find((d) => d.code && String(d.code).trim().toLowerCase() === lower);
  if (byCode) return byCode;

  // 3. Name 完全一致
  const byName = divisions.find((d) => d.name && String(d.name).trim() === target);
  if (byName) return byName;

  // 4. 「課」「部」などの末尾ゆらぎ吸収（例: "営業課" <-> "営業"）
  const stripped = target.replace(/(部|課|係|グループ|チーム)$/, '').trim();
  if (stripped && stripped !== target) {
    const matches = divisions.filter(
      (d) => d.name && d.name.replace(/(部|課|係|グループ|チーム)$/, '').trim() === stripped
    );
    if (matches.length === 1) return matches[0];
  }

  return undefined;
}

/**
 * 任意の識別子から正規の部署ID（未登録時はトリム済み文字列）を返す
 */
export function resolveDivisionId(
  idOrCodeOrName: string | undefined | null,
  divisions: DivisionMaster[] = []
): string {
  if (!idOrCodeOrName) return '';
  const trimmed = String(idOrCodeOrName).trim();
  if (!trimmed) return '';
  if (trimmed === 'all' || trimmed === '全部署' || trimmed === 'すべての部署') {
    return 'all';
  }
  const resolved = resolveDivision(trimmed, divisions);
  return resolved ? String(resolved.id) : trimmed;
}

/**
 * 任意の識別子から表示用の部署名を返す
 */
export function resolveDivisionName(
  idOrCodeOrName: string | undefined | null,
  divisions: DivisionMaster[] = []
): string {
  if (!idOrCodeOrName) return '';
  const trimmed = String(idOrCodeOrName).trim();
  if (!trimmed) return '';
  if (trimmed === 'all' || trimmed === '全部署' || trimmed === 'すべての部署') {
    return trimmed;
  }
  const resolved = resolveDivision(trimmed, divisions);
  return resolved ? resolved.name : trimmed;
}

/**
 * ユーザーの所属部署マスターを解決する
 */
export function getUserDivision(
  user: Partial<User> | undefined | null,
  divisions: DivisionMaster[] = []
): DivisionMaster | undefined {
  if (!user) return undefined;
  const prefDivisionId = (user.preferences as any)?.divisionId;
  if (user.divisionId) {
    const byId = resolveDivision(user.divisionId, divisions);
    if (byId) return byId;
  }
  if (prefDivisionId) {
    const byPrefId = resolveDivision(prefDivisionId, divisions);
    if (byPrefId) return byPrefId;
  }
  if (user.division) {
    const byName = resolveDivision(user.division, divisions);
    if (byName) return byName;
  }
  if (user.department) {
    const parts = user.department.trim().split(/\s+/);
    const candidate = parts.length > 1 ? parts[1] : parts[0];
    if (candidate && candidate !== '未設定') {
      const byDept = resolveDivision(candidate, divisions);
      if (byDept) return byDept;
    }
  }
  return undefined;
}

/**
 * ユーザーの正規部署ID（またはフォールバック識別子）を取得する
 */
export function getUserDivisionId(
  user: Partial<User> | undefined | null,
  divisions: DivisionMaster[] = []
): string {
  if (!user) return '';
  const resolved = getUserDivision(user, divisions);
  if (resolved) return String(resolved.id);
  const parts = user.department ? user.department.trim().split(/\s+/) : [];
  const deptFallback = parts.length > 1 ? parts[1] : '';
  const raw =
    user.divisionId ||
    (user.preferences as any)?.divisionId ||
    user.division ||
    deptFallback;
  if (!raw || raw === '未設定') return '';
  return resolveDivisionId(raw, divisions);
}

/**
 * ユーザーの最新部署表示名を取得する
 */
export function getUserDivisionName(
  user: Partial<User> | undefined | null,
  divisions: DivisionMaster[] = []
): string {
  if (!user) return '';
  const resolved = getUserDivision(user, divisions);
  if (resolved) return resolved.name;
  const parts = user.department ? user.department.trim().split(/\s+/) : [];
  return user.division || (parts.length > 1 ? parts[1] : '') || '';
}

/**
 * 2つの部署識別子（ID/コード/名称、または複数部署のセミコロン/カンマ区切り）が同じ部署を指しているか判定する
 */
export function isSameDivision(
  a: string | undefined | null,
  b: string | undefined | null,
  divisions: DivisionMaster[] = []
): boolean {
  if (!a || !b) return false;
  const tokensA = String(a).split(/[;,]/).map((s) => resolveDivisionId(s.trim(), divisions)).filter(Boolean);
  const tokensB = String(b).split(/[;,]/).map((s) => resolveDivisionId(s.trim(), divisions)).filter(Boolean);
  if (tokensA.length === 0 || tokensB.length === 0) return false;
  return tokensA.some((idA) => tokensB.includes(idA));
}

/**
 * ユーザーが指定された部署フィルター（ID / コード / 名称 / 'all'）に一致するか判定する（兼務・複数部署対応）
 */
export function doesUserMatchDivision(
  user: Partial<User> | undefined | null,
  filterValue: string | undefined | null,
  divisions: DivisionMaster[] = []
): boolean {
  if (!filterValue || filterValue === 'all' || filterValue === '全部署' || filterValue === 'すべての部署') {
    return true;
  }
  if (!user) return false;
  const rawUserDiv =
    user.divisionId ||
    (user.preferences as any)?.divisionId ||
    user.division ||
    (user.department ? user.department.trim().split(/\s+/).slice(1).join(' ') : '');
  if (!rawUserDiv) return false;
  return isSameDivision(rawUserDiv, filterValue, divisions);
}

// ============================================================================
// 役職マスター (PositionMaster) 解決ヘルパー
// ============================================================================

/**
 * 任意の識別子（ID / コード / 名称）から PositionMaster を解決する
 */
export function resolvePosition(
  idOrCodeOrName: string | undefined | null,
  positions: PositionMaster[] = []
): PositionMaster | undefined {
  if (!idOrCodeOrName || !positions || positions.length === 0) return undefined;
  const target = String(idOrCodeOrName).trim();
  if (!target || target === 'all' || target === '一般') return undefined;
  const lower = target.toLowerCase();

  const byId = positions.find((p) => String(p.id).trim().toLowerCase() === lower);
  if (byId) return byId;

  const byCode = positions.find((p) => p.code && String(p.code).trim().toLowerCase() === lower);
  if (byCode) return byCode;

  const byName = positions.find((p) => p.name && String(p.name).trim() === target);
  if (byName) return byName;

  return undefined;
}

/**
 * 任意の識別子から正規の役職IDを返す
 */
export function resolvePositionId(
  idOrCodeOrName: string | undefined | null,
  positions: PositionMaster[] = []
): string {
  if (!idOrCodeOrName) return '';
  const trimmed = String(idOrCodeOrName).trim();
  if (!trimmed || trimmed === '一般') return '';
  const resolved = resolvePosition(trimmed, positions);
  return resolved ? String(resolved.id) : trimmed;
}

/**
 * 任意の識別子から表示用の役職名を返す
 */
export function resolvePositionName(
  idOrCodeOrName: string | undefined | null,
  positions: PositionMaster[] = []
): string {
  if (!idOrCodeOrName) return '';
  const trimmed = String(idOrCodeOrName).trim();
  if (!trimmed || trimmed === '一般') return '';
  const resolved = resolvePosition(trimmed, positions);
  return resolved ? resolved.name : trimmed;
}

/**
 * ユーザーの役職マスターを解決する
 */
export function getUserPosition(
  user: Partial<User> | undefined | null,
  positions: PositionMaster[] = []
): PositionMaster | undefined {
  if (!user) return undefined;
  const prefPositionId = (user.preferences as any)?.positionId;
  if (user.positionId) {
    const byId = resolvePosition(user.positionId, positions);
    if (byId) return byId;
  }
  if (prefPositionId) {
    const byPrefId = resolvePosition(prefPositionId, positions);
    if (byPrefId) return byPrefId;
  }
  if (user.position) {
    const byName = resolvePosition(user.position, positions);
    if (byName) return byName;
  }
  return undefined;
}

/**
 * ユーザーの正規役職IDを取得する
 */
export function getUserPositionId(
  user: Partial<User> | undefined | null,
  positions: PositionMaster[] = []
): string {
  if (!user) return '';
  const resolved = getUserPosition(user, positions);
  if (resolved) return String(resolved.id);
  const raw = user.positionId || (user.preferences as any)?.positionId || user.position || '';
  if (!raw || raw === '一般') return '';
  return resolvePositionId(raw, positions);
}

/**
 * ユーザーの最新役職表示名を取得する
 */
export function getUserPositionName(
  user: Partial<User> | undefined | null,
  positions: PositionMaster[] = []
): string {
  if (!user) return '';
  const resolved = getUserPosition(user, positions);
  if (resolved) return resolved.name;
  return (user.position && user.position !== '一般') ? user.position : '';
}

/**
 * ユーザーが指定された役職（ID / コード / 名称）に一致するか判定する
 */
export function doesUserMatchPosition(
  user: Partial<User> | undefined | null,
  filterValue: string | undefined | null,
  positions: PositionMaster[] = []
): boolean {
  if (!filterValue || filterValue === 'all') return true;
  if (!user) return false;
  const targetPositionId = resolvePositionId(filterValue, positions);
  const userPositionId = getUserPositionId(user, positions);
  if (!targetPositionId || !userPositionId) return false;
  return userPositionId === targetPositionId;
}

/**
 * 承認印・権限ロール分類用ヘルパー（役職マスターの code / level を優先し、名称フォールバックにも対応）
 */
export type PositionApprovalRole = 'branch_manager' | 'section_manager' | 'chief' | 'staff';

export function getPositionRoleType(
  userOrPosition: Partial<User> | string | undefined | null,
  positions: PositionMaster[] = []
): PositionApprovalRole {
  if (!userOrPosition) return 'staff';

  const posMaster =
    typeof userOrPosition === 'string'
      ? resolvePosition(userOrPosition, positions)
      : getUserPosition(userOrPosition, positions);

  const code = (posMaster?.code || '').trim().toUpperCase();
  const level = typeof posMaster?.level === 'number' ? posMaster.level : undefined;
  const name =
    posMaster?.name ||
    (typeof userOrPosition === 'string' ? userOrPosition : userOrPosition.position || '');

  // 1. 権限レベル (level) が設定されている場合
  if (level !== undefined) {
    if (level >= 80) return 'branch_manager';
    if (level >= 50) return 'section_manager';
    if (level >= 30) return 'chief';
  }

  // 2. マスターコード (code) による判定
  if (code === 'POS-001' || code === 'POS-002' || code.includes('EXEC') || code.includes('DIR') || code.includes('BRANCH')) {
    return 'branch_manager';
  }
  if (code === 'POS-003' || code === 'POS-004' || code.includes('MGR') || code.includes('SECT')) {
    return 'section_manager';
  }
  if (code === 'POS-005' || code.includes('CHIEF') || code.includes('LEAD')) {
    return 'chief';
  }

  // 3. 名称によるフォールバック判定
  if (
    name.includes('支店長') ||
    name.includes('所長') ||
    name.includes('部長') ||
    name.includes('代表') ||
    name.includes('社長') ||
    name.includes('役員') ||
    name.includes('専務') ||
    name.includes('常務')
  ) {
    return 'branch_manager';
  }
  if (name.includes('課長') || name.includes('次長') || name.includes('マネージャー')) {
    return 'section_manager';
  }
  if (name.includes('主任') || name.includes('係長') || name.includes('リーダー') || name.includes('チーフ')) {
    return 'chief';
  }

  return 'staff';
}

/**
 * ユーザーが保守系部署に所属しているか判定する（マスターID / コード / 名称両対応）
 */
export function isUserInMaintenanceDivision(
  user: Partial<User> | undefined | null,
  divisions: DivisionMaster[] = []
): boolean {
  if (!user) return false;
  const divMaster = getUserDivision(user, divisions);
  if (divMaster) {
    const code = (divMaster.code || '').trim().toUpperCase();
    const id = String(divMaster.id || '').trim().toLowerCase();
    if (
      id === 'div-5' ||
      code === 'DIV-005' ||
      code.startsWith('MAINT') ||
      code.includes('SERVICE') ||
      (divMaster.name && divMaster.name.includes('保守'))
    ) {
      return true;
    }
  }
  return Boolean(
    (user.division && user.division.includes('保守')) ||
    (user.department && user.department.includes('保守'))
  );
}

/**
 * 拠点別設定リストから、拠点IDまたは名称（「名古屋」⇔「名古屋支店」等の表記ゆれ含む）で設定を解決する
 */
export function findOfficeConfig<T extends { id?: string; officeId?: string; officeName?: string }>(
  configs: T[] | undefined | null,
  officeIdOrName: string | undefined | null,
  offices: OfficeMaster[] = []
): T | undefined {
  if (!configs || !Array.isArray(configs) || configs.length === 0 || !officeIdOrName) {
    return undefined;
  }
  const target = String(officeIdOrName).trim();
  if (!target) return undefined;

  const resolvedOffice = resolveOffice(target, offices);
  const targetId = resolvedOffice ? String(resolvedOffice.id) : '';

  // 1. officeId 完全一致
  if (targetId) {
    const byOfficeId = configs.find(
      (c) => c.officeId && String(c.officeId).trim().toLowerCase() === targetId.toLowerCase()
    );
    if (byOfficeId) return byOfficeId;
  }

  // 2. officeName 完全一致
  const byExactName = configs.find((c) => c.officeName === target);
  if (byExactName) return byExactName;

  // 3. isSameOffice による正規化・マスター横断一致（例: "名古屋" <-> "名古屋支店" <-> "off-1"）
  return configs.find((c) => isSameOffice(c.officeId || c.officeName || c.id?.replace(/^cfg-office-/, ''), target, offices));
}

