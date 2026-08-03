import { User, Memo, WorkflowApplication, BoardTopic, CalendarEvent, ChatRoom } from '../types';

export interface NotificationItem {
  id: string;
  type: 'memo' | 'workflow' | 'board' | 'event' | 'chat';
  title: string;
  description: string;
  createdAt: string;
  tab: 'memo' | 'workflow' | 'board' | 'calendar' | 'chat' | 'mypage';
  originalData?: any;
}

// -------------------------------------------------------------
// イベント・トピック・チャット・メモの既読 LocalStorage & カスタムイベント管理
// -------------------------------------------------------------

/** 1. イベント既読 */
export function getReadEventIds(userId?: string): string[] {
  if (!userId) return [];
  try {
    const saved = localStorage.getItem(`read_events_${userId}`);
    return saved ? JSON.parse(saved) : [];
  } catch (_) {
    return [];
  }
}

export function markEventAsRead(userId?: string, eventId?: string) {
  if (!userId || !eventId) return;
  const current = getReadEventIds(userId);
  if (!current.includes(eventId)) {
    const next = [...current, eventId];
    try {
      localStorage.setItem(`read_events_${userId}`, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('notifications_updated'));
    } catch (_) {}
  }
}

export function markAllEventsAsRead(userId?: string, eventIds?: string[]) {
  if (!userId || !eventIds || !eventIds.length) return;
  const current = getReadEventIds(userId);
  const nextSet = new Set([...current, ...eventIds]);
  try {
    localStorage.setItem(`read_events_${userId}`, JSON.stringify(Array.from(nextSet)));
    window.dispatchEvent(new CustomEvent('notifications_updated'));
  } catch (_) {}
}

/** 2. 掲示板トピック既読 */
export function getReadTopicIds(userId?: string): string[] {
  if (!userId) return [];
  try {
    const saved = localStorage.getItem(`read_topics_${userId}`);
    return saved ? JSON.parse(saved) : [];
  } catch (_) {
    return [];
  }
}

export function markTopicAsRead(userId?: string, topicId?: string) {
  if (!userId || !topicId) return;
  const current = getReadTopicIds(userId);
  if (!current.includes(topicId)) {
    const next = [...current, topicId];
    try {
      localStorage.setItem(`read_topics_${userId}`, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('notifications_updated'));
    } catch (_) {}
  }
}

/** 3. チャットルーム既読 (閲覧タイムスタンプ管理) */
export function getReadChatTimestamps(userId?: string): Record<string, string> {
  if (!userId) return {};
  try {
    const saved = localStorage.getItem(`read_chats_${userId}`);
    return saved ? JSON.parse(saved) : {};
  } catch (_) {
    return {};
  }
}

export function markChatRoomAsRead(userId?: string, roomId?: string) {
  if (!userId || !roomId) return;
  const current = getReadChatTimestamps(userId);
  const next = { ...current, [roomId]: new Date().toISOString() };
  try {
    localStorage.setItem(`read_chats_${userId}`, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent('notifications_updated'));
  } catch (_) {}
}

/** 4. 伝言メモ既読 */
export function getReadMemoIds(userId?: string): string[] {
  if (!userId) return [];
  try {
    const saved = localStorage.getItem(`read_memos_${userId}`);
    return saved ? JSON.parse(saved) : [];
  } catch (_) {
    return [];
  }
}

export function markMemoAsRead(userId?: string, memoId?: string) {
  if (!userId || !memoId) return;
  const current = getReadMemoIds(userId);
  if (!current.includes(memoId)) {
    const next = [...current, memoId];
    try {
      localStorage.setItem(`read_memos_${userId}`, JSON.stringify(next));
      window.dispatchEvent(new CustomEvent('notifications_updated'));
    } catch (_) {}
  }
}

// -------------------------------------------------------------
// 個別コンテンツの未読/未確認判定関数 (統一ルール)
// -------------------------------------------------------------

