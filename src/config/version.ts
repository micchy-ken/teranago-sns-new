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
  version: '2026.10.26.15',
  date: '2026-10-26',
  releaseNumber: 15,
  display: 'v2026.10.26 #15',
  description: 'カレンダーチーム日表示のメンバー毎全件探索（75,000回ループ）撤去および O(1) 辞書引き化（日付移動処理の爆速化・3秒➔数ミリ秒化）',
};


