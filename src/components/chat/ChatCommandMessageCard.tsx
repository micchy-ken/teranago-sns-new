import React, { useState, useMemo } from 'react';
import {
  Eye,
  Megaphone,
  AlertTriangle,
  CheckSquare,
  Square,
  ChevronDown,
  ChevronUp,
  Dices,
  Calculator,
  Lock,
  Unlock,
  Copy,
  Check,
  Info
} from 'lucide-react';
import { ChatMessage } from '../../types';
import { renderContentWithLinks } from '../../utils/renderContentWithLinks';

export type SupportedChatCommand =
  | 'secret'
  | 'shout'
  | 'warn'
  | 'alert'
  | 'todo'
  | 'check'
  | 'fold'
  | 'more'
  | 'dice'
  | 'random'
  | 'calc';

export interface ParsedChatCommand {
  command: SupportedChatCommand;
  body: string;
}

/**
 * チャット本文の先頭にある @コマンド をパースする判定関数
 */
export function parseChatCommand(content: string | undefined | null): ParsedChatCommand | null {
  if (!content) return null;
  const trimmed = content.trim();
  const match = trimmed.match(/^@([a-zA-Z0-9_-]+)(?:[\s\n]+([\s\S]*))?$/);
  if (!match) return null;

  const rawCmd = match[1].toLowerCase();
  const supported: Record<string, SupportedChatCommand> = {
    secret: 'secret',
    shout: 'shout',
    warn: 'warn',
    alert: 'warn',
    todo: 'todo',
    check: 'todo',
    fold: 'fold',
    more: 'fold',
    dice: 'dice',
    random: 'dice',
    calc: 'calc',
  };

  const command = supported[rawCmd];
  if (!command) return null;

  return {
    command,
    body: (match[2] || '').trim(),
  };
}

interface ChatCommandMessageCardProps {
  msg: ChatMessage;
  command: SupportedChatCommand;
  body: string;
  isMine: boolean;
}

export function ChatCommandMessageCard({
  msg,
  command,
  body,
  isMine,
}: ChatCommandMessageCardProps) {
  switch (command) {
    case 'secret':
      return <SecretCard msg={msg} body={body} isMine={isMine} />;
    case 'shout':
      return <ShoutCard msg={msg} body={body} isMine={isMine} />;
    case 'warn':
      return <WarnCard msg={msg} body={body} isMine={isMine} />;
    case 'todo':
      return <TodoCard msg={msg} body={body} isMine={isMine} />;
    case 'fold':
      return <FoldCard msg={msg} body={body} isMine={isMine} />;
    case 'dice':
      return <DiceCard msg={msg} body={body} isMine={isMine} />;
    case 'calc':
      return <CalcCard msg={msg} body={body} isMine={isMine} />;
    default:
      return null;
  }
}

/**
 * 元文章の長さ・改行に合わせて「ゴニョゴニョ」伏字テキストを生成するヘルパー
 */
function generateObfuscatedText(text: string, seed: string): string {
  if (!text) return '';
  const glyphs = ['●', '■', '▲', '◆', '●', '■', '※', '●'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = ((hash << 5) - hash) + seed.charCodeAt(i);
    hash |= 0;
  }

  let result = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (ch === '\n' || ch === '\r') {
      result += ch;
    } else if (/\s/.test(ch)) {
      result += ch;
    } else {
      const idx = Math.abs(hash + i * 17) % glyphs.length;
      result += glyphs[idx];
    }
  }
  return result;
}

