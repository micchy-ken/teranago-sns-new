import {
  User,
  ApprovalStepConfig,
  ApprovalApproverCandidate,
  ApprovalFlowRule,
  ApplicationType,
  WorkflowApplication,
  OfficeMaster,
  OfficeRoleApproverType,
} from '../types';
import { resolveOffice } from './masterResolver';

export interface OfficeRoleOption {
  type: OfficeRoleApproverType;
  label: string;
  idField: 'officeManagerId' | 'dispatchManagerId' | 'accountingManagerId' | 'safeDrivingManagerId';
  nameField: 'officeManagerName' | 'dispatchManagerName' | 'accountingManagerName' | 'safeDrivingManagerName';
}

export const OFFICE_ROLE_OPTIONS: readonly OfficeRoleOption[] = [
  {
    type: 'office_manager',
    label: '拠点長',
    idField: 'officeManagerId',
    nameField: 'officeManagerName',
  },
  {
    type: 'dispatch_manager',
    label: '出庫担当',
    idField: 'dispatchManagerId',
    nameField: 'dispatchManagerName',
  },
  {
    type: 'accounting_manager',
    label: '経理担当',
    idField: 'accountingManagerId',
    nameField: 'accountingManagerName',
  },
  {
    type: 'safe_driving_manager',
    label: '安全運転管理者',
    idField: 'safeDrivingManagerId',
    nameField: 'safeDrivingManagerName',
  },
] as const;

export const isOfficeRoleApproverType = (type?: string): type is OfficeRoleApproverType => {
  return OFFICE_ROLE_OPTIONS.some((opt) => opt.type === type);
};

export const getOfficeRoleOption = (type: OfficeRoleApproverType): OfficeRoleOption => {
  return OFFICE_ROLE_OPTIONS.find((opt) => opt.type === type) || OFFICE_ROLE_OPTIONS[0];
};

export const getOfficeRoleLabel = (type: OfficeRoleApproverType): string => {
  return getOfficeRoleOption(type).label;
};

export interface WorkflowResolveContext {
  offices?: OfficeMaster[];
  applicationOfficeId?: string;
  applicationLocation?: string;
  strictUnresolved?: boolean;
}

export interface ResolvedStepCandidate {
  user: User;
  label: string;
  shortRuleLabel?: string;
  resolvedOfficeName?: string;
  isManualOverride?: boolean;
}

export interface ResolvedStepCandidatesResult {
  candidates: ResolvedStepCandidate[];
  isOrStep: boolean;
  isFallback: boolean;
  isUnresolved: boolean;
  unresolvedReason?: string;
  partialUnresolvedWarnings: string[];
}

export interface ResolvedStepDetails {
  user: User | null;
  label: string;
  isFallback: boolean;
  isUnresolved: boolean;
  unresolvedReason?: string;
  isManualOverride?: boolean;
  resolvedOfficeName?: string;
}

export type StepSkipReason = 'self_approval' | 'duplicate_approver' | null;

export interface RoutePreviewItem {
  originalIndex: number;
  stepConfig: ApprovalStepConfig;
  stepName: string;
  effectiveStepNumber: number | null; // アクティブな場合のみ 1, 2, ...
  skipReason: StepSkipReason;
  user: User | null;
  candidates: ResolvedStepCandidate[];
  isOrStep: boolean;
  excludedSelf?: boolean;
  partialUnresolvedWarnings?: string[];
  label: string;
  isFallback: boolean;
  isUnresolved: boolean;
  unresolvedReason?: string;
  isManualOverride?: boolean;
  resolvedOfficeName?: string;
}

export interface ApprovalRoutePreviewResult {
  previewItems: RoutePreviewItem[];
  effectiveSteps: ApprovalStepConfig[];
  hasUnresolved: boolean;
  allStepsSkipped: boolean;
}

/**
 * 申請者から N 階層目の上長ユーザーを取得
 */
export const getSupervisorAtLevel = (
  applicant: User | null | undefined,
  level: number,
  users: User[] = []
): User | null => {
  if (!applicant || !Array.isArray(users) || users.length === 0) return null;
  let curr: User | undefined = applicant;
  const visited = new Set<string>([String(applicant.id)]);
  for (let i = 0; i < level; i++) {
    if (!curr || !curr.supervisorId) return null;
    const sup = users.find((u) => u && String(u.id) === String(curr!.supervisorId));
    if (!sup || visited.has(String(sup.id))) return null;
    visited.add(String(sup.id));
    curr = sup;
  }
  return curr && String(curr.id) !== String(applicant.id) ? curr : null;
};

/**
 * ステップ設定・申請対象拠点・申請者所属から、拠点ロール解決に使用する拠点マスターを特定する
 * 優先順位: ステップ固定拠点 > 申請フォーム選択拠点 > 申請者の所属拠点
 */
export const resolveTargetOfficeForStep = (
  applicant: User | null | undefined,
  stepConfig: ApprovalStepConfig | undefined,
  context?: WorkflowResolveContext
): OfficeMaster | undefined => {
  const offices = context?.offices || [];
  if (offices.length === 0) return undefined;

  // 1. ステップに固定拠点が指定されている場合は最優先
  if (stepConfig?.targetOfficeId && stepConfig.targetOfficeId !== 'applicant_office') {
    const fixed = resolveOffice(stepConfig.targetOfficeId, offices);
    if (fixed) return fixed;
  }

  // 2. 申請フォームで選択された対象拠点（自拠点初期値・他拠点変更可）
  if (context?.applicationOfficeId) {
    const appOff = resolveOffice(context.applicationOfficeId, offices);
    if (appOff) return appOff;
  }
  if (context?.applicationLocation) {
    const appLoc = resolveOffice(context.applicationLocation, offices);
    if (appLoc) return appLoc;
  }

  // 3. 申請者の所属拠点
  if (applicant) {
    const byId = applicant.officeId ? resolveOffice(applicant.officeId, offices) : undefined;
    if (byId) return byId;
    const byName = applicant.office ? resolveOffice(applicant.office, offices) : undefined;
    if (byName) return byName;
    if (applicant.department) {
      const token = applicant.department.split(/\s+/)[0];
      const byDept = resolveOffice(token, offices);
      if (byDept) return byDept;
    }
  }

  return undefined;
};

