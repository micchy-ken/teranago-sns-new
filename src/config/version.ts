/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.13.13',
  date: '2026.11.13',
  releaseNumber: 13,
  display: 'v2026.11.13 #13 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: '資産管理の拠点絞り込みを資産台帳表示時のみのマスタ連動ドロップダウン（検索バー統合・自分の資産時は自動オフ）へ変更'
};

