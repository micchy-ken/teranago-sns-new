import express from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // 外部ファイル（NAS共有用）ストレージディレクトリ
  const externalFilesDir = path.join(process.cwd(), 'data', 'external-files');
  if (!fs.existsSync(externalFilesDir)) {
    fs.mkdirSync(externalFilesDir, { recursive: true });
  }

  // 静的ファイル配信
  app.use('/external-files', express.static(externalFilesDir));

  // ==========================================
  // 外部NAS同期・外部ファイル連携用 API
  // ==========================================
  const externalStorage = multer.diskStorage({
    destination: function (req, file, cb) {
      const subDir = typeof req.body.folder === 'string' ? req.body.folder.replace(/\.\./g, '') : '';
      const targetPath = path.join(externalFilesDir, subDir);
      if (!fs.existsSync(targetPath)) {
        fs.mkdirSync(targetPath, { recursive: true });
      }
      cb(null, targetPath);
    },
    filename: function (req, file, cb) {
      let originalName = file.originalname;
      try {
        originalName = Buffer.from(file.originalname, 'latin1').toString('utf8');
      } catch (e) {
        originalName = file.originalname;
      }
      cb(null, originalName);
    }
  });
  const uploadExternal = multer({ storage: externalStorage });

  app.post('/api/external-files/upload', uploadExternal.single('file'), (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'ファイルが選択されていません。' });
      }
      const relPath = req.body.folder ? (req.body.folder + '/' + req.file.filename).replace(/\\/g, '/') : req.file.filename;
      res.json({
        message: 'アップロード完了しました。',
        file: {
          name: req.file.filename,
          path: relPath,
          url: '/api/external-files/serve?path=' + encodeURIComponent(relPath),
          size: req.file.size,
          mtime: new Date().toISOString(),
          isDirectory: false,
          extension: path.extname(req.file.filename).replace('.', '').toLowerCase()
        }
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  function getAllFilesRecursive(dirPath: string, relativeRoot = ""): any[] {
    let results: any[] = [];
    if (!fs.existsSync(dirPath)) return results;
    try {
      const list = fs.readdirSync(dirPath);
      list.forEach((file) => {
        if (file.startsWith('.') || file === '@eaDir' || file === 'thumbs.db') return;
        
        const filePath = path.join(dirPath, file);
        const relPath = relativeRoot ? path.join(relativeRoot, file) : file;
        const stat = fs.statSync(filePath);
        
        if (stat.isDirectory()) {
          results.push({
            name: file,
            path: relPath.replace(/\\/g, '/'),
            size: 0,
            mtime: stat.mtime,
            isDirectory: true,
            extension: ''
          });
          results = results.concat(getAllFilesRecursive(filePath, relPath));
        } else {
          const ext = path.extname(file).replace('.', '').toLowerCase();
          results.push({
            name: file,
            path: relPath.replace(/\\/g, '/'),
            url: '/api/external-files/serve?path=' + encodeURIComponent(relPath.replace(/\\/g, '/')),
            size: stat.size,
            mtime: stat.mtime,
            isDirectory: false,
            extension: ext
          });
        }
      });
    } catch (e) {
      console.error('Error scanning folder:', e);
    }
    return results;
  }

  app.get('/api/external-files/list', (req, res) => {
    try {
      const allFiles = getAllFilesRecursive(externalFilesDir);
      const query = typeof req.query.q === 'string' ? req.query.q.toLowerCase().trim() : '';
      
      if (query) {
        const filtered = allFiles.filter(f => 
          f.name.toLowerCase().includes(query) || 
          f.path.toLowerCase().includes(query)
        );
        return res.json(filtered);
      }
      
      res.json(allFiles);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/external-files/serve', (req, res) => {
    try {
      const targetRelPath = req.query.path;
      if (!targetRelPath || typeof targetRelPath !== 'string') {
        return res.status(400).json({ error: 'ファイルパスが指定されていません' });
      }
      const sanitizedPath = targetRelPath.replace(/\.\./g, '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!sanitizedPath || sanitizedPath === '.' || sanitizedPath === '/') {
        return res.status(400).json({ error: '有効なファイルパスが指定されていません' });
      }
      const safePath = path.join(externalFilesDir, sanitizedPath);
      
      if (fs.existsSync(safePath)) {
        const filename = path.basename(safePath);
        if (req.query.download === '1') {
          return res.download(safePath, filename);
        }
        res.sendFile(safePath);
      } else {
        res.status(404).json({ error: 'ファイルが見つかりません' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post('/api/external-files/folder', (req, res) => {
    try {
      const { folder } = req.body;
      if (!folder || typeof folder !== 'string') {
        return res.status(400).json({ error: 'フォルダ名が指定されていません' });
      }
      const sanitizedPath = folder.replace(/\.\./g, '').replace(/\\/g, '/').replace(/^\/+/, '');
      if (!sanitizedPath || sanitizedPath === '.' || sanitizedPath === '/') {
        return res.status(400).json({ error: '有効なフォルダ名が指定されていません' });
      }
      const safePath = path.join(externalFilesDir, sanitizedPath);
      if (!fs.existsSync(safePath)) {
        fs.mkdirSync(safePath, { recursive: true });
        res.json({ message: 'フォルダを作成しました', path: sanitizedPath });
      } else {
        res.status(400).json({ error: '既に同名のフォルダ・ファイルが存在します' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/external-files', (req, res) => {
    try {
      const targetRelPath = req.query.path;
      if (!targetRelPath || typeof targetRelPath !== 'string') {
        return res.status(400).json({ error: 'ファイルパスが指定されていません' });
      }
      const sanitizedPath = targetRelPath.replace(/\.\./g, '').replace(/\\/g, '/').replace(/^\/+/, '');
      
      if (!sanitizedPath || sanitizedPath === '.' || sanitizedPath === '/') {
        return res.status(400).json({ error: 'ルートディレクトリを削除することはできません。' });
      }

      const safePath = path.join(externalFilesDir, sanitizedPath);
      if (path.resolve(safePath) === path.resolve(externalFilesDir)) {
        return res.status(400).json({ error: 'ルートディレクトリを削除することはできません。' });
      }
      
      if (fs.existsSync(safePath)) {
        const stat = fs.statSync(safePath);
        if (stat.isDirectory()) {
          if (typeof fs.rmSync === 'function') {
            fs.rmSync(safePath, { recursive: true, force: true });
          } else {
            fs.rmdirSync(safePath, { recursive: true });
          }
        } else {
          fs.unlinkSync(safePath);
        }
        res.json({ message: '削除に成功しました' });
      } else {
        res.status(404).json({ error: 'ファイルが見つかりません' });
      }
    } catch (err: any) {
      console.error('ファイル削除エラー:', err);
      res.status(500).json({ error: 'ファイル削除処理中にエラーが発生しました: ' + err.message });
    }
  });

  // Vite開発用ミドルウェア または プロダクション静的ファイルサーブ
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
