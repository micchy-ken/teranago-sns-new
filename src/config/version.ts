/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.12.9',
  date: '2026.11.12',
  releaseNumber: 9,
  display: 'v2026.11.12 #9 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: 'マイページのチャットルーム一覧UI改善（ルームアイコン/相手アバター表示、ダイレクトトーク相手情報・所属明記、コンパクト＆スッキリ整列レイアウト）'
};