/**
 * 拠点マスター配列と対象拠点IDから、指定ルールが対象拠点に一致するかを判定
 */
const doesFlowMatchOffice = (
  flow: ApprovalFlowRule,
  targetOfficeId: string | undefined,
  offices: OfficeMaster[] = []
): { hasOfficeRestriction: boolean; matched: boolean } => {
  const ids = Array.isArray(flow.targetOfficeIds)
    ? flow.targetOfficeIds.filter((id) => Boolean(id && String(id).trim()))
    : [];
  if (ids.length === 0) {
    return { hasOfficeRestriction: false, matched: true };
  }
  if (!targetOfficeId) {
    return { hasOfficeRestriction: true, matched: false };
  }
  const canonicalTarget = resolveOffice(targetOfficeId, offices);
  const targetStr = canonicalTarget ? String(canonicalTarget.id) : String(targetOfficeId);

  const matched = ids.some((ruleOffId) => {
    if (String(ruleOffId) === targetStr) return true;
    const resolvedRule = resolveOffice(ruleOffId, offices);
    return Boolean(resolvedRule && String(resolvedRule.id) === targetStr);
  });

  return { hasOfficeRestriction: true, matched };
};

/**
 * 拠点 × 申請種別の組み合わせから最適な初期承認フローを自動選定する
 * 優先順位:
 *  1. 拠点一致 ＋ 申請種別一致（最優先）
 *  2. 全拠点共通 ＋ 申請種別一致
 *  3. 拠点一致 ＋ 全申請共通
 *  4. 全拠点共通 ＋ 全申請共通（デフォルト優先）
 *  5. その他のデフォルト / 先頭ルール
 */
export const findBestMatchingApprovalFlow = (
  flows: ApprovalFlowRule[],
  applicationType: ApplicationType,
  officeId?: string,
  offices: OfficeMaster[] = []
): ApprovalFlowRule | undefined => {
  if (!Array.isArray(flows) || flows.length === 0) return undefined;

  let bestFlow: ApprovalFlowRule | undefined;
  let bestScore = -1;

  for (const flow of flows) {
    const typeScope = flow.targetApplicationType && flow.targetApplicationType !== 'all';
    const typeMatches = !typeScope || flow.targetApplicationType === applicationType;
    const { hasOfficeRestriction, matched: officeMatches } = doesFlowMatchOffice(flow, officeId, offices);

    // 条件が明確に不一致なルールは自動選択の候補から除外（フォールバックは別途）
    if (!typeMatches || !officeMatches) continue;

    let tierScore = 100;
    if (hasOfficeRestriction && typeScope) {
      tierScore = 500; // 拠点一致 ＋ 申請種別一致
    } else if (!hasOfficeRestriction && typeScope) {
      tierScore = 400; // 全拠点共通 ＋ 申請種別一致
    } else if (hasOfficeRestriction && !typeScope) {
      tierScore = 300; // 拠点一致 ＋ 全申請共通
    } else {
      tierScore = flow.isDefault ? 200 : 100; // 全拠点共通 ＋ 全申請共通
    }

    const tieBreaker = (flow.isDefault ? 10 : 0) + (Number(flow.priority) || 0);
    const totalScore = tierScore + tieBreaker;

    if (totalScore > bestScore) {
      bestScore = totalScore;
      bestFlow = flow;
    }
  }

  return bestFlow || flows.find((f) => f.isDefault) || flows[0];
};

/**
 * フロー選択肢に表示するマッチ度バッジテキストを返す
 */
export const getFlowMatchBadge = (
  flow: ApprovalFlowRule,
  applicationType: ApplicationType,
  officeId?: string,
  offices: OfficeMaster[] = []
): string => {
  const typeScope = flow.targetApplicationType && flow.targetApplicationType !== 'all';
  const typeMatches = typeScope && flow.targetApplicationType === applicationType;
  const { hasOfficeRestriction, matched: officeMatches } = doesFlowMatchOffice(flow, officeId, offices);

  if (hasOfficeRestriction && officeMatches && typeMatches) return '★拠点・種別一致';
  if (!hasOfficeRestriction && typeMatches) return '★種別一致';
  if (hasOfficeRestriction && officeMatches && !typeScope) return '★拠点一致';
  if (flow.isDefault) return '(デフォルト)';
  return '';
};

/**
 * ステップ設定に基づき詳細情報 (user, label, isFallback, isUnresolved) を返す関数
 */
