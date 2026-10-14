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

  window.dispatchEvent(new CustomEvent('teranago:color-theme-changed', { detail: theme }));
}

export function initColorTheme() {
  const theme = getSavedTheme();
  applyColorTheme(theme);
  return theme;
}

// ==========================================================================
// 文字の大きさ（フォントサイズ）設定: 方式A（ルートスケール連動方式）
// ==========================================================================

export type AppFontSize = 'small' | 'standard' | 'medium' | 'large';

export interface FontSizeOption {
  id: AppFontSize;
  label: string;       // ボタン等用 (例: '小', '標準', '中', '大')
  name: string;        // 名称 (例: '小（90%）')
  description: string; // 補足説明
  percentage: number;  // 90, 100, 110, 120
  cssScale: string;    // '90%', '100%', '110%', '120%'
  basePx: string;      // '14.4px', '16px', '17.6px', '19.2px'
  badgeText: string;   // アイコン横などの表記
}

export const FONT_SIZE_OPTIONS: FontSizeOption[] = [
  {
    id: 'small',
    label: '小',
    name: '小（コンパクト・90%）',
    description: '文字を控えめにし、一覧性を高めて多くの情報を表示します',
    percentage: 90,
    cssScale: '90%',
    basePx: '14.4px',
    badgeText: '90%',
  },
  {
    id: 'standard',
    label: '標準',
    name: '標準（デフォルト・100%）',
    description: '標準の文字サイズです（推奨・バランス重視）',
    percentage: 100,
    cssScale: '100%',
    basePx: '16px',
    badgeText: '100%',
  },
  {
    id: 'medium',
    label: '中',
    name: '中（やや大きめ・110%）',
    description: '文字をひと回り大きくし、読みやすさと視認性を高めます',
    percentage: 110,
    cssScale: '110%',
    basePx: '17.6px',
    badgeText: '110%',
  },
  {
    id: 'large',
    label: '大',
    name: '大（特大サイズ・120%）',
    description: '文字を大幅に拡大し、スマホや細かい文字が苦手な方でも見やすくします',
    percentage: 120,
    cssScale: '120%',
    basePx: '19.2px',
    badgeText: '120%',
  },
];

const FONT_SIZE_STORAGE_KEY = 'app_font_size';

export function getSavedFontSize(): AppFontSize {
  if (typeof window === 'undefined') return 'standard';
  const saved = localStorage.getItem(FONT_SIZE_STORAGE_KEY) as AppFontSize | null;
  if (saved && FONT_SIZE_OPTIONS.some((f) => f.id === saved)) {
    return saved;
  }
  return 'standard';
}

export function applyFontSize(fontSize: AppFontSize) {
  if (typeof window === 'undefined') return;
  localStorage.setItem(FONT_SIZE_STORAGE_KEY, fontSize);
  document.documentElement.setAttribute('data-font-size', fontSize);
  
  const found = FONT_SIZE_OPTIONS.find(f => f.id === fontSize) || FONT_SIZE_OPTIONS[1];
  // ルートの文字サイズを直接変更することでTailwindのrem基準の全体文字・余白が黄金比のままスケール
  document.documentElement.style.fontSize = found.cssScale;

  window.dispatchEvent(new CustomEvent('teranago:font-size-changed', { detail: fontSize }));
}

export function initFontSize(): AppFontSize {
  const size = getSavedFontSize();
  applyFontSize(size);
  return size;
}

