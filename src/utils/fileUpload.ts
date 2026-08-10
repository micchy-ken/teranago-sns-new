import { API_BASE_URL } from '../config/api';
import { AttachmentFile } from '../types';

/**
 * ファイルを掲示板添付ファイル保存用サーバー（/app/bulletinsfiles）にアップロードします。
 */
export async function uploadFile(file: File): Promise<AttachmentFile> {
  const fileId = `file-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const sizeMB = `${(file.size / 1024 / 1024).toFixed(2)} MB`;

  const formData = new FormData();
  formData.append('file', file);

  const response = await fetch(`${API_BASE_URL}/upload`, {
    method: 'POST',
    body: formData,
  });

  if (response.ok) {
    const data = await response.json();
    const serverUrl = data.url || data.fileUrl || data.path || `/bulletinsfiles/${encodeURIComponent(file.name)}`;
    
    const finalUrl = serverUrl.startsWith('http') 
      ? serverUrl 
      : `${API_BASE_URL.replace(/\/api$/, '')}${serverUrl}`;

    return {
      id: fileId,
      name: data.originalName || file.name,
      size: sizeMB,
      url: finalUrl,
      type: file.type,
    };
  } else {
    const errData = await response.json().catch(() => ({}));
    throw new Error(errData.error || `サーバーへのファイル保存に失敗しました (ステータス: ${response.status})`);
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
