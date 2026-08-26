export interface CategoryEmailNotificationOption {
  pc: boolean;      // PCメール (email) 送信
  mobile: boolean;  // 携帯メール (mobileEmail) 送信
}

export interface EmailNotificationSettings {
  schedule?: CategoryEmailNotificationOption;   // スケジュール (登録・変更・参加)
  bulletin?: CategoryEmailNotificationOption;   // 掲示板 (新規投稿・閲覧依頼)
  memo?: CategoryEmailNotificationOption;       // 伝言メモ (新規伝言・宛先指定)
  workflow?: CategoryEmailNotificationOption;   // ワークフロー (承認依頼・判定結果)
  post?: CategoryEmailNotificationOption;       // 社内SNS (返信・メンション)
  inspection?: CategoryEmailNotificationOption; // 点検・報告書 (提出・レビュー依頼)
}

export interface UserPreferences {
  mypageSectionOrder?: string[];
  isSidebarCollapsed?: boolean;
  emailNotifications?: EmailNotificationSettings;
  allowedTabs?: string[];
  showInspectionScheduler?: boolean; // 点検予定管理メニューの表示（デフォルト: false / OFF）
  showSharedFiles?: boolean;         // 共有ファイルメニューの表示（デフォルト: false / OFF）
  showSafetyConfirmation?: boolean;  // 安否確認発動メニューの表示（デフォルト: false / OFF）
  hideInspectionScheduler?: boolean; // 互換用
  hideSharedFiles?: boolean;         // 互換用
  hideSafetyConfirmation?: boolean;  // 互換用
  [key: string]: any;
}

export interface User {
  id: string;
  loginId?: string;
  password?: string;
  name: string;
  kanaName?: string;     // 名前（フリガナ）
  department: string;    // 表示用（例: 名古屋 営業）
  office?: string;       // 所属拠点（例: 名古屋）
  division?: string;     // 所属部署（例: 総務）
  position?: string;     // 役職（例: 課長補佐）
  avatarUrl: string;
  isAdmin?: boolean;
  role?: 'admin' | 'user';
  email?: string;          // メールアドレス（会社PC）
  mobileEmail?: string;    // 携帯メールアドレス（会社携帯など）
  personalEmailEncrypted?: string; // 暗号化された個人メールアドレス (enc:v1:...)
  personalEmailMasked?: string;    // 表示用マスク済み個人メール (例: p***l@example.com)
  personalEmail?: string;          // 登録・更新時の入力値用
  phone?: string;          // 旧互換用
  phoneOutside?: string;   // 電話番号（外線）
  phoneExtension?: string; // 電話番号（内線）
  mobilePhone?: string;    // 電話番号（携帯）
  icalUrl?: string;        // 外部iCal(ICS) URL連携
  supervisorId?: string;   // 上長（承認者）ユーザーID
  preferences?: UserPreferences; // マイページ並び順・各種個人設定 (JSON)
}

export type OfficeType = 'headquarter' | 'branch' | 'sales_office' | 'other';

export interface OfficeMaster {
  id: string;
  name: string; // 名古屋, 浜松, 静岡, 本社など
  type: OfficeType;
  code: string;
  location?: string;
  phone?: string;
}

export interface DivisionMaster {
  id: string;
  name: string; // 管理, 営業, 設計, 工務, 保守, 保守営業, 総務など
  code: string;
  description?: string;
}

export interface PositionMaster {
  id: string;
  name: string; // 代表取締役, 部長, 課長, 課長補佐, 主任など（未選択時は役職なし/空欄）
  code: string;
  description?: string;
}

export interface Post {
  id: string;
  author: User;
  content: string;
  tags: string[];
  createdAt: string;
  likes: number;
  isLiked: boolean;
  nasLink?: string;
}

export type EventType = 'personal' | 'construction' | 'inspection' | 'replacement' | 'repair' | 'visitor' | 'business_trip';

export type RecurrenceFrequency = 'none' | 'daily' | 'weekly' | 'monthly' | 'yearly';
export type RecurrenceMonthlyType = 'same_day' | 'day_of_week'; // 同日 (例: 毎月15日) または 第X曜日 (例: 毎月第2火曜日)

