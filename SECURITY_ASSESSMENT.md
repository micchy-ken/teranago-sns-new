# 社内ナレッジSNS (TERANAGO SNS) セキュリティリスク評価書

**作成者**: セキュリティ統括部門 (CISO / Security Lead)  
**対象システム**: TERANAGO 社内ナレッジSNS (GitHub Pages + Synology NAS Hybrid Architecture)  
**評価日**: 2026年10月21日  
**文書バージョン**: 1.0.0  

---

## 1. エグゼクティブ・サマリー (Executive Summary)

本報告書は、社内ナレッジSNS（TERANAGO SNS）のシステムアーキテクチャおよびソースコードに対するセキュリティリスク評価結果をまとめたものです。

本システムは、**GitHub Pages（静的フロントエンド: `https://micchy-ken.github.io/teranago-sns-new/`）** から **Synology NAS（バックエンドAPI: `https://sns.teranago.synology.me/api`）** へ直接 API 通信を行うクロスオリジン構成を採用しています。

評価の結果、静的ホスティングと外部開示バックエンドのハイブリッド構成に起因する**APIエンドポイントの露出**、**アクセストークン検証の不在**、**CORS過剰許可のリスク**など、複数の重要セキュリティ課題が特定されました。本評価書では、各リスクの詳細と具体的な防御策（短期的・中長期的対応）を規定します。

---

## 2. システム構成と脅威モデル (System Architecture & Threat Model)

### 2.1 データフローと接続構成

```
[ ユーザー端末 (ブラウザ) ]
       │
       ├─ (1) GitHub Pages (https://micchy-ken.github.io/teranago-sns-new/)
       │      └─ 静的 HTML / React SPA / JavaScript バンドルダウンロード
       │
       └─ (2) HTTPS API 通信 (CORS Cross-Origin)
              └─ Synology NAS (https://sns.teranago.synology.me/api)
                     └─ Express バックエンド (ポート 3000 / リバースプロキシ)
                            └─ MS SQL Server (teranago_sns) & ローカルファイル群
```

### 2.2 想定される主要な脅威アクター
1. **インターネット上の第三者（攻撃者）**:
   DDNS（`sns.teranago.synology.me`）や GitHub Pages の公開JavaScriptコードからバックエンドAPIを特定し、直接攻撃を試みる脅威。
2. **社内ユーザー / 悪意ある内部関係者**:
   他ユーザーの権限（管理者権限・部署間アクセス権）のなりすましや、非公開データ・人事情報・施工図面の不正取得を試みる脅威。
3. **中間者攻撃・盗聴（MITM）**:
   通信経路上のパケット盗聴や、偽のAPIベースURL改ざんによる情報漏洩。

---

## 3. 主要なセキュリティリスクと脆弱性分析

---

### リスク①：APIベースURLの埋め込みとバックエンドエンドポイントの露出

- **リスクレベル**: **高 (High)**
- **該当箇所**: `/src/config/api.ts`, フロントエンド通信コード全般
- **現象・内容**:
  フロントエンドのビルド済みJavaScript（GitHub Pages上の公開ファイル）内に、バックエンドの絶対URL（`https://sns.teranago.synology.me/api`）がハードコードされています。
- **攻撃シナリオ**:
  攻撃者は GitHub Pages のソースコードまたはブラウザのデベロッパーツール（Networkタブ）を開くだけで、社内NASのグローバルドメインおよび全APIエンドポイント（`/api/users`, `/api/events`, `/api/reports`, `/api/safety` 等）を特定できます。これにより、社内ネットワーク外からの直接的なport scan、APIファジング攻撃、DoS攻撃の標的となります。
- **対策策**:
  1. **IP制限・VPN接続の義務化**: Synology NAS のリバースプロキシ/ファイアウォール側で、許可された社内IPアドレス帯またはVPN経由のアクセスのみに通信を限定する。
  2. **Cloudflare / Web Application Firewall (WAF) の導入**: バックエンドドメインの直前に WAF を配置し、オリジンIPの隠蔽および不正リクエストの自動遮断を実施する。

---

### リスク②：バックエンド側の認証・認可検証（Session/JWT）の欠如

- **リスクレベル**: **極めて高 (Critical)**
- **該当箇所**: `/server.ts`, `/routes/*.js`（Expressルーター全般）
- **現象・内容**:
  フロントエンド側では `LoginScreen` や `currentUser` ステートでログイン状態を管理していますが、バックエンド（Express API）の多くのエンドポイントにおいて、**リクエスト毎のセッショントークン（JWT/Bearer Header）による本人確認・権限検証ミドルウェアが適用されていません**。
- **攻撃シナリオ**:
  攻撃者が curl や Postman を使用して `POST https://sns.teranago.synology.me/api/users` や `GET https://sns.teranago.synology.me/api/reports` へ直接リクエストを送信した場合、認証なしで全ユーザー一覧の取得、ユーザー追加、日報データの改ざん・削除が可能となる恐れがあります。
- **対策策**:
  1. **認証ミドルウェア (JWT Auth Middleware) の必須化**:
     すべての保護対象ルート（`/api/*`）の先頭に `authenticateToken` ミドルウェアを挟み、有効な JWT トークンがないリクエストを拒否（`401 Unauthorized`）する。
  2. **ロールベースアクセス制御 (RBAC) のバックエンド強制**:
     管理者専用操作（ユーザー作成・削除、システムログ参照）に対して、デコードされたトークン内の `role === 'admin'` をバックエンド側で厳格に判定する。

