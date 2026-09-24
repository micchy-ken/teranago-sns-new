# API エンドポイント仕様書 (API_SPECIFICATION.md)

本ドキュメントは、寺岡オートドアSNS（寺子屋SNS）のバックエンドサーバー（Synology NAS / Node.js Express）が提供する全 REST API エンドポイントの仕様一覧です。

---

## 1. API 設計・ルーティング規約

1. **ベースURL & クロスオリジン通信**
   - フロントエンド（GitHub Pages: `https://micchy-ken.github.io/teranago-sns-new/`）からバックエンド（Synology NAS: `https://sns.teranago.synology.me/api`）へ接続されます。
   - すべての通信は `API_BASE_URL` (`src/config/api.ts`) をプレフィックスとして呼び出されます。
2. **ルーティング耐障害性 (マルチパス定義)**
   - NASのリバースプロキシ設定や Express Router のマウント階層（`/api/...` または `/api/モジュール名/...`）の差異を吸収するため、各エンドポイントは複数のパスを配列で受け付ける耐障害設計となっています。
   - 例: `router.get(['/reports', '/inspection-reports', '/inspections/reports', '/inspections'], ...)`
3. **データ永続化とレスポンス**
   - 正常応答時は基本的に `{ success: true, ... }` の JSON を返却します。
   - レスポンスには接続先ソースを示す `source: 'mssql'` または `source: 'json'` が付与される場合があります。

---

## 2. API エンドポイント一覧

### 2.1 点検報告書 & CRM連携 API (`routes/inspections.js`)

