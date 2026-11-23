/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.23.1',
  date: '2026-11-23',
  releaseNumber: 1,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.23 #1 (JST)',
  description: '本番・旧環境両対応のユーザーアイコン表示修正（/api/uploads正規化・自動フォールバック・最新トークン差し替え・SWエラーキャッシュ防止）'
} as const;
