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
  version: '2026.10.28.12',
  date: '2026-10-28',
  releaseNumber: 12,
  display: 'v2026.10.28 #12',
  description: '安否確認・気象庁自動連動設定のファイルおよびDB二重永続化対応（サーバー再起動・リビルド後の設定自動復元）',
};