---

### リスク③：CORS (Cross-Origin Resource Sharing) の設定リスク

- **リスクレベル**: **中〜高 (Medium - High)**
- **該当箇所**: `/server.ts` (`cors()` 設定部分)
- **現象・内容**:
  GitHub Pages からの通信を許可するため、CORS が設定されています。設定が `cors()`（デフォルト全許可 `Access-Control-Allow-Origin: *`）になっている場合、悪意のあるサードパーティサイトからもAPIが呼び出せる状態になります。
- **攻撃シナリオ**:
  ログイン済みの社内ユーザーが不審な外部サイトを閲覧した際、CSRF（クロスサイトリクエストフォージェリ）やクロスオリジン経由で社内APIへ非同期リクエストが送信され、データが流出・改ざんされるリスク。
- **対策策**:
  1. **オリジン制限の厳格化**: `Access-Control-Allow-Origin` に `https://micchy-ken.github.io` および社内ローカル開発ドメインのみを明示的に指定する。
  2. **Credentials 設定の最適化**: セキュアCookieを使用する場合は `credentials: true` と共に許可オリジンを単一化する。

---

### リスク④：静的ファイル・図面・アップロードファイルの直接アクセスおよびディレクトリトラバーサル

- **リスクレベル**: **中 (Medium)**
- **該当箇所**: `/routes/sites.js` (`/drawings/serve`), `/uploads` 配信ルート
- **現象・内容**:
  NAS上の施工図面PDFや添付ファイル（`/uploads`, `/bulletinsfiles`, `/external-files`）を取得するエンドポイントが存在します。
- **評価結果**:
  `/routes/sites.js` において `sanitizeDrawingRelPath` や `path.normalize` によるパストラバーサル防止チェック（`..` 遡りの防止）が実装されている点は評価できます。しかし、ファイル参照時に「該当ファイルを閲覧する権限があるか（担当現場か等）」の認可チェックが不足しています。
- **対策策**:
  1. **オーソリゼーションチェック**: ファイル返送前に、リクエストユーザーが対象の現場・掲示板・日報の閲覧権限を持っているかチェックする。
  2. **Direct Directory Listing の禁止**: Express の `express.static` においてディレクトリ一覧の表示を完全に無効化する。

---

### リスク⑤：機密情報・環境変数の漏洩管理

- **リスクレベル**: **中 (Medium)**
- **該当箇所**: `/src/config/api.ts`, `.env`, `package.json`
- **評価結果**:
  `AGENTS.md` の運用規約に従い、DBパスワードやSMTP認証情報、WebPushのVAPID秘密鍵などの機密情報はクライアント側のコード（`src/`）に直書きされず、バックエンドの環境変数（`.env`）で分離管理されています。
- **継続対応策**:
  1. **`VITE_` プレフィックスの厳格管理**: Vite では `VITE_` から始まる環境変数のみがクライアントバンドルに含まれるため、秘密鍵やDB接続情報に絶対に `VITE_` を付与しないこと。
  2. **`.gitignore` の徹底**: `.env` ファイルおよびアップロードデータが Git リポジトリ（特に GitHub Pages 用の公開リポジトリ）に誤ってコミットされないよう継続監視する。

---

## 4. 推奨セキュリティ対策ロードマップ (Actionable Remediation Roadmap)

### Phase 1: 即時対応 (1〜3日以内)
1. **CORS設定の固定化**:
   `server.ts` の CORS 設定を `https://micchy-ken.github.io` 限定に修正。
2. **NAS リバースプロキシでのIP制限**:
   Synology NAS の Control Panel > Security > Firewall で、APIエンドポイント（ポート3000 / リバースプロキシ口）へのアクセスを国内IPまたは社内IP帯に限定。

### Phase 2: 短期対応 (1〜2週間以内)
1. **JWT 認証・認可ミドルウェアの実装**:
   ログイン成功時に署名付き JWT トークンを発行し、フロントエンドは `Authorization: Bearer <token>` ヘッダーを付与して通信。バックエンド全ルートでトークン検証を強制。
2. **診断・管理者用 API の保護**:
   `/api/admin/*` や API診断エンドポイントに対して、管理者トークン必須化をバックエンドで厳格チェック。

### Phase 3: 中長期対応 (1ヶ月以内)
1. **Cloudflare / WAF 導入**:
   Synology NAS の前段に Cloudflare などの Reverse Proxy / WAF を挿入し、DDoS 対策と SSL/TLS 強固化を実施。
2. **定期セキュリティ監査・ログ監視**:
   SQL Server の接続ログ、Express のアクセスログ（IP・ユーザーID・レスポンスステータス）の定期的監視と異常検知アラート構築。

---

## 5. 結論 (Conclusion)

本システムは、利便性の高いハイブリッド構成（GitHub Pages + Synology NAS）を実現していますが、公開バックエンドに対する**認証ミドルウェアの非適用**および**APIエンドポイントの露出**が最大のリスク要因となっています。

上記「Phase 1」および「Phase 2」の対策（JWT認証の適用とアクセス制御）を優先的に実施することで、外部攻撃や不正アクセスに対する堅牢なセキュリティ強度を確立することができます。
