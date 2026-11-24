/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.25.1',
  date: '2026-11-25',
  releaseNumber: 1,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.25 #1 (JST)',
  description: '旧環境（開発評価用）のWeb Push通知完全停止・自動解除化、本番ログイン時の自動再同期＆解除直後の自動復活バグ修正'
} as const;
