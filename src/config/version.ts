/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.12.11',
  date: '2026.11.12',
  releaseNumber: 11,
  display: 'v2026.11.12 #11 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: 'ブラウザWeb Speech APIによる音声入力ボタン機能の追加（点検報告書特記事項・週報/日報・チャット文字入力欄での音声テキスト変換）'
};