/** 1. イベントの未確認判定 */
export function isEventUnread(e: CalendarEvent, user: User, readEventIds: string[] = getReadEventIds(user?.id)): boolean {
  if (!user || !e) return false;

  // Server-side viewers check
  if ((e as any).viewers && Array.isArray((e as any).viewers)) {
    const isViewedOnServer = (e as any).viewers.some((v: any) => 
      v?.userId === user.id || v?.user?.id === user.id || v?.id === user.id || v === user.id || (v?.user?.name && v?.user?.name === user.name)
    );
    if (isViewedOnServer) return false;
  }

  if (readEventIds.includes(e.id)) return false;

  const isAttendee = e.attendees ? e.attendees.some((a) => a?.id === user.id || a?.name === user.name) : false;
  const isTargetOffice = e.office === '全社' || e.office === user.office;
  return isAttendee || isTargetOffice;
}

/** 2. 掲示板トピックの未読判定 */
export function isTopicUnread(t: BoardTopic, user: User, readTopicIds: string[] = getReadTopicIds(user?.id)): boolean {
  if (!user || !t) return false;

  // Server-side viewers check
  if (t.viewers && Array.isArray(t.viewers)) {
    const isViewedOnServer = t.viewers.some((v: any) => 
      v?.user?.id === user.id || v?.userId === user.id || v?.id === user.id || v === user.id || (v?.user?.name && v?.user?.name === user.name)
    );
    if (isViewedOnServer) return false;
  }

  if (readTopicIds.includes(t.id)) return false;

  const matchOffice = !t.office || t.office === '全社' || t.office === user.office;
  const matchDivision = !t.division || t.division === '全部署' || t.division === user.division;
  if (!matchOffice || !matchDivision) return false;

  return true;
}

/** 3. 伝言メモの未完了・未読判定 */
export function isMemoUnread(m: Memo, user: User, readMemoIds: string[] = getReadMemoIds(user?.id)): boolean {
  if (!user || !m) return false;

  // 全体ステータスが対応済み(handled) または 既読(read) または isRead フラグが立っていれば未読ではない
  if (m.status === 'handled' || m.status === 'read' || (m as any).isRead === 1 || (m as any).isRead === true) return false;

  // recipientStatuses が存在する場合
  if (m.recipientStatuses && m.recipientStatuses.length > 0) {
    const userStatus = m.recipientStatuses.find((st) => st.userId === user.id);
    if (userStatus) {
      if (userStatus.isViewed || userStatus.isHandled || userStatus.status === 'read' || userStatus.status === 'handled') {
        return false;
      }
    }
  }

  if (readMemoIds.includes(m.id)) return false;

  // 自分宛て判定
  const isToUser =
    (m.toUsers && m.toUsers.some((u) => u?.id === user.id || u?.name === user.name)) ||
    (m.toUser && (m.toUser.id === user.id || m.toUser.name === user.name || (m.toUser.loginId && m.toUser.loginId === user.loginId))) ||
    (m.targetOffices && user.office && m.targetOffices.includes(user.office)) ||
    (m.targetDivisions && user.division && m.targetDivisions.includes(user.division));

  if (!isToUser) return false;

  return m.status === 'unread';
}

/** 4. ワークフロー承認依頼の未承認判定 */
export function isWorkflowPending(app: WorkflowApplication, user: User): boolean {
  if (!user || !app) return false;
  const isApprover = app.approver?.id === user.id || app.approver?.name === user.name;
  return isApprover && app.status === 'pending';
}

/** 5. チャットメッセージの未読判定 */
export function isChatUnread(room: ChatRoom, user: User, readChatTimestamps: Record<string, string> = getReadChatTimestamps(user?.id)): boolean {
  if (!user || !room || !room.messages || room.messages.length === 0) return false;
  const isParticipant = room.participants?.some((p) => p?.id === user.id || p?.name === user.name);
  if (!isParticipant) return false;

  const lastMsg = room.messages[room.messages.length - 1];
  if (lastMsg.sender?.id === user.id) return false;

  // Check server-side readStatus on room
  const serverReadTime = (room as any).readStatus?.[user.id] || (room as any).lastReadTimestamps?.[user.id];
  const localReadTime = readChatTimestamps[room.id];

  const lastReadTime = serverReadTime || localReadTime;
  if (!lastReadTime) return true;

  const msgTime = new Date(lastMsg.createdAt || room.lastUpdated || 0).getTime();
  const readTime = new Date(lastReadTime).getTime();
  return msgTime > readTime;
}

