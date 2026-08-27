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
 * 最終更新日時 (最終アップデート): 2026年8月26日 (iCal繰り返し予定のRFC 5545標準準拠化：RRULE/EXDATE/RECURRENCE-ID対応版)
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

const result = `export const RECOMMEND_SERVER_JS = \`${header}${escapedContent}\`;\n`;

fs.writeFileSync(recommendPath, result, 'utf-8');
console.log('Successfully synced RecommendServerCode.ts with server.ts!');
