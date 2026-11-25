/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.25.6',
  date: '2026-11-25',
  releaseNumber: 6,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.25 #6 (JST)',
  description: '通知テンプレート（Web Push・メール）のNAS集約永続化API（/api/notification-templates）および管理者メニューからのリアルタイム編集・保存・初期値リセット機能を実装'
} as const;
