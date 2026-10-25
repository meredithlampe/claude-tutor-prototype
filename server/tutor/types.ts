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

export type TutorMode = "voice" | "text";
export type QuestionKind = "multiple_choice" | "freeform";
export type QuestionRole = "practice" | "check" | "self_report";
export type BloomLevel = "remember" | "understand" | "apply" | "analyze" | "evaluate" | "create";
export type KnowledgeType = "factual" | "conceptual" | "procedural" | "metacognitive";
export type GradeResult = "correct" | "partial" | "incorrect";
export type Confidence = "sure" | "think_so" | "guessing";
export type RevealVia = "show_me" | "show_answer" | "auto_after_two_misses";

export interface TutorOption {
  text: string;
  // Server only, like everything below that's marked so.
  correct?: boolean;
  rationale?: string;
  misconceptionTag?: string;
}

export interface FreeformRubric {
  full: string;
  partial: string;
  none: string;
}

export interface TutorQuestion {
  id: string;
  // The fixed item this came from, e.g. "stats.A1". Undefined for generated items.
  itemKey?: string;
  prompt: string;
  kind: QuestionKind;
  role: QuestionRole;
  // Shown before the question, e.g. the bonus item's embedded resource. Markdown.
  resource?: string;
  options?: TutorOption[];
  // Server only: the worked answer shown on reveal (MC), or a model answer (freeform).
  answer?: string;
  // Server only: freeform grading levels.
  rubric?: FreeformRubric;
}

export interface TutorArtifact {
  kind: "svg";
  title: string;
  description: string;
  content: string;
}

export interface TutorStep {
  id: string;
  instruction: string;
  artifact?: TutorArtifact;
  bloomLevel: BloomLevel;
  knowledgeType: KnowledgeType;
  question: TutorQuestion;
  // Server only until offered: a similar question for after a wrong answer.
  parallel: TutorQuestion;
}

export interface TutorBattery {
  itemSource: "fixed" | "generated";
  assessment: TutorQuestion[];
  steps?: TutorStep[];
  finalCheck?: TutorQuestion[];
  bonus?: TutorQuestion;
}

export interface Attempt {
  response: string;
  // Undefined while a check's freeform answer is still being graded.
  result?: GradeResult;
  score?: 0 | 1 | 2;
  misconceptionTag?: string;
  feedback?: string;
  confidence?: Confidence;
  at: string;
}

export interface AnswerRecord {
  questionId: string;
  role: QuestionRole;
  attempts: Attempt[];
  reveal?: { via: RevealVia; answer: string; explanation: string };
}

export interface StepProgress {
  // The question being worked on: the step's question, or its parallel after a miss.
  activeQuestionId: string;
  misses: number;
  partialRetryUsed: boolean;
  explainRequested: boolean;
  revealed: boolean;
  done: boolean;
  mastered: boolean;
  startedAt: string;
}

export interface TutorSession {
  id: string;
  conversationId: string;
  userId: string;
  subject: string;
  topicId?: string;
  reason: string;
  trigger: "keyword" | "detected";
  // The assistant message the offer card is shown after.
  offerMessageId?: string;
  form?: 1 | 2;
  mode: TutorMode;
  // What the learner chose on the offer card. Voice isn't built yet, so it runs as text.
  requestedMode?: TutorMode;
  previousSettings: { responseStyle: string; voice: boolean };
  status: TutorStatus;
  scoping: { goal?: string; time?: string };
  battery?: TutorBattery;
  // Index into the current section: assessment, steps, or the final check (then the bonus).
  position: number;
  currentQuestionId?: string;
  answers: AnswerRecord[];
  stepProgress: StepProgress[];
  // When each item was first shown, by question id, for time-on-item.
  shownAt: Record<string, string>;
  generation: { assessmentMs?: number; stepsMs?: number; error?: string };
  learnerSummary?: string;
  delayedCheckConsent?: boolean;
  createdAt: string;
  updatedAt: string;
}

// A topic library file (server/tutor/topics/*.json).
export interface TopicItem {
  itemKey: string;
  kind: QuestionKind;
  bloomLevel?: BloomLevel;
  prompt: string;
  resource?: string;
  options?: TutorOption[];
  answer?: string;
  rubric?: FreeformRubric;
}

export interface Topic {
  id: string;
  title: string;
  subjectArea: string;
  detection: { keywords: string[]; exampleQuestions: string[] };
  notes: {
    keyIdeas: string[];
    learningModel: Record<"L0" | "L1" | "L2" | "L3", string>;
    misconceptions: { tag: string; description: string }[];
    caveats: string[];
  };
  sources: { citation: string; note: string }[];
  visualSuggestions: string[];
  items: Record<"selfReport" | "A1" | "A2" | "F1" | "F2" | "P1", TopicItem>;
}

// What the workbook sends with each tutor chat turn: what's on screen but not submitted.
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
