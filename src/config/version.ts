/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.12.6',
  date: '2026.11.12',
  releaseNumber: 6,
  display: 'v2026.11.12 #6 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: '社員詳細ポップアップの「予定を見る」および現場管理の現場情報からのスケジュール遷移先を該当メンバーの所属チーム予定表へ変更（個人カレンダーの対象選択モーダルは維持）'
};

