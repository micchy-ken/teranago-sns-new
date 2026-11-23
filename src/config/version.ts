/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.24.1',
  date: '2026-11-24',
  releaseNumber: 1,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.24 #1 (JST)',
  description: '写真報告書一覧の縮小サムネイル・チャット写真・カレンダー設定アイコンの認証トークン付きURL解決を統一修正'
} as const;
