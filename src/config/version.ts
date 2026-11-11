/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.11.10',
  date: '2026.11.11',
  releaseNumber: 10,
  display: 'v2026.11.11 #10 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: 'マスターID/コード主軸化 Step2: 掲示板(Board/TopicCreateModal/TopicDetailModal)・スケジュール管理(Calendar/MobileTeamSettingsModal/EventModal)・通知判定(notifications.ts)のマスターID照合＆「営業」と「保守営業」の厳密区別対応'
};
