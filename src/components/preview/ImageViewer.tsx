import React, { useState } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2, 
  Download, 
  AlertCircle 
} from 'lucide-react';

interface ImageViewerProps {
  url: string;
  fileName: string;
  onDownload?: () => void;
}

export function ImageViewer({ url, fileName, onDownload }: ImageViewerProps) {
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [imageError, setImageError] = useState<boolean>(false);

  const handleZoomIn = () => setScale(s => Math.min(s + 0.25, 4));
  const handleZoomOut = () => setScale(s => Math.max(s - 0.25, 0.5));
  const handleReset = () => {
    setScale(1);
    setRotation(0);
  };
  const handleRotate = () => setRotation(r => (r + 90) % 360);

  if (imageError) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[350px]">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <p className="text-sm font-bold text-slate-800 mb-1">画像の表示に失敗しました</p>
        <p className="text-xs text-slate-400 mb-4">ファイルが存在しないか、形式が破損している可能性があります。</p>
        {onDownload && (
          <button
            onClick={onDownload}
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold"
          >
            ファイルをダウンロード
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-950/90 select-none">
      {/* ツールバー */}
      <div className="px-4 py-2 bg-slate-900 border-b border-slate-800 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-1 bg-slate-800/80 rounded-xl p-0.5 border border-slate-700">
          <button
            onClick={handleZoomOut}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            title="縮小"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <button
            onClick={handleReset}
            className="px-2 text-xs font-bold text-slate-300 hover:text-white"
            title="等倍に戻す"
          >
            {Math.round(scale * 100)}%
          </button>
          <button
            onClick={handleZoomIn}
            className="p-1.5 text-slate-300 hover:text-white hover:bg-slate-700 rounded-lg transition-colors cursor-pointer"
            title="拡大"
          >
            <ZoomIn className="w-4 h-4" />
          </button>
        </div>

        <button
          onClick={handleRotate}
          className="p-2 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-xl border border-slate-700 transition-colors cursor-pointer"
          title="90度回転"
        >
          <RotateCw className="w-4 h-4" />
        </button>
      </div>

      {/* 画像プレビュー */}
      <div className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[350px] max-h-[75vh]">
        <img
          src={url}
          alt={fileName}
          onError={() => setImageError(true)}
          style={{
            transform: `scale(${scale}) rotate(${rotation}deg)`,
            transition: 'transform 0.15s ease-out',
          }}
          className="max-w-full max-h-[70vh] object-contain shadow-2xl rounded-lg origin-center"
        />
      </div>
    </div>
  );
}
