import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../config/api';
import { getStampUrl } from '../utils/stampUrl';
import { 
  Smile, 
  Plus, 
  Trash2, 
  Edit2, 
  Upload, 
  Check, 
  AlertCircle, 
  RefreshCw, 
  FolderPlus, 
  Image as ImageIcon,
  Folder,
  X,
  Info
} from 'lucide-react';

export interface StampItem {
  id: string;
  text: string;
  imageUrl: string;
  icon?: string;
  color?: string;
}

export interface StampCategory {
  id: string;
  name: string;
  stamps: StampItem[];
}

export function StampAdmin() {
  const [categories, setCategories] = useState<StampCategory[]>([]);
  const [activeCategoryId, setActiveCategoryId] = useState<string>('');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSaving, setIsSaving] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // カテゴリ追加モーダル
  const [showAddCategoryModal, setShowAddCategoryModal] = useState<boolean>(false);
  const [newCategoryName, setNewCategoryName] = useState<string>('');

  // カテゴリ名編集モーダル
  const [editingCategory, setEditingCategory] = useState<{ id: string; name: string } | null>(null);

  // スタンプ追加・編集モーダル
  const [showAddStampModal, setShowAddStampModal] = useState<boolean>(false);
  const [editingStamp, setEditingStamp] = useState<StampItem | null>(null);
  const [stampText, setStampText] = useState<string>('');
  const [stampPreviewUrl, setStampPreviewUrl] = useState<string>('');
  const [stampImageDataUrl, setStampImageDataUrl] = useState<string>('');
  const [isProcessingImage, setIsProcessingImage] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 削除確認モーダル
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'category' | 'stamp'; categoryId: string; stampId?: string; name: string } | null>(null);

  // サーバーからスタンプ一覧を取得
  const fetchStamps = async () => {
    setIsLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/stamps`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.categories)) {
          setCategories(data.categories);
          if (data.categories.length > 0 && !activeCategoryId) {
            setActiveCategoryId(data.categories[0].id);
          }
        }
      }
    } catch (err) {
      console.error('Failed to fetch stamps:', err);
      setStatusMessage({ type: 'error', text: 'スタンプ一覧の取得に失敗しました' });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchStamps();
  }, []);

  // カテゴリ全体の保存API
  const saveAllCategories = async (updatedCategories: StampCategory[]) => {
    setIsSaving(true);
    setStatusMessage(null);
    try {
      const res = await fetch(`${API_BASE_URL}/stamps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categories: updatedCategories })
      });
      const data = await res.json();
      if (data.success) {
        setCategories(updatedCategories);
        setStatusMessage({ type: 'success', text: '変更内容を正常に保存しました' });
        setTimeout(() => setStatusMessage(null), 3000);
      } else {
        throw new Error(data.error || '保存に失敗しました');
      }
    } catch (err: any) {
      console.error('Failed to save categories:', err);
      setStatusMessage({ type: 'error', text: err.message || '保存中にエラーが発生しました' });
    } finally {
      setIsSaving(false);
    }
  };

  // 画像を 240x240px にリサイズ＆透過最適化するヘルパー
  const processImageTo240 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          const canvas = document.createElement('canvas');
          canvas.width = 240;
          canvas.height = 240;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            reject(new Error('Canvas context not available'));
            return;
          }

          // 透過背景を維持
          ctx.clearRect(0, 0, 240, 240);

          // アスペクト比を維持して中央に配置
          const scale = Math.min(240 / img.width, 240 / img.height);
          const drawW = img.width * scale;
          const drawH = img.height * scale;
          const offsetX = (240 - drawW) / 2;
          const offsetY = (240 - drawH) / 2;

          ctx.drawImage(img, offsetX, offsetY, drawW, drawH);
          resolve(canvas.toDataURL('image/png'));
        };
        img.onerror = () => reject(new Error('Failed to load image'));
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(file);
    });
  };

  // 画像選択時の処理
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingImage(true);
    try {
      const dataUrl = await processImageTo240(file);
      setStampImageDataUrl(dataUrl);
      setStampPreviewUrl(dataUrl);
    } catch (err) {
      console.error('Image processing failed:', err);
      alert('画像の処理に失敗しました。対応画像形式をご確認ください。');
    } finally {
      setIsProcessingImage(false);
    }
  };

  // カテゴリ新規追加
  const handleAddCategory = async () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;

    const newCat: StampCategory = {
      id: `cat_${Date.now()}`,
      name: trimmed,
      stamps: []
    };

    const updated = [...categories, newCat];
    await saveAllCategories(updated);
    setActiveCategoryId(newCat.id);
    setNewCategoryName('');
    setShowAddCategoryModal(false);
  };

  // カテゴリ名変更
  const handleUpdateCategoryName = async () => {
    if (!editingCategory) return;
    const trimmed = editingCategory.name.trim();
    if (!trimmed) return;

    const updated = categories.map((cat) =>
      cat.id === editingCategory.id ? { ...cat, name: trimmed } : cat
    );

    await saveAllCategories(updated);
    setEditingCategory(null);
  };

  // カテゴリ削除
  const handleDeleteCategory = async (categoryId: string) => {
    const updated = categories.filter((c) => c.id !== categoryId);
    await saveAllCategories(updated);
    if (activeCategoryId === categoryId) {
      setActiveCategoryId(updated.length > 0 ? updated[0].id : '');
    }
    setDeleteTarget(null);
  };

  // スタンプ新規登録・更新
  const handleSaveStamp = async () => {
    const trimmedText = stampText.trim();
    if (!trimmedText) {
      alert('スタンプの文言（名前）を入力してください');
      return;
    }

    if (!stampImageDataUrl && !stampPreviewUrl) {
      alert('スタンプ画像を選択してください');
      return;
    }

    setIsSaving(true);
    setStatusMessage(null);

    try {
      let finalImageUrl = stampPreviewUrl;

      // 新しい画像が選択された場合はサーバーへアップロード
      if (stampImageDataUrl) {
        const uploadRes = await fetch(`${API_BASE_URL}/stamps/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ base64Image: stampImageDataUrl })
        });
        const uploadData = await uploadRes.json();
        if (!uploadData.success || !uploadData.imageUrl) {
          throw new Error(uploadData.error || '画像のアップロードに失敗しました');
        }
        finalImageUrl = uploadData.imageUrl;
      }

      const activeCat = categories.find((c) => c.id === activeCategoryId);
      if (!activeCat) throw new Error('カテゴリが見つかりません');

      let updatedStamps: StampItem[];

      if (editingStamp) {
        // 既存スタンプの更新
        updatedStamps = activeCat.stamps.map((s) =>
          s.id === editingStamp.id
            ? { ...s, text: trimmedText, imageUrl: finalImageUrl }
            : s
        );
      } else {
        // 新規スタンプの追加
        const newStamp: StampItem = {
          id: `stamp_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
          text: trimmedText,
          imageUrl: finalImageUrl,
          color: 'bg-indigo-50 text-indigo-800 border-indigo-200'
        };
        updatedStamps = [...activeCat.stamps, newStamp];
      }

      const updatedCategories = categories.map((cat) =>
        cat.id === activeCategoryId ? { ...cat, stamps: updatedStamps } : cat
      );

      await saveAllCategories(updatedCategories);

      // モーダルを閉じる
      setShowAddStampModal(false);
      setEditingStamp(null);
      setStampText('');
      setStampPreviewUrl('');
      setStampImageDataUrl('');
    } catch (err: any) {
      console.error('Failed to save stamp:', err);
      setStatusMessage({ type: 'error', text: err.message || 'スタンプの登録に失敗しました' });
    } finally {
      setIsSaving(false);
    }
  };

  // スタンプ削除
  const handleDeleteStamp = async (categoryId: string, stampId: string) => {
    const updated = categories.map((cat) => {
      if (cat.id !== categoryId) return cat;
      return {
        ...cat,
        stamps: cat.stamps.filter((s) => s.id !== stampId)
      };
    });

    await saveAllCategories(updated);
    setDeleteTarget(null);
  };

  // モーダルを開いて新規追加
  const openAddStampModal = () => {
    setEditingStamp(null);
    setStampText('');
    setStampPreviewUrl('');
    setStampImageDataUrl('');
    setShowAddStampModal(true);
  };

  // モーダルを開いて編集
  const openEditStampModal = (stamp: StampItem) => {
    setEditingStamp(stamp);
    setStampText(stamp.text);
    setStampPreviewUrl(stamp.imageUrl);
    setStampImageDataUrl('');
    setShowAddStampModal(true);
  };

  const activeCategory = categories.find((c) => c.id === activeCategoryId) || categories[0];

  return (
    <div className="space-y-6">
      {/* 上部ヘッダーと案内 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b border-slate-100">
          <div>
            <h3 className="font-bold text-slate-900 text-base flex items-center gap-2">
              <Smile className="w-5 h-5 text-indigo-600" />
              スタンプ・絵文字管理
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              社内チャットで使用できるスタンプをカテゴリ別に自由に登録・管理できます。
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowAddCategoryModal(true)}
              className="px-3.5 py-2 text-xs font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-xl transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <FolderPlus className="w-4 h-4" />
              新規カテゴリ追加
            </button>
            <button
              onClick={fetchStamps}
              disabled={isLoading}
              className="p-2 text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-xl transition-all cursor-pointer"
              title="再読み込み"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* 推奨画像サイズバナー */}
        <div className="mt-4 p-4 bg-sky-50/80 border border-sky-200 rounded-xl flex items-start gap-3">
          <Info className="w-5 h-5 text-sky-600 shrink-0 mt-0.5" />
          <div className="text-xs text-sky-900 leading-relaxed">
            <p className="font-extrabold text-sky-950 flex items-center gap-2">
              推奨画像仕様: 240 × 240 px (正方形) / 透過PNG形式
            </p>
            <p className="mt-0.5 text-sky-800">
              大きな画像を選択した場合でも、登録時にブラウザが自動で正方形（240×240px）に最適化・リサイズして保存します。透過PNGを使用すると、チャットの吹き出しに自然に馴染みます。
            </p>
          </div>
        </div>

        {/* ステータスメッセージ */}
        {statusMessage && (
          <div
            className={`mt-4 p-3 rounded-xl text-xs font-bold flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            {statusMessage.type === 'success' ? <Check className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
            {statusMessage.text}
          </div>
        )}
      </div>

      {/* カテゴリ切り替えタブバー */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {categories.map((category) => (
            <button
              key={category.id}
              onClick={() => setActiveCategoryId(category.id)}
              className={`px-4 py-2 rounded-xl text-xs font-bold shrink-0 transition-all flex items-center gap-2 cursor-pointer ${
                activeCategoryId === category.id
                  ? 'bg-indigo-600 text-white shadow-sm'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              <Folder className="w-3.5 h-3.5" />
              <span>{category.name}</span>
              <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                activeCategoryId === category.id ? 'bg-indigo-500 text-white' : 'bg-slate-200 text-slate-700'
              }`}>
                {category.stamps.length}
              </span>
            </button>
          ))}

          {categories.length === 0 && (
            <span className="text-xs text-slate-400 py-1">カテゴリがありません。「新規カテゴリ追加」から作成してください。</span>
          )}
        </div>
      </div>

      {/* アクティブカテゴリのスタンプ一覧 */}
      {activeCategory && (
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-sm space-y-6">
          {/* カテゴリ操作ヘッダー */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
              <h4 className="font-extrabold text-slate-900 text-sm">{activeCategory.name}</h4>
              <span className="text-xs text-slate-500">({activeCategory.stamps.length}個のスタンプ)</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditingCategory({ id: activeCategory.id, name: activeCategory.name })}
                className="px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
              >
                <Edit2 className="w-3.5 h-3.5" />
                カテゴリ名変更
              </button>
              {categories.length > 1 && (
                <button
                  onClick={() => setDeleteTarget({ type: 'category', categoryId: activeCategory.id, name: activeCategory.name })}
                  className="px-2.5 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-lg transition-all flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  カテゴリ削除
                </button>
              )}
            </div>
          </div>

          {/* スタンプグリッド */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
            {/* スタンプ追加カード */}
            <button
              onClick={openAddStampModal}
              className="h-44 border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/40 hover:bg-indigo-50/80 rounded-2xl flex flex-col items-center justify-center gap-2 text-indigo-600 transition-all group cursor-pointer shadow-2xs"
            >
              <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Plus className="w-5 h-5 text-indigo-600" />
              </div>
              <span className="text-xs font-black">スタンプを追加</span>
              <span className="text-[10px] text-indigo-400">推奨 240×240px</span>
            </button>

            {/* 登録済みスタンプ一覧 */}
            {activeCategory.stamps.map((stamp) => (
              <div
                key={stamp.id}
                className="h-44 bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-2xl p-3 flex flex-col items-center justify-between transition-all shadow-2xs group relative bg-white"
              >
                {/* 削除ボタン（右上） */}
                <button
                  onClick={() => setDeleteTarget({ type: 'stamp', categoryId: activeCategory.id, stampId: stamp.id, name: stamp.text })}
                  className="absolute top-2 right-2 p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all opacity-0 group-hover:opacity-100 cursor-pointer"
                  title="スタンプを削除"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>

                {/* スタンプ画像プレビュー */}
                <div className="w-20 h-20 bg-slate-50/80 rounded-xl p-1.5 border border-slate-100 flex items-center justify-center overflow-hidden bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:6px_6px] mt-1">
                  <img
                    src={getStampUrl(stamp.imageUrl)}
                    alt={stamp.text}
                    className="w-full h-full object-contain group-hover:scale-110 transition-transform"
                    loading="lazy"
                  />
                </div>

                {/* スタンプ文言 */}
                <div className="text-center w-full px-1">
                  <p className="text-xs font-black text-slate-800 line-clamp-1" title={stamp.text}>
                    {stamp.text}
                  </p>
                </div>

                {/* 編集ボタン */}
                <button
                  onClick={() => openEditStampModal(stamp)}
                  className="w-full py-1 text-[11px] font-bold text-slate-600 hover:text-indigo-600 bg-slate-100 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-lg transition-all flex items-center justify-center gap-1 cursor-pointer"
                >
                  <Edit2 className="w-3 h-3" />
                  編集
                </button>
              </div>
            ))}
          </div>

          {activeCategory.stamps.length === 0 && (
            <div className="text-center py-10 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
              <Smile className="w-10 h-10 text-slate-300 mx-auto mb-2" />
              <p className="text-xs font-bold text-slate-500">このカテゴリにはまだスタンプが登録されていません</p>
              <p className="text-[11px] text-slate-400 mt-1">上の「スタンプを追加」ボタンから画像と文言を登録してください。</p>
            </div>
          )}
        </div>
      )}

      {/* ======================================================== */}
      {/* モーダル: スタンプ新規登録 / 編集 */}
      {/* ======================================================== */}
      {showAddStampModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-md w-full p-6 space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
                <Smile className="w-4 h-4 text-indigo-600" />
                {editingStamp ? 'スタンプを編集' : '新規スタンプを追加'}
              </h4>
              <button
                onClick={() => setShowAddStampModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 画像アップロード領域 */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-700">
                スタンプ画像 <span className="text-indigo-600">（推奨: 240 × 240 px / 透過PNG）</span>
              </label>

              <div
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-indigo-50/30 hover:bg-indigo-50/70 rounded-xl p-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-all group"
              >
                {stampPreviewUrl ? (
                  <div className="relative">
                    <div className="w-28 h-28 bg-white rounded-xl p-2 border border-slate-200 flex items-center justify-center overflow-hidden bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:6px_6px] shadow-sm">
                      <img
                        src={getStampUrl(stampPreviewUrl)}
                        alt="Preview"
                        className="w-full h-full object-contain"
                      />
                    </div>
                    <span className="absolute bottom-1 right-1 bg-slate-900/70 text-white text-[9px] font-bold px-1.5 py-0.5 rounded">
                      変更
                    </span>
                  </div>
                ) : (
                  <div className="flex flex-col items-center py-4">
                    <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center mb-2 group-hover:scale-110 transition-transform">
                      <Upload className="w-5 h-5 text-indigo-600" />
                    </div>
                    <span className="text-xs font-black text-indigo-700">画像を選択またはドロップ</span>
                    <span className="text-[10px] text-slate-400 mt-0.5">PNG / JPG / WEBP (自動リサイズ対応)</span>
                  </div>
                )}

                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  onChange={handleImageSelect}
                  className="hidden"
                />
              </div>

              {isProcessingImage && (
                <div className="text-[11px] text-indigo-600 font-bold flex items-center gap-1.5 animate-pulse">
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  画像を 240×240px に最適化しています...
                </div>
              )}
            </div>

            {/* スタンプ文言入力 */}
            <div className="space-y-2">
              <label className="block text-xs font-extrabold text-slate-700">
                スタンプ名 / 表示文字 <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={stampText}
                onChange={(e) => setStampText(e.target.value)}
                placeholder="例: 了解です！、お疲れ様です、至急！"
                className="w-full px-3.5 py-2.5 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white transition-all font-bold"
                maxLength={20}
              />
              <span className="text-[10px] text-slate-400">チャット内の通知や検索で表示されるキーワードです。</span>
            </div>

            {/* モーダルボタン */}
            <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowAddStampModal(false)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleSaveStamp}
                disabled={isSaving || isProcessingImage || !stampText.trim() || (!stampPreviewUrl && !stampImageDataUrl)}
                className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:pointer-events-none rounded-xl transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
              >
                {isSaving ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Check className="w-3.5 h-3.5" />}
                {editingStamp ? '更新する' : '登録する'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* モーダル: 新規カテゴリ追加 */}
      {/* ======================================================== */}
      {showAddCategoryModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <FolderPlus className="w-4 h-4 text-indigo-600" />
              新規カテゴリを追加
            </h4>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">カテゴリ名</label>
              <input
                type="text"
                value={newCategoryName}
                onChange={(e) => setNewCategoryName(e.target.value)}
                placeholder="例: あいさつ、現場・安全、リアクション"
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white font-bold"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAddCategoryModal(false)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleAddCategory}
                disabled={isSaving || !newCategoryName.trim()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                追加
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* モーダル: カテゴリ名変更 */}
      {/* ======================================================== */}
      {editingCategory && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <h4 className="font-extrabold text-slate-900 text-sm flex items-center gap-2">
              <Edit2 className="w-4 h-4 text-indigo-600" />
              カテゴリ名の変更
            </h4>
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-slate-700">カテゴリ名</label>
              <input
                type="text"
                value={editingCategory.name}
                onChange={(e) => setEditingCategory({ ...editingCategory, name: e.target.value })}
                className="w-full px-3 py-2 text-xs bg-slate-50 border border-slate-200 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:bg-white font-bold"
                autoFocus
              />
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCategory(null)}
                className="px-3 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleUpdateCategoryName}
                disabled={isSaving || !editingCategory.name.trim()}
                className="px-4 py-1.5 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg cursor-pointer"
              >
                変更を保存
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ======================================================== */}
      {/* 削除確認モーダル */}
      {/* ======================================================== */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-xl max-w-sm w-full p-6 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center mx-auto text-rose-600">
              <Trash2 className="w-5 h-5" />
            </div>
            <div className="text-center space-y-1">
              <h4 className="font-extrabold text-slate-900 text-sm">
                {deleteTarget.type === 'category' ? 'カテゴリを削除しますか？' : 'スタンプを削除しますか？'}
              </h4>
              <p className="text-xs text-slate-500">
                「{deleteTarget.name}」を削除します。
                {deleteTarget.type === 'category' && ' カテゴリ内のスタンプもすべて削除されます。'}
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={() => {
                  if (deleteTarget.type === 'category') {
                    handleDeleteCategory(deleteTarget.categoryId);
                  } else if (deleteTarget.stampId) {
                    handleDeleteStamp(deleteTarget.categoryId, deleteTarget.stampId);
                  }
                }}
                disabled={isSaving}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-xl shadow-xs cursor-pointer"
              >
                削除する
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
