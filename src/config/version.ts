/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.11.11',
  date: '2026.11.11',
  releaseNumber: 11,
  display: 'v2026.11.11 #11 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: 'マスターID/コード主軸化 Step3: 日報・週報(DailyReport)・保守日報(MaintenanceDailyReport)・上長承認チェーン(supervisorChain.ts)・保守拠点設定(MaintenanceOfficeConfigAdmin/masters.js)のマスターID/役職level照合対応'
};
