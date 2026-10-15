import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  RotateCcw,
  Maximize,
  Minimize2,
  Download, 
  AlertCircle,
  Loader2,
  FileText
} from 'lucide-react';

// 日本語フォントなどのCMapおよびWorker設定
if (typeof window !== 'undefined') {
  try {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  } catch (e) {
    console.warn('[PdfViewer] Failed to set workerSrc:', e);
  }
}

interface PdfViewerProps {
  url: string;
  fileName: string;
  onDownload?: () => void;
}

export function PdfViewer({ url, fileName, onDownload }: PdfViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const renderTaskRef = useRef<any>(null);

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.0);
  const [userRotation, setUserRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  // 'fit-page' (全体表示: 上下左右が画面内に収まる), 'fit-width' (幅合わせ: 横幅一杯で縦スクロール), 'custom' (自由倍率)
  const [fitMode, setFitMode] = useState<'fit-page' | 'fit-width' | 'custom'>('fit-page');

  // PDF データの読み込み
  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setPdfDoc(null);
    setPageNum(1);

    const loadPdf = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const arrayBuffer = await response.arrayBuffer();

        const loadingTask = pdfjsLib.getDocument({
          data: arrayBuffer,
          cMapUrl: `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/cmaps/`,
          cMapPacked: true,
        });

        const doc = await loadingTask.promise;
        if (!isMounted) return;

        setPdfDoc(doc);
        setNumPages(doc.numPages);
        setPageNum(1);
        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('[PdfViewer] PDF load error:', err);
        setError(err?.message || 'PDFの読み込みに失敗しました');
        setLoading(false);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_) {}
      }
    };
  }, [url]);

  // ページ描画
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;

    try {
      setRendering(true);
      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      // 前回のレンダリングタスクがあればキャンセル
      if (renderTaskRef.current) {
        try {
          renderTaskRef.current.cancel();
        } catch (_) {}
      }

      // PDF独自の回転属性（page.rotate: CAD図面等で設定される0/90/180/270度）とユーザーの追加回転を合成
      const nativeRotate = typeof page.rotate === 'number' ? page.rotate : 0;
      const totalRotation = (nativeRotate + userRotation) % 360;

      // 倍率の計算
      let effectiveScale = scale;
      if (containerRef.current) {
        const containerW = Math.max(containerRef.current.clientWidth - 32, 280);
        const containerH = Math.max(containerRef.current.clientHeight - 32, 280);
        const unscaledViewport = page.getViewport({ scale: 1.0, rotation: totalRotation });

        if (unscaledViewport.width > 0 && unscaledViewport.height > 0) {
          if (fitMode === 'fit-page') {
            const scaleW = containerW / unscaledViewport.width;
            const scaleH = containerH / unscaledViewport.height;
            effectiveScale = Math.min(scaleW, scaleH);
          } else if (fitMode === 'fit-width') {
            effectiveScale = containerW / unscaledViewport.width;
          }
        }
      }

      // 下限・上限を安全に制限
      effectiveScale = Math.min(Math.max(effectiveScale, 0.2), 4.0);

      const viewport = page.getViewport({ scale: effectiveScale, rotation: totalRotation });
      const outputScale = window.devicePixelRatio || 1;

      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      context.save();
      context.scale(outputScale, outputScale);

      const renderContext = {
        canvasContext: context,
        viewport: viewport,
      };

      const task = page.render(renderContext);
      renderTaskRef.current = task;
      await task.promise;
      renderTaskRef.current = null;
      context.restore();
    } catch (err: any) {
      if (err?.name !== 'RenderingCancelledException') {
        console.warn('[PdfViewer] Page render error:', err);
      }
    } finally {
      setRendering(false);
    }
  }, [pdfDoc, pageNum, scale, userRotation, fitMode]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

  // ウィンドウリサイズ時の再描画
  useEffect(() => {
    let timeoutId: any;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        if (fitMode !== 'custom') {
          renderPage();
        }
      }, 150);
    };
    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      clearTimeout(timeoutId);
    };
  }, [fitMode, renderPage]);

  // ページ送り
  const handlePrevPage = () => {
    if (pageNum > 1) {
      setPageNum(p => p - 1);
    }
  };

  const handleNextPage = () => {
    if (pageNum < numPages) {
      setPageNum(p => p + 1);
    }
  };

  // 拡大縮小
  const handleZoomIn = () => {
    setFitMode('custom');
    setScale(s => Math.min(s * 1.25, 4.0));
  };

  const handleZoomOut = () => {
    setFitMode('custom');
    setScale(s => Math.max(s * 0.8, 0.25));
  };

  const handleFitPage = () => {
    setFitMode('fit-page');
  };

  const handleFitWidth = () => {
    setFitMode('fit-width');
  };

  const handleRotateCw = () => {
    setUserRotation(r => (r + 90) % 360);
  };

  const handleRotateCcw = () => {
    setUserRotation(r => (r - 90 + 360) % 360);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 h-full min-h-[350px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
        <p className="text-xs font-bold text-slate-700">PDFを読み込み中...</p>
        <p className="text-[11px] text-slate-400 mt-1">端末上でインライン描画しています</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center h-full min-h-[350px] max-w-md mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-500 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <p className="text-sm font-bold text-slate-800 mb-1">PDFのオンライン表示に失敗しました</p>
        <p className="text-xs text-slate-500 mb-4">{error}</p>
        <div className="flex items-center gap-2 flex-wrap justify-center">
          {onDownload && (
            <button
              onClick={onDownload}
              className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
            >
              <Download className="w-4 h-4" />
              <span>ダウンロードして確認</span>
            </button>
          )}
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <FileText className="w-4 h-4" />
            <span>ブラウザ別タブで開く</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-100 select-none overflow-hidden">
      {/* ツールバー */}
      <div className="px-3 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap shrink-0 shadow-2xs z-20">
        {/* ページ送り */}
        <div className="flex items-center gap-1 bg-slate-100 rounded-xl p-0.5 border border-slate-200">
          <button
            onClick={handlePrevPage}
            disabled={pageNum <= 1}
            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="前のページ"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="px-2 text-xs font-bold text-slate-700 min-w-[60px] text-center">
            <span>{pageNum}</span>
            <span className="text-slate-400 mx-1">/</span>
            <span>{numPages}</span>
          </div>
          <button
            onClick={handleNextPage}
            disabled={pageNum >= numPages}
            className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors disabled:opacity-30 disabled:pointer-events-none cursor-pointer"
            title="次のページ"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* 表示切替 & ズームコントロール & 左右回転 */}
        <div className="flex items-center gap-1.5 flex-wrap">
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-0.5 border border-slate-200">
            <button
              onClick={handleFitPage}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                fitMode === 'fit-page' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-white'
              }`}
              title="ページ全体を画面に収める (上下途切れなし)"
            >
              <Minimize2 className="w-3 h-3" />
              <span>全体表示</span>
            </button>
            <button
              onClick={handleFitWidth}
              className={`px-2.5 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1 ${
                fitMode === 'fit-width' ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-white'
              }`}
              title="横幅を画面一杯に合わせる (縦スクロール)"
            >
              <Maximize className="w-3 h-3" />
              <span>幅合わせ</span>
            </button>
          </div>

          <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-0.5 border border-slate-200">
            <button
              onClick={handleZoomOut}
              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
              title="縮小 (-)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
              title="拡大 (+)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* 左右90度回転ボタン */}
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-0.5 border border-slate-200">
            <button
              onClick={handleRotateCcw}
              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
              title="左へ90度回転"
            >
              <RotateCcw className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleRotateCw}
              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
              title="右へ90度回転"
            >
              <RotateCw className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* メイン描画エリア: 上下途切れを防ぎ、先頭から末尾まで確実にスクロール可能 */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto p-3 sm:p-6 w-full h-full bg-slate-200/80"
      >
        <div className="min-w-full min-h-full flex items-start justify-center">
          <div className="relative shadow-xl rounded-lg overflow-hidden border border-slate-300 bg-white inline-block my-auto shrink-0">
            {rendering && (
              <div className="absolute inset-0 bg-white/70 backdrop-blur-2xs flex items-center justify-center z-10">
                <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
              </div>
            )}
            <canvas ref={canvasRef} className="block max-w-none" />
          </div>
        </div>
      </div>
    </div>
  );
}
