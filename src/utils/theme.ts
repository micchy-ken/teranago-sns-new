export type ColorTheme =
  | 'soft'
  | 'sage'
  | 'terracotta'
  | 'nordic'
  | 'lavender'
  | 'muted'
  | 'monochrome'
  | 'vivid';

export interface ThemeOption {
  id: ColorTheme;
  name: string;
  category: 'tinted' | 'neutral';
  description: string;
  bgPreview: string; // 背景色のプレビュー色 (HEX)
  bgLabel: string; // 背景色の説明（例: ほんのりセージ緑）
  previewColors: string[]; // スケジュール、掲示板、伝言メモのアクセントカラー
}

export const THEME_OPTIONS: ThemeOption[] = [
  {
    id: 'soft',
    name: 'ソフト（くすみ・マイルド）',
    category: 'neutral',
    description: '彩度を適度に抑えた、上品で目に優しいトーン（推奨標準）',
    bgPreview: '#f5f7fa',
    bgLabel: 'ソフトオフホワイト',
    previewColors: ['#d97706', '#5752d1', '#cc2b4e'],
  },
  {
    id: 'sage',
    name: 'セージ・アッシュ（淡緑背景）',
    category: 'tinted',
    description: '淡い抹茶・セージグリーンの背景。目に最も優しくリラックスできる配色',
    bgPreview: '#edf4ee',
    bgLabel: '淡いセージグリーン背景',
    previewColors: ['#887a58', '#4d665b', '#856968'],
  },
  {
    id: 'terracotta',
    name: 'テラコッタ・サンド（温和・紙風背景）',
    category: 'tinted',
    description: '生成り・和紙のような温かみのあるベージュ背景。ブルーライト感を抑えたトーン',
    bgPreview: '#f8f4ec',
    bgLabel: '温かみのある生成り・ベージュ背景',
    previewColors: ['#af6432', '#4f5d75', '#9c4e4e'],
  },
  {
    id: 'nordic',
    name: 'ノルディック・スレート（淡青背景）',
    category: 'tinted',
    description: '澄んだ淡いアイスブルーグレーの背景。北欧風の知的で清潔感のあるトーン',
    bgPreview: '#eaf1f7',
    bgLabel: '淡いブルーグレー背景',
    previewColors: ['#94723c', '#466587', '#8e525d'],
  },
  {
    id: 'lavender',
    name: 'ラベンダー・フォグ（淡紫背景）',
    category: 'tinted',
    description: 'ほんのり紫みを感じるグレイッシュミスト背景。上品で静けさのあるトーン',
    bgPreview: '#f4eff8',
    bgLabel: '淡いラベンダーミスト背景',
    previewColors: ['#996f48', '#5d507d', '#8c4c68'],
  },
  {
    id: 'muted',
    name: 'スモーキー・パステル（淡灰背景）',
    category: 'tinted',
    description: '彩度をグッと落としたくすみニュアンスカラーと微淡グレー背景',
    bgPreview: '#eef1f5',
    bgLabel: '微淡スモーキーグレー背景',
    previewColors: ['#9d6d39', '#5a6288', '#a34e60'],
  },
  {
    id: 'monochrome',
    name: 'シック・モノトーン',
    category: 'neutral',
    description: '色味の主張を極限まで抑えた、灰調の洗練されたトーン',
    bgPreview: '#f1f3f5',
    bgLabel: 'クールグレー背景',
    previewColors: ['#52525b', '#4b5563', '#57534e'],
  },
  {
    id: 'vivid',
    name: '鮮やか（標準ビビッド）',
    category: 'neutral',
    description: 'パキッとした従来通りの標準原色カラーと白背景',
    bgPreview: '#f8fafc',
    bgLabel: '標準白背景',
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
  return 'soft';
}

export function applyColorTheme(theme: ColorTheme) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.setAttribute('data-color-theme', theme);
  
  // body要素の背景色も同時に設定して隙間やバウンススクロール時にも違和感が出ないようにする
  const found = THEME_OPTIONS.find(t => t.id === theme);
  if (found) {
    document.body.style.backgroundColor = found.bgPreview;
  }
}

export function initColorTheme() {
  const theme = getSavedTheme();
  applyColorTheme(theme);
  return theme;
}
