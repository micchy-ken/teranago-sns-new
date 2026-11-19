/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.19.2',
  date: '2026-11-19',
  releaseNumber: 2,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.19 #2 (JST)',
  description: '日程調整の未確定再編集機能（PUT）・未確定調整の削除対応・確定済み編集不可ガードおよび通知制御'
} as const;
