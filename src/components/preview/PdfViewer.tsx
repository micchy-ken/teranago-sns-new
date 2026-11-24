import React, { useEffect, useState, useRef } from 'react';
import {
  FileFetchProgress,
  fetchFileBlobWithCache,
  getCachedPreviewEntry,
} from '../../utils/filePreviewCache';
import { PreviewLoadingState } from './PreviewLoadingState';

interface PdfViewerProps {
  url: string;
  fileName: string;
  onDownload?: () => void;
}

export function PdfViewer({ url, fileName }: PdfViewerProps) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<FileFetchProgress | null>(null);
  const currentBlobUrlRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    const revokeActiveObjectUrl = () => {
      if (currentBlobUrlRef.current && currentBlobUrlRef.current.startsWith('blob:')) {
        URL.revokeObjectURL(currentBlobUrlRef.current);
        currentBlobUrlRef.current = null;
      }
    };

    revokeActiveObjectUrl();

    const mountBlob = (rawBlob: Blob) => {
      const pdfBlob =
        rawBlob.type === 'application/pdf'
          ? rawBlob
          : new Blob([rawBlob], { type: 'application/pdf' });
      // ビューアー専用のObjectURLを都度生成（クローズ時にこれだけ破棄し、キャッシュ内Blobは維持）
      const objUrl = URL.createObjectURL(pdfBlob);
      currentBlobUrlRef.current = objUrl;
      setBlobUrl(objUrl);
      setLoading(false);
    };

    // 1. キャッシュヒット時はネットワーク通信・ローディング表示なしで即座に表示
    const cached = getCachedPreviewEntry(url);
    if (cached) {
      setProgress({
        loaded: cached.size,
        total: cached.size,
        percent: 100,
        fromCache: true,
      });
      mountBlob(cached.blob);
      return () => {
        isMounted = false;
        revokeActiveObjectUrl();
      };
    }

    // 2. 未キャッシュ時のみAPIからストリーム取得＆進捗表示し、Blobをキャッシュ保存
    setLoading(true);
    setBlobUrl(null);
    setProgress({ loaded: 0, total: null, percent: null, fromCache: false });

    const loadPdf = async () => {
      try {
        const result = await fetchFileBlobWithCache(url, {
          expectedMimeType: 'application/pdf',
          onProgress: (p) => {
            if (isMounted) {
              setProgress(p);
            }
          },
        });
        if (!isMounted) return;
        mountBlob(result.blob);
      } catch (err) {
        console.warn('[PdfViewer] Blob conversion failed, falling back to direct URL in iframe:', err);
        if (!isMounted) return;
        setBlobUrl(url);
        setLoading(false);
      }
    };

    loadPdf();

    return () => {
      isMounted = false;
      revokeActiveObjectUrl();
    };
  }, [url]);

  const activeUrl = blobUrl || url;

  return (
    <div className="flex-1 w-full h-full relative bg-slate-100 overflow-hidden flex flex-col">
      {loading ? (
        <PreviewLoadingState
          title="PDFを読み込み中..."
          subtitle="初回のみファイルを取得します（次回以降はキャッシュから即時表示）"
          progress={progress}
          accentClass="text-rose-600"
          barClass="bg-rose-600"
        />
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
