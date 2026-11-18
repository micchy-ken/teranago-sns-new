/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.18.8',
  date: '2026-11-18',
  releaseNumber: 8,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.18 #8 (JST)',
  description: '点検予定確定時の点検内容空白化および車検確定時の車検満期自動更新に対応'
} as const;
