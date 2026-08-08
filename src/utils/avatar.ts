import { API_BASE_URL } from '../config/api';

/**
 * デフォルトの顔シルエット（SVGデータURL）
 * 薄いグレーの背景に、白に近いグレーの人影を表現したシンプルで洗練されたシルエットです。
 */
export const SILHOUETTE_SVG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2NiZDVlMSIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6I2YxZjVmOSI+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg==";

/**
 * ユーザーのアバターURLを解決するヘルパー関数
 * サンプル画像や空値の場合は、顔のシルエットを返します。
 * また、アップロードされた相対パス（/uploads/...）の場合は適切な絶対URLに変換します。
 */
export const getAvatarUrl = (url?: string): string => {
  if (
    !url || 
    typeof url !== 'string' || 
    url.trim() === '' || 
    url.includes('pravatar') || 
    url.includes('placeholder') ||
    url.includes('picsum.photos') ||
    url === 'avatar'
  ) {
    return SILHOUETTE_SVG;
  }

  // Windowsパスなどのバックスラッシュをスラッシュに置換
  let sanitizedUrl = url.replace(/\\/g, '/');

  // もしdataスキーム（Base64の埋め込み画像やSILHOUETTE_SVGなど）であればそのまま返す
  if (sanitizedUrl.startsWith('data:')) {
    return sanitizedUrl;
  }

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

/**
 * <img> タグの onError イベント用ハンドラー
 * 画像読み込みエラーが発生した場合にデフォルトシルエット画像に自動フォールバックします。
 */
export const handleAvatarError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
  if (e.currentTarget.src !== SILHOUETTE_SVG) {
    e.currentTarget.src = SILHOUETTE_SVG;
  }
};

/**
 * データベース保存用にアバターURLをサニタイズ（クレンジング）します。
 * シルエット画像（data:スキーム）やサンプル画像の場合は、無駄なデータを保存しないよう、空文字にします。
 * アップロード画像（/uploads/...）の絶対URLが渡された場合は、ドメインに依存しないように相対パスに変換して保存します。
 */
export const sanitizeAvatarUrlForSave = (url?: string): string => {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return '';
  }

  let sanitized = url.replace(/\\/g, '/');

  // dataスキーム（シルエットなど）やサンプルプレビューは空文字にする
  if (sanitized.startsWith('data:') || sanitized.includes('pravatar.cc') || sanitized === 'avatar') {
    return '';
  }

  // もし現在の環境や他ドメインの絶対URLであれば、/uploads/ 以降の相対パスに変換する
  const uploadIndex = sanitized.indexOf('/uploads/');
  if (uploadIndex !== -1) {
    return sanitized.substring(uploadIndex); // "/uploads/avatar-xxx.png"
  }

  const uploadIndexNoSlash = sanitized.indexOf('uploads/');
  if (uploadIndexNoSlash !== -1) {
    return '/' + sanitized.substring(uploadIndexNoSlash);
  }

  return url;
};

