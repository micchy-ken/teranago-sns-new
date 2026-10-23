/**
 * TERANAGO SNS アプリケーションバージョン定義
 * 
 * 規約: バージョンアップ時は日付（JST）とその日のいくつめのバージョンか（releaseNumber）を更新する。
 * 例: 2026年10月14日の1回目の更新 -> v2026.10.14 #1 (2026.10.14.1)
 */

export interface AppVersionInfo {
  version: string;        // 例: '2026.10.14.1'
  date: string;           // 例: '2026-10-14'
  releaseNumber: number;  // その日のリリース番号 (1, 2, 3...)
  display: string;        // 画面表示用 (例: 'v2026.10.14 #1')
  description?: string;   // バージョンの主な更新内容
}

export const APP_VERSION: AppVersionInfo = {
  version: '2026.10.23.9',
  date: '2026-10-23',
  releaseNumber: 9,
  display: 'v2026.10.23 #9',
  description: '回覧板アンケート・意思決定投票機能の実装：選択肢ごとの理由コメント必須化、回答期限までの自動ピン留め、マイページ（初期・スマホ画面）での未回答バナー導線に対応',
};


