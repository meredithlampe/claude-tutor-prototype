// Mirrors publicSession() in server/tutor/session.ts. Keep the two in sync.

export type TutorStatus =
  | "offered"
  | "declined"
  | "scoping"
  | "assessing"
  | "teaching"
  | "final_check"
  | "wrap_up"
  | "complete"
  | "paused";

export const ACTIVE_STATUSES: TutorStatus[] = ["scoping", "assessing", "teaching", "final_check", "wrap_up"];

export type TutorMode = "voice" | "text";
export type Confidence = "sure" | "think_so" | "guessing";
export type GradeResult = "correct" | "partial" | "incorrect";
export type Section = "assessment" | "step" | "final" | "bonus";

export interface PublicQuestion {
  id: string;
  prompt: string;
  kind: "multiple_choice" | "freeform";
  role: "practice" | "check" | "self_report";
  resource?: string;
  options?: string[];
}

export interface TutorArtifact {
  kind: "svg";
  title: string;
  description: string;
  content: string;
}

export interface PublicAttempt {
  response: string;
  result?: GradeResult;
  feedback?: string;
}

export interface PracticeState {
  misses: number;
  done: boolean;
  // First try, or the one retry after a partly right answer.
  canSubmit: boolean;
  // The last answer counted as a miss: Show answer / Explain my thinking come next.
  missed: boolean;
  onParallel: boolean;
  explainRequested: boolean;
  canTryParallel: boolean;
}

export interface CurrentItem {
  section: Section;
  stepIndex?: number;
  step?: { instruction: string; artifact?: TutorArtifact; bloomLevel: string };
  question: PublicQuestion;
  attempts: PublicAttempt[];
  reveal?: { via: string; answer: string; explanation: string };
  practice?: PracticeState;
}

export interface TutorSession {
  id: string;
  status: TutorStatus;
  subject: string;
  mode: TutorMode;
  requestedMode?: TutorMode;
  offerMessageId?: string;
  scoping: { goal?: string; time?: string };
  building?: "assessment" | "steps";
  generationError?: string;
  counts: { assessment: number; steps: number; finalCheck: number; bonus: boolean };
  position: number;
  current?: CurrentItem;
}

// What's on screen in the workbook but not submitted, sent with each chat turn.
export interface WorkbookDraft {
  questionId?: string;
  selectedOption?: number;
  text?: string;
}

export type WorkbookEvent =
  | { type: "session_started" }
  | { type: "step_started"; stepIndex: number }
  | { type: "wrong_answer"; questionId: string }
  | { type: "explain_my_thinking"; questionId: string }
  | { type: "final_check_started" }
  | { type: "battery_complete" };

export interface AnswerInput {
  questionId: string;
  optionIndex?: number;
  text?: string;
  confidence?: Confidence;
}

export type TutorTab = "chat" | "workbook";
