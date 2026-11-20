/**
 * アプリケーションバージョン管理定数 (日本時間 JST / UTC+9 基準)
 * 機能追加・修正によるバージョンアップ時は、必ず日本標準時 (JST) の日付を基準に
 * その日の何番目のバージョンかを示すデイリー番号 (#1, #2, ...) を更新してください。
 */
export const APP_VERSION = {
  version: '2026.11.19.15',
  date: '2026-11-19',
  releaseNumber: 15,
  timeZone: 'Asia/Tokyo (JST)',
  display: 'v2026.11.19 #15 (JST)',
  description: '本番Organization (teranago-sns/po) 移行＆セキュリティ監査対応：SMTP/POP3直書き認証情報・APIパスワード漏洩の完全除去、厳格CORS(https://teranago-sns.github.io)＆CSP対応、招待完了時scryptハッシュ化、ビルドパス/po/化'
} as const;
