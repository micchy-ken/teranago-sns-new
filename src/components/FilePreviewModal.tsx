import React, { useEffect } from 'react';
import { 
  X, 
  Download, 
  FileText, 
  FileImage, 
  FileCode, 
  FileSpreadsheet,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { AttachmentFile } from '../types';
import { resolveFileUrl } from '../utils/fileUpload';
import { PdfViewer } from './preview/PdfViewer';
import { ExcelViewer } from './preview/ExcelViewer';
import { DocxViewer } from './preview/DocxViewer';
import { TextViewer } from './preview/TextViewer';
import { ImageViewer } from './preview/ImageViewer';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: AttachmentFile | null;
}

export function FilePreviewModal({ isOpen, onClose, file }: FilePreviewModalProps) {
  // ESCキーで閉じる
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !file) return null;

  const resolvedUrl = file?.url ? resolveFileUrl(file.url) : '';
  const fileName = file.name || 'ファイル';

  // ファイル種類の判定
  const isPdf = file?.type === 'application/pdf' || /\.pdf$/i.test(fileName);
  const isExcel = /\.(xlsx|xls|xlsm|xlsb)$/i.test(fileName) || 
    file?.type?.includes('spreadsheet') || 
    file?.type?.includes('excel');
  const isDocx = /\.docx$/i.test(fileName) || 
    file?.type?.includes('wordprocessingml');
  const isOldDoc = /\.doc$/i.test(fileName);
  const isImage = file?.type?.startsWith('image/') || 
    /\.(jpg|jpeg|png|gif|webp|svg|bmp|ico)$/i.test(fileName);
  const isText = /\.(txt|csv|tsv|json|xml|log|ini|md|yaml|yml|sql)$/i.test(fileName);

  // アイコン判定
  const getHeaderIcon = () => {
    if (isImage) return <FileImage className="w-5 h-5 text-indigo-500 shrink-0" />;
    if (isPdf) return <FileText className="w-5 h-5 text-rose-500 shrink-0" />;
    if (isExcel) return <FileSpreadsheet className="w-5 h-5 text-emerald-500 shrink-0" />;
    if (isDocx || isOldDoc) return <FileText className="w-5 h-5 text-blue-500 shrink-0" />;
    if (isText) return <FileCode className="w-5 h-5 text-amber-500 shrink-0" />;
    return <FileText className="w-5 h-5 text-slate-400 shrink-0" />;
  };

  const handleDownload = () => {
    if (!resolvedUrl) return;
    const link = document.createElement('a');
    link.href = resolvedUrl;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-2 sm:p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto"
      id="file-preview-backdrop"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl sm:rounded-3xl max-w-5xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col h-[94vh] sm:h-auto sm:max-h-[90vh]"
        id="file-preview-container"
      >
        {/* Header */}
        <div className="px-4 sm:px-6 py-3.5 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {getHeaderIcon()}
            <div className="min-w-0">
              <h3 className="text-xs sm:text-sm font-bold text-slate-800 truncate" title={fileName}>
                {fileName}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                {file.size && (
                  <span className="text-[10px] text-slate-400 font-semibold">{file.size}</span>
                )}
                {isPdf && (
                  <span className="text-[9px] px-1.5 py-0.2 bg-rose-50 text-rose-600 font-bold rounded-md border border-rose-200">
                    PDFプレビュー
                  </span>
                )}
                {isExcel && (
                  <span className="text-[9px] px-1.5 py-0.2 bg-emerald-50 text-emerald-600 font-bold rounded-md border border-emerald-200">
                    Excelプレビュー
                  </span>
                )}
                {isDocx && (
                  <span className="text-[9px] px-1.5 py-0.2 bg-blue-50 text-blue-600 font-bold rounded-md border border-blue-200">
                    Wordプレビュー
                  </span>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {resolvedUrl && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-colors cursor-pointer"
                title="端末にダウンロード"
              >
                <Download className="w-3.5 h-3.5" />
                <span className="hidden sm:inline">ダウンロード</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
              title="閉じる (Esc)"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Preview Content Body */}
        <div className="flex-1 overflow-hidden flex flex-col bg-slate-100 relative">
          {isImage ? (
            <ImageViewer 
              url={resolvedUrl} 
              fileName={fileName} 
              onDownload={handleDownload} 
            />
          ) : isPdf ? (
            <PdfViewer 
              url={resolvedUrl} 
              fileName={fileName} 
              onDownload={handleDownload} 
            />
          ) : isExcel ? (
            <ExcelViewer 
              url={resolvedUrl} 
              fileName={fileName} 
              onDownload={handleDownload} 
            />
          ) : isDocx ? (
            <DocxViewer 
              url={resolvedUrl} 
              fileName={fileName} 
              onDownload={handleDownload} 
            />
          ) : isText ? (
            <TextViewer 
              url={resolvedUrl} 
              fileName={fileName} 
              onDownload={handleDownload} 
            />
          ) : isOldDoc ? (
            <div className="text-center py-16 px-6 max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-blue-50 text-blue-600 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-2">旧形式のWord文書（.doc）です</h4>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                .doc 形式はブラウザ上での直接展開に対応しておりません。端末にダウンロードしてWordアプリで開くか、.docx 形式に保存し直してご利用ください。
              </p>
              <button
                onClick={handleDownload}
                className="px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 mx-auto shadow-xs transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>ファイルをダウンロード</span>
              </button>
            </div>
          ) : (
            <div className="text-center py-16 px-6 max-w-md mx-auto">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto mb-4">
                <FileText className="w-7 h-7" />
              </div>
              <h4 className="text-sm font-bold text-slate-800 mb-2">オンラインプレビュー非対応のファイル形式です</h4>
              <p className="text-xs text-slate-500 mb-6 leading-relaxed">
                ZIPアーカイブや実行可能ファイル等のため、ブラウザ内での直接プレビューはできません。端末にダウンロードしてご確認ください。
              </p>
              <button
                onClick={handleDownload}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 mx-auto shadow-xs transition-colors cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>ファイルをダウンロード</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
