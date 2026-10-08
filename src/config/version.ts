/**
 * TERANAGO SNS アプリケーションバージョン定義
 * 
 * 規約: バージョンアップ時は日付（JST）とその日のいくつめのバージョンか（releaseNumber）を更新する。
 * 例: 2026年10月8日の1回目の更新 -> v2026.10.08 #1 (2026.10.08.1)
 */

export interface AppVersionInfo {
  version: string;        // 例: '2026.10.08.4'
  date: string;           // 例: '2026-10-08'
  releaseNumber: number;  // その日のリリース番号 (1, 2, 3...)
  display: string;        // 画面表示用 (例: 'v2026.10.08 #4')
  description?: string;   // バージョンの主な更新内容
}

export const APP_VERSION: AppVersionInfo = {
  version: '2026.10.08.4',
  date: '2026-10-08',
  releaseNumber: 4,
  display: 'v2026.10.08 #4',
  description: 'ワークフロー新規申請作成時に入力内容が定期同期でリセットされる不具合の修正',
};
