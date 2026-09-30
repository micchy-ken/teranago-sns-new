import React, { useState, useEffect, useRef } from 'react';
import { API_BASE_URL } from '../config/api';
import { getStampUrl } from '../utils/stampUrl';
import { Upload, RefreshCw, Check, Image as ImageIcon, Sparkles, AlertCircle, Trash2, ArrowRight, Eye } from 'lucide-react';

interface StampItem {
  id: string;
  text: string;
  icon: string;
  imageUrl: string;
  color: string;
}

interface StampCategory {
  id: string;
  name: string;
  stamps: StampItem[];
}

export function StampAdmin() {
  const [categories, setCategories] = useState<StampCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  // 一括画像アップロード & 切り出し設定
  const [batchImageFile, setBatchImageFile] = useState<File | null>(null);
  const [batchImageSrc, setBatchImageSrc] = useState<string | null>(null);
  const [gridRows, setGridRows] = useState<number>(2);
  const [gridCols, setGridCols] = useState<number>(3);
  const [autoRemoveBg, setAutoRemoveBg] = useState<boolean>(true);
  const [bgThreshold, setBgThreshold] = useState<number>(35); // 白地透過の判定しきい値

  // 切り出しスロットとターゲットスタンプIDの割り当て設定 (上段3個・下段3個)
  const [slotAssignments, setSlotAssignments] = useState<string[]>([
    'ohayou',    // 上段左: おはようございます
    'otsukare',  // 上段中: おつかれさまです
    'ryokai',   // 上段右: 了解です
    'checking',  // 下段左: 確認中…
    'ittekimasu',// 下段中: 行ってきます
    'god'        // 下段右: 神対応！
  ]);

  const [croppedPreviews, setCroppedPreviews] = useState<{ id: string; label: string; dataUrl: string }[]>([]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const batchFileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // スタンプ一覧の取得
  const fetchStamps = async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/stamps`);
      if (res.ok) {
        const data = await res.json();
        if (data.categories) {
          setCategories(data.categories);
        }
      }
    } catch (err) {
      console.error('Failed to fetch stamps:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStamps();
  }, []);

  // 個別スタンプ画像の変更処理
  const handleSingleImageUpload = async (stampId: string, e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (event) => {
      const base64Image = event.target?.result as string;
      if (!base64Image) return;

      setSaving(true);
      setMessage(null);

      try {
        const res = await fetch(`${API_BASE_URL}/stamps/upload`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ stampId, base64Image })
        });

        const data = await res.json();
        if (data.success) {
          setMessage({ text: 'スタンプ画像を更新しました！', type: 'success' });
          fetchStamps();
        } else {
          setMessage({ text: data.error || '画像の更新に失敗しました。', type: 'error' });
        }
      } catch (err: any) {
        setMessage({ text: '通信エラー: ' + err.message, type: 'error' });
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
  };

  // 一括画像の選択
  const handleBatchFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setBatchImageFile(file);
    const reader = new FileReader();
    reader.onload = (event) => {
      setBatchImageSrc(event.target?.result as string);
    };
    reader.readAsDataURL(file);
  };

  // 画像の切り出し & 背景透過処理を実行してプレビュー作成
  useEffect(() => {
    if (!batchImageSrc) {
      setCroppedPreviews([]);
      return;
    }

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const totalSlots = gridRows * gridCols;
      const slotWidth = img.width / gridCols;
      const slotHeight = img.height / gridRows;

      const previews: { id: string; label: string; dataUrl: string }[] = [];
      const allStamps = categories.flatMap(c => c.stamps);

      for (let i = 0; i < totalSlots; i++) {
        const row = Math.floor(i / gridCols);
        const col = i % gridCols;

        const targetStampId = slotAssignments[i] || '';
        const targetStamp = allStamps.find(s => s.id === targetStampId);

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(slotWidth);
        canvas.height = Math.round(slotHeight);
        const ctx = canvas.getContext('2d');

        if (ctx) {
          // 元画像をソース領域から描画
          ctx.drawImage(
            img,
            col * slotWidth,
            row * slotHeight,
            slotWidth,
            slotHeight,
            0,
            0,
            slotWidth,
            slotHeight
          );

          // 自動背景透過処理（白・薄灰地の背景を透明化）
          if (autoRemoveBg) {
            const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
            const data = imageData.data;
            const threshold = bgThreshold;

            for (let p = 0; p < data.length; p += 4) {
              const r = data[p];
              const g = data[p + 1];
              const b = data[p + 2];

              // 白または超薄い色（R, G, B すべてが 255 - threshold 以上）の場合透過
              if (r >= 255 - threshold && g >= 255 - threshold && b >= 255 - threshold) {
                data[p + 3] = 0; // Alpha = 0 (透明)
              }
            }
            ctx.putImageData(imageData, 0, 0);
          }

          previews.push({
            id: targetStampId,
            label: targetStamp ? targetStamp.text : `スロット ${i + 1}`,
            dataUrl: canvas.toDataURL('image/png')
          });
        }
      }

      setCroppedPreviews(previews);
    };
    img.src = batchImageSrc;
  }, [batchImageSrc, gridRows, gridCols, autoRemoveBg, bgThreshold, slotAssignments, categories]);

  // 一括切り出しスタンプをサーバーに保存・適用
  const handleApplyBatchStamps = async () => {
    if (croppedPreviews.length === 0) return;

    setSaving(true);
    setMessage(null);

    const stampMap: Record<string, string> = {};
    croppedPreviews.forEach(item => {
      if (item.id) {
        stampMap[item.id] = item.dataUrl;
      }
    });

    try {
      const res = await fetch(`${API_BASE_URL}/stamps/batch-update`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stampMap })
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ text: '切り出したスタンプ画像を一括反映しました！', type: 'success' });
        setBatchImageSrc(null);
        setBatchImageFile(null);
        setCroppedPreviews([]);
        fetchStamps();
      } else {
        setMessage({ text: data.error || '一括更新に失敗しました。', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: '通信エラー: ' + err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  // 公式デフォルトスタンプにリセット
  const handleResetToDefault = async () => {
    if (!window.confirm('すべてのカスタムスタンプ画像を解除し、公式のデフォルトスタンプセットに戻しますか？')) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const res = await fetch(`${API_BASE_URL}/stamps/reset`, {
        method: 'POST'
      });

      const data = await res.json();
      if (data.success) {
        setMessage({ text: '公式デフォルトスタンプにリセットしました！', type: 'success' });
        fetchStamps();
      } else {
        setMessage({ text: data.error || 'リセットに失敗しました。', type: 'error' });
      }
    } catch (err: any) {
      setMessage({ text: '通信エラー: ' + err.message, type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const allStampsFlat = categories.flatMap(c => c.stamps);

  return (
    <div className="space-y-8">
      {/* 画面ヘッダー & 通知 */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-extrabold text-slate-800 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-indigo-600" />
            スタンプ画像管理 & 一括切り出し登録
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            社内SNSチャットで利用するスタンプ画像を管理・カスタマイズできます。画像の一括アップロードや背景透過（トリミング）も可能です。
          </p>
        </div>

        <button
          onClick={handleResetToDefault}
          disabled={saving}
          className="px-3.5 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-all flex items-center gap-1.5 shrink-0"
        >
          <Trash2 className="w-4 h-4" />
          公式初期スタンプに復元
        </button>
      </div>

      {message && (
        <div className={`p-4 rounded-xl text-xs font-bold flex items-center gap-2 border ${
          message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-rose-50 text-rose-800 border-rose-200'
        }`}>
          {message.type === 'success' ? <Check className="w-4 h-4 shrink-0 text-emerald-600" /> : <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />}
          {message.text}
        </div>
      )}

      {/* SECTION 1: まとめてアップロード & 切り出しエリア */}
      <div className="bg-gradient-to-br from-indigo-50/50 via-white to-slate-50 rounded-2xl border border-indigo-100 p-6 shadow-sm space-y-6">
        <div className="flex items-center gap-2 pb-3 border-b border-indigo-100/80">
          <ImageIcon className="w-5 h-5 text-indigo-600" />
          <h3 className="text-sm font-extrabold text-slate-800">
            6スタンプ画像の一括アップロード & 自動背景透過切り出し
          </h3>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          ナノバナナなどのキャラクターが並んだ画像（2行×3列など）をそのままアップロードするだけで、各領域を自動切り出して背景透過処理を行ったうえで、対応するスタンプへ一括反映できます。
        </p>

        {/* ファイル選択・ドラッグエリア */}
        <div className="flex flex-col items-center justify-center border-2 border-dashed border-indigo-200 hover:border-indigo-400 bg-white/80 rounded-2xl p-6 transition-all cursor-pointer text-center group"
          onClick={() => batchFileInputRef.current?.click()}
        >
          <input
            ref={batchFileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleBatchFileSelect}
          />
          <div className="w-12 h-12 rounded-full bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3 group-hover:scale-110 transition-transform">
            <Upload className="w-6 h-6" />
          </div>
          <span className="text-xs font-extrabold text-indigo-900 mb-1">
            {batchImageFile ? batchImageFile.name : 'スタンプ画像をここにドラッグ＆ドロップ、またはクリックして選択'}
          </span>
          <span className="text-[11px] text-slate-400">
            推奨: 上段3個・下段3個（計6個）が並んだ画像ファイル (PNG / JPG)
          </span>
        </div>

        {/* 切り出し設定 & プレビュー */}
        {batchImageSrc && (
          <div className="space-y-6 bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
            <h4 className="text-xs font-extrabold text-slate-800 flex items-center gap-2">
              <Eye className="w-4 h-4 text-indigo-600" />
              切り出しプレビュー & 割当設定
            </h4>

            {/* パラメータコントロール */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs">
              <div>
                <label className="block font-bold text-slate-700 mb-1">グリッド分割パターン</label>
                <div className="flex items-center gap-2">
                  <span className="text-slate-500">2行 × 3列 (6枠)</span>
                </div>
              </div>

              <div>
                <label className="flex items-center gap-2 font-bold text-slate-700 mb-1 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={autoRemoveBg}
                    onChange={(e) => setAutoRemoveBg(e.target.checked)}
                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  白地・外枠の自動背景透過処理
                </label>
                <span className="text-[11px] text-slate-500">
                  キャラクター外側の白色背景を消去して透過PNGにします
                </span>
              </div>

              {autoRemoveBg && (
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    背景透過感度 (しきい値): {bgThreshold}
                  </label>
                  <input
                    type="range"
                    min="10"
                    max="80"
                    value={bgThreshold}
                    onChange={(e) => setBgThreshold(Number(e.target.value))}
                    className="w-full accent-indigo-600"
                  />
                </div>
              )}
            </div>

            {/* スロットと割り当てスタンプのプレビューグリッド */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {croppedPreviews.map((preview, index) => (
                <div key={index} className="flex flex-col items-center bg-slate-50 rounded-xl p-3 border border-slate-200 gap-2">
                  <span className="text-[11px] font-extrabold text-indigo-700 bg-indigo-50 px-2 py-0.5 rounded-full border border-indigo-100">
                    位置 #{index + 1} ({index < 3 ? '上段' : '下段'}{index % 3 + 1}列目)
                  </span>

                  {/* 切出画像表示 */}
                  <div className="w-28 h-28 bg-white border border-slate-300 rounded-xl p-2 flex items-center justify-center overflow-hidden shadow-2xs relative group bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:8px_8px]">
                    <img src={preview.dataUrl} alt={`Cropped ${index}`} className="w-full h-full object-contain" />
                  </div>

                  {/* 割り当てスタンプ選択 */}
                  <div className="w-full">
                    <label className="block text-[10px] font-bold text-slate-500 mb-1 text-center">割り当てるスタンプ</label>
                    <select
                      value={slotAssignments[index] || ''}
                      onChange={(e) => {
                        const newAssignments = [...slotAssignments];
                        newAssignments[index] = e.target.value;
                        setSlotAssignments(newAssignments);
                      }}
                      className="w-full text-xs font-bold text-slate-800 bg-white border border-slate-300 rounded-lg p-1.5 focus:ring-2 focus:ring-indigo-500"
                    >
                      {allStampsFlat.map(s => (
                        <option key={s.id} value={s.id}>
                          {s.text} ({s.id})
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => {
                  setBatchImageSrc(null);
                  setBatchImageFile(null);
                  setCroppedPreviews([]);
                }}
                className="px-4 py-2 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all"
              >
                キャンセル
              </button>
              <button
                type="button"
                onClick={handleApplyBatchStamps}
                disabled={saving}
                className="px-5 py-2.5 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-md transition-all flex items-center gap-2"
              >
                {saving ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                切り出したスタンプ画像を全体に一括適用
              </button>
            </div>
          </div>
        )}
      </div>

      {/* SECTION 2: 現在登録されている全スタンプ一覧 & 個別差し替え */}
      <div className="space-y-6">
        <h3 className="text-sm font-extrabold text-slate-800 border-b border-slate-200 pb-2">
          登録済みスタンプ一覧 (カテゴリ別) & 個別画像アップロード
        </h3>

        {loading ? (
          <div className="flex justify-center py-12 text-slate-400">
            <RefreshCw className="w-6 h-6 animate-spin" />
          </div>
        ) : (
          <div className="space-y-8">
            {categories.map((category) => (
              <div key={category.id} className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4">
                <div className="flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                  <h4 className="text-sm font-extrabold text-slate-800">{category.name} ({category.stamps.length}個)</h4>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
                  {category.stamps.map((stamp) => (
                    <div
                      key={stamp.id}
                      className="flex flex-col items-center bg-slate-50/80 rounded-2xl p-3.5 border border-slate-200 hover:border-indigo-300 transition-all shadow-2xs group relative"
                    >
                      {/* スタンプ画像プレビュー */}
                      <div className="w-24 h-24 bg-white rounded-xl p-2 border border-slate-200 flex items-center justify-center overflow-hidden mb-2 shadow-2xs group-hover:scale-105 transition-transform bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] [background-size:8px_8px]">
                        <img
                          src={getStampUrl(stamp.imageUrl)}
                          alt={stamp.text}
                          className="w-full h-full object-contain"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      </div>

                      {/* 文字 & アイコン */}
                      <span className="text-xs font-black text-slate-800 text-center line-clamp-1 mb-1">
                        {stamp.text}
                      </span>
                      <span className="text-[10px] text-slate-400 mb-3">
                        ID: {stamp.id}
                      </span>

                      {/* 個別画像変更ボタン */}
                      <label className="w-full py-1.5 text-[11px] font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 rounded-lg text-center cursor-pointer transition-all flex items-center justify-center gap-1 shadow-2xs">
                        <Upload className="w-3 h-3" />
                        画像変更
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => handleSingleImageUpload(stamp.id, e)}
                        />
                      </label>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
