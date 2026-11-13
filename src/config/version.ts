/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.13.1',
  date: '2026.11.13',
  releaseNumber: 1,
  display: 'v2026.11.13 #1 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: 'AGENTS.md にバージョン表記の日本時間 (JST) 厳守ルールを追記し、バージョンを JST 日付基準へ改訂'
};

