import React, { useState, useEffect, useRef } from 'react';
import { 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  AlertCircle 
} from 'lucide-react';
import {
  FileFetchProgress,
  fetchFileBlobWithCache,
  getCachedPreviewEntry,
} from '../../utils/filePreviewCache';
import { PreviewLoadingState } from './PreviewLoadingState';

interface ImageViewerProps {
  url: string;
  fileName: string;
  onDownload?: () => void;
}

export function ImageViewer({ url, fileName, onDownload }: ImageViewerProps) {
  const [scale, setScale] = useState<number>(1);
  const [rotation, setRotation] = useState<number>(0);
  const [imageError, setImageError] = useState<boolean>(false);
  const [displayUrl, setDisplayUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<FileFetchProgress | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setImageError(false);
    setScale(1);
    setRotation(0);

    const revokeActiveObjectUrl = () => {
      if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };

    revokeActiveObjectUrl();

    if (!url) {
      setDisplayUrl(null);
      setLoading(false);
      return;
    }

    if (url.startsWith('data:') || url.startsWith('blob:')) {
      setDisplayUrl(url);
      setLoading(false);
      return;
    }

    // 1. キャッシュヒット時は即座にビューアー専用ObjectURLを生成して表示
    const cached = getCachedPreviewEntry(url);
    if (cached) {
      const objUrl = URL.createObjectURL(cached.blob);
      currentBlobUrlRef.current = objUrl;
      setDisplayUrl(objUrl);
      setProgress({
        loaded: cached.size,
        total: cached.size,
        percent: 100,
        fromCache: true,
      });
      setLoading(false);
      return () => {
        isMounted = false;
        revokeActiveObjectUrl();
      };
    }

    // 2. 未キャッシュ時は進捗付きでBlob取得・キャッシュ保存
    setLoading(true);
    setDisplayUrl(null);
    setProgress({ loaded: 0, total: null, percent: null, fromCache: false });

    const loadImage = async () => {
      try {
        const result = await fetchFileBlobWithCache(url, {
          onProgress: (p) => {
            if (isMounted) {
              setProgress(p);
            }
          },
        });
        if (!isMounted) return;
        const objUrl = URL.createObjectURL(result.blob);
        currentBlobUrlRef.current = objUrl;
        setDisplayUrl(objUrl);
        setLoading(false);
      } catch {
        // CORS制約等でfetch取得できない外部画像URLは直接<img>読み込みへフォールバック
        if (!isMounted) return;
        setDisplayUrl(url);
        setLoading(false);
      }
    };

    loadImage();

    return () => {
      isMounted = false;
      revokeActiveObjectUrl();
    };
  }, [url]);

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
            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold cursor-pointer"
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
            className="px-2 text-xs font-bold text-slate-300 hover:text-white cursor-pointer"
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
        {loading ? (
          <PreviewLoadingState
            title="画像を読み込み中..."
            subtitle="初回のみファイルを取得します（次回以降はキャッシュから即時表示）"
            progress={progress}
            accentClass="text-indigo-400"
            barClass="bg-indigo-500"
            dark
          />
        ) : (
          <img
            src={displayUrl || url}
            alt={fileName}
            onError={() => setImageError(true)}
            style={{
              transform: `scale(${scale}) rotate(${rotation}deg)`,
              transition: 'transform 0.15s ease-out',
            }}
            className="max-w-full max-h-[70vh] object-contain shadow-2xl rounded-lg origin-center"
          />
        )}
      </div>
    </div>
  );
}
