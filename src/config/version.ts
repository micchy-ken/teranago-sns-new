/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.17.13',
  date: '2026-11-17',
  releaseNumber: 13,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.17 #13 (JST)',
  description: 'プロジェクト共有ボードのメンバー保存および dbo.ProjectBoards 永続化・スキーマ自動補正の修正'
} as const;
