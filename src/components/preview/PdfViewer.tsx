import React, { useEffect, useState, useRef } from 'react';
import { 
  Download, 
  ExternalLink, 
  RefreshCw, 
  FileText, 
  Loader2 
} from 'lucide-react';

interface PdfViewerProps {
  url: string;
  fileName: string;
  onDownload?: () => void;
}

export function PdfViewer({ url, fileName, onDownload }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const currentBlobUrlRef = useRef<string | null>(null);

  const loadPdf = async () => {
    setLoading(true);

    // 古いBlobURLがあれば破棄
    if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    try {
      // 1. まずBlobとして取得
      // (CORSが通る環境ではSame-OriginなBlobURLとなり、iframeのX-Frame-OptionsやWorker制限を回避して確実にブラウザ描画可能)
      const response = await fetch(url);
      if (response.ok) {
        const blob = await response.blob();
        const pdfBlob = new Blob([blob], { type: 'application/pdf' });
        const objUrl = URL.createObjectURL(pdfBlob);
        currentBlobUrlRef.current = objUrl;
        setBlobUrl(objUrl);
      } else {
        // 直接URLにフォールバック
        setBlobUrl(url);
      }
    } catch (err: any) {
      console.warn('[PdfViewer] Blob conversion failed, falling back to direct URL in iframe:', err);
      // fetchがブロックされた場合は直接URLをiframeに設定
      setBlobUrl(url);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadPdf();

    return () => {
      if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, [url]);

  const activeUrl = blobUrl || url;

  const handleOpenExternal = () => {
    window.open(activeUrl, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="flex flex-col h-full w-full bg-slate-100 select-none overflow-hidden">
      {/* ツールバー */}
      <div className="px-3 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-2 flex-wrap shrink-0 shadow-2xs z-20">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-rose-50 text-rose-600 rounded-lg shrink-0">
            <FileText className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <span className="text-xs font-bold text-slate-800 truncate block max-w-xs sm:max-w-md" title={fileName}>
              {fileName}
            </span>
            <span className="text-[10px] text-slate-400 font-medium">
              ブラウザ標準高精細PDFビューアー
            </span>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={loadPdf}
            className="p-1.5 text-slate-600 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            title="再読み込み"
          >
            <RefreshCw className="w-3.5 h-3.5" />
          </button>

          <button
            type="button"
            onClick={handleOpenExternal}
            className="flex items-center gap-1 px-2.5 py-1 text-slate-700 hover:bg-slate-100 border border-slate-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
            title="ブラウザの別タブで全画面表示"
          >
            <ExternalLink className="w-3.5 h-3.5 text-slate-600" />
            <span className="hidden sm:inline">別タブで開く</span>
          </button>

          {onDownload && (
            <button
              type="button"
              onClick={onDownload}
              className="flex items-center gap-1 px-2.5 py-1 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
              title="端末にダウンロード"
            >
              <Download className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">ダウンロード</span>
            </button>
          )}
        </div>
      </div>

      {/* メイン描画エリア */}
      <div className="flex-1 w-full h-full relative bg-slate-200/60 overflow-hidden flex flex-col">
        {loading ? (
          <div className="flex flex-col items-center justify-center p-12 text-slate-500 h-full min-h-[350px]">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-3" />
            <p className="text-xs font-bold text-slate-700">PDFを読み込み中...</p>
            <p className="text-[11px] text-slate-400 mt-1">高精細ビューアーを準備しています</p>
          </div>
        ) : (
          <iframe
            src={activeUrl}
            title={fileName}
            className="w-full h-full flex-1 border-0 bg-white"
          />
        )}
      </div>
    </div>
  );
}
