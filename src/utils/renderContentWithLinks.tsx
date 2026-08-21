import React from 'react';
import { ExternalLink } from 'lucide-react';
import { RichLinkCard } from '../components/common/RichLinkCard';

/**
 * Parses and renders text content with both:
 * 1. Rich Bookmark Cards: [card:https://example.com] or [bookmark:https://example.com]
 * 2. Clickable Standard Links: plain https:// or http:// URLs
 */
export function renderContentWithLinks(
  content: string | undefined | null,
  options: {
    className?: string;
    cardClassName?: string;
    showCardToggle?: boolean;
  } = {}
): React.ReactNode {
  if (!content) return null;

  const { cardClassName, showCardToggle = true } = options;

  // Split by [card:URL] or [bookmark:URL]
  const cardRegex = /\[(?:card|bookmark):\s*(https?:\/\/[^\s\]]+)\s*\]/gi;
  const segments: React.ReactNode[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = cardRegex.exec(content)) !== null) {
    const matchIndex = match.index;
    const matchedUrl = match[1];

    // Push text before this card
    if (matchIndex > lastIndex) {
      const textBefore = content.substring(lastIndex, matchIndex);
      segments.push(renderTextWithPlainLinks(textBefore, `text_${lastIndex}`));
    }

    // Push the RichLinkCard
    segments.push(
      <RichLinkCard
        key={`card_${matchIndex}_${matchedUrl}`}
        url={matchedUrl}
        className={cardClassName}
        showToggle={showCardToggle}
      />
    );

    lastIndex = matchIndex + match[0].length;
  }

  // Push remaining text
  if (lastIndex < content.length) {
    const textRemaining = content.substring(lastIndex);
    segments.push(renderTextWithPlainLinks(textRemaining, `text_${lastIndex}`));
  }

  return <>{segments}</>;
}

/**
 * Helper to render plain URLs as clickable links and preserve linebreaks.
 */
function renderTextWithPlainLinks(text: string, keyPrefix: string): React.ReactNode {
  // Regex to detect standard URLs
  const urlRegex = /(https?:\/\/[^\s<>"'()]+[^\s<>"'().,:;?!])/gi;
  const parts: React.ReactNode[] = [];
  let lastIdx = 0;
  let m: RegExpExecArray | null;

  while ((m = urlRegex.exec(text)) !== null) {
    const idx = m.index;
    const url = m[1];

    if (idx > lastIdx) {
      parts.push(text.substring(lastIdx, idx));
    }

    parts.push(
      <a
        key={`${keyPrefix}_link_${idx}`}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="text-indigo-600 hover:text-indigo-800 hover:underline break-all font-semibold inline-flex items-center gap-0.5"
        onClick={(e) => e.stopPropagation()}
      >
        <span>{url}</span>
        <ExternalLink className="w-3 h-3 inline-block shrink-0 opacity-70" />
      </a>
    );

    lastIdx = idx + url.length;
  }

  if (lastIdx < text.length) {
    parts.push(text.substring(lastIdx));
  }

  return <React.Fragment key={keyPrefix}>{parts}</React.Fragment>;
}
