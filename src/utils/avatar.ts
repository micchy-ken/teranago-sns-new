import { API_BASE_URL } from '../config/api';

/**
 * デフォルトの顔シルエット（SVGデータURL）
 * 薄いグレーの背景に、白に近いグレーの人影を表現したシンプルで洗練されたシルエットです。
 */
export const SILHOUETTE_SVG = "data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='%23cbd5e1' style='background-color:%23f1f5f9'><path d='M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z'/></svg>";

/**
 * ユーザーのアバターURLを解決するヘルパー関数
 * サンプル画像や空値の場合は、顔のシルエットを返します。
 * また、アップロードされた相対パス（/uploads/...）の場合は適切な絶対URLに変換します。
 */
export const getAvatarUrl = (url?: string): string => {
  if (!url || typeof url !== 'string' || url.trim() === '' || url.includes('pravatar.cc') || url === 'avatar') {
    return SILHOUETTE_SVG;
  }

  // Windowsパスなどのバックスラッシュをスラッシュに置換
  let sanitizedUrl = url.replace(/\\/g, '/');

  // /uploads/ または uploads/ の位置を特定して、動的に現在の API_BASE_URL と紐付ける
  // これにより、データベースに保存されているドメイン(例: 192.168.24.50)と、
  // 現在アクセスしている環境(例: https://sns.teranago.synology.me)が異なっていても、
  // 正しいホスト名でアバター画像を表示できるようになります。
  const uploadIndex = sanitizedUrl.indexOf('/uploads/');
  const uploadIndexNoSlash = sanitizedUrl.indexOf('uploads/');
  
  let relativePath = '';
  if (uploadIndex !== -1) {
    relativePath = sanitizedUrl.substring(uploadIndex); // 例: "/uploads/avatar-xxx.png"
  } else if (uploadIndexNoSlash !== -1) {
    relativePath = '/' + sanitizedUrl.substring(uploadIndexNoSlash); // 例: "/uploads/avatar-xxx.png"
  } else if (sanitizedUrl.startsWith('avatar-') || sanitizedUrl.includes('avatar-')) {
    // ファイル名のみ、または末尾のみにアバターファイル名が含まれる場合
    const match = sanitizedUrl.match(/avatar-[^/]+$/);
    if (match) {
      relativePath = `/uploads/${match[0]}`;
    }
  }

  if (relativePath) {
    const baseUrl = API_BASE_URL.replace(/\/api$/, '');
    return `${baseUrl}${relativePath}`;
  }

  // http から始まる絶対URLの場合はそのまま返す
  if (sanitizedUrl.startsWith('http://') || sanitizedUrl.startsWith('https://')) {
    return sanitizedUrl;
  }

  // それ以外の相対パスはベースドメインを付与してフォールバック
  const baseUrl = API_BASE_URL.replace(/\/api$/, '');
  const prefix = sanitizedUrl.startsWith('/') ? sanitizedUrl : `/${sanitizedUrl}`;
  return `${baseUrl}${prefix}`;
};
