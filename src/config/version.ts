/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.20.1',
  date: '2026-11-20',
  releaseNumber: 1,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.20 #1 (JST)',
  description: 'GitHub Pages 並行稼働（teranago-sns/po & micchy-ken/teranago-sns-new）自動ベースパス判定対応（vite.config.ts / deploy.yml）'
} as const;
