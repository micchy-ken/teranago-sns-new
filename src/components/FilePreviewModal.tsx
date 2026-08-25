import React from 'react';
import { X, Download, FileText, FileImage, FileCode, FileSpreadsheet } from 'lucide-react';
import { AttachmentFile } from '../types';
import { resolveFileUrl } from '../utils/fileUpload';

interface FilePreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  file: AttachmentFile | null;
}

export function FilePreviewModal({ isOpen, onClose, file }: FilePreviewModalProps) {
  if (!isOpen || !file) return null;

  const resolvedUrl = resolveFileUrl(file.url);
  const isImage = file.type?.startsWith('image/') || /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(file.name);
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);

  // 拡張子に応じたアイコン
  const getFileIcon = (fileName: string) => {
    if (/\.(xls|xlsx)$/i.test(fileName)) return <FileSpreadsheet className="w-16 h-16 text-emerald-500" />;
    if (/\.(doc|docx)$/i.test(fileName)) return <FileText className="w-16 h-16 text-blue-500" />;
    if (/\.(zip|rar|7z|tar|gz)$/i.test(fileName)) return <FileCode className="w-16 h-16 text-amber-500" />;
    return <FileText className="w-16 h-16 text-slate-400" />;
  };

  const handleDownload = () => {
    if (!resolvedUrl) return;
    const link = document.createElement('a');
    link.href = resolvedUrl;
    link.download = file.name;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md overflow-y-auto"
      id="file-preview-backdrop"
    >
      <div
        onClick={e => e.stopPropagation()}
        className="bg-white rounded-2xl max-w-4xl w-full shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh]"
        id="file-preview-container"
      >
        {/* Header */}
        <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            {isImage ? (
              <FileImage className="w-5 h-5 text-indigo-500 shrink-0" />
            ) : (
              <FileText className="w-5 h-5 text-indigo-500 shrink-0" />
            )}
            <div className="min-w-0">
              <h3 className="text-sm font-bold text-slate-800 truncate" title={file.name}>
                {file.name}
              </h3>
              <p className="text-[10px] text-slate-400 font-semibold">{file.size}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {file.url && (
              <button
                onClick={handleDownload}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-xs rounded-xl border border-indigo-200 transition-colors"
                title="ダウンロード"
              >
                <Download className="w-3.5 h-3.5" />
                <span>ダウンロード</span>
              </button>
            )}
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-lg transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Preview Content */}
        <div className="flex-1 overflow-auto bg-slate-100 p-6 flex items-center justify-center min-h-[300px]">
          {isImage && resolvedUrl ? (
            <div className="max-w-full max-h-[70vh] flex items-center justify-center">
              <img
                src={resolvedUrl}
                alt={file.name}
                referrerPolicy="no-referrer"
                className="max-w-full max-h-[70vh] rounded-lg shadow-sm border border-slate-200/50 object-contain bg-white"
              />
            </div>
          ) : isPdf && resolvedUrl ? (
            <div className="w-full h-[70vh] bg-white rounded-lg overflow-hidden border border-slate-200">
              <iframe
                src={`${resolvedUrl}#toolbar=1`}
                className="w-full h-full border-0"
                title={file.name}
              />
            </div>
          ) : (
            <div className="text-center py-12 px-6">
              <div className="flex justify-center mb-4">
                {getFileIcon(file.name)}
              </div>
              <p className="text-sm font-bold text-slate-700 mb-1">
                このファイル形式のオンラインプレビューは対応していません。
              </p>
              <p className="text-xs text-slate-400 mb-4 font-medium">
                内容を確認するにはファイルをダウンロードしてください。
              </p>
              {file.url && (
                <button
                  onClick={handleDownload}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md transition-all inline-flex items-center gap-1.5"
                >
                  <Download className="w-4 h-4" />
                  ファイルをダウンロード
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
