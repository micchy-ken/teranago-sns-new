# 寺岡オートドアSNS (寺子屋SNS) URLクエリパラメータ & ディープリンク仕様書

本ドキュメントは、**寺岡オートドアSNS（寺子屋SNS）**におけるフロントエンド（SPA）およびバックエンドAPIで対応しているすべての**URLクエリパラメータ（Query Parameters）**と**ディープリンク（Deep Link）仕様**を体系的にまとめた公式技術仕様書です。

メール通知（SMTP）、Web Push通知、社内チャットのリンク共有、QRコード、ブックマーク等からアクセスした際に、目的の機能画面や対象の個別モーダルをピンポイントで即座に展開できる設計となっています。

---

## 1. ディープリンク設計思想と特徴

1. **表記ゆれ・エイリアスの網羅的吸収**
   * 日本語（例: `?tab=カレンダー`、`?tab=掲示板`）、英語略称（例: `?tab=cal`、`?tab=wf`）、正式名称（例: `?tab=safety_confirmation`）のいずれを指定しても同一の画面へ正しくルーティングされます。
2. **自動タブ判別（パラメータ優先展開）**
   * `tab` パラメータが省略されている場合でも、`topicId` があれば掲示板へ、`appId` があればワークフローへ、`eventId` があればカレンダーへ自動的にルーティングし、対象の詳細モーダルを展開します。
3. **URL同期 & クリーンアップ**
   * モーダルを開いた際、ブラウザの `window.history.replaceState` によりアドレスバーのURLパラメータが自動的に同期されます。モーダルを閉じた際は自動的にクリーンアップされ、不要なパラメータが残留しません。

---

## 2. 画面タブ切り替えパラメータ (`tab`, `page`, `screen`)

URL例: `https://micchy-ken.github.io/teranago-sns-new/?tab=calendar`

| 遷移先機能画面 | 内部タブ識別子 (`activeTab`) | 対応しているクエリパラメータ値（大文字小文字不問） |
| :--- | :--- | :--- |
| **カレンダー（予定表）** | `calendar` | `calendar`, `cal`, `schedule`, `sche`, `予定`, `カレンダー`, `スケジュール` |
| **ワークフロー（稟議・申請）** | `workflow` | `workflow`, `wf`, `ringi`, `shinsei`, `approval`, `稟議`, `申請`, `ワークフロー` |
| **日報・週報** | `daily_report` | `daily_report`, `daily-report`, `report`, `reports`, `nippo`, `shuho`, `日報`, `週報` |
| **伝言メモ** | `memo` | `memo`, `memos`, `message`, `messages`, `denon`, `伝言`, `伝言メモ`, `メモ` |
| **社内掲示板** | `board` | `board`, `bulletin`, `bulletins`, `keijiban`, `topics`, `topic`, `掲示板` |
| **社内チャット** | `chat` | `chat`, `talk`, `dm`, `message_room`, `チャット`, `トーク` |
| **タイムライン** | `timeline` | `timeline`, `sns`, `post`, `posts`, `タイムライン` |
| **点検スケジューラー** | `inspection_scheduler` | `inspection_scheduler`, `inspection-scheduler`, `inspection`, `tenken`, `点検スケジューラー`, `点検` |
| **点検報告書一覧** | `inspection_report` | `inspection_report`, `inspection-report`, `点検報告書`, `点検報告` |
| **ファイル管理 (NAS)** | `files` | `files`, `file`, `nas`, `storage`, `ファイル`, `共有ファイル` |
| **マイページ (個人設定)** | `mypage` | `mypage`, `my`, `profile`, `personal`, `マイページ`, `設定` |
| **緊急安否確認** | `safety_confirmation` | `safety_confirmation`, `safety`, `safety-confirmation`, `anpi`, `安否確認`, `安否` |
| **システム管理パネル** | `admin` | `admin`, `kanri`, `settings`, `system`, `管理`, `管理者` |

---

## 3. コンテンツ個別詳細モーダル直開きパラメータ

URLに以下のIDパラメータを含めることで、該当画面への自動遷移と同時に対象データのポップアップモーダルが自動展開されます。

