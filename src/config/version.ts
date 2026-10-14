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
  version: '2026.10.14.11',
  date: '2026-10-14',
  releaseNumber: 11,
  display: 'v2026.10.14 #11',
  description: 'カラーテーマの大幅刷新：ダークモード、大人なミッドナイト、セピア、シック・グレイ、パステル、アースカラー、寒色オーシャン、暖色サンセット等、高視認性を維持した劇的変化テーマの全面導入',
};
