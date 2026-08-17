/**
 * Web Push Notification Utilities for Mobile & Desktop PWA
 */

import { API_BASE_URL } from '../config/api';

// Helper to convert base64 url-safe string to Uint8Array for VAPID key
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export interface PushStatus {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  subscriptionCount?: number;
  isStandalone: boolean;
  isIOS: boolean;
}

export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isPWAStandalone(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as any).standalone === true ||
    document.referrer.includes('android-app://')
  );
}

export function isIOSDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
  );
}

/**
 * 端末のPush通知状態を取得
 */
export async function getPushNotificationStatus(userId?: string): Promise<PushStatus> {
  const isSupported = isPushNotificationSupported();
  const isStandalone = isPWAStandalone();
  const isIOS = isIOSDevice();

  if (!isSupported) {
    return {
      isSupported: false,
      permission: 'default',
      isSubscribed: false,
      isStandalone,
      isIOS,
    };
  }

  const permission = Notification.permission;
  let isSubscribed = false;

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();
    isSubscribed = !!subscription;
  } catch (e) {
    console.warn('[Push] Error checking subscription:', e);
  }

  let subscriptionCount = 0;
  if (userId) {
    try {
      const res = await fetch(`${API_BASE_URL}/push/status/${encodeURIComponent(userId)}`);
      if (res.ok) {
        const data = await res.json();
        subscriptionCount = data.subscriptionCount || 0;
      }
    } catch (e) {
      // ignore
    }
  }

  return {
    isSupported,
    permission,
    isSubscribed,
    subscriptionCount,
    isStandalone,
    isIOS,
  };
}

/**
 * Push通知を有効化（パーミッション取得 + VAPID購読登録）
 */
export async function subscribeToPushNotifications(userId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  if (!isPushNotificationSupported()) {
    if (isIOSDevice() && !isPWAStandalone()) {
      return {
        success: false,
        error: 'iPhone/iPadでは、Safariの「共有」メニューから「ホーム画面に追加」したアプリから通知を有効にする必要があります。',
      };
    }
    return {
      success: false,
      error: 'お使いのブラウザはWeb Push通知に対応していません。',
    };
  }

  try {
    // 1. 通知パーミッションの要求
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      return {
        success: false,
        error: '通知の許可が得られませんでした。ブラウザの設定で通知を許可してください。',
      };
    }

    // 2. サーバーからVAPID公開鍵を取得
    const keyRes = await fetch(`${API_BASE_URL}/push/vapid-public-key`);
    if (!keyRes.ok) {
      throw new Error('サーバーからVAPID公開鍵を取得できませんでした。');
    }
    const { publicKey } = await keyRes.json();
    if (!publicKey) {
      throw new Error('有効なVAPID公開鍵がありません。');
    }

    // 3. Service Workerの登録取得
    const registration = await navigator.serviceWorker.ready;

    // 既存の購読があれば再取得、なければ新規作成
    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      const convertedVapidKey = urlBase64ToUint8Array(publicKey);
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: convertedVapidKey,
      });
    }

    // 4. サーバーへ購読情報を送信して保存
    const subRes = await fetch(`${API_BASE_URL}/push/subscribe`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId: String(userId),
        subscription: subscription.toJSON(),
        userAgent: navigator.userAgent,
      }),
    });

    if (!subRes.ok) {
      throw new Error('サーバーへの通知購読登録に失敗しました。');
    }

    return {
      success: true,
      message: 'スマートフォンへのプッシュ通知を有効にしました！',
    };
  } catch (err: any) {
    console.error('[Push] Subscribe failed:', err);
    return {
      success: false,
      error: err.message || '通知の登録に失敗しました。',
    };
  }
}

/**
 * Push通知を解除
 */
export async function unsubscribeFromPushNotifications(userId?: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  if (!isPushNotificationSupported()) {
    return { success: true };
  }

  try {
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.getSubscription();

    if (subscription) {
      const endpoint = subscription.endpoint;
      await subscription.unsubscribe();

      // サーバー側からも解除
      await fetch(`${API_BASE_URL}/push/unsubscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          endpoint,
          userId: userId ? String(userId) : undefined,
        }),
      });
    }

    return {
      success: true,
      message: '通知の購読を解除しました。',
    };
  } catch (err: any) {
    console.error('[Push] Unsubscribe error:', err);
    return {
      success: false,
      error: err.message || '通知の解除に失敗しました。',
    };
  }
}

/**
 * テスト通知を自分宛てに送信
 */
export async function sendTestPushNotification(userId: string): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  try {
    const res = await fetch(`${API_BASE_URL}/push/test`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: String(userId) }),
    });

    const data = await res.json();
    if (!res.ok) {
      throw new Error(data.error || 'テスト通知の送信に失敗しました。');
    }

    return {
      success: true,
      message: data.message || 'テスト通知を送信しました。数秒以内に通知が表示されます。',
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'テスト通知送信中にエラーが発生しました。',
    };
  }
}

/**
 * 汎用プッシュ通知トリガー
 */
export async function triggerPushNotification(params: {
  targetUserId?: string;
  targetUserIds?: string[];
  excludeUserId?: string;
  title: string;
  body: string;
  url?: string;
  tag?: string;
  data?: any;
}): Promise<void> {
  try {
    await fetch(`${API_BASE_URL}/push/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
  } catch (err) {
    console.warn('[Push] Failed to trigger notification:', err);
  }
}
