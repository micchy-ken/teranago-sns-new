/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.19.9',
  date: '2026-11-19',
  releaseNumber: 9,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.19 #9 (JST)',
  description: 'プロジェクトの資料・Todo種別を固定化（リスト表示の資料ステータス固定、詳細モーダル上部タブの切替廃止、資料⇔Todo間の移動禁止）'
} as const;
