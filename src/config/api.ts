/**
 * API Configuration for Teranago SNS
 * 
 * In GitHub environment (GitHub Pages static host) or external deployments,
 * relative paths like '/api' result in 404 because GitHub Pages does not run a Node/Express backend.
 * 
 * This module dynamically determines the correct API base URL:
 * 1. `import.meta.env.VITE_API_BASE_URL` if set.
 * 2. `https://sns.teranago.synology.me/api` if running on GitHub Pages (*.github.io).
 * 3. `/api` for local Vite development server proxy or container execution.
 */

export const getApiBaseUrl = (): string => {
  // 1. Explicit environment variable (e.g. set in GitHub Actions or .env)
  const metaEnv = (import.meta as any).env;
  if (metaEnv && metaEnv.VITE_API_BASE_URL) {
    return metaEnv.VITE_API_BASE_URL.replace(/\/$/, '');
  }

  // 2. Detect GitHub Pages / Static Hosting environment
  if (typeof window !== 'undefined') {
    const hostname = window.location.hostname;
    if (hostname.endsWith('github.io') || hostname.includes('github.app')) {
      return 'https://sns.teranago.synology.me/api';
    }
  }

  // 3. Local proxy default
  return '/api';
};

export const API_BASE_URL = getApiBaseUrl();

/**
 * Returns a complete URL for an API endpoint
 */
export const getApiUrl = (endpoint: string): string => {
  const cleanEndpoint = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const base = API_BASE_URL.endsWith('/') ? API_BASE_URL.slice(0, -1) : API_BASE_URL;
  return `${base}${cleanEndpoint}`;
};

/**
 * Custom fetch wrapper that automatically routes relative '/api' calls to the correct API base URL.
 */
export const apiFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
  let urlStr: string;

  if (typeof input === 'string') {
    if (input.startsWith('/api/')) {
      urlStr = getApiUrl(input.substring(4));
    } else if (input.startsWith('/api')) {
      urlStr = getApiUrl(input.substring(4));
    } else if (!input.startsWith('http://') && !input.startsWith('https://') && !input.startsWith('//')) {
      urlStr = getApiUrl(input);
    } else {
      urlStr = input;
    }
  } else if (input instanceof URL) {
    urlStr = input.toString();
  } else {
    urlStr = (input as Request).url;
  }

  return fetch(urlStr, init);
};

