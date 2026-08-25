import { User, Memo, WorkflowApplication, BoardTopic, CalendarEvent, ChatRoom, DailyReport } from '../types';
import { API_BASE_URL } from '../config/api';

export interface NotificationItem {
  id: string;
  type: 'memo' | 'workflow' | 'board' | 'event' | 'chat' | 'report';
  title: string;
  description: string;
  createdAt: string;
  tab: 'memo' | 'workflow' | 'board' | 'calendar' | 'chat' | 'daily_report' | 'mypage';
  originalData?: any;
}

// -------------------------------------------------------------
// イベント・トピック・チャット・メモ・日報の既読 インメモリキャッシュ管理（LocalStorageは一切使用しない）
// -------------------------------------------------------------

// 指定ユーザーごとのインメモリ既読状態キャッシュ
const memoryReadEventIds: Record<string, string[]> = {};
const memoryReadTopicIds: Record<string, string[]> = {};
const memoryReadMemoIds: Record<string, string[]> = {};
const memoryReadWorkflowIds: Record<string, string[]> = {};
const memoryReadReportIds: Record<string, string[]> = {};
const memoryReadChatTimestamps: Record<string, Record<string, string>> = {};

/** サーバーへ既読状態を送信（非同期） */
async function saveReadStatusToServer(userId: string, targetType: 'event' | 'topic' | 'memo' | 'workflow' | 'chat' | 'report', targetId: string) {
  if (!userId || !targetType || !targetId) return;
  try {
    await fetch(`${API_BASE_URL}/read-statuses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, targetType, targetId, isRead: true }),
    });
  } catch (err) {
    console.warn('Failed to sync read status to server:', err);
  }
}

/** サーバーから既読状態を取得してインメモリキャッシュを同期 */
export async function syncUserReadStatusesFromServer(userId: string) {
  if (!userId) return;
  try {
    const res = await fetch(`${API_BASE_URL}/read-statuses/${encodeURIComponent(userId)}`);
    if (!res.ok) return;
    const data: { event?: string[]; topic?: string[]; memo?: string[]; workflow?: string[]; chat?: string[]; report?: string[] } = await res.json();
    if (!data) return;

    // サーバーから取得したデータでインメモリキャッシュを同期
    if (Array.isArray(data.event)) memoryReadEventIds[userId] = data.event;
    if (Array.isArray(data.topic)) memoryReadTopicIds[userId] = data.topic;
    if (Array.isArray(data.memo)) memoryReadMemoIds[userId] = data.memo;
    if (Array.isArray(data.workflow)) memoryReadWorkflowIds[userId] = data.workflow;
    if (Array.isArray(data.report)) memoryReadReportIds[userId] = data.report;
    
    const chatTimestamps: Record<string, string> = {};
    if (Array.isArray(data.chat)) {
      data.chat.forEach((roomId) => {
        // 十分に未来の時刻をセットして、そのルームのメッセージを既読扱いにする
        chatTimestamps[roomId] = new Date(Date.now() + 86400000 * 365).toISOString(); // 1年後
      });
    }
    memoryReadChatTimestamps[userId] = chatTimestamps;

    // カスタムイベントを発火してReact側に更新を通知
    window.dispatchEvent(new CustomEvent('notifications_updated'));
  } catch (err) {
    console.warn('Failed to fetch read statuses from server:', err);
  }
}

/** 1. イベント既読 */
export function getReadEventIds(userId?: string): string[] {
  if (!userId) return [];
  return memoryReadEventIds[userId] || [];
}

export function markEventAsRead(userId?: string, eventId?: string) {
  if (!userId || !eventId) return;
  if (!memoryReadEventIds[userId]) {
    memoryReadEventIds[userId] = [];
  }
  if (!memoryReadEventIds[userId].includes(eventId)) {
    memoryReadEventIds[userId].push(eventId);
    window.dispatchEvent(new CustomEvent('notifications_updated'));
  }
  saveReadStatusToServer(userId, 'event', eventId);
}

export function markAllEventsAsRead(userId?: string, eventIds?: string[]) {
  if (!userId || !eventIds || !eventIds.length) return;
  if (!memoryReadEventIds[userId]) {
    memoryReadEventIds[userId] = [];
  }
  const nextSet = new Set([...memoryReadEventIds[userId], ...eventIds]);
  memoryReadEventIds[userId] = Array.from(nextSet);
  window.dispatchEvent(new CustomEvent('notifications_updated'));
  eventIds.forEach((id) => saveReadStatusToServer(userId, 'event', id));
}

/** 2. 掲示板トピック既読 */
export function getReadTopicIds(userId?: string): string[] {
  if (!userId) return [];
  return memoryReadTopicIds[userId] || [];
}

export function markTopicAsRead(userId?: string, topicId?: string) {
  if (!userId || !topicId) return;
  if (!memoryReadTopicIds[userId]) {
    memoryReadTopicIds[userId] = [];
  }
  if (!memoryReadTopicIds[userId].includes(topicId)) {
    memoryReadTopicIds[userId].push(topicId);
    window.dispatchEvent(new CustomEvent('notifications_updated'));
  }
  saveReadStatusToServer(userId, 'topic', topicId);
}

/** 3. チャットルーム既読 (閲覧タイムスタンプ管理) */
export function getReadChatTimestamps(userId?: string): Record<string, string> {
  if (!userId) return {};
  return memoryReadChatTimestamps[userId] || {};
}

export function markChatRoomAsRead(userId?: string, roomId?: string) {
  if (!userId || !roomId) return;
  if (!memoryReadChatTimestamps[userId]) {
    memoryReadChatTimestamps[userId] = {};
  }
  memoryReadChatTimestamps[userId][roomId] = new Date().toISOString();
  window.dispatchEvent(new CustomEvent('notifications_updated'));
  saveReadStatusToServer(userId, 'chat', roomId);
}

/** 4. 伝言メモ既読 */
export function getReadMemoIds(userId?: string): string[] {
  if (!userId) return [];
  return memoryReadMemoIds[userId] || [];
}

export function markMemoAsRead(userId?: string, memoId?: string) {
  if (!userId || !memoId) return;
  if (!memoryReadMemoIds[userId]) {
    memoryReadMemoIds[userId] = [];
  }
  if (!memoryReadMemoIds[userId].includes(memoId)) {
    memoryReadMemoIds[userId].push(memoId);
    window.dispatchEvent(new CustomEvent('notifications_updated'));
  }
  saveReadStatusToServer(userId, 'memo', memoId);
}

export function markMemoAsUnread(userId?: string, memoId?: string) {
  if (!userId || !memoId) return;
  if (memoryReadMemoIds[userId]) {
    memoryReadMemoIds[userId] = memoryReadMemoIds[userId].filter((id) => id !== memoId);
    window.dispatchEvent(new CustomEvent('notifications_updated'));
  }
  try {
    fetch(`${API_BASE_URL}/read-statuses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, targetType: 'memo', targetId: memoId, isRead: false }),
    });
  } catch (err) {
    console.error('Failed to sync unread status to server:', err);
  }
}

