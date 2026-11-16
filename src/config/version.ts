/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.16.6',
  date: '2026.11.16',
  releaseNumber: 6,
  display: 'v2026.11.16 #6 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: 'カレンダー共有・お気に入り保存時のマイグループ（groupId）対応、およびユーザー設定更新時に直前の遷移条件へ強制巻き戻りしていた不具合を修正'
};

