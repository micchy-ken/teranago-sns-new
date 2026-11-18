/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.18.3',
  date: '2026-11-18',
  releaseNumber: 3,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.18 #3 (JST)',
  description: '資産管理の走行距離を運転記録簿の最新値から自動取得（未記録時は空白）に統一'
} as const;
