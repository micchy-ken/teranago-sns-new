import React, { useState, useEffect } from 'react';
import { 
  HelpCircle, 
  CheckCircle2, 
  XCircle, 
  MessageSquare, 
  Users, 
  Loader2, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Sparkles,
  Info
} from 'lucide-react';
import { ChatMessage, User, ChatRoom } from '../../types';
import { ChatQuizData, ChatQuizAggregatedOption } from '../../types/chatQuiz';
import { API_BASE_URL } from '../../config/api';
import { getAvatarUrl, handleAvatarError } from '../../utils/avatar';

interface ChatQuizCardProps {
  msg: ChatMessage;
  currentUser: User;
  activeRoom: ChatRoom;
  onAnswerUpdated?: (quizData: ChatQuizData) => void;
}

export function ChatQuizCard({
  msg,
  currentUser,
  activeRoom,
  onAnswerUpdated,
}: ChatQuizCardProps) {
  const [quiz, setQuiz] = useState<ChatQuizData | null>(msg.quiz || null);
  const [loading, setLoading] = useState<boolean>(!msg.quiz);
  const [submittingOptionId, setSubmittingOptionId] = useState<string | null>(null);
  const [showVoters, setShowVoters] = useState<Record<string, boolean>>({});
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const quizId = msg.quizId || msg.quiz?.id;

  // 最新のクイズ状態（回答状況・集計結果）を取得
  const fetchQuizData = async () => {
    if (!quizId) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE_URL}/chats/quizzes/${quizId}?userId=${encodeURIComponent(currentUser.id)}`);
      if (res.ok) {
        const data: ChatQuizData = await res.json();
        setQuiz(data);
        onAnswerUpdated?.(data);
      }
    } catch (err) {
      console.warn('[ChatQuizCard] クイズ取得エラー:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchQuizData();
  }, [quizId, currentUser.id]);

  // 選択肢投票ハンドラー
  const handleVote = async (optionId: string) => {
    if (!quiz || quiz.hasAnswered || submittingOptionId) return;

    try {
      setSubmittingOptionId(optionId);
      const res = await fetch(`${API_BASE_URL}/chats/quizzes/${quiz.id}/answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedOptionId: optionId,
          userId: currentUser.id,
          userName: currentUser.name,
          userAvatar: currentUser.avatarUrl || '',
          userDepartment: currentUser.department || '',
        }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || '回答の送信に失敗しました');
      }

      const data = await res.json();
      if (data.quiz) {
        setQuiz(data.quiz);
        onAnswerUpdated?.(data.quiz);
      }

      if (!quiz.isSurvey) {
        setToastMessage(data.isCorrect ? '正解です！お見事！🎉' : '残念、不正解です...！');
      } else {
        setToastMessage('アンケートにご回答いただきありがとうございます！');
      }
      setTimeout(() => setToastMessage(null), 3000);
    } catch (err: any) {
      console.error('[ChatQuizCard] 回答エラー:', err);
      alert(err.message || '回答に失敗しました');
    } finally {
      setSubmittingOptionId(null);
    }
  };

  if (loading && !quiz) {
    return (
      <div className="p-4 bg-white rounded-2xl border border-slate-200 shadow-sm w-72 sm:w-80 flex items-center justify-center gap-2 text-xs text-slate-500">
        <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
        <span>クイズを読み込み中...</span>
      </div>
    );
  }

  if (!quiz) {
    return (
      <div className="p-3 bg-white rounded-2xl border border-slate-200 text-xs text-slate-500">
        クイズデータを読み込めませんでした
      </div>
    );
  }

  const isAuthor = String(quiz.createdById) === String(currentUser.id);
  const showResults = quiz.hasAnswered || isAuthor;

  return (
    <div className="bg-white rounded-2xl border-2 border-indigo-100/90 shadow-md w-72 sm:w-96 max-w-[88vw] overflow-hidden select-none transition-all">
      {/* カードヘッダー */}
      <div className="px-4 py-3 bg-gradient-to-r from-indigo-50/90 via-indigo-50/40 to-white border-b border-indigo-100 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="p-1.5 bg-indigo-600 text-white rounded-lg shadow-2xs shrink-0">
            {quiz.isSurvey ? (
              <MessageSquare className="w-3.5 h-3.5" />
            ) : (
              <HelpCircle className="w-3.5 h-3.5" />
            )}
          </div>
          <div className="min-w-0">
            <span className="text-xs font-black text-indigo-950 flex items-center gap-1.5 truncate">
              {quiz.isSurvey ? 'アンケート出題' : 'クイズ出題'}
              <span className={`text-[10px] px-1.5 py-0.2 font-extrabold rounded-md ${
                quiz.isSurvey 
                  ? 'bg-amber-100 text-amber-800 border border-amber-300' 
                  : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
              }`}>
                {quiz.isSurvey ? '正解なし' : '正解判定あり'}
              </span>
            </span>
            <span className="text-[10px] text-slate-400 font-medium block truncate">
              出題者: {quiz.createdByName}
            </span>
          </div>
        </div>

        <div className="text-right shrink-0">
          <span className="text-[10px] font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full flex items-center gap-1">
            <Users className="w-3 h-3 text-slate-400" />
            <span>{quiz.totalAnswers}名回答</span>
          </span>
        </div>
      </div>

      {/* 問題文 */}
      <div className="p-4 bg-white">
        <h4 className="text-sm font-bold text-slate-900 leading-snug whitespace-pre-wrap">
          {quiz.question}
        </h4>

        {/* トースト通知 */}
        {toastMessage && (
          <div className="mt-3 p-2 bg-indigo-600 text-white text-xs font-bold rounded-xl text-center shadow-xs animate-in fade-in duration-200">
            {toastMessage}
          </div>
        )}

        {/* 選択肢リスト */}
        <div className="mt-3.5 space-y-2">
          {quiz.options.map((option, idx) => {
            const result = quiz.results?.find(r => r.id === option.id);
            const count = result?.count || 0;
            const percent = result?.percent || 0;
            const isMyPick = quiz.myAnswerOptionId === option.id;
            const isCorrect = !quiz.isSurvey && quiz.correctOptionId === option.id;
            const isWrong = !quiz.isSurvey && isMyPick && !isCorrect;

            if (!showResults) {
              // --- 未回答時の選択肢ボタン ---
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={Boolean(submittingOptionId)}
                  onClick={() => handleVote(option.id)}
                  className="w-full text-left p-3 rounded-xl border-2 border-slate-200 hover:border-indigo-500 hover:bg-indigo-50/50 bg-slate-50/60 active:scale-[0.99] transition-all flex items-center justify-between gap-2.5 cursor-pointer disabled:opacity-50 group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-white border border-slate-300 text-slate-700 text-xs font-bold flex items-center justify-center shrink-0 group-hover:border-indigo-500 group-hover:text-indigo-600 transition-colors shadow-2xs">
                      {idx + 1}
                    </span>
                    <span className="text-xs sm:text-sm font-semibold text-slate-800 break-words group-hover:text-indigo-900 transition-colors">
                      {option.text}
                    </span>
                  </div>

                  {submittingOptionId === option.id && (
                    <Loader2 className="w-4 h-4 animate-spin text-indigo-600 shrink-0" />
                  )}
                </button>
              );
            }

            // --- 回答後の結果表示カード ---
            return (
              <div
                key={option.id}
                className={`p-3 rounded-xl border-2 relative overflow-hidden transition-all ${
                  isCorrect
                    ? 'border-emerald-500 bg-emerald-50/40 text-emerald-950 font-bold'
                    : isWrong
                    ? 'border-rose-400 bg-rose-50/40 text-rose-950'
                    : isMyPick
                    ? 'border-indigo-500 bg-indigo-50/40 text-indigo-950'
                    : 'border-slate-200 bg-slate-50/50 text-slate-700'
                }`}
              >
                {/* 投票割合プログレスバー背景 */}
                <div
                  className={`absolute inset-y-0 left-0 transition-all duration-500 opacity-20 pointer-events-none ${
                    isCorrect
                      ? 'bg-emerald-500'
                      : isWrong
                      ? 'bg-rose-500'
                      : isMyPick
                      ? 'bg-indigo-500'
                      : 'bg-slate-400'
                  }`}
                  style={{ width: `${percent}%` }}
                />

                <div className="relative z-1 flex items-start justify-between gap-2">
                  <div className="flex items-start gap-2 min-w-0">
                    <span className={`w-5 h-5 rounded-md flex items-center justify-center text-[11px] font-bold shrink-0 mt-0.5 ${
                      isCorrect
                        ? 'bg-emerald-500 text-white'
                        : isWrong
                        ? 'bg-rose-500 text-white'
                        : 'bg-slate-200 text-slate-600'
                    }`}>
                      {isCorrect ? (
                        <Check className="w-3.5 h-3.5 stroke-[3]" />
                      ) : isWrong ? (
                        <XCircle className="w-3.5 h-3.5" />
                      ) : (
                        idx + 1
                      )}
                    </span>

                    <div>
                      <span className={`text-xs sm:text-sm block break-words ${
                        isWrong ? 'line-through text-rose-700 font-medium' : 'font-bold'
                      }`}>
                        {option.text}
                      </span>

                      {/* バッジ表示 */}
                      <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                        {isCorrect && (
                          <span className="text-[10px] px-1.5 py-0.2 bg-emerald-600 text-white font-extrabold rounded shadow-2xs">
                            正解
                          </span>
                        )}
                        {isMyPick && (
                          <span className={`text-[10px] px-1.5 py-0.2 font-extrabold rounded shadow-2xs ${
                            isCorrect ? 'bg-indigo-600 text-white' : 'bg-rose-600 text-white'
                          }`}>
                            あなたの選択
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* 票数 ＆ パーセント */}
                  <div className="text-right shrink-0">
                    <span className="text-xs sm:text-sm font-black text-slate-900 block">
                      {percent}%
                    </span>
                    <span className="text-[10px] text-slate-500 font-semibold">
                      {count}票
                    </span>
                  </div>
                </div>

                {/* 投票者リストのトグル */}
                {result && result.voters && result.voters.length > 0 && (
                  <div className="relative z-1 mt-2 pt-2 border-t border-slate-200/60">
                    <button
                      type="button"
                      onClick={() => setShowVoters(prev => ({ ...prev, [option.id]: !prev[option.id] }))}
                      className="text-[10px] text-slate-500 hover:text-indigo-600 font-bold flex items-center gap-1 cursor-pointer"
                    >
                      <span>投票者 ({result.voters.length}人)</span>
                      {showVoters[option.id] ? (
                        <ChevronUp className="w-3 h-3" />
                      ) : (
                        <ChevronDown className="w-3 h-3" />
                      )}
                    </button>

                    {showVoters[option.id] && (
                      <div className="mt-1.5 flex items-center gap-1.5 flex-wrap">
                        {result.voters.map(voter => (
                          <div
                            key={voter.userId}
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 bg-white rounded-md border border-slate-200 text-[10px] font-semibold text-slate-700 shadow-2xs"
                            title={`${voter.userName} (${voter.userDepartment || '所属未設定'})`}
                          >
                            <img
                              src={getAvatarUrl(voter.userAvatar)}
                              alt={voter.userName}
                              onError={handleAvatarError}
                              className="w-3.5 h-3.5 rounded-full object-cover"
                            />
                            <span className="truncate max-w-[80px]">{voter.userName}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* 解説・補足ブロック (回答済みユーザーに表示) */}
        {showResults && quiz.explanation && (
          <div className="mt-3.5 p-3 bg-amber-50/70 border border-amber-200 rounded-xl text-xs text-amber-950">
            <div className="flex items-center gap-1 text-amber-800 font-extrabold text-[11px] mb-1">
              <Info className="w-3.5 h-3.5 text-amber-600" />
              <span>解説・補足</span>
            </div>
            <p className="leading-relaxed whitespace-pre-wrap font-medium">
              {quiz.explanation}
            </p>
          </div>
        )}

        {/* フッター補足 */}
        <div className="mt-3 pt-2.5 border-t border-slate-100 flex items-center justify-between text-[10px] text-slate-400 font-medium">
          <span>※1人1回のみ回答可能（二重回答不可）</span>
          {quiz.hasAnswered && (
            <span className="text-emerald-600 font-bold flex items-center gap-0.5">
              <CheckCircle2 className="w-3 h-3" />
              回答済み
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
