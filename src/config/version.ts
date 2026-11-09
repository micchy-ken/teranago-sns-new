/**
 * TERANAGO SNS アプリケーションバージョン定義
 * 
 * 規約: バージョンアップ時は日付（JST）とその日のいくつめのバージョンか（releaseNumber）を更新する。
 * 例: 2026年10月14日の1回目の更新 -> v2026.10.14 #1 (2026.10.14.1)
 */

export interface AppVersionInfo {
  version: string;        // 例: '2026.10.29.1'
  date: string;           // 例: '2026-10-29'
  releaseNumber: number;  // その日のリリース番号 (1, 2, 3...)
  display: string;        // 画面表示用 (例: 'v2026.10.29 #1 (JST)')
  timeZone: string;       // タイムゾーン明記
  description?: string;   // バージョンの主な更新内容
}

export const APP_VERSION: AppVersionInfo = {
  version: '2026.11.09.4',
  date: '2026-11-09',
  releaseNumber: 4,
  display: 'v2026.11.09 #4 (JST)',
  timeZone: '日本標準時 (JST / UTC+09:00)',
  description: '保守日報・週報の上長承認（最終承認・回覧・差し戻し）時に作成者(author / author_id)が上長ですり替わってしまう不具合を完全修正。フロントエンド・サーバー側（API/SQL Server/ファイルDB）両面で原本作成者の厳格保持を徹底',
};

/**
 * 日本標準時(JST)のDateオブジェクトを取得
 */
export function getAppVersionJstDate(): Date {
  return new Date(`${APP_VERSION.date}T00:00:00+09:00`);
}


