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

function arrayBuffersEqual(a: ArrayBuffer | null, b: ArrayBuffer | null): boolean {
  if (!a || !b) return false;
  if (a.byteLength !== b.byteLength) return false;
  const viewA = new Uint8Array(a);
  const viewB = new Uint8Array(b);
  for (let i = 0; i < viewA.length; i++) {
    if (viewA[i] !== viewB[i]) return false;
  }
  return true;
}

function withTimeout<T>(promise: Promise<T>, ms: number, errorMessage: string): Promise<T> {
  let timer: any;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(errorMessage)), ms);
  });
  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timer));
}

export interface PushStatus {
  isSupported: boolean;
  permission: NotificationPermission;
  isSubscribed: boolean;
  subscriptionCount?: number;
  isStandalone: boolean;
  isIOS: boolean;
  inIframe: boolean;
}

export function isPushNotificationSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  );
}

export function isInIframe(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.self !== window.top;
  } catch (e) {
    return true;
  }
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

export async function getOrRegisterSW(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
    return null;
  }

  // 既存の登録をチェック
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    if (regs && regs.length > 0) {
      const activeReg = regs.find((r) => r.active || r.waiting || r.installing);
      if (activeReg) return activeReg;
    }
  } catch (e) {
    console.warn('[Push] Error getting SW registrations:', e);
  }

  // ViteのBASE_URLと相対パスの候補URLリストを作成
  const baseUrl = import.meta.env.BASE_URL || './';
  const cleanBase = baseUrl.endsWith('/') ? baseUrl : baseUrl + '/';

  const candidateUrls = [
    `${cleanBase}sw.js`,
    './sw.js',
    'sw.js',
    '/sw.js',
  ];

  const uniqueUrls = Array.from(new Set(candidateUrls));
  let lastError: any = null;

  for (const scriptUrl of uniqueUrls) {
    try {
      const reg = await navigator.serviceWorker.register(scriptUrl);
      if (reg) {
        console.log(`[Push] ServiceWorker registered successfully with '${scriptUrl}'`);
        return reg;
      }
    } catch (e: any) {
      lastError = e;
      console.warn(`[Push] SW register attempt failed for '${scriptUrl}':`, e);
    }
  }

  if (lastError) {
    throw lastError;
  }

  return null;
}

/**
 * 端末のPush通知状態を取得
 */
