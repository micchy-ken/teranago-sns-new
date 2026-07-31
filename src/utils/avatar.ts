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
  if (!url || typeof url !== 'string' || url.trim() === '' || url.includes('pravatar.cc')) {
    return SILHOUETTE_SVG;
  }

  // アップロードされた相対パスを絶対URLにする
  if (url.startsWith('/uploads/') || url.startsWith('uploads/')) {
    const relativePath = url.startsWith('/') ? url : `/${url}`;
    const baseUrl = API_BASE_URL.replace(/\/api$/, '');
    return `${baseUrl}${relativePath}`;
  }

  return url;
};
