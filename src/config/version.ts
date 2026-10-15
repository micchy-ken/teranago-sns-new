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
  version: '2026.10.15.4',
  date: '2026-10-15',
  releaseNumber: 4,
  display: 'v2026.10.15 #4',
  description: 'スケジュール登録の日付時間エリア再構成（開始・終了を1行目、日付と時間を2行目にして日付幅拡大、「時・分」表記削除、繰り返しトグルの区分行移動＆時間下展開）',
};
