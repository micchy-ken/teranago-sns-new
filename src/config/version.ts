/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.12.12',
  date: '2026.11.12',
  releaseNumber: 12,
  display: 'v2026.11.12 #12 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: '管理者メニューUI改善（マスターの下に「様式」セクションを新設、保守日報様式移動および点検項目マスター設定へのアクセス追加）'
};

