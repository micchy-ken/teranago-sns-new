import { User } from '../../types';
import { ProjectBoard, ProjectCard } from '../../types/project';
import { triggerPushNotification } from '../../utils/pushNotifications';
import { dispatchNotificationEmail } from '../../utils/emailNotificationDispatcher';
import { buildPushFromTemplate, buildEmailFromTemplate } from '../../config/notificationTemplates';

const PRIORITY_LABELS: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
  none: 'なし',
};

/**
 * Web Push (FCM / APNs / WNS) の Topic ヘッダー上限（32文字・英数字と_-のみ）に確実に収まる
 * 短い一意タグを生成（末尾のランダム識別子が切り詰められないように末尾優先で切り出す）
 */
function buildSafeProjectPushTag(prefix: 'pa' | 'pc', cardId: string): string {
  const sanitized = String(cardId || '')
    .replace(/^card[-_]/i, '')
    .replace(/[^a-zA-Z0-9_-]/g, '');
  const maxBodyLen = 32 - prefix.length - 1;
  const suffix = sanitized.length > maxBodyLen ? sanitized.slice(-maxBodyLen) : (sanitized || String(Date.now()));
  return `${prefix}-${suffix}`;
}

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

  const vars = {
    boardTitle: board.title,
    kindLabel,
    actorName: actor.name,
    cardTitle: card.title,
    dueDateHint: card.dueDate ? `（期限: ${card.dueDate}）` : '',
    emailPrefix: isNewCard ? '【担当アサイン】' : '【担当者変更】',
    dueDate: card.dueDate || '未設定',
    priorityLabel: PRIORITY_LABELS[card.priority] || 'なし',
    description: card.description ? card.description.slice(0, 600) : '',
    projectId: encodeURIComponent(board.id),
    taskId: encodeURIComponent(card.id),
  };

  try {
    const pushPayload = buildPushFromTemplate('project_assignee_added', vars, {
      url: deepLinkUrl,
      tag: buildSafeProjectPushTag('pa', card.id),
    });
    await triggerPushNotification({
      targetUserIds: uniqueIds,
      excludeUserId: actorId,
      ...pushPayload,
      data: {
        type: 'project_assign',
        projectId: board.id,
        taskId: card.id,
        url: pushPayload.url,
      },
    });
  } catch (err) {
    console.warn('[ProjectNotification] Push notify error:', err);
  }

  if (recipients.length > 0) {
    try {
      await dispatchNotificationEmail(
        recipients,
        buildEmailFromTemplate('project_assignee_added', vars, {
          actorName: actor.name,
          mainContent: card.description ? card.description.slice(0, 600) : undefined,
          pathParams: deepLinkPath,
        }),
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

  const vars = {
    boardTitle: board.title,
    cardTitle: card.title,
    actorName: actor.name,
    snippet,
    commentText: commentText.trim() || '（添付ファイルあり）',
    projectId: encodeURIComponent(board.id),
    taskId: encodeURIComponent(card.id),
  };

  try {
    const pushPayload = buildPushFromTemplate('project_comment_added', vars, {
      url: deepLinkUrl,
      tag: buildSafeProjectPushTag('pc', card.id),
    });
    await triggerPushNotification({
      targetUserIds: uniqueIds,
      excludeUserId: actorId,
      ...pushPayload,
      data: {
        type: 'project_comment',
        projectId: board.id,
        taskId: card.id,
        url: pushPayload.url,
      },
    });
  } catch (err) {
    console.warn('[ProjectNotification] Comment push error:', err);
  }

  if (recipients.length > 0) {
    try {
      await dispatchNotificationEmail(
        recipients,
        buildEmailFromTemplate('project_comment_added', vars, {
          actorName: actor.name,
          mainContent: commentText.trim() || '（添付ファイルあり）',
          pathParams: deepLinkPath,
        }),
        actor
      );
    } catch (err) {
      console.warn('[ProjectNotification] Comment email error:', err);
    }
  }
}
