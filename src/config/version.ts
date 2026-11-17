/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.17.8',
  date: '2026-11-17',
  releaseNumber: 8,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.17 #8 (JST)',
  description: 'getter-only 環境での window.fetch 上書き例外 (真っ白画面) 修正'
} as const;