export const resolveApproverForStepDetails = (
  applicant: User | null | undefined,
  stepConfig: ApprovalStepConfig,
  index: number,
  users: User[] = [],
  context?: WorkflowResolveContext
): ResolvedStepDetails => {
  const safeUsers = Array.isArray(users) ? users : [];
  const strict = Boolean(context?.strictUnresolved);
  const defaultFallbackUser: User =
    safeUsers.find((u) => u && (u.id === 'u4' || u.isAdmin)) ||
    safeUsers[0] ||
    applicant ||
    ({ id: 'fallback', name: '全社管理者' } as User);

  // 0. 申請者による手動指定（未設定時の必須指定）がある場合は最優先
  if (stepConfig?.manualApproverId) {
    const manualUser = safeUsers.find((u) => u && String(u.id) === String(stepConfig.manualApproverId));
    if (manualUser) {
      const roleSuffix = isOfficeRoleApproverType(stepConfig.approverType)
        ? `${getOfficeRoleLabel(stepConfig.approverType)}・手動指定`
        : '手動指定';
      return {
        user: manualUser,
        label: `${manualUser.name}（${roleSuffix}）`,
        isFallback: false,
        isUnresolved: false,
        isManualOverride: true,
      };
    }
  }

  // 1. 特定ユーザー指定
  if (stepConfig?.approverType === 'specific_user') {
    if (stepConfig.specificUserId) {
      const specUser = safeUsers.find((u) => u && String(u.id) === String(stepConfig.specificUserId));
      if (specUser) {
        return {
          user: specUser,
          label: `${specUser.name || '指定承認者'}（個人指定）`,
          isFallback: false,
          isUnresolved: false,
        };
      }
    }
    if (strict) {
      return {
        user: null,
        label: '指定承認者が未設定（手動指定必須）',
        isFallback: false,
        isUnresolved: true,
        unresolvedReason: '指定された承認者がメンバー一覧に見つかりません。手動で選択してください。',
      };
    }
  }

  // 2. 拠点ロール指定（拠点長・出庫担当・経理担当・安全運転管理者）
  if (isOfficeRoleApproverType(stepConfig?.approverType)) {
    const roleOpt = getOfficeRoleOption(stepConfig.approverType);
    const targetOffice = resolveTargetOfficeForStep(applicant, stepConfig, context);
    const officeName = targetOffice?.name || context?.applicationLocation || applicant?.office || '';

    if (targetOffice) {
      const managerId = targetOffice[roleOpt.idField];
      const managerName = targetOffice[roleOpt.nameField];
      let matchedUser: User | undefined;

      if (managerId) {
        matchedUser = safeUsers.find((u) => u && String(u.id) === String(managerId));
      }
      if (!matchedUser && managerName) {
        matchedUser = safeUsers.find((u) => u && u.name === managerName);
      }

      if (matchedUser) {
        return {
          user: matchedUser,
          label: `${matchedUser.name}（${targetOffice.name}・${roleOpt.label}）`,
          isFallback: false,
          isUnresolved: false,
          resolvedOfficeName: targetOffice.name,
        };
      }
    }

    // 保存済みスナップショットがある場合（閲覧・既存申請表示向け）
    if (!strict && stepConfig.resolvedApproverId) {
      const snapUser = safeUsers.find((u) => u && String(u.id) === String(stepConfig.resolvedApproverId));
      if (snapUser) {
        return {
          user: snapUser,
          label: `${snapUser.name}（${officeName ? `${officeName}・` : ''}${roleOpt.label}）`,
          isFallback: false,
          isUnresolved: false,
          resolvedOfficeName: officeName || undefined,
        };
      }
    }

    if (strict) {
      return {
        user: null,
        label: `${officeName ? `${officeName}・` : ''}${roleOpt.label}（未設定・手動指定必須）`,
        isFallback: false,
        isUnresolved: true,
        unresolvedReason: targetOffice
          ? `拠点「${targetOffice.name}」の「${roleOpt.label}」が拠点マスターに未設定です。承認者を手動で選択してください。`
          : `対象拠点の「${roleOpt.label}」を特定できませんでした。承認者を手動で選択してください。`,
        resolvedOfficeName: officeName || undefined,
      };
    }

    // 非strict（既存申請一覧・詳細の安全なフォールバック）
    const adminName = defaultFallbackUser?.name || '全社管理者';
    return {
      user: defaultFallbackUser,
      label: `${adminName}（${officeName ? `${officeName}・` : ''}${roleOpt.label}未設定のため代行）`,
      isFallback: true,
      isUnresolved: false,
      resolvedOfficeName: officeName || undefined,
    };
  }

  // 3. 階層上長指定
  let targetLevel = stepConfig?.supervisorLevel;
  if (!targetLevel) {
    if (stepConfig?.approverType === 'supervisor_1') targetLevel = 1;
    else if (stepConfig?.approverType === 'supervisor_2') targetLevel = 2;
    else targetLevel = index + 1;
  }

  const sup = applicant ? getSupervisorAtLevel(applicant, targetLevel, safeUsers) : null;
  if (sup) {
    return {
      user: sup,
      label: `${sup.name || '上長'} (${targetLevel === 1 ? '直属上長' : `第${targetLevel}階層上長`})`,
      isFallback: false,
      isUnresolved: false,
    };
  }

  // 保存済みスナップショットがある場合（非strict）
  if (!strict && stepConfig?.resolvedApproverId) {
    const snapUser = safeUsers.find((u) => u && String(u.id) === String(stepConfig.resolvedApproverId));
    if (snapUser) {
      return {
        user: snapUser,
        label: `${snapUser.name}（${stepConfig.stepName || '承認者'}）`,
        isFallback: false,
        isUnresolved: false,
      };
    }
  }

  if (strict) {
    return {
      user: null,
      label: `${targetLevel === 1 ? '直属上長' : `第${targetLevel}階層上長`}（未設定・手動指定必須）`,
      isFallback: false,
      isUnresolved: true,
      unresolvedReason: `${targetLevel === 1 ? '直属上長' : `第${targetLevel}階層上長`}が未設定です。承認者を手動で選択してください。`,
    };
  }

  // 非strict フォールバック
  const fallback1 = applicant ? getSupervisorAtLevel(applicant, 1, safeUsers) : null;
  if (fallback1) {
    return {
      user: fallback1,
      label: `${fallback1.name || '直属上長'} (直属上長 ※${targetLevel}次上長未設定のため代行)`,
      isFallback: true,
      isUnresolved: false,
    };
  }

  const adminName = defaultFallbackUser?.name || '全社管理者';
  return {
    user: defaultFallbackUser,
    label: `${adminName} (全社管理者 ※上長未設定代行)`,
    isFallback: true,
    isUnresolved: false,
  };
};

