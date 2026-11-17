/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.17.6',
  date: '2026-11-17',
  releaseNumber: 6,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.17 #6 (JST)',
  description: 'セキュリティ強化 Step3完: CORS完全一致リスト化・ファイルAPI認証必須化・パストラバーサル防止'
} as const;
