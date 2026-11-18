/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.18.4',
  date: '2026-11-18',
  releaseNumber: 4,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.18 #4 (JST)',
  description: '点検チェックリスト項目を資産種類（車両・PC等）単位での一括設定に変更'
} as const;
