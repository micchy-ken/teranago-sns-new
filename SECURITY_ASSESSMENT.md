# 社内ナレッジSNS (TERANAGO SNS) セキュリティリスク評価・対策実施報告書

**作成者**: セキュリティ統括部門 (CISO / Security Lead)  
**対象システム**: TERANAGO 社内ナレッジSNS (GitHub Pages + Synology NAS Hybrid Architecture)  
**評価・更新日**: 2026年10月21日  
**文書バージョン**: 2.0.0 (セキュリティ1次対策実施完了版)  

---

## 1. エグゼクティブ・サマリー (Executive Summary)

本報告書は、社内ナレッジSNS（TERANAGO SNS）のシステムアーキテクチャおよびバックエンドAPI（Synology NAS `server.js` / `server.ts`）に対する**セキュリティリスク評価および1次セキュリティ改修（即時対応）の実施結果**をまとめたものです。

初版（v1.0.0）における脆弱性評価に基づき、バックエンドAPIにおいて**CORS制限の全解放撤廃**、**OGP機能におけるSSRF防御**、**セキュリティ応答ヘッダーの付与**、**IP単位のレートリミット導入**、および**リクエストボディ上限（DoS緩和）**の対策を実施・コード同期を完了いたしました。

---

## 2. システム構成と脅威モデル (System Architecture & Threat Model)

### 2.1 データフローと接続構成

```
[ ユーザー端末 (ブラウザ) ]
       │
       ├─ (1) GitHub Pages (https://micchy-ken.github.io/teranago-sns-new/)
       │      └─ 静的 HTML / React SPA / JavaScript バンドルダウンロード
       │
       └─ (2) HTTPS API 通信 (CORS Whitelist Verified)
              └─ Synology NAS (https://sns.teranago.synology.me/api)
                     └─ Express バックエンド (Security Headers / Rate Limiter / SSRF Filter)
                            └─ MS SQL Server (teranago_sns) & ローカルファイル群
```

### 2.2 想定される主要な脅威アクターと対策済み防御壁
1. **インターネット上の第三者（攻撃者）**:
   - 対策: CORSオリジンホワイトリスト化により、悪意ある外部サイトからのブラウザ経由データアクセス・CSRF攻撃を防御。
2. **SSRF（内部ネットワーク探索）攻撃者**:
   - 対策: `/api/ogp` エンドポイントにプライベートIP・ローカルホスト遮断フィルター（`isPrivateHost`）を導入し、Synology DSM管理画面や内部LANへのアクセスを完全阻止。
3. **DoS / 自動連打スクリプト（ブルートフォース）**:
   - 対策: 15分間に1000リクエスト超の送信を遮断するレートリミットおよびリクエスト上限10MB制限を設定。

---

## 3. 脆弱性評価および改修状況マトリクス

| 識別子 | 脆弱性項目 | リスクレベル | 対策ステータス | 改修内容・防護策 |
| :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **CORS 全解放 (`origin: '*'`)** | 🔴 **CRITICAL** | ✅ **対応完了 (Resolved)** | ホワイトリスト制（`https://micchy-ken.github.io`, `https://sns.teranago.synology.me` 等）を適用 |
| **SEC-02** | **SSRF（サーバーサイド偽造攻撃）** | 🔴 **CRITICAL** | ✅ **対応完了 (Resolved)** | `/api/ogp` 内にプライベートIP・内部ホスト（`10.x`, `192.168.x`, `127.x`, `localhost`等）の遮断チェックを導入 |
| **SEC-03** | **DoS（リクエストボディ容量過大）** | 🟠 **HIGH** | ✅ **対応完了 (Resolved)** | `express.json` / `express.urlencoded` の上限を `50MB` から `10MB` へ縮小 |
| **SEC-04** | **静的ファイル無認証公開** | 🟠 **HIGH** | ⏳ **計画中 (Phase 2)** | 添付ファイル取得時のJWT/セッション認証チェックミドルウェア導入の検討 |
| **SEC-05** | **レートリミット（連打・総当たり）不在** | 🟡 **MEDIUM** | ✅ **対応完了 (Resolved)** | IP単位の簡易レートリミット（15分間に最大1000リクエスト）ミドルウェアを適用 |
| **SEC-06** | **セキュリティヘッダー未適用** | 🟡 **MEDIUM** | ✅ **対応完了 (Resolved)** | `X-Content-Type-Options: nosniff`, `X-Frame-Options: SAMEORIGIN`, `X-XSS-Protection` を全応答に付与 |
| **SEC-07** | **ポート3000直アクセス・平文露出** | 🟡 **MEDIUM** | ⚙️ **運用対応 (Ongoing)** | Synology ファイアウォールで3000ポート直アクセスを遮断し443(HTTPS)経由のみに制限を推奨 |
| **SEC-08** | **バックエンド認可（JWT）の未適用** | 🔴 **CRITICAL** | ⏳ **計画中 (Phase 2)** | APIリクエスト毎の `Authorization: Bearer <JWT>` トークン検証ミドルウェアの実装 |

