# 主要・複雑業務の処理フロー仕様書 (SYSTEM_WORKFLOWS.md)

本ドキュメントは、寺岡オートドアSNS（寺子屋SNS）において、特に高い耐障害性・セキュリティ・業務連動性が要求される**主要な複雑処理のアーキテクチャおよび処理フロー**を網羅的に解説したものです。

---

## 1. CRM点検連携 〜 報告書作成 〜 電子署名 〜 事務検印 〜 A4印刷フロー

### 1.1 業務概要
社内基幹CRMに登録されている顧客の自動ドア設備台帳データをインポートし、現場技術員による点検入力、お客様からのタブレット電子署名、営業所事務担当者による検印確認、全国自動ドア協会（JADA）基準に準拠したA4帳票出力までを一元管理します。

### 1.2 処理フローシーケンス図 (Mermaid)

```mermaid
sequenceDiagram
    autonumber
    actor CRM as 基幹CRM / 事務担当
    actor Tech as 保守点検員 (現場)
    actor Cust as お客様 (サイン担当者)
    actor Office as 営業所事務担当
    participant Client as フロントエンド (React)
    participant API as バックエンド (/api/inspections)
    participant DB as MS SQL Server & Local JSON

    %% 1. CRMインポート
    CRM->>Client: 点検対象物件・ドア仕様台帳 CSV/JSON インポート
    Client->>API: POST /api/crm/bulk (物件情報・ドア台数・各ドア仕様)
    API->>DB: MERGE INTO dbo.CrmInspections (Upsert)
    DB-->>API: 登録完了
    API-->>Client: 成功応答

    %% 2. 点検スケジューラー・点検開始
    Tech->>Client: カレンダー/スケジューラーから対象物件を選択
    Client->>API: GET /api/inspections/previous/:jobNo (前回点検結果の取得)
    API->>DB: SELECT TOP 1 FROM dbo.InspectionReports WHERE jobNo = @jobNo AND status = 'signed'
    DB-->>API: 前回の点検データ
    API-->>Client: 前回データ返却
    Client->>Client: 新規報告書モデル初期化 (ドア仕様マージ・前回結果コピー機能)

    %% 3. 現場点検 & 電子署名
    Tech->>Client: 25項目点検結果（良/要調整/要修理/該当なし）入力・総合所見記入
    Tech->>Cust: 点検結果の口頭説明 & 電子サイン画面の提示
    Cust->>Client: Canvas電子サイン描画 & 氏名入力
    Client->>Client: toDataURL('image/png') で Base64 画像化
    Tech->>Client: 「完了・署名保存」実行
    Client->>API: POST /api/inspections/reports (status='signed', customerSignature, doorsDetailsJson)
    API->>DB: MERGE INTO dbo.InspectionReports (Upsert)
    DB-->>API: 保存完了
    API-->>Client: 保存成功

    %% 4. 事務検印
    Office->>Client: 点検報告書一覧（未検印フィルター）を開く
    Office->>Client: 報告書詳細・署名・点検結果を確認後「検印（確認）」ボタンを押下
    Client->>API: PUT /api/inspections/reports/:id/confirm (user: { id, name })
    API->>DB: UPDATE dbo.InspectionReports SET officeConfirmed=1, officeConfirmedAt=NOW...
    DB-->>API: 検印完了
    API-->>Client: 最新検印状態返却

    %% 5. 印刷出力
    Office->>Client: 「点検報告書を印刷」押下
    Client->>Client: レイアウト自動判定 (5台改ページ / 15台一括 / 実台数フィット)
    Client->>Client: window.print() (CSS @media print 適用)
```

### 1.3 核心ロジックと技術的工夫
1. **多台数対応レイアウト自動判定 (`InspectionReportPrintView.tsx`)**:
   - 1物件あたり1台〜最大15台までの自動ドア点検に対応。
   - 1〜5台の場合は実台数に合わせて列幅を均等配分。
   - 6台以上の場合は、現場の要望に応じて「5台ごとの改ページ出力（標準）」と「15台一括横長ワイド出力」をワンタップで切り替え可能。
2. **JADA基準25点検項目マスターの動的カスタマイズ (`InspectionMasterStorage.ts`)**:
   - 全国自動ドア協会の点検25項目（機械室、ドアハンガー、検出装置、制御盤、本体、補助装置）を網羅。
   - 営業所・管理者権限により、独自項目の追加や表示非表示、初期判定値のカスタマイズが即時反映されます。