| 対象機能 | 対応パラメータ名（エイリアス） | 指定値の形式 | 動作仕様 |
| :--- | :--- | :--- | :--- |
| **掲示板トピック** | `topicId`, `topic_id`, `id` | 例: `t-1723456789` | 掲示板タブへ遷移し、該当トピックの詳細ポップアップを開く。自動的に閲覧数カウントと既読処理を実行。 |
| **チャットトーク** | `chatRoomId`, `roomId`, `room_id` | 例: `room-sales-01` | チャットタブへ遷移し、指定したトークルーム（グループまたはダイレクトメッセージ）を即時アクティブ化。 |
| **伝言メモ** | `memoId`, `memo_id` | 例: `m-1723456789` | 伝言メモタブへ遷移し、該当メモの詳細・確認モーダルを開く。 |
| **ワークフロー申請** | `applicationId`, `appId`, `app_id` | 例: `wf-101` | ワークフロータブへ遷移し、申請詳細・承認判定モーダルを開く。 |
| **カレンダー予定** | `eventId`, `event_id` | 例: `e-1723456789` | カレンダータブへ遷移し、予定詳細モーダルを開く。指定予定の日付に合わせてカレンダーの表示月週も自動スクロール。 |
| **日報・週報** | `reportId`, `report_id` | 例: `rep_1723456789` | 日報・週報タブへ遷移し、対象報告のプレビュー・上長コメントモーダルを開く。 |

---

## 4. カレンダー（予定表）の詳細絞り込み・表示初期化パラメータ

カレンダー画面を開いた際の初期表示状態（拠点、部署、表示形式、表示基準日など）をURLで細かくコントロールできます。

| パラメータ名（エイリアス） | 指定できる値の例 | 説明 |
| :--- | :--- | :--- |
| `office`, `location`, `branch`, `拠点` | `本社`, `名古屋支店`, `静岡営業所`, `浜松営業所`, `三河営業所`, `all` | 選択された拠点で予定を初期フィルタリング（未指定時はログインユーザーの所属拠点）。 |
| `division`, `dept`, `department`, `部署` | `営業部`, `工務部`, `保守部`, `管理部`, `all` | 選択された部署で予定を初期フィルタリング。 |
| `mode`, `calendarMode` | `personal` (個人表示), `team` (チーム・グループ表示) | カレンダーの表示モードを指定。 |
| `view`, `calendarView`, `scale` | `month` (月表示), `week` (週表示), `day` (日表示), `list` (一覧表示) | カレンダーの時間軸スケールを指定。 |
| `date`, `day`, `targetDate`, `d` | `YYYY-MM-DD` (例: `2026-10-01`) | カレンダーで最初に表示する基準日付を指定。 |
| `type`, `category`, `eventType` | `all`, `visit`, `meeting`, `construction`, `internal`, `leave` 等 | 予定の種別フィルターを指定。 |

* **実用例**:
  ```text
  # 名古屋支店・営業部の週間チームカレンダーを開く
  https://micchy-ken.github.io/teranago-sns-new/?tab=calendar&office=名古屋支店&division=営業部&view=week&mode=team

  # 2026年10月1日の日別スケジュールを開く
  https://micchy-ken.github.io/teranago-sns-new/?tab=calendar&view=day&date=2026-10-01
  ```

---

## 5. 緊急安否確認（ログイン不要・1タップ直接回答URL）

災害発生時に全社へ自動一斉配信されるメールやプッシュ通知に付与されるパラメータです。私用スマートフォンなど認証セッションが切れている端末からでも、安全かつ1タップで回答できる設計となっています。

| パラメータ名（エイリアス） | 説明 |
| :--- | :--- |
| `safetyEventId`, `safety_event_id` | 発動された安否確認イベントのユニークID（例: `safety_1720000000_abc`） |
| `safetyUserId`, `safety_user_id`, `uid`, `userId` | 回答対象となる社員のユーザーID（例: `u1`）。指定されている場合、回答者選択がスキップされ本人の入力フォームが即時表示されます。 |
| `safetyToken`, `token`, `t` | 改ざん防止・セキュア回答用トークン（設定時） |

