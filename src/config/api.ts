const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL || 'https://sns.teranago.synology.me/api').trim();
const cleanedBaseUrl = rawBaseUrl.endsWith('/') ? rawBaseUrl.slice(0, -1) : rawBaseUrl;

export const API_BASE_URL = cleanedBaseUrl.endsWith('/api') 
  ? cleanedBaseUrl 
  : `${cleanedBaseUrl}/api`;

