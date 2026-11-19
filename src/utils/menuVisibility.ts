import { MenuVisibilitySettings, ToggleableMenuKey, User } from '../types';

export interface ToggleableMenuDefinition {
  key: ToggleableMenuKey;
  label: string;
  maintenanceLabel?: string;
  description: string;
  mypageSectionId?: 'projects' | 'reports';
  mypageCardLabel?: string;
}

export const TOGGLEABLE_MENUS: readonly ToggleableMenuDefinition[] = [
  {
    key: 'projects',
    label: 'プロジェクト',
    description: 'プロジェクトボード・タスク管理メニューおよびマイページカードの表示',
    mypageSectionId: 'projects',
    mypageCardLabel: 'マイタスク・プロジェクト',
  },
  {
    key: 'daily_report',
    label: '週報',
    maintenanceLabel: '保守日報',
    description: '週報（保守部門は保守日報）メニューおよびマイページカードの表示',
    mypageSectionId: 'reports',
    mypageCardLabel: '日報・週報',
  },
  {
    key: 'inspection_report',
    label: '点検報告書',
    description: '点検報告書の作成・一覧・閲覧メニューの表示',
  },
  {
    key: 'site_management',
    label: '現場管理',
    description: '現場スケジュール・工程・作業員管理メニューの表示',
  },
  {
    key: 'assets',
    label: '資産管理',
    description: '社有車・機器・備品などの資産管理メニューの表示',
  },
] as const;

export const TOGGLEABLE_MENU_KEYS: readonly ToggleableMenuKey[] = TOGGLEABLE_MENUS.map((m) => m.key);

export const DEFAULT_MENU_VISIBILITY: Required<MenuVisibilitySettings> = {
  projects: true,
  daily_report: true,
  inspection_report: true,
  site_management: true,
  assets: true,
};

export const isToggleableMenuKey = (tabId: string): tabId is ToggleableMenuKey => {
  return (TOGGLEABLE_MENU_KEYS as readonly string[]).includes(tabId);
};

export const getMenuVisibilitySettings = (
  user?: Pick<User, 'preferences'> | null
): Required<MenuVisibilitySettings> => {
  const raw = user?.preferences?.menuVisibility;
  return {
    projects: raw?.projects !== false,
    daily_report: raw?.daily_report !== false,
    inspection_report: raw?.inspection_report !== false,
    site_management: raw?.site_management !== false,
    assets: raw?.assets !== false,
  };
};

export const isOptionalMenuVisible = (
  user: Pick<User, 'preferences'> | undefined | null,
  menuKey: ToggleableMenuKey
): boolean => {
  return user?.preferences?.menuVisibility?.[menuKey] !== false;
};

export const isMyPageSectionVisibleByMenu = (
  user: Pick<User, 'preferences'> | undefined | null,
  sectionId: string
): boolean => {
  if (sectionId === 'projects') {
    return isOptionalMenuVisible(user, 'projects');
  }
  if (sectionId === 'reports') {
    return isOptionalMenuVisible(user, 'daily_report');
  }
  return true;
};

export const getHiddenMyPageSectionIdsByMenu = (
  user: Pick<User, 'preferences'> | undefined | null
): string[] => {
  const hidden: string[] = [];
  if (!isOptionalMenuVisible(user, 'projects')) {
    hidden.push('projects');
  }
  if (!isOptionalMenuVisible(user, 'daily_report')) {
    hidden.push('reports');
  }
  return hidden;
};

export const getToggleableMenuLabel = (
  def: ToggleableMenuDefinition,
  user?: Pick<User, 'department' | 'division'> | null
): string => {
  if (def.maintenanceLabel) {
    const isMaintenance =
      Boolean(user?.department && user.department.includes('保守')) ||
      Boolean(user?.division && user.division.includes('保守'));
    if (isMaintenance) return def.maintenanceLabel;
  }
  return def.label;
};
