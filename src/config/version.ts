/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.18.9',
  date: '2026-11-18',
  releaseNumber: 9,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.18 #9 (JST)',
  description: '通知・マイページの一時的な未読数字点滅解消、資産管理の開発中バッジ削除、資産台帳からの共用資産除外に対応'
} as const;
