import React from 'react';
import { CornerUpLeft } from 'lucide-react';
import { ParsedQuote, jumpToQuotedMessage } from './chatQuoteUtils';

interface ChatQuoteCardProps {
  quote: ParsedQuote;
  isMine: boolean;
}

export function ChatQuoteCard({ quote, isMine }: ChatQuoteCardProps) {
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (quote.id) {
      jumpToQuotedMessage(quote.id);
    }
  };

  return (
    <div
      onClick={handleClick}
      className={`mb-2 p-2 rounded-lg border-l-3 text-xs transition-all select-none ${
        quote.id ? 'cursor-pointer hover:opacity-90 active:scale-[0.99]' : ''
      } ${
        isMine
          ? 'bg-emerald-100/70 border-emerald-600 text-slate-800'
          : 'bg-slate-100 border-indigo-500 text-slate-800'
      }`}
      title={quote.id ? 'クリックして元のメッセージへジャンプ' : undefined}
    >
      <div className="flex items-center gap-1.5 font-bold text-[11px] text-slate-700 mb-0.5">
        <CornerUpLeft className="w-3 h-3 text-slate-500 shrink-0" />
        <span className="truncate">{quote.senderName || '引用メッセージ'}</span>
      </div>
      <div className="text-[11.5px] text-slate-600 line-clamp-2 leading-snug break-words">
        {quote.quoteText}
      </div>
    </div>
  );
}