// -------------------------------------------------------------
// 統一未読通知アイテム一覧取得関数
// -------------------------------------------------------------
export function getUnreadNotifications({
  user,
  memos = [],
  applications = [],
  topics = [],
  events = [],
  chatRooms = [],
  readEventIds = getReadEventIds(user?.id),
  readTopicIds = getReadTopicIds(user?.id),
  readChatTimestamps = getReadChatTimestamps(user?.id),
  readMemoIds = getReadMemoIds(user?.id),
}: {
  user: User;
  memos?: Memo[];
  applications?: WorkflowApplication[];
  topics?: BoardTopic[];
  events?: CalendarEvent[];
  chatRooms?: ChatRoom[];
  readEventIds?: string[];
  readTopicIds?: string[];
  readChatTimestamps?: Record<string, string>;
  readMemoIds?: string[];
}): NotificationItem[] {
  if (!user) return [];

  const list: NotificationItem[] = [];

  // 1. Memos
  memos.forEach((m) => {
    if (isMemoUnread(m, user, readMemoIds)) {
      const reqMap: Record<string, string> = {
        phone_called: '電話あり',
        has_message: '伝言あり',
        call_again: '再度電話',
        please_call_back: '折り返し要',
      };
      const reqText = reqMap[m.requirementType] || m.requirementText || '伝言';
      list.push({
        id: `memo_${m.id}`,
        type: 'memo',
        title: `【伝言メモ】${m.fromCompany ? m.fromCompany + ' ' : ''}${m.fromName}様 (${reqText})`,
        description: m.content || '未対応の伝言メモが届いています。',
        createdAt: m.createdAt,
        tab: 'memo',
        originalData: m,
      });
    }
  });

  // 2. Workflows
  applications.forEach((app) => {
    if (isWorkflowPending(app, user)) {
      list.push({
        id: `wf_${app.id}`,
        type: 'workflow',
        title: `【承認依頼】${app.title || '申請'}`,
        description: `申請者: ${app.applicant?.name || '不明'} - ${app.description || ''}`,
        createdAt: app.createdAt,
        tab: 'workflow',
        originalData: app,
      });
    }
  });

  // 3. Board Topics
  topics.forEach((t) => {
    if (isTopicUnread(t, user, readTopicIds)) {
      list.push({
        id: `board_${t.id}`,
        type: 'board',
        title: `【掲示板】${t.title}`,
        description: `投稿者: ${t.author?.name || '不明'} - ${t.content?.slice(0, 50)}`,
        createdAt: t.createdAt,
        tab: 'board',
        originalData: t,
      });
    }
  });

  // 4. Events
  events.forEach((e) => {
    if (isEventUnread(e, user, readEventIds)) {
      list.push({
        id: `evt_${e.id}`,
        type: 'event',
        title: `【予定】${e.title}`,
        description: `日時: ${new Date(e.start).toLocaleString('ja-JP', {
          month: 'numeric',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit',
        })} ${e.location ? `(${e.location})` : ''}`,
        createdAt: e.start,
        tab: 'calendar',
        originalData: e,
      });
    }
  });

  // 5. Chat Rooms
  chatRooms.forEach((room) => {
    if (isChatUnread(room, user, readChatTimestamps)) {
      const lastMsg = room.messages[room.messages.length - 1];
      list.push({
        id: `chat_${room.id}`,
        type: 'chat',
        title: `【チャット】${room.name || lastMsg.sender?.name || '新着メッセージ'}`,
        description: `${lastMsg.sender?.name}: ${lastMsg.content}`,
        createdAt: lastMsg.createdAt || room.lastUpdated,
        tab: 'chat',
        originalData: room,
      });
    }
  });

  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