export interface RecurrenceRule {
  frequency: RecurrenceFrequency;     // 'daily' | 'weekly' | 'monthly' | 'yearly'
  interval?: number;                  // 1 (毎週, 毎月など)
  daysOfWeek?: number[];              // 0: 日, 1: 月, 2: 火, 3: 水, 4: 木, 5: 金, 6: 土 (毎週で複数曜日選択可)
  monthlyType?: RecurrenceMonthlyType; // 'same_day' | 'day_of_week'
  monthDay?: number;                  // 毎月の特定日 (1~31)
  weekOfMonth?: number;               // 毎月の第何週 (1~5)
  dayOfWeek?: number;                 // 第何週の何曜日 (0~6)
  
  endType: 'never' | 'until_date' | 'count'; // 'never': 期限なし, 'until_date': 終了日指定, 'count': 回数指定
  endDate?: string;                   // 終了日 (YYYY-MM-DD)
  count?: number;                     // 繰り返し回数 (例: 10)
}

export interface CalendarEvent {
  id: string;
  title: string;
  start: string; // ISO string
  end?: string; // ISO string (optional)
  isAllDay?: boolean; // 終日フラグ
  type: EventType;
  office?: string;    // 対象拠点 (例: 全社, 名古屋支店, 本社)
  division?: string;  // 対象部署 (例: 全部署, 営業, 設計)
  location?: string;
  url?: string;
  attendees: User[];
  createdBy?: User;
  createdById?: string;
  attachments?: AttachmentFile[];
  memo?: string;
  isGoogleSynced: boolean;
  isIcal?: boolean; // iCal連携イベントフラグ

  // スケジュール・点検管理ステータス
  status?: 'pending' | 'draft' | 'published' | 'carried_over' | 'hidden';
  targetYearMonth?: string; // 点検対象年月 (例: '2026-08')
  createdViaInspection?: boolean; // 点検管理からの登録フラグ
  draftSavedAt?: string;    // 下書き・自動保存日時 (ISO string)

  // 作成・更新日時
  createdAt?: string; // 登録日時 (ISO string)
  updatedAt?: string; // 更新日時 (ISO string)

  // 繰り返し設定
  recurrence?: RecurrenceRule;
  recurrenceParentId?: string;     // 繰り返しシリーズの親イベントID（個別変更インスタンスの場合）
  recurrenceOriginalDate?: string; // 個別変更された元のインスタンス日付 (YYYY-MM-DD)
  recurrenceExceptions?: string[]; // 除外されたインスタンスの日付一覧 (YYYY-MM-DD[])
  instanceDate?: string;           // 展開されたインスタンスの日付 (YYYY-MM-DD)
}

export type ApplicationType = 'business_trip' | 'inventory_issue' | 'purchase_order' | 'other';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected' | 'draft';

export type ApproverType = 'supervisor_1' | 'supervisor_2' | 'supervisor_n' | 'specific_user' | 'supervisor';

export interface ApprovalStepConfig {
  stepNumber: number; // 1, 2, 3, ... N段階
  approverType: ApproverType; // 'supervisor_n' | 'supervisor_1' | 'supervisor_2' | 'specific_user' | 'supervisor'
  supervisorLevel?: number; // N段階目の上長階層 (1: 直属上長, 2: 二次上長, 3: 三次上長...)
  specificUserId?: string; // 個人指定の場合のユーザーID
  stepName?: string; // 表示用ステップ名
}

export interface ApprovalFlowRule {
  id: string;
  name: string;
  description?: string;
  targetApplicationType?: ApplicationType | 'all';
  steps: ApprovalStepConfig[];
  isDefault?: boolean;
}

export interface ApprovalHistoryRecord {
  stepNumber: number;
  approver: User;
  status: 'approved' | 'rejected';
  actionAt: string; // ISO string
  comment?: string;
}

export interface PurchaseOrderItem {
  id?: string;
  itemName: string;     // 品名
  quantity: number;     // 数量
  unitPrice: number;    // 想定単価
  amount: number;       // 小計 (quantity * unitPrice)
  note?: string;        // 備考
}

export interface ItemMaster {
  id: string;
  name: string;         // 品名
  category?: string;    // 分類・カテゴリ
  defaultUnitPrice?: number; // 標準単価
  unit?: string;        // 単位（個、式、本など）
  code?: string;        // 品名コード
}

export interface WorkflowApplication {
  id: string;
  type: ApplicationType;
  title: string;
  description: string;
  applicant: User;
  approver: User; // 現在の承認者
  status: ApplicationStatus;
  amount?: number;
  quantity?: number;
  startDate?: string; // ISO string
  endDate?: string; // ISO string
  createdAt: string; // ISO string

