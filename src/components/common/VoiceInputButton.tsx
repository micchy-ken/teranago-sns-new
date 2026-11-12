import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Mic, MicOff, AlertCircle } from 'lucide-react';

export interface VoiceInputButtonProps {
  /**
   * 音声認識で取得したテキストが確定した際に呼ばれるコールバック
   */
  onTranscript?: (transcript: string) => void;
  /**
   * 現在の入力値（自動追記を行う場合に指定）
   */
  currentValue?: string;
  /**
   * 自動追記後の全体文字列を受け取るコールバック
   */
  onValueChange?: (newValue: string) => void;
  /**
   * 追加のクラス名
   */
  className?: string;
  /**
   * ボタン固有のクラス名
   */
  buttonClassName?: string;
  /**
   * ボタンサイズ ('xs' | 'sm' | 'md' | 'icon')
   */
  size?: 'xs' | 'sm' | 'md' | 'icon';
  /**
   * 表示バリアント ('subtle' | 'outline' | 'pill' | 'ghost' | 'chat')
   */
  variant?: 'subtle' | 'outline' | 'pill' | 'ghost' | 'chat';
  /**
   * テキストラベルを表示するかどうか (例: "音声入力")
   */
  label?: string;
  /**
   * ツールチップタイトル
   */
  title?: string;
  /**
   * 無効化フラグ
   */
  disabled?: boolean;
  /**
   * 認識言語（デフォルト: ja-JP）
   */
  lang?: string;
}

/**
 * 日本語テキストの末尾に合わせて自然に結合するヘルパー関数
 */
function appendJapaneseText(current: string, addition: string): string {
  if (!current || !current.trim()) {
    return addition;
  }
  const trimmedCurrent = current.trimEnd();
  // すでに句読点や改行で終わっている場合はそのまま結合、それ以外は読点またはスペースで自然に連結
  const endsWithPunctuationOrNewline = /[。、！？\n]$/.test(trimmedCurrent);
  if (endsWithPunctuationOrNewline) {
    return `${trimmedCurrent} ${addition}`;
  }
  return `${trimmedCurrent}、${addition}`;
}

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  currentValue,
  onValueChange,
  className = '',
  buttonClassName = '',
  size = 'sm',
  variant = 'subtle',
  label,
  title,
  disabled = false,
  lang = 'ja-JP',
}) => {
  const [isListening, setIsListening] = useState(false);
  const [isSupported, setIsSupported] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // ブラウザの Web Speech API サポート確認
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsSupported(false);
      }
    }
  }, []);

  // アンマウント時に音声認識を安全に停止
  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
        recognitionRef.current = null;
      }
    };
  }, []);

  const handleSpeechResult = useCallback(
    (text: string) => {
      const cleanText = text.trim();
      if (!cleanText) return;

      if (onValueChange) {
        const nextValue = appendJapaneseText(currentValue || '', cleanText);
        onValueChange(nextValue);
      }
      if (onTranscript) {
        onTranscript(cleanText);
      }
    },
    [currentValue, onTranscript, onValueChange]
  );

  const startListening = () => {
    setErrorMessage(null);
    if (!isSupported) {
      setErrorMessage('お使いのブラウザは音声入力に対応していません (Chrome / Edge / Safari推奨)');
      return;
    }

    try {
      const SpeechRecognition =
        (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SpeechRecognition) {
        setIsSupported(false);
        return;
      }

      const recognition = new SpeechRecognition();
      recognition.lang = lang;
      recognition.continuous = true;
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let finalChunk = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            finalChunk += event.results[i][0].transcript;
          }
        }
        if (finalChunk.trim()) {
          handleSpeechResult(finalChunk);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('SpeechRecognition error:', event.error);
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setErrorMessage('マイクの使用が許可されていません（ブラウザの設定を確認してください）');
        } else if (event.error === 'no-speech') {
          // 音声が検出されなかった場合はエラー表示せず終了
        } else {
          setErrorMessage(`音声入力エラー: ${event.error}`);
        }
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Failed to start speech recognition:', err);
      setErrorMessage('音声入力の開始に失敗しました');
      setIsListening(false);
    }
  };

  const stopListening = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
      recognitionRef.current = null;
    }
    setIsListening(false);
  };

  const toggleListening = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  // スタイリング
  const getSizeStyles = () => {
    switch (size) {
      case 'xs':
        return 'h-6 px-1.5 text-[10px] gap-1';
      case 'md':
        return 'h-9 px-3 text-xs gap-1.5';
      case 'icon':
        return 'w-8 h-8 p-1.5';
      case 'sm':
      default:
        return 'h-7 px-2 text-[11px] gap-1';
    }
  };

  const getVariantStyles = () => {
    if (isListening) {
      return 'bg-rose-500 text-white border-rose-600 shadow-sm ring-2 ring-rose-300 animate-pulse';
    }
    switch (variant) {
      case 'outline':
        return 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50 hover:text-indigo-600 hover:border-indigo-300';
      case 'pill':
        return 'bg-slate-100 text-slate-700 hover:bg-indigo-50 hover:text-indigo-700 border-slate-200 rounded-full';
      case 'ghost':
        return 'bg-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-800 border-transparent';
      case 'chat':
        return 'bg-slate-100 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border border-slate-200/80 rounded-full';
      case 'subtle':
      default:
        return 'bg-slate-50 hover:bg-indigo-50 text-slate-600 hover:text-indigo-600 border-slate-200 hover:border-indigo-200';
    }
  };

  const defaultTitle = isListening
    ? '音声入力中（クリックで停止）'
    : isSupported
    ? (title || '音声入力（クリックして話しかけてください）')
    : 'お使いのブラウザは音声入力に対応していません (Chrome / Edge / Safari推奨)';

  return (
    <div className={`inline-flex items-center relative ${className}`}>
      <button
        type="button"
        onClick={toggleListening}
        disabled={disabled || !isSupported}
        title={defaultTitle}
        aria-label={defaultTitle}
        className={`relative inline-flex items-center justify-center font-bold rounded-lg border transition-all cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed select-none ${getSizeStyles()} ${getVariantStyles()} ${buttonClassName}`}
      >
        {isListening ? (
          <>
            <MicOff className="w-3.5 h-3.5 text-white animate-bounce shrink-0" />
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-white"></span>
            </span>
            <span className="text-[10px] font-bold text-white tracking-wide">
              {label ? '聞き取り中...' : '録音中'}
            </span>
          </>
        ) : (
          <>
            <Mic className="w-3.5 h-3.5 text-slate-500 group-hover:text-indigo-600 shrink-0" />
            {label && <span>{label}</span>}
          </>
        )}
      </button>

      {/* エラーメッセージ（数秒後に消去） */}
      {errorMessage && (
        <div
          onClick={() => setErrorMessage(null)}
          className="absolute left-0 bottom-full mb-1 z-50 bg-slate-900 text-white text-[10px] py-1 px-2 rounded-md shadow-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
        >
          <AlertCircle className="w-3 h-3 text-rose-400 shrink-0" />
          <span>{errorMessage}</span>
        </div>
      )}
    </div>
  );
};