* **実用例**:
  ```text
  https://micchy-ken.github.io/teranago-sns-new/?tab=safety_confirmation&safetyEventId=safety_jma_1720000&safetyUserId=u1
  ```

---

## 6. マイページ・個人設定直開きパラメータ

| パラメータ名（エイリアス） | 有効な値 | 動作仕様 |
| :--- | :--- | :--- |
| `openEmergencyContact`, `openEmergencyEmail`, `emergency` | `true`, `1` | マイページを開き、安否確認用の個人メールアドレス登録パネルを自動で開く。 |
| `openSettings`, `settings` | `true`, `1` | マイページを開き、通知設定・テーマ等の個人設定アコーディオンを自動展開。 |

---

## 7. バックエンド API 側で受け付けるクエリパラメータ一覧

フロントエンドから Express API サーバー（Synology NAS）への通信時に利用されるクエリパラメータです。

| エンドポイント | パラメータ名 | 型 / 指定値 | 用途・処理内容 |
| :--- | :--- | :--- | :--- |
| **`GET /api/external-files/list`** | `q` | `string` | NAS共有ファイル名およびパスの部分一致リアルタイム検索 |
| **`GET /api/external-files/serve`** | `path` | `string` | 配信対象となるファイルの相対パス |
| **`DELETE /api/external-files`** | `path` | `string` | 削除対象ファイルの相対パス |
| **`GET /api/bulletins/file/:name`** | `download` | `1` または `true` | ブラウザ表示ではなくファイル直接ダウンロード用ヘッダーを付与 |
| **`DELETE /api/bulletins/file`** | `fileUrl`, `filename` | `string` | 掲示板添付ファイルの削除指定 |
| **`GET /api/work-reports`** | `author_id` (`authorId`) | `string` | 作成者ユーザーIDによる週報・日報の絞り込み |
| | `supervisor_id` (`supervisorId`) | `string` | 承認上長ユーザーIDによる絞り込み |
| | `status` | `draft`, `submitted`, `reviewed` | 提出状態による絞り込み |
| | `week_start_date` (`weekStartDate`) | `YYYY-MM-DD` | 対象週による絞り込み |
| | `department` | `string` | 部署による絞り込み |
| **`GET /api/safety-responses`** | `eventId` | `string` | 特定の安否確認イベントに紐づく回答一覧取得 |
| | `userId` | `string` | 特定ユーザーの最新回答取得 |
| **`GET /api/ical/export`** | `user` | `string` (ユーザーID) | Outlook/Googleカレンダー同期用の `.ics` ファイル生成 |
| **`ALL /api/email/test`** | `to` | `string` | テストメール送信先アドレス（GETクエリ対応） |
| | `recipientName` | `string` | テストメール宛名（敬称「様」を自動付与） |
| **`GET /api/inspections/reports`** | `date`, `status`, `jobNo`, `inspectorId` | `string` | 点検報告書の抽出条件 |
| **`GET /api/inspections/crm-data`** | `yearMonth` | `YYYY-MM` | CRM点検データの月別抽出 |

---

## 8. フロントエンドにおけるパラメータ解析実装

本システムでは、React の初回ロード時およびハッシュ変更時に `src/utils/urlParams.ts` の `parseInitialUrlState()` が自動実行され、URLパラメータを解析して安全な初期状態オブジェクトへ正規化しています。

```typescript
// パラメータ解析と初期状態復元の流れ (概要)
const params = new URLSearchParams(window.location.search);

// 1. 各種エイリアスを正規化
const rawTab = params.get('tab') || params.get('page') || params.get('screen');
const activeTab = normalizeTabName(rawTab);

// 2. モーダルIDの抽出
const targetEventId = params.get('eventId') || params.get('event_id');
const targetTopicId = params.get('topicId') || params.get('topic_id') || params.get('id');
const targetAppId = params.get('applicationId') || params.get('appId') || params.get('app_id');
const targetMemoId = params.get('memoId') || params.get('memo_id');
const targetReportId = params.get('reportId') || params.get('report_id');
const targetChatRoomId = params.get('chatRoomId') || params.get('roomId') || params.get('room_id');
```
