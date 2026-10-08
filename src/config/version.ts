/**
 * TERANAGO SNS アプリケーションバージョン定義
 * 
 * 規約: バージョンアップ時は日付（JST）とその日のいくつめのバージョンか（releaseNumber）を更新する。
 * 例: 2026年10月8日の1回目の更新 -> v2026.10.08 #1 (2026.10.08.1)
 */

export interface AppVersionInfo {
  version: string;        // 例: '2026.10.08.2'
  date: string;           // 例: '2026-10-08'
  releaseNumber: number;  // その日のリリース番号 (1, 2, 3...)
  display: string;        // 画面表示用 (例: 'v2026.10.08 #2')
  description?: string;   // バージョンの主な更新内容
}

export const APP_VERSION: AppVersionInfo = {
  version: '2026.10.08.2',
  date: '2026-10-08',
  releaseNumber: 2,
  display: 'v2026.10.08 #2',
  description: '日程調整の空き枠自動抽出SQLスキーマ整合化・イベント自動登録スキーマ同期修正',
};