/**
 * 1つの承認者ルール（主ルールまたはOR追加ルール）を解決する内部ヘルパー
 */
const resolveSingleCandidateRule = (
  applicant: User | null | undefined,
  rule: ApprovalApproverCandidate,
  stepIndex: number,
  users: User[],
  context?: WorkflowResolveContext
): {
  user: User | null;
  label: string;
  shortRuleLabel: string;
  resolvedOfficeName?: string;
  unresolvedReason?: string;
} => {
  // 1. 特定ユーザー指定
  if (rule.approverType === 'specific_user') {
    if (rule.specificUserId) {
      const specUser = users.find((u) => u && String(u.id) === String(rule.specificUserId));
      if (specUser) {
        return {
          user: specUser,
          label: `${specUser.name || '指定承認者'}（個人指定）`,
          shortRuleLabel: '個人指定',
        };
      }
    }
    return {
      user: null,
      label: '指定承認者（未設定）',
      shortRuleLabel: '個人指定',
      unresolvedReason: '指定された承認者がメンバー一覧に見つかりません。',
    };
  }

  // 2. 拠点ロール指定
  if (isOfficeRoleApproverType(rule.approverType)) {
    const roleOpt = getOfficeRoleOption(rule.approverType);
    const pseudoStep: ApprovalStepConfig = {
      stepNumber: stepIndex + 1,
      approverType: rule.approverType,
      targetOfficeId: rule.targetOfficeId,
    };
    const targetOffice = resolveTargetOfficeForStep(applicant, pseudoStep, context);
    const officeName = targetOffice?.name || context?.applicationLocation || applicant?.office || '';

    if (targetOffice) {
      const managerId = targetOffice[roleOpt.idField];
      const managerName = targetOffice[roleOpt.nameField];
      let matchedUser: User | undefined;

      if (managerId) {
        matchedUser = users.find((u) => u && String(u.id) === String(managerId));
      }
      if (!matchedUser && managerName) {
        matchedUser = users.find((u) => u && u.name === managerName);
      }

      if (matchedUser) {
        return {
          user: matchedUser,
          label: `${matchedUser.name}（${targetOffice.name}・${roleOpt.label}）`,
          shortRuleLabel: `${targetOffice.name}・${roleOpt.label}`,
          resolvedOfficeName: targetOffice.name,
        };
      }
    }

    return {
      user: null,
      label: `${officeName ? `${officeName}・` : ''}${roleOpt.label}（未設定）`,
      shortRuleLabel: `${officeName ? `${officeName}・` : ''}${roleOpt.label}`,
      resolvedOfficeName: officeName || undefined,
      unresolvedReason: targetOffice
        ? `拠点「${targetOffice.name}」の「${roleOpt.label}」が拠点マスターに未設定です。`
        : `対象拠点の「${roleOpt.label}」を特定できませんでした。`,
    };
  }

  // 3. 階層上長指定
  let targetLevel = rule.supervisorLevel;
  if (!targetLevel) {
    if (rule.approverType === 'supervisor_1') targetLevel = 1;
    else if (rule.approverType === 'supervisor_2') targetLevel = 2;
    else targetLevel = stepIndex + 1;
  }
  const supLabel = targetLevel === 1 ? '直属上長' : `第${targetLevel}階層上長`;
  const sup = applicant ? getSupervisorAtLevel(applicant, targetLevel, users) : null;
  if (sup) {
    return {
      user: sup,
      label: `${sup.name || '上長'}（${supLabel}）`,
      shortRuleLabel: supLabel,
    };
  }

  return {
    user: null,
    label: `${supLabel}（未設定）`,
    shortRuleLabel: supLabel,
    unresolvedReason: `${supLabel}が未設定です。`,
  };
};

/**
 * ステップ設定から全承認候補者（主ルール＋OR追加ルール）を解決・重複排除して返す
 */
