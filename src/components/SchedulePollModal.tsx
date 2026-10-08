import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar as CalendarIcon,
  Clock,
  Users,
  CheckCircle2,
  AlertCircle,
  XCircle,
  Plus,
  Trash2,
  Sparkles,
  ArrowRight,
  ArrowLeft,
  X,
  Check,
  HelpCircle,
  MapPin,
  CalendarDays,
  Send,
  Lock,
  ChevronRight,
  MessageSquare,
  Sparkle,
  RefreshCw,
  Award
} from 'lucide-react';
import { SchedulePoll, SchedulePollAnswer, ScheduleCandidate, FreeSlotSuggestion, PollResponseStatus } from '../types/schedulePoll';
import { User, OfficeMaster, DivisionMaster } from '../types';
import { API_BASE_URL } from '../config/api';
import { MemberSelector } from './MemberSelector';

interface SchedulePollModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  users: User[];
  offices?: OfficeMaster[];
  divisions?: DivisionMaster[];
  onEventCreated?: () => void; // カレンダー再取得用コールバック
  initialPollId?: string | null;
}

type ViewMode = 'list' | 'create_step1' | 'create_step2' | 'detail';

export function SchedulePollModal({
  isOpen,
  onClose,
  currentUser,
  users,
  offices = [],
  divisions = [],
  onEventCreated,
  initialPollId = null,
}: SchedulePollModalProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('list');
  const [polls, setPolls] = useState<SchedulePoll[]>([]);
  const [loading, setLoading] = useState<boolean>(false);
  const [selectedPoll, setSelectedPoll] = useState<SchedulePoll | null>(null);
  const [answers, setAnswers] = useState<SchedulePollAnswer[]>([]);
  const [loadingDetail, setLoadingDetail] = useState<boolean>(false);

  // ウィザード作成用State
  const [formTitle, setFormTitle] = useState<string>('');
  const [formDesc, setFormDesc] = useState<string>('');
  const [formDuration, setFormDuration] = useState<number>(60);
  const [formLocation, setFormLocation] = useState<string>('');
  const [formTargetUserIds, setFormTargetUserIds] = useState<string[]>([]);
  const [formDeadline, setFormDeadline] = useState<string>('');
  const [formCandidates, setFormCandidates] = useState<ScheduleCandidate[]>([]);

  // 候補設定モード: 'manual' | 'auto_free_slots'
  const [candidateMode, setCandidateMode] = useState<'auto_free_slots' | 'manual'>('auto_free_slots');

  // 空き枠自動抽出用State
  const [autoStartDate, setAutoStartDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1); // 明日
    return d.toISOString().split('T')[0];
  });
  const [autoEndDate, setAutoEndDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 8); // 1週間後
    return d.toISOString().split('T')[0];
  });
  const [autoTimeStart, setAutoTimeStart] = useState<string>('09:00');
  const [autoTimeEnd, setAutoTimeEnd] = useState<string>('18:00');
  const [autoExcludeWeekends, setAutoExcludeWeekends] = useState<boolean>(true);
  const [autoExcludeLunch, setAutoExcludeLunch] = useState<boolean>(true);
  const [searchingSlots, setSearchingSlots] = useState<boolean>(false);
  const [suggestedSlots, setSuggestedSlots] = useState<FreeSlotSuggestion[]>([]);

  // 手動追加用一時State
  const [manualDate, setManualDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return d.toISOString().split('T')[0];
  });
  const [manualStartTime, setManualStartTime] = useState<string>('10:00');

  // 回答フォームState
  const [myResponses, setMyResponses] = useState<{ [candidateId: string]: PollResponseStatus }>({});
  const [myComments, setMyComments] = useState<{ [candidateId: string]: string }>({});
  const [myOverallComment, setMyOverallComment] = useState<string>('');
  const [submittingAnswer, setSubmittingAnswer] = useState<boolean>(false);

  // 日程確定モーダルState
  const [confirmCandidateId, setConfirmCandidateId] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<boolean>(false);

  // ----------------------------------------------------
  // 一覧取得
  // ----------------------------------------------------
  const fetchPolls = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/schedule-polls?userId=${currentUser.id}`);
      if (res.ok) {
        const data = await res.json();
        setPolls(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      console.error('日程調整一覧取得エラー:', err);
    } finally {
      setLoading(false);
    }
  }, [currentUser.id]);

  useEffect(() => {
    if (isOpen) {
      fetchPolls();
      if (initialPollId) {
        fetchPollDetail(initialPollId);
      } else {
        setViewMode('list');
      }
    }
  }, [isOpen, initialPollId, fetchPolls]);

  // ----------------------------------------------------
  // 詳細＆回答マトリクス取得
  // ----------------------------------------------------
  const fetchPollDetail = async (id: string) => {
    setLoadingDetail(true);
    try {
      const res = await fetch(`${API_BASE_URL}/schedule-polls/${id}`);
      if (res.ok) {
        const data = await res.json();
        setSelectedPoll(data.poll);
        setAnswers(data.answers || []);

        // 自分の既存回答を初期化
        const myAns = (data.answers || []).find((a: SchedulePollAnswer) => a.userId === currentUser.id);
        const respMap: { [cid: string]: PollResponseStatus } = {};
        const commMap: { [cid: string]: string } = {};
        if (myAns && Array.isArray(myAns.responses)) {
          myAns.responses.forEach((r: any) => {
            respMap[r.candidateId] = r.status;
            if (r.comment) commMap[r.candidateId] = r.comment;
          });
          setMyOverallComment(myAns.overallComment || '');
        } else {
          // デフォルト未回答または'ok'
          data.poll.candidates.forEach((c: ScheduleCandidate) => {
            respMap[c.id] = 'ok';
          });
          setMyOverallComment('');
        }
        setMyResponses(respMap);
        setMyComments(commMap);
        setViewMode('detail');
      }
    } catch (err) {
      console.error('日程調整詳細取得エラー:', err);
    } finally {
      setLoadingDetail(false);
    }
  };

  // ----------------------------------------------------
  // 空き枠自動抽出 API 呼び出し
  // ----------------------------------------------------
  const handleFindFreeSlots = async () => {
    if (!autoStartDate || !autoEndDate) return;
    setSearchingSlots(true);
    try {
      const res = await fetch(`${API_BASE_URL}/schedule-polls/find-free-slots`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserIds: formTargetUserIds.length > 0 ? formTargetUserIds : [currentUser.id],
          startDate: autoStartDate,
          endDate: autoEndDate,
          durationMinutes: formDuration,
          timeRange: { start: autoTimeStart, end: autoTimeEnd },
          excludeWeekends: autoExcludeWeekends,
          excludeLunch: autoExcludeLunch,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setSuggestedSlots(data.suggestedSlots || []);
      }
    } catch (err) {
      console.error('空き枠抽出エラー:', err);
    } finally {
      setSearchingSlots(false);
    }
  };

  // 空き枠スロットを候補リストに追加
  const handleAddSlotToCandidates = (slot: FreeSlotSuggestion) => {
    const start = new Date(slot.startAt);
    const end = new Date(slot.endAt);
    const dateStr = start.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
    const timeStr = `${start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜${end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;

    const newCand: ScheduleCandidate = {
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      startAt: slot.startAt,
      endAt: slot.endAt,
      text: `${dateStr} ${timeStr}`,
    };

    // 重複チェック
    if (!formCandidates.some(c => c.startAt === slot.startAt && c.endAt === slot.endAt)) {
      setFormCandidates([...formCandidates, newCand]);
    }
  };

  // 全員が参加可能な空き枠のみを一括追加
  const handleAddPerfectSuggestedSlots = () => {
    const perfectSlots = suggestedSlots.filter(s => s.isPerfect || (s.availableCount === s.totalCount && s.totalCount > 0));
    const newItems: ScheduleCandidate[] = [];
    perfectSlots.forEach(slot => {
      if (!formCandidates.some(c => c.startAt === slot.startAt && c.endAt === slot.endAt) &&
          !newItems.some(c => c.startAt === slot.startAt && c.endAt === slot.endAt)) {
        const start = new Date(slot.startAt);
        const end = new Date(slot.endAt);
        const dateStr = start.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
        const timeStr = `${start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜${end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
        newItems.push({
          id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          startAt: slot.startAt,
          endAt: slot.endAt,
          text: `${dateStr} ${timeStr}`,
        });
      }
    });
    setFormCandidates(prev => [...prev, ...newItems]);
  };

  // 全ての推奨空き枠を一括追加
  const handleAddAllSuggestedSlots = () => {
    const newItems: ScheduleCandidate[] = [];
    suggestedSlots.forEach(slot => {
      if (!formCandidates.some(c => c.startAt === slot.startAt && c.endAt === slot.endAt) &&
          !newItems.some(c => c.startAt === slot.startAt && c.endAt === slot.endAt)) {
        const start = new Date(slot.startAt);
        const end = new Date(slot.endAt);
        const dateStr = start.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
        const timeStr = `${start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜${end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;
        newItems.push({
          id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          startAt: slot.startAt,
          endAt: slot.endAt,
          text: `${dateStr} ${timeStr}`,
        });
      }
    });
    setFormCandidates(prev => [...prev, ...newItems]);
  };

  // 手動で候補を追加
  const handleAddManualCandidate = () => {
    if (!manualDate || !manualStartTime) return;
    const [h, m] = manualStartTime.split(':').map(Number);
    const start = new Date(manualDate);
    start.setHours(h, m, 0, 0);

    const end = new Date(start.getTime() + formDuration * 60 * 1000);
    const dateStr = start.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' });
    const timeStr = `${start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜${end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}`;

    const newCand: ScheduleCandidate = {
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      startAt: start.toISOString(),
      endAt: end.toISOString(),
      text: `${dateStr} ${timeStr}`,
    };

    setFormCandidates([...formCandidates, newCand]);
  };

  const handleRemoveCandidate = (id: string) => {
    setFormCandidates(formCandidates.filter(c => c.id !== id));
  };

  // ----------------------------------------------------
  // 新規作成実行
  // ----------------------------------------------------
  const handleCreatePoll = async () => {
    if (!formTitle.trim() || formCandidates.length === 0) {
      alert('タイトルと1件以上の候補日時を入力してください。');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(`${API_BASE_URL}/schedule-polls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: formTitle,
          description: formDesc,
          organizerId: currentUser.id,
          organizerName: currentUser.name,
          durationMinutes: formDuration,
          location: formLocation,
          targetUserIds: formTargetUserIds,
          candidates: formCandidates,
          deadlineAt: formDeadline ? `${formDeadline}T23:59:59` : null,
        }),
      });

      if (res.ok) {
        const created = await res.json();
        await fetchPolls();
        fetchPollDetail(created.id);
      } else {
        const err = await res.json();
        alert(err.error || '日程調整の作成に失敗しました');
      }
    } catch (err) {
      console.error('作成エラー:', err);
      alert('通信エラーが発生しました');
    } finally {
      setLoading(false);
    }
  };

  // ----------------------------------------------------
  // 回答送信
  // ----------------------------------------------------
  const handleSubmitAnswer = async () => {
    if (!selectedPoll) return;
    setSubmittingAnswer(true);

    const responses = selectedPoll.candidates.map(c => ({
      candidateId: c.id,
      status: myResponses[c.id] || 'ok',
      comment: myComments[c.id] || '',
    }));

    try {
      const res = await fetch(`${API_BASE_URL}/schedule-polls/${selectedPoll.id}/answers`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: currentUser.id,
          userName: currentUser.name,
          responses,
          overallComment: myOverallComment,
        }),
      });

      if (res.ok) {
        await fetchPollDetail(selectedPoll.id);
        fetchPolls();
      } else {
        alert('回答の送信に失敗しました');
      }
    } catch (err) {
      console.error('回答送信エラー:', err);
      alert('通信エラーが発生しました');
    } finally {
      setSubmittingAnswer(false);
    }
  };

  // ----------------------------------------------------
  // 日程確定＆Events自動登録
  // ----------------------------------------------------
  const handleConfirmSchedule = async (candidateId: string) => {
    if (!selectedPoll) return;
    if (!confirm('この候補日時で日程を確定し、カレンダーへ本登録しますか？')) return;

    setConfirming(true);
    try {
      const res = await fetch(`${API_BASE_URL}/schedule-polls/${selectedPoll.id}/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          selectedCandidateId: candidateId,
          finalTitle: selectedPoll.title,
          finalLocation: selectedPoll.location,
        }),
      });

      if (res.ok) {
        alert('日程を確定し、カレンダーに登録しました！');
        if (onEventCreated) onEventCreated();
        await fetchPollDetail(selectedPoll.id);
        fetchPolls();
      } else {
        const err = await res.json();
        alert(err.error || '日程確定に失敗しました');
      }
    } catch (err) {
      console.error('日程確定エラー:', err);
      alert('通信エラーが発生しました');
    } finally {
      setConfirming(false);
    }
  };

  // ----------------------------------------------------
  // スコア集計ロジック (〇=2, △=1, ×=0)
  // ----------------------------------------------------
  const candidateScores = useMemo(() => {
    if (!selectedPoll) return {};
    const scores: { [cid: string]: { okCount: number; maybeCount: number; ngCount: number; totalScore: number } } = {};

    selectedPoll.candidates.forEach(c => {
      let okCount = 0;
      let maybeCount = 0;
      let ngCount = 0;

      answers.forEach(a => {
        const resp = (a.responses || []).find(r => r.candidateId === c.id);
        if (resp) {
          if (resp.status === 'ok') okCount++;
          else if (resp.status === 'maybe') maybeCount++;
          else if (resp.status === 'ng') ngCount++;
        }
      });

      scores[c.id] = {
        okCount,
        maybeCount,
        ngCount,
        totalScore: okCount * 2 + maybeCount * 1,
      };
    });

    return scores;
  }, [selectedPoll, answers]);

  // 最高スコアのスロットID
  const bestCandidateId = useMemo(() => {
    if (!selectedPoll || selectedPoll.candidates.length === 0) return null;
    let maxScore = -1;
    let bestId = null;
    selectedPoll.candidates.forEach(c => {
      const s = candidateScores[c.id]?.totalScore ?? 0;
      if (s > maxScore) {
        maxScore = s;
        bestId = c.id;
      }
    });
    return bestId;
  }, [selectedPoll, candidateScores]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[90vh] my-auto animate-in fade-in zoom-in-95 duration-200">
        
        {/* モーダルヘッダー */}
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-indigo-50/70 via-white to-slate-50">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-xs">
              <CalendarDays className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-800">日程調整アシスタント</h2>
                <span className="text-[10px] font-extrabold px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700">
                  カレンダー連携
                </span>
              </div>
              <p className="text-xs text-slate-500">
                空き枠自動抽出 ＆ アンケート集計で会議日程をスマートに確定
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* モーダルボディ */}
        <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-6">

          {/* ============================================================ */}
          {/* VIEW 1: 日程調整一覧リスト */}
          {/* ============================================================ */}
          {viewMode === 'list' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <h3 className="text-sm font-bold text-slate-700 flex items-center gap-1.5">
                  <span>参加・主催している日程調整</span>
                  <span className="text-xs text-slate-400 font-normal">({polls.length}件)</span>
                </h3>
                <button
                  onClick={() => {
                    setFormTitle('');
                    setFormDesc('');
                    setFormDuration(60);
                    setFormLocation('');
                    setFormTargetUserIds([]);
                    setFormDeadline('');
                    setFormCandidates([]);
                    setSuggestedSlots([]);
                    setViewMode('create_step1');
                  }}
                  className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>新規日程調整を作成</span>
                </button>
              </div>

              {loading ? (
                <div className="py-16 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                  <RefreshCw className="w-6 h-6 animate-spin text-indigo-500" />
                  <p className="text-xs font-medium">日程調整データを読み込み中...</p>
                </div>
              ) : polls.length === 0 ? (
                <div className="py-16 text-center border-2 border-dashed border-slate-200 rounded-2xl p-8">
                  <CalendarIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-sm font-bold text-slate-700">現在進行中の日程調整はありません</p>
                  <p className="text-xs text-slate-400 mt-1 mb-4">
                    会議や現場打ち合わせの候補日時を設定して、メンバーへ回答を依頼しましょう。
                  </p>
                  <button
                    onClick={() => setViewMode('create_step1')}
                    className="px-4 py-2 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-bold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5"
                  >
                    <Plus className="w-4 h-4" />
                    <span>日程調整をはじめる</span>
                  </button>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {polls.map(poll => {
                    const isOrganizer = poll.organizerId === currentUser.id;
                    const isConfirmed = poll.status === 'confirmed';

                    return (
                      <div
                        key={poll.id}
                        onClick={() => fetchPollDetail(poll.id)}
                        className={`p-4 rounded-2xl border transition-all cursor-pointer hover:shadow-md ${
                          isConfirmed
                            ? 'bg-slate-50/70 border-slate-200 hover:border-slate-300'
                            : 'bg-white border-indigo-100 hover:border-indigo-300 hover:bg-indigo-50/20 shadow-2xs'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 mb-2">
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${
                                isConfirmed
                                  ? 'bg-emerald-100 text-emerald-700'
                                  : 'bg-amber-100 text-amber-800 animate-pulse'
                              }`}>
                                {isConfirmed ? '日程確定済' : '回答募集中'}
                              </span>
                              {isOrganizer && (
                                <span className="text-[10px] font-bold px-1.5 py-0.2 rounded bg-indigo-100 text-indigo-700">
                                  主催
                                </span>
                              )}
                            </div>
                            <h4 className="font-bold text-slate-800 text-sm mt-1 truncate">
                              {poll.title}
                            </h4>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 shrink-0 mt-1" />
                        </div>

                        <div className="space-y-1 text-xs text-slate-500 mb-3">
                          <div className="flex items-center gap-1.5">
                            <Users className="w-3.5 h-3.5 text-slate-400" />
                            <span>主催: {poll.organizerName} / 参加対象: {poll.targetUserIds?.length || 0}名</span>
                          </div>
                          <div className="flex items-center gap-1.5">
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span>所要時間: {poll.durationMinutes}分 / 候補日時: {poll.candidates?.length || 0}枠</span>
                          </div>
                          {poll.deadlineAt && (
                            <div className="flex items-center gap-1.5 text-rose-600 font-medium">
                              <AlertCircle className="w-3.5 h-3.5" />
                              <span>締切: {new Date(poll.deadlineAt).toLocaleDateString('ja-JP')}</span>
                            </div>
                          )}
                        </div>

                        <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between text-xs">
                          <span className="text-slate-400 text-[11px]">
                            {new Date(poll.createdAt).toLocaleDateString('ja-JP')} 作成
                          </span>
                          <span className="font-bold text-indigo-600 hover:text-indigo-800">
                            {isConfirmed ? '確定日程を確認 →' : '回答・マトリクスを開く →'}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ============================================================ */}
          {/* VIEW 2: 新規作成ウィザード Step 1 (基本情報) */}
          {/* ============================================================ */}
          {viewMode === 'create_step1' && (
            <div className="space-y-5 max-w-2xl mx-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">1</span>
                  <h3 className="font-bold text-slate-800 text-sm">ステップ1: 調整の基本情報を入力</h3>
                </div>
                <button
                  onClick={() => setViewMode('list')}
                  className="text-xs text-slate-400 hover:text-slate-600"
                >
                  キャンセル
                </button>
              </div>

              <div className="space-y-4 text-xs">
                {/* タイトル */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    調整タイトル <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formTitle}
                    onChange={e => setFormTitle(e.target.value)}
                    placeholder="例: 10月度 現場保守定例ミーティング"
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 outline-none font-medium"
                  />
                </div>

                {/* 所要時間 & 場所 */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      所要時間
                    </label>
                    <select
                      value={formDuration}
                      onChange={e => setFormDuration(Number(e.target.value))}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white font-medium outline-none"
                    >
                      <option value={30}>30分</option>
                      <option value={45}>45分</option>
                      <option value={60}>60分 (1時間)</option>
                      <option value={90}>90分 (1時間30分)</option>
                      <option value={120}>120分 (2時間)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-bold text-slate-700 mb-1">
                      場所 / 形式
                    </label>
                    <input
                      type="text"
                      value={formLocation}
                      onChange={e => setFormLocation(e.target.value)}
                      placeholder="例: 第1会議室 / Teamsオンライン"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none font-medium"
                    />
                  </div>
                </div>

                {/* 対象参加者 (MemberSelector 流用) */}
                <div>
                  <MemberSelector
                    allUsers={users}
                    selectedUserIds={formTargetUserIds}
                    onChangeSelectedUserIds={setFormTargetUserIds}
                    offices={offices}
                    divisions={divisions}
                    label="参加対象メンバー (複数選択・拠点部署絞り込み可能)"
                  />
                </div>

                {/* 説明・アジェンダ */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    説明・アジェンダ (任意)
                  </label>
                  <textarea
                    rows={2}
                    value={formDesc}
                    onChange={e => setFormDesc(e.target.value)}
                    placeholder="議題や事前に準備してほしい資料などを記載してください。"
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 focus:border-indigo-500 outline-none font-medium"
                  />
                </div>

                {/* 回答期限 */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1">
                    回答締切日 (任意)
                  </label>
                  <input
                    type="date"
                    value={formDeadline}
                    onChange={e => setFormDeadline(e.target.value)}
                    className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white outline-none font-medium"
                  />
                </div>
              </div>

              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setViewMode('list')}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors"
                >
                  一覧へ戻る
                </button>
                <button
                  type="button"
                  disabled={!formTitle.trim()}
                  onClick={() => {
                    setViewMode('create_step2');
                    if (candidateMode === 'auto_free_slots' && suggestedSlots.length === 0) {
                      handleFindFreeSlots();
                    }
                  }}
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer"
                >
                  <span>次へ: 候補日時の設定</span>
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* VIEW 3: 新規作成ウィザード Step 2 (候補日時の設定) */}
          {/* ============================================================ */}
          {viewMode === 'create_step2' && (
            <div className="space-y-5 max-w-3xl mx-auto">
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-xs font-bold flex items-center justify-center">2</span>
                  <h3 className="font-bold text-slate-800 text-sm">ステップ2: 候補日時を設定</h3>
                </div>
                <span className="text-xs font-bold text-indigo-600 bg-indigo-50 px-2.5 py-1 rounded-full">
                  現在 {formCandidates.length} 枠登録済
                </span>
              </div>

              {/* モード選択タブ */}
              <div className="grid grid-cols-2 gap-3 p-1 bg-slate-100 rounded-2xl">
                <button
                  type="button"
                  onClick={() => {
                    setCandidateMode('auto_free_slots');
                    if (suggestedSlots.length === 0) handleFindFreeSlots();
                  }}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    candidateMode === 'auto_free_slots'
                      ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <Sparkles className="w-4 h-4 text-indigo-600" />
                  <span>カレンダー空き枠から自動抽出</span>
                </button>

                <button
                  type="button"
                  onClick={() => setCandidateMode('manual')}
                  className={`py-2.5 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition-all ${
                    candidateMode === 'manual'
                      ? 'bg-white text-indigo-700 shadow-xs ring-1 ring-indigo-200'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <CalendarIcon className="w-4 h-4 text-indigo-600" />
                  <span>手動で候補日時を指定</span>
                </button>
              </div>

              {/* モードA: カレンダー空き枠自動抽出 */}
              {candidateMode === 'auto_free_slots' && (
                <div className="p-4 bg-indigo-50/40 rounded-2xl border border-indigo-100 space-y-4">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs font-bold text-slate-800">
                        対象メンバー全員が空いている時間帯を自動スキャン
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={handleFindFreeSlots}
                      disabled={searchingSlots}
                      className="px-3 py-1.5 bg-white hover:bg-indigo-50 text-indigo-700 border border-indigo-200 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors shadow-2xs"
                    >
                      <RefreshCw className={`w-3.5 h-3.5 ${searchingSlots ? 'animate-spin' : ''}`} />
                      <span>空き枠を再検索</span>
                    </button>
                  </div>

                  {/* 検索条件フォーム */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs">
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">開始日</label>
                      <input
                        type="date"
                        value={autoStartDate}
                        onChange={e => setAutoStartDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">終了日</label>
                      <input
                        type="date"
                        value={autoEndDate}
                        onChange={e => setAutoEndDate(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">時間帯 (開始)</label>
                      <input
                        type="time"
                        value={autoTimeStart}
                        onChange={e => setAutoTimeStart(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">時間帯 (終了)</label>
                      <input
                        type="time"
                        value={autoTimeEnd}
                        onChange={e => setAutoTimeEnd(e.target.value)}
                        className="w-full px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-medium"
                      />
                    </div>
                  </div>

                  {/* 抽出オプション（土日・昼休憩の除外） */}
                  <div className="flex flex-wrap items-center gap-4 sm:gap-6 pt-0.5">
                    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 font-medium hover:text-slate-900 transition-colors">
                      <input
                        type="checkbox"
                        checked={autoExcludeWeekends}
                        onChange={e => setAutoExcludeWeekends(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>土日は含まない</span>
                    </label>

                    <label className="inline-flex items-center gap-2 cursor-pointer select-none text-xs text-slate-700 font-medium hover:text-slate-900 transition-colors">
                      <input
                        type="checkbox"
                        checked={autoExcludeLunch}
                        onChange={e => setAutoExcludeLunch(e.target.checked)}
                        className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                      />
                      <span>昼休憩 (12:00〜13:00) を含まない</span>
                    </label>
                  </div>

                  {/* 抽出結果スロット一覧 */}
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs font-bold text-slate-700">
                        おすすめの空き枠スロット ({suggestedSlots.length}件検出)
                      </span>
                      {suggestedSlots.length > 0 && (
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={handleAddPerfectSuggestedSlots}
                            disabled={!suggestedSlots.some(s => s.isPerfect || (s.availableCount === s.totalCount && s.totalCount > 0))}
                            className={`text-xs font-bold transition-colors flex items-center gap-1 ${
                              suggestedSlots.some(s => s.isPerfect || (s.availableCount === s.totalCount && s.totalCount > 0))
                                ? 'text-emerald-600 hover:text-emerald-800 cursor-pointer'
                                : 'text-slate-400 cursor-not-allowed'
                            }`}
                            title={
                              suggestedSlots.some(s => s.isPerfect || (s.availableCount === s.totalCount && s.totalCount > 0))
                                ? '全員が参加可能な空き枠のみを一括追加します'
                                : '全員が空いている枠はありません'
                            }
                          >
                            ＋ 全員参加のみ追加
                          </button>
                          <button
                            type="button"
                            onClick={handleAddAllSuggestedSlots}
                            className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 cursor-pointer"
                          >
                            ＋ すべて候補に追加
                          </button>
                        </div>
                      )}
                    </div>

                    {searchingSlots ? (
                      <div className="py-8 text-center text-slate-400 text-xs">
                        <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-indigo-600" />
                        カレンダーの非公開・公開予定を照合中...
                      </div>
                    ) : suggestedSlots.length === 0 ? (
                      <div className="p-4 bg-white rounded-xl border border-slate-200 text-center text-slate-400 text-xs">
                        指定期間に全員が空いている枠が見つかりませんでした。期間や時間帯を広げて再検索してください。
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 max-h-52 overflow-y-auto p-1">
                        {suggestedSlots.map(slot => {
                          const start = new Date(slot.startAt);
                          const end = new Date(slot.endAt);
                          const isAdded = formCandidates.some(c => c.startAt === slot.startAt && c.endAt === slot.endAt);

                          return (
                            <button
                              key={slot.id}
                              type="button"
                              onClick={() => handleAddSlotToCandidates(slot)}
                              disabled={isAdded}
                              className={`p-2.5 rounded-xl border text-left text-xs transition-all flex items-center justify-between ${
                                isAdded
                                  ? 'bg-slate-100 border-slate-200 text-slate-400 cursor-default'
                                  : slot.isPerfect
                                  ? 'bg-emerald-50/80 border-emerald-200 hover:border-emerald-400 text-emerald-900 cursor-pointer shadow-2xs hover:scale-[1.01]'
                                  : 'bg-white border-slate-200 hover:border-indigo-300 text-slate-700 cursor-pointer shadow-2xs'
                              }`}
                            >
                              <div>
                                <div className="font-bold">
                                  {start.toLocaleDateString('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short' })}{' '}
                                  {start.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}〜{end.toLocaleTimeString('ja-JP', { hour: '2-digit', minute: '2-digit' })}
                                </div>
                                <div className="text-[10px] text-slate-500 mt-0.5">
                                  {slot.isPerfect ? (
                                    <span className="text-emerald-700 font-extrabold flex items-center gap-0.5">
                                      <Check className="w-3 h-3" /> 全員空き
                                    </span>
                                  ) : (
                                    <span>{slot.availableCount} / {slot.totalCount}名 空き</span>
                                  )}
                                </div>
                              </div>
                              <span className="text-xs font-bold text-indigo-600">
                                {isAdded ? '追加済' : '＋追加'}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* モードB: 手動で候補日時を追加 */}
              {candidateMode === 'manual' && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-3">
                  <div className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <CalendarIcon className="w-4 h-4 text-indigo-600" />
                    <span>手動で候補日時を指定して追加</span>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 text-xs">
                    <div>
                      <input
                        type="date"
                        value={manualDate}
                        onChange={e => setManualDate(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-medium outline-none"
                      />
                    </div>
                    <div>
                      <input
                        type="time"
                        value={manualStartTime}
                        onChange={e => setManualStartTime(e.target.value)}
                        className="px-3 py-2 rounded-xl border border-slate-300 bg-white font-medium outline-none"
                      />
                    </div>
                    <span className="text-slate-500 font-medium">({formDuration}分間)</span>
                    <button
                      type="button"
                      onClick={handleAddManualCandidate}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold flex items-center gap-1 shadow-xs cursor-pointer ml-auto"
                    >
                      <Plus className="w-4 h-4" />
                      <span>候補に追加</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 登録された候補日時リスト */}
              <div className="space-y-2 pt-2">
                <h4 className="text-xs font-bold text-slate-700 flex items-center justify-between">
                  <span>登録済みの候補日時 ({formCandidates.length}枠)</span>
                  {formCandidates.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFormCandidates([])}
                      className="text-[11px] text-rose-600 hover:underline"
                    >
                      すべてクリア
                    </button>
                  )}
                </h4>

                {formCandidates.length === 0 ? (
                  <div className="p-6 border-2 border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
                    候補日時がまだ追加されていません。上記の自動抽出または手動設定から追加してください。
                  </div>
                ) : (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {formCandidates.map((cand, idx) => (
                      <div
                        key={cand.id}
                        className="p-3 bg-white rounded-xl border border-slate-200 shadow-2xs flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 font-bold text-[10px] flex items-center justify-center">
                            {idx + 1}
                          </span>
                          <span className="font-bold text-slate-800">{cand.text}</span>
                        </div>
                        <button
                          type="button"
                          onClick={() => handleRemoveCandidate(cand.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded"
                          title="削除"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* ボトムボタン */}
              <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => setViewMode('create_step1')}
                  className="px-4 py-2 text-slate-500 hover:bg-slate-100 rounded-xl text-xs font-bold flex items-center gap-1 transition-colors"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>基本情報へ戻る</span>
                </button>
                <button
                  type="button"
                  disabled={formCandidates.length === 0 || loading}
                  onClick={handleCreatePoll}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors cursor-pointer"
                >
                  <Send className="w-4 h-4" />
                  <span>日程調整を作成・公開</span>
                </button>
              </div>
            </div>
          )}

          {/* ============================================================ */}
          {/* VIEW 4: 回答マトリクス＆詳細・確定ビュー */}
          {/* ============================================================ */}
          {viewMode === 'detail' && selectedPoll && (
            <div className="space-y-6">
              {/* トップナビ ＆ 基本メタ情報 */}
              <div className="flex items-center justify-between pb-3 border-b border-slate-100">
                <button
                  onClick={() => setViewMode('list')}
                  className="text-xs font-bold text-slate-600 hover:text-indigo-600 flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-4 h-4" />
                  <span>調整一覧へ戻る</span>
                </button>

                <div className="flex items-center gap-2">
                  <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full ${
                    selectedPoll.status === 'confirmed'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-800 animate-pulse'
                  }`}>
                    {selectedPoll.status === 'confirmed' ? '日程確定済' : '回答受付中'}
                  </span>
                </div>
              </div>

              {/* 調整情報カード */}
              <div className="p-4 bg-gradient-to-r from-slate-50 to-indigo-50/30 rounded-2xl border border-slate-200 shadow-2xs space-y-2">
                <h3 className="text-base font-bold text-slate-900">{selectedPoll.title}</h3>
                {selectedPoll.description && (
                  <p className="text-xs text-slate-600 whitespace-pre-wrap">{selectedPoll.description}</p>
                )}
                <div className="flex flex-wrap items-center gap-4 text-xs text-slate-500 pt-1">
                  <span className="flex items-center gap-1"><Users className="w-3.5 h-3.5 text-slate-400" /> 主催: {selectedPoll.organizerName}</span>
                  <span className="flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-slate-400" /> 所要時間: {selectedPoll.durationMinutes}分</span>
                  {selectedPoll.location && (
                    <span className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" /> 場所: {selectedPoll.location}</span>
                  )}
                  {selectedPoll.deadlineAt && (
                    <span className="flex items-center gap-1 text-rose-600 font-semibold">
                      <AlertCircle className="w-3.5 h-3.5" /> 締切: {new Date(selectedPoll.deadlineAt).toLocaleDateString('ja-JP')}
                    </span>
                  )}
                </div>
              </div>

              {/* 自分の回答フォーム (未確定時のみ入力可能) */}
              {selectedPoll.status !== 'confirmed' && (
                <div className="p-4 bg-white rounded-2xl border-2 border-indigo-100 shadow-xs space-y-4">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-bold text-indigo-900 flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-indigo-600" />
                      <span>あなたの参加可否を回答</span>
                    </h4>
                    <button
                      type="button"
                      onClick={() => {
                        const allOk: { [cid: string]: PollResponseStatus } = {};
                        selectedPoll.candidates.forEach(c => (allOk[c.id] = 'ok'));
                        setMyResponses(allOk);
                      }}
                      className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      すべて「〇 (参加可)」にする
                    </button>
                  </div>

                  <div className="space-y-2">
                    {selectedPoll.candidates.map(cand => {
                      const currentStatus = myResponses[cand.id] || 'ok';
                      return (
                        <div
                          key={cand.id}
                          className="p-2.5 bg-slate-50 rounded-xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                        >
                          <div className="text-xs font-bold text-slate-800">
                            {cand.text}
                          </div>

                          <div className="flex items-center gap-2">
                            <div className="flex items-center gap-1 bg-white p-1 rounded-lg border border-slate-200">
                              <button
                                type="button"
                                onClick={() => setMyResponses({ ...myResponses, [cand.id]: 'ok' })}
                                className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 transition-all ${
                                  currentStatus === 'ok'
                                    ? 'bg-emerald-600 text-white shadow-2xs'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                〇 参加
                              </button>
                              <button
                                type="button"
                                onClick={() => setMyResponses({ ...myResponses, [cand.id]: 'maybe' })}
                                className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 transition-all ${
                                  currentStatus === 'maybe'
                                    ? 'bg-amber-500 text-white shadow-2xs'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                △ 未定
                              </button>
                              <button
                                type="button"
                                onClick={() => setMyResponses({ ...myResponses, [cand.id]: 'ng' })}
                                className={`px-2.5 py-1 rounded text-xs font-bold flex items-center gap-1 transition-all ${
                                  currentStatus === 'ng'
                                    ? 'bg-rose-600 text-white shadow-2xs'
                                    : 'text-slate-600 hover:bg-slate-100'
                                }`}
                              >
                                × 不可
                              </button>
                            </div>

                            <input
                              type="text"
                              placeholder="コメント(任意)"
                              value={myComments[cand.id] || ''}
                              onChange={e => setMyComments({ ...myComments, [cand.id]: e.target.value })}
                              className="px-2 py-1 text-xs rounded-lg border border-slate-200 bg-white outline-none w-32"
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                    <input
                      type="text"
                      placeholder="全体コメント・希望時間など (任意)"
                      value={myOverallComment}
                      onChange={e => setMyOverallComment(e.target.value)}
                      className="px-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-white outline-none w-full max-w-md"
                    />
                    <button
                      type="button"
                      onClick={handleSubmitAnswer}
                      disabled={submittingAnswer}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl flex items-center gap-1.5 shadow-xs cursor-pointer ml-3 shrink-0"
                    >
                      <Send className="w-3.5 h-3.5" />
                      <span>{submittingAnswer ? '送信中...' : '回答を保存'}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* 回答マトリクス表 */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                    <Users className="w-4 h-4 text-indigo-600" />
                    <span>メンバー回答マトリクス ({answers.length}名回答済)</span>
                  </h4>
                  {selectedPoll.status !== 'confirmed' && selectedPoll.organizerId === currentUser.id && (
                    <span className="text-[11px] text-indigo-600 font-bold">
                      ★ 最高スコアの日程を選択して確定できます
                    </span>
                  )}
                </div>

                <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-2xs">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-bold">
                        <th className="py-2.5 px-3 min-w-[200px]">候補日時</th>
                        <th className="py-2.5 px-2 text-center min-w-[70px] bg-indigo-50/50">スコア</th>
                        <th className="py-2.5 px-2 text-center min-w-[50px] text-emerald-700">〇</th>
                        <th className="py-2.5 px-2 text-center min-w-[50px] text-amber-700">△</th>
                        <th className="py-2.5 px-2 text-center min-w-[50px] text-rose-700">×</th>
                        {/* 回答者ヘッダー */}
                        {answers.map(ans => (
                          <th key={ans.userId} className="py-2.5 px-3 text-center min-w-[90px]">
                            <span className="truncate block max-w-[80px]" title={ans.userName}>
                              {ans.userName}
                            </span>
                          </th>
                        ))}
                        {/* 主催者確定アクション列 */}
                        {selectedPoll.organizerId === currentUser.id && (
                          <th className="py-2.5 px-3 text-right min-w-[100px]">確定操作</th>
                        )}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {selectedPoll.candidates.map(cand => {
                        const score = candidateScores[cand.id] || { okCount: 0, maybeCount: 0, ngCount: 0, totalScore: 0 };
                        const isBest = cand.id === bestCandidateId && selectedPoll.status !== 'confirmed';
                        const isConfirmedSlot = selectedPoll.confirmedCandidateId === cand.id;

                        return (
                          <tr
                            key={cand.id}
                            className={`transition-colors ${
                              isConfirmedSlot
                                ? 'bg-emerald-50/80 font-bold'
                                : isBest
                                ? 'bg-indigo-50/30'
                                : 'hover:bg-slate-50/80'
                            }`}
                          >
                            {/* 候補日時 */}
                            <td className="py-2.5 px-3 align-middle font-bold text-slate-800">
                              <div className="flex items-center gap-1.5">
                                <span>{cand.text}</span>
                                {isConfirmedSlot && (
                                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-emerald-600 text-white">
                                    確定
                                  </span>
                                )}
                                {isBest && !isConfirmedSlot && (
                                  <span className="text-[10px] font-extrabold px-1.5 py-0.2 rounded bg-indigo-600 text-white flex items-center gap-0.5">
                                    <Award className="w-3 h-3" /> 最適
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* スコア */}
                            <td className="py-2.5 px-2 text-center align-middle font-extrabold text-indigo-700 bg-indigo-50/30">
                              {score.totalScore} pt
                            </td>

                            {/* 〇 / △ / × 集計 */}
                            <td className="py-2.5 px-2 text-center align-middle font-bold text-emerald-700">
                              {score.okCount}
                            </td>
                            <td className="py-2.5 px-2 text-center align-middle font-bold text-amber-700">
                              {score.maybeCount}
                            </td>
                            <td className="py-2.5 px-2 text-center align-middle font-bold text-rose-700">
                              {score.ngCount}
                            </td>

                            {/* メンバーごとの回答 */}
                            {answers.map(ans => {
                              const r = (ans.responses || []).find(resp => resp.candidateId === cand.id);
                              const status = r?.status;
                              return (
                                <td key={ans.userId} className="py-2.5 px-3 text-center align-middle">
                                  {status === 'ok' ? (
                                    <span className="inline-block px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-extrabold text-xs">
                                      〇
                                    </span>
                                  ) : status === 'maybe' ? (
                                    <span className="inline-block px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-extrabold text-xs">
                                      △
                                    </span>
                                  ) : status === 'ng' ? (
                                    <span className="inline-block px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 font-extrabold text-xs">
                                      ×
                                    </span>
                                  ) : (
                                    <span className="text-slate-300">-</span>
                                  )}
                                  {r?.comment && (
                                    <div className="text-[10px] text-slate-400 truncate max-w-[80px] mx-auto mt-0.5" title={r.comment}>
                                      {r.comment}
                                    </div>
                                  )}
                                </td>
                              );
                            })}

                            {/* 主催者確定ボタン */}
                            {selectedPoll.organizerId === currentUser.id && (
                              <td className="py-2.5 px-3 text-right align-middle whitespace-nowrap">
                                {selectedPoll.status !== 'confirmed' ? (
                                  <button
                                    type="button"
                                    onClick={() => handleConfirmSchedule(cand.id)}
                                    disabled={confirming}
                                    className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg text-xs transition-colors shadow-2xs cursor-pointer"
                                  >
                                    この日程で確定
                                  </button>
                                ) : isConfirmedSlot ? (
                                  <span className="text-xs font-bold text-emerald-700 flex items-center justify-end gap-1">
                                    <CheckCircle2 className="w-3.5 h-3.5" /> 本登録済
                                  </span>
                                ) : null}
                              </td>
                            )}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* メンバー全体のコメント一覧 */}
              {answers.some(a => a.overallComment) && (
                <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 space-y-2">
                  <h4 className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
                    <MessageSquare className="w-3.5 h-3.5 text-indigo-600" />
                    <span>メンバーからの全体コメント</span>
                  </h4>
                  <div className="space-y-1.5">
                    {answers.filter(a => a.overallComment).map(a => (
                      <div key={a.id} className="text-xs text-slate-600 flex items-start gap-2">
                        <span className="font-bold text-slate-800 shrink-0">{a.userName}:</span>
                        <span>{a.overallComment}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

        </div>

        {/* モーダルフッター */}
        <div className="px-5 py-3 border-t border-slate-100 bg-slate-50 flex items-center justify-between text-xs">
          <div className="text-slate-400">
            {viewMode === 'detail' && selectedPoll && (
              <span>ID: {selectedPoll.id}</span>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-slate-600 hover:bg-slate-200 rounded-xl font-bold transition-colors cursor-pointer"
          >
            閉じる
          </button>
        </div>

      </div>
    </div>
  );
}
