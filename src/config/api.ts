const isLocal = typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');
const isProductionDomain = typeof window !== 'undefined' && window.location.hostname === 'sns.teranago.synology.me';

const defaultApiUrl = isLocal 
  ? 'http://localhost:3001/api' 
  : (isProductionDomain ? `${window.location.origin}/api` : 'https://sns.teranago.synology.me/api');

const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL || defaultApiUrl).trim();
const cleanedBaseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

export const API_BASE_URL = cleanedBaseUrl.endsWith('/api') 
  ? cleanedBaseUrl 
  : `${cleanedBaseUrl}/api`;

export const AUTH_TOKEN_STORAGE_KEY = 'teranago_auth_token';

export function getAuthToken(): string | null {
  if (typeof window === 'undefined') return null;
  try {
    return localStorage.getItem(AUTH_TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

export function setAuthToken(token: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  try {
    if (token && String(token).trim()) {
      localStorage.setItem(AUTH_TOKEN_STORAGE_KEY, String(token).trim());
    } else {
      localStorage.removeItem(AUTH_TOKEN_STORAGE_KEY);
    }
  } catch {
    // ignore storage errors
  }
}

export function clearAuthToken(): void {
  setAuthToken(null);
}

// 全 /api/* リクエストへ Authorization: Bearer <token> を自動付与するグローバル fetch インターセプター
if (typeof window !== 'undefined' && !(window as any).__teranagoAuthFetchInstalled) {
  (window as any).__teranagoAuthFetchInstalled = true;
  const originalFetch = window.fetch.bind(window);

  window.fetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const rawUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
        ? input.toString()
        : input instanceof Request
        ? input.url
        : String(input);

    const isApiCall =
      rawUrl.startsWith(API_BASE_URL) ||
      rawUrl.includes('/api/') ||
      rawUrl.startsWith('/api');

    const token = getAuthToken();
    let nextInit: RequestInit | undefined = init;

    if (isApiCall && token) {
      const headers = new Headers(
        init?.headers || (input instanceof Request ? input.headers : undefined)
      );
      if (!headers.has('Authorization')) {
        headers.set('Authorization', `Bearer ${token}`);
      }
      nextInit = {
        ...init,
        headers
      };
    }

    const response = await originalFetch(input, nextInit);

    // 認証済み状態での API 401 応答検知（ログイン/ログアウトAPI自体は除外）
    if (
      isApiCall &&
      response.status === 401 &&
      token &&
      !/\/(auth\/login|login|auth\/logout|logout)(\/|\?|$)/.test(rawUrl)
    ) {
      clearAuthToken();
      try {
        sessionStorage.setItem(
          'auth_relogin_notice',
          'セッションの有効期限が切れたか、セキュリティ更新が適用されました。再度ログインしてください。'
        );
      } catch {}
      window.dispatchEvent(new CustomEvent('auth_session_expired'));
    }

    return response;
  };
}