| HTTPメソッド | パス (エイリアス含む) | 処理内容 | 関与テーブル / JSON | 主なパラメータ / リクエストBody | 主なレスポンス |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/inspections`<br>`/api/inspection-reports`<br>`/api/inspections/reports` | 点検報告書の一覧取得。<br>日付・ステータス・管理番号・点検員ID・年月での絞り込みに対応。 | `dbo.InspectionReports`<br>`/data/inspection_reports.json` | Query: `date`, `status`, `jobNo`, `inspectorId`, `yearMonth` | `{ success: true, reports: [...] }` |
| **GET** | `/api/inspections/:id`<br>`/api/inspection-reports/:id` | 単一の点検報告書の詳細取得。ドア毎の点検結果・電子署名を含む。 | `dbo.InspectionReports`<br>`/data/inspection_reports.json` | Path: `id` (報告書ID) | `{ success: true, report: {...} }` |
| **POST** | `/api/inspections`<br>`/api/inspection-reports`<br>`/api/inspections/reports` | 点検報告書の新規保存・更新 (Upsert)。<br>SQL Server `MERGE` 文による高精度同期、ドア25項目点検結果、Base64電子署名対応。 | `dbo.InspectionReports`<br>`/data/inspection_reports.json` | Body: 報告書オブジェクト (`id`, `jobNo`, `customerName`, `doors`, `customerSignature`, etc.) | `{ success: true, report: {...} }` |
| **PUT** | `/api/inspections/:id/confirm`<br>`/api/inspection-reports/:id/confirm` | 事務担当者による検印（確認）トグル処理。<br>検印日時・検印者氏名を記録。 | `dbo.InspectionReports`<br>`/data/inspection_reports.json` | Path: `id`<br>Body: `{ user: { id, name } }` | `{ success: true, report: {...} }` |
| **GET** | `/api/inspections/previous/:jobNo`<br>`/api/inspection-reports/previous/:jobNo` | 指定された管理番号（`jobNo`）の「直近の完了済み（`signed`）点検結果」を取得（前回値コピー用）。 | `dbo.InspectionReports`<br>`/data/inspection_reports.json` | Path: `jobNo` (物件管理番号) | `{ success: true, report: {...} }` |
| **POST** | `/api/inspections/crm-data/bulk`<br>`/api/crm/bulk` | 社内基幹CRMからの点検対象物件・ドア仕様台帳データの一括インポート・更新 (Upsert)。 | `dbo.CrmInspections`<br>`/data/crm_inspections.json` | Body: `{ items: [...], yearMonth: "2026-09", importedBy: "u1" }` | `{ success: true, count: 15 }` |
| **GET** | `/api/inspections/crm-data`<br>`/api/crm-data` | CRMからインポートされた点検対象物件データの一覧取得（年月絞り込み可）。 | `dbo.CrmInspections`<br>`/data/crm_inspections.json` | Query: `yearMonth` (例: `'2026-09'`) | `{ success: true, items: [...] }` |

---

### 2.2 安否確認 (BCP) & 地震速報 API (`routes/safety.js`)

| HTTPメソッド | パス (エイリアス含む) | 処理内容 | 関与テーブル / JSON | 主なパラメータ / リクエストBody | 主なレスポンス |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/safety-events`<br>`/api/safety/events`<br>`/api/events` | 安否確認イベント一覧の取得。 | `dbo.SafetyEvents`<br>`/data/safety_events.json` | なし | `[ { id, title, type, severity, status... } ]` |
| **GET** | `/api/safety-events/:id`<br>`/api/safety/events/:id` | 特定の安否確認イベント詳細取得。 | `dbo.SafetyEvents` | Path: `id` (イベントID) | `{ id, title, message, ... }` |
| **POST** | `/api/safety-events`<br>`/api/safety/events` | 管理者による安否確認の手動発令。<br>対象社員へのWeb Push、社内メール、暗号化個人メールへの自動同報配信。 | `dbo.SafetyEvents`<br>`dbo.Users`<br>`dbo.push_subscriptions`<br>`dbo.notifications` | Body: `{ title, type, severity, targetOffice, message, notifyWebPush, notifyPersonalEmail... }` | `{ success: true, event: {...} }` |
| **PUT** | `/api/safety-events/:id/close` | 安否確認イベントの収束・完了処理。 | `dbo.SafetyEvents` | Path: `id` | `{ success: true, message: '収束しました' }` |
| **DELETE** | `/api/safety-events/:id` | 誤発令イベントの取り消し・削除。 | `dbo.SafetyEvents`<br>`dbo.SafetyResponses` | Path: `id` | `{ success: true }` |
| **GET** | `/api/safety-responses`<br>`/api/safety/responses` | 指定イベントまたは全イベントの安否回答状況一覧取得。 | `dbo.SafetyResponses`<br>`/data/safety_responses.json` | Query: `eventId` | `[ { id, eventId, userId, status, canWork... } ]` |
| **POST** | `/api/safety-responses`<br>`/api/safety/responses` | 社員による安否状況の登録・更新（無事・軽傷、出社可否、GPS位置情報等）。未読バッジの即時クリア連動。 | `dbo.SafetyResponses`<br>`dbo.UserReadStatuses` | Body: `{ eventId, userId, status, canWork, currentLocation, comment, locationCoordinates }` | `{ success: true, response: {...} }` |
| **POST** | `/api/safety/guest-reply`<br>`/api/safety-responses/guest` | **ログイン不要のメール直接回答URL**からの回答登録（メール記載のHMAC署名トークンを検証）。 | `dbo.SafetyResponses`<br>`dbo.SafetyEvents` | Body: `{ token, eventId, userId, status, canWork, comment }` | `{ success: true, message: '回答を受理しました' }` |
| **POST** | `/api/safety/personal-email` | 社員個人の緊急連絡先メールアドレスの登録・変更。<br>**AES-256-GCM暗号化**してDB保存、マスク文字列を返却。 | `dbo.Users` | Body: `{ userId, personalEmail }` | `{ success: true, masked: "ta***o@gmail.com" }` |
| **GET** | `/api/safety/jma-check` | 気象庁地震情報API（JMA）の定期ポーリング・手動検証。<br>設定震度以上の地震検知時に安否確認を自動発令。 | `dbo.SafetyEvents` | なし | `{ success: true, earthquakeDetected: boolean, event: {...} }` |

---

### 2.3 電子申請・ワークフロー API (`routes/workflows.js`)

