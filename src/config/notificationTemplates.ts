/**
 * 通知テンプレート集約マスター（Web Push・メール通知）
 *
 * - フロントエンド送信の22種類の通知はすべて本ファイルのテンプレート定義から
 *   実行時に文面・件名・詳細行・URL有無を生成します（1箇所で一元管理）。
 * - NASバックエンド（routes/safety.js, routes/invitations.js, routes/passwords.js, routes/push.js）から
 *   直接送信される7種類の通知も同一形式でカタログ登録しており、
 *   管理者メニュー「様式 ＞ 通知様式（Push・メール）」から全29種類の現行イメージをプレビューできます。
 */

import type { EmailDispatchItem, NotificationCategoryKey } from '../utils/emailNotificationDispatcher';
import { API_BASE_URL } from './api';
import { PRODUCTION_APP_URL } from './appEnvironment';

export type NotificationTemplateCategory =
  | 'report'
  | 'schedule'
  | 'board'
  | 'workflow'
  | 'memo'
  | 'chat'
  | 'project'
  | 'safety'
  | 'account';

export type NotificationEmailTheme =
  | 'standard'
  | 'safety_urgent'
  | 'safety_remind'
  | 'safety_plain'
  | 'indigo_safety_reg'
  | 'indigo_account';

export type NotificationTemplateKey =
  // 日報・週報・報告書 (5)
  | 'report_submitted'
  | 'report_remanded'
  | 'report_forwarded'
  | 'report_final_approved'
  | 'report_reviewed'
  // スケジュール・日程調整 (6)
  | 'calendar_event_created'
  | 'schedule_poll_created'
  | 'schedule_poll_member_added'
  | 'schedule_poll_updated'
  | 'schedule_poll_all_answered'
  | 'schedule_poll_confirmed'
  // 掲示板 (1)
  | 'board_topic_created'
  // ワークフロー・稟議 (6)
  | 'workflow_submitted'
  | 'workflow_resubmitted'
  | 'workflow_next_step'
  | 'workflow_approved'
  | 'workflow_rejected'
  | 'workflow_purchase_delegate'
  // 伝言メモ (1)
  | 'memo_created'
  // チャット (1)
  | 'chat_message_received'
  // プロジェクト・Todo (2)
  | 'project_assignee_added'
  | 'project_comment_added'
  // NASサーバー直接送信：安否確認 (4)
  | 'server_safety_trigger'
  | 'server_safety_remind'
  | 'server_safety_quake_auto'
  | 'server_safety_reg_request'
  // NASサーバー直接送信：アカウント・テスト (3)
  | 'server_user_invitation'
  | 'server_password_reset'
  | 'server_push_test';

export interface NotificationTemplateVariable {
  key: string;
  label: string;
  sample: string;
}

export interface NotificationPushTemplate {
  enabled: boolean;
  titleTemplate: string;
  bodyTemplate: string;
  includeUrl: boolean;
  urlTemplate: string;
  tagTemplate?: string;
  requireInteraction?: boolean;
  renotify?: boolean;
  notes?: string;
}

export interface NotificationEmailTemplate {
  enabled: boolean;
  layoutTheme: NotificationEmailTheme;
  categoryKey?: NotificationCategoryKey;
  categoryLabel: string;
  /** 実際に送信される件名テンプレート（standardでは【{{categoryLabel}}通知】{{titleTemplate}}） */
  subjectTemplate: string;
  /** emailNotificationDispatcher の item.title に相当 */
  titleTemplate: string;
  /** HTMLメールヘッダー見出し（独自テーマのサーバーメール等で使用） */
  headerTitleTemplate?: string;
  headerSubTitle?: string;
  leadTemplate?: string;
  detailsTemplate: { label: string; valueTemplate: string }[];
  mainContentLabel?: string;
  mainContentTemplate?: string;
  includeUrl: boolean;
  ctaLabel?: string;
  urlTemplate: string;
  footerNote?: string;
  plainTextOverrideTemplate?: string;
}

export interface NotificationTemplateDefinition {
  key: NotificationTemplateKey;
  category: NotificationTemplateCategory;
  categoryName: string;
  name: string;
  origin: 'frontend' | 'server';
  sourceFile: string;
  triggerTiming: string;
  recipientsSummary: string;
  variables: NotificationTemplateVariable[];
  push?: NotificationPushTemplate;
  email?: NotificationEmailTemplate;
}

export const NOTIFICATION_CATEGORY_META: {
  id: NotificationTemplateCategory;
  label: string;
  shortLabel: string;
}[] = [
  { id: 'report', label: '日報・週報・報告書', shortLabel: '日報・報告' },
  { id: 'schedule', label: 'スケジュール・日程調整', shortLabel: '予定・日程調整' },
  { id: 'board', label: '掲示板', shortLabel: '掲示板' },
  { id: 'workflow', label: 'ワークフロー・稟議', shortLabel: 'ワークフロー' },
  { id: 'memo', label: '伝言メモ', shortLabel: '伝言メモ' },
  { id: 'chat', label: 'チャット', shortLabel: 'チャット' },
  { id: 'project', label: 'プロジェクト・Todo', shortLabel: 'プロジェクト' },
  { id: 'safety', label: '安否確認（NAS側）', shortLabel: '安否確認' },
  { id: 'account', label: '招待・パスワード・テスト（NAS側）', shortLabel: 'アカウント・他' },
];

/**
 * テンプレート文字列内の {{key}} を実際の値へ差し込む
 */
export function interpolateTemplate(
  template: string,
  vars: Record<string, string | number | undefined | null>
): string {
  if (!template) return '';
  return template.replace(/\{\{(\w+)\}\}/g, (_, key: string) => {
    const val = vars[key];
    if (val === undefined || val === null) return '';
    return String(val);
  });
}

/**
 * 全29種類の現行通知テンプレート定義（ハードコード集約マスター）
 */
