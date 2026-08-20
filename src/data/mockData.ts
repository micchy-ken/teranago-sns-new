import { Post, User, CalendarEvent, WorkflowApplication, BoardTopic, ChatRoom, Memo, DailyReport, OfficeMaster, DivisionMaster, PositionMaster, ApprovalFlowRule, ItemMaster } from '../types';

// モックデータを排除し、空配列をエクスポート
export const initialOffices: OfficeMaster[] = [];
export const initialDivisions: DivisionMaster[] = [];
export const initialPositions: PositionMaster[] = [];
export const currentUser: User = {
  id: 'u1',
  loginId: 'yamamichi',
  password: 'test',
  name: '山道 健介',
  office: '名古屋',
  division: '総務',
  position: '課長補佐',
  department: '名古屋 総務 課長補佐',
  avatarUrl: '',
  isAdmin: true,
  role: 'admin'
};
export const allUsers: User[] = [];
export const initialPosts: Post[] = [];
export const initialEvents: CalendarEvent[] = [];
export const initialApplications: WorkflowApplication[] = [];
export const initialTopics: BoardTopic[] = [];
export const initialChatRooms: ChatRoom[] = [];
export const initialMemos: Memo[] = [];
export const initialReports: DailyReport[] = [];
export const initialApprovalFlows: ApprovalFlowRule[] = [];
export const initialItemMasters: ItemMaster[] = [];
