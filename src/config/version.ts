/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.17.4',
  date: '2026.11.17',
  releaseNumber: 4,
  display: 'v2026.11.17 #4 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: 'セキュリティ強化 ステップ1（全APIセッショントークン認証・IDOR防止・管理者権限サーバー検証・ログイン試行制限）'
};


