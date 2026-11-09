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
  version: '2026.11.09.3',
  date: '2026-11-09',
  releaseNumber: 3,
  display: 'v2026.11.09 #3 (JST)',
  timeZone: '日本標準時 (JST / UTC+09:00)',
  description: '提出済みの週報・日報におけるカードおよびモーダルのアクションボタンを「開く・編集」から「確認・承認」（確認済は「確認・閲覧」、下書きは「開く・編集」）に変更し、ステータスに応じた適切な導線へ最適化',
};

/**
 * 日本標準時(JST)のDateオブジェクトを取得
 */
export function getAppVersionJstDate(): Date {
  return new Date(`${APP_VERSION.date}T00:00:00+09:00`);
}


