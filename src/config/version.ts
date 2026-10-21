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
  version: '2026.10.20.5',
  date: '2026-10-20',
  releaseNumber: 5,
  display: 'v2026.10.20 #5',
  description: 'Synology NAS向けAPIサーバー（server.js）のセキュリティ強化（CORS制限・SSRF防御・セキュリティ応答ヘッダー・レートリミット・10MBボディ上限）対応',
};

