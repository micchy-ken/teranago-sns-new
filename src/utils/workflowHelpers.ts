import { User, ApprovalStepConfig, WorkflowApplication } from '../types';

/**
 * 申請者から N 階層目の上長ユーザーを取得
 */
export const getSupervisorAtLevel = (applicant: User, level: number, users: User[]): User | null => {
  if (!applicant) return null;
  let curr: User | undefined = applicant;
  for (let i = 0; i < level; i++) {
    if (!curr || !curr.supervisorId) break;
    const sup = users.find(u => u.id === curr.supervisorId);
    if (!sup) break;
    curr = sup;
  }
  return (curr && curr.id !== applicant.id) ? curr : null;
};

/**
 * 申請者の役職・上長設定に応じて、存在しない階層上長ステップを除外する
 * （例: 上長1次、上長2次が設定されているが、2次上長が存在しない場合、2次ステップを除外して1次のみにする）
 */
export const filterStepsForApplicant = (
  applicant: User,
  stepsConfig: ApprovalStepConfig[] | undefined,
  users: User[]
): ApprovalStepConfig[] => {
  if (!stepsConfig || stepsConfig.length === 0) return [];

  const validSteps = stepsConfig.filter((step, index) => {
    // 特定ユーザー指定の場合は常に有効
    if (step.approverType === 'specific_user') return true;

    // 階層上長の判定
    let targetLevel = step.supervisorLevel;
    if (!targetLevel) {
      if (step.approverType === 'supervisor_1') targetLevel = 1;
      else if (step.approverType === 'supervisor_2') targetLevel = 2;
      else targetLevel = index + 1;
    }

    // 1次上長は、居ない場合でもフォールバック（管理者等）で残す
    if (targetLevel <= 1) return true;

    // 2次以上の階層上長（targetLevel >= 2）の場合、該当階層の上長が存在しないならステップを除外（1次のみにする）
    const sup = getSupervisorAtLevel(applicant, targetLevel, users);
    if (!sup) {
      return false;
    }
    return true;
  });

  // ステップ番号を再調整
  return validSteps.map((step, idx) => ({
    ...step,
    stepNumber: idx + 1
  }));
};

/**
 * ステップ設定に基づき具体的な承認者を動的解決する関数
 */
export const resolveApproverForStep = (
  applicant: User,
  stepConfig: ApprovalStepConfig,
  users: User[]
): User => {
  if (stepConfig.approverType === 'specific_user' && stepConfig.specificUserId) {
    const found = users.find(u => u.id === stepConfig.specificUserId);
    if (found) return found;
  }

  let targetLevel = stepConfig.supervisorLevel;
  if (!targetLevel) {
    if (stepConfig.approverType === 'supervisor_1') targetLevel = 1;
    else if (stepConfig.approverType === 'supervisor_2') targetLevel = 2;
    else targetLevel = stepConfig.stepNumber || 1;
  }

  const sup = getSupervisorAtLevel(applicant, targetLevel, users);
  if (sup) return sup;

  // 該当階層の上長未登録時のフォールバック (直近の上長、または管理者)
  const fallbackSup = getSupervisorAtLevel(applicant, 1, users);
  return fallbackSup || users.find(u => u.id === 'u4' || u.isAdmin) || users[0];
};

/**
 * ステップ設定に基づき詳細情報(user, label, isFallback)を返す関数
 */
export const resolveApproverForStepDetails = (
  applicant: User,
  stepConfig: ApprovalStepConfig,
  index: number,
  users: User[]
): { user: User; label: string; isFallback: boolean } => {
  if (stepConfig.approverType === 'specific_user' && stepConfig.specificUserId) {
    const specUser = users.find(u => u.id === stepConfig.specificUserId);
    if (specUser) {
      return { user: specUser, label: `${specUser.name}（個人指定）`, isFallback: false };
    }
  }

  let targetLevel = stepConfig.supervisorLevel;
  if (!targetLevel) {
    if (stepConfig.approverType === 'supervisor_1') targetLevel = 1;
    else if (stepConfig.approverType === 'supervisor_2') targetLevel = 2;
    else targetLevel = index + 1;
  }

  const sup = getSupervisorAtLevel(applicant, targetLevel, users);
  if (sup) {
    return {
      user: sup,
      label: `${sup.name} (${targetLevel === 1 ? '直属上長' : `第${targetLevel}階層上長`})`,
      isFallback: false
    };
  }

  // 上長が登録されていない場合フォールバック
  const fallback1 = getSupervisorAtLevel(applicant, 1, users);
  if (fallback1) {
    return {
      user: fallback1,
      label: `${fallback1.name} (直属上長 ※${targetLevel}次上長未設定のため代行)`,
      isFallback: true
    };
  }

  const adminUser = users.find(u => u.id === 'u4' || u.isAdmin) || users[0];
  return {
    user: adminUser,
    label: `${adminUser.name} (全社管理者 ※上長未設定代行)`,
    isFallback: true
  };
};

/**
 * 対象ステップの承認者が直前ステップの承認者と同一人物かどうか判定する
 */
export const isDuplicateApproverStep = (
  applicant: User,
  stepsConfig: ApprovalStepConfig[] | undefined,
  stepIdx: number,
  users: User[]
): boolean => {
  if (!stepsConfig || stepIdx <= 0 || stepIdx >= stepsConfig.length) return false;

  const currentApprover = resolveApproverForStep(applicant, stepsConfig[stepIdx], users);
  const prevApprover = resolveApproverForStep(applicant, stepsConfig[stepIdx - 1], users);

  return Boolean(currentApprover && prevApprover && currentApprover.id === prevApprover.id);
};

/**
 * 対象申請の現在ステップにおける承認者かどうかを判定
 */
export const isUserCurrentApprover = (
  app: WorkflowApplication,
  user: User,
  users: User[] = []
): boolean => {
  if (!app || !user || app.status !== 'pending') return false;

  // 直接指定の単一承認者
  if (app.approver?.id === user.id) return true;

  // 多段階ステップのチェック
  if (app.stepsConfig && app.stepsConfig.length > 0) {
    const currentStepIdx = (app.currentStepIndex || 1) - 1;
    const step = app.stepsConfig[currentStepIdx];
    if (step) {
      if (step.approverType === 'specific_user' && step.specificUserId) {
        return step.specificUserId === user.id;
      }

      let targetLevel = step.supervisorLevel;
      if (!targetLevel) {
        if (step.approverType === 'supervisor_1') targetLevel = 1;
        else if (step.approverType === 'supervisor_2') targetLevel = 2;
        else targetLevel = currentStepIdx + 1;
      }

      if (app.applicant) {
        const sup = getSupervisorAtLevel(app.applicant, targetLevel, users);
        if (sup) return sup.id === user.id;

        const fallbackSup = getSupervisorAtLevel(app.applicant, 1, users);
        if (fallbackSup) return fallbackSup.id === user.id;
      }

      const adminUser = users.find(u => u.id === 'u4' || u.isAdmin);
      return adminUser?.id === user.id;
    }
  }

  return false;
};

