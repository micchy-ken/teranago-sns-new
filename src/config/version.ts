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
  version: '2026.11.11.1',
  date: '2026-11-11',
  releaseNumber: 1,
  display: 'v2026.11.11 #1 (JST)',
  timeZone: '日本標準時 (JST / UTC+09:00)',
  description: 'Step 1 パフォーマンス抜本改善：DB非クラスター化インデックス自動生成・掲示板一覧のO(1) Map集計化・コメント＆足跡のオンデマンド遅延取得(/api/bulletins/:id/detail)・段階的DOM描画・不要な全件再取得排除',
};

/**
 * 日本標準時(JST)のDateオブジェクトを取得
 */
export function getAppVersionJstDate(): Date {
  return new Date(`${APP_VERSION.date}T00:00:00+09:00`);
}


