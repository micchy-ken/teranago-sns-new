# 開発ルール・プロジェクト運用規約 (AGENTS.md)

本ファイルは、本プロジェクト（社内ナレッジSNS / 寺子屋SNS）において AI エージェントおよび開発者が遵守すべき最優先の開発ルールとプロジェクト仕様を定めたものです。

---

## 1. 最重要ルール (Critical Mandates)

### ① `server.ts` 更新時の `RecommendServerCode.ts` 同期・更新日時明記義務
- **必須要件**: `server.ts` に新しいAPIエンドポイントの追加、既存ロジックの変更、DBスキーマ更新、バグ修正などを行った場合、**必ず `/src/components/RecommendServerCode.ts` にも最新のサーバーコードを完全に同期・反映**してください。
- **更新日時の明記**: `RecommendServerCode.ts` を更新する際は、**ファイル冒頭のコメントヘッダーにある「最終更新日時 (最終アップデート)」に対象日（例: `YYYY年M月D日`）と主な更新内容を必ず明記**してください。
- **理由**: 本アプリは社内NAS（Synology）やオンプレミスサーバー向けに、UI上の管理画面から最新の推奨バックエンドコードをエクスポート・確認・コピーできる仕組みを提供しているためです。更新日時が明記されていることで、運用者がサーバーコードの新旧バージョンをひと目で判別できるようになります。

### ② パッケージ追加・更新時の `package.json` 明示提示義務
- **必須要件**: 新たな npm パッケージを追加（`install_applet_package` 実行）または `package.json` のスクリプトや依存関係を更新する際は、**必ずユーザーに対して「追加したパッケージ名」「バージョン/用途」「package.json の差分または更新内容」をチャット上で分かりやすく提示・報告**してください。
- **実行順序**: パッケージの追加が必要な場合は、コード内で import 文を書く前に必ずパッケージのインストールを完了させてください。

### ③ 「質問です」等の質問・相談時の対応原則（コード改変の禁止）
- **必須要件**: ユーザーからの問いかけが「質問です」「確認ですが」「〜はどうなっていますか？」等の質問・相談・調査依頼である場合、**コード（ファイル）を編集・修正せず、現状の仕様・コードの該当箇所の解説・回答のみ**を行ってください。
- **改変のタイミング**: ユーザーから「修正してください」「反映をお願いします」「〜を実装してください」等の明示的な変更指示・修正依頼を受けた段階でのみ、コードの改変・ビルド作業を実施してください。

### ④ フロントエンド通信時の `API_BASE_URL` 必須利用義務（相対パス `/api` の禁止）
- **必須要件**: 本システムは **GitHub Pages（フロントエンド: `https://micchy-ken.github.io/teranago-sns-new/`）** から **Synology NAS（バックエンド: `https://sns.teranago.synology.me/api`）** へクロスオリジンで API 通信を行うアーキテクチャです。
- **禁止事項**: フロントエンド（React / 各コンポーネント内）で `fetch('/api/...')` や `fetch(\`/api/...\`)` のように**相対パスを直接ハードコードすることは厳禁**です（GitHub Pages は静的ホスティングのため POST リクエスト時に `405 Method Not Allowed` となり通信が失敗します）。
- **実装ルール**: すべての API 通信は必ず `import { API_BASE_URL } from '../config/api'`（または `./config/api`）をインポートし、`fetch(\`${API_BASE_URL}/...\`)` の形式で呼び出さなければなりません。

