/**
 * アプリケーションのバージョン情報定義
 * 
 * ルール:
 * - 日付は日本標準時 (JST / UTC+9) 基準の YYYY.MM.DD
 * - releaseNumber はその日の何回目のアップデートかを示す番号 (#1, #2, #3...)
 * - 機能追加・バグ修正・仕様変更のたびに必ず更新すること
 */
export const APP_VERSION = {
  version: '2026.11.16.3',
  date: '2026.11.16',
  releaseNumber: 3,
  display: 'v2026.11.16 #3 (JST)',
  timeZone: 'Asia/Tokyo (JST)',
  description: '資産管理テーブルのタイトル行ソート・列幅ドラッグ変更・種類別の個人設定記憶（「この並びを記憶する」＆リセットボタン）・共有リンク並び順引き継ぎ対応'
};