---

## 2. 安否確認 (BCP) 〜 気象庁速報連動 〜 暗号化同報配信 〜 ゲスト回答フロー

### 2.1 業務概要
地震・台風等の大災害発生時、全社従業員の生命と安全を最速で確認するためのBCPシステムです。気象庁の地震APIと常時連動し、震度5弱以上の地震を検知した際は自動で発令・同報通知を行います。また、社員の個人緊急連絡先メールアドレスは厳格な暗号化下で保護されています。

### 2.2 処理フローシーケンス図 (Mermaid)

```mermaid
sequenceDiagram
    autonumber
    actor Admin as 防災管理者 / 気象庁API
    actor User as 一般社員 (被災時)
    participant Server as バックエンド (/api/safety)
    participant Enc as 暗号化モジュール (AES-256-GCM)
    participant Push as Web Push & SMTP Mailer
    participant DB as MS SQL Server (dbo.Safety*)

    %% 1. 発令トリガー
    alt 気象庁API連動による自動発令
        Server->>Server: GET /api/safety/jma-check (定期ポーリング)
        Server->>Server: 震度5弱以上・設定エリアを検知
    else 管理者による手動発令・訓練発令
        Admin->>Server: POST /api/safety-events (タイトル、対象地域、メッセージ)
    end

    %% 2. イベント登録 & 同報配信
    Server->>DB: INSERT INTO dbo.SafetyEvents
    Server->>DB: SELECT id, name, personalEmailEncrypted FROM dbo.Users
    DB-->>Server: 対象社員一覧 (暗号化メール含む)

    loop 各対象社員へのマルチチャネル同報
        Server->>Push: Web Push 通知送信 (スマホ/PC端末)
        Server->>Enc: decryptText(personalEmailEncrypted)
        Enc-->>Server: 平文個人メールアドレス
        Server->>Server: ログイン不要ゲスト回答トークン生成 (HMAC-SHA256)
        Server->>Push: 緊急安否メール送信 (ゲスト回答URL: /guest-reply?token=...)
    end

    %% 3. 回答登録
    alt スマホアプリ/ブラウザから回答
        User->>Server: POST /api/safety-responses (status, canWork, GPS位置, comment)
    else メールの直接回答リンクから回答 (ログイン不要)
        User->>Server: POST /api/safety/guest-reply (token, status, canWork)
        Server->>Server: トークンの有効期限 & HMAC署名検証
    end

    %% 4. 集計 & 未読バッジクリア
    Server->>DB: INSERT INTO dbo.SafetyResponses
    Server->>DB: MERGE dbo.UserReadStatuses (既読化)
    Server-->>User: 回答完了通知
    Admin->>Server: GET /api/safety-responses (リアルタイム集計ダッシュボード)
```

### 2.3 暗号化仕様 (AES-256-GCM)
- **保管カラム**: `dbo.Users.personalEmailEncrypted`
- **暗号方式**: `AES-256-GCM` (Galois/Counter Mode)
- **フォーマット**: `{12バイトIV (Hex)}:{16バイトAuthTag (Hex)}:{暗号文 (Hex)}`
- **利点**: 改ざん検知（Integrity Check）が可能であり、平文メールアドレスがDB漏洩時にも第三者に閲覧されるリスクを完全に遮断。
- **UI表示**: 社員本人の設定画面では `ta***o@gmail.com` のようにマスキングして返却（平文は返却しない）。

---

## 3. 多段階電子申請・ワークフロー承認フロー

### 3.1 業務概要
備品・高額機器購入申請、有給休暇申請、修理申請などを電子起票し、組織マスタに基づいた多段階（一次承認：直属上長 → 二次承認：部門長 → 最終決裁：代表取締役）の承認リレーを行います。

### 3.2 処理フローシーケンス図 (Mermaid)

