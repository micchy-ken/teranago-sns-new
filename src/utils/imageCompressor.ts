/**
 * imageCompressor.ts
 * クライアント側で画像を長辺1200px以下（JPEG品質0.85）にリサイズ・軽量化するユーティリティ
 */

export interface CompressionOptions {
  maxDimension?: number; // 長辺の最大px (デフォルト: 1200)
  quality?: number;      // JPEG品質 (0.0 〜 1.0, デフォルト: 0.85)
}

/**
 * File オブジェクトを受け取り、長辺1200px以下にリサイズした Base64 DataURL を返す
 */
export async function compressImageToDataUrl(
  file: File,
  options: CompressionOptions = {}
): Promise<string> {
  const maxDimension = options.maxDimension || 1200;
  const quality = options.quality !== undefined ? options.quality : 0.85;

  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new Image();
      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // 長辺の比率計算
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
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext('2d');
        if (!ctx) {
          // コンテキスト取得失敗時はフォールバック
          resolve(e.target?.result as string);
          return;
        }

        // 高品質スムージング
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = 'high';
        ctx.drawImage(img, 0, 0, width, height);

        const dataUrl = canvas.toDataURL('image/jpeg', quality);
        resolve(dataUrl);
      };

      img.onerror = () => {
        reject(new Error('画像の読み込みに失敗しました'));
      };

      img.src = e.target?.result as string;
    };

    reader.onerror = () => {
      reject(new Error('ファイルの読み込みに失敗しました'));
    };

    reader.readAsDataURL(file);
  });
}

/**
 * 画像DataURLまたは画像URLを受け取り、指定角度（90度, -90度, 180度）回転させたBase64 DataURLを返す
 */
export async function rotateImage(
  imageSource: string,
  degrees: number = 90,
  quality: number = 0.85
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      const canvas = document.createElement('canvas');
      const rad = ((degrees % 360) * Math.PI) / 180;
      const is90or270 = Math.abs(degrees % 180) === 90;

      // 90度・270度回転時は縦横を反転
      if (is90or270) {
        canvas.width = img.height;
        canvas.height = img.width;
      } else {
        canvas.width = img.width;
        canvas.height = img.height;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        resolve(imageSource);
        return;
      }

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';

      // 回転中心を中心点に移動
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(rad);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);

      const rotatedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve(rotatedDataUrl);
    };

    img.onerror = () => {
      reject(new Error('画像の回転処理に失敗しました'));
    };

    img.src = imageSource;
  });
}
