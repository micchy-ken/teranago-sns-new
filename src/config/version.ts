/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.24.2',
  date: '2026-11-24',
  releaseNumber: 2,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.24 #2 (JST)',
  description: '添付ファイル・文書・外部ファイルプレビューのインメモリLRUキャッシュ（最大20件/200MB）・初回DL進捗表示・キャッシュ流用ダウンロードを一括実装'
} as const;
