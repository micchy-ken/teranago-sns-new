import { API_BASE_URL } from '../config/api';

export interface OgpData {
  url: string;
  hostname: string;
  title: string;
  description?: string;
  image?: string;
  siteName?: string;
  favicon?: string;
}

const memoryOgpCache = new Map<string, OgpData>();

export async function fetchOgpData(rawUrl: string): Promise<OgpData> {
  let targetUrl = (rawUrl || '').trim();
  if (!targetUrl) {
    throw new Error('URL is empty');
  }
  if (!/^https?:\/\//i.test(targetUrl)) {
    targetUrl = 'https://' + targetUrl;
  }

  if (memoryOgpCache.has(targetUrl)) {
    return memoryOgpCache.get(targetUrl)!;
  }

  try {
    const res = await fetch(`${API_BASE_URL}/ogp?url=${encodeURIComponent(targetUrl)}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch OGP: ${res.statusText}`);
    }
    const data: OgpData = await res.json();
    memoryOgpCache.set(targetUrl, data);
    return data;
  } catch (err) {
    let hostname = '';
    try {
      hostname = new URL(targetUrl).hostname;
    } catch {
      hostname = targetUrl;
    }
    const fallback: OgpData = {
      url: targetUrl,
      hostname,
      title: hostname,
      description: '',
      image: '',
      siteName: hostname,
      favicon: `https://www.google.com/s2/favicons?domain=${hostname}&sz=64`,
    };
    memoryOgpCache.set(targetUrl, fallback);
    return fallback;
  }
}
