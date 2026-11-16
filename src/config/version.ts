/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.16.2',
  date: '2026.11.16',
  releaseNumber: 2,
  display: 'v2026.11.16 #2 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: '資産管理（一覧・絞り込み＆単体資産）のフルクエリパラメータ・共有リンクコピー・お気に入り自動ストック対応'
};