export const resolveStepCandidates = (
  applicant: User | null | undefined,
  stepConfig: ApprovalStepConfig,
  index: number,
  users: User[] = [],
  context?: WorkflowResolveContext
): ResolvedStepCandidatesResult => {
  const safeUsers = Array.isArray(users) ? users : [];
  const strict = Boolean(context?.strictUnresolved);
  const orRules = Array.isArray(stepConfig?.orApprovers) ? stepConfig.orApprovers : [];
  const hasOrRules = orRules.length > 0;

  // 0. 申請者による手動指定がある場合は最優先（単一承認として確定）
  if (stepConfig?.manualApproverId) {
    const manualUser = safeUsers.find((u) => u && String(u.id) === String(stepConfig.manualApproverId));
    if (manualUser) {
      const roleSuffix = isOfficeRoleApproverType(stepConfig.approverType)
        ? `${getOfficeRoleLabel(stepConfig.approverType)}・手動指定`
        : '手動指定';
      return {
        candidates: [
          {
            user: manualUser,
            label: `${manualUser.name}（${roleSuffix}）`,
            shortRuleLabel: roleSuffix,
            isManualOverride: true,
          },
        ],
        isOrStep: false,
        isFallback: false,
        isUnresolved: false,
        partialUnresolvedWarnings: [],
      };
    }
  }

  const allRules: ApprovalApproverCandidate[] = [
    {
      approverType: stepConfig.approverType,
      supervisorLevel: stepConfig.supervisorLevel,
      specificUserId: stepConfig.specificUserId,
      targetOfficeId: stepConfig.targetOfficeId,
    },
    ...orRules,
  ];

  const candidates: ResolvedStepCandidate[] = [];
  const seenIds = new Set<string>();
  const partialUnresolvedWarnings: string[] = [];

  for (const rule of allRules) {
    if (!rule || !rule.approverType) continue;
    const res = resolveSingleCandidateRule(applicant, rule, index, safeUsers, context);
    if (res.user) {
      const uid = String(res.user.id);
      if (!seenIds.has(uid)) {
        seenIds.add(uid);
        candidates.push({
          user: res.user,
          label: res.label,
          shortRuleLabel: res.shortRuleLabel,
          resolvedOfficeName: res.resolvedOfficeName,
        });
      }
    } else if (res.unresolvedReason) {
      partialUnresolvedWarnings.push(res.unresolvedReason);
    }
  }

  // 非strict時：動的解決で候補が取れなかった場合や、スナップショットのみ保存されている場合はスナップショット復元
  if (!strict && candidates.length === 0) {
    if (Array.isArray(stepConfig.orApproverUserIds) && stepConfig.orApproverUserIds.length > 0) {
      for (const uid of stepConfig.orApproverUserIds) {
        const snapUser = safeUsers.find((u) => u && String(u.id) === String(uid));
        if (snapUser && !seenIds.has(String(snapUser.id))) {
          seenIds.add(String(snapUser.id));
          candidates.push({
            user: snapUser,
            label: `${snapUser.name}（${stepConfig.stepName || 'OR承認候補'}）`,
            shortRuleLabel: stepConfig.stepName || 'OR承認候補',
          });
        }
      }
    }
    if (candidates.length === 0 && stepConfig.resolvedApproverId) {
      const snapUser = safeUsers.find((u) => u && String(u.id) === String(stepConfig.resolvedApproverId));
      if (snapUser) {
        candidates.push({
          user: snapUser,
          label: `${snapUser.name}（${stepConfig.stepName || '承認者'}）`,
          shortRuleLabel: stepConfig.stepName || '承認者',
        });
      }
    }
  }

  // 候補が1名以上解決できた場合
  if (candidates.length > 0) {
    return {
      candidates,
      isOrStep: candidates.length > 1 || stepConfig.approvalMode === 'or' || hasOrRules,
      isFallback: false,
      isUnresolved: false,
      partialUnresolvedWarnings,
    };
  }

  // 全ルール未解決の場合
  if (strict) {
    return {
      candidates: [],
      isOrStep: stepConfig.approvalMode === 'or' || hasOrRules,
      isFallback: false,
      isUnresolved: true,
      unresolvedReason:
        partialUnresolvedWarnings.length > 0
          ? `${partialUnresolvedWarnings[0]} 承認者を手動で選択してください。`
          : 'このステップの承認者が未設定です。承認者を手動で選択してください。',
      partialUnresolvedWarnings,
    };
  }

  // 非strict フォールバック（既存申請一覧・詳細の表示耐障害性維持）
  const fallbackDetails = resolveApproverForStepDetails(applicant, stepConfig, index, safeUsers, {
    ...(context || {}),
    strictUnresolved: false,
  });
  return {
    candidates: fallbackDetails.user
      ? [
          {
            user: fallbackDetails.user,
            label: fallbackDetails.label,
            shortRuleLabel: fallbackDetails.isFallback ? '代行' : stepConfig.stepName || '承認者',
            resolvedOfficeName: fallbackDetails.resolvedOfficeName,
          },
        ]
      : [],
    isOrStep: stepConfig.approvalMode === 'or' || hasOrRules,
    isFallback: fallbackDetails.isFallback,
    isUnresolved: false,
    partialUnresolvedWarnings,
  };
};

/**
 * ステップ設定に基づき有効な全承認候補ユーザー配列を返す（OR承認の全員通知・重複スキップ判定用）
 * 申請者本人が候補に含まれ、かつ他に候補者がいる場合は申請者本人のみ除外する。
 * 全候補者が申請者本人の場合は [applicant] を返し、呼び出し側で自己承認スキップを判定できるようにする。
 */
export const resolveApproversForStep = (
  applicant: User | null | undefined,
  stepConfig: ApprovalStepConfig,
  users: User[] = [],
  context?: WorkflowResolveContext
): User[] => {
  const safeUsers = Array.isArray(users) ? users : [];
  const applicantId = applicant?.id ? String(applicant.id) : '';
  const stepIdx = Math.max(0, (stepConfig?.stepNumber || 1) - 1);

  const resolved = resolveStepCandidates(applicant, stepConfig, stepIdx, safeUsers, {
    ...(context || {}),
    strictUnresolved: false,
  });

  const allResolvedUsers = resolved.candidates.map((c) => c.user);
  if (allResolvedUsers.length > 0) {
    if (applicantId) {
      const withoutSelf = allResolvedUsers.filter((u) => String(u.id) !== applicantId);
      if (withoutSelf.length > 0) {
        return withoutSelf;
      }
    }
    return allResolvedUsers;
  }

  const fallbackUser = resolveApproverForStep(applicant, stepConfig, safeUsers, context);
  return fallbackUser ? [fallbackUser] : [];
};

/**
 * ステップ設定に基づき代表承認者（1名）を動的解決する関数
 */
