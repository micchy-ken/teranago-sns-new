/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.17.3',
  date: '2026.11.17',
  releaseNumber: 3,
  display: 'v2026.11.17 #3 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: '「プロジェクト」タブ フェーズ2完了（マイページ サマリー＆マイタスクウィジェット・アサイン/コメント時のWeb Push＆メール通知連携・伝言メモ/チャットからのワンクリックタスク化）'
};

