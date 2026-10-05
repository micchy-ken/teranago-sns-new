export interface ScheduleCandidate {
  id: string;
  startAt: string; // ISO String
  endAt: string;   // ISO String
  text?: string;   // 例: 10/15(木) 10:00〜11:00
}

export type PollResponseStatus = 'ok' | 'maybe' | 'ng';

export interface CandidateResponse {
  candidateId: string;
  status: PollResponseStatus;
  comment?: string;
}

export interface SchedulePollAnswer {
  id: string;
  pollId: string;
  userId: string;
  userName: string;
  responses: CandidateResponse[];
  overallComment?: string;
  answeredAt: string;
  updatedAt?: string;
}

export interface SchedulePoll {
  id: string;
  title: string;
  description?: string;
  organizerId: string;
  organizerName: string;
  status: 'open' | 'confirmed' | 'cancelled';
  durationMinutes: number;
  location?: string;
  targetUserIds: string[];
  candidates: ScheduleCandidate[];
  deadlineAt?: string | null;
  confirmedCandidateId?: string | null;
  createdEventId?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface FreeSlotSuggestion {
  id: string;
  startAt: string;
  endAt: string;
  availableCount: number;
  totalCount: number;
  busyUserIds?: string[];
  isPerfect?: boolean;
}