export async function getPushNotificationStatus(userId?: string): Promise<PushStatus> {
  const isSupported = isPushNotificationSupported();
  const isStandalone = isPWAStandalone();
  const isIOS = isIOSDevice();
  const inIframe = isInIframe();

  if (!isSupported) {
    return {
      isSupported: false,
      permission: 'default',
      isSubscribed: false,
      isStandalone,
      isIOS,
      inIframe,
    };
  }

  const permission = Notification.permission;
  let isSubscribed = false;

  try {
    const registration = await getOrRegisterSW();
    if (registration) {
      const subscription = await registration.pushManager.getSubscription().catch(() => null);
      isSubscribed = !!subscription;
    }
  } catch (e) {
    console.warn('[Push] Error checking subscription:', e);
  }

  let subscriptionCount = 0;
  if (userId) {
    try {
      const res = await withTimeout(
        fetch(`${API_BASE_URL}/push/status/${encodeURIComponent(userId)}`),
        3000,
        'ステータス通信タイムアウト'
      );
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
    inIframe,
  };
}

/**
 * Push通知を有効化（パーミッション取得 + VAPID購読登録）
 */
export async function subscribeToPushNotifications(
  userId: string,
  onProgress?: (stepMsg: string) => void
): Promise<{
  success: boolean;
  message?: string;
  error?: string;
}> {
  const inIframe = isInIframe();

  if (!isPushNotificationSupported()) {
    if (isIOSDevice() && !isPWAStandalone()) {
      return {
        success: false,
        error: 'iPhone/iPadでは、Safariの「共有」メニューから「ホーム画面に追加」したPWAアプリ内から通知を有効にする必要があります。',
      };
    }
    return {
      success: false,
      error: 'お使いのブラウザ環境はWeb Push通知に対応していません。',
    };
  }

  try {
    // ステップ1: 環境チェック
    onProgress?.('📍 [1/5] 動作環境の検証中...');
    if (inIframe && Notification.permission === 'default') {
      console.warn('[Push] Warning: Running inside iFrame while permission is default');
    }

    // ステップ2: パーミッション取得
    onProgress?.('📍 [2/5] 通知許可ポップアップのダイアログ要求中...');
    let permission = Notification.permission;
    if (permission === 'default') {
      try {
        permission = await withTimeout(
          Notification.requestPermission(),
          7000,
          '通知ダイアログの許可に応答がありませんでした。プレビュー画面（iFrame）内でお試しの場合は、画面右上の「新しいタブで開く」アイコンを押して別タブでお試しください。'
        );
      } catch (permErr: any) {
        if (inIframe) {
          throw new Error('iFrame（画面枠内）ではブラウザの通知許可ダイアログが拒否・ブロックされました。画面右上の「新しいタブで開く」を押して別タブでアクセスし直してください。');
        }
        throw permErr;
      }
    }

    if (permission !== 'granted') {
      return {
        success: false,
        error: '通知の許可が得られませんでした（ブロック中）。ブラウザのアドレスバー左側の鍵アイコン等から通知を「許可」に変更してください。',
      };
    }

    // ステップ3: VAPID公開鍵取得
    onProgress?.('📍 [3/5] サーバーからVAPID公開鍵を取得中...');
    const keyRes = await withTimeout(
      fetch(`${API_BASE_URL}/push/vapid-public-key`),
      5000,
      'サーバーからVAPID公開鍵の取得でタイムアウトしました。'
    );

    if (!keyRes.ok) {
      throw new Error('サーバーからVAPID公開鍵を取得できませんでした。');
    }
    const { publicKey } = await keyRes.json();
    if (!publicKey) {
      throw new Error('有効なVAPID公開鍵がサーバーから返されませんでした。');
    }

    // ステップ4: Service Worker 登録と接続
    onProgress?.('📍 [4/5] Service Worker (/sw.js) の起動とPushManager準備中...');
    let registration = await getOrRegisterSW();
    if (!registration) {
      throw new Error('Service Worker (/sw.js) の起動準備に失敗しました。ページを再読み込みしてお試しください。');
    }

    // 既存の購読があれば再取得（キー不一致があれば再登録）、なければ新規作成
    onProgress?.('📍 [5/5] 暗号化キーの生成と通知エンドポイント登録中...');
    const convertedVapidKey = urlBase64ToUint8Array(publicKey);
    let subscription = await registration.pushManager.getSubscription().catch(() => null);

    if (subscription) {
      const existingAppKey = subscription.options?.applicationServerKey;
      if (existingAppKey && !arrayBuffersEqual(existingAppKey, convertedVapidKey.buffer)) {
        console.log('[Push] Unsubscribing outdated subscription with mismatched VAPID key...');
        await subscription.unsubscribe().catch(() => null);
        subscription = null;
      }
    }

    if (!subscription) {
      subscription = await withTimeout(
        registration.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: convertedVapidKey,
        }),
        8000,
        'プッシュ通知サーバー(FCM/APNs)への登録通信でタイムアウトしました。ネットワークやVPN制限をご確認ください。'
      );
    }

    // ステップ5: サーバーへ購読情報の保存
    const subRes = await withTimeout(
      fetch(`${API_BASE_URL}/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: String(userId),
          subscription: subscription.toJSON(),
          userAgent: navigator.userAgent,
        }),
      }),
      5000,
      'サーバーへの通知端末登録でタイムアウトしました。'
    );

    if (!subRes.ok) {
      const errJson = await subRes.json().catch(() => ({}));
      throw new Error(errJson.error || 'サーバーへの通知購読登録に失敗しました。');
    }

    return {
      success: true,
      message: '🎉 この端末へのリアルタイム・プッシュ通知を有効にしました！',
    };
  } catch (err: any) {
    console.error('[Push] Subscribe failed:', err);
    return {
      success: false,
      error: err.message || '通知の登録処理中にエラーが発生しました。',
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
    const registration = await getOrRegisterSW();
    const subscription = registration ? await registration.pushManager.getSubscription().catch(() => null) : null;

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

export interface PushDiagnosticReport {
  isHttps: boolean;
  isTopWindow: boolean;
  hasServiceWorker: boolean;
  hasPushManager: boolean;
  hasNotification: boolean;
  permission: NotificationPermission;
  isIOS: boolean;
  isStandalone: boolean;
  vapidApiOk: boolean;
  swActive: boolean;
  swErrorDetails?: string;
  recommendations: string[];
}

export async function runPushDiagnostics(): Promise<PushDiagnosticReport> {
  const isHttps = typeof window !== 'undefined' && (window.location.protocol === 'https:' || window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
  const isTopWindow = typeof window !== 'undefined' && window.self === window.top;
  const hasServiceWorker = typeof navigator !== 'undefined' && 'serviceWorker' in navigator;
  const hasPushManager = typeof window !== 'undefined' && 'PushManager' in window;
  const hasNotification = typeof window !== 'undefined' && 'Notification' in window;
  const permission = hasNotification ? Notification.permission : 'default';
  const isIOS = isIOSDevice();
  const isStandalone = isPWAStandalone();

  let vapidApiOk = false;
  try {
    const res = await withTimeout(fetch(`${API_BASE_URL}/push/vapid-public-key`), 3000, 'timeout');
    if (res.ok) {
      const data = await res.json();
      vapidApiOk = !!data.publicKey;
    }
  } catch (e) {
    vapidApiOk = false;
  }

  let swActive = false;
  let swErrorDetails = '';
  if (hasServiceWorker) {
    try {
      const reg = await getOrRegisterSW();
      swActive = !!reg;
    } catch (e: any) {
      swActive = false;
      swErrorDetails = e.name ? `${e.name}: ${e.message}` : String(e);
      console.warn('[Push Diagnostics] SW Register failed:', e);
    }
  } else {
    swErrorDetails = 'お使いのブラウザはServiceWorkerに対応していません。';
  }

  const recommendations: string[] = [];

  if (!isTopWindow) {
    recommendations.push('【重要】現在はプレビュー画面（iFrame枠内）で動作しています。iFrame内ではブラウザのセキュリティ制限により「通知の許可ポップアップ」がブロックされ応答不能になる場合があります。画面右上の「新しいタブで開く」を押して直接アプリを開いてからお試しください。');
  }

  if (isIOS && !isStandalone) {
    recommendations.push('iPhone / iPad をご利用の場合は、Safari下部の共有ボタン [↑] から「ホーム画面に追加」を実行し、ホーム画面のアイコンから起動した状態で「通知を有効にする」を押してください。');
  }

  if (permission === 'denied') {
    recommendations.push('ブラウザで本サイトの通知が「ブロック（拒否）」に設定されています。ブラウザのアドレスバー左側の鍵アイコン等から通知を「許可」に変更してください。');
  }

  if (!vapidApiOk) {
    recommendations.push('バックエンドサーバーからのVAPID鍵取得API (/api/push/vapid-public-key) が応答しませんでした。サーバーが稼働しているか確認してください。');
  }

  if (!swActive) {
    recommendations.push(`Service Worker (/sw.js) の起動に失敗しました（エラー詳細: ${swErrorDetails || '応答なし/タイムアウト'}）。ブラウザのプライベートモード/シークレットモードや、サードパーティCookie/ストレージ制限が有効になっていないかご確認ください。`);
  }

  return {
    isHttps,
    isTopWindow,
    hasServiceWorker,
    hasPushManager,
    hasNotification,
    permission,
    isIOS,
    isStandalone,
    vapidApiOk,
    swActive,
    swErrorDetails,
    recommendations,
  };
}