export const NOTIFICATION_TEMPLATES: NotificationTemplateDefinition[] = [
  // =========================================================================
  // 1. 日報・週報・報告書 (Frontend: useReportManagement.ts -> 集約済)
  // =========================================================================
  {
    key: 'report_submitted',
    category: 'report',
    categoryName: '日報・週報・報告書',
    name: '日報・週報・報告書 提出',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '社員が日報・週報・保守日報・運転記録簿等を「提出」（下書き以外）した時',
    recipientsSummary: '指定された上長（未指定時は同部署の管理職・リーダーまたは管理者）',
    variables: [
      { key: 'typeLabel', label: '報告種別', sample: '保守日報' },
      { key: 'actorName', label: '提出者名', sample: '山田 太郎' },
      { key: 'dateLabel', label: '対象日付・週', sample: '2026-11-25' },
      { key: 'mainContent', label: '成果・業務内容', sample: '名古屋エリア定期点検 4件完了。異常なし。' },
      { key: 'reportId', label: '報告書ID', sample: 'rep-1795580001' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📝 {{typeLabel}}提出: {{actorName}}さん',
      bodyTemplate: '{{dateLabel}}の{{typeLabel}}が提出されました。確認をお願いします。',
      includeUrl: true,
      urlTemplate: '/?tab=daily_report&reportId={{reportId}}',
      tagTemplate: 'report-{{reportId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'inspection',
      categoryLabel: '点検・報告書',
      subjectTemplate: '【点検・報告書通知】{{typeLabel}}提出: {{actorName}}さん',
      titleTemplate: '{{typeLabel}}提出: {{actorName}}さん',
      detailsTemplate: [
        { label: '報告種別', valueTemplate: '{{typeLabel}}' },
        { label: '対象日付', valueTemplate: '{{dateLabel}}' },
        { label: '提出者', valueTemplate: '{{actorName}}' },
      ],
      mainContentTemplate: '{{mainContent}}',
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=daily_report&reportId={{reportId}}',
    },
  },
  {
    key: 'report_remanded',
    category: 'report',
    categoryName: '日報・週報・報告書',
    name: '日報・週報 差し戻し',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '確認者が提出済み報告書を「下書き（差し戻し）」に戻した時',
    recipientsSummary: '報告書の作成者本人',
    variables: [
      { key: 'typeLabel', label: '報告種別', sample: '保守日報' },
      { key: 'actorName', label: '差し戻し者名', sample: '鈴木 部長' },
      { key: 'dateLabel', label: '対象日付・週', sample: '2026-11-25' },
      { key: 'feedbackComment', label: '差し戻しコメント', sample: '交換部品の数量欄が未記入のため修正をお願いします。' },
      { key: 'reportId', label: '報告書ID', sample: 'rep-1795580001' },
    ],
    push: {
      enabled: true,
      titleTemplate: '↩️ {{typeLabel}}差し戻し: {{actorName}}さん',
      bodyTemplate: '{{actorName}}さんより{{dateLabel}}の{{typeLabel}}が差し戻されました。修正の上、再提出してください。',
      includeUrl: true,
      urlTemplate: '/?tab=daily_report&reportId={{reportId}}',
      tagTemplate: 'report-remand-{{reportId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'inspection',
      categoryLabel: '点検・報告書',
      subjectTemplate: '【点検・報告書通知】{{typeLabel}}差し戻し: {{actorName}}さん',
      titleTemplate: '{{typeLabel}}差し戻し: {{actorName}}さん',
      detailsTemplate: [
        { label: '報告種別', valueTemplate: '{{typeLabel}}' },
        { label: '対象日付', valueTemplate: '{{dateLabel}}' },
        { label: '差し戻し者', valueTemplate: '{{actorName}}' },
        { label: 'コメント', valueTemplate: '{{feedbackComment}}' },
      ],
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=daily_report&reportId={{reportId}}',
    },
  },
  {
    key: 'report_forwarded',
    category: 'report',
    categoryName: '日報・週報・報告書',
    name: '日報・週報 確認依頼（次の上長へ回覧）',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '上長が確認後に次の上長へ回覧（提出先変更）した時',
    recipientsSummary: '次に指定された上長',
    variables: [
      { key: 'typeLabel', label: '報告種別', sample: '週報' },
      { key: 'authorName', label: '作成者名', sample: '山田 太郎' },
      { key: 'actorName', label: '前確認者名', sample: '佐藤 課長' },
      { key: 'dateLabel', label: '対象日付・週', sample: '2026-11-23週' },
      { key: 'feedbackComment', label: '回覧コメント', sample: '内容確認しました。ご承認お願いします。' },
      { key: 'reportId', label: '報告書ID', sample: 'rep-1795580002' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📄 {{typeLabel}}確認依頼（回覧）: {{authorName}}さん',
      bodyTemplate: '{{actorName}}さんより{{authorName}}さんの{{dateLabel}}の{{typeLabel}}が回覧されました。確認をお願いします。',
      includeUrl: true,
      urlTemplate: '/?tab=daily_report&reportId={{reportId}}',
      tagTemplate: 'report-fwd-{{reportId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'inspection',
      categoryLabel: '点検・報告書',
      subjectTemplate: '【点検・報告書通知】{{typeLabel}}確認依頼（回覧）: {{authorName}}さん',
      titleTemplate: '{{typeLabel}}確認依頼（回覧）: {{authorName}}さん',
      detailsTemplate: [
        { label: '報告種別', valueTemplate: '{{typeLabel}}' },
        { label: '対象日付', valueTemplate: '{{dateLabel}}' },
        { label: '作成者', valueTemplate: '{{authorName}}' },
        { label: '前確認者', valueTemplate: '{{actorName}}' },
        { label: 'コメント', valueTemplate: '{{feedbackComment}}' },
      ],
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=daily_report&reportId={{reportId}}',
    },
  },
  {
    key: 'report_final_approved',
    category: 'report',
    categoryName: '日報・週報・報告書',
    name: '日報・週報 最終承認完了',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '最終承認者が報告書を承認完了（reviewed）にした時',
    recipientsSummary: '報告書の作成者本人',
    variables: [
      { key: 'typeLabel', label: '報告種別', sample: '保守日報' },
      { key: 'actorName', label: '承認者名', sample: '鈴木 部長' },
      { key: 'dateLabel', label: '対象日付・週', sample: '2026-11-25' },
      { key: 'feedbackComment', label: 'フィードバック', sample: 'お疲れ様でした。確認完了です。' },
      { key: 'reportId', label: '報告書ID', sample: 'rep-1795580001' },
    ],
    push: {
      enabled: true,
      titleTemplate: '🎉 {{typeLabel}}最終承認完了: {{actorName}}さん',
      bodyTemplate: '{{actorName}}さんが{{dateLabel}}の{{typeLabel}}を最終承認（確認完了）しました。',
      includeUrl: true,
      urlTemplate: '/?tab=daily_report&reportId={{reportId}}',
      tagTemplate: 'report-appr-{{reportId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'inspection',
      categoryLabel: '点検・報告書',
      subjectTemplate: '【点検・報告書通知】{{typeLabel}}最終承認完了: {{actorName}}さん',
      titleTemplate: '{{typeLabel}}最終承認完了: {{actorName}}さん',
      detailsTemplate: [
        { label: '報告種別', valueTemplate: '{{typeLabel}}' },
        { label: '対象日付', valueTemplate: '{{dateLabel}}' },
        { label: '承認者', valueTemplate: '{{actorName}}' },
        { label: 'フィードバック', valueTemplate: '{{feedbackComment}}' },
      ],
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=daily_report&reportId={{reportId}}',
    },
  },
  {
    key: 'report_reviewed',
    category: 'report',
    categoryName: '日報・週報・報告書',
    name: '日報・週報 確認・フィードバック完了',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '上長が「確認完了」アクションでフィードバックを送信した時',
    recipientsSummary: '報告書の作成者本人',
    variables: [
      { key: 'typeLabel', label: '報告種別', sample: '日報' },
      { key: 'actorName', label: '確認者名', sample: '佐藤 課長' },
      { key: 'dateLabel', label: '対象日付・週', sample: '2026-11-25' },
      { key: 'feedbackQuote', label: '引用コメント（ある場合）', sample: '「明日の現場も安全第一でお願いします」' },
      { key: 'feedbackComment', label: 'フィードバック本文', sample: '明日の現場も安全第一でお願いします' },
      { key: 'reportId', label: '報告書ID', sample: 'rep-1795580003' },
    ],
    push: {
      enabled: true,
      titleTemplate: '✍️ {{typeLabel}}確認完了: {{actorName}}さん',
      bodyTemplate: '{{actorName}}さんが{{dateLabel}}の{{typeLabel}}を確認しました。{{feedbackQuote}}',
      includeUrl: true,
      urlTemplate: '/?tab=daily_report&reportId={{reportId}}',
      tagTemplate: 'report-rev-{{reportId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'inspection',
      categoryLabel: '点検・報告書',
      subjectTemplate: '【点検・報告書通知】{{typeLabel}}確認完了: {{actorName}}さん',
      titleTemplate: '{{typeLabel}}確認完了: {{actorName}}さん',
      detailsTemplate: [
        { label: '報告種別', valueTemplate: '{{typeLabel}}' },
        { label: '対象日付', valueTemplate: '{{dateLabel}}' },
        { label: '確認者', valueTemplate: '{{actorName}}' },
        { label: 'フィードバック', valueTemplate: '{{feedbackComment}}' },
      ],
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=daily_report&reportId={{reportId}}',
    },
  },

  // =========================================================================
  // 2. スケジュール・日程調整 (Frontend: App.tsx / SchedulePollModal.tsx -> 集約済)
  // =========================================================================
  {
    key: 'calendar_event_created',
    category: 'schedule',
    categoryName: 'スケジュール・日程調整',
    name: 'スケジュール 新規予定登録',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: 'カレンダーに予定を新規登録し、他の社員を参加者に設定した時',
    recipientsSummary: '参加者に含まれるメンバー（登録者本人を除く）',
    variables: [
      { key: 'eventTitle', label: '予定タイトル', sample: '名古屋営業所 定例会議' },
      { key: 'actorName', label: '登録者名', sample: '山田 太郎' },
      { key: 'dateRange', label: '日時', sample: '2026-11-27 10:00 ～ 2026-11-27 11:00' },
      { key: 'location', label: '場所', sample: '第2会議室' },
      { key: 'eventType', label: '区分', sample: '会議' },
      { key: 'memo', label: 'メモ', sample: '来月の保守点検スケジュールを確認します。' },
      { key: 'eventId', label: '予定ID', sample: 'e-1795582001' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📅 新しい予定: {{eventTitle}}',
      bodyTemplate: '{{actorName}}さんが「{{eventTitle}}」を追加しました。',
      includeUrl: true,
      urlTemplate: '/?tab=calendar&eventId={{eventId}}',
      tagTemplate: 'event-{{eventId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'schedule',
      categoryLabel: 'スケジュール',
      subjectTemplate: '【スケジュール通知】新しい予定: {{eventTitle}}',
      titleTemplate: '新しい予定: {{eventTitle}}',
      detailsTemplate: [
        { label: 'タイトル', valueTemplate: '{{eventTitle}}' },
        { label: '日時', valueTemplate: '{{dateRange}}' },
        { label: '場所', valueTemplate: '{{location}}' },
        { label: '区分', valueTemplate: '{{eventType}}' },
        { label: '登録者', valueTemplate: '{{actorName}}' },
      ],
      mainContentTemplate: '{{memo}}',
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=calendar&eventId={{eventId}}',
    },
  },
  {
    key: 'schedule_poll_created',
    category: 'schedule',
    categoryName: 'スケジュール・日程調整',
    name: '日程調整 新規作成・回答依頼',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '日程調整を新規作成・公開した時',
    recipientsSummary: '参加対象メンバー（主催者本人を除く）',
    variables: [
      { key: 'pollTitle', label: '案件名', sample: '年末工事打ち合わせ' },
      { key: 'actorName', label: '主催者名', sample: '山田 太郎' },
      { key: 'durationMinutes', label: '所要時間（分）', sample: '60' },
      { key: 'location', label: '場所', sample: 'オンライン（Teams）' },
      { key: 'deadlineLabel', label: '回答期限', sample: '2026-11-30 23:59まで' },
      { key: 'candidateSummary', label: '候補日時一覧', sample: '\n候補1: 12/02(水) 10:00〜11:00\n候補2: 12/03(木) 14:00〜15:00' },
      { key: 'mainContent', label: '概要・連絡事項', sample: '【概要・連絡事項】\nご都合の良い日時をご回答ください。' },
      { key: 'pollId', label: '日程調整ID', sample: 'poll-101' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📅 日程調整のお願い: {{pollTitle}}',
      bodyTemplate: '{{actorName}}さんから「{{pollTitle}}」の日程調整が届きました。候補日への回答をお願いします。',
      includeUrl: true,
      urlTemplate: '/?tab=calendar&pollId={{pollId}}',
      tagTemplate: 'poll-{{pollId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'schedule',
      categoryLabel: '日程調整',
      subjectTemplate: '【日程調整通知】日程調整のお願い: {{pollTitle}}',
      titleTemplate: '日程調整のお願い: {{pollTitle}}',
      detailsTemplate: [
        { label: '案件名', valueTemplate: '{{pollTitle}}' },
        { label: '所要時間', valueTemplate: '{{durationMinutes}}分' },
        { label: '主催者', valueTemplate: '{{actorName}}' },
        { label: '場所', valueTemplate: '{{location}}' },
        { label: '回答期限', valueTemplate: '{{deadlineLabel}}' },
        { label: '候補日時一覧', valueTemplate: '{{candidateSummary}}' },
      ],
      mainContentTemplate: '{{mainContent}}',
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=calendar&pollId={{pollId}}',
    },
  },
  {
    key: 'schedule_poll_member_added',
    category: 'schedule',
    categoryName: 'スケジュール・日程調整',
    name: '日程調整 追加メンバーへの回答依頼',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '既存の日程調整を再編集して参加メンバーを新規追加した時',
    recipientsSummary: '新たに追加されたメンバー',
    variables: [
      { key: 'pollTitle', label: '案件名', sample: '年末工事打ち合わせ' },
      { key: 'actorName', label: '更新者名', sample: '山田 太郎' },
      { key: 'durationMinutes', label: '所要時間（分）', sample: '60' },
      { key: 'location', label: '場所', sample: 'オンライン（Teams）' },
      { key: 'deadlineLabel', label: '回答期限', sample: '2026-11-30 23:59まで' },
      { key: 'candidateSummary', label: '候補日時一覧', sample: '\n候補1: 12/02(水) 10:00〜11:00\n候補2: 12/03(木) 14:00〜15:00' },
      { key: 'mainContent', label: '概要・連絡事項', sample: '【概要・連絡事項】\n急遽ご参加をお願いすることになりました。' },
      { key: 'pollId', label: '日程調整ID', sample: 'poll-101' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📅 日程調整のお願い: {{pollTitle}}',
      bodyTemplate: '{{actorName}}さんから「{{pollTitle}}」の日程調整に追加されました。候補日への回答をお願いします。',
      includeUrl: true,
      urlTemplate: '/?tab=calendar&pollId={{pollId}}',
      tagTemplate: 'poll-{{pollId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'schedule',
      categoryLabel: '日程調整',
      subjectTemplate: '【日程調整通知】日程調整のお願い: {{pollTitle}}',
      titleTemplate: '日程調整のお願い: {{pollTitle}}',
      detailsTemplate: [
        { label: '案件名', valueTemplate: '{{pollTitle}}' },
        { label: '所要時間', valueTemplate: '{{durationMinutes}}分' },
        { label: '主催者', valueTemplate: '{{actorName}}' },
        { label: '場所', valueTemplate: '{{location}}' },
        { label: '回答期限', valueTemplate: '{{deadlineLabel}}' },
        { label: '候補日時一覧', valueTemplate: '{{candidateSummary}}' },
      ],
      mainContentTemplate: '{{mainContent}}',
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=calendar&pollId={{pollId}}',
    },
  },
  {
    key: 'schedule_poll_updated',
    category: 'schedule',
    categoryName: 'スケジュール・日程調整',
    name: '日程調整 内容更新通知',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '既存の日程調整の候補日時・締切等を編集保存した時',
    recipientsSummary: '既存の参加対象メンバー',
    variables: [
      { key: 'pollTitle', label: '案件名', sample: '年末工事打ち合わせ' },
      { key: 'actorName', label: '更新者名', sample: '山田 太郎' },
      { key: 'changeHint', label: '変更概要（カッコ付き）', sample: '（候補枠を1件追加・回答締切を変更）' },
      { key: 'changeNotes', label: '更新内容', sample: '候補枠を1件追加 / 回答締切を変更' },
      { key: 'durationMinutes', label: '所要時間（分）', sample: '60' },
      { key: 'location', label: '場所', sample: '第1会議室' },
      { key: 'deadlineLabel', label: '回答期限', sample: '2026-12-01 23:59まで' },
      { key: 'candidateSummary', label: '最新の候補日時一覧', sample: '\n候補1: 12/02(水) 10:00〜11:00\n候補2: 12/04(金) 15:00〜16:00' },
      { key: 'mainContent', label: '本文', sample: '日程調整の内容が更新されました。\n候補日時の追加・変更がある場合は、下記リンクより回答内容の確認・更新をお願いいたします。' },
      { key: 'pollId', label: '日程調整ID', sample: 'poll-101' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📅 日程調整が更新されました: {{pollTitle}}',
      bodyTemplate: '{{actorName}}さんが「{{pollTitle}}」の内容を更新しました{{changeHint}}。必要に応じて回答をご確認ください。',
      includeUrl: true,
      urlTemplate: '/?tab=calendar&pollId={{pollId}}',
      tagTemplate: 'poll-updated-{{pollId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'schedule',
      categoryLabel: '日程調整更新',
      subjectTemplate: '【日程調整更新通知】【内容更新】日程調整: {{pollTitle}}',
      titleTemplate: '【内容更新】日程調整: {{pollTitle}}',
      detailsTemplate: [
        { label: '案件名', valueTemplate: '{{pollTitle}}' },
        { label: '所要時間', valueTemplate: '{{durationMinutes}}分' },
        { label: '場所', valueTemplate: '{{location}}' },
        { label: '回答期限', valueTemplate: '{{deadlineLabel}}' },
        { label: '更新内容', valueTemplate: '{{changeNotes}}' },
        { label: '最新の候補日時一覧', valueTemplate: '{{candidateSummary}}' },
      ],
      mainContentTemplate: '{{mainContent}}',
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=calendar&pollId={{pollId}}',
    },
  },
  {
    key: 'schedule_poll_all_answered',
    category: 'schedule',
    categoryName: 'スケジュール・日程調整',
    name: '日程調整 全員回答完了（確定依頼）',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '対象メンバー全員の回答が揃った瞬間',
    recipientsSummary: '日程調整の主催者',
    variables: [
      { key: 'pollTitle', label: '案件名', sample: '年末工事打ち合わせ' },
      { key: 'totalTargetCount', label: '対象人数', sample: '5' },
      { key: 'organizerName', label: '主催者名', sample: '山田 太郎' },
      { key: 'durationMinutes', label: '所要時間（分）', sample: '60' },
      { key: 'pollId', label: '日程調整ID', sample: 'poll-101' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📅 全員回答完了: {{pollTitle}}',
      bodyTemplate: '参加対象の全員（{{totalTargetCount}}名）の回答が集まりました！日程を確定してください。',
      includeUrl: true,
      urlTemplate: '/?tab=calendar&pollId={{pollId}}',
      tagTemplate: 'poll-all-answered-{{pollId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'schedule',
      categoryLabel: '日程調整',
      subjectTemplate: '【日程調整通知】【全員回答完了】日程の確定をお願いします: {{pollTitle}}',
      titleTemplate: '【全員回答完了】日程の確定をお願いします: {{pollTitle}}',
      detailsTemplate: [
        { label: '案件名', valueTemplate: '{{pollTitle}}' },
        { label: '回答状況', valueTemplate: '全員回答完了 ({{totalTargetCount}}/{{totalTargetCount}}名)' },
        { label: '主催者', valueTemplate: '{{organizerName}}' },
        { label: '所要時間', valueTemplate: '{{durationMinutes}}分' },
      ],
      mainContentTemplate: '参加対象のメンバー全員から回答が集まりました。\n下記リンクよりアンケート結果を確認し、確定候補日時を選択して本登録を行ってください。',
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=calendar&pollId={{pollId}}',
    },
  },
  {
    key: 'schedule_poll_confirmed',
    category: 'schedule',
    categoryName: 'スケジュール・日程調整',
    name: '日程調整 日程確定＆カレンダー登録',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '主催者が候補日時を確定しカレンダーへ本登録した時',
    recipientsSummary: '参加メンバー全員（確定操作者を除く）',
    variables: [
      { key: 'pollTitle', label: '案件名', sample: '年末工事打ち合わせ' },
      { key: 'confirmedDateTime', label: '確定日時', sample: '12/02(水) 10:00〜11:00' },
      { key: 'location', label: '場所', sample: '第1会議室' },
      { key: 'organizerName', label: '主催者名', sample: '山田 太郎' },
      { key: 'mainContent', label: '詳細・メモ', sample: '【詳細・メモ】\n資料は前日までに共有します。' },
      { key: 'pollId', label: '日程調整ID', sample: 'poll-101' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📅 日程確定: {{pollTitle}}',
      bodyTemplate: '「{{pollTitle}}」の日程が【{{confirmedDateTime}}】に確定し、カレンダーに登録されました。',
      includeUrl: true,
      urlTemplate: '/?tab=calendar',
      tagTemplate: 'poll-confirmed-{{pollId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'schedule',
      categoryLabel: '日程確定',
      subjectTemplate: '【日程確定通知】日程確定: {{pollTitle}}',
      titleTemplate: '日程確定: {{pollTitle}}',
      detailsTemplate: [
        { label: '案件名', valueTemplate: '{{pollTitle}}' },
        { label: '確定日時', valueTemplate: '{{confirmedDateTime}}' },
        { label: '場所', valueTemplate: '{{location}}' },
        { label: '主催者', valueTemplate: '{{organizerName}}' },
      ],
      mainContentTemplate: '{{mainContent}}',
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=calendar',
    },
  },

  // =========================================================================
  // 3. 掲示板 (Frontend: App.tsx -> 集約済)
  // =========================================================================
  {
    key: 'board_topic_created',
    category: 'board',
    categoryName: '掲示板',
    name: '掲示板 新着投稿',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '掲示板に新しいトピックが投稿された時',
    recipientsSummary: '公開範囲（全社 / 指定拠点・部署 / 指定メンバー）の対象者',
    variables: [
      { key: 'topicTitle', label: '投稿タイトル', sample: '年末年始の休業スケジュールについて' },
      { key: 'actorName', label: '投稿者名', sample: '総務 太郎' },
      { key: 'topicCategory', label: 'カテゴリ', sample: 'お知らせ' },
      { key: 'scopeLabel', label: '公開範囲', sample: '全社' },
      { key: 'content', label: '本文', sample: '12月29日(火)〜1月4日(月)は年末年始休業となります。緊急連絡先をご確認ください。' },
      { key: 'topicId', label: 'トピックID', sample: 'b-1795580099' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📢 掲示板新着: {{topicTitle}}',
      bodyTemplate: '{{actorName}}さんが「{{topicTitle}}」を投稿しました。',
      includeUrl: true,
      urlTemplate: '/?tab=board&topicId={{topicId}}',
      tagTemplate: 'topic-{{topicId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'bulletin',
      categoryLabel: '掲示板',
      subjectTemplate: '【掲示板通知】掲示板投稿: {{topicTitle}}',
      titleTemplate: '掲示板投稿: {{topicTitle}}',
      detailsTemplate: [
        { label: 'カテゴリ', valueTemplate: '{{topicCategory}}' },
        { label: 'タイトル', valueTemplate: '{{topicTitle}}' },
        { label: '公開範囲', valueTemplate: '{{scopeLabel}}' },
        { label: '投稿者', valueTemplate: '{{actorName}}' },
      ],
      mainContentTemplate: '{{content}}',
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=board&topicId={{topicId}}',
    },
  },

  // =========================================================================
  // 4. ワークフロー・稟議 (Frontend: App.tsx -> 集約済)
  // =========================================================================
  {
    key: 'workflow_submitted',
    category: 'workflow',
    categoryName: 'ワークフロー・稟議',
    name: 'ワークフロー 新規承認依頼',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '社員が新しいワークフロー申請（稟議・購入・休暇等）を提出した時',
    recipientsSummary: '第1ステップの承認者（OR承認の場合は全候補者）',
    variables: [
      { key: 'appTitle', label: '申請タイトル', sample: '電動工具バッテリー購入申請' },
      { key: 'applicantName', label: '申請者名', sample: '山田 太郎' },
      { key: 'typeLabel', label: '申請種別', sample: '購入申請' },
      { key: 'orTitleSuffix', label: 'OR承認表記（件名）', sample: '' },
      { key: 'orBodySuffix', label: 'OR承認表記（Push本文）', sample: '' },
      { key: 'mainContent', label: '申請理由・内容', sample: '現場作業用バッテリー劣化に伴う交換購入のため。' },
      { key: 'appId', label: '申請ID', sample: 'wf-1795583001' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📋 承認依頼: {{appTitle}}',
      bodyTemplate: '{{applicantName}}さんから新しい申請が届きました{{orBodySuffix}}。',
      includeUrl: true,
      urlTemplate: '/?tab=workflow&appId={{appId}}',
      tagTemplate: 'wf-{{appId}}',
      notes: 'OR承認時は末尾に「（OR承認・いずれか1名の承認で完了）」が付与されます。',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'workflow',
      categoryLabel: 'ワークフロー',
      subjectTemplate: '【ワークフロー通知】承認依頼{{orTitleSuffix}}: {{appTitle}}',
      titleTemplate: '承認依頼{{orTitleSuffix}}: {{appTitle}}',
      detailsTemplate: [
        { label: '申請タイトル', valueTemplate: '{{appTitle}}' },
        { label: '申請者', valueTemplate: '{{applicantName}}' },
        { label: '申請種別', valueTemplate: '{{typeLabel}}' },
      ],
      mainContentTemplate: '{{mainContent}}',
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=workflow&appId={{appId}}',
    },
  },
  {
    key: 'workflow_resubmitted',
    category: 'workflow',
    categoryName: 'ワークフロー・稟議',
    name: 'ワークフロー 再提出・承認依頼',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '下書き・差し戻し状態の申請を修正して再提出した時',
    recipientsSummary: '承認者（OR承認の場合は全候補者）',
    variables: [
      { key: 'appTitle', label: '申請タイトル', sample: '電動工具バッテリー購入申請' },
      { key: 'applicantName', label: '申請者名', sample: '山田 太郎' },
      { key: 'orTitleSuffix', label: 'OR承認表記（件名）', sample: '' },
      { key: 'orBodySuffix', label: 'OR承認表記（Push本文）', sample: '' },
      { key: 'appId', label: '申請ID', sample: 'wf-1795583001' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📋 承認依頼: {{appTitle}}',
      bodyTemplate: '{{applicantName}}さんから申請が提出されました{{orBodySuffix}}。',
      includeUrl: true,
      urlTemplate: '/?tab=workflow&appId={{appId}}',
      tagTemplate: 'wf-{{appId}}',
      notes: 'OR承認時は末尾に「（OR承認・いずれか1名）」が付与されます。',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'workflow',
      categoryLabel: 'ワークフロー',
      subjectTemplate: '【ワークフロー通知】承認依頼{{orTitleSuffix}}: {{appTitle}}',
      titleTemplate: '承認依頼{{orTitleSuffix}}: {{appTitle}}',
      detailsTemplate: [
        { label: '申請タイトル', valueTemplate: '{{appTitle}}' },
        { label: '申請者', valueTemplate: '{{applicantName}}' },
      ],
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=workflow&appId={{appId}}',
    },
  },
  {
    key: 'workflow_next_step',
    category: 'workflow',
    categoryName: 'ワークフロー・稟議',
    name: 'ワークフロー 次期承認依頼（多段階承認）',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '前段階の承認者が承認し、次の承認ステップへ進んだ時',
    recipientsSummary: '次ステップの承認者（OR承認の場合は全候補者）',
    variables: [
      { key: 'appTitle', label: '申請タイトル', sample: '電動工具バッテリー購入申請' },
      { key: 'applicantName', label: '申請者名', sample: '山田 太郎' },
      { key: 'stepProgress', label: '進行ステップ', sample: '2/3' },
      { key: 'orStepSuffix', label: 'OR承認表記（ステップ）', sample: '' },
      { key: 'orTitleSuffix', label: 'OR承認表記（件名）', sample: '' },
      { key: 'appId', label: '申請ID', sample: 'wf-1795583001' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📋 次期承認依頼: {{appTitle}}',
      bodyTemplate: '{{applicantName}}さんの申請（ステップ {{stepProgress}}{{orStepSuffix}}）の確認をお願いします。',
      includeUrl: true,
      urlTemplate: '/?tab=workflow&appId={{appId}}',
      tagTemplate: 'wf-{{appId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'workflow',
      categoryLabel: 'ワークフロー',
      subjectTemplate: '【ワークフロー通知】次期承認依頼{{orTitleSuffix}}: {{appTitle}}',
      titleTemplate: '次期承認依頼{{orTitleSuffix}}: {{appTitle}}',
      detailsTemplate: [
        { label: '申請タイトル', valueTemplate: '{{appTitle}}' },
        { label: '申請者', valueTemplate: '{{applicantName}}' },
        { label: '進行ステップ', valueTemplate: '{{stepProgress}}' },
      ],
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=workflow&appId={{appId}}',
    },
  },
  {
    key: 'workflow_approved',
    category: 'workflow',
    categoryName: 'ワークフロー・稟議',
    name: 'ワークフロー 最終承認完了',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '最終決裁者が申請を承認完了した時',
    recipientsSummary: '申請者本人',
    variables: [
      { key: 'appTitle', label: '申請タイトル', sample: '電動工具バッテリー購入申請' },
      { key: 'actorName', label: '最終承認者名', sample: '鈴木 部長' },
      { key: 'appId', label: '申請ID', sample: 'wf-1795583001' },
    ],
    push: {
      enabled: true,
      titleTemplate: '✅ 申請承認完了: {{appTitle}}',
      bodyTemplate: '{{actorName}}さんにより最終承認されました。',
      includeUrl: true,
      urlTemplate: '/?tab=workflow&appId={{appId}}',
      tagTemplate: 'wf-{{appId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'workflow',
      categoryLabel: 'ワークフロー',
      subjectTemplate: '【ワークフロー通知】申請判定: 承認完了 ({{appTitle}})',
      titleTemplate: '申請判定: 承認完了 ({{appTitle}})',
      detailsTemplate: [
        { label: '申請タイトル', valueTemplate: '{{appTitle}}' },
        { label: '判定結果', valueTemplate: '最終承認完了' },
        { label: '最終承認者', valueTemplate: '{{actorName}}' },
      ],
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=workflow&appId={{appId}}',
    },
  },
  {
    key: 'workflow_rejected',
    category: 'workflow',
    categoryName: 'ワークフロー・稟議',
    name: 'ワークフロー 申請却下（差し戻し）',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '承認者が申請を却下（差し戻し）した時',
    recipientsSummary: '申請者本人',
    variables: [
      { key: 'appTitle', label: '申請タイトル', sample: '電動工具バッテリー購入申請' },
      { key: 'actorName', label: '判定者名', sample: '鈴木 部長' },
      { key: 'reasonPush', label: '却下理由（Push用）', sample: '見積書を添付して再申請してください' },
      { key: 'reasonEmail', label: '却下理由（メール用）', sample: '見積書を添付して再申請してください' },
      { key: 'appId', label: '申請ID', sample: 'wf-1795583001' },
    ],
    push: {
      enabled: true,
      titleTemplate: '❌ 申請却下: {{appTitle}}',
      bodyTemplate: '{{actorName}}さんにより却下されました。理由: {{reasonPush}}',
      includeUrl: true,
      urlTemplate: '/?tab=workflow&appId={{appId}}',
      tagTemplate: 'wf-{{appId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'workflow',
      categoryLabel: 'ワークフロー',
      subjectTemplate: '【ワークフロー通知】申請判定: 却下 ({{appTitle}})',
      titleTemplate: '申請判定: 却下 ({{appTitle}})',
      detailsTemplate: [
        { label: '申請タイトル', valueTemplate: '{{appTitle}}' },
        { label: '判定結果', valueTemplate: '却下 (差し戻し)' },
        { label: '判定者', valueTemplate: '{{actorName}}' },
        { label: '理由・コメント', valueTemplate: '{{reasonEmail}}' },
      ],
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=workflow&appId={{appId}}',
    },
  },
  {
    key: 'workflow_purchase_delegate',
    category: 'workflow',
    categoryName: 'ワークフロー・稟議',
    name: 'ワークフロー 購入手続き依頼（手配担当者宛）',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '購入申請（代理購入指定あり）が最終承認された時',
    recipientsSummary: '購入手配の依頼先ユーザー',
    variables: [
      { key: 'appTitle', label: '申請タイトル', sample: '電動工具バッテリー購入申請' },
      { key: 'applicantName', label: '申請者名', sample: '山田 太郎' },
      { key: 'purchaseVendor', label: '購入元', sample: 'モノタロウ' },
      { key: 'purchaseTiming', label: '購入時期', sample: '至急手配' },
      { key: 'purchasePurpose', label: '購入目的', sample: '現場作業用バッテリー交換のため' },
      { key: 'actorName', label: '最終承認者名', sample: '鈴木 部長' },
      { key: 'appId', label: '申請ID', sample: 'wf-1795583001' },
    ],
    push: {
      enabled: true,
      titleTemplate: '🛒 購入手続き依頼: {{appTitle}}',
      bodyTemplate: '申請「{{appTitle}}」が決裁されました。購入・手配の手続きをお願いします。',
      includeUrl: true,
      urlTemplate: '/?tab=workflow&appId={{appId}}',
      tagTemplate: 'wf-delegate-{{appId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'workflow',
      categoryLabel: 'ワークフロー',
      subjectTemplate: '【ワークフロー通知】【購入手続き依頼】申請承認完了: {{appTitle}}',
      titleTemplate: '【購入手続き依頼】申請承認完了: {{appTitle}}',
      detailsTemplate: [
        { label: '申請タイトル', valueTemplate: '{{appTitle}}' },
        { label: '申請者', valueTemplate: '{{applicantName}}' },
        { label: '購入元', valueTemplate: '{{purchaseVendor}}' },
        { label: '購入時期', valueTemplate: '{{purchaseTiming}}' },
        { label: '購入目的', valueTemplate: '{{purchasePurpose}}' },
        { label: '最終承認者', valueTemplate: '{{actorName}}' },
      ],
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=workflow&appId={{appId}}',
    },
  },

  // =========================================================================
  // 5. 伝言メモ (Frontend: MemoList.tsx / Calendar.tsx -> 集約済)
  // =========================================================================
  {
    key: 'memo_created',
    category: 'memo',
    categoryName: '伝言メモ',
    name: '伝言メモ 新規登録',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: '伝言メモ画面またはカレンダー画面から伝言メモを作成した時',
    recipientsSummary: '宛先に指定された社員（登録者本人を除く）',
    variables: [
      { key: 'fromDisplay', label: '相手様名（会社＋氏名）', sample: '株式会社〇〇建設 田中' },
      { key: 'reqText', label: 'ご用件', sample: '折り返しお電話ください' },
      { key: 'contentSnippet', label: '伝言抜粋（先頭40文字）', sample: ' 見積金額の件で確認したいとのことです。' },
      { key: 'fromPhone', label: 'お電話番号', sample: '052-123-4567' },
      { key: 'actorName', label: '登録担当者名', sample: '磯野 りつ' },
      { key: 'content', label: '伝言本文', sample: '見積金額の件で確認したいとのことです。本日17時までにお願いします。' },
      { key: 'memoId', label: '伝言メモID', sample: 'memo-1795584001' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📞 伝言メモ: {{fromDisplay}}様',
      bodyTemplate: '【{{reqText}}】{{contentSnippet}}',
      includeUrl: true,
      urlTemplate: '/?tab=memo&memoId={{memoId}}',
      tagTemplate: 'memo-{{memoId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'memo',
      categoryLabel: '伝言メモ',
      subjectTemplate: '【伝言メモ通知】伝言メモ: {{fromDisplay}}様',
      titleTemplate: '伝言メモ: {{fromDisplay}}様',
      detailsTemplate: [
        { label: '相手様名', valueTemplate: '{{fromDisplay}} 様' },
        { label: 'お電話番号', valueTemplate: '{{fromPhone}}' },
        { label: 'ご用件', valueTemplate: '{{reqText}}' },
        { label: '登録担当者', valueTemplate: '{{actorName}}' },
      ],
      mainContentTemplate: '{{content}}',
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=memo&memoId={{memoId}}',
    },
  },

  // =========================================================================
  // 6. チャット (Frontend: Chat.tsx -> 集約済)
  // =========================================================================
  {
    key: 'chat_message_received',
    category: 'chat',
    categoryName: 'チャット',
    name: 'チャット 新着メッセージ（Web Pushのみ）',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: 'チャットルームにテキスト・写真・スタンプが送信された時',
    recipientsSummary: '同ルームの他メンバー全員（送信者本人を除く）',
    variables: [
      { key: 'actorName', label: '送信者名', sample: '山田 太郎' },
      { key: 'roomName', label: 'ルーム名', sample: '名古屋サービス連絡' },
      { key: 'previewContent', label: 'メッセージ抜粋（先頭60文字）', sample: '午後の現場、予定通り14時に到着できそうです！' },
      { key: 'roomId', label: 'ルームID', sample: 'room-101' },
    ],
    push: {
      enabled: true,
      titleTemplate: '💬 {{actorName}} ({{roomName}})',
      bodyTemplate: '{{previewContent}}',
      includeUrl: true,
      urlTemplate: '/?tab=chat&chatRoomId={{roomId}}',
      tagTemplate: 'chat-{{roomId}}',
      requireInteraction: false,
      renotify: false,
      notes: '連続受信時は Service Worker 側で同一タグの通知をまとめ、件数 [2件] を自動付与（サイレント更新）します。メール通知はありません。',
    },
  },

  // =========================================================================
  // 7. プロジェクト・Todo (Frontend: projectNotifications.ts -> 集約済)
  // =========================================================================
  {
    key: 'project_assignee_added',
    category: 'project',
    categoryName: 'プロジェクト・Todo',
    name: 'プロジェクト 担当アサイン / 担当者変更',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: 'プロジェクトカードの担当者にメンバーが新規指定・追加された時',
    recipientsSummary: '担当者に指定されたメンバー（操作者本人を除く）',
    variables: [
      { key: 'boardTitle', label: 'ボード名', sample: '新社屋リニューアル計画' },
      { key: 'kindLabel', label: '種別（タスク / メモ・資料）', sample: 'タスク' },
      { key: 'actorName', label: '指定者名', sample: '佐藤 課長' },
      { key: 'cardTitle', label: 'カードタイトル', sample: 'エントランス自動ドア仕様確認' },
      { key: 'dueDateHint', label: '期限補足（Push用）', sample: '（期限: 2026-12-05）' },
      { key: 'emailPrefix', label: '種別見出し（担当アサイン/担当者変更）', sample: '【担当アサイン】' },
      { key: 'dueDate', label: '期限', sample: '2026-12-05' },
      { key: 'priorityLabel', label: '優先度', sample: '高' },
      { key: 'description', label: '説明文', sample: '図面と型式の最終チェックをお願いします。' },
      { key: 'projectId', label: 'ボードID', sample: 'prj-01' },
      { key: 'taskId', label: 'カードID', sample: 'card-55' },
    ],
    push: {
      enabled: true,
      titleTemplate: '📌 {{boardTitle}}｜{{kindLabel}}担当に割り当て',
      bodyTemplate: '{{actorName}}さんが「{{cardTitle}}」の担当者にあなたを指定しました{{dueDateHint}}',
      includeUrl: true,
      urlTemplate: '/?tab=projects&projectId={{projectId}}&taskId={{taskId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'project',
      categoryLabel: 'プロジェクト・Todo',
      subjectTemplate: '【プロジェクト・Todo通知】{{emailPrefix}}{{cardTitle}}',
      titleTemplate: '{{emailPrefix}}{{cardTitle}}',
      detailsTemplate: [
        { label: 'ボード', valueTemplate: '{{boardTitle}}' },
        { label: '種別', valueTemplate: '{{kindLabel}}' },
        { label: 'タイトル', valueTemplate: '{{cardTitle}}' },
        { label: '期限', valueTemplate: '{{dueDate}}' },
        { label: '優先度', valueTemplate: '{{priorityLabel}}' },
      ],
      mainContentTemplate: '{{description}}',
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=projects&projectId={{projectId}}&taskId={{taskId}}',
    },
  },
  {
    key: 'project_comment_added',
    category: 'project',
    categoryName: 'プロジェクト・Todo',
    name: 'プロジェクト カードへの新着コメント',
    origin: 'frontend',
    sourceFile: 'src/config/notificationTemplates.ts',
    triggerTiming: 'プロジェクトカードにコメントが投稿された時',
    recipientsSummary: 'カードの担当者およびカード作成者（コメント投稿者を除く）',
    variables: [
      { key: 'boardTitle', label: 'ボード名', sample: '新社屋リニューアル計画' },
      { key: 'cardTitle', label: 'カードタイトル', sample: 'エントランス自動ドア仕様確認' },
      { key: 'actorName', label: 'コメント投稿者名', sample: '山田 太郎' },
      { key: 'snippet', label: 'コメント抜粋（Push用・120字）', sample: '図面の最新版を添付しました。ご確認ください。' },
      { key: 'commentText', label: 'コメント全文（メール用）', sample: '図面の最新版を添付しました。ご確認ください。' },
      { key: 'projectId', label: 'ボードID', sample: 'prj-01' },
      { key: 'taskId', label: 'カードID', sample: 'card-55' },
    ],
    push: {
      enabled: true,
      titleTemplate: '💬 {{boardTitle}}｜{{cardTitle}}',
      bodyTemplate: '{{actorName}}: {{snippet}}',
      includeUrl: true,
      urlTemplate: '/?tab=projects&projectId={{projectId}}&taskId={{taskId}}',
    },
    email: {
      enabled: true,
      layoutTheme: 'standard',
      categoryKey: 'project',
      categoryLabel: 'プロジェクト・Todo',
      subjectTemplate: '【プロジェクト・Todo通知】【新着コメント】{{cardTitle}}',
      titleTemplate: '【新着コメント】{{cardTitle}}',
      detailsTemplate: [
        { label: 'ボード', valueTemplate: '{{boardTitle}}' },
        { label: 'カード', valueTemplate: '{{cardTitle}}' },
        { label: 'コメント投稿者', valueTemplate: '{{actorName}}' },
      ],
      mainContentTemplate: '{{commentText}}',
      includeUrl: true,
      ctaLabel: '👉 該当画面を直接開く（共有リンク）',
      urlTemplate: 'tab=projects&projectId={{projectId}}&taskId={{taskId}}',
    },
  },

  // =========================================================================
  // 8. NASサーバー直接送信：安否確認 (Server: routes/safety.js)
  // =========================================================================
  {
    key: 'server_safety_trigger',
    category: 'safety',
    categoryName: '安否確認（NAS側）',
    name: '安否確認 手動発動（本番・訓練）',
    origin: 'server',
    sourceFile: 'routes/safety.js',
    triggerTiming: '管理者が安否確認（本番または訓練）を手動発動した時',
    recipientsSummary: '指定スコープ（全社 / 拠点 / 部署）の社員の会社メール・社用携帯・個人メール',
    variables: [
      { key: 'drillPrefix', label: '訓練表記', sample: '【訓練】' },
      { key: 'eventTitle', label: '安否確認タイトル', sample: '令和8年 秋季防災訓練' },
      { key: 'message', label: '本部からの連絡事項', sample: 'これは訓練です。身の安全を確認し、速やかに回答してください。' },
      { key: 'createdByName', label: '発信本部', sample: '安否確認本部' },
      { key: 'eventId', label: '安否イベントID', sample: 'sf-1795585001' },
      { key: 'userId', label: '対象社員ID', sample: 'u3' },
    ],
    email: {
      enabled: true,
      layoutTheme: 'safety_urgent',
      categoryLabel: '緊急安否確認',
      subjectTemplate: '【緊急安否確認】{{drillPrefix}}{{eventTitle}}',
      titleTemplate: '{{drillPrefix}}{{eventTitle}}',
      headerTitleTemplate: '🚨 【緊急安否確認】{{drillPrefix}}{{eventTitle}}',
      leadTemplate: '安否確認が発動されました。身の安全を確保した上で、速やかに以下のURLより現在の安否状況・出社可否をご回答ください。',
      detailsTemplate: [],
      mainContentLabel: '本部からの連絡事項:',
      mainContentTemplate: '{{message}}',
      includeUrl: true,
      ctaLabel: '👉 今すぐ安否状況を回答する (1タップ報告)',
      urlTemplate: `${PRODUCTION_APP_URL}?tab=safety_confirmation&safetyEventId={{eventId}}&safetyUserId={{userId}}`,
      footerNote: '発信本部: {{createdByName}} (TERAPO 安否確認システム)',
      plainTextOverrideTemplate: `{{recipientName}} 様\n\n【緊急安否確認】{{drillPrefix}}{{eventTitle}}\n\n■ 本部からの連絡事項:\n{{message}}\n\n至急、以下のURLを開き現在の安否状況をご回答ください。\n（スマートフォンまたはPCから1タップで簡単に回答・報告できます）\n\n▼ 安否回答用URL:\n${PRODUCTION_APP_URL}?tab=safety_confirmation&safetyEventId={{eventId}}&safetyUserId={{userId}}\n\n発動日時: 2026/11/25 16:30:00\n発信本部: {{createdByName}}`,
    },
  },
  {
    key: 'server_safety_remind',
    category: 'safety',
    categoryName: '安否確認（NAS側）',
    name: '安否確認 未回答者リマインド再送',
    origin: 'server',
    sourceFile: 'routes/safety.js',
    triggerTiming: '管理者が未回答者へリマインド再送ボタンを押した時',
    recipientsSummary: '発動中イベントの未回答社員',
    variables: [
      { key: 'eventTitle', label: '安否確認タイトル', sample: '令和8年 秋季防災訓練' },
      { key: 'senderName', label: '発信元', sample: '安否確認本部' },
      { key: 'eventId', label: '安否イベントID', sample: 'sf-1795585001' },
      { key: 'userId', label: '対象社員ID', sample: 'u3' },
    ],
    email: {
      enabled: true,
      layoutTheme: 'safety_remind',
      categoryLabel: '安否確認リマインド',
      subjectTemplate: '【再送・至急】安否確認のご回答をお願いします ({{eventTitle}})',
      titleTemplate: '【再送・至急】安否状況のご回答をお願いします',
      headerTitleTemplate: '⚠️ 【再送・至急】安否状況のご回答をお願いします',
      leadTemplate: '発動中の安否確認「{{eventTitle}}」について、まだご回答をいただいておりません。会社の安全確認および支援体制確保のため、至急現在の状況をご回答ください。',
      detailsTemplate: [],
      includeUrl: true,
      ctaLabel: '👉 今すぐ安否状況を回答する',
      urlTemplate: `${PRODUCTION_APP_URL}?tab=safety_confirmation&safetyEventId={{eventId}}&safetyUserId={{userId}}`,
      footerNote: '発信元: {{senderName}}',
      plainTextOverrideTemplate: `{{recipientName}} 様\n\n【安否確認システムからの再送連絡】\n\n発動中の安否確認（{{eventTitle}}）について、まだ回答が確認できておりません。\n\n身の安全を確保した上で、至急以下のURLより安否状況をご回答ください。\n\n▼ 安否回答用URL:\n${PRODUCTION_APP_URL}?tab=safety_confirmation&safetyEventId={{eventId}}&safetyUserId={{userId}}\n\n発動本部: {{senderName}}\n送信日時: 2026/11/25 16:45:00`,
    },
  },
  {
    key: 'server_safety_quake_auto',
    category: 'safety',
    categoryName: '安否確認（NAS側）',
    name: '安否確認 気象庁地震速報 自動発動（テキストメール）',
    origin: 'server',
    sourceFile: 'routes/safety.js',
    triggerTiming: '設定震度以上の地震を気象庁APIが検知して自動発動した時',
    recipientsSummary: '自動連動対象エリアの社員（会社メール・個人メール）',
    variables: [
      { key: 'eventTitle', label: '自動生成タイトル', sample: '震度5弱 愛知県西部（自動発動）' },
      { key: 'message', label: '地震速報メッセージ', sample: '愛知県西部で最大震度5弱の地震が発生しました。身の安全を確保し、安否状況を回答してください。' },
      { key: 'eventId', label: '安否イベントID', sample: 'sf-auto-1795586001' },
      { key: 'userId', label: '対象社員ID', sample: 'u3' },
    ],
    email: {
      enabled: true,
      layoutTheme: 'safety_plain',
      categoryLabel: '気象庁連動安否確認',
      subjectTemplate: '【緊急安否確認(気象庁連動)】{{eventTitle}}',
      titleTemplate: '{{eventTitle}}',
      leadTemplate: '{{message}}',
      detailsTemplate: [],
      includeUrl: true,
      ctaLabel: '安否回答用URL (テキストのみ)',
      urlTemplate: `${PRODUCTION_APP_URL}?tab=safety_confirmation&safetyEventId={{eventId}}&safetyUserId={{userId}}`,
      footerNote: '発信元: 気象庁 地震速報自動連動システム（※現在はプレーンテキスト形式のみで送信）',
      plainTextOverrideTemplate: `{{recipientName}} 様\n\n{{message}}\n\n▼ 安否回答用URL (1タップ報告):\n${PRODUCTION_APP_URL}?tab=safety_confirmation&safetyEventId={{eventId}}&safetyUserId={{userId}}\n\n発動日時: 2026/11/25 16:30:00\n発信元: 気象庁 地震速報自動連動システム`,
    },
  },
  {
    key: 'server_safety_reg_request',
    category: 'safety',
    categoryName: '安否確認（NAS側）',
    name: '安否確認 個人メール（緊急連絡先）登録依頼',
    origin: 'server',
    sourceFile: 'routes/safety.js',
    triggerTiming: '管理者が個人メール未登録者へ登録依頼メールを一斉送信した時',
    recipientsSummary: '選択された社員の会社メール・社用携帯メール',
    variables: [
      { key: 'customMessage', label: '管理者メッセージ', sample: '今月末までに個人メールアドレスのご登録をお願いいたします。' },
      { key: 'senderName', label: '発信元', sample: '安否確認管理者' },
    ],
    email: {
      enabled: true,
      layoutTheme: 'indigo_safety_reg',
      categoryLabel: '緊急連絡先登録依頼',
      subjectTemplate: '【安否確認・緊急連絡先登録のお願い】個人メールアドレスの登録手続きについて',
      titleTemplate: '個人メールアドレスの登録手続きについて',
      headerTitleTemplate: '🛡️ 【安否確認】緊急連絡先（個人メール）登録のお願い',
      leadTemplate: '大地震や自然災害発生時、会社のPCメールや社用携帯が使用できない場合でも確実に安否確認通知をお届けするため、ご自身の個人メールアドレスの事前登録をお願いいたします。',
      detailsTemplate: [],
      mainContentLabel: '【管理者からのメッセージ】',
      mainContentTemplate: '{{customMessage}}',
      includeUrl: true,
      ctaLabel: '👉 個人設定を開いて個人メールを登録する',
      urlTemplate: `${PRODUCTION_APP_URL}?tab=mypage&openEmergencyContact=true`,
      footerNote: '発信元: {{senderName}}（個人メールアドレスはAES-256-GCMで暗号化保護されます）',
      plainTextOverrideTemplate: `{{recipientName}} 様\n\nTERAPO 安否確認システムより、緊急連絡先（個人メールアドレス）登録のお願いです。\n\n大地震や自然災害などの有事発生時、会社のPCメールや携帯電話が使用できない場合でも確実に安否確認通知をお届けできるよう、ご自身の個人メールアドレス（Gmailや携帯キャリアメール等）の事前登録をお願いしております。\n\n【連絡事項・依頼メッセージ】\n{{customMessage}}\n\n▼ 以下のリンクをクリックすると、個人設定の緊急連絡先登録画面が直接開きます。\n${PRODUCTION_APP_URL}?tab=mypage&openEmergencyContact=true\n\n送信日時: 2026/11/25 16:30:00\n発信元: {{senderName}}`,
    },
  },

  // =========================================================================
  // 9. NASサーバー直接送信：招待・パスワード・テスト
  // =========================================================================
  {
    key: 'server_user_invitation',
    category: 'account',
    categoryName: '招待・パスワード・テスト（NAS側）',
    name: 'メンバー招待メール（新規・再送）',
    origin: 'server',
    sourceFile: 'routes/invitations.js',
    triggerTiming: '管理者が「ユーザー管理 ＞ 社員招待」から招待メールを送信／再送した時',
    recipientsSummary: '招待先のメールアドレス',
    variables: [
      { key: 'targetEmail', label: '招待先メールアドレス', sample: 'new-member@teraoka-ads.co.jp' },
      { key: 'createdByName', label: '招待者名', sample: '管理者 太郎' },
      { key: 'expiresLabel', label: '有効期限', sample: '2026/12/02 16:30:00' },
      { key: 'token', label: '招待トークン', sample: 'inv_sample_token_xxxx' },
    ],
    email: {
      enabled: true,
      layoutTheme: 'indigo_account',
      categoryLabel: 'メンバー招待',
      subjectTemplate: '【TERAPO】社内ポータルへの招待が届きました',
      titleTemplate: '社内ポータルへの招待が届きました',
      headerTitleTemplate: 'TERAPO へようこそ',
      headerSubTitle: 'メンバー招待のお知らせ',
      leadTemplate: '{{createdByName}} 様より、TERAPO（社内SNS・グループウェア）への招待が届きました。下のボタンをクリックして、氏名やログインパスワード等の必須項目を設定し、アカウントを開設してください。',
      detailsTemplate: [],
      includeUrl: true,
      ctaLabel: '👉 アカウントを登録して参加する',
      urlTemplate: `${PRODUCTION_APP_URL}?mode=invite&token={{token}}`,
      footerNote: '※再送時は件名先頭に【再送】が付与されます。有効期限: {{expiresLabel}} まで',
      plainTextOverrideTemplate: `{{targetEmail}} 様\n\n{{createdByName}}様より、TERAPOへの招待が届いています。\n以下のリンクを開き、アカウントの初期設定（氏名・パスワード設定等）を完了してください。\n\n▼ アカウント初期登録URL:\n${PRODUCTION_APP_URL}?mode=invite&token={{token}}\n\n※有効期限: {{expiresLabel}} まで\n※心当たりのない場合は本メールを破棄してください。`,
    },
  },
  {
    key: 'server_password_reset',
    category: 'account',
    categoryName: '招待・パスワード・テスト（NAS側）',
    name: 'パスワード設定・再設定案内メール',
    origin: 'server',
    sourceFile: 'routes/passwords.js',
    triggerTiming: '管理者がユーザーへパスワード設定リンクを個別送信または一斉送信した時',
    recipientsSummary: '対象社員の登録メールアドレス',
    variables: [
      { key: 'senderName', label: '送信管理者名', sample: 'システム管理者' },
      { key: 'expiresLabel', label: '有効期間', sample: '7日間' },
      { key: 'expiresJstStr', label: '有効期限日時', sample: '2026/12/02 16:30' },
      { key: 'token', label: '再設定トークン', sample: 'rst_sample_token_xxxx' },
    ],
    email: {
      enabled: true,
      layoutTheme: 'indigo_account',
      categoryLabel: 'パスワード設定',
      subjectTemplate: '【TERAPO】パスワード設定のお願い',
      titleTemplate: 'パスワード設定のお願い',
      headerTitleTemplate: 'パスワード設定のお願い',
      headerSubTitle: 'TERAPO',
      leadTemplate: '管理者（{{senderName}}）より、パスワード設定の依頼が届いています。下のボタンをクリックして、新しいパスワードを設定してください。',
      detailsTemplate: [],
      includeUrl: true,
      ctaLabel: '🔑 新しいパスワードを設定する',
      urlTemplate: `${PRODUCTION_APP_URL}?mode=reset-password&token={{token}}`,
      footerNote: '※有効期限: {{expiresLabel}}（{{expiresJstStr}} まで）',
      plainTextOverrideTemplate: `{{recipientName}} 様\n\n{{senderName}}様より、TERAPOのパスワード設定依頼が届いています。\n以下のリンクを開き、新しいパスワードを設定してください。\n\n▼ パスワード設定URL:\n${PRODUCTION_APP_URL}?mode=reset-password&token={{token}}\n\n※有効期限: {{expiresLabel}}（{{expiresJstStr}} まで）\n※心当たりのない場合は管理者までご連絡ください。`,
    },
  },
  {
    key: 'server_push_test',
    category: 'account',
    categoryName: '招待・パスワード・テスト（NAS側）',
    name: 'Web Push テスト通知',
    origin: 'server',
    sourceFile: 'routes/push.js',
    triggerTiming: 'ユーザーが個人設定「通知センター」からテスト通知送信ボタンを押した時',
    recipientsSummary: 'テストを実行したユーザー本人の登録端末',
    variables: [],
    push: {
      enabled: true,
      titleTemplate: '🔔 テスト通知 (TERAPO)',
      bodyTemplate: 'プッシュ通知が正常に機能しています！スマホ・PCへのリアルタイム通知が有効です。',
      includeUrl: true,
      urlTemplate: '/',
      tagTemplate: 'test-push',
      notes: 'routes/push.js 内のテスト送信エンドポイント（POST /api/push/test）に定義されています。',
    },
  },
];

const TEMPLATE_MAP: Record<NotificationTemplateKey, NotificationTemplateDefinition> =
  NOTIFICATION_TEMPLATES.reduce((acc, item) => {
    acc[item.key] = item;
    return acc;
  }, {} as Record<NotificationTemplateKey, NotificationTemplateDefinition>);

export interface NotificationPushOverride {
  titleTemplate?: string;
  bodyTemplate?: string;
  includeUrl?: boolean;
}

export interface NotificationEmailOverride {
  subjectTemplate?: string;
  titleTemplate?: string;
  headerTitleTemplate?: string;
  leadTemplate?: string;
  mainContentTemplate?: string;
  ctaLabel?: string;
  includeUrl?: boolean;
}

export interface NotificationTemplateOverride {
  push?: NotificationPushOverride;
  email?: NotificationEmailOverride;
}

export interface NotificationTemplatesStoreMeta {
  updatedAt: string | null;
  updatedBy: string | null;
  synced: boolean;
  serverAvailable: boolean;
  lastError: string | null;
}

export interface NotificationTemplatesActionResult {
  ok: boolean;
  serverAvailable: boolean;
  status?: number;
  error?: string;
  message?: string;
}

const TEMPLATE_OVERRIDES_STORAGE_KEY = 'teranago_notification_templates_v1';

let liveTemplateOverrides: Partial<Record<NotificationTemplateKey, NotificationTemplateOverride>> = {};
let liveStoreMeta: NotificationTemplatesStoreMeta = {
  updatedAt: null,
  updatedBy: null,
  synced: false,
  serverAvailable: true,
  lastError: null,
};

const templateSubscribers = new Set<() => void>();

function notifyTemplateSubscribers() {
  templateSubscribers.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore listener errors
    }
  });
}

function loadOverridesFromLocalCache() {
  if (typeof window === 'undefined') return;
  try {
    const raw = localStorage.getItem(TEMPLATE_OVERRIDES_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      if (parsed.templates && typeof parsed.templates === 'object' && !Array.isArray(parsed.templates)) {
        liveTemplateOverrides = parsed.templates;
        liveStoreMeta = {
          ...liveStoreMeta,
          updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
          updatedBy: typeof parsed.updatedBy === 'string' ? parsed.updatedBy : null,
        };
      }
    }
  } catch {
    // ignore storage/parse errors
  }
}

function persistOverridesToLocalCache() {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(
      TEMPLATE_OVERRIDES_STORAGE_KEY,
      JSON.stringify({
        version: 1,
        updatedAt: liveStoreMeta.updatedAt,
        updatedBy: liveStoreMeta.updatedBy,
        templates: liveTemplateOverrides,
      })
    );
  } catch {
    // ignore storage errors
  }
}

// 初期起動時にローカルキャッシュがあれば即座に反映（NAS同期完了前のチラつきを防止）
loadOverridesFromLocalCache();

export function subscribeNotificationTemplates(listener: () => void): () => void {
  templateSubscribers.add(listener);
  return () => {
    templateSubscribers.delete(listener);
  };
}

export function getNotificationTemplateOverrides(): Partial<
  Record<NotificationTemplateKey, NotificationTemplateOverride>
> {
  return { ...liveTemplateOverrides };
}

export function getNotificationTemplatesMeta(): NotificationTemplatesStoreMeta {
  return { ...liveStoreMeta };
}

export function getNotificationTemplate(key: NotificationTemplateKey): NotificationTemplateDefinition {
  return TEMPLATE_MAP[key];
}

/**
 * ベース定義に上書き設定をマージした実効テンプレートを返す
 */
export function applyOverrideToTemplate(
  base: NotificationTemplateDefinition,
  override?: NotificationTemplateOverride | null
): NotificationTemplateDefinition {
  if (!override) return base;
  return {
    ...base,
    push: base.push
      ? {
          ...base.push,
          ...(override.push?.titleTemplate !== undefined ? { titleTemplate: override.push.titleTemplate } : {}),
          ...(override.push?.bodyTemplate !== undefined ? { bodyTemplate: override.push.bodyTemplate } : {}),
          ...(override.push?.includeUrl !== undefined ? { includeUrl: override.push.includeUrl } : {}),
        }
      : undefined,
    email: base.email
      ? {
          ...base.email,
          ...(override.email?.subjectTemplate !== undefined ? { subjectTemplate: override.email.subjectTemplate } : {}),
          ...(override.email?.titleTemplate !== undefined ? { titleTemplate: override.email.titleTemplate } : {}),
          ...(override.email?.headerTitleTemplate !== undefined
            ? { headerTitleTemplate: override.email.headerTitleTemplate }
            : {}),
          ...(override.email?.leadTemplate !== undefined ? { leadTemplate: override.email.leadTemplate } : {}),
          ...(override.email?.mainContentTemplate !== undefined
            ? { mainContentTemplate: override.email.mainContentTemplate }
            : {}),
          ...(override.email?.ctaLabel !== undefined ? { ctaLabel: override.email.ctaLabel } : {}),
          ...(override.email?.includeUrl !== undefined ? { includeUrl: override.email.includeUrl } : {}),
        }
      : undefined,
  };
}

/**
 * 現在の有効テンプレート（初期値 + NAS保存済み上書き設定）を取得
 */
export function getEffectiveNotificationTemplate(
  key: NotificationTemplateKey
): NotificationTemplateDefinition {
  const base = TEMPLATE_MAP[key];
  const override = liveTemplateOverrides[key];
  return applyOverrideToTemplate(base, override);
}

/**
 * NAS サーバーから最新の通知テンプレート上書き設定を同期
 */
export async function syncNotificationTemplatesFromServer(): Promise<NotificationTemplatesActionResult> {
  try {
    const resp = await fetch(`${API_BASE_URL}/notification-templates`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    if (resp.status === 404) {
      liveStoreMeta = {
        ...liveStoreMeta,
        synced: false,
        serverAvailable: false,
        lastError: 'NASサーバー側に /api/notification-templates がまだ配置されていません（初期値で動作中）。',
      };
      notifyTemplateSubscribers();
      return {
        ok: false,
        serverAvailable: false,
        status: 404,
        error: liveStoreMeta.lastError || undefined,
      };
    }

    if (!resp.ok) {
      const errJson = await resp.json().catch(() => ({}));
      const msg = errJson.error || `同期に失敗しました (HTTP ${resp.status})`;
      liveStoreMeta = {
        ...liveStoreMeta,
        synced: false,
        serverAvailable: resp.status !== 502 && resp.status !== 503,
        lastError: msg,
      };
      notifyTemplateSubscribers();
      return { ok: false, serverAvailable: liveStoreMeta.serverAvailable, status: resp.status, error: msg };
    }

    const data = await resp.json();
    const templates =
      data && typeof data.templates === 'object' && !Array.isArray(data.templates)
        ? (data.templates as Partial<Record<NotificationTemplateKey, NotificationTemplateOverride>>)
        : {};

    liveTemplateOverrides = templates;
    liveStoreMeta = {
      updatedAt: typeof data?.updatedAt === 'string' ? data.updatedAt : null,
      updatedBy: typeof data?.updatedBy === 'string' ? data.updatedBy : null,
      synced: true,
      serverAvailable: true,
      lastError: null,
    };
    persistOverridesToLocalCache();
    notifyTemplateSubscribers();

    return { ok: true, serverAvailable: true, status: resp.status };
  } catch (err: any) {
    const msg = err?.message || 'NASサーバーとの通信に失敗しました。';
    liveStoreMeta = {
      ...liveStoreMeta,
      synced: false,
      serverAvailable: false,
      lastError: msg,
    };
    notifyTemplateSubscribers();
    return { ok: false, serverAvailable: false, error: msg };
  }
}

/**
 * 単一テンプレートの上書き設定を NAS サーバーへ保存（管理者専用）
 */
export async function saveNotificationTemplateOverride(
  key: NotificationTemplateKey,
  override: NotificationTemplateOverride,
  updatedBy?: string
): Promise<NotificationTemplatesActionResult> {
  try {
    const resp = await fetch(`${API_BASE_URL}/notification-templates/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        override,
        updatedBy: updatedBy || undefined,
      }),
    });

    if (resp.status === 404) {
      const msg = 'NASサーバー側に /api/notification-templates がまだ反映されていません。NAS側の配置後に再度保存してください。';
      liveStoreMeta = { ...liveStoreMeta, serverAvailable: false, lastError: msg };
      notifyTemplateSubscribers();
      return { ok: false, serverAvailable: false, status: 404, error: msg };
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      const msg = data.error || `保存に失敗しました (HTTP ${resp.status})`;
      return { ok: false, serverAvailable: true, status: resp.status, error: msg };
    }

    if (data.templates && typeof data.templates === 'object' && !Array.isArray(data.templates)) {
      liveTemplateOverrides = data.templates;
    } else {
      liveTemplateOverrides = { ...liveTemplateOverrides, [key]: override };
    }
    liveStoreMeta = {
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
      updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : (updatedBy || liveStoreMeta.updatedBy),
      synced: true,
      serverAvailable: true,
      lastError: null,
    };
    persistOverridesToLocalCache();
    notifyTemplateSubscribers();

    return {
      ok: true,
      serverAvailable: true,
      status: resp.status,
      message: data.message || '通知テンプレートを保存しました。',
    };
  } catch (err: any) {
    return {
      ok: false,
      serverAvailable: false,
      error: err?.message || '通信エラーにより保存できませんでした。',
    };
  }
}

/**
 * 単一テンプレートの上書き設定を削除して初期値へ戻す（管理者専用）
 */
export async function resetNotificationTemplateOverride(
  key: NotificationTemplateKey,
  updatedBy?: string
): Promise<NotificationTemplatesActionResult> {
  try {
    const resp = await fetch(`${API_BASE_URL}/notification-templates/${encodeURIComponent(key)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedBy: updatedBy || undefined }),
    });

    if (resp.status === 404) {
      const msg = 'NASサーバー側に /api/notification-templates がまだ反映されていません。';
      liveStoreMeta = { ...liveStoreMeta, serverAvailable: false, lastError: msg };
      notifyTemplateSubscribers();
      return { ok: false, serverAvailable: false, status: 404, error: msg };
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        ok: false,
        serverAvailable: true,
        status: resp.status,
        error: data.error || `初期値リセットに失敗しました (HTTP ${resp.status})`,
      };
    }

    if (data.templates && typeof data.templates === 'object' && !Array.isArray(data.templates)) {
      liveTemplateOverrides = data.templates;
    } else {
      const next = { ...liveTemplateOverrides };
      delete next[key];
      liveTemplateOverrides = next;
    }
    liveStoreMeta = {
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
      updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : (updatedBy || liveStoreMeta.updatedBy),
      synced: true,
      serverAvailable: true,
      lastError: null,
    };
    persistOverridesToLocalCache();
    notifyTemplateSubscribers();

    return {
      ok: true,
      serverAvailable: true,
      status: resp.status,
      message: data.message || '選択した通知テンプレートを初期値に戻しました。',
    };
  } catch (err: any) {
    return {
      ok: false,
      serverAvailable: false,
      error: err?.message || '通信エラーによりリセットできませんでした。',
    };
  }
}

/**
 * 全テンプレートを初期値へ一括リセット（管理者専用）
 */
export async function resetAllNotificationTemplateOverrides(
  updatedBy?: string
): Promise<NotificationTemplatesActionResult> {
  try {
    const resp = await fetch(`${API_BASE_URL}/notification-templates/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ updatedBy: updatedBy || undefined }),
    });

    if (resp.status === 404) {
      const msg = 'NASサーバー側に /api/notification-templates がまだ反映されていません。';
      return { ok: false, serverAvailable: false, status: 404, error: msg };
    }

    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) {
      return {
        ok: false,
        serverAvailable: true,
        status: resp.status,
        error: data.error || `全リセットに失敗しました (HTTP ${resp.status})`,
      };
    }

    liveTemplateOverrides = {};
    liveStoreMeta = {
      updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString(),
      updatedBy: typeof data.updatedBy === 'string' ? data.updatedBy : (updatedBy || liveStoreMeta.updatedBy),
      synced: true,
      serverAvailable: true,
      lastError: null,
    };
    persistOverridesToLocalCache();
    notifyTemplateSubscribers();

    return {
      ok: true,
      serverAvailable: true,
      status: resp.status,
      message: data.message || 'すべての通知テンプレートを初期値に戻しました。',
    };
  } catch (err: any) {
    return {
      ok: false,
      serverAvailable: false,
      error: err?.message || '通信エラーによりリセットできませんでした。',
    };
  }
}

/**
 * テンプレート定義（＋NAS保存済み上書き設定）から Web Push 送信用の title / body / url / tag / includeUrl を生成
 */
export function buildPushFromTemplate(
  key: NotificationTemplateKey,
  vars: Record<string, string | number | undefined | null>,
  overrides?: {
    url?: string;
    tag?: string;
    includeUrl?: boolean;
    requireInteraction?: boolean;
    renotify?: boolean;
  }
): {
  title: string;
  body: string;
  url?: string;
  includeUrl: boolean;
  tag?: string;
  requireInteraction?: boolean;
  renotify?: boolean;
} {
  const def = getEffectiveNotificationTemplate(key);
  const push = def?.push;
  if (!push) {
    return { title: '', body: '', includeUrl: false };
  }

  const includeUrl = overrides?.includeUrl !== undefined ? overrides.includeUrl : push.includeUrl;
  const resolvedUrl = includeUrl
    ? (overrides?.url !== undefined ? overrides.url : interpolateTemplate(push.urlTemplate, vars))
    : undefined;
  const resolvedTag = overrides?.tag !== undefined
    ? overrides.tag
    : (push.tagTemplate ? interpolateTemplate(push.tagTemplate, vars) : undefined);

  return {
    title: interpolateTemplate(push.titleTemplate, vars),
    body: interpolateTemplate(push.bodyTemplate, vars),
    url: resolvedUrl,
    includeUrl,
    tag: resolvedTag,
    requireInteraction: overrides?.requireInteraction !== undefined ? overrides.requireInteraction : push.requireInteraction,
    renotify: overrides?.renotify !== undefined ? overrides.renotify : push.renotify,
  };
}

/**
 * テンプレート定義（＋NAS保存済み上書き設定）から EmailDispatchItem を生成
 */
export function buildEmailFromTemplate(
  key: NotificationTemplateKey,
  vars: Record<string, string | number | undefined | null>,
  options: {
    actorName: string;
    extraDetails?: { label: string; value: string }[];
    mainContent?: string;
    pathParams?: string;
    shareUrl?: string;
    includeUrl?: boolean;
  }
): EmailDispatchItem {
  const def = getEffectiveNotificationTemplate(key);
  const savedOverride = liveTemplateOverrides[key];
  const email = def?.email;
  if (!email) {
    throw new Error(`Email template not defined for key: ${key}`);
  }

  const mergedVars: Record<string, string | number | undefined | null> = {
    actorName: options.actorName,
    ...vars,
    ...(options.mainContent !== undefined && vars.mainContent === undefined
      ? { mainContent: options.mainContent }
      : {}),
  };

  const baseDetails = email.detailsTemplate.map((d) => ({
    label: d.label,
    value: interpolateTemplate(d.valueTemplate, mergedVars),
  }));
  const details = options.extraDetails && options.extraDetails.length > 0
    ? [...baseDetails, ...options.extraDetails]
    : baseDetails;

  const hasCustomMainContentTemplate = savedOverride?.email?.mainContentTemplate !== undefined;
  const resolvedMainContent = hasCustomMainContentTemplate
    ? interpolateTemplate(email.mainContentTemplate || '', mergedVars)
    : options.mainContent !== undefined
    ? options.mainContent
    : (email.mainContentTemplate ? interpolateTemplate(email.mainContentTemplate, mergedVars) : undefined);

  const includeUrl = options.includeUrl !== undefined ? options.includeUrl : email.includeUrl;
  const resolvedPathParams = includeUrl
    ? (options.pathParams !== undefined ? options.pathParams : interpolateTemplate(email.urlTemplate, mergedVars))
    : undefined;

  const resolvedSubject = email.subjectTemplate
    ? interpolateTemplate(email.subjectTemplate, mergedVars)
    : undefined;
  const resolvedLead = email.leadTemplate && email.leadTemplate.trim()
    ? interpolateTemplate(email.leadTemplate, mergedVars)
    : undefined;

  return {
    category: email.categoryKey || 'schedule',
    categoryLabel: email.categoryLabel,
    title: interpolateTemplate(email.titleTemplate, mergedVars),
    subjectOverride: resolvedSubject && resolvedSubject.trim() ? resolvedSubject : undefined,
    leadOverride: resolvedLead && resolvedLead.trim() ? resolvedLead : undefined,
    ctaLabel: email.ctaLabel,
    actorName: options.actorName,
    details,
    mainContent: resolvedMainContent && resolvedMainContent.trim() ? resolvedMainContent : undefined,
    shareUrl: includeUrl ? options.shareUrl : undefined,
    pathParams: resolvedPathParams,
    includeUrl,
  };
}

/**
 * プレビュー画面用にサンプル変数マップを生成
 */
export function getTemplateSampleVars(def: NotificationTemplateDefinition): Record<string, string> {
  const vars: Record<string, string> = {
    recipientName: '寺岡 花子',
  };
  for (const v of def.variables) {
    vars[v.key] = v.sample;
  }
  return vars;
}

/**
 * プレビュー画面用：実送信と同じフォーマットでテキストメール全文をレンダリング
 */
export function renderEmailPlainTextPreview(
  def: NotificationTemplateDefinition,
  vars: Record<string, string>
): string {
  const email = def.email;
  if (!email) return '';

  const recipientName = def.key === 'server_user_invitation'
    ? (vars.targetEmail || 'new-member@teraoka-ads.co.jp')
    : (vars.recipientName || '寺岡 花子');
  const rawUrl = email.includeUrl ? interpolateTemplate(email.urlTemplate, vars) : '';
  const fullShareUrl = rawUrl
    ? (rawUrl.startsWith('http') ? rawUrl : `${PRODUCTION_APP_URL}?${rawUrl.replace(/^\/?\??/, '')}`)
    : '';

  // 独自レイアウト（安否確認・招待・パスワード等）のテキストプレビュー
  if (email.layoutTheme === 'safety_plain') {
    const bodyText = email.mainContentTemplate
      ? interpolateTemplate(email.mainContentTemplate, vars)
      : email.plainTextOverrideTemplate
      ? interpolateTemplate(email.plainTextOverrideTemplate, vars)
      : '';
    if (!email.includeUrl && bodyText) {
      return bodyText.replace(/\n*▼\s*安否回答URL:[\s\S]*?(?=\n\n|$)/, '').trim();
    }
    return bodyText;
  }

  if (
    email.layoutTheme === 'safety_urgent' ||
    email.layoutTheme === 'safety_remind' ||
    email.layoutTheme === 'indigo_safety_reg' ||
    email.layoutTheme === 'indigo_account'
  ) {
    const headerTitle = email.headerTitleTemplate ? interpolateTemplate(email.headerTitleTemplate, vars) : '';
    const leadText = email.leadTemplate ? interpolateTemplate(email.leadTemplate, vars) : '';
    const mainContent = email.mainContentTemplate ? interpolateTemplate(email.mainContentTemplate, vars).trim() : '';
    const footerText = email.footerNote ? interpolateTemplate(email.footerNote, vars) : '';

    const customLines: string[] = [`${recipientName} 様`, ''];
    if (headerTitle) customLines.push(`■ ${headerTitle}`, '');
    if (leadText) customLines.push(leadText);
    if (mainContent) {
      customLines.push('', `【${email.mainContentLabel || '連絡事項'}】`, mainContent);
    }
    if (email.includeUrl && fullShareUrl) {
      customLines.push('', `▼ ${email.ctaLabel || 'URL'}:`, fullShareUrl);
    }
    if (footerText) {
      customLines.push('', footerText);
    }
    return customLines.join('\n');
  }

  const actor = vars.actorName || vars.applicantName || vars.organizerName || '山田 太郎';
  const nowStr = '2026/11/25 16:30:00';
  const details = email.detailsTemplate.map((d) => ({
    label: d.label,
    value: interpolateTemplate(d.valueTemplate, vars),
  }));
  const customLead = email.leadTemplate ? interpolateTemplate(email.leadTemplate, vars).trim() : '';
  const mainContent = email.mainContentTemplate ? interpolateTemplate(email.mainContentTemplate, vars) : '';

  const lines = [
    `${recipientName} 様`,
    '',
    customLead || `TERAPO から【${email.categoryLabel}】に関する通知です。`,
    `操作・更新者: ${actor}`,
    `日時: ${nowStr}`,
    '',
    '----------------------------------------',
    '■ 主な内容・詳細',
    ...details.map((d) => `${d.label}: ${d.value}`),
  ];

  if (mainContent.trim()) {
    lines.push('', '【本文・備考】', mainContent);
  }

  if (fullShareUrl) {
    lines.push(
      '',
      '----------------------------------------',
      '■ 詳細・該当画面への共有リンク',
      fullShareUrl
    );
  }

  lines.push('', '※本メールはTERAPO通知設定に基づいて自動配信されています。');
  return lines.join('\n');
}