// -------------------------------------------------------------
// 1. @secret (点線フキダシ・ゴニョゴニョ伏字・タップで開示)
// -------------------------------------------------------------
function SecretCard({ msg, body, isMine }: { msg: ChatMessage; body: string; isMine: boolean }) {
  const [isRevealed, setIsRevealed] = useState(false);
  const obfuscated = useMemo(() => generateObfuscatedText(body, msg.id || 'secret'), [body, msg.id]);

  if (!body) {
    return (
      <div className="p-3 border-2 border-dashed border-purple-200 bg-purple-50/50 rounded-2xl text-xs text-purple-800 flex items-center gap-2">
        <Lock className="w-4 h-4 text-purple-600 shrink-0" />
        <span>@secret に続けてメッセージを入力してください</span>
      </div>
    );
  }

  return (
    <div
      onClick={() => setIsRevealed(!isRevealed)}
      className={`cursor-pointer select-none rounded-2xl border-2 border-dashed transition-all p-3 sm:p-3.5 max-w-md w-full relative ${
        isMine
          ? isRevealed
            ? 'border-emerald-300 bg-[#eefae8] text-slate-900'
            : 'border-emerald-300/80 bg-[#eefae8]/70 text-emerald-850 hover:bg-[#eefae8]'
          : isRevealed
          ? 'border-slate-300 bg-white text-slate-800'
          : 'border-slate-300 bg-slate-50/80 text-slate-500 hover:bg-slate-100/80'
      }`}
      title={isRevealed ? 'タップして隠す' : 'タップして開示'}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words tracking-wider">
          {isRevealed ? (
            <span className="tracking-normal">{renderContentWithLinks(body)}</span>
          ) : (
            <span className="font-mono opacity-75 select-none">{obfuscated}</span>
          )}
        </div>
        <div className="shrink-0 ml-1.5 mt-0.5 text-slate-400">
          {isRevealed ? <Unlock className="w-3.5 h-3.5 text-slate-500" /> : <Lock className="w-3.5 h-3.5 text-slate-500" />}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 2. @shout (メガホンアイコンのみ・強調フレーム)
// -------------------------------------------------------------
function ShoutCard({ body }: { msg: ChatMessage; body: string; isMine: boolean }) {
  if (!body) {
    return (
      <div className="p-3 border-2 border-indigo-200 bg-indigo-50/50 rounded-2xl text-xs text-indigo-800 flex items-center gap-2">
        <Megaphone className="w-4 h-4 text-indigo-600 shrink-0" />
        <span>@shout に続けてメッセージを入力してください</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-indigo-400 bg-gradient-to-r from-indigo-50/90 via-sky-50/50 to-indigo-50/90 p-3 sm:p-3.5 max-w-md w-full shadow-xs flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
        <Megaphone className="w-4 h-4" />
      </div>
      <div className="flex-1 text-sm sm:text-base font-bold text-slate-900 leading-relaxed whitespace-pre-wrap break-words">
        {renderContentWithLinks(body)}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 3. @warn / @alert (警告アイコンのみ・注意フレーム)
// -------------------------------------------------------------
function WarnCard({ body }: { msg: ChatMessage; body: string; isMine: boolean }) {
  if (!body) {
    return (
      <div className="p-3 border-2 border-amber-200 bg-amber-50/50 rounded-2xl text-xs text-amber-800 flex items-center gap-2">
        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
        <span>@warn に続けてメッセージを入力してください</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border-2 border-amber-400 bg-amber-50/95 p-3 sm:p-3.5 max-w-md w-full shadow-xs flex items-start gap-2.5">
      <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center shrink-0 shadow-2xs mt-0.5">
        <AlertTriangle className="w-4 h-4" />
      </div>
      <div className="flex-1 text-xs sm:text-sm font-semibold text-amber-950 leading-relaxed whitespace-pre-wrap break-words">
        {renderContentWithLinks(body)}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 4. @todo / @check (チェックアイコン・リスト)
// -------------------------------------------------------------
function TodoCard({ msg, body, isMine }: { msg: ChatMessage; body: string; isMine: boolean }) {
  const items = useMemo(() => {
    if (!body) return [];
    return body
      .split(/[\n/、,]+/)
      .map((item) => item.trim().replace(/^[-*・■□1-9]\.?\s*/, ''))
      .filter((item) => item.length > 0);
  }, [body]);

  const storageKey = `chat_todo_${msg.id}`;
  const [checkedMap, setCheckedMap] = useState<Record<number, boolean>>(() => {
    try {
      const saved = localStorage.getItem(storageKey);
      return saved ? JSON.parse(saved) : {};
    } catch {
      return {};
    }
  });

  const toggleItem = (idx: number) => {
    setCheckedMap((prev) => {
      const next = { ...prev, [idx]: !prev[idx] };
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore storage errors
      }
      return next;
    });
  };

  const completedCount = items.filter((_, idx) => checkedMap[idx]).length;

  if (items.length === 0) {
    return (
      <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-2xl text-xs text-emerald-900 flex items-center gap-2">
        <CheckSquare className="w-4 h-4 text-emerald-600 shrink-0" />
        <span>@todo に続けて項目を改行または「/」で入力してください</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border max-w-md w-full overflow-hidden shadow-2xs ${
        isMine ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="px-3 py-1.5 border-b border-emerald-100 bg-emerald-100/60 flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-bold text-emerald-900">
          <CheckSquare className="w-4 h-4 text-emerald-600" />
          <span>リスト</span>
        </div>
        <div className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-white text-emerald-700 border border-emerald-200">
          {completedCount} / {items.length}
        </div>
      </div>

      <div className="p-2.5 space-y-1">
        {items.map((item, idx) => {
          const isDone = !!checkedMap[idx];
          return (
            <div
              key={idx}
              onClick={() => toggleItem(idx)}
              className={`flex items-start gap-2 p-1.5 rounded-xl transition-all cursor-pointer ${
                isDone
                  ? 'bg-emerald-50/60 text-slate-400 line-through'
                  : 'hover:bg-slate-50 text-slate-800'
              }`}
            >
              <button
                type="button"
                className="mt-0.5 shrink-0 text-emerald-600 transition-colors"
              >
                {isDone ? (
                  <CheckSquare className="w-4 h-4 text-emerald-600" />
                ) : (
                  <Square className="w-4 h-4 text-slate-400 hover:text-emerald-500" />
                )}
              </button>
              <span className="text-xs sm:text-sm leading-snug break-words">
                {item}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 5. @fold / @more (折りたたみ・アイコンと続きを読むのみ)
// -------------------------------------------------------------
function FoldCard({ body, isMine }: { msg: ChatMessage; body: string; isMine: boolean }) {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!body) {
    return (
      <div className="p-3 bg-slate-100 border border-slate-200 rounded-2xl text-xs text-slate-700 flex items-center gap-2">
        <ChevronDown className="w-4 h-4 text-slate-600 shrink-0" />
        <span>@fold に続けて長文メッセージを入力してください</span>
      </div>
    );
  }

  const lines = body.split('\n');
  const isLong = lines.length > 3 || body.length > 120;
  const previewText = lines.slice(0, 3).join('\n');

  return (
    <div
      className={`rounded-2xl border max-w-md w-full overflow-hidden shadow-2xs ${
        isMine ? 'border-indigo-100 bg-[#eef7ee]' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="p-3 sm:p-3.5 text-xs sm:text-sm leading-relaxed whitespace-pre-wrap break-words text-slate-800">
        {renderContentWithLinks(isExpanded || !isLong ? body : previewText)}
      </div>

      {isLong && (
        <div className="px-3 pb-2.5 pt-0 flex items-center justify-between">
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className="py-1 px-2.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer"
          >
            {isExpanded ? (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>閉じる</span>
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>続きを読む</span>
              </>
            )}
          </button>
          <span className="text-[10px] text-slate-400 font-mono">全{body.length}文字</span>
        </div>
      )}
    </div>
  );
}

// -------------------------------------------------------------
// 6. @dice / @random (ダイスアイコンのみ・結果表示)
// -------------------------------------------------------------
function DiceCard({ msg, body, isMine }: { msg: ChatMessage; body: string; isMine: boolean }) {
  const result = useMemo(() => {
    let hash = 2166136261;
    const combined = (msg.id || '') + ':' + body.trim();
    for (let i = 0; i < combined.length; i++) {
      hash ^= combined.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const uHash = Math.abs(hash >>> 0);

    const trimmed = body.trim();

    let candidates: string[] = [];
    if (trimmed.includes(',') || trimmed.includes('、') || trimmed.includes('/') || trimmed.includes('\n')) {
      candidates = trimmed.split(/[,、/\n]+/).map((s) => s.trim()).filter(Boolean);
    } else if (trimmed.includes(' ') && !/^\d+$/.test(trimmed)) {
      candidates = trimmed.split(/\s+/).map((s) => s.trim()).filter(Boolean);
    }

    if (candidates.length > 1) {
      const idx = uHash % candidates.length;
      return {
        type: 'choice' as const,
        value: candidates[idx],
        detail: candidates.join(' / '),
      };
    }

    const rangeMatch = trimmed.match(/^(?:1?d)?(\d+)$/i);
    if (rangeMatch) {
      const max = parseInt(rangeMatch[1], 10);
      if (max > 1) {
        const val = (uHash % max) + 1;
        return {
          type: 'range' as const,
          value: `${val}`,
          detail: `1 〜 ${max}`,
        };
      }
    }

    const val = (uHash % 6) + 1;
    return {
      type: 'standard' as const,
      value: `${val}`,
      detail: '1 〜 6',
    };
  }, [msg.id, body]);

  return (
    <div
      className={`rounded-2xl border max-w-sm w-full overflow-hidden shadow-2xs ${
        isMine ? 'border-sky-200 bg-sky-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="px-3.5 py-1.5 border-b border-sky-100 bg-sky-100/60 flex items-center justify-between text-xs font-bold text-sky-900">
        <div className="flex items-center gap-1.5">
          <Dices className="w-4 h-4 text-sky-600" />
          <span>サイコロ・ランダム抽選</span>
        </div>
        {result.detail && (
          <span className="text-[10px] text-sky-700/80 font-normal">
            {result.detail}
          </span>
        )}
      </div>

      <div className="p-3 flex items-center justify-center">
        <div className="px-4 py-1.5 rounded-xl bg-white border border-sky-300 shadow-2xs">
          {result.type === 'choice' ? (
            <span className="text-sm sm:text-base font-black text-sky-800">
              🎉 【{result.value}】
            </span>
          ) : (
            <span className="text-xl sm:text-2xl font-black text-sky-700 font-mono">
              🎲 {result.value}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 7. @calc (計算機アイコンのみ・結果表示)
// -------------------------------------------------------------
function CalcCard({ body, isMine }: { msg: ChatMessage; body: string; isMine: boolean }) {
  const [copied, setCopied] = useState(false);

  const calcResult = useMemo(() => {
    if (!body) return null;
    return safeEvaluateMath(body);
  }, [body]);

  const isSuccess = calcResult?.ok === true;
  const calcValue = isSuccess ? (calcResult as { ok: true; value: number }).value : null;
  const calcError = calcResult && !calcResult.ok ? (calcResult as { ok: false; error: string }).error : null;

  const handleCopy = (text: string) => {
    navigator.clipboard?.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!body) {
    return (
      <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl text-xs text-blue-900 flex items-center gap-2">
        <Calculator className="w-4 h-4 text-blue-600 shrink-0" />
        <span>@calc に続けて計算式を入力してください</span>
      </div>
    );
  }

  return (
    <div
      className={`rounded-2xl border max-w-sm w-full overflow-hidden shadow-2xs ${
        isMine ? 'border-blue-200 bg-blue-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <div className="p-3 flex items-center justify-between gap-2.5">
        <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
          <Calculator className="w-4 h-4" />
        </div>

        <div className="flex-1 flex flex-col items-end">
          <div className="text-[11px] text-slate-400 font-mono break-all text-right">
            {body}
          </div>
          {isSuccess && calcValue !== null ? (
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-base sm:text-lg font-black text-blue-800 font-mono">
                = {calcValue.toLocaleString('ja-JP', { maximumFractionDigits: 6 })}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(`${calcValue}`)}
                className="p-1 text-slate-400 hover:text-blue-600 rounded transition-colors cursor-pointer"
                title="結果をコピー"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
              </button>
            </div>
          ) : calcError ? (
            <span className="text-xs text-rose-600 font-medium mt-0.5">
              {calcError}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}

// -------------------------------------------------------------
// 安全な数式評価パーサー (eval不要・四則演算・括弧対応)
// -------------------------------------------------------------
function safeEvaluateMath(expr: string): { ok: true; value: number } | { ok: false; error: string } {
  try {
    if (!/^[\d\s+\-*/%^().,]+$/.test(expr)) {
      return { ok: false, error: '計算式に使用できない文字が含まれています' };
    }

    const clean = expr.replace(/,/g, '');
    const tokens: string[] = [];
    let i = 0;
    while (i < clean.length) {
      const ch = clean[i];
      if (/\s/.test(ch)) {
        i++;
        continue;
      }
      if (/[\d.]/.test(ch)) {
        let numStr = '';
        while (i < clean.length && /[\d.]/.test(clean[i])) {
          numStr += clean[i];
          i++;
        }
        tokens.push(numStr);
        continue;
      }
      if (['+', '-', '*', '/', '%', '^', '(', ')'].includes(ch)) {
        tokens.push(ch);
        i++;
        continue;
      }
      return { ok: false, error: `未対応の演算子: ${ch}` };
    }

    if (tokens.length === 0) {
      return { ok: false, error: '数式が空です' };
    }

    let pos = 0;
    function peek(): string | undefined {
      return tokens[pos];
    }
    function consume(expected?: string): string {
      const tok = tokens[pos];
      if (expected && tok !== expected) {
        throw new Error(`構文エラー: 期待された「${expected}」、実際「${tok}」`);
      }
      pos++;
      return tok;
    }

    function parseFactor(): number {
      const tok = peek();
      if (!tok) throw new Error('数式の途中で終了しました');
      if (tok === '+') {
        consume('+');
        return parseFactor();
      }
      if (tok === '-') {
        consume('-');
        return -parseFactor();
      }
      if (tok === '(') {
        consume('(');
        const val = parseExpr();
        consume(')');
        return val;
      }
      if (/^\d+(?:\.\d+)?$/.test(tok)) {
        consume();
        return parseFloat(tok);
      }
      throw new Error(`不正なトークン: ${tok}`);
    }

    function parsePower(): number {
      let left = parseFactor();
      while (peek() === '^') {
        consume('^');
        const right = parseFactor();
        left = Math.pow(left, right);
      }
      return left;
    }

    function parseTerm(): number {
      let left = parsePower();
      while (['*', '/', '%'].includes(peek() || '')) {
        const op = consume();
        const right = parsePower();
        if (op === '*') left *= right;
        else if (op === '/') {
          if (right === 0) throw new Error('0で割ることはできません');
          left /= right;
        } else if (op === '%') {
          left %= right;
        }
      }
      return left;
    }

    function parseExpr(): number {
      let left = parseTerm();
      while (['+', '-'].includes(peek() || '')) {
        const op = consume();
        const right = parseTerm();
        if (op === '+') left += right;
        else if (op === '-') left -= right;
      }
      return left;
    }

    const result = parseExpr();
    if (pos < tokens.length) {
      return { ok: false, error: '数式の末尾に未処理の文字があります' };
    }
    if (!Number.isFinite(result) || Number.isNaN(result)) {
      return { ok: false, error: '計算結果が有効な数値ではありません' };
    }

    return { ok: true, value: result };
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : '計算エラー';
    return { ok: false, error: msg };
  }
}
