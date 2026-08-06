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

