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
  email?: string;          // メールアドレス
  mobileEmail?: string;    // 携帯メールアドレス
  phone?: string;          // 旧互換用
  phoneOutside?: string;   // 電話番号（外線）
  phoneExtension?: string; // 電話番号（内線）
  mobilePhone?: string;    // 電話番号（携帯）
  icalUrl?: string;        // 外部iCal(ICS) URL連携
  supervisorId?: string;   // 上長（承認者）ユーザーID
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
  name: string; // 代表取締役, 部長, 課長, 課長補佐, 主任, 一般など
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
  attachments?: AttachmentFile[];
  memo?: string;
  isGoogleSynced: boolean;
  isIcal?: boolean; // iCal連携イベントフラグ
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
}

export type BoardCategory = 'all' | 'general' | 'hr' | 'it';

export interface BoardComment {
  id: string;
  author: User;
  content: string;
  createdAt: string;
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
  type?: 'text' | 'stamp' | 'image';
  imageUrl?: string;
  stampId?: string;
  stampText?: string;
  stampCategory?: string;
}

export interface ChatRoom {
  id: string;
  name?: string;
  type: 'dm' | 'group';
  participants: User[];
  messages: ChatMessage[];
  lastUpdated: string;
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

  // 各対象者の閲覧・対応状況
  recipientStatuses: MemoUserRecipientStatus[];
}

export interface DailyReport {
  id: string;
  author: User;
  date: string; // ISO string
  tasks: string;
  results: string;
  issues: string;
  tomorrowPlan: string;
  createdAt: string; // ISO string
}

