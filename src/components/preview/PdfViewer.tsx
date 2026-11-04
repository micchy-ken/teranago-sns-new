import React, { useEffect, useState, useRef } from 'react';
import { Loader2 } from 'lucide-react';

interface PdfViewerProps {
  url: string;
  fileName: string;
  onDownload?: () => void;
}

export function PdfViewer({ url, fileName }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const currentBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);

    // 古いBlobURLがあれば破棄
    if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
      URL.revokeObjectURL(currentBlobUrlRef.current);
      currentBlobUrlRef.current = null;
    }

    const loadPdf = async () => {
      try {
        // Blobとして取得（CORSが通る場合はSame-Origin BlobURLとなり、iframeのX-Frame-Options等の制約を回避して確実にブラウザ描画）
        const response = await fetch(url);
        if (response.ok) {
          const blob = await response.blob();
          if (!isMounted) return;
          const pdfBlob = new Blob([blob], { type: 'application/pdf' });
          const objUrl = URL.createObjectURL(pdfBlob);
          currentBlobUrlRef.current = objUrl;
          setBlobUrl(objUrl);
        } else {
          if (!isMounted) return;
          setBlobUrl(url);
        }
      } catch (err) {
        console.warn('[PdfViewer] Blob conversion failed, falling back to direct URL in iframe:', err);
        if (!isMounted) return;
        setBlobUrl(url);
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };
  }, [url]);

  const activeUrl = blobUrl || url;

  return (
    <div className="flex-1 w-full h-full relative bg-slate-100 overflow-hidden flex flex-col">
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
  );
}
