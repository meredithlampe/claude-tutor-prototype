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
  // The question's own visual: its scenario, never its answer.
  artifact?: TutorArtifact;
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
  // Added a round at a time when the learner chooses More practice after the wrap-up.
  // Steps with no instruction or visual.
  morePractice?: TutorStep[];
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
  // The message the offer card is shown after: the user's message that triggered it (the offer
  // replaces Claude's answer).
  offerMessageId?: string;
  // After No thanks: Claude's normal answer, written then. The decline note follows it.
  declineMessageId?: string;
  form?: 1 | 2;
  mode: TutorMode;
  // What the learner chose on the offer card. `mode` can differ: voice falls back to text when
  // the browser can't recognise speech or the microphone is blocked, and the banner switches it.
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
  // Progress through battery.morePractice, by index.
  practiceProgress?: StepProgress[];
  // Where the current More practice round starts in battery.morePractice. Each round is
  // counted on its own ("1 of 3"), not across rounds.
  practiceRoundStart?: number;
  // When each item was first shown, by question id, for time-on-item.
  shownAt: Record<string, string>;
  // stepsMs: step 1 (what the learner waits for); laterStepsMs: steps 2 and 3, in the background.
  generation: { assessmentMs?: number; stepsMs?: number; laterStepsMs?: number; practiceMs?: number; error?: string; summaryError?: string };
  learnerSummary?: string;
  tutorSummary?: string;
  delayedCheckConsent?: boolean;
  // Set on Exit: the status to return to on Resume ("paused" only), and the conversation's last
  // assistant message then, which the paused (or complete) card is shown after.
  pausedFrom?: TutorStatus;
  exitedAfterMessageId?: string;
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
  // Hand-drawn: shows the item's scenario without giving away the answer.
  artifact?: { title: string; description: string; svg: string };
  options?: TutorOption[];
  answer?: string;
  rubric?: FreeformRubric;
}

export interface Topic {
  id: string;
  title: string;
  // Short and learner-facing, for mid-sentence use: "base rates", "the bystander effect".
  name: string;
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
  // The self-report's prompt isn't in the file: it's selfReportPrompt(name), as for generated topics.
  items: Record<"A1" | "A2" | "F1" | "F2" | "P1", TopicItem> & { selfReport: Omit<TopicItem, "prompt"> };
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
  | { type: "battery_complete" }
  | { type: "practice_started" }
  | { type: "session_resumed" };
