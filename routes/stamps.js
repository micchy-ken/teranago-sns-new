/**
 * routes/stamps.js
 * スタンプ管理モジュール (カスタムスタンプ保存・一括アップロード・背景透過画像保存対応)
 * 最終更新: 2026年9月30日 (管理画面からのスタンプ自由変更・画像切り出しアップロード・背景透過処理機能 完全対応)
 */
import { Router } from 'express';
import fs from 'fs';
import path from 'path';
import multer from 'multer';

const router = Router();

// データ保存ディレクトリの確保
const dataDir = path.join(process.cwd(), 'data');
const customStampsPath = path.join(dataDir, 'custom-stamps.json');
const stampsPublicDir = path.join(process.cwd(), 'public', 'stamps', 'custom');

if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}
if (!fs.existsSync(stampsPublicDir)) {
  fs.mkdirSync(stampsPublicDir, { recursive: true });
}

// Multerストレージ設定（カスタムスタンプ画像のアップロード用）
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, stampsPublicDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname) || '.png';
    const stampId = req.body.stampId || `stamp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    cb(null, `${stampId}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 } // 15MB上限
});

// デフォルトのスタンプ一覧取得ヘルパー
function getDefaultCategories() {
  return [
    {
      id: 'greeting',
      name: 'あいさつ',
      stamps: [
        { id: 'ohayou', text: 'おはようございます', icon: '☀️', imageUrl: '/stamps/ohayou.svg', color: 'bg-sky-50 text-sky-800 border-sky-300' },
        { id: 'otsukare', text: 'お疲れ様です！', icon: '🍵', imageUrl: '/stamps/otsukare.svg', color: 'bg-amber-50 text-amber-800 border-amber-300' },
        { id: 'ryokai', text: '了解です！', icon: '👍', imageUrl: '/stamps/ryokai.svg', color: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
        { id: 'yoroshiku', text: 'よろしく！', icon: '🤝', imageUrl: '/stamps/yoroshiku.svg', color: 'bg-indigo-50 text-indigo-800 border-indigo-300' },
        { id: 'arigatou', text: 'ありがとう！', icon: '✨', imageUrl: '/stamps/arigatou.svg', color: 'bg-rose-50 text-rose-800 border-rose-300' },
      ]
    },
    {
      id: 'reaction',
      name: 'リアクション',
      stamps: [
        { id: 'good', text: '超いいね！', icon: '❤️', imageUrl: '/stamps/good.svg', color: 'bg-pink-50 text-pink-800 border-pink-300' },
        { id: 'ok', text: 'OK!', icon: '⭕', imageUrl: '/stamps/ok.svg', color: 'bg-green-50 text-green-800 border-green-300' },
        { id: 'ng', text: 'NG!', icon: '❌', imageUrl: '/stamps/ng.svg', color: 'bg-red-50 text-red-800 border-red-300' },
        { id: 'god', text: '神対応！', icon: '👑', imageUrl: '/stamps/god.svg', color: 'bg-purple-50 text-purple-800 border-purple-300' },
        { id: 'naruhodo', text: 'なるほど！', icon: '💡', imageUrl: '/stamps/naruhodo.svg', color: 'bg-yellow-50 text-yellow-800 border-yellow-300' },
      ]
    },
    {
      id: 'work',
      name: '仕事・連絡',
      stamps: [
        { id: 'checking', text: '確認中…', icon: '🔍', imageUrl: '/stamps/checking.svg', color: 'bg-slate-100 text-slate-800 border-slate-300' },
        { id: 'urgent', text: '至急！', icon: '🚨', imageUrl: '/stamps/urgent.svg', color: 'bg-red-50 text-red-800 border-red-300' },
        { id: 'phone', text: '電話下さい', icon: '📞', imageUrl: '/stamps/phone.svg', color: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
        { id: 'done', text: '対応完了', icon: '✅', imageUrl: '/stamps/done.svg', color: 'bg-teal-50 text-teal-800 border-teal-300' },
        { id: 'ittekimasu', text: '行ってきます', icon: '🏃', imageUrl: '/stamps/ittekimasu.svg', color: 'bg-sky-50 text-sky-800 border-sky-300' },
      ]
    }
  ];
}

// カスタムスタンプデータのロード
function loadCustomStamps() {
  if (!fs.existsSync(customStampsPath)) {
    return getDefaultCategories();
  }
  try {
    const data = fs.readFileSync(customStampsPath, 'utf8');
    const parsed = JSON.parse(data);
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : getDefaultCategories();
  } catch (err) {
    console.error('[Stamps] Failed to read custom stamps file:', err);
    return getDefaultCategories();
  }
}

// カスタムスタンプデータの保存
function saveCustomStamps(categories) {
  try {
    fs.writeFileSync(customStampsPath, JSON.stringify(categories, null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[Stamps] Failed to save custom stamps file:', err);
    return false;
  }
}

/**
 * GET /api/stamps
 * 現在の全スタンプ一覧（デフォルト＋カスタム上書き分）を取得
 */
router.get(['/', '/stamps', '/all'], (req, res) => {
  try {
    const categories = loadCustomStamps();
    res.json({ success: true, categories });
  } catch (err) {
    console.error('[Stamps GET Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/stamps/upload
 * 個別スタンプ画像のアップロード（Base64またはFormData）
 */
router.post(['/upload', '/stamps/upload'], upload.single('image'), (req, res) => {
  try {
    const { stampId, base64Image } = req.body;
    let imageUrl = '';

    if (req.file) {
      imageUrl = `/stamps/custom/${req.file.filename}`;
    } else if (base64Image) {
      // Base64データURLが送信された場合
      const targetId = stampId || `stamp_${Date.now()}`;
      const base64Data = base64Image.replace(/^data:image\/\w+;base64,/, '');
      const buffer = Buffer.from(base64Data, 'base64');
      const filename = `${targetId}.png`;
      const filePath = path.join(stampsPublicDir, filename);
      fs.writeFileSync(filePath, buffer);
      imageUrl = `/stamps/custom/${filename}?v=${Date.now()}`;
    } else {
      return res.status(400).json({ success: false, error: '画像ファイルまたはBase64データが必要です' });
    }

    // 指定されたstampIdがあれば構成ファイルを自動更新
    if (stampId) {
      const categories = loadCustomStamps();
      let updated = false;
      categories.forEach(cat => {
        cat.stamps.forEach(s => {
          if (s.id === stampId) {
            s.imageUrl = imageUrl;
            updated = true;
          }
        });
      });
      if (updated) {
        saveCustomStamps(categories);
      }
    }

    res.json({ success: true, imageUrl, stampId });
  } catch (err) {
    console.error('[Stamps Upload Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/stamps/batch-update
 * 一括切り出し等で生成された複数スタンプ情報（Base64マップ等）を一括保存・更新
 */
router.post(['/batch-update', '/stamps/batch-update'], (req, res) => {
  try {
    const { stampMap, categories } = req.body;
    // stampMap: { ohayou: 'data:image/png;base64,...', otsukare: 'data:...' }

    if (stampMap && typeof stampMap === 'object') {
      const currentCategories = categories || loadCustomStamps();
      const timeTag = Date.now();

      Object.entries(stampMap).forEach(([id, base64Str]) => {
        if (base64Str && typeof base64Str === 'string' && base64Str.startsWith('data:image/')) {
          const base64Data = base64Str.replace(/^data:image\/\w+;base64,/, '');
          const buffer = Buffer.from(base64Data, 'base64');
          const filename = `${id}_${timeTag}.png`;
          const filePath = path.join(stampsPublicDir, filename);
          fs.writeFileSync(filePath, buffer);

          const newUrl = `/stamps/custom/${filename}`;

          // カテゴリー配下の対応スタンプのimageUrlを書き換え
          currentCategories.forEach(cat => {
            cat.stamps.forEach(s => {
              if (s.id === id) {
                s.imageUrl = newUrl;
              }
            });
          });
        }
      });

      saveCustomStamps(currentCategories);
      res.json({ success: true, categories: currentCategories });
    } else if (categories) {
      saveCustomStamps(categories);
      res.json({ success: true, categories });
    } else {
      res.status(400).json({ success: false, error: '更新データがありません' });
    }
  } catch (err) {
    console.error('[Stamps Batch Update Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

/**
 * POST /api/stamps/reset
 * スタンプ画像をデフォルトの公式SVGアイコンセットにリセット
 */
router.post(['/reset', '/stamps/reset'], (req, res) => {
  try {
    if (fs.existsSync(customStampsPath)) {
      fs.unlinkSync(customStampsPath);
    }
    const defaultCategories = getDefaultCategories();
    res.json({ success: true, categories: defaultCategories, message: '公式デフォルトスタンプにリセットしました' });
  } catch (err) {
    console.error('[Stamps Reset Error]', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