| HTTPメソッド | パス (エイリアス含む) | 処理内容 | 関与テーブル / JSON | 主なパラメータ / リクエストBody | 主なレスポンス |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/workflows` | 申請一覧の取得（申請者・承認待ちステータス絞り込み）。 | `dbo.Workflows`<br>`dbo.Users`<br>`/data/workflows.json` | Query: `applicantId`, `status`, `approverId` | `[ { id, title, applicant, status, details... } ]` |
| **GET** | `/api/workflows/:id` | 単一申請の詳細データ（品目明細、ステップ履歴等）取得。 | `dbo.Workflows` | Path: `id` | `{ id, title, details: {...}, ... }` |
| **POST** | `/api/workflows` | 新規申請の起票（購入・有給・修理・経費等）。承認ルート決定および一次承認者への通知発行。 | `dbo.Workflows`<br>`dbo.ApprovalFlows`<br>`dbo.notifications` | Body: `{ title, applicantId, category, type, description, details, attachments }` | `{ success: true, id: 'wf-102', message: '申請完了' }` |
| **PUT** | `/api/workflows/:id/approve` | 承認者によるステップ承認（多段階承認の次ステップ進行または最終決裁）。 | `dbo.Workflows`<br>`dbo.notifications` | Path: `id`<br>Body: `{ approverId, comment }` | `{ success: true, status: 'approved' | 'pending' }` |
| **PUT** | `/api/workflows/:id/reject` | 承認者による申請の却下・差し戻し。 | `dbo.Workflows`<br>`dbo.notifications` | Path: `id`<br>Body: `{ approverId, reason }` | `{ success: true, status: 'rejected' }` |
| **DELETE** | `/api/workflows/:id` | 申請者本人による下書き・申請の取り下げ・削除。 | `dbo.Workflows` | Path: `id` | `{ success: true }` |

---

### 2.4 日報・週報 API (`routes/reports.js`)

| HTTPメソッド | パス (エイリアス含む) | 処理内容 | 関与テーブル / JSON | 主なパラメータ / リクエストBody | 主なレスポンス |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/work-reports`<br>`/api/daily-reports`<br>`/api/reports` | 日報・週報一覧の取得。<br>作成者ユーザー情報（氏名・部署・アバター）を自動結合して返却。 | `dbo.WorkReports`<br>`dbo.Users`<br>`/data/work_reports.json` | Query: `author_id`, `week_start_date`, `status` | `[ { id, author, week_label, tasks, achievements... } ]` |
| **GET** | `/api/work-reports/:id` | 特定の日報・週報の詳細取得。 | `dbo.WorkReports` | Path: `id` | `{ id, tasks, achievements, review_feedback... }` |
| **POST** | `/api/work-reports`<br>`/api/daily-reports` | 日報・週報の新規作成・提出。上長宛てへの通知を自動発行。 | `dbo.WorkReports`<br>`dbo.notifications` | Body: `{ author_id, supervisor_id, week_start_date, week_label, tasks, achievements, issues... }` | `{ success: true, id: 'r-101' }` |
| **PUT** | `/api/work-reports/:id` | 本人による日報・週報の修正・更新。 | `dbo.WorkReports` | Path: `id`<br>Body: 更新項目 | `{ success: true, report: {...} }` |
| **PUT** | `/api/work-reports/:id/review` | 上長による講評・フィードバック登録および査閲完了（`reviewed`）処理。 | `dbo.WorkReports`<br>`dbo.notifications` | Path: `id`<br>Body: `{ supervisor_id, review_feedback }` | `{ success: true, status: 'reviewed' }` |

---

### 2.5 カレンダー・点検スケジュール・iCal API (`routes/events.js`, `routes/ical.js`)