  // 発注申請用明細・関連情報
  constructionDate?: string; // 工事予定日 (YYYY-MM-DD)
  purchaseItems?: PurchaseOrderItem[];
  purchaseOrderNumber?: string; // 発注No (承認ルート/管理で付与)
  linkedInventoryIssueId?: string; // 移行作成された出庫依頼のID

  // 承認フロー拡張
  flowId?: string;
  flowName?: string;
  currentStepIndex?: number; // 1: 一次承認中, 2: 二次承認中
  totalSteps?: number;      // 1 または 2
  stepsConfig?: ApprovalStepConfig[];
  history?: ApprovalHistoryRecord[];
  rejectReason?: string;
  attachments?: AttachmentFile[];
}

export type BoardCategory = 'all' | 'general' | 'hr' | 'it';

export interface BoardComment {
  id: string;
  author: User;
  content: string;
  createdAt: string;
  attachments?: AttachmentFile[];
}

export interface BoardViewer {
  user: User;
  viewedAt: string;
}

export interface AttachmentFile {
  id: string;
  name: string;
  size: string;
  url?: string;
  type?: string;
}

export interface BoardTopic {
  id: string;
  category?: BoardCategory;
  title: string;
  content: string;
  author: User;
  createdAt: string; // ISO string
  views: number;
  commentsCount: number;
  
  // 拡張項目
  office?: string;    // 公開範囲（拠点: 全社、本社、名古屋支店など）
  division?: string;  // 公開範囲（部署: 全部署、営業、設計など）
  scope?: string;     // 公開範囲のスコープ
  tags: string[];     // タグ配列
  attachments?: AttachmentFile[];
  hasPeriod?: boolean;  // 公開期間設定（デフォルト: false）
  startDate?: string;   // YYYY-MM-DD
  endDate?: string;     // YYYY-MM-DD
  isPinned?: boolean;   // ピン留め設定
  comments?: BoardComment[];
  viewers?: BoardViewer[];
}

export interface ChatMessage {
  id: string;
  sender: User;
  content: string;
  createdAt: string; // ISO string
  type?: 'text' | 'stamp' | 'image' | 'file';
  imageUrl?: string;
  stampId?: string;
  stampText?: string;
  stampCategory?: string;
  attachments?: AttachmentFile[];
  viewers?: BoardViewer[];
}

export interface ChatRoom {
  id: string;
  name?: string;
  type: 'dm' | 'group';
  participants: User[];
  messages: ChatMessage[];
  lastUpdated: string;
  readStatus?: Record<string, string>;
  adminIds?: string[];
}

export type RequirementType = 
  | 'phone_called'       // 電話がありました
  | 'has_message'        // 伝言があります
  | 'call_again'         // 再度電話します（折り返し不要）
  | 'please_call_back'   // 折り返し連絡下さい
  | 'custom';            // 自由記入

export interface MemoUserRecipientStatus {
  userId: string;
  userName: string;
  avatarUrl?: string;
  department?: string;
  office?: string;
  division?: string;
  isViewed: boolean;
  viewedAt?: string;    // 閲覧日時 (ISO string)
  isHandled: boolean;
  handledAt?: string;   // 対応日時 (ISO string)
  handledByUserId?: string;
  handledByUserName?: string;
  status?: string;
}

export interface Memo {
  id: string;
  // 依頼者情報
  fromName: string;            // 依頼者名
  fromCompany?: string;        // 依頼者会社・組織名
  fromPhone?: string;          // 依頼者連絡先（電話番号）
  fromEmail?: string;          // 依頼者メールアドレス
  
  // 通知先
  notificationEmail?: string;       // 通知先メールアドレス
  notificationMobileEmail?: string; // 通知先携帯メールアドレス

  // 宛先指定 (拠点、部署、個人の複数指定可能)
  targetOffices?: string[];    // 指定拠点 (例: ["名古屋", "浜松"])
  targetDivisions?: string[];  // 指定部署 (例: ["営業", "総務"])
  toUsers: User[];             // 指定個人ユーザー配列
  toUser?: User;               // 旧互換用

  // 要件・本文
  requirementType: RequirementType;
  requirementText?: string;    // 要件テキスト
  content: string;             // 本文内容

