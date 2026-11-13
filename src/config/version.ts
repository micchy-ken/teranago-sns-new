/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.13.4',
  date: '2026.11.13',
  releaseNumber: 4,
  display: 'v2026.11.13 #4 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: 'ヘッダー右上の見た目設定を1つに統合（文字の大きさ設定＋カラー設定）し、通知ウィンドウのサイズ選択・記憶機能を追加'
};

