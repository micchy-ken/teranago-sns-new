import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Bookmark, Link as LinkIcon, X, Sparkles, Check } from 'lucide-react';

export interface UrlPastePromptState {
  isOpen: boolean;
  url: string;
  pastedText: string;
  startIndex: number;
  endIndex: number;
}

interface UrlPastePopupProps {
  prompt: UrlPastePromptState;
  onInsertCard: () => void;
  onKeepPlain: () => void;
  onClose: () => void;
  positionClass?: string;
}

export function UrlPastePopup({
  prompt,
  onInsertCard,
  onKeepPlain,
  onClose,
  positionClass = 'bottom-full mb-2 left-2',
}: UrlPastePopupProps) {
  useEffect(() => {
    if (prompt.isOpen) {
      const timer = setTimeout(() => {
        onClose();
      }, 8000);
      return () => clearTimeout(timer);
    }
  }, [prompt.isOpen, onClose]);

  if (!prompt.isOpen) return null;

  return (
    <div
      className={`absolute z-50 ${positionClass} animate-in fade-in-50 zoom-in-95 duration-150`}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-slate-900 text-white rounded-xl shadow-xl border border-slate-700/80 p-2.5 sm:p-3 flex flex-col gap-2 max-w-xs sm:max-w-sm backdrop-blur-md">
        <div className="flex items-center justify-between gap-2 border-b border-slate-800 pb-1.5">
          <span className="text-[11px] font-bold text-slate-300 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-indigo-400" />
            URLリンクの挿入形式を選択
          </span>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-200 p-0.5 rounded transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <p className="text-[10px] text-slate-400 truncate max-w-full font-mono bg-slate-800/80 px-2 py-1 rounded">
          {prompt.url}
        </p>

        <div className="grid grid-cols-2 gap-1.5 pt-0.5">
          <button
            type="button"
            onClick={() => {
              onInsertCard();
              onClose();
            }}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-bold rounded-lg transition-all shadow-sm active:scale-95"
            title="タイトルやサムネイル付きのリッチカードで表示します"
          >
            <Bookmark className="w-3.5 h-3.5 shrink-0 text-indigo-200" />
            <span>リッチカード</span>
          </button>

          <button
            type="button"
            onClick={() => {
              onKeepPlain();
              onClose();
            }}
            className="flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition-all active:scale-95"
            title="通常のクリッカブルリンクとして挿入します"
          >
            <LinkIcon className="w-3.5 h-3.5 shrink-0 text-slate-400" />
            <span>通常のリンク</span>
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * Custom hook to handle URL paste events and provide popup state & insertion helpers
 */
export function useUrlPasteHandler(
  value: string,
  setValue: (val: string) => void,
  inputRef?: React.RefObject<HTMLInputElement | HTMLTextAreaElement | null>
) {
  const [pastePrompt, setPastePrompt] = useState<UrlPastePromptState>({
    isOpen: false,
    url: '',
    pastedText: '',
    startIndex: 0,
    endIndex: 0,
  });

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const pasted = e.clipboardData.getData('text');
      if (!pasted) return;

      // Extract url if present
      const match = pasted.match(/https?:\/\/[^\s<>"'()]+/i);
      if (match) {
        const url = match[0];
        const el = e.currentTarget;
        const start = el.selectionStart ?? value.length;
        const end = el.selectionEnd ?? value.length;

        // Default behavior allows normal paste of text
        // We set up prompt to convert to card if user desires
        setPastePrompt({
          isOpen: true,
          url,
          pastedText: pasted,
          startIndex: start,
          endIndex: start + pasted.length,
        });
      }
    },
    [value]
  );

  const handleInsertCard = useCallback(() => {
    if (!pastePrompt.url) return;
    const cardText = `[card:${pastePrompt.url}]`;

    // If the url was already pasted into the text around startIndex
    if (value.includes(pastePrompt.url)) {
      // Replace the pasted url with [card:url]
      const newValue = value.replace(pastePrompt.url, cardText);
      setValue(newValue);
    } else {
      // Append or insert
      const before = value.slice(0, pastePrompt.startIndex);
      const after = value.slice(pastePrompt.startIndex);
      setValue(`${before}${cardText}${after}`);
    }
    setPastePrompt((prev) => ({ ...prev, isOpen: false }));
  }, [pastePrompt, value, setValue]);

  const handleKeepPlain = useCallback(() => {
    setPastePrompt((prev) => ({ ...prev, isOpen: false }));
  }, []);

  const closePrompt = useCallback(() => {
    setPastePrompt((prev) => ({ ...prev, isOpen: false }));
  }, []);

  return {
    pastePrompt,
    handlePaste,
    handleInsertCard,
    handleKeepPlain,
    closePrompt,
  };
}