  // 全体ステータス・作成情報
  status: 'unread' | 'read' | 'handled'; // 全体ステータス
  createdAt: string;           // 作成日時 ISO string
  createdByUser?: User;        // 伝言受付作成者
  senderId?: string;           // 作成者ID (DB互換)

  // 各対象者の閲覧・対応状況
  recipientStatuses: MemoUserRecipientStatus[];
}

export interface AppNotification {
  id: string;
  user_id: string;
  sender_id?: string;
  type: string;
  title: string;
  contents?: string;
  target_id?: string;
  is_read: boolean | number;
  created_at: string;
  // UI / Frontend compatibility aliases
  userId?: string;
  senderId?: string;
  senderName?: string;
  senderAvatar?: string;
  content?: string;
  targetId?: string;
  isRead?: boolean;
  createdAt?: string;
}

export type WorkReportType = 'daily' | 'weekly' | 'maintenance_daily' | 'construction_daily' | 'sales_daily';
export type WorkReportStatus = 'draft' | 'submitted' | 'reviewed';

export interface MaintenanceWorkRow {
  id: string;
  directGo?: boolean;      // 直行
  directReturn?: boolean;  // 直帰
  siteName: string;        // 現場名
  workDescription: string; // 作業内容
  district: string;        // 地区
  peopleCount: number;     // 人数
  coworkers: string;       // 同行者
  startTime: string;       // 作業時間 開始 (e.g. "07:00")
  endTime: string;         // 作業時間 終了 (e.g. "09:00")
  contentType: string;     // 内容 (EG取替, 見積, 修理, 単体取替, 点検等)
  inspectionCount: number; // 点検台数
  inspectionValue: number; // 点検数値
  oncallAmount: number;    // オンコール金額
  oncallValue: number;     // オンコール数値
  replacementCount: number;// 取替台数
  replacementAmount: number; // 取替金額
  replacementValue: number;  // 取替数値
  buildingMaterialValue: number; // 建材数値 (※手入力 - 緑色)
  workHours?: string;      // 算出作業時間 (e.g. "2:00")
}

export interface MaintenanceOfficeWorkRow {
  id: string;
  destination: string;     // 見積提出先
  content: string;         // 内容
  amount: number;          // 金額
  targetMonth: string;     // 決定予定月
  timeMinutes: number;     // 時間(分)
  remarks: string;         // 備考
}

export interface MaintenanceDailyReportData {
  date: string; // YYYY-MM-DD
  userName?: string;
  mainWorkRows: MaintenanceWorkRow[];
  officeWorkRows: MaintenanceOfficeWorkRow[];
  otherOfficeWork?: string;
  
  // 工事・集計サマリー
  constructionType?: string;    // 工事内容 (例: 両引き２)
  constructionCount?: number;   // 台数 (例: 2)
  constructionPeople?: number;  // 人数 (例: 2)
  constructionValue?: number;   // 工事数値 (※手入力 - 緑色)
  distanceValue?: number;       // 距離数値 (※手入力 - 緑色)
  
  // 時間集計
  workHours?: string;           // 作業時間
  officeHours?: string;         // 事務時間
  travelHours?: string;         // 移動時間
  breakHours?: string;          // 休憩時間
  overtimeHours?: string;       // 残業時間 (※手入力 - 緑色)
  totalHours?: string;          // 合計時間
  estimateSurveyHours?: string; // 見積、現調、貼紙

  // 集計値
  dailyTotalValue?: number;     // 当日数値合計 (自動計算)
  monthlyTotalValue?: number;   // 当月数値合計 (自動計算/累計)
}

