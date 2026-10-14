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
  version: '2026.10.14.2',
  date: '2026-10-14',
  releaseNumber: 2,
  display: 'v2026.10.14 #2',
  description: 'PDFプレビューの上下途切れ解消＆全体表示・幅合わせ切替追加、チャット・掲示板等でのExcel・Word・テキスト・CSVマルチモーダルプレビュー完全対応',
};
