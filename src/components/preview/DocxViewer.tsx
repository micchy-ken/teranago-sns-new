import React, { useEffect, useState } from 'react';
import mammoth from 'mammoth';
import { 
  FileText, 
  Download, 
  AlertCircle, 
  Loader2,
  Copy,
  Check
} from 'lucide-react';

interface DocxViewerProps {
  url: string;
  fileName: string;
  onDownload?: () => void;
}

export function DocxViewer({ url, fileName, onDownload }: DocxViewerProps) {
  const [htmlContent, setHtmlContent] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError(null);
    setHtmlContent(null);

    const loadDocx = async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) {
          throw new Error(`HTTP ${response.status} ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();

        const result = await mammoth.convertToHtml({ arrayBuffer: buffer });
        if (!isMounted) return;

        if (!result.value || result.value.trim().length === 0) {
          // 本文が空の場合
          setHtmlContent('<p class="text-slate-400 italic">文書本文が空です。</p>');
        } else {
          setHtmlContent(result.value);
        }
        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('[DocxViewer] Load error:', err);
        setError(err?.message || 'Word文書の解析に失敗しました');
        setLoading(false);
      }
    };

    loadDocx();

    return () => {
      isMounted = false;
    };
  }, [url]);

  const handleCopyText = () => {
    if (!htmlContent) return;
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = htmlContent;
    const text = tempDiv.innerText || tempDiv.textContent || '';
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-500 min-h-[350px]">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600 mb-3" />
        <p className="text-xs font-bold text-slate-700">Word文書を読み込み中...</p>
        <p className="text-[11px] text-slate-400 mt-1">HTMLテキストに変換しています</p>
      </div>
    );
  }

  if (error || htmlContent === null) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[350px] max-w-md mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <p className="text-sm font-bold text-slate-800 mb-1">Word文書のオンライン表示に失敗しました</p>
        <p className="text-xs text-slate-500 mb-4">{error || '内容が取得できませんでした'}</p>
        {onDownload && (
          <button
            onClick={onDownload}
            className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>ダウンロードして確認</span>
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-100">
      {/* ツールバー */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0">
        <div className="flex items-center gap-2 text-xs font-bold text-slate-600">
          <FileText className="w-4 h-4 text-blue-600" />
          <span>Word文書プレビュー</span>
        </div>
        <button
          onClick={handleCopyText}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors cursor-pointer border border-slate-200"
          title="本文テキストをコピー"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-600">コピー完了</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>テキストをコピー</span>
            </>
          )}
        </button>
      </div>

      {/* 本文コンテナ（用紙のようなデザイン） */}
      <div className="flex-1 overflow-auto p-4 sm:p-6 max-h-[75vh]">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-6 sm:p-10 min-h-[400px]">
          <div
            className="docx-content text-slate-800 text-sm leading-relaxed space-y-4 font-sans select-text [&_h1]:text-xl [&_h1]:font-bold [&_h1]:text-slate-900 [&_h1]:border-b [&_h1]:border-slate-200 [&_h1]:pb-2 [&_h2]:text-lg [&_h2]:font-bold [&_h2]:text-slate-800 [&_h3]:text-base [&_h3]:font-bold [&_h3]:text-slate-800 [&_p]:mb-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ol]:list-decimal [&_ol]:pl-5 [&_li]:mb-1 [&_table]:w-full [&_table]:border-collapse [&_table]:border [&_table]:border-slate-300 [&_td]:border [&_td]:border-slate-300 [&_td]:p-2 [&_th]:border [&_th]:border-slate-300 [&_th]:p-2 [&_th]:bg-slate-50 [&_blockquote]:border-l-4 [&_blockquote]:border-slate-300 [&_blockquote]:pl-4 [&_blockquote]:italic [&_strong]:font-bold [&_a]:text-blue-600 [&_a]:underline"
            dangerouslySetInnerHTML={{ __html: htmlContent }}
          />
        </div>
      </div>
    </div>
  );
}