/** 5. ワークフロー既読 */
export function getReadWorkflowIds(userId?: string): string[] {
  if (!userId) return [];
  return memoryReadWorkflowIds[userId] || [];
}

export function markWorkflowAsRead(userId?: string, workflowId?: string) {
  if (!userId || !workflowId) return;
  if (!memoryReadWorkflowIds[userId]) {
    memoryReadWorkflowIds[userId] = [];
  }
  if (!memoryReadWorkflowIds[userId].includes(workflowId)) {
    memoryReadWorkflowIds[userId].push(workflowId);
    window.dispatchEvent(new CustomEvent('notifications_updated'));
  }
  saveReadStatusToServer(userId, 'workflow', workflowId);
}

export function markAllWorkflowsAsRead(userId?: string, workflowIds?: string[]) {
  if (!userId || !workflowIds || !workflowIds.length) return;
  if (!memoryReadWorkflowIds[userId]) {
    memoryReadWorkflowIds[userId] = [];
  }
  const nextSet = new Set([...memoryReadWorkflowIds[userId], ...workflowIds]);
  memoryReadWorkflowIds[userId] = Array.from(nextSet);
  window.dispatchEvent(new CustomEvent('notifications_updated'));
  workflowIds.forEach((id) => saveReadStatusToServer(userId, 'workflow', id));
}

