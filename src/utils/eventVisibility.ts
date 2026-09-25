import { CalendarEvent, User } from '../types';

/**
 * カレンダー予定が指定ユーザー（ログインユーザー）に対して閲覧権限があるかを判定する。
 * 「他人から隠す」(isPrivate または isSecret) が有効な非公開予定の場合、
 * 作成者本人、または参加メンバー(attendees)に本人が含まれている場合のみ true を返し、
 * それ以外の第三者には false を返して完全に不可視（秘匿）化する。
 */
export function isEventVisibleToUser(
  event: CalendarEvent | null | undefined,
  currentUser: User | null | undefined
): boolean {
  if (!event) return false;

  const isPrivate = Boolean(
    event.isPrivate === true ||
    (event as any).isSecret === true ||
    (event as any).isPrivate === 1 ||
    (event as any).isSecret === 1 ||
    (event as any).isPrivate === 'true' ||
    (event as any).isSecret === 'true'
  );

  // 公開予定（「他人から隠す」が無効）であれば誰でも閲覧可能
  if (!isPrivate) {
    return true;
  }

  // 非公開予定（他人から隠す）の場合、ログインユーザーが未特定なら非表示
  if (!currentUser) {
    return false;
  }

  const currentUserIdStr = String(currentUser.id || '');
  const currentUserName = (currentUser.name || '').trim();
  const currentUserLoginId = (currentUser.loginId || '').trim();
  const currentUserEmail = (currentUser.email || '').trim();

  // 1. 作成者本人かどうか判定
  if (event.createdBy) {
    if (typeof event.createdBy === 'object') {
      const cId = String((event.createdBy as any).id || (event.createdBy as any)._id || '');
      const cName = ((event.createdBy as any).name || '').trim();
      const cLoginId = ((event.createdBy as any).loginId || '').trim();
      if (cId && cId === currentUserIdStr) return true;
      if (cName && currentUserName && cName === currentUserName) return true;
      if (cLoginId && currentUserLoginId && cLoginId === currentUserLoginId) return true;
    } else if (typeof (event.createdBy as any) === 'string') {
      const cStr = String(event.createdBy).trim();
      if (cStr === currentUserIdStr || (currentUserName && cStr === currentUserName)) return true;
    }
  }

  const rawCreatorId = String(
    (event as any).createdById ||
    (event as any).userId ||
    (event as any).authorId ||
    (event as any).creatorId ||
    ''
  );
  if (rawCreatorId && rawCreatorId === currentUserIdStr) {
    return true;
  }

  // 2. 参加メンバー(attendees)に含まれているか判定
  if (event.attendees && Array.isArray(event.attendees)) {
    const isAttendee = event.attendees.some((a) => {
      if (!a) return false;
      const aId = String(a.id || (a as any)._id || '');
      const aName = (a.name || '').trim();
      const aLoginId = ((a as any).loginId || '').trim();
      const aEmail = (a.email || '').trim();

      if (aId && aId === currentUserIdStr) return true;
      if (aName && currentUserName && aName === currentUserName) return true;
      if (aLoginId && currentUserLoginId && aLoginId === currentUserLoginId) return true;
      if (aEmail && currentUserEmail && aEmail === currentUserEmail) return true;
      return false;
    });

    if (isAttendee) {
      return true;
    }
  }

  // 作成者でも参加者でもない第三者の場合は非表示
  return false;
}
