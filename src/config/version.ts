/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.19.1',
  date: '2026-11-19',
  releaseNumber: 1,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.19 #1 (JST)',
  description: 'マイページ上部サマリーカードのレスポンシブ最適化（幅狭時のアイコン＋バッジ自動切替・アイコン重複解消）'
} as const;