export const resolveApproverForStep = (
  applicant: User | null | undefined,
  stepConfig: ApprovalStepConfig,
  users: User[] = [],
  context?: WorkflowResolveContext
): User => {
  // OR承認ルールがある場合は、申請者除外後の先頭候補を優先
  if (
    stepConfig &&
    (stepConfig.approvalMode === 'or' ||
      (Array.isArray(stepConfig.orApprovers) && stepConfig.orApprovers.length > 0) ||
      (Array.isArray(stepConfig.orApproverUserIds) && stepConfig.orApproverUserIds.length > 1))
  ) {
    const safeUsers = Array.isArray(users) ? users : [];
    const stepIdx = Math.max(0, (stepConfig.stepNumber || 1) - 1);
    const resolved = resolveStepCandidates(applicant, stepConfig, stepIdx, safeUsers, {
      ...(context || {}),
      strictUnresolved: false,
    });
    const applicantId = applicant?.id ? String(applicant.id) : '';
    const nonSelf = applicantId
      ? resolved.candidates.filter((c) => String(c.user.id) !== applicantId)
      : resolved.candidates;
    if (nonSelf.length > 0) return nonSelf[0].user;
    if (resolved.candidates.length > 0) return resolved.candidates[0].user;
  }

  const details = resolveApproverForStepDetails(applicant, stepConfig, (stepConfig?.stepNumber || 1) - 1, users, {
    ...(context || {}),
    strictUnresolved: false,
  });
  if (details.user) return details.user;
  const safeUsers = Array.isArray(users) ? users : [];
  const adminUser = safeUsers.find((u) => u && (u.id === 'u4' || u.isAdmin)) || safeUsers[0];
  return adminUser || applicant || ({ id: 'fallback', name: '全社管理者' } as User);
};

/**
 * 申請フォーム用：OR承認・自己承認除外/スキップ・同一承認者スキップ（案1）・未設定チェックを含めた
 * 完全な承認ルートプレビューと確定ステップ配列を構築する
 */
export const buildApprovalRoutePreview = (
  applicant: User | null | undefined,
  rawSteps: ApprovalStepConfig[] | undefined,
  users: User[] = [],
  context?: WorkflowResolveContext,
  manualOverrides: Record<number, string> = {}
): ApprovalRoutePreviewResult => {
  if (!rawSteps || rawSteps.length === 0) {
    return {
      previewItems: [],
      effectiveSteps: [],
      hasUnresolved: false,
      allStepsSkipped: false,
    };
  }

  const safeUsers = Array.isArray(users) ? users : [];
  const applicantId = applicant?.id ? String(applicant.id) : '';
  const prevStepCandidateSets: Set<string>[] = [];
  const previewItems: RoutePreviewItem[] = [];
  const effectiveSteps: ApprovalStepConfig[] = [];
  let effectiveCounter = 0;
  let skippedCount = 0;

  rawSteps.forEach((rawStep, idx) => {
    if (!rawStep) return;

    const overrideUserId = manualOverrides[idx];
    const stepWithOverride: ApprovalStepConfig = overrideUserId
      ? { ...rawStep, manualApproverId: overrideUserId }
      : { ...rawStep };
    const hasOrRules = Array.isArray(stepWithOverride.orApprovers) && stepWithOverride.orApprovers.length > 0;

    // 2次以上の階層上長のみの単独ステップで該当階層が存在しない場合（ORルール・手動上書きも無い場合）は従来通りステップ自体を除外
    if (
      !stepWithOverride.manualApproverId &&
      !hasOrRules &&
      !isOfficeRoleApproverType(stepWithOverride.approverType) &&
      stepWithOverride.approverType !== 'specific_user'
    ) {
      let targetLevel = stepWithOverride.supervisorLevel;
      if (!targetLevel) {
        if (stepWithOverride.approverType === 'supervisor_1') targetLevel = 1;
        else if (stepWithOverride.approverType === 'supervisor_2') targetLevel = 2;
        else targetLevel = idx + 1;
      }
      if (targetLevel >= 2) {
        const sup = applicant ? getSupervisorAtLevel(applicant, targetLevel, safeUsers) : null;
        if (!sup) return;
      }
    }

    const stepName = stepWithOverride.stepName || `${idx + 1}次承認`;
    const resolved = resolveStepCandidates(applicant, stepWithOverride, idx, safeUsers, {
      ...(context || {}),
      strictUnresolved: true,
    });

    // 全ルール未設定（手動指定必須）
    if (resolved.isUnresolved || resolved.candidates.length === 0) {
      effectiveCounter += 1;
      previewItems.push({
        originalIndex: idx,
        stepConfig: stepWithOverride,
        stepName,
        effectiveStepNumber: effectiveCounter,
        skipReason: null,
        user: null,
        candidates: [],
        isOrStep: resolved.isOrStep,
        partialUnresolvedWarnings: resolved.partialUnresolvedWarnings,
        label: resolved.unresolvedReason || '担当者未設定（手動指定必須）',
        isFallback: false,
        isUnresolved: true,
        unresolvedReason: resolved.unresolvedReason,
      });
      effectiveSteps.push({
        ...stepWithOverride,
        stepNumber: effectiveCounter,
      });
      return;
    }

    // ルール3：申請者本人がOR候補に含まれる場合、申請者本人のみ除外。残りが0名になった場合のみ自己承認スキップ
    const nonSelfCandidates = applicantId
      ? resolved.candidates.filter((c) => String(c.user.id) !== applicantId)
      : resolved.candidates;
    const excludedSelf = nonSelfCandidates.length < resolved.candidates.length;

    if (nonSelfCandidates.length === 0) {
      skippedCount += 1;
      const firstCand = resolved.candidates[0];
      previewItems.push({
        originalIndex: idx,
        stepConfig: stepWithOverride,
        stepName,
        effectiveStepNumber: null,
        skipReason: 'self_approval',
        user: firstCand.user,
        candidates: resolved.candidates,
        isOrStep: resolved.candidates.length > 1,
        excludedSelf: true,
        partialUnresolvedWarnings: resolved.partialUnresolvedWarnings,
        label: firstCand.label,
        isFallback: false,
        isUnresolved: false,
        isManualOverride: firstCand.isManualOverride,
        resolvedOfficeName: firstCand.resolvedOfficeName,
      });
      return;
    }

    // ルール4（案1）：前のアクティブステップの誰が承認しても必ず現ステップの候補に含まれる場合（P ⊆ C）は自動スキップ
    const currentIdSet = new Set(nonSelfCandidates.map((c) => String(c.user.id)));
    const isGuaranteedDuplicate = prevStepCandidateSets.some(
      (prevSet) => prevSet.size > 0 && Array.from(prevSet).every((id) => currentIdSet.has(id))
    );

    if (isGuaranteedDuplicate) {
      skippedCount += 1;
      const isOrActive = nonSelfCandidates.length > 1;
      previewItems.push({
        originalIndex: idx,
        stepConfig: stepWithOverride,
        stepName,
        effectiveStepNumber: null,
        skipReason: 'duplicate_approver',
        user: nonSelfCandidates[0].user,
        candidates: nonSelfCandidates,
        isOrStep: isOrActive,
        excludedSelf,
        partialUnresolvedWarnings: resolved.partialUnresolvedWarnings,
        label: isOrActive
          ? nonSelfCandidates.map((c) => c.shortRuleLabel || c.user.name).join(' / ')
          : nonSelfCandidates[0].label,
        isFallback: false,
        isUnresolved: false,
        isManualOverride: nonSelfCandidates[0].isManualOverride,
        resolvedOfficeName: nonSelfCandidates[0].resolvedOfficeName,
      });
      return;
    }

    prevStepCandidateSets.push(currentIdSet);
    effectiveCounter += 1;

    const isOrActive = nonSelfCandidates.length > 1;
    const candidateIds = nonSelfCandidates.map((c) => String(c.user.id));
    const finalizedStep: ApprovalStepConfig = {
      ...stepWithOverride,
      stepNumber: effectiveCounter,
      approvalMode: isOrActive ? 'or' : 'single',
      resolvedApproverId: candidateIds[0],
      orApproverUserIds: isOrActive || hasOrRules ? candidateIds : undefined,
    };

    previewItems.push({
      originalIndex: idx,
      stepConfig: finalizedStep,
      stepName,
      effectiveStepNumber: effectiveCounter,
      skipReason: null,
      user: nonSelfCandidates[0].user,
      candidates: nonSelfCandidates,
      isOrStep: isOrActive,
      excludedSelf,
      partialUnresolvedWarnings: resolved.partialUnresolvedWarnings,
      label: isOrActive
        ? nonSelfCandidates.map((c) => c.shortRuleLabel || c.user.name).join(' / ')
        : nonSelfCandidates[0].label,
      isFallback: false,
      isUnresolved: false,
      isManualOverride: nonSelfCandidates[0].isManualOverride,
      resolvedOfficeName: nonSelfCandidates[0].resolvedOfficeName,
    });
    effectiveSteps.push(finalizedStep);
  });

  const hasUnresolved = previewItems.some((item) => item.skipReason === null && item.isUnresolved);
  const allStepsSkipped = previewItems.length > 0 && effectiveSteps.length === 0 && skippedCount > 0;

  return {
    previewItems,
    effectiveSteps,
    hasUnresolved,
    allStepsSkipped,
  };
};