| HTTPメソッド | パス (エイリアス含む) | 処理内容 | 関与テーブル / JSON | 主なパラメータ / リクエストBody | 主なレスポンス |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **GET** | `/api/events` | 予定・行事一覧の取得。 | `dbo.Events`<br>`/data/events.json` | Query: `start`, `end`, `office`, `division` | `[ { id, title, startAt, endAt, isAllDay, recurrence... } ]` |
| **POST** | `/api/events` | 予定の新規登録（繰り返しルール `RRULE` 互換、点検予定下書き `draft` 対応）。 | `dbo.Events` | Body: `{ title, startAt, endAt, isAllDay, category, location, recurrence... }` | `{ id, message: '予定登録完了' }` |
| **PUT** | `/api/events/:id` | 予定の編集・更新（単一変更または繰り返し予定の変更）。 | `dbo.Events` | Path: `id`<br>Body: 更新プロパティ | `{ success: true }` |
| **DELETE** | `/api/events/:id` | 予定の削除。 | `dbo.Events` | Path: `id` | `{ success: true }` |
| **GET** | `/api/ical/export` | 全社予定・特定ユーザー予定の **iCalendar (.ics)** 形式エクスポート。 | `dbo.Events` | Query: `userId`, `office` | `Content-Type: text/calendar` (RFC 5545) |
| **POST** | `/api/ical/import` | 外部カレンダー（Outlook, Google等）の `.ics` ファイルの一括取り込み。 | `dbo.Events` | Form-Data: `file` (.ics) | `{ success: true, importedCount: 12 }` |

---

### 2.6 コミュニケーション・伝言・マスタ・インフラ API

| HTTPメソッド | パス | 処理内容 | 関与テーブル |
| :--- | :--- | :--- | :--- |
| **GET / POST** | `/api/posts` | 社内タイムライン投稿の取得・新規投稿・いいね処理。 | `dbo.Posts`, `dbo.PostTags` |
| **GET / POST** | `/api/bulletins`<br>`/api/board` | 掲示板トピックの一覧取得・新規作成・ピン留め・閲覧記録。 | `dbo.Bulletins`, `dbo.BoardComments`, `dbo.BoardViewers` |
| **GET / POST** | `/api/chats/rooms` | チャットルーム一覧取得・新規グループ作成。 | `dbo.ChatRooms` |
| **GET / POST** | `/api/chats/messages` | ルーム内メッセージ履歴取得・新規メッセージ送信。 | `dbo.ChatMessages` |
| **GET / POST / PUT** | `/api/memos` | 電話不在伝言メモの一覧取得・登録・既読ステータス更新。 | `dbo.Memos` |
| **GET** | `/api/users`<br>`/api/users/` | 全社アカウント一覧・所属情報・役職取得。 | `dbo.Users`, `/data/users.json` |
| **GET** | `/api/users/:id` | 単一ユーザー詳細情報・権限・設定取得。 | `dbo.Users`, `/data/users.json` |
| **POST / PUT** | `/api/users`<br>`/api/users/:id` | ユーザーアカウント情報の新規作成・更新。 | `dbo.Users`, `/data/users.json` |
| **PUT / POST** | `/api/users/:id/preferences`<br>`/api/users/:id/settings`<br>`/api/users/:id/notification-settings` | 個人設定・通知権限・マイページ並び順の更新（部分マージ・階層保護）。 | `dbo.Users`, `/data/users.json` |
| **POST** | `/api/users/:id/personal-email` | 緊急安否確認用個人メールアドレスの暗号化保存（AES-256-GCM）。 | `dbo.Users`, `/data/users.json` |
| **POST** | `/api/upload-avatar`<br>`/api/users/upload-avatar` | アバターアイコン画像アップロード (Multer, 2MB制限)。 | ディスク (`/uploads`) |
| **GET / POST** | `/api/masters/:type` | 事業所 (`offices`)、部署 (`divisions`)、役職 (`positions`)、品目 (`items`) のマスタ管理。 | `dbo.OfficeMaster`, `dbo.DivisionMaster`, `dbo.PositionMaster`, `dbo.ItemMasters` |
| **POST** | `/api/push/subscribe` | Web Push 端末購読情報 (`subscription`) の登録・更新。 | `dbo.push_subscriptions` |
| **POST** | `/api/push/send` | 指定社員・全社員への Web Push 即時送信。 | `dbo.push_subscriptions` |
| **POST** | `/api/email/send`<br>`/api/email/test` | 汎用 SMTP メール通知送信・接続検証テスト。 | なし (SMTP Socket) |
| **POST** | `/api/upload` | 画像・PDF・点検添付ファイルのアップロード（Multer）。 | ディスク (`/uploads`) |
