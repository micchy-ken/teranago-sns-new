import { User } from '../../types';
import { ProjectBoard, ProjectCard } from '../../types/project';
import { triggerPushNotification } from '../../utils/pushNotifications';
import { dispatchNotificationEmail } from '../../utils/emailNotificationDispatcher';

const PRIORITY_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
  none: 'なし',
};

/**
 * プロジェクトカードの担当者アサイン通知（Web Push + メール）
 * ※操作ユーザー自身は除外して送信
 */
export async function notifyProjectAssignees(params: {
  board: ProjectBoard;
  card: ProjectCard;
  targetUserIds: string[];
  actor: User;
  allUsers: User[];
  isNewCard?: boolean;
}): Promise<void> {
  const { board, card, targetUserIds, actor, allUsers, isNewCard } = params;
  const actorId = String(actor.id);
  const uniqueIds = Array.from(new Set((targetUserIds || []).map(String))).filter(
    id => id && id !== actorId
  );
  if (uniqueIds.length === 0) return;

  const recipients = allUsers.filter(u => uniqueIds.includes(String(u.id)));
  const deepLinkPath = `tab=projects&projectId=${encodeURIComponent(board.id)}&taskId=${encodeURIComponent(card.id)}`;
  const deepLinkUrl = `/?${deepLinkPath}`;
  const kindLabel = card.cardType === 'memo' ? 'メモ・資料' : 'タスク';

  try {
    await triggerPushNotification({
      targetUserIds: uniqueIds,
      excludeUserId: actorId,
      title: `📌 ${board.title}｜${kindLabel}担当に割り当て`,
      body: `${actor.name}さんが「${card.title}」の担当者にあなたを指定しました${card.dueDate ? `（期限: ${card.dueDate}）` : ''}`,
      url: deepLinkUrl,
      tag: `project-assign-${card.id}`,
      data: {
        type: 'project_assign',
        projectId: board.id,
        taskId: card.id,
        url: deepLinkUrl,
      },
    });
  } catch (err) {
    console.warn('[ProjectNotification] Push notify error:', err);
  }

  if (recipients.length > 0) {
    try {
      await dispatchNotificationEmail(
        recipients,
        {
          category: 'project',
          categoryLabel: 'プロジェクト・Todo',
          title: isNewCard
            ? `【担当アサイン】${card.title}`
            : `【担当者変更】${card.title}`,
          actorName: actor.name,
          details: [
            { label: 'ボード', value: board.title },
            { label: '種別', value: kindLabel },
            { label: 'タイトル', value: card.title },
            { label: '期限', value: card.dueDate || '未設定' },
            { label: '優先度', value: PRIORITY_LABELS[card.priority] || 'なし' },
          ],
          mainContent: card.description ? card.description.slice(0, 600) : undefined,
          pathParams: deepLinkPath,
        },
        actor
      );
    } catch (err) {
      console.warn('[ProjectNotification] Email notify error:', err);
    }
  }
}

/**
 * プロジェクトカードへのコメント投稿通知（Web Push + メール）
 * 対象: カード担当者 + カード作成者（コメント投稿者本人は除外）
 */
export async function notifyProjectComment(params: {
  board: ProjectBoard;
  card: ProjectCard;
  commentText: string;
  actor: User;
  allUsers: User[];
}): Promise<void> {
  const { board, card, commentText, actor, allUsers } = params;
  const actorId = String(actor.id);
  const candidateIds = [
    ...(Array.isArray(card.assigneeIds) ? card.assigneeIds : []),
    ...(card.createdBy ? [card.createdBy] : []),
  ].map(String);

  const uniqueIds = Array.from(new Set(candidateIds)).filter(id => id && id !== actorId);
  if (uniqueIds.length === 0) return;

  const recipients = allUsers.filter(u => uniqueIds.includes(String(u.id)));
  const deepLinkPath = `tab=projects&projectId=${encodeURIComponent(board.id)}&taskId=${encodeURIComponent(card.id)}`;
  const deepLinkUrl = `/?${deepLinkPath}`;
  const snippet = (commentText || '').trim().slice(0, 120) || 'ファイルが添付されました';

  try {
    await triggerPushNotification({
      targetUserIds: uniqueIds,
      excludeUserId: actorId,
      title: `💬 ${board.title}｜${card.title}`,
      body: `${actor.name}: ${snippet}`,
      url: deepLinkUrl,
      tag: `project-comment-${card.id}`,
      data: {
        type: 'project_comment',
        projectId: board.id,
        taskId: card.id,
        url: deepLinkUrl,
      },
    });
  } catch (err) {
    console.warn('[ProjectNotification] Comment push error:', err);
  }

  if (recipients.length > 0) {
    try {
      await dispatchNotificationEmail(
        recipients,
        {
          category: 'project',
          categoryLabel: 'プロジェクト・Todo',
          title: `【新着コメント】${card.title}`,
          actorName: actor.name,
          details: [
            { label: 'ボード', value: board.title },
            { label: 'カード', value: card.title },
            { label: 'コメント投稿者', value: actor.name },
          ],
          mainContent: commentText.trim() || '（添付ファイルあり）',
          pathParams: deepLinkPath,
        },
        actor
      );
    } catch (err) {
      console.warn('[ProjectNotification] Comment email error:', err);
    }
  }
}
