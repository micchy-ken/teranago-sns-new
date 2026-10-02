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
    const serverUrl = data.url || data.fileUrl || data.path || `/api/bulletinsfiles/${encodeURIComponent(file.name)}`;
    
    const finalUrl = serverUrl.startsWith('http') 
      ? serverUrl 
      : `${API_BASE_URL.replace(/\/+$/, '')}/${serverUrl.replace(/^\/+/, '').replace(/^api\//, '')}`;

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
 * 添付ファイルのURL（相対パス /bulletinsfiles/... など）を完全な閲覧・DL用URLに変換します。
 * Synology NASのリバースプロキシ環境（/api/* のみがNodeコンテナに転送される環境）でも
 * 確実にプレビュー・ダウンロードできるよう、/api/bulletinsfiles/ または /api/bulletins/file/ に自動正規化します。
 */
export function resolveFileUrl(url?: string): string {
  if (!url) return '';
  if (url.startsWith('blob:') || url.startsWith('data:')) {
    return url;
  }

  const apiBase = (API_BASE_URL || '').replace(/\/+$/, '');

  // 1. フルURL (http:// または https://) の場合
  if (url.startsWith('http://') || url.startsWith('https://')) {
    try {
      const parsed = new URL(url);
      // /bulletinsfiles/ で始まっているのに /api が抜けている場合、Synologyリバースプロキシを通過させるため /api/bulletinsfiles/ に補正
      if (parsed.pathname.startsWith('/bulletinsfiles/')) {
        const subPath = parsed.pathname.replace(/^\/bulletinsfiles\//, '');
        return `${apiBase}/bulletinsfiles/${subPath}${parsed.search}`;
      }
      return url;
    } catch (_) {
      return url;
    }
  }

  // 2. 相対パスまたはファイル名のみの場合
  let clean = url.trim();
  if (clean.startsWith('./')) clean = clean.substring(2);

  if (clean.startsWith('/api/')) {
    const sub = clean.substring(5);
    return `${apiBase}/${sub}`;
  }

  if (clean.startsWith('/bulletinsfiles/')) {
    const sub = clean.substring(16);
    return `${apiBase}/bulletinsfiles/${sub}`;
  }

  if (clean.startsWith('bulletinsfiles/')) {
    const sub = clean.substring(15);
    return `${apiBase}/bulletinsfiles/${sub}`;
  }

  if (clean.startsWith('/uploads/')) {
    const sub = clean.substring(9);
    return `${apiBase}/uploads/${sub}`;
  }

  // ファイル名単体の場合 (例: "171234_report.pdf")
  if (!clean.includes('/')) {
    return `${apiBase}/bulletinsfiles/${encodeURIComponent(clean)}`;
  }

  const slash = clean.startsWith('/') ? clean : `/${clean}`;
  return `${apiBase}${slash}`;
}

/**
 * 複数ファイルのアップロード処理を並列で実行します。
 */
export async function uploadMultipleFiles(files: FileList | File[]): Promise<AttachmentFile[]> {
  const fileList = Array.from(files);
  const uploadPromises = fileList.map(file => uploadFile(file));
  return Promise.all(uploadPromises);
}

/**
 * 添付ファイルをサーバーのマウントフォルダ (/app/bulletinsfiles) から物理削除します。
 */
export async function deleteAttachmentFile(fileUrl: string): Promise<boolean> {
  if (!fileUrl) return false;
  try {
    const response = await fetch(`${API_BASE_URL}/bulletins/file?fileUrl=${encodeURIComponent(fileUrl)}`, {
      method: 'DELETE',
    });
    return response.ok;
  } catch (err) {
    console.error('Failed to delete attachment file:', err);
    return false;
  }
}

/**
 * 複数の添付ファイルを一括で物理削除します。
 */
export async function deleteAttachmentFiles(attachments?: (AttachmentFile | string)[]): Promise<void> {
  if (!attachments || attachments.length === 0) return;

  const urls: string[] = attachments.map(item => {
    if (typeof item === 'string') return item;
    return item?.url || '';
  }).filter(Boolean);

  if (urls.length === 0) return;

  try {
    await fetch(`${API_BASE_URL}/bulletins/delete-multiple`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ fileUrls: urls }),
    });
  } catch (err) {
    console.error('Failed to delete multiple attachment files:', err);
  }
}
