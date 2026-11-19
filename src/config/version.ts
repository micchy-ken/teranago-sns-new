/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.19.11',
  date: '2026-11-19',
  releaseNumber: 11,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.19 #11 (JST)',
  description: '管理者メニューに主要メニュー（プロジェクト・週報・点検報告書・現場管理・資産管理）の拠点・部署別一括ON/OFF機能を追加'
} as const;