/** 6. 週報・日報既読 */
export function getReadReportIds(userId?: string): string[] {
  if (!userId) return [];
  return memoryReadReportIds[userId] || [];
}

export function markReportAsRead(userId?: string, reportId?: string) {
  if (!userId || !reportId) return;
  if (!memoryReadReportIds[userId]) {
    memoryReadReportIds[userId] = [];
  }
  if (!memoryReadReportIds[userId].includes(reportId)) {
    memoryReadReportIds[userId].push(reportId);
    window.dispatchEvent(new CustomEvent('notifications_updated'));
  }
  saveReadStatusToServer(userId, 'report', reportId);
}

export function markAllReportsAsRead(userId?: string, reportIds?: string[]) {
  if (!userId || !reportIds || !reportIds.length) return;
  if (!memoryReadReportIds[userId]) {
    memoryReadReportIds[userId] = [];
  }
  const nextSet = new Set([...memoryReadReportIds[userId], ...reportIds]);
  memoryReadReportIds[userId] = Array.from(nextSet);
  window.dispatchEvent(new CustomEvent('notifications_updated'));
  reportIds.forEach((id) => saveReadStatusToServer(userId, 'report', id));
}

// -------------------------------------------------------------
// 個別コンテンツの未読/未確認判定関数 (統一ルール)
// -------------------------------------------------------------

/** 1. イベントの未確認判定 */
export function isEventUnread(e: CalendarEvent, user: User, readEventIds: string[] = getReadEventIds(user?.id)): boolean {
  if (!user || !e) return false;

  // 1. 作成者（登録者）が自分自身の場合は未読・通知対象外（自分が登録した予定）
  const checkUserMatch = (creatorVal: any) => {
    if (!creatorVal) return false;
    if (typeof creatorVal === 'object') {
      if (creatorVal.id && (creatorVal.id === user.id || String(creatorVal.id) === String(user.id))) return true;
      if (creatorVal._id && (creatorVal._id === user.id || String(creatorVal._id) === String(user.id))) return true;
      if (creatorVal.name && creatorVal.name === user.name) return true;
      if (creatorVal.loginId && user.loginId && creatorVal.loginId === user.loginId) return true;
    } else if (typeof creatorVal === 'string') {
      if (creatorVal === user.id || creatorVal === String(user.id) || creatorVal === user.name || (user.loginId && creatorVal === user.loginId)) return true;
    }
    return false;
  };

  if (checkUserMatch(e.createdBy)) return false;
  if (checkUserMatch((e as any).createdByUser)) return false;
  if (checkUserMatch((e as any).author)) return false;
  if (checkUserMatch((e as any).creator)) return false;
  if (checkUserMatch((e as any).user)) return false;

  const rawCreatorId = (e as any).createdById || (e as any).userId || (e as any).authorId || (e as any).creatorId;
  if (rawCreatorId && (rawCreatorId === user.id || String(rawCreatorId) === String(user.id))) {
    return false;
  }

  const attendees = e.attendees || [];
  const isAttendee = attendees.some((a) => a?.id === user.id || a?.name === user.name || (user.loginId && a?.loginId === user.loginId));

  // 2. 自分が参加者に含まれていない場合は通知対象外
  if (!isAttendee) {
    return false;
  }

  // 3. 参加者が自分1名だけの場合（個人用務、自分用の予定など）は通知対象外
  if (attendees.length === 1 && isAttendee) {
    return false;
  }

  // 4. 個人用務(personal)で自分が参加者の予定は通知対象外
  if (e.type === 'personal') {
    return false;
  }

  // 5. Google同期予定は未読通知対象外
  if (e.isGoogleSynced) {
    return false;
  }

  // 6. Server-side viewers check (サーバー側で閲覧済み)
  if ((e as any).viewers && Array.isArray((e as any).viewers)) {
    const isViewedOnServer = (e as any).viewers.some((v: any) => 
      v?.userId === user.id || v?.user?.id === user.id || v?.id === user.id || v === user.id || (v?.user?.name && v?.user?.name === user.name)
    );
    if (isViewedOnServer) return false;
  }

  // 7. 既読IDチェック（実ID、親ID、インスタンス展開IDのプレフィックスすべて照合）
  if (readEventIds.includes(e.id)) return false;
  if (e.recurrenceParentId && readEventIds.includes(e.recurrenceParentId)) return false;
  if (e.id && e.id.includes('_')) {
    const parentId = e.id.split('_')[0];
    if (readEventIds.includes(parentId)) return false;
  }
  if (e.id && e.id.startsWith('e-ovr-')) {
    const parts = e.id.split('-');
    if (parts.length >= 3) {
      const extractedParentId = parts.slice(2, parts.length - 1).join('-');
      if (extractedParentId && readEventIds.includes(extractedParentId)) return false;
    }
  }

  return true;
}

