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
  version: '2026.11.10.9',
  date: '2026-11-10',
  releaseNumber: 9,
  display: 'v2026.11.10 #9 (JST)',
  timeZone: '日本標準時 (JST / UTC+09:00)',
  description: '現場管理の各画面（現場一覧カード・詳細モーダル・ガントチャート・施工者別工程表等）における現場コードクリック時の外部現場データ確認（sql.teranago.synology.me/genba?code=）新規ウインドウ連携',
};

/**
 * 日本標準時(JST)のDateオブジェクトを取得
 */
export function getAppVersionJstDate(): Date {
  return new Date(`${APP_VERSION.date}T00:00:00+09:00`);
}


