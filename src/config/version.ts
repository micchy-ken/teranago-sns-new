/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.12.5',
  date: '2026.11.12',
  releaseNumber: 5,
  display: 'v2026.11.12 #5 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: '個人カレンダーでの対象メンバー選択機能（所属・拠点・部署・マイグループ・個人名モーダル＆プルダウン）および社員詳細ポップアップの「予定を見る」連動対応'
};