/**
 * 申請者の役職・上長設定に応じて、存在しない階層上長ステップを除外する
 * （例: 上長1次、上長2次が設定されているが、2次上長が存在しない場合、2次ステップを除外して1次のみにする）
 */
export const filterStepsForApplicant = (
  applicant: User | null | undefined,
  stepsConfig: ApprovalStepConfig[] | undefined,
  users: User[] = [],
  _context?: WorkflowResolveContext
): ApprovalStepConfig[] => {
  if (!stepsConfig || stepsConfig.length === 0) return [];
  const safeUsers = Array.isArray(users) ? users : [];

  const validSteps = stepsConfig.filter((step, index) => {
    if (!step) return false;
    // 手動指定・OR追加ルールあり・特定ユーザー指定・拠点ロール指定は有効
    if (step.manualApproverId) return true;
    if (Array.isArray(step.orApprovers) && step.orApprovers.length > 0) return true;
    if (step.approverType === 'specific_user') return true;
    if (isOfficeRoleApproverType(step.approverType)) return true;

    // 階層上長の判定
    let targetLevel = step.supervisorLevel;
    if (!targetLevel) {
      if (step.approverType === 'supervisor_1') targetLevel = 1;
      else if (step.approverType === 'supervisor_2') targetLevel = 2;
      else targetLevel = index + 1;
    }

    // 1次上長は残す
    if (targetLevel <= 1) return true;

    // 2次以上の階層上長（targetLevel >= 2）の場合、該当階層の上長が存在しないならステップを除外
    const sup = applicant ? getSupervisorAtLevel(applicant, targetLevel, safeUsers) : null;
    return !!sup;
  });

  // ステップ番号を再調整
  return validSteps.map((step, idx) => ({
    ...step,
    stepNumber: idx + 1,
  }));
};

/**
 * 対象ステップの承認者が前までのステップの承認者と確実に重複（案1: 前ステップ候補集合 ⊆ 現ステップ候補集合）するか判定
 */
