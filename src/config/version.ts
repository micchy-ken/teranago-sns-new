/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.17.1',
  date: '2026.11.17',
  releaseNumber: 1,
  display: 'v2026.11.17 #1 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: '事務・営業・設計向け「プロジェクト」タブ新設（フェーズ1-①：全API一括実装＋マイボード/チームボード/カンバン/完了折り畳み/共有URL＆お気に入り対応）'
};