```mermaid
sequenceDiagram
    autonumber
    actor App as 申請者 (例: u1)
    actor Sup as 直属上長 (例: u3 課長)
    actor Dir as 最終決裁者 (例: u4 社長)
    participant Client as フロントエンド
    participant API as バックエンド (/api/workflows)
    participant DB as MS SQL Server (dbo.Workflows)

    %% 1. 起票
    App->>Client: 申請フォーム入力 (品目明細・見積書添付)
    Client->>Client: 承認フロー決定 (金額・種別に応じたステップ自動生成)
    Client->>API: POST /api/workflows (currentStepIndex=1, totalSteps=2, status='pending')
    API->>DB: INSERT INTO dbo.Workflows
    API->>API: 直属上長(u3)宛てに Web Push & メール通知発行
    API-->>Client: 起票完了

    %% 2. 一次承認
    Sup->>Client: 承認待ち一覧から申請内容・添付ファイルを確認
    Sup->>API: PUT /api/workflows/:id/approve (approverId='u3', comment='確認しました')
    API->>API: currentStepIndex (1 -> 2) を進める
    API->>DB: UPDATE dbo.Workflows SET approverId='u4', status='pending', details=...
    API->>API: 次ステップ承認者(u4 社長)宛てに通知発行
    API-->>Client: 一次承認完了

    %% 3. 最終決裁
    Dir->>Client: 申請内容を確認し「最終決裁」を実行
    Dir->>API: PUT /api/workflows/:id/approve (approverId='u4')
    API->>API: currentStepIndex == totalSteps を判定
    API->>DB: UPDATE dbo.Workflows SET status='approved', details=...
    API->>API: 申請者(u1)宛てに「決裁完了」Web Push & メール発行
    API-->>Client: 決裁完了
```

---

## 4. カレンダー・点検スケジュール・iCal 連携フロー

### 4.1 業務概要
社内スケジュール、拠点・部署行事、および自動ドア定期点検予定をカレンダー上で統合管理します。RFC 5545（iCalendar規格）に準拠した外部カレンダー（Outlook, Google Calendar, iPhone カレンダー等）との相互インポート・エクスポートに対応しています。

### 4.2 処理フローと特徴
1. **点検スケジューラー連携**:
   - `dbo.Events` の `targetYearMonth` と `status='draft'` カラムを利用し、翌月・次期点検予定の事前割り当て（ドラフト状態）を安全に保持。
   - 確定時に `status='published'` となり、現場技術員のモバイル端末に点検予定として正式配信。
2. **繰り返し予定 (RRULE) 展開エンジン (`src/utils/recurrenceUtils.ts`)**:
   - 毎週・毎月・毎年の定期予定を展開する際、DBに無限件のレコードを作成するのではなく、親イベント1件（`recurrence` ルールJSON）からクライアント表示期間（月表示・週表示）に合わせて動的展開。
   - 特定日のみの日程変更・除外（`recurrenceExceptions`）をサポート。
3. **iCalendar (.ics) 同期 (`routes/ical.js`)**:
   - `GET /api/ical/export`: 全社行事および個人担当予定を動的に `.ics` 形式でストリーミング生成。
   - `POST /api/ical/import`: Outlook等からエクスポートされた `.ics` ファイルを `mailparser` / `ical.js` でパースし、重複を検知しながら `dbo.Events` に一括インポート。

---

## 5. Web Push & SMTP メール通知パイプライン

### 5.1 概要
ユーザーがアプリを開いていない状態でも、緊急安否確認、ワークフロー承認依頼、新着伝言メモ、チャット着信を確実に届けるためのハイブリッド通知機構です。

### 5.2 ディープリンク自動解決 (`server.ts: resolveDeepLinkUrl`)
通知をクリックした際、対象のリソース（申請ID、掲示板トピックID、点検報告書ID、安否確認イベントID）が直接開くディープリンクをサーバーサイドで自動生成します。

```javascript
// ディープリンク解決ロジック抜粋
if (data.safetyEventId) return `/?tab=safety_confirmation&safetyEventId=${data.safetyEventId}`;
if (data.applicationId) return `/?tab=workflow&appId=${data.applicationId}`;
if (data.reportId)      return `/?tab=daily_report&reportId=${data.reportId}`;
if (data.bulletinId)    return `/?tab=board&topicId=${data.bulletinId}`;
if (data.memoId)        return `/?tab=memo&memoId=${data.memoId}`;
```

### 5.3 配信の耐障害性
- **Web Push**: VAPID暗号化キーを永続化（`data/vapid-keys.json` または `dbo.system_settings`）。無効になった古い購読エンドポイント（410 Gone / 404 Not Found）は自動的にDBから削除クリーンアップ。
- **SMTP メール**: 送信先サーバーの一時的な不達やポート閉塞時にも、プロセス停止（クラッシュ）を防ぐ try-catch ハンドリングを徹底。テスト環境や非接続環境ではシミュレーションモードとして正常終了を返却。