export const isDuplicateApproverStep = (
  applicant: User,
  stepsConfig: ApprovalStepConfig[] | undefined,
  stepIdx: number,
  users: User[],
  context?: WorkflowResolveContext
): boolean => {
  if (!stepsConfig || stepIdx <= 0 || stepIdx >= stepsConfig.length) return false;

  const currentApprovers = resolveApproversForStep(applicant, stepsConfig[stepIdx], users, context);
  if (currentApprovers.length === 0) return false;
  const currentIdSet = new Set(currentApprovers.map((u) => String(u.id)));

  for (let i = 0; i < stepIdx; i++) {
    const prevApprovers = resolveApproversForStep(applicant, stepsConfig[i], users, context);
    if (prevApprovers.length > 0 && prevApprovers.every((u) => currentIdSet.has(String(u.id)))) {
      return true;
    }
  }

  return false;
};

/**
 * 対象申請の現在ステップにおける承認者かどうかを判定
 * （手動指定・OR承認・拠点ロール・階層上長・保存済みスナップショットすべてに対応）
 */
export const isUserCurrentApprover = (
  app: WorkflowApplication,
  user: User,
  users: User[] = [],
  offices: OfficeMaster[] = []
): boolean => {
  if (!app || !user || app.status !== 'pending') return false;
  const targetUserId = String(user.id);

  // 1. 多段階ステップのチェック（多段階フローが設定されている場合はステップ優先）
  if (app.stepsConfig && app.stepsConfig.length > 0) {
    const currentStepIdx = (app.currentStepIndex || 1) - 1;
    const step = app.stepsConfig[currentStepIdx];
    if (!step) return false;

    const isOrConfigured =
      step.approvalMode === 'or' ||
      (Array.isArray(step.orApprovers) && step.orApprovers.length > 0) ||
      (Array.isArray(step.orApproverUserIds) && step.orApproverUserIds.length > 1);

    // 手動指定承認者（OR設定があっても手動上書きされた場合はその1名のみ）
    if (step.manualApproverId) {
      return String(step.manualApproverId) === targetUserId;
    }

    // OR承認ステップ（複数候補のうち誰か1名が承認可能）
    if (isOrConfigured) {
      // 保存済みスナップショット（未読通知など users 未渡しの軽量判定でも確実に動作）
      if (Array.isArray(step.orApproverUserIds) && step.orApproverUserIds.length > 0) {
        if (step.orApproverUserIds.some((id) => String(id) === targetUserId)) {
          return true;
        }
        if (users.length === 0) {
          return false;
        }
      }

      // users が渡されている場合は動的解決も照合（拠点ロール変更や未スナップショット申請にも対応）
      if (users.length > 0) {
        const resolvedUsers = resolveApproversForStep(app.applicant, step, users, {
          offices,
          applicationOfficeId: app.officeId,
          applicationLocation: app.location,
        });
        // 申請者本人のみを除外した結果で照合
        const applicantId = app.applicant?.id ? String(app.applicant.id) : '';
        const eligible =
          applicantId && resolvedUsers.some((u) => String(u.id) !== applicantId)
            ? resolvedUsers.filter((u) => String(u.id) !== applicantId)
            : resolvedUsers;
        return eligible.some((u) => String(u.id) === targetUserId);
      }

      if (step.resolvedApproverId) {
        return String(step.resolvedApproverId) === targetUserId;
      }
      if (app.approver?.id) {
        return String(app.approver.id) === targetUserId;
      }
      return false;
    }

    // 特定ユーザー指定
    if (step.approverType === 'specific_user' && step.specificUserId) {
      return String(step.specificUserId) === targetUserId;
    }

    // 拠点ロール指定
    if (isOfficeRoleApproverType(step.approverType)) {
      if (offices.length > 0 && users.length > 0) {
        const resolved = resolveApproverForStepDetails(app.applicant, step, currentStepIdx, users, {
          offices,
          applicationOfficeId: app.officeId,
          applicationLocation: app.location,
          strictUnresolved: true,
        });
        if (!resolved.isUnresolved && resolved.user) {
          return String(resolved.user.id) === targetUserId;
        }
      }
      if (step.resolvedApproverId) {
        return String(step.resolvedApproverId) === targetUserId;
      }
      if (app.approver?.id) {
        return String(app.approver.id) === targetUserId;
      }
      return false;
    }

    // 階層上長指定
    if (users.length > 0 && app.applicant) {
      let targetLevel = step.supervisorLevel;
      if (!targetLevel) {
        if (step.approverType === 'supervisor_1') targetLevel = 1;
        else if (step.approverType === 'supervisor_2') targetLevel = 2;
        else targetLevel = currentStepIdx + 1;
      }

      const sup = getSupervisorAtLevel(app.applicant, targetLevel, users);
      if (sup) return String(sup.id) === targetUserId;

      if (step.resolvedApproverId) {
        return String(step.resolvedApproverId) === targetUserId;
      }

      const fallbackSup = getSupervisorAtLevel(app.applicant, 1, users);
      if (fallbackSup) return String(fallbackSup.id) === targetUserId;

      const adminUser = users.find((u) => u.id === 'u4' || u.isAdmin);
      return adminUser ? String(adminUser.id) === targetUserId : false;
    }

    // users未渡しの軽量判定（未読バッジ等）はスナップショット / app.approver を参照
    if (step.resolvedApproverId) {
      return String(step.resolvedApproverId) === targetUserId;
    }
    if (app.approver?.id) {
      return String(app.approver.id) === targetUserId;
    }
    return false;
  }

  // 2. 多段階ステップがない単一承認フローの場合のみ直接指定の承認者を判定
  if (app.approver?.id === user.id || app.approver?.name === user.name) return true;

  return false;
};
