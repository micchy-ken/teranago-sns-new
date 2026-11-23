import { API_BASE_URL, appendAuthTokenToUrl } from '../config/api';

/**
 * デフォルトの顔シルエット（SVGデータURL）
 * 薄いグレーの背景に、白に近いグレーの人影を表現したシンプルで洗練されたシルエットです。
 */
export const SILHOUETTE_SVG = "data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCIgZmlsbD0iI2NiZDVlMSIgc3R5bGU9ImJhY2tncm91bmQtY29sb3I6I2YxZjVmOSI+PHBhdGggZD0iTTEyIDEyYzIuMjEgMCA0LTEuNzkgNC00cy0xLjc5LTQtNC00LTQgMS43OS00IDQgMS43OSA0IDQgNHptMCAyYy0yLjY3IDAtOCAxLjM0LTggNHYyaDE2di0yYzAtMi42Ni01LjMzLTQtOC00eiIvPjwvc3ZnPg==";

const stripTokenParam = (rawUrl: string): string => {
  const hashIdx = rawUrl.indexOf('#');
  const beforeHash = hashIdx !== -1 ? rawUrl.slice(0, hashIdx) : rawUrl;
  const hashPart = hashIdx !== -1 ? rawUrl.slice(hashIdx) : '';
  const queryIdx = beforeHash.indexOf('?');
  if (queryIdx === -1) return rawUrl;

  const basePath = beforeHash.slice(0, queryIdx);
  const queryStr = beforeHash.slice(queryIdx + 1);
  const keptParams = queryStr
    .split('&')
    .filter((pair) => pair && !/^token=/i.test(pair));

  return `${basePath}${keptParams.length > 0 ? `?${keptParams.join('&')}` : ''}${hashPart}`;
};

/**
 * ユーザーのアバターURLを解決するヘルパー関数
 * サンプル画像や空値の場合は、顔のシルエットを返します。
 * また、アップロードされた相対パス（/uploads/...）の場合は Synology リバースプロキシ配下でも
 * 確実に配信されるよう API_BASE_URL（/api/uploads/...）経由の絶対URLへ正規化し、最新トークンを付与します。
 */
