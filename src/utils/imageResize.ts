/**
 * src/utils/imageResize.ts
 * クライアントサイドでの画像リサイズ・サムネイル生成ユーティリティ
 * 2段階サムネイル方式（軽量サムネイル + 高精細オリジナル）を実現します。
 */

export interface ImageVariants {
  thumbnailFile: File;
  highResFile: File;
}

/**
 * 読み込んだ画像からCanvasを使って指定サイズ＆品質で圧縮Blobを生成
 */
function resizeImageToBlob(
  img: HTMLImageElement,
  maxDimension: number,
  quality: number,
  outputType: string = 'image/webp'
): Promise<Blob> {
  return new Promise((resolve, reject) => {
    let { width, height } = img;

    if (width > maxDimension || height > maxDimension) {
      if (width > height) {
        height = Math.round((height * maxDimension) / width);
        width = maxDimension;
      } else {
        width = Math.round((width * maxDimension) / height);
        height = maxDimension;
      }
    }

    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return reject(new Error('Failed to get canvas 2d context'));
    }

    // 縮小補間の画質設定
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(img, 0, 0, width, height);

    // WebP対応確認（非対応環境は image/jpeg にフォールバック）
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          // WebP失敗時はJPEGで再試行
          canvas.toBlob(
            (fallbackBlob) => {
              if (fallbackBlob) resolve(fallbackBlob);
              else reject(new Error('Canvas toBlob failed'));
            },
            'image/jpeg',
            quality
          );
        }
      },
      outputType,
      quality
    );
  });
}

/**
 * 単一の画像ファイルから「超軽量サムネイル（長辺480px）」と「高精細画像（長辺2400px）」を生成
 */
export async function createImageVariants(file: File): Promise<ImageVariants> {
  // 画像以外（PDF等）の場合はリサイズせずそのまま返却
  if (!file.type.startsWith('image/') && !/\.(jpg|jpeg|png|webp|gif)$/i.test(file.name)) {
    return {
      thumbnailFile: file,
      highResFile: file,
    };
  }

  // GIFアニメーションの場合は1コマになってしまうのを防ぐため、原本をそのまま維持
  if (file.type === 'image/gif') {
    return {
      thumbnailFile: file,
      highResFile: file,
    };
  }

  return new Promise((resolve) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = async () => {
      try {
        // 1. タイムライン用サムネイル: 長辺480px / 品質80% (約25KB〜45KB)
        const thumbBlob = await resizeImageToBlob(img, 480, 0.80, 'image/webp');
        const thumbName = `thumb_${file.name.replace(/\.[^/.]+$/, '')}.webp`;
        const thumbnailFile = new File([thumbBlob], thumbName, { type: 'image/webp' });

        // 2. 拡大表示・原本用高精細画像:
        // 元画像が2400px以上または1.5MBを超える場合は長辺2400px・品質88%に最適化(約400KB〜800KB)
        // すでに手頃なサイズの場合は元データをそのまま活かす
        let highResFile = file;
        if (img.width > 2400 || img.height > 2400 || file.size > 1.5 * 1024 * 1024) {
          const highResBlob = await resizeImageToBlob(img, 2400, 0.88, 'image/webp');
          const highResName = `${file.name.replace(/\.[^/.]+$/, '')}_hd.webp`;
          highResFile = new File([highResBlob], highResName, { type: 'image/webp' });
        }

        URL.revokeObjectURL(objectUrl);
        resolve({ thumbnailFile, highResFile });
      } catch (err) {
        console.warn('[ImageVariants] Failed to resize, fallback to original:', err);
        URL.revokeObjectURL(objectUrl);
        resolve({ thumbnailFile: file, highResFile: file });
      }
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ thumbnailFile: file, highResFile: file });
    };

    img.src = objectUrl;
  });
}
