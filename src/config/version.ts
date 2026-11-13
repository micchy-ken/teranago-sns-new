/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.12.17',
  date: '2026.11.12',
  releaseNumber: 17,
  display: 'v2026.11.12 #17 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: '現在地マップの初期表示時にチーム全員が極力収まるように表示位置・縮尺を自動調整する機能を追加'
};

