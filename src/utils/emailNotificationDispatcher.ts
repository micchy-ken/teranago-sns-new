import { User, EmailNotificationSettings } from '../types';
import { API_BASE_URL } from '../config/api';

export type NotificationCategoryKey = 'schedule' | 'bulletin' | 'memo' | 'workflow' | 'post' | 'inspection';

export interface EmailDispatchItem {
  category: NotificationCategoryKey;
  categoryLabel: string;
  title: string;
  actorName: string;
  details: { label: string; value: string }[];
  mainContent?: string;
  shareUrl?: string; // Direct link (e.g., https://app.com/?tab=calendar&eventId=123)
  pathParams?: string; // Query string (e.g., tab=calendar&eventId=123)
}

/**
 * Gets the full share link URL with query parameters preserved
 */
export function getFullShareUrl(pathParamsOrUrl?: string): string {
  const base = typeof window !== 'undefined'
    ? (window.location.origin + window.location.pathname)
    : 'https://micchy-ken.github.io/teranago-sns-new/';
  const cleanBase = base.endsWith('/') ? base : `${base}/`;

  if (!pathParamsOrUrl) {
    return cleanBase;
  }

  // If already a full HTTP/HTTPS URL, preserve it completely
  if (pathParamsOrUrl.startsWith('http://') || pathParamsOrUrl.startsWith('https://')) {
    return pathParamsOrUrl;
  }

  // Clean leading ?, /?, or /
  let query = pathParamsOrUrl;
  if (query.startsWith('/?')) {
    query = query.slice(2);
  } else if (query.startsWith('?') || query.startsWith('/')) {
    query = query.slice(1);
  }

  // If query contains parameters like tab=board&topicId=123
  if (query.includes('=')) {
    return `${cleanBase}?${query}`;
  }

  return `${cleanBase}${query}`;
}

/**
 * Helper to extract email destinations for a recipient user according to their JSON preferences
 */
export function getRecipientEmailAddresses(
  user: User,
  category: NotificationCategoryKey
): { pcEmail?: string; mobileEmail?: string } {
  const prefs: EmailNotificationSettings = user.preferences?.emailNotifications || {};
  
  // Default values if preference for category is not explicitly set:
  // All notifications are disabled (OFF) by default.
  const catPref = prefs[category] ?? { pc: false, mobile: false };

  const result: { pcEmail?: string; mobileEmail?: string } = {};

  if (catPref.pc && user.email && user.email.trim()) {
    result.pcEmail = user.email.trim();
  }
  if (catPref.mobile && user.mobileEmail && user.mobileEmail.trim()) {
    result.mobileEmail = user.mobileEmail.trim();
  }

  return result;
}

/**
 * Dispatch notification email to one or multiple users
 */
