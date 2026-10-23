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
  version: '2026.10.23.8',
  date: '2026-10-23',
  releaseNumber: 8,
  display: 'v2026.10.23 #8',
  description: '建具番号(tateguNo)表示の改修：機種名(CN-15T等)の誤抽出を防止し、tateguNo/建具番号(AD1等)の正確なバインド・自動同期・インライン編集に対応',
};


