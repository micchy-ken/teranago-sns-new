export type ColorTheme =
  | 'dark'
  | 'midnight'
  | 'sepia'
  | 'gray'
  | 'pastel'
  | 'earth'
  | 'ocean'
  | 'warm'
  | 'soft'
  | 'vivid'
  // 互換キー (旧設定から自動マッピング)
  | 'sage'
  | 'terracotta'
  | 'nordic'
  | 'lavender'
  | 'muted'
  | 'monochrome';

export interface ThemeOption {
  id: ColorTheme;
  name: string;
  category: 'dark' | 'classic' | 'color' | 'standard';
  description: string;
  bgPreview: string; // 背景色のプレビュー色 (HEX)
  cardPreview: string; // カード表面のプレビュー色 (HEX)
  bgLabel: string; // 背景色の説明（例: 漆黒ダーク、セピア羊皮紙など）
  previewColors: string[]; // スケジュール、掲示板、伝言メモのアクセントカラー
  isDark?: boolean;
}

export const THEME_OPTIONS: ThemeOption[] = [
  // 🌙 1. ダーク＆大人系
  {
    id: 'dark',
    name: 'ダークモード（漆黒・夜間）',
    category: 'dark',
    description: '漆黒とスレートの深みある夜間仕様。眩しさを抑え長時間の作業に最適（高コントラスト）',
    bgPreview: '#0a0e17',
    cardPreview: '#141b2a',
    bgLabel: '漆黒スレートダーク',
    previewColors: ['#fbbf24', '#818cf8', '#fb7185'],
    isDark: true,
  },
  {
    id: 'midnight',
    name: '大人なミッドナイト（濃紺・ゴールド）',
    category: 'dark',
    description: '深遠な夜空の濃紺とシャンパンゴールドが調和した、上質でラグジュアリーな大人トーン',
    bgPreview: '#090e1a',
    cardPreview: '#11182a',
    bgLabel: '深遠ミッドナイトネイビー',
    previewColors: ['#eab308', '#60a5fa', '#f43f5e'],
    isDark: true,
  },

  // 📜 2. クラシック＆シック
  {
    id: 'sepia',
    name: 'セピア・アンティーク（書斎・羊皮紙）',
    category: 'classic',
    description: '羊皮紙や古書のような温かみあるセピア。ブルーライトを低減し書斎のような落ち着き',
    bgPreview: '#f3ebe0',
    cardPreview: '#fdfaf3',
    bgLabel: '温もりセピア羊皮紙',
    previewColors: ['#b45309', '#4f5f78', '#991b1b'],
    isDark: false,
  },
  {
    id: 'gray',
    name: 'シック・グレイ（ミニマル・スチール）',
    category: 'classic',
    description: '色味を削ぎ落とし、クールグレーとシャープな境界線で構成したモダン建築風トーン',
    bgPreview: '#e4e7eb',
    cardPreview: '#ffffff',
    bgLabel: 'クールスチールグレー',
    previewColors: ['#85612f', '#3b516b', '#7c3d49'],
    isDark: false,
  },

  // 🎨 3. カラー＆アース
  {
    id: 'earth',
    name: 'アースカラー（フォレスト＆オリーブ）',
    category: 'color',
    description: '穏やかな苔や森林、大地（テラコッタ）の安らぎを感じる自然派リフレッシュ配色',
    bgPreview: '#e4eae0',
    cardPreview: '#fafcfa',
    bgLabel: 'オリーブモスグリーン',
    previewColors: ['#b45309', '#15803d', '#9f1239'],
    isDark: false,
  },
  {
    id: 'ocean',
    name: '寒色（清涼オーシャンブルー）',
    category: 'color',
    description: '澄んだ青空と海を思わせる爽快感。知的で清潔感があり、集中力を高めるトーン',
    bgPreview: '#dbe9f5',
    cardPreview: '#ffffff',
    bgLabel: '爽快アイススカイブルー',
    previewColors: ['#ca8a04', '#0284c7', '#be185d'],
    isDark: false,
  },
  {
    id: 'warm',
    name: '暖色（サンセットアンバー＆オレンジ）',
    category: 'color',
    description: '夕暮れの陽だまりのような温もりと活気。親しみやすくチームの活力を高める配色',
    bgPreview: '#f9eade',
    cardPreview: '#fffbf8',
    bgLabel: '温もりサンセットアプリコット',
    previewColors: ['#d97706', '#ea580c', '#dc2626'],
    isDark: false,
  },
  {
    id: 'pastel',
    name: 'パステル（マカロン・ライラック）',
    category: 'color',
    description: '柔らかなライラックミストとマカロンカラー。文字はディーププラムで視認性抜群',
    bgPreview: '#f5ecf7',
    cardPreview: '#ffffff',
    bgLabel: 'ライラックパステルミスト',
    previewColors: ['#ea580c', '#7c3aed', '#db2777'],
    isDark: false,
  },

  // ⚪ 4. スタンダード
  {
    id: 'soft',
    name: 'ソフト（くすみ・マイルド【推奨標準】）',
    category: 'standard',
    description: '彩度を適度に抑えた、上品で目に優しいニュートラルトーン（推奨標準）',
    bgPreview: '#f5f7fa',
    cardPreview: '#ffffff',
    bgLabel: 'ソフトオフホワイト',
    previewColors: ['#d97706', '#5752d1', '#cc2b4e'],
    isDark: false,
  },
  {
    id: 'vivid',
    name: '鮮やか（標準ビビッド・白背景）',
    category: 'standard',
    description: 'パキッとした従来通りの標準原色カラーとピュアホワイト背景',
    bgPreview: '#ffffff',
    cardPreview: '#ffffff',
    bgLabel: '標準ピュアホワイト',
    previewColors: ['#f59e0b', '#6366f1', '#f43f5e'],
    isDark: false,
  },
];

// 旧IDから新IDへの互換マップ
export const THEME_ALIAS_MAP: Record<string, ColorTheme> = {
  sage: 'earth',
  terracotta: 'warm',
  nordic: 'ocean',
  lavender: 'pastel',
  muted: 'gray',
  monochrome: 'gray',
};

const STORAGE_KEY = 'app_color_theme';

export function getSavedTheme(): ColorTheme {
  if (typeof window === 'undefined') return 'soft';
  const saved = localStorage.getItem(STORAGE_KEY) as ColorTheme | null;
  if (saved) {
    if (THEME_OPTIONS.some((t) => t.id === saved)) {
      return saved;
    }
    if (THEME_ALIAS_MAP[saved]) {
      return THEME_ALIAS_MAP[saved];
    }
  }
  return 'soft';
}

export function applyColorTheme(rawTheme: ColorTheme) {
  if (typeof window === 'undefined') return;
  
  // 互換キーの解決
  const theme = THEME_ALIAS_MAP[rawTheme] || rawTheme;
  const found = THEME_OPTIONS.find((t) => t.id === theme) || THEME_OPTIONS[0];

  localStorage.setItem(STORAGE_KEY, theme);
  document.documentElement.setAttribute('data-color-theme', theme);
  
  const isDark = Boolean(found.isDark);
  document.documentElement.classList.toggle('dark', isDark);
  document.documentElement.style.colorScheme = isDark ? 'dark' : 'light';
  
  // body要素の背景色も同時に設定して隙間やバウンススクロール時にも違和感が出ないようにする
  document.body.style.backgroundColor = found.bgPreview;

  // モバイルのブラウザヘッダー色（theme-color）も連動
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  if (themeMeta) {
    themeMeta.setAttribute('content', found.bgPreview);
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

