import React, { useEffect, useState, useMemo } from 'react';
import { 
  FileText, 
  Table, 
  AlignLeft, 
  Copy, 
  Check, 
  Download, 
  AlertCircle,
  WrapText
} from 'lucide-react';
import {
  FileFetchProgress,
  decodeBlobAsText,
  fetchFileBlobWithCache,
} from '../../utils/filePreviewCache';
import { PreviewLoadingState } from './PreviewLoadingState';

interface TextViewerProps {
  url: string;
  fileName: string;
  onDownload?: () => void;
}

export function TextViewer({ url, fileName, onDownload }: TextViewerProps) {
  const [content, setContent] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [progress, setProgress] = useState<FileFetchProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<boolean>(false);
  const [wrap, setWrap] = useState<boolean>(true);
  
  const isCsv = /\.csv$/i.test(fileName);
  const isTsv = /\.tsv$/i.test(fileName);
  const [viewMode, setViewMode] = useState<'table' | 'raw'>(isCsv || isTsv ? 'table' : 'raw');

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setProgress(null);
    setError(null);
    setContent(null);

    const loadText = async () => {
      try {
        const result = await fetchFileBlobWithCache(url, {
          onProgress: (p) => {
            if (isMounted) setProgress(p);
          },
        });
        const decodedText = await decodeBlobAsText(result.blob);

        if (!isMounted) return;
        setContent(decodedText);
        setLoading(false);
      } catch (err: any) {
        if (!isMounted) return;
        console.error('[TextViewer] Load error:', err);
        setError(err?.message || 'テキストの取得に失敗しました');
        setLoading(false);
      }
    };

    loadText();

    return () => {
      isMounted = false;
    };
  }, [url]);

  // CSV/TSV のパース
  const csvData = useMemo(() => {
    if (!content || (!isCsv && !isTsv)) return [];
    const delimiter = isTsv ? '\t' : ',';
    const lines = content.split(/\r?\n/).filter(line => line.trim().length > 0);
    
    return lines.map(line => {
      // 簡易的な引用符パース
      const regex = new RegExp(`(?:^|${delimiter})(?:"([^"]*(?:""[^"]*)*)"|([^"${delimiter}]*))`, 'g');
      const cells: string[] = [];
      let match;
      while ((match = regex.exec(line)) !== null) {
        let cell = match[1] !== undefined ? match[1].replace(/""/g, '"') : match[2];
        cells.push(cell || '');
      }
      return cells;
    });
  }, [content, isCsv, isTsv]);

  const handleCopy = () => {
    if (!content) return;
    navigator.clipboard.writeText(content);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) {
    return (
      <PreviewLoadingState
        title="テキストを読み込み中..."
        progress={progress}
        accentClass="text-indigo-600"
        barClass="bg-indigo-600"
      />
    );
  }

  if (error || content === null) {
    return (
      <div className="flex flex-col items-center justify-center p-8 text-center min-h-[350px] max-w-md mx-auto">
        <div className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center mb-3">
          <AlertCircle className="w-6 h-6" />
        </div>
        <p className="text-sm font-bold text-slate-800 mb-1">テキストの読み込みに失敗しました</p>
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
            <FileText className="w-4 h-4 text-indigo-600" />
            <span>ブラウザ別タブで開く</span>
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full w-full bg-slate-50">
      {/* ツールバー */}
      <div className="px-4 py-2 bg-white border-b border-slate-200 flex items-center justify-between gap-2 shrink-0 flex-wrap">
        <div className="flex items-center gap-1.5">
          {(isCsv || isTsv) && (
            <div className="flex items-center bg-slate-100 p-0.5 rounded-xl border border-slate-200">
              <button
                onClick={() => setViewMode('table')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'table' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Table className="w-3.5 h-3.5" />
                <span>表形式</span>
              </button>
              <button
                onClick={() => setViewMode('raw')}
                className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  viewMode === 'raw' ? 'bg-white text-indigo-600 shadow-2xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <AlignLeft className="w-3.5 h-3.5" />
                <span>テキスト</span>
              </button>
            </div>
          )}

          {viewMode === 'raw' && (
            <button
              onClick={() => setWrap(!wrap)}
              className={`flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg transition-colors cursor-pointer border border-slate-200 ${
                wrap ? 'bg-indigo-50 text-indigo-700 border-indigo-200' : 'bg-slate-100 text-slate-600'
              }`}
              title="折り返しトグル"
            >
              <WrapText className="w-3.5 h-3.5" />
              <span>{wrap ? '折り返し中' : '等幅'}</span>
            </button>
          )}
        </div>

        <button
          onClick={handleCopy}
          className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors cursor-pointer border border-slate-200"
          title="内容をコピー"
        >
          {copied ? (
            <>
              <Check className="w-3.5 h-3.5 text-emerald-600" />
              <span className="text-emerald-600">コピー完了</span>
            </>
          ) : (
            <>
              <Copy className="w-3.5 h-3.5" />
              <span>コピー</span>
            </>
          )}
        </button>
      </div>

      {/* 表示エリア */}
      <div className="flex-1 overflow-auto p-4 max-h-[75vh]">
        {viewMode === 'table' && csvData.length > 0 ? (
          <div className="inline-block min-w-full align-middle bg-white rounded-xl shadow-xs border border-slate-200 overflow-hidden">
            <div className="overflow-x-auto max-w-full">
              <table className="min-w-full border-collapse text-left text-xs text-slate-700">
                <thead className="bg-slate-100 border-b border-slate-200 sticky top-0">
                  <tr>
                    <th className="px-2.5 py-2 text-[10px] font-mono text-slate-400 text-center w-10 border-r border-slate-200">
                      #
                    </th>
                    {csvData[0].map((header, idx) => (
                      <th key={idx} className="px-3 py-2 font-bold text-slate-700 border-r border-slate-200 last:border-r-0">
                        {header || `列 ${idx + 1}`}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-normal">
                  {csvData.slice(1).map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-indigo-50/40 transition-colors">
                      <td className="px-2.5 py-1.5 text-[10px] font-mono text-slate-400 text-center border-r border-slate-200 bg-slate-50/50">
                        {rIdx + 1}
                      </td>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-1.5 border-r border-slate-100 last:border-r-0 whitespace-nowrap">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
            <pre className={`font-mono text-xs text-slate-800 leading-relaxed ${wrap ? 'whitespace-pre-wrap' : 'whitespace-pre overflow-x-auto'}`}>
              {content}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
}
