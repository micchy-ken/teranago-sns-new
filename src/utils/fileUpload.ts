import { API_BASE_URL } from '../config/api';
import { AttachmentFile } from '../types';

/**
 * ファイルをサーバーにアップロードします。
 * サーバー通信が失敗した場合や非活性の場合は、URL.createObjectURLを用いた
 * ローカルのプレビューURL（またはBase64）にフォールバックします。
 */
export async function uploadFile(file: File): Promise<AttachmentFile> {
  const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const sizeMB = `${(file.size / 1024 / 1024).toFixed(2)} MB`;

  try {
    const formData = new FormData();
    formData.append('file', file);

    // ユーザー指定の汎用的な /api/upload エンドポイント
    const response = await fetch(`${API_BASE_URL}/upload`, {
      method: 'POST',
      body: formData,
    });

    if (response.ok) {
      const data = await response.json();
      // サーバーから返されたURLを使用
      // サーバーが { url: '...' } または { fileUrl: '...' } などを返すことを想定
      const serverUrl = data.url || data.fileUrl || data.path || `/uploads/${file.name}`;
      
      // もし返されたURLが相対パスならAPIのベースに結合する
      const finalUrl = serverUrl.startsWith('http') 
        ? serverUrl 
        : `${API_BASE_URL.replace(/\/api$/, '')}${serverUrl}`;

      return {
        id: fileId,
        name: file.name,
        size: sizeMB,
        url: finalUrl,
        type: file.type,
      };
    } else {
      throw new Error('Server upload failed');
    }
  } catch (err) {
    console.warn('⚠️ File upload API failed. Falling back to local ObjectURL for preview.', err);
    
    // フォールバック: ローカルプレビュー用オブジェクトURLを生成
    // これにより、本物のサーバーがなくてもPDFや画像を完璧にプレビューできます。
    const localUrl = URL.createObjectURL(file);
    
    return {
      id: fileId,
      name: file.name,
      size: sizeMB,
      url: localUrl,
      type: file.type,
    };
  }
}

/**
 * 複数ファイルのアップロード処理を並列で実行します。
 */
export async function uploadMultipleFiles(files: FileList | File[]): Promise<AttachmentFile[]> {
  const fileList = Array.from(files);
  const uploadPromises = fileList.map(file => uploadFile(file));
  return Promise.all(uploadPromises);
}
