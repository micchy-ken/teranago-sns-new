/**
 * chatQuiz.ts - チャット内クイズ・アンケートカード型定義
 */

export interface ChatQuizOption {
  id: string;
  text: string;
}

export interface ChatQuizVoter {
  userId: string;
  userName: string;
  userAvatar?: string;
  userDepartment?: string;
  answeredAt: string;
}

export interface ChatQuizAggregatedOption {
  id: string;
  text: string;
  count: number;
  percent: number;
  voters: ChatQuizVoter[];
}

export interface ChatQuizData {
  id: string;
  messageId: string;
  roomId: string;
  question: string;
  options: ChatQuizOption[];
  correctOptionId: string | null; // 未回答者にはサーバー側で null にマスク
  isSurvey: boolean;              // true: 正解なし（アンケート）, false: クイズ
  explanation?: string | null;    // 未回答者にはサーバー側で null にマスク
  createdById: string;
  createdByName: string;
  createdAt: string;
  
  // 回答状態・集計（リクエストしたユーザーの視点）
  hasAnswered: boolean;
  myAnswerOptionId?: string | null;
  totalAnswers: number;
  results?: ChatQuizAggregatedOption[];
  viewerUserId?: string;
}
