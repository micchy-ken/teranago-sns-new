export interface User {
  id: string;
  name: string;
  department: string; // 表示用（例: 名古屋支店 営業）
  office?: string;    // 所属拠点（例: 名古屋支店）
  division?: string;  // 所属部署（例: 営業）
  avatarUrl: string;
  isAdmin?: boolean;
  role?: 'admin' | 'user';
  email?: string;
  phone?: string;
  icalUrl?: string;   // 外部iCal(ICS) URL連携
}

export type OfficeType = 'headquarter' | 'branch' | 'sales_office' | 'other';

export interface OfficeMaster {
  id: string;
  name: string; // 名古屋支店, 浜松営業所, 静岡営業所, 本社など
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

export type EventType = 'company' | 'team' | 'personal';

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
  memo?: string;
  isGoogleSynced: boolean;
  isIcal?: boolean; // iCal連携イベントフラグ
}

export type ApplicationType = 'business_trip' | 'inventory_issue' | 'purchase_order' | 'other';
export type ApplicationStatus = 'pending' | 'approved' | 'rejected';

export interface WorkflowApplication {
  id: string;
  type: ApplicationType;
  title: string;
  description: string;
  applicant: User;
  approver: User;
  status: ApplicationStatus;
  amount?: number;
  quantity?: number;
  startDate?: string; // ISO string
  endDate?: string; // ISO string
  createdAt: string; // ISO string
}

export type BoardCategory = 'all' | 'general' | 'hr' | 'it';

export interface BoardTopic {
  id: string;
  category: BoardCategory;
  title: string;
  content: string;
  author: User;
  createdAt: string; // ISO string
  views: number;
  commentsCount: number;
}

export interface ChatMessage {
  id: string;
  sender: User;
  content: string;
  createdAt: string; // ISO string
}

export interface ChatRoom {
  id: string;
  name?: string;
  type: 'dm' | 'group';
  participants: User[];
  messages: ChatMessage[];
  lastUpdated: string;
}

export interface Memo {
  id: string;
  fromName: string; // Name of the person who called
  fromCompany?: string; // Company of the person who called
  toUser: User;
  content: string;
  status: 'unread' | 'read';
  createdAt: string; // ISO string
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

