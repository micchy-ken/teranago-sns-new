export interface User {
  id: string;
  name: string;
  department: string;
  avatarUrl: string;
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
  end: string; // ISO string
  type: EventType;
  location?: string;
  url?: string;
  attendees: User[];
  memo?: string;
  isGoogleSynced: boolean;
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

