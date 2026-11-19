/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.19.6',
  date: '2026-11-19',
  releaseNumber: 6,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.19 #6 (JST)',
  description: 'マイタスクサマリーのSQL軽量絞り込み・インデックス追加・読み込み時同期書込廃止・レスポンス軽量化・重複API取得の解消'
} as const;
