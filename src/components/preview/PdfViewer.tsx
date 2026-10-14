import React, { useEffect, useRef, useState, useCallback } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import { 
  ChevronLeft, 
  ChevronRight, 
  ZoomIn, 
  ZoomOut, 
  RotateCw, 
  Maximize2, 
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

  const [pdfDoc, setPdfDoc] = useState<any>(null);
  const [pageNum, setPageNum] = useState<number>(1);
  const [numPages, setNumPages] = useState<number>(0);
  const [scale, setScale] = useState<number>(1.2);
  const [rotation, setRotation] = useState<number>(0);
  const [loading, setLoading] = useState<boolean>(true);
  const [rendering, setRendering] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [fitWidth, setFitWidth] = useState<boolean>(true);

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
    };
  }, [url]);

  // ページ描画
  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current || rendering) return;

    try {
      setRendering(true);
      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      if (!canvas) return;

      const context = canvas.getContext('2d');
      if (!context) return;

      // 幅合わせの計算（スマホ画面幅に自動調整）
      let currentScale = scale;
      if (fitWidth && containerRef.current) {
        const containerWidth = containerRef.current.clientWidth - 32; // 余白
        const unscaledViewport = page.getViewport({ scale: 1.0, rotation });
        if (containerWidth > 0 && unscaledViewport.width > 0) {
          currentScale = Math.min(Math.max(containerWidth / unscaledViewport.width, 0.5), 3.0);
        }
      }

      const viewport = page.getViewport({ scale: currentScale, rotation });
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

      await page.render(renderContext).promise;
      context.restore();
    } catch (err) {
      console.warn('[PdfViewer] Page render error:', err);
    } finally {
      setRendering(false);
    }
  }, [pdfDoc, pageNum, scale, rotation, fitWidth]);

  useEffect(() => {
    renderPage();
  }, [renderPage]);

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
    setFitWidth(false);
    setScale(s => Math.min(s + 0.25, 3.0));
  };

  const handleZoomOut = () => {
    setFitWidth(false);
    setScale(s => Math.max(s - 0.25, 0.5));
  };

  const handleToggleFit = () => {
    setFitWidth(!fitWidth);
    if (!fitWidth) {
      setScale(1.2);
    }
  };

  const handleRotate = () => {
    setRotation(r => (r + 90) % 360);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 min-h-[350px]">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
        <p className="text-xs font-bold text-slate-700">PDFを読み込み中...</p>
        <p className="text-[11px] text-slate-400 mt-1">端末上でインライン描画しています</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[350px] max-w-md mx-auto">
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
    <div className="flex flex-col h-full w-full bg-slate-100 select-none">
      {/* ツールバー（スマホでも使いやすいボタンサイズとレイアウト） */}
      <div className="px-3 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap shrink-0 shadow-2xs">
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

        {/* ズーム & 回転コントロール */}
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-0.5 bg-slate-100 rounded-xl p-0.5 border border-slate-200">
            <button
              onClick={handleZoomOut}
              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
              title="縮小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleToggleFit}
              className={`px-2 py-1 text-[11px] font-bold rounded-lg transition-colors cursor-pointer ${
                fitWidth ? 'bg-indigo-600 text-white shadow-2xs' : 'text-slate-600 hover:bg-white'
              }`}
              title="幅に合わせる"
            >
              幅自動
            </button>
            <button
              onClick={handleZoomIn}
              className="p-1.5 text-slate-600 hover:text-indigo-600 hover:bg-white rounded-lg transition-colors cursor-pointer"
              title="拡大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
          </div>

          <button
            onClick={handleRotate}
            className="p-2 bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-indigo-600 rounded-xl border border-slate-200 transition-colors cursor-pointer"
            title="90度回転"
          >
            <RotateCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* メイン描画エリア */}
      <div 
        ref={containerRef}
        className="flex-1 overflow-auto p-4 flex items-center justify-center min-h-[350px] max-h-[75vh]"
      >
        <div className="relative shadow-md rounded-lg overflow-hidden border border-slate-300 bg-white inline-block">
          {rendering && (
            <div className="absolute inset-0 bg-white/60 backdrop-blur-2xs flex items-center justify-center z-10">
              <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
            </div>
          )}
          <canvas ref={canvasRef} className="block max-w-none" />
        </div>
      </div>
    </div>
  );
}
