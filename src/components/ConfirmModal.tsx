import React from 'react';
import { AlertTriangle, Info, CheckCircle2, X } from 'lucide-react';

export interface ConfirmModalState {
  isOpen: boolean;
  title: string;
  message: string;
  type?: 'danger' | 'warning' | 'info' | 'success';
  confirmText?: string;
  cancelText?: string; // cancelTextが未指定の場合は「閉じる/OK」単一ボタンのアラート形式
  onConfirm?: () => void;
  onCancel?: () => void;
}

interface ConfirmModalProps extends ConfirmModalState {
  onClose: () => void;
}

export function ConfirmModal({
  isOpen,
  title,
  message,
  type = 'warning',
  confirmText = 'OK',
  cancelText,
  onConfirm,
  onCancel,
  onClose,
}: ConfirmModalProps) {
  if (!isOpen) return null;

  const handleConfirm = () => {
    if (onConfirm) onConfirm();
    onClose();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    onClose();
  };

  const icons = {
    danger: <AlertTriangle className="w-6 h-6 text-rose-600 shrink-0" />,
    warning: <AlertTriangle className="w-6 h-6 text-amber-600 shrink-0" />,
    info: <Info className="w-6 h-6 text-sky-600 shrink-0" />,
    success: <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0" />,
  };

  const bgColors = {
    danger: 'bg-rose-50 border-rose-100',
    warning: 'bg-amber-50 border-amber-100',
    info: 'bg-sky-50 border-sky-100',
    success: 'bg-emerald-50 border-emerald-100',
  };

  const buttonColors = {
    danger: 'bg-rose-600 hover:bg-rose-700 text-white focus:ring-rose-500',
    warning: 'bg-amber-600 hover:bg-amber-700 text-white focus:ring-amber-500',
    info: 'bg-sky-600 hover:bg-sky-700 text-white focus:ring-sky-500',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-500',
  };

  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
      onMouseUp={(e) => e.stopPropagation()}
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div 
        className="bg-white rounded-xl shadow-xl border border-slate-200 max-w-md w-full overflow-hidden transform transition-all duration-200 scale-100"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
        onMouseUp={(e) => e.stopPropagation()}
      >
        <div className="p-6">
          <div className="flex items-start gap-4">
            <div className={`p-3 rounded-xl border ${bgColors[type]}`}>
              {icons[type]}
            </div>
            <div className="flex-1">
              <h3 className="text-lg font-bold text-slate-800 flex items-center justify-between">
                {title}
                <button
                  onClick={handleCancel}
                  className="text-slate-400 hover:text-slate-600 rounded-lg p-1 transition"
                >
                  <X className="w-5 h-5" />
                </button>
              </h3>
              <p className="mt-2 text-sm text-slate-600 whitespace-pre-wrap leading-relaxed">
                {message}
              </p>
            </div>
          </div>
        </div>

        <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-3">
          {cancelText && (
            <button
              type="button"
              onClick={handleCancel}
              className="px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-200/60 rounded-lg transition"
            >
              {cancelText}
            </button>
          )}
          <button
            type="button"
            onClick={handleConfirm}
            className={`px-4 py-2 text-sm font-medium rounded-lg shadow-sm transition focus:outline-none focus:ring-2 focus:ring-offset-1 ${buttonColors[type]}`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}
