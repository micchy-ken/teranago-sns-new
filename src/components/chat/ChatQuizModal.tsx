import React, { useState } from 'react';
import { X, Plus, Trash2, HelpCircle, CheckCircle2, AlertCircle, Loader2, Sparkles, MessageSquare } from 'lucide-react';
import { User, ChatMessage } from '../../types';
import { API_BASE_URL } from '../../config/api';

interface ChatQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  roomId: string;
  currentUser: User;
  onQuizCreated: (message: ChatMessage) => void;
}

export function ChatQuizModal({
  isOpen,
  onClose,
  roomId,
  currentUser,
  onQuizCreated,
}: ChatQuizModalProps) {
  const [question, setQuestion] = useState('');
  const [options, setOptions] = useState<string[]>(['', '']);
  const [correctIndex, setCorrectIndex] = useState<number>(0);
  const [isSurvey, setIsSurvey] = useState(false);
  const [explanation, setExplanation] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  // 選択肢の追加 (最大8個まで)
  const handleAddOption = () => {
    if (options.length >= 8) return;
    setOptions(prev => [...prev, '']);
  };

  // 選択肢の削除 (最小2個)
  const handleRemoveOption = (index: number) => {
    if (options.length <= 2) return;
    const newOptions = options.filter((_, idx) => idx !== index);
    setOptions(newOptions);
    if (correctIndex >= newOptions.length) {
      setCorrectIndex(Math.max(0, newOptions.length - 1));
    }
  };

  // 選択肢のテキスト変更
  const handleOptionChange = (index: number, text: string) => {
    const newOptions = [...options];
    newOptions[index] = text;
    setOptions(newOptions);
  };

  // 出題送信
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedQuestion = question.trim();
    if (!trimmedQuestion) {
      setErrorMessage('問題文を入力してください');
      return;
    }

    const trimmedOptions = options.map(o => o.trim()).filter(Boolean);
    if (trimmedOptions.length < 2) {
      setErrorMessage('少なくとも2つ以上の選択肢を入力してください');
      return;
    }

    if (!isSurvey && (correctIndex < 0 || correctIndex >= trimmedOptions.length)) {
      setErrorMessage('正解となる選択肢を1つ選択してください');
      return;
    }

    try {
      setIsSubmitting(true);
      const targetCorrectId = isSurvey ? null : `opt_${correctIndex + 1}`;

      const payload = {
        roomId,
        question: trimmedQuestion,
        options: trimmedOptions,
        correctOptionId: targetCorrectId,
        isSurvey,
        explanation: explanation.trim() || null,
        createdById: currentUser.id,
        createdByName: currentUser.name,
        senderAvatar: currentUser.avatarUrl || '',
        senderDepartment: currentUser.department || '',
      };

      const res = await fetch(`${API_BASE_URL}/chats/quizzes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '出題に失敗しました');
      }

      const data = await res.json();
      if (data.message) {
        onQuizCreated(data.message);
      }
      onClose();
    } catch (err: any) {
      console.error('[ChatQuizModal] 出題エラー:', err);
      setErrorMessage(err.message || '出題中にエラーが発生しました');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
      <div 
        className="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden border border-slate-200 flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-200"
        role="dialog"
        aria-modal="true"
      >
        {/* ヘッダー */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 bg-indigo-50 text-indigo-600 rounded-xl shadow-2xs">
              <HelpCircle className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 flex items-center gap-1.5">
                クイズ・アンケートを出題
                <span className="text-[10px] px-1.5 py-0.5 bg-indigo-100/80 text-indigo-700 font-extrabold rounded-md">
                  @quiz
                </span>
              </h3>
              <p className="text-[11px] text-slate-500 font-medium">
                タイムライン上で全員が即座に回答できるカードを作成します
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 rounded-xl transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* フォーム本文 */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {errorMessage && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-2 text-rose-700 text-xs font-bold">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* 出題形式切り替え (クイズ or 正解なしアンケート) */}
          <div className="bg-slate-100/70 p-1.5 rounded-xl border border-slate-200/80 flex gap-1">
            <button
              type="button"
              onClick={() => setIsSurvey(false)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                !isSurvey
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              クイズ形式（正解あり）
            </button>
            <button
              type="button"
              onClick={() => setIsSurvey(true)}
              className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                isSurvey
                  ? 'bg-white text-indigo-700 shadow-xs border border-slate-200/60'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
              アンケート形式（正解なし）
            </button>
          </div>

          {/* 問題文 */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              問題文 <span className="text-rose-500">*</span>
            </label>
            <textarea
              rows={3}
              value={question}
              onChange={e => setQuestion(e.target.value)}
              placeholder="例: 非常口誘導灯の法定点検周期はどれ？"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-xs sm:text-sm font-semibold text-slate-900 resize-none"
            />
          </div>

          {/* 選択肢リスト */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="block text-xs font-bold text-slate-700">
                選択肢（2〜8個） <span className="text-rose-500">*</span>
                {!isSurvey && (
                  <span className="text-[11px] font-normal text-indigo-600 ml-2">
                    ※ラジオボタンで正解を選択
                  </span>
                )}
              </label>
              <span className="text-[11px] text-slate-400 font-bold">
                {options.length} / 8件
              </span>
            </div>

            <div className="space-y-2">
              {options.map((opt, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  {!isSurvey && (
                    <label 
                      className={`flex items-center justify-center w-8 h-8 rounded-xl border cursor-pointer shrink-0 transition-colors ${
                        correctIndex === idx 
                          ? 'bg-emerald-50 border-emerald-500 text-emerald-600' 
                          : 'bg-slate-50 border-slate-200 text-slate-400 hover:border-slate-300'
                      }`}
                      title={correctIndex === idx ? 'この選択肢が正解です' : 'クリックして正解に指定'}
                    >
                      <input
                        type="radio"
                        name="correct_option"
                        checked={correctIndex === idx}
                        onChange={() => setCorrectIndex(idx)}
                        className="hidden"
                      />
                      {correctIndex === idx ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-600 fill-emerald-100" />
                      ) : (
                        <span className="text-xs font-bold">{idx + 1}</span>
                      )}
                    </label>
                  )}

                  <input
                    type="text"
                    value={opt}
                    onChange={e => handleOptionChange(idx, e.target.value)}
                    placeholder={`選択肢 ${idx + 1}`}
                    className="flex-1 px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-xs sm:text-sm font-semibold text-slate-900"
                  />

                  {options.length > 2 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(idx)}
                      className="p-2 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer shrink-0"
                      title="この選択肢を削除"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            {options.length < 8 && (
              <button
                type="button"
                onClick={handleAddOption}
                className="mt-2.5 w-full py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl border border-dashed border-slate-300 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                選択肢を追加
              </button>
            )}
          </div>

          {/* 解説・補足 (任意) */}
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1.5">
              解説・補足テキスト <span className="text-slate-400 font-normal">（任意・回答後に表示）</span>
            </label>
            <textarea
              rows={2}
              value={explanation}
              onChange={e => setExplanation(e.target.value)}
              placeholder="正解の根拠や補足事項（回答済みのユーザーのみに開示されます）"
              className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-xl focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 text-xs sm:text-sm font-semibold text-slate-900 resize-none"
            />
          </div>

          {/* フッター操作ボタン */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-100 shrink-0">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              キャンセル
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-5 py-2 text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-xs transition-colors cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  出題中...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" />
                  出題する
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
