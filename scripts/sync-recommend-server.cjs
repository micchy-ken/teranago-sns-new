const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, '..', 'server.ts');
const recommendPath = path.join(__dirname, '..', 'src', 'components', 'RecommendServerCode.ts');

let serverContent = fs.readFileSync(serverPath, 'utf-8');

// バッククォートとテンプレート変数を安全にエスケープ
const escapedContent = serverContent
  .replace(/\\/g, '\\\\')
  .replace(/`/g, '\\`')
  .replace(/\$\{/g, '\\${');

const header = `/**
 * =====================================================================
 * 寺子屋 SNS サーバーサイド・バックエンド (Express & MS SQL Server)
 * 最終更新日時 (最終アップデート): 2026年11月11日 (Step 4 カレンダー・予定管理 期間ウィンドウ取得＆インデックス最適化：過去180日基準ウィンドウ取得・繰り返し予定＆現場施工予定の完全保持・ワンタイムスキーマ＆インデックス自動生成・非同期ファイルI/Oキャッシュ対応版)
 * 
 * 【重要：開発サーバーの再起動ループ対策について】
 * nodemon や tsx watch などのウォッチツールを使用してサーバーを起動している場合、
 * ファイルがアップロードされると「プロジェクト内のファイル変更」と検知され、
 * サーバーが自動的に再起動して接続切断（ループ）を引き起こす原因になります。
 * 
 * 解決策1：nodemon を使用している場合、nodemon.json でアップロード先ディレクトリを監視対象から除外します。
 * {
 *   "ignore": ["uploads/*", "public/uploads/*"]
 * }
 * 
 * 解決策2：本番運用時、または安定動作のため、本コードは uploads ディレクトリを
 * カレントディレクトリに作成するようにしていますが、必要に応じてプロジェクト外の
 * 永続的な共有ディレクトリや、クラウドストレージ（AWS S3 や Azure Blob）に保存する
 * ようカスタマイズしてください。
 * =====================================================================
 */\n`;

const result = `export const RECOMMEND_SERVER_JS = \`${header}${escapedContent}\`;

export interface ServerCodeHistoryItem {
  version: string;
  date: string;
  summary: string;
}

export const SERVER_CODE_HISTORY: ServerCodeHistoryItem[] = [
  {
    version: 'v2026.11.11.5',
    date: '2026-11-11',
    summary: 'Step 4 カレンダー・予定管理 期間ウィンドウ取得＆インデックス最適化：過去180日基準ウィンドウ取得・繰り返し予定＆現場施工予定の完全保持・ワンタイムスキーマ＆インデックス自動生成・非同期ファイルI/Oキャッシュ対応版',
  },
  {
    version: 'v2026.11.11.3',
    date: '2026-11-11',
    summary: 'Step 3 伝言メモ・日報・週報・写真報告書 ページネーション＆非同期I/O化：未対応・未確認優先抽出・OFFSET/FETCH NEXTページネーション・fs.promises非同期I/O＆メモリキャッシュ・非クラスター化インデックス自動生成対応版',
  },
  {
    version: 'v2026.11.11.2',
    date: '2026-11-11',
    summary: 'Step 2 チャット高速化・過去履歴ページネーション対応：ルーム一覧の最新50件抽出(ROW_NUMBER() + O(M) Map集計)・過去メッセージ遅延取得API(/api/chats/:roomId/messages)・一括既読更新API(/api/chats/:roomId/viewers/batch)・スキーマ検証キャッシュ化対応版',
  },
  {
    version: 'v2026.11.11.1',
    date: '2026-11-11',
    summary: 'Step 1 パフォーマンス抜本改善：掲示板トピック一覧のO(1) Map集計化・コメント＆足跡のオンデマンド詳細取得API(/api/bulletins/:id/detail)追加・SQL非クラスター化インデックス自動生成・添付ファイル一覧の非同期I/O化対応版',
  },
  {
    version: 'v2026.10.23.9',
    date: '2026-10-23',
    summary: '回覧板アンケート・意思決定投票機能：選択肢ごとの理由コメント必須化・回答期限までの自動ピン留め・routes/bulletins.jsによるdbo.Bulletins pollカラム自動マイグレーション・投票API(/api/bulletins/:id/poll/vote)対応版',
  },
  {
    version: 'v2026.10.23',
    date: '2026-10-23',
    summary: '現場管理とカレンダースケジュール連携機能：工事選択時の現場選択・乗り込み種別【新規】【残】【出庫有】・現場管理施工実績連携・routes/events.jsによるdbo.Events自動マイグレーション対応版',
  },
  {
    version: 'v2026.10.22',
    date: '2026-10-22',
    summary: '点検予定一括登録通信のCORS許可ヘッダー拡充および下書き通信最適化',
  },
  {
    version: 'v2026.10.06',
    date: '2026-10-06',
    summary: 'チャットメッセージ既読数・送信者除外判定型正規化 String(id) & viewersJson 型不一致バグ修正版',
  },
  {
    version: 'v2026.10.01.2',
    date: '2026-10-01',
    summary: '文書管理・フォルダ機能 (routes/documents.js) 連携・階層フォルダ・権限設定・バージョン履歴・複数ファイル同梱・ZIP一括DL・DL者追跡ログ 完全同期版',
  },
  {
    version: 'v2026.10.01',
    date: '2026-10-01',
    summary: 'ユーザー複数一括招待・トークン検証登録・パスワード設定依頼メール・初回ログイン時パスワード変更強制機能 完全同期版',
  },
  {
    version: 'v2026.09.30',
    date: '2026-09-30',
    summary: '画像・スタンプ静的配信の30日間高速キャッシュ設定 maxAge/immutable および2段階サムネイル対応 完全同期',
  },
  {
    version: 'v2026.09.01',
    date: '2026-09-01',
    summary: 'ワークフロー補充申請・各種申請登録・表示バグ修正 & DB自動カラム追加対応版',
  },
];
`;

fs.writeFileSync(recommendPath, result, 'utf-8');
console.log('Successfully synced RecommendServerCode.ts with server.ts!');
