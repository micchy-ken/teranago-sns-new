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
 * 最終更新日時 (最終アップデート): 2026年9月1日 (ワークフロー補充申請・各種申請登録・表示バグ修正 & DB自動カラム追加対応版)
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
    version: 'v2026.09.01',
    date: '2026-09-01',
    summary: 'ワークフロー補充申請・各種申請登録・表示バグ修正 & DB自動カラム追加対応版',
  },
  {
    version: 'v2026.08.27',
    date: '2026-08-27',
    summary: '安否確認システム ステップ1：対象者への個人メール登録依頼一斉配信API & ディープリンク連携対応版',
  },
];
`;

fs.writeFileSync(recommendPath, result, 'utf-8');
console.log('Successfully synced RecommendServerCode.ts with server.ts!');
