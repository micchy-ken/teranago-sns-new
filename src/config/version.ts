/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.17.10',
  date: '2026-11-17',
  releaseNumber: 10,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.17 #10 (JST)',
  description: '操作マニュアルに「やること別（目的別）クイック操作ガイド」を追加'
} as const;