export async function dispatchNotificationEmail(
  recipients: User[],
  item: EmailDispatchItem,
  actorUser?: User
): Promise<{ success: boolean; sentCount: number; errors: string[] }> {
  if (!recipients || recipients.length === 0) {
    return { success: true, sentCount: 0, errors: [] };
  }

  const shareUrl = getFullShareUrl(item.shareUrl || item.pathParams);
  const nowStr = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
  const actor = actorUser?.name || item.actorName || 'システム';

  let sentCount = 0;
  const errors: string[] = [];

  for (const user of recipients) {
    // Exclude sending notification to the actor themselves unless specifically requested
    if (actorUser && user.id === actorUser.id) {
      continue;
    }

    const emails = getRecipientEmailAddresses(user, item.category);
    const toAddresses = [emails.pcEmail, emails.mobileEmail].filter(Boolean) as string[];

    if (toAddresses.length === 0) {
      continue;
    }

    const subject = `【${item.categoryLabel}通知】${item.title}`;

    const textLines = [
      `${user.name} 様`,
      ``,
      `寺岡オートドアSNS から【${item.categoryLabel}】に関する通知です。`,
      `操作・更新者: ${actor}`,
      `日時: ${nowStr}`,
      ``,
      `----------------------------------------`,
      `■ 主な内容・詳細`,
      ...item.details.map(d => `${d.label}: ${d.value}`),
    ];

    if (item.mainContent) {
      textLines.push(``, `【本文・備考】`, item.mainContent);
    }

    if (shareUrl) {
      textLines.push(
        ``,
        `----------------------------------------`,
        `■ 詳細・該当画面への共有リンク`,
        shareUrl
      );
    }

    textLines.push(
      ``,
      `※本メールは寺岡オートドアSNS通知設定に基づいて自動配信されています。`
    );

    const text = textLines.join('\n');

    const detailsHtml = item.details
      .map(
        d => `
        <tr style="border-bottom: 1px solid #f1f5f9;">
          <td style="padding: 8px 12px; font-weight: bold; color: #475569; width: 30%; background-color: #f8fafc; font-size: 13px;">${d.label}</td>
          <td style="padding: 8px 12px; color: #0f172a; font-size: 13px; font-weight: 500;">${d.value}</td>
        </tr>
      `
      )
      .join('');

    const mainContentHtml = item.mainContent
      ? `
        <div style="margin-top: 16px; padding: 12px; background-color: #f8fafc; border-left: 4px solid #3b82f6; border-radius: 4px;">
          <div style="font-size: 12px; font-weight: bold; color: #475569; margin-bottom: 4px;">【本文・備考】</div>
          <div style="font-size: 13px; color: #1e293b; white-space: pre-wrap; line-height: 1.6;">${item.mainContent}</div>
        </div>
      `
      : '';

    const shareButtonHtml = shareUrl
      ? `
        <div style="margin-top: 24px; text-align: center;">
          <a href="${shareUrl}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 12px 28px; background-color: #2563eb; color: #ffffff; text-decoration: none; font-weight: bold; font-size: 14px; border-radius: 8px; shadow: 0 2px 4px rgba(0,0,0,0.1);">
            👉 該当画面を直接開く（共有リンク）
          </a>
          <div style="margin-top: 8px; font-size: 11px; color: #64748b; word-break: break-all;">
            直リンク: <a href="${shareUrl}" style="color: #2563eb;">${shareUrl}</a>
          </div>
        </div>
      `
      : '';

    const html = `
      <div style="font-family: 'Helvetica Neue', Arial, 'Hiragino Kaku Gothic ProN', 'BIZ UDPGothic', meiryo, sans-serif; padding: 24px; line-height: 1.6; color: #1e293b; max-width: 620px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff; margin: 0 auto;">
        <div style="background: linear-gradient(135deg, #1e293b 0%, #0f172a 100%); color: #ffffff; padding: 16px 20px; border-radius: 8px 8px 0 0; margin: -24px -24px 20px -24px; display: flex; align-items: center; justify-content: space-between;">
          <h2 style="margin: 0; font-size: 16px; font-weight: bold; color: #ffffff;">
            寺岡オートドアSNS <span style="background-color: #3b82f6; color: #ffffff; font-size: 11px; padding: 2px 8px; border-radius: 12px; margin-left: 8px;">${item.categoryLabel}通知</span>
          </h2>
        </div>

        <p style="font-size: 15px; font-weight: bold; color: #0f172a; margin-bottom: 12px;">${user.name} 様</p>
        <p style="font-size: 13px; color: #334155; margin-bottom: 16px;">
          <strong>${actor}</strong> さんが【${item.categoryLabel}】を更新・登録しました。内容をご確認ください。
        </p>

        <table style="width: 100%; border-collapse: collapse; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
          <tbody>
            ${detailsHtml}
          </tbody>
        </table>

        ${mainContentHtml}
        ${shareButtonHtml}

        <div style="margin-top: 28px; border-top: 1px solid #f1f5f9; padding-top: 12px; font-size: 11px; color: #94a3b8; text-align: center;">
          本メールは寺岡オートドアSNSの「個人設定 ＞ 通知センター」で設定された宛先に自動送信されています。<br>
          通知の停止・変更はシステム内の個人設定画面で行えます。
        </div>
      </div>
    `;

    try {
      const resp = await fetch(`${API_BASE_URL}/email/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          to: toAddresses.join(', '),
          subject,
          text,
          html,
        }),
      });

      if (resp.ok) {
        sentCount++;
      } else {
        const errJson = await resp.json().catch(() => ({ error: '不明なエラー' }));
        errors.push(`${user.name}宛メール送信エラー: ${errJson.error || resp.statusText}`);
      }
    } catch (err: any) {
      console.error('[EmailDispatch] Failed to send email to user:', user.name, err);
      errors.push(`${user.name}宛通信エラー: ${err?.message || '接続エラー'}`);
    }
  }

  return { success: errors.length === 0, sentCount, errors };
}