export interface DailyReport {
  id: string;
  author: User;
  author_id?: string;
  authorId?: string;
  reportType?: WorkReportType; // 'daily' | 'weekly' | 'maintenance_daily'
  date?: string; // ISO string or YYYY-MM-DD
  week_start_date?: string; // e.g. '2026-08-17'
  weekStartDate?: string; // e.g. '2026-08-17'
  week_label?: string; // e.g. '2026年8月17日週'
  weekLabel?: string; // e.g. '2026年8月17日週'
  department?: string; // 部署 (例: '営業', '工務', '保守', '汎用')
  tasks: string; // 今週の業務内容 / 本日の業務内容
  results?: string; // 成果・気づき (互換用)
  achievements?: string; // 成果・気づき (新カラム)
  issues?: string; // 課題・問題点
  ongoingProjects?: string; // 継続案件 (互換用)
  continued_items?: string; // 継続案件 (新カラム)
  tomorrowPlan?: string; // 明日の予定 / 次週予定 (互換用)
  next_week_plans?: string; // 次週予定 (新カラム)
  supervisor_id?: string; // 提出先上長ユーザーID (新カラム)
  supervisorId?: string; // 提出先上長ユーザーID
  supervisor?: User; // 提出先上長
  status?: WorkReportStatus; // 'draft' | 'submitted' | 'reviewed'
  submittedAt?: string; // 提出日時
  reviewed_at?: string; // 上長確認日時 (新カラム)
  reviewedAt?: string; // 上長確認日時
  feedbackComment?: string; // 上長コメント・フィードバック (互換用)
  review_feedback?: string; // 上長コメント・フィードバック (新カラム)
  maintenanceData?: MaintenanceDailyReportData; // 保守日報専用構造データ
  constructionData?: Record<string, any>; // 工務日報専用拡張データ (JSON)
  salesData?: Record<string, any>; // 営業日報専用拡張データ (JSON)
  createdAt: string; // ISO string
  updated_at?: string; // 更新日時 (新カラム)
  updatedAt?: string; // 更新日時
}

export type WorkReport = DailyReport;

// ==========================================
// 安否確認システム (Safety Confirmation) 型定義
// ==========================================
export type DisasterType = 'earthquake' | 'typhoon_rain' | 'fire' | 'blackout' | 'drill' | 'other';
export type SafetyStatus = 'safe' | 'minor_injury' | 'severe_injury' | 'unknown';
export type WorkAvailability = 'available' | 'remote' | 'standby' | 'unavailable';
export type LocationStatus = 'home' | 'office' | 'traveling' | 'shelter' | 'other';

export interface SafetyConfirmationTargetFilter {
  allOffices?: boolean;
  offices?: string[]; // 対象拠点 (例: ['名古屋', '浜松'])
  allDivisions?: boolean;
  divisions?: string[]; // 対象部署 (例: ['営業', '工務'])
  targetUserIds?: string[]; // 対象ユーザーID一覧 (任意指定)
}

export interface SafetyConfirmationChannelOption {
  webPush: boolean;       // Web Push 通知
  companyEmail: boolean;  // 会社PCメール (email)
  mobileEmail: boolean;   // 携帯メール (mobileEmail)
  personalEmail: boolean; // 個人メール (暗号化保存された personalEmailEncrypted)
}

export interface SafetyConfirmationStats {
  totalTargets: number;
  respondedCount: number;
  safeCount: number;
  minorInjuryCount: number;
  severeInjuryCount: number;
  unknownCount: number;
  availableCount: number;
  remoteCount: number;
  standbyCount: number;
  unavailableCount: number;
}

export interface SafetyConfirmationEvent {
  id: string;
  title: string;              // タイトル (例: 【安否確認】愛知県西部 震度5強 地震発生)
  disasterType: DisasterType; // 災害種別 (earthquake, typhoon_rain, etc.)
  message: string;            // メッセージ・指示内容
  severity?: 'normal' | 'urgent' | 'critical'; // 緊急度
  status: 'active' | 'closed'; // 状況 (active: 回答受付中, closed: 終了・締め切り)
  targetFilter: SafetyConfirmationTargetFilter; // 対象範囲
  channels: SafetyConfirmationChannelOption; // 通知手段
  createdById: string;
  createdByName: string;
  createdAt: string;          // 発動日時 (ISO)
  closedAt?: string;          // 終了日時 (ISO)
  stats?: SafetyConfirmationStats;
}

export interface SafetyConfirmationResponse {
  id: string;
  eventId: string;
  userId: string;
  userName: string;
  office?: string;
  division?: string;
  safetyStatus: SafetyStatus;         // 安否状況 (safe / minor_injury / severe_injury)
  workAvailability: WorkAvailability; // 出社可否 (available / remote / standby / unavailable)
  locationStatus: LocationStatus;     // 現在地 (home / office / traveling / shelter / other)
  currentAddressOrNote?: string;      // 現在地詳細・避難所名等
  message?: string;                   // 本人コメント・連絡事項
  contactPhone?: string;              // 緊急時連絡先電話番号
  respondedAt: string;                // 回答日時 (ISO)
  updatedAt?: string;
}