### ⑤ モジュール分割サーバー（`routes/*.js`）の完全同期＆「更新モジュール全文」提示義務
- **必須要件**: ユーザー環境のAPIサーバーは `routes/*.js`（例: `routes/safety.js`, `routes/reports.js`, `routes/events.js`, `routes/ical.js` 等）による Express Router モジュール分割構成（MS SQL Server `mssql` 連携・AES-256-GCM暗号化・ES Modules/CJS）で本番稼働しています。
- **モジュール全文（完全版）の必須提示**: サーバー側のAPI追加・ロジック変更・バグ修正などが発生した場合は、部分的な差分や切り貼り用スニペットではなく、**そのままファイルに上書き（全交換）できる「該当更新モジュール（`routes/*.js`）の全文（1行目から末尾まで）の完全版コード」をチャット上で必ず提示**してください。
- **リポジトリ内ファイルの更新**: プロジェクト内の `/routes/*.js`（例: `routes/safety.js`）、`/server.ts`、および `/src/components/RecommendServerCode.ts` をすべて整合性を保って更新してください。
- **ルーティング耐障害性**: `app.use('/api', safetyRouter)` と `app.use('/api/safety', safetyRouter)` のどちらのマウント方式でも動作するよう、ルーター側のパス定義は `router.get(['/safety-events', '/safety/events', '/events'], ...)` のように複数パスを配列で受け付ける設計を徹底してください。

---

## 2. システム構成・アーキテクチャ仕様

| 区分 | 採用技術 / 仕様 | 備考 |
| :--- | :--- | :--- |
| **フロントエンド** | GitHub Pages (`https://micchy-ken.github.io/teranago-sns-new/`) | React 19 + TypeScript + Vite + Tailwind CSS v4 + Motion、SPA 構成、PWA 対応 (`/public/sw.js`, `manifest.json`) |
| **バックエンド** | Synology NAS (`https://sns.teranago.synology.me/api`) | Express (Node.js) on `http://0.0.0.0:3000` / 開発環境 `tsx server.ts` / 本番環境 `node dist/server.cjs` |
| **API 通信** | `API_BASE_URL` 経由のクロスオリジン通信 | `/src/config/api.ts` で環境に応じたベースURLを一元管理 |
| **アイコン** | `lucide-react` | カスタム SVG アイコンの作成は禁止、Lucide から Named Import |
| **アニメーション** | `motion/react` (Motion) | スムーズな遷移・モーダルアニメーション |
| **データベース** | MS SQL Server (Primary) / Local JSON (Fallback) | `/data/*.json` と SQL Server 両対応のハイブリッド構造 |
| **通知機能** | Web Push (VAPID) & SMTP メール通知 (Nodemailer) | プッシュ購読情報は DB とローカルファイルで二重永続化 |

---

## 3. コーディング規約と品質基準

1. **AI Slop の排除と洗練された UI/UX**
   - 目的のない派手なグラデーションや過剰なドロップシャドウを排除。
   - 視認性の高いコントラスト比（WCAG AA 4.5:1以上）を確保。
   - ボタンやバッジ内のテキストが中途半端に改行・省略されないよう適切な余白と `white-space: nowrap` を適用。
2. **型安全性とモジュール分離**
   - 新しいデータ型は `/src/types/` 内で型定義を作成・管理する。
   - 単一ファイルにすべてのロジックを詰め込まず、コンポーネント・ユーティリティに適切に分割する。
3. **リバースプロキシ・NAS 連携への配慮**
   - `/api` プレフィックスの自動補正、ファイルアップロード先 (`/uploads`, `/bulletinsfiles`, `/external-files`) の安全なパス管理を徹底する。
   - ウォッチツール（tsx/nodemon）の再起動ループを防ぐため、アップロードファイルは監視対象外とする。

---

## 4. 開発・検証フロー

1. **要求確認**: ユーザーの要望範囲を正確に把握し、不要な機能の勝手な追加を避ける。
2. **実装 & 同期**:
   - サーバー変更時は `server.ts`、`RecommendServerCode.ts`、および該当する `routes/*.js`（例: `routes/safety.js`）をセットで更新・同期。
   - パッケージ追加時はインストールを実行し、内容をユーザーへ提示。
3. **ビルド検証**: `compile_applet` または `lint_applet` を実行し、TypeScript コンパイルエラーやビルド破壊がないことを確認する。
4. **完了報告**: 実装内容および `package.json` の変更点等を簡潔に報告するとともに、**変更のあったモジュール（`routes/*.js`）の全文（完全版コード）を必ず提示**する。
