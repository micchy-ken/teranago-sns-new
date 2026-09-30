import { API_BASE_URL } from '../config/api';

/**
 * スタンプ画像URLを環境（GitHub Pages / Synology NAS / Local Dev）に応じて
 * バックエンド API_BASE_URL (/api/stamps-static/...) 経由の絶対URLへ変換・補正する関数
 */
export function getStampUrl(url?: string | null): string {
  if (!url) return '';
  if (url.startsWith('data:image/') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // クエリパラメータの分離
  const [basePath, query] = url.split('?');
  const cleanPath = basePath.startsWith('/') ? basePath : `/${basePath}`;
  const queryString = query ? `?${query}` : '';

  // /stamps/... のパスを /api/stamps-static/... へ変換
  if (cleanPath.startsWith('/stamps/')) {
    const relative = cleanPath.replace(/^\/stamps\//, '');
    return `${API_BASE_URL}/stamps-static/${relative}${queryString}`;
  }

  if (cleanPath.startsWith('/api/stamps-static/')) {
    const relative = cleanPath.replace(/^\/api\/stamps-static\//, '');
    return `${API_BASE_URL}/stamps-static/${relative}${queryString}`;
  }

  if (cleanPath.startsWith('/api/')) {
    const relative = cleanPath.replace(/^\/api\//, '');
    return `${API_BASE_URL}/${relative}${queryString}`;
  }

  return `${API_BASE_URL}/stamps-static${cleanPath}${queryString}`;
}
