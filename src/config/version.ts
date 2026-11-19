/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.19.4',
  date: '2026-11-19',
  releaseNumber: 4,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.19 #4 (JST)',
  description: 'プロジェクトのタスク割り当て・コメントをヘッダーベル通知＆サイドバー未読バッジに対応、Web Push32文字以内タグ安全化・端末別失敗ログ強化'
} as const;
