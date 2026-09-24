# 寺岡オートドアSNS (寺子屋SNS) システム設計・運用保守ドキュメント (DOC)

本ドキュメント群は、**寺岡オートドアSNS（寺子屋SNS）**の長期的な保守・改修・安全な運用を支援するために、データベース構造、API仕様、および複雑な業務処理フローを網羅的にまとめた公式技術仕様書です。

---

## 📚 ドキュメント構成一覧

| ドキュメント | ファイル名 | 主な内容 |
| :--- | :--- | :--- |
| **全テーブル定義 & リレーション一覧** | [`DATABASE_SCHEMA.md`](./DATABASE_SCHEMA.md) | MS SQL Server (Primary) および Local JSON (Fallback) の全テーブル定義、カラム型、制約、外部キーリレーション、Mermaid ER図 |
| **APIエンドポイント仕様書** | [`API_SPECIFICATION.md`](./API_SPECIFICATION.md) | 全REST APIエンドポイント一覧（HTTPメソッド、マウントパス、処理ロジック、関連テーブル、リクエスト/レスポンス仕様） |
| **主要・複雑業務の処理フロー** | [`SYSTEM_WORKFLOWS.md`](./SYSTEM_WORKFLOWS.md) | ①CRM点検データ〜点検報告書〜電子署名〜事務検印<br>②気象庁連動安否確認・AES暗号化同報配信<br>③多段階ワークフロー申請・承認<br>④カレンダー繰返し・iCal連携<br>⑤Web Push & SMTPメール通知基盤 |

---

## 🏗 システム全体アーキテクチャ

本システムは、高い耐障害性と現場の操作性を両立するため、**フロントエンド（GitHub Pages静的SPA）**と**オンプレミス/NASバックエンド（Synology NAS / Node.js Express）**を分離したクロスオリジン構成を採用しています。

```mermaid
flowchart TB
    subgraph Client ["Client Browser / Mobile PWA"]
        UI["React 19 SPA (Tailwind CSS v4 + Motion)"]
        SW["Service Worker (PWA / Push受信)"]
        Storage["LocalStorage (キャッシュ / オフライン)"]
    end

    subgraph Hosting ["Frontend Hosting"]
        GHP["GitHub Pages (https://micchy-ken.github.io/teranago-sns-new/)"]
    end

    subgraph Backend ["Backend API Server (Synology NAS / Node.js Express)"]
        API_GW["Reverse Proxy / Express Server (Port 3000)"]
        subgraph Routers ["Express Modules (routes/*.js)"]
            R_Inspect["inspections.js (点検報告・CRM)"]
            R_Safety["safety.js (安否確認・暗号化)"]
            R_WF["workflows.js (申請・承認)"]
            R_Rep["reports.js (日報・週報)"]
            R_Event["events.js (カレンダー)"]
            R_Push["push.js (WebPush)"]
            R_Etc["bulletins / chats / memos / masters / users / ical"]
        end
        subgraph StorageLayer ["Data Persistence Layer"]
            MSSQL[("MS SQL Server (Primary DB)")]
            LocalJSON[("Local JSON Files (/data/*.json) (Fallback DB)")]
        end
    end

    subgraph External ["External Services"]
        JMA["気象庁 API (地震速報 / 震度連動)"]
        SMTP["社内/プロバイダ SMTPサーバー (メール通知)"]
        VAPID["Google / Apple Push サービス (Web Push)"]
    end

    UI -->|HTTPS / API_BASE_URL| API_GW
    GHP -.->|静的アセット配信| UI
    API_GW --> Routers
    Routers -->|mssql pool| MSSQL
    Routers -.->|DBダウン時 / 二重保持| LocalJSON
    R_Safety -->|震度検知| JMA
    R_Safety & R_WF & R_Rep -->|通知メール| SMTP
    R_Push & R_Safety -->|プッシュ通知| VAPID
```

---

## ⚙️ 開発・運用における最重要規約 (AGENTS.md 要約)

1. **`server.ts` と `RecommendServerCode.ts` の完全同期**
   - バックエンドの修正時は、UIの管理画面から最新サーバーコードをコピー・エクスポートできるよう、必ず `/src/components/RecommendServerCode.ts` と更新日時を同時更新する。
2. **モジュール分割サーバー（`routes/*.js`）の完全同期**
   - モジュール修正時は、チャット上でファイル全体の完全版コードを提示し、`/routes/*.js`、`/server.ts`、`/src/components/RecommendServerCode.ts` をすべて整合させる。
3. **フロントエンド通信時の `API_BASE_URL` 必須利用**
   - 相対パス (`/api/...`) の直接ハードコードは厳禁。`import { API_BASE_URL } from '../config/api'` を介してリクエストを行う（GitHub Pages 上での 405 Method Not Allowed を防ぐため）。
4. **ハイブリッドDB耐障害性**
   - MS SQL Server への接続プールが切断された場合でも、ローカル JSON (`/data/*.json`) で業務が継続できるようフォールバック機構を維持する。
