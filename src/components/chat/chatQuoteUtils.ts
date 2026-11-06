/**
 * チャット引用返信（Quote Reply）ユーティリティ
 */

export interface ParsedQuote {
  id?: string;
  senderName?: string;
  quoteText: string;
}

export interface ParsedMessageWithQuote {
  quote: ParsedQuote | null;
  actualContent: string;
}

const QUOTE_TAG_REGEX = /^\[quote(?:\s+id="([^"]*)")?(?:\s+name="([^"]*)")?\]([\s\S]*?)\[\/quote\](?:\n|\r\n)?([\s\S]*)$/;

/**
 * 本文から [quote ...]...[/quote] を検知・分離パースする
 */
export function parseMessageQuote(content: string | undefined | null): ParsedMessageWithQuote {
  if (!content) {
    return { quote: null, actualContent: '' };
  }

  const match = content.match(QUOTE_TAG_REGEX);
  if (match) {
    return {
      quote: {
        id: match[1] || undefined,
        senderName: match[2] || undefined,
        quoteText: (match[3] || '').trim(),
      },
      actualContent: match[4] || '',
    };
  }

  // Markdown引用 (> 本文) の簡易サポート
  if (content.startsWith('> ')) {
    const lines = content.split('\n');
    const quoteLines: string[] = [];
    let restIndex = 0;

    for (let i = 0; i < lines.length; i++) {
      if (lines[i].startsWith('> ')) {
        quoteLines.push(lines[i].slice(2));
      } else {
        restIndex = i;
        break;
      }
    }

    if (quoteLines.length > 0 && restIndex > 0) {
      return {
        quote: {
          quoteText: quoteLines.join('\n').trim(),
        },
        actualContent: lines.slice(restIndex).join('\n').trim(),
      };
    }
  }

  return { quote: null, actualContent: content };
}

/**
 * 元メッセージから引用用スニペット文字列を抽出・整形する
 */
export function extractQuoteSnippet(
  input: string | { content?: string; type?: string } | undefined | null,
  fallbackType?: string
): string {
  const content = typeof input === 'string' ? input : input?.content;
  const type = typeof input === 'string' ? fallbackType : (input?.type || fallbackType);

  if (type === 'quiz') return '【クイズ・アンケート出題】';
  if (type === 'stamp') return '【スタンプ】';
  if (type === 'image') return '【写真】';
  if (type === 'file') return '【添付ファイル】';
  if (!content) return '';

  // 既に引用が含まれる場合は二重引用を防止
  const clean = content.replace(QUOTE_TAG_REGEX, '$4').trim();
  if (clean.length > 120) {
    return clean.slice(0, 120) + '…';
  }
  return clean;
}

/**
 * 引用先メッセージへのスムーススクロール＆ハイライト
 */
export function jumpToQuotedMessage(messageId?: string) {
  if (!messageId) return;
  const target = document.getElementById(`chat-msg-${messageId}`);
  if (target) {
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    target.classList.add('bg-indigo-50/80', 'transition-colors', 'duration-500');
    setTimeout(() => {
      target.classList.remove('bg-indigo-50/80');
    }, 1500);
  }
}
