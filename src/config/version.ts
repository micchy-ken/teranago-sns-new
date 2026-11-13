/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.13.11',
  date: '2026.11.13',
  releaseNumber: 11,
  display: 'v2026.11.13 #11 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: '資産管理のPC項目設定およびCSVインポートをNotion PC一覧CSV形式（機種名・導入日・タイプ・Officeライセンス・メモリ・HDD・MSアカウント・MSパスワード・確認日・eset等）に対応'
};

