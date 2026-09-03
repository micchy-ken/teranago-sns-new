export type ColorTheme = 'soft' | 'muted' | 'sage' | 'monochrome' | 'vivid';

export interface ThemeOption {
  id: ColorTheme;
  name: string;
  description: string;
  previewColors: string[]; // 表示用カラーサンプルのHex/Class
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'soft',
    name: 'ソフト（くすみ・マイルド）',
    description: '彩度を適度に抑えた、上品で目に優しいトーン（推奨）',
    previewColors: ['#d97706', '#4f46e5', '#e11d48'],
  },
  {
    id: 'muted',
    name: 'スモーキー・パステル',
    description: '彩度を大きく落とした、落ち着いたニュアンスカラー',
    previewColors: ['#a8784a', '#606982', '#9e6070'],
  },
  {
    id: 'sage',
    name: 'セージ・アッシュ',
    description: 'オリーブ・アッシュ調のシックでナチュラルなトーン',
    previewColors: ['#8e805d', '#53685e', '#886968'],
  },
  {
    id: 'monochrome',
    name: 'シック・モノトーン',
    description: '色味の主張を極限まで抑えた洗練されたカラー',
    previewColors: ['#52525b', '#4b5563', '#64748b'],
  },
  {
    id: 'vivid',
    name: '鮮やか（標準）',
    description: 'パキッとした従来通りの標準カラー',
    previewColors: ['#f59e0b', '#6366f1', '#f43f5e'],
  },
];

const STORAGE_KEY = 'app_color_theme';

export function getSavedTheme(): ColorTheme {
  if (typeof window === 'undefined') return 'soft';
  const saved = localStorage.getItem(STORAGE_KEY) as ColorTheme | null;
  if (saved && THEME_OPTIONS.some((t) => t.id === saved)) {
    return saved;
  }
  return 'soft'; // デフォルトは落ち着いたくすみカラー
}

export function applyColorTheme(theme: ColorTheme) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.setAttribute('data-color-theme', theme);
}

export function initColorTheme() {
  const theme = getSavedTheme();
  applyColorTheme(theme);
  return theme;
}
