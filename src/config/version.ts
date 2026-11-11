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
  version: '2026.11.11.2',
  date: '2026-11-11',
  releaseNumber: 2,
  display: 'v2026.11.11 #2 (JST)',
  timeZone: '日本標準時 (JST / UTC+09:00)',
  description: 'Step 2 チャット高速化・過去履歴ページネーション対応：ルーム一覧取得時の最新50件抽出(ROW_NUMBER() + O(M) Map集計)・上スクロール時の過去メッセージ遅延取得API(/api/chats/:roomId/messages)・一括既読更新API(/api/chats/:roomId/viewers/batch)・App.tsxユーザー照合O(1) Map化',
};

/**
 * 日本標準時(JST)のDateオブジェクトを取得
 */
export function getAppVersionJstDate(): Date {
  return new Date(`${APP_VERSION.date}T00:00:00+09:00`);
}