/** 2. 掲示板トピックの未読判定 */
export function isTopicUnread(t: BoardTopic, user: User, readTopicIds: string[] = getReadTopicIds(user?.id)): boolean {
  if (!user || !t) return false;

  // 自分で作成したトピックは未読通知不要
  if (t.author && (t.author.id === user.id || t.author.name === user.name)) {
    return false;
  }

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

/** 3. 伝言メモの未対応(処理前)判定 */
export function isMemoUnhandled(m: Memo, user: User): boolean {
  if (!user || !m) return false;

  // 全体ステータスが対応済み(handled)なら未対応ではない
  if (m.status === 'handled') return false;

  // recipientStatuses が存在する場合（最も正確な宛先リスト）
  if (m.recipientStatuses && m.recipientStatuses.length > 0) {
    const userStatus = m.recipientStatuses.find((st) => st.userId === user.id);
    if (!userStatus) {
      // 宛先リストに含まれていない第3者または作成者自身は未対応判定の対象外
      return false;
    }
    return !userStatus.isHandled && userStatus.status !== 'handled';
  }

  // 作成者自身で宛先でない場合は対象外
  if ((m.createdByUser?.id === user.id || m.senderId === user.id) && (!m.toUsers || !m.toUsers.some((u) => u?.id === user.id))) {
    return false;
  }

  // フォールバック: 自分宛て判定 (toUsers / toUser / targetOffices / targetDivisions)
  const isToUser =
    (m.toUsers && m.toUsers.some((u) => u?.id === user.id || u?.name === user.name)) ||
    (m.toUser && (m.toUser.id === user.id || m.toUser.name === user.name || (m.toUser.loginId && m.toUser.loginId === user.loginId))) ||
    (m.targetOffices && user.office && m.targetOffices.includes(user.office)) ||
    (m.targetDivisions && user.division && m.targetDivisions.includes(user.division));

  return !!isToUser;
}

/** 4. 伝言メモの未読(ベルマーク通知対象)判定 */
export function isMemoUnread(m: Memo, user: User, readMemoIds: string[] = getReadMemoIds(user?.id)): boolean {
  if (!user || !m) return false;

  // 未対応でないものは通知対象外
  if (!isMemoUnhandled(m, user)) return false;

  // 閲覧済み・既読であれば通知対象外
  if (m.status === 'read') return false;
  if (readMemoIds.includes(m.id)) return false;

  if (m.recipientStatuses && m.recipientStatuses.length > 0) {
    const userStatus = m.recipientStatuses.find((st) => st.userId === user.id);
    if (userStatus && (userStatus.isViewed || userStatus.status === 'read')) {
      return false;
    }
  }

  return true;
}

/** 5. ワークフロー承認依頼の未承認(処理前)判定 */
export function isWorkflowPending(app: WorkflowApplication, user: User): boolean {
  if (!user || !app) return false;
  if (app.status !== 'pending') return false;

  const isApprover = app.approver?.id === user.id || app.approver?.name === user.name;
  if (isApprover) return true;

  if (app.stepsConfig && app.stepsConfig.length > 0) {
    const currentStepIdx = (app.currentStepIndex || 1) - 1;
    const step = app.stepsConfig[currentStepIdx];
    if (step && step.approverType === 'specific_user' && step.specificUserId === user.id) {
      return true;
    }
  }

  return false;
}

/** 6. ワークフロー承認依頼の未読(ベルマーク通知対象)判定 */
export function isWorkflowUnread(
  app: WorkflowApplication,
  user: User,
  readWorkflowIds: string[] = getReadWorkflowIds(user?.id)
): boolean {
  if (!user || !app) return false;
  // 要承認の申請であること
  if (!isWorkflowPending(app, user)) return false;
  // 既にベルマーク通知を確認済み（既読）であれば未読通知対象外
  if (readWorkflowIds.includes(app.id)) return false;

  return true;
}

/** 7. チャットメッセージの未読判定 */
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

/** 8. 週報・日報の未読/未確認判定 */
export function isReportUnread(
  report: DailyReport,
  user: User,
  readReportIds: string[] = getReadReportIds(user?.id)
): boolean {
  if (!user || !report) return false;
  if (readReportIds.includes(report.id)) return false;

  const isAuthor = report.author?.id === user.id;
  const isSupervisor = report.supervisorId === user.id || report.supervisor?.id === user.id;

  // 上長宛て: 部下が提出した未確認の週報・日報
  if (isSupervisor && !isAuthor && report.status === 'submitted') {
    return true;
  }

  // 作成者宛て: 上長が確認・フィードバック済みにした週報・日報
  if (isAuthor && report.status === 'reviewed' && report.reviewedAt) {
    return true;
  }

  return false;
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
  reports = [],
  readEventIds = getReadEventIds(user?.id),
  readTopicIds = getReadTopicIds(user?.id),
  readChatTimestamps = getReadChatTimestamps(user?.id),
  readMemoIds = getReadMemoIds(user?.id),
  readWorkflowIds = getReadWorkflowIds(user?.id),
  readReportIds = getReadReportIds(user?.id),
}: {
  user: User;
  memos?: Memo[];
  applications?: WorkflowApplication[];
  topics?: BoardTopic[];
  events?: CalendarEvent[];
  chatRooms?: ChatRoom[];
  reports?: DailyReport[];
  readEventIds?: string[];
  readTopicIds?: string[];
  readChatTimestamps?: Record<string, string>;
  readMemoIds?: string[];
  readWorkflowIds?: string[];
  readReportIds?: string[];
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
    if (isWorkflowUnread(app, user, readWorkflowIds)) {
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

  // 6. Reports (週報・保守日報)
  reports.forEach((rep) => {
    if (isReportUnread(rep, user, readReportIds)) {
      const isAuthor = rep.author?.id === user.id;
      const typeLabel = rep.reportType === 'maintenance_daily' || (rep as any).reportType === 'maintenance' ? '保守日報' : '週報';
      const title = isAuthor 
        ? `【${typeLabel}確認済】上長が提出内容を確認しました`
        : `【${typeLabel}提出】${rep.author?.name || '部下'}様より提出がありました`;
      const description = isAuthor
        ? (rep.feedbackComment ? `コメント: ${rep.feedbackComment}` : '確認が完了しました。')
        : `${rep.weekLabel || rep.date || ''} の報告内容を確認してください。`;

      list.push({
        id: `rep_${rep.id}`,
        type: 'report',
        title,
        description,
        createdAt: rep.reviewedAt || rep.submittedAt || rep.createdAt || new Date().toISOString(),
        tab: 'daily_report',
        originalData: rep,
      });
    }
  });

  return list.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
}
