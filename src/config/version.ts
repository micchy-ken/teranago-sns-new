/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.11.9',
  date: '2026.11.11',
  releaseNumber: 9,
  display: 'v2026.11.11 #9 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: 'マスターID/コード主軸化 Step1: 共通マスター解決ヘルパー(masterResolver.ts)新設、User型・dbo.UsersへのofficeId/divisionId/positionId追加と自動マイグレーション、AdminPanel・MemberSelector・userSortのIDベース照合対応'
};
