// Mirrors publicSession() in server/tutor/session.ts. Keep the two in sync.

export type TutorStatus =
  | "offered"
  | "declined"
  | "scoping"
  | "assessing"
  | "teaching"
  | "final_check"
  | "wrap_up"
  | "more_practice"
  | "complete"
  | "paused";

export const ACTIVE_STATUSES: TutorStatus[] = [
  "scoping",
  "assessing",
  "teaching",
  "final_check",
  "wrap_up",
  "more_practice",
];

export type TutorMode = "voice" | "text";
export type Confidence = "sure" | "think_so" | "guessing";
export type GradeResult = "correct" | "partial" | "incorrect";
// "step" and "practice" (More practice) are both practice items.
export type Section = "assessment" | "step" | "final" | "bonus" | "practice";

export interface PublicQuestion {
  id: string;
  prompt: string;
  // Shown above the prompt: a practice item's scenario, or the self-report's topic definition.
  context?: string;
  kind: "multiple_choice" | "freeform";
  role: "practice" | "check" | "self_report";
  resource?: string;
  // The question's own visual: its scenario, never its answer.
  artifact?: TutorArtifact;
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
  // `context`: the step's scenario, shown above the instruction.
  step?: { context?: string; instruction: string; artifact?: TutorArtifact; bloomLevel: string };
  question: PublicQuestion;
  attempts: PublicAttempt[];
  reveal?: { via: string; answer: string; explanation: string };
  practice?: PracticeState;
}

export interface TutorSession {
  id: string;
  status: TutorStatus;
  subject: string;
  // Short, for mid-sentence use: "base rates", or the subject outside the topic library.
  topicName: string;
  mode: TutorMode;
  requestedMode?: TutorMode;
  offerMessageId?: string;
  declineMessageId?: string;
  scoping: { goal?: string; time?: string };
  building?: "assessment" | "steps" | "practice";
  generationError?: string;
  counts: { assessment: number; steps: number; finalCheck: number; bonus: boolean; morePractice: number };
  position: number;
  // Within the current More practice round, from 0 (each round counts from 1 again).
  practicePosition: number;
  current?: CurrentItem;
  wrapUp: {
    learnerSummary?: string;
    tutorSummary?: string;
    summaryFailed: boolean;
    delayedCheckConsent?: boolean;
    scores?: CheckScores;
  };
  // After Exit: the last stored message then, which the paused (or complete) card follows.
  exitedAfterMessageId?: string;
  // Each part of the workbook, for the banner's progress bar.
  outline: { assessment: PartState; steps: PartState[]; finalCheck: PartState };
}

export type PartState = "not_started" | "generating" | "ready" | "completed";

// Opening-check probes beside their final-check pairs (MC 0–1, freeform 0–2). A null score
// is unanswered or, with `pending`, still being graded.
export interface CheckScores {
  items: { kind: "multiple_choice" | "freeform"; max: number; before: number | null; after: number | null }[];
  pending: boolean;
  total: { max: number; before: number; after: number };
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
  | { type: "battery_complete" }
  | { type: "practice_started" }
  | { type: "session_resumed" };

export interface AnswerInput {
  questionId: string;
  optionIndex?: number;
  text?: string;
  confidence?: Confidence;
}

export type TutorTab = "chat" | "workbook";
