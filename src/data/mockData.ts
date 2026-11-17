import { Post, User, CalendarEvent, WorkflowApplication, BoardTopic, ChatRoom, Memo, DailyReport, OfficeMaster, DivisionMaster, PositionMaster, ApprovalFlowRule, ItemMaster } from '../types';

// モックデータを排除し、空配列をエクスポート
export const initialOffices: OfficeMaster[] = [];
export const initialDivisions: DivisionMaster[] = [];
export const initialPositions: PositionMaster[] = [];
export const currentUser: User = {
  id: 'init-user',
  loginId: '',
  name: '未ログイン',
  office: '',
  division: '',
  position: '',
  department: '',
  avatarUrl: '',
  isAdmin: false,
  role: 'user'
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
