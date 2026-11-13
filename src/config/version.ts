/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.13.2',
  date: '2026.11.13',
  releaseNumber: 2,
  display: 'v2026.11.13 #2 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: '共有ボタン押下時の個人お気に入り（ブックマーク）自動ストック・ピン留め・ワンボタン削除・ヘッダーからの即遷移機能を実装'
};