export const getAvatarUrl = (url?: string): string => {
  if (
    !url || 
    typeof url !== 'string' || 
    url.trim() === '' || 
    url.trim().toLowerCase() === 'null' ||
    url.trim().toLowerCase() === 'undefined' ||
    url.trim().toLowerCase() === 'none' ||
    url.includes('[object') ||
    url.includes('pravatar') || 
    url.includes('placeholder') ||
    url.includes('picsum.photos') ||
    url === 'avatar'
  ) {
    return SILHOUETTE_SVG;
  }

  // Windowsパスなどのバックスラッシュをスラッシュに置換
  const sanitizedUrl = stripTokenParam(url.trim().replace(/\\/g, '/'));

  // もしdataスキーム（Base64の埋め込み画像やSILHOUETTE_SVGなど）であればそのまま返す
  if (sanitizedUrl.startsWith('data:') || sanitizedUrl.startsWith('blob:')) {
    return sanitizedUrl;
  }

  // /uploads/ または uploads/ の位置を特定して、動的に現在の API_BASE_URL (/api/uploads/...) と紐付ける
  // これにより、本番(teranago-sns/po)・旧環境(micchy-ken)・Synologyリバースプロキシ(/api/*転送)の
  // いずれの環境でも確実にユーザーアイコンを表示できるようになります。
  const uploadIndex = sanitizedUrl.indexOf('/uploads/');
  const uploadIndexNoSlash = sanitizedUrl.indexOf('uploads/');

  let relativePath = '';
  if (uploadIndex !== -1) {
    relativePath = sanitizedUrl.substring(uploadIndex); // 例: "/uploads/avatar-xxx.png"
  } else if (uploadIndexNoSlash !== -1) {
    relativePath = '/' + sanitizedUrl.substring(uploadIndexNoSlash); // 例: "/uploads/avatar-xxx.png"
  } else if (sanitizedUrl.startsWith('avatar-') || sanitizedUrl.includes('avatar-')) {
    // ファイル名のみ、または末尾のみにアバターファイル名が含まれる場合
    const match = sanitizedUrl.match(/avatar-[^/?#]+/);
    if (match) {
      relativePath = `/uploads/${match[0]}`;
    }
  }

  if (relativePath) {
    const apiBase = API_BASE_URL.replace(/\/+$/, '');
    return appendAuthTokenToUrl(`${apiBase}${relativePath}`);
  }

  // http から始まる絶対URLの場合はそのまま最新トークンを付与して返す
  if (sanitizedUrl.startsWith('http://') || sanitizedUrl.startsWith('https://')) {
    return appendAuthTokenToUrl(sanitizedUrl);
  }

  // それ以外の相対パスは API_BASE_URL を付与してフォールバック
  const apiBase = API_BASE_URL.replace(/\/+$/, '');
  const prefix = sanitizedUrl.startsWith('/') ? sanitizedUrl : `/${sanitizedUrl}`;
  return appendAuthTokenToUrl(`${apiBase}${prefix}`);
};

/**
 * <img> タグの onError イベント用ハンドラー
 * /api/uploads/... と /uploads/... の間で1回だけ自動的に代替パスへフォールバック再試行し、
 * それでも読み込めない場合にデフォルトシルエット画像へ切り替えます。
 */
export const handleAvatarError = (e: React.SyntheticEvent<HTMLImageElement, Event>) => {
  const img = e.currentTarget;
  const currentSrc = img.currentSrc || img.src || '';

  // 1回だけ /api/uploads/ ⇔ /uploads/ の代替ルートを自動リトライ（NAS構成差分の完全吸収）
  if (img.dataset.avatarFallbackTried !== '1' && currentSrc && !currentSrc.startsWith('data:')) {
    const cleanSrc = stripTokenParam(currentSrc);
    let alternateUrl = '';
    if (cleanSrc.includes('/api/uploads/')) {
      alternateUrl = appendAuthTokenToUrl(cleanSrc.replace('/api/uploads/', '/uploads/'));
    } else if (cleanSrc.includes('/uploads/')) {
      alternateUrl = appendAuthTokenToUrl(cleanSrc.replace('/uploads/', '/api/uploads/'));
    }

    if (alternateUrl && alternateUrl !== currentSrc) {
      img.dataset.avatarFallbackTried = '1';
      img.src = alternateUrl;
      return;
    }
  }

  img.onerror = null;
  if (img.src !== SILHOUETTE_SVG) {
    img.src = SILHOUETTE_SVG;
  }
};

/**
 * データベース保存用にアバターURLをサニタイズ（クレンジング）します。
 * シルエット画像（data:スキーム）やサンプル画像の場合は、無駄なデータを保存しないよう、空文字にします。
 * アップロード画像（/uploads/...）の絶対URLが渡された場合は、ドメインや認証トークンに依存しないよう
 * クエリパラメータを除去した相対パスに変換して保存します。
 */
export const sanitizeAvatarUrlForSave = (url?: string): string => {
  if (!url || typeof url !== 'string' || url.trim() === '') {
    return '';
  }

  const sanitized = stripTokenParam(url.trim().replace(/\\/g, '/'));

  // dataスキーム（シルエットなど）やサンプルプレビューは空文字にする
  if (sanitized.startsWith('data:') || sanitized.includes('pravatar.cc') || sanitized === 'avatar') {
    return '';
  }

  // もし現在の環境や他ドメインの絶対URLであれば、/uploads/ 以降の相対パスに変換する（クエリ除去済み）
  const uploadIndex = sanitized.indexOf('/uploads/');
  if (uploadIndex !== -1) {
    return sanitized.substring(uploadIndex); // "/uploads/avatar-xxx.png"
  }

  const uploadIndexNoSlash = sanitized.indexOf('uploads/');
  if (uploadIndexNoSlash !== -1) {
    return '/' + sanitized.substring(uploadIndexNoSlash);
  }

  return sanitized;
};

/**
 * アンシャープマスク（輪郭強調・シャープネス）フィルター
 * 縮小処理によって失われたディテールや輪郭の高周波成分を強調補正し、
 * ブラウザ上で20px〜48px等の極小サイズに縮小された際にも目鼻立ちやロゴがくっきりと引き締まって見えるようにします。
 */
export function applyUnsharpMask(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  amount = 0.28
): void {
  try {
    const imgData = ctx.getImageData(0, 0, width, height);
    const data = imgData.data;
    const copy = new Uint8ClampedArray(data);

    // 3x3 アンシャープマスク・コンボリューションカーネル
    // [  0,      -amount,      0   ]
    // [ -amount, 1+4*amount, -amount ]
    // [  0,      -amount,      0   ]
    const centerWeight = 1 + 4 * amount;
    const neighborWeight = -amount;

    for (let y = 1; y < height - 1; y++) {
      const yOffset = y * width;
      const topOffset = (y - 1) * width;
      const bottomOffset = (y + 1) * width;

      for (let x = 1; x < width - 1; x++) {
        const idx = (yOffset + x) * 4;
        const topIdx = (topOffset + x) * 4;
        const bottomIdx = (bottomOffset + x) * 4;
        const leftIdx = (yOffset + (x - 1)) * 4;
        const rightIdx = (yOffset + (x + 1)) * 4;

        // R, G, B 各チャンネルに適用（アルファ透過度は保持）
        for (let c = 0; c < 3; c++) {
          const center = copy[idx + c];
          const top = copy[topIdx + c];
          const bottom = copy[bottomIdx + c];
          const left = copy[leftIdx + c];
          const right = copy[rightIdx + c];

          const sharpened = center * centerWeight + (top + bottom + left + right) * neighborWeight;
          data[idx + c] = sharpened < 0 ? 0 : sharpened > 255 ? 255 : sharpened;
        }
      }
    }

    ctx.putImageData(imgData, 0, 0);
  } catch (e) {
    console.warn('Unsharp mask processing failed, continuing with unsharpened image:', e);
  }
}

/**
 * 登録・アップロードされたアイコン画像の縮小・正方形クロップ・高品質リサイズ処理
 * - 元画像が巨大・長方形の場合、中央正方形に自動クロップ
 * - 最適解像度（256x256 px）に高品質ステップダウン縮小
 * - アンシャープマスク（輪郭強調）フィルターを適用し、小サイズ縮小時でも輪郭がシャープに引き締まる
 * - 縮小後のファイルサイズも軽量化（高品位PNGまたは高画質JPEG）
 */
export async function optimizeAvatarFile(file: File, targetSize = 256): Promise<File> {
  // SVGやGIFアニメ等のベクター・動的画像はそのまま返す
  if (file.type === 'image/svg+xml' || file.type === 'image/gif') {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        try {
          const width = img.naturalWidth || img.width;
          const height = img.naturalHeight || img.height;

          if (!width || !height) {
            resolve(file);
            return;
          }

          // 正方形クロップの計算 (中央寄せ)
          const minDim = Math.min(width, height);
          const sx = Math.floor((width - minDim) / 2);
          const sy = Math.floor((height - minDim) / 2);

          // 目標サイズ (元画像が targetSize より小さい場合は元の寸法を活かし過剰引き伸ばしを防止)
          const outputSize = Math.min(minDim, targetSize);

          const canvas = document.createElement('canvas');
          canvas.width = outputSize;
          canvas.height = outputSize;
          const ctx = canvas.getContext('2d');

          if (!ctx) {
            resolve(file);
            return;
          }

          // 高品質スムージング設定
          ctx.imageSmoothingEnabled = true;
          ctx.imageSmoothingQuality = 'high';

          // 2段階縮小（元画像が目標サイズの2倍以上大きい場合の中間ステップ縮小によるエイリアシング防止）
          if (minDim > outputSize * 2) {
            const stepCanvas = document.createElement('canvas');
            const stepDim = Math.max(outputSize * 2, Math.floor(minDim / 2));
            stepCanvas.width = stepDim;
            stepCanvas.height = stepDim;
            const stepCtx = stepCanvas.getContext('2d');
            if (stepCtx) {
              stepCtx.imageSmoothingEnabled = true;
              stepCtx.imageSmoothingQuality = 'high';
              stepCtx.drawImage(img, sx, sy, minDim, minDim, 0, 0, stepDim, stepDim);
              ctx.drawImage(stepCanvas, 0, 0, stepDim, stepDim, 0, 0, outputSize, outputSize);
            } else {
              ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, outputSize, outputSize);
            }
          } else {
            ctx.drawImage(img, sx, sy, minDim, minDim, 0, 0, outputSize, outputSize);
          }

          // 【対策2】アンシャープマスク（輪郭強調）フィルターを適用
          applyUnsharpMask(ctx, outputSize, outputSize, 0.28);

          // PNG形式または高画質JPEGとしてBlob化 (透過ありはPNG、それ以外はJPEG品質0.95)
          const isPng = file.type === 'image/png';
          const mimeType = isPng ? 'image/png' : 'image/jpeg';
          canvas.toBlob(
            (blob) => {
              if (blob) {
                const baseName = file.name.replace(/\.[^.]+$/, '');
                const ext = isPng ? '.png' : '.jpg';
                const optimizedFile = new File([blob], `${baseName}${ext}`, { type: mimeType });
                resolve(optimizedFile);
              } else {
                resolve(file);
              }
            },
            mimeType,
            0.95
          );
        } catch (err) {
          console.warn('Avatar optimization error, using original file:', err);
          resolve(file);
        }
      };
      img.onerror = () => resolve(file);
      img.src = e.target?.result as string;
    };
    reader.onerror = () => resolve(file);
    reader.readAsDataURL(file);
  });
}

