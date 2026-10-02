/**
 * config.js
 * 共通パス設定 & ストレージディレクトリ定義
 */
import path from 'path';
import fs from 'fs';

export const dataDir = path.join(process.cwd(), 'data');
export const uploadDir = path.join(process.cwd(), 'uploads');
export const uploadsDir = path.join(process.cwd(), 'uploads');
export const bulletinsFilesDir = path.join(process.cwd(), 'uploads', 'bulletinsfiles');
export const externalFilesDir = path.join(process.cwd(), 'uploads', 'external-files');
export const documentsFilesDir = path.join(process.cwd(), 'uploads', 'documents');

[dataDir, uploadDir, uploadsDir, bulletinsFilesDir, externalFilesDir, documentsFilesDir].forEach(dir => {
  if (!fs.existsSync(dir)) {
    try { fs.mkdirSync(dir, { recursive: true }); } catch (_) {}
  }
});

export function safeParseJSON(str, fallback = null) {
  if (!str) return fallback;
  if (typeof str === 'object') return str;
  try {
    return JSON.parse(str);
  } catch (_) {
    return fallback;
  }
}

export default {
  dataDir,
  uploadDir,
  uploadsDir,
  bulletinsFilesDir,
  externalFilesDir,
  documentsFilesDir,
  safeParseJSON
};