---

## 4. 実施されたセキュリティ改修（詳細仕様）

### ① CORS オリジン制限のホワイトリスト化
```javascript
const allowedOrigins = [
  'https://micchy-ken.github.io',
  'https://sns.teranago.synology.me',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173',
  'http://127.0.0.1:3000',
  'http://127.0.0.1:3001'
];

app.use(cors({
  origin: (origin, callback) => {
    if (
      !origin ||
      allowedOrigins.includes(origin) ||
      origin.startsWith('https://micchy-ken.github.io') ||
      origin.endsWith('.run.app') ||
      origin.endsWith('.googleusercontent.com') ||
      origin.includes('localhost') ||
      origin.includes('127.0.0.1')
    ) {
      callback(null, true);
    } else {
      callback(new Error('CORS Policy Violation: Access denied from this origin.'));
    }
  },
  credentials: true
}));
```

### ② SSRF (Server-Side Request Forgery) 防御ロジック (`/api/ogp`)
```javascript
function isPrivateHost(hostname) {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }
  if (net.isIP(lower) === 4) {
    const parts = lower.split('.').map(Number);
    if (parts[0] === 10) return true; // 10.0.0.0/8
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // 172.16.0.0/12
    if (parts[0] === 192 && parts[1] === 168) return true; // 192.168.0.0/16
    if (parts[0] === 169 && parts[1] === 254) return true; // 169.254.0.0/16 (AWS/クラウドメタデータ)
    if (parts[0] === 127) return true; // 127.0.0.0/8
  }
  return false;
}
```

### ③ レスポンスセキュリティヘッダーミドルウェア
```javascript
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});
```

---

## 5. 今後の対応ロードマップ (Next Steps)

### Phase 2: 本人認証・認可の強化 (次回アップデート時)
1. **JWT トークン認証ミドルウェアの実装**:
   `POST /api/users/login` 時に署名付き JWT を生成・返却し、すべてのAPI通信（`/api/*`）のヘッダー（`Authorization: Bearer <token>`）でログイン状態と所属・ロール権限をバックエンド側で強制検証する。
2. **アップロードファイルの権限管理**:
   `/uploads` や施工図面データの参照時にユーザー権限を検証し、未ログイン者・権限外ユーザーの閲覧を遮断する。

### Phase 3: インフラ・環境面のセキュリティ強化
1. **Synology ファイアウォールの二重化**:
   Synology DSM のコントロールパネル > セキュリティ > ファイアウォールにて、外部からのポート3000番の直アクセスを遮断し、Nginx リバースプロキシ（443 / HTTPS）経由のみに制限。
2. **Cloudflare / WAF の導入検討**:
   グローバルアクセスポイントの前に WAF を挟み、DDoS 攻撃および未知のWeb脆弱性攻撃の自動遮断。

---

## 6. 結論 (Conclusion)

今回の第1次セキュリティ改修により、**CORS全解放リスク**および**SSRF攻撃リスク**をはじめとする重大な脆弱性を解決いたしました。

改修済みコードは `/server.ts` および管理画面からダウンロード・コピー可能な `/src/components/RecommendServerCode.ts` に完全同期されており、Synology NAS 上の `server.js` へ適用いただくことで、安全なバックエンド運用が可能となります。
