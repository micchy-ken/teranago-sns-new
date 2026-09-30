import { API_BASE_URL } from '../config/api';

/**
 * スタンプ画像URLを環境（GitHub Pages / Synology NAS / Local Dev）に応じて安全に解決するヘルパー関数
 * 
 * 1. ユーザーアイコン（アバター）と同様、アップロードされたスタンプ画像（/uploads/...）は
 *    Synology NAS が配信する `${API_BASE_URL.replace(/\/api$/, '')}/uploads/...` を返します。
 * 2. 初期デフォルトスタンプ（/stamps/...）は、フロントエンド（GitHub Pages 等のベースパス配下）
 *    から確実に読み込めるよう `import.meta.env.BASE_URL` と結合して解決します。
 */
export function getStampUrl(url?: string | null): string {
  if (!url || typeof url !== 'string' || url.trim() === '') return '';

  // Base64データまたは外部フルURLはそのまま返却
  if (url.startsWith('data:') || url.startsWith('http://') || url.startsWith('https://')) {
    return url;
  }

  // Windowsパス等のバックスラッシュをスラッシュに置換
  const sanitizedUrl = url.replace(/\\/g, '/');

  // クエリパラメータの分離
  const [basePath, query] = sanitizedUrl.split('?');
  const queryString = query ? `?${query}` : '';

  // ① アップロード画像（/uploads/）の場合：ユーザーアイコンと同じ方式で Synology NAS ホストへ紐付け
  const uploadIndex = basePath.indexOf('/uploads/');
  const uploadIndexNoSlash = basePath.indexOf('uploads/');

  if (uploadIndex !== -1 || uploadIndexNoSlash !== -1 || basePath.includes('stamp-') || basePath.includes('stamp_')) {
    let relativePath = '';
    if (uploadIndex !== -1) {
      relativePath = basePath.substring(uploadIndex); // 例: "/uploads/stamp-xxx.png"
    } else if (uploadIndexNoSlash !== -1) {
      relativePath = '/' + basePath.substring(uploadIndexNoSlash);
    } else {
      relativePath = `/uploads/${basePath.replace(/^\/+/, '')}`;
    }

    const baseUrl = API_BASE_URL.replace(/\/api$/, '');
    return `${baseUrl}${relativePath}${queryString}`;
  }

  // ② デフォルト公式スタンプ（/stamps/xxx.svg 等）の場合：
  // GitHub Pages のサブディレクトリ（例: /teranago-sns-new/stamps/xxx.svg）を解決
  const frontendBase = (import.meta.env.BASE_URL || '/').replace(/\/$/, '');
  const cleanLocalPath = basePath.startsWith('/') ? basePath : `/${basePath}`;

  // すでに frontendBase が含まれている場合は二重付与を防ぐ
  if (frontendBase && cleanLocalPath.startsWith(frontendBase)) {
    return `${cleanLocalPath}${queryString}`;
  }

  return `${frontendBase}${cleanLocalPath}${queryString}`;
}
