/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.11.12',
  date: '2026.11.11',
  releaseNumber: 12,
  display: 'v2026.11.11 #12 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: 'マスターID/コード主軸化 Step4(完了): 点検予定表(InspectionScheduler.tsx)・安否確認(SafetyConfirmation.tsx)の拠点・事業部マスターID主軸照合＆兼務部署対応'
};
