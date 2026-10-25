import { getConversation } from "../repo/conversations";
import {
  fixedAssessment,
  fixedBonus,
  fixedFinalCheck,
  generateAssessment,
  generateSteps,
  gradeFreeform,
  gradeMultipleChoice,
  type Grade,
} from "./battery";
import { describeItem } from "./prompts";
import { updateSession } from "./repo";
import { getTopic } from "./topics";
import type {
  AnswerRecord,
  Attempt,
  Confidence,
  StepProgress,
  TutorQuestion,
  TutorSession,
  TutorStatus,
  TutorStep,
  WorkbookDraft,
} from "./types";

// Statuses in which Tutor mode is on screen (banner, workbook, Tutor chat).
export const ACTIVE_STATUSES: TutorStatus[] = ["scoping", "assessing", "teaching", "final_check", "wrap_up"];

export function isActive(session: TutorSession | undefined): session is TutorSession {
  return Boolean(session && ACTIVE_STATUSES.includes(session.status));
}

// A request the learner can't make in the session's current state.
export class TutorStateError extends Error {}

type Section = "assessment" | "step" | "final" | "bonus";

interface CurrentItem {
  section: Section;
  question: TutorQuestion;
  step?: TutorStep;
  stepIndex?: number;
  progress?: StepProgress;
}

export function currentItem(session: TutorSession): CurrentItem | undefined {
  const battery = session.battery;
  if (!battery) return undefined;
  if (session.status === "assessing") {
    const question = battery.assessment[session.position];
    return question && { section: "assessment", question };
  }
  if (session.status === "teaching" && battery.steps) {
    const step = battery.steps[session.position];
    const progress = session.stepProgress[session.position];
    if (!step || !progress) return undefined;
    const question = progress.activeQuestionId === step.parallel.id ? step.parallel : step.question;
    return { section: "step", question, step, stepIndex: session.position, progress };
  }
  if (session.status === "final_check" && battery.finalCheck) {
    const question = battery.finalCheck[session.position];
    if (question) return { section: "final", question };
    if (battery.bonus && session.position === battery.finalCheck.length) {
      return { section: "bonus", question: battery.bonus };
    }
  }
  return undefined;
}

// Which part of the battery the session is waiting on, if any.
export function pendingBuild(session: TutorSession): "assessment" | "steps" | undefined {
  if (session.status === "assessing" && !session.battery) return "assessment";
  if (session.status === "teaching" && !session.battery?.steps) return "steps";
  return undefined;
}

function markShown(session: TutorSession): TutorSession {
  const item = currentItem(session);
  session.currentQuestionId = item?.question.id;
  if (item && !session.shownAt[item.question.id]) session.shownAt[item.question.id] = new Date().toISOString();
  return session;
}

function newStepProgress(step: TutorStep): StepProgress {
  return {
    activeQuestionId: step.question.id,
    misses: 0,
    partialRetryUsed: false,
    explainRequested: false,
    revealed: false,
    done: false,
    mastered: false,
    startedAt: new Date().toISOString(),
  };
}

// ---------------------------------------------------------------------------------------
// Building the battery. One build per session and part at a time; later callers share it.

const builds = new Map<string, Promise<TutorSession>>();
// Background grading of check answers, which the steps build waits for.
const pendingGrades = new Map<string, Set<Promise<unknown>>>();

export function ensureBuilt(session: TutorSession): Promise<TutorSession> {
  const part = pendingBuild(session);
  if (!part) return Promise.resolve(session);
  const key = `${session.id}:${part}`;
  let build = builds.get(key);
  if (!build) {
    build = runBuild(session, part).finally(() => builds.delete(key));
    builds.set(key, build);
  }
  return build;
}

export function isBuilding(session: TutorSession): boolean {
  const part = pendingBuild(session);
  return Boolean(part && builds.has(`${session.id}:${part}`));
}

async function runBuild(session: TutorSession, part: "assessment" | "steps"): Promise<TutorSession> {
  const started = Date.now();
  const topic = getTopic(session.topicId);
  const conversation = await getConversation(session.conversationId);
  const messages = conversation?.messages ?? [];
  await updateSession(session.id, (current) => {
    current.generation.error = undefined;
    return current;
  });

  try {
    if (part === "assessment") {
      const assessment = topic && session.form
        ? fixedAssessment(topic, session.form)
        : await generateAssessment(session, messages);
      const ms = Date.now() - started;
      console.log(`Tutor: assessment ready in ${ms}ms (${topic ? "fixed" : "generated"})`);
      return await updateSession(session.id, (current) => {
        current.battery = { itemSource: topic ? "fixed" : "generated", assessment };
        current.position = 0;
        current.generation.assessmentMs = ms;
        return markShown(current);
      });
    }

    await Promise.allSettled([...(pendingGrades.get(session.id) ?? [])]);
    // Re-read after grading so the prompt sees the graded assessment.
    const graded = await updateSession(session.id, (current) => current);
    const laterItems = topic && graded.form ? [...fixedFinalCheck(topic, graded.form), fixedBonus(topic)] : [];
    const generated = await generateSteps(graded, messages, topic, laterItems);
    const ms = Date.now() - started;
    console.log(`Tutor: steps ready in ${ms}ms`);
    return await updateSession(session.id, (current) => {
      if (!current.battery) throw new TutorStateError("No assessment");
      current.battery.steps = generated.steps;
      current.battery.finalCheck =
        topic && current.form ? laterItems.slice(0, 2) : (generated.finalCheck ?? []);
      current.battery.bonus = topic && current.form ? laterItems[2] : undefined;
      current.position = 0;
      current.stepProgress = [newStepProgress(generated.steps[0])];
      current.generation.stepsMs = ms;
      return markShown(current);
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Tutor: ${part} build failed`, error);
    return updateSession(session.id, (current) => {
      current.generation.error = message;
      return current;
    });
  }
}

// ---------------------------------------------------------------------------------------
// Learner actions.

export interface AnswerInput {
  questionId: string;
  optionIndex?: number;
  text?: string;
  confidence?: Confidence;
}

function recordFor(session: TutorSession, question: TutorQuestion): AnswerRecord {
  let record = session.answers.find((answer) => answer.questionId === question.id);
  if (!record) {
    record = { questionId: question.id, role: question.role, attempts: [] };
    session.answers.push(record);
  }
  return record;
}

function responseText(question: TutorQuestion, input: AnswerInput): string {
  if (question.kind === "multiple_choice") {
    const option = input.optionIndex === undefined ? undefined : question.options?.[input.optionIndex];
    if (!option) throw new TutorStateError("Choose an option");
    return option.text;
  }
  const text = input.text?.trim();
  if (!text) throw new TutorStateError("Write an answer");
  return text;
}

// Moves past a check or self-report item, into the next section when needed.
function advanceItem(session: TutorSession): TutorSession {
  const battery = session.battery!;
  session.position += 1;
  if (session.status === "assessing" && session.position >= battery.assessment.length) {
    session.status = "teaching";
    session.position = 0;
  } else if (session.status === "final_check") {
    const finalLength = battery.finalCheck?.length ?? 0;
    const lastPosition = battery.bonus ? finalLength : finalLength - 1;
    if (session.position > lastPosition) session.status = "wrap_up";
  }
  return markShown(session);
}

function revealFor(question: TutorQuestion): NonNullable<AnswerRecord["reveal"]> {
  const correct = question.options?.find((option) => option.correct);
  return {
    via: "show_me",
    answer: correct?.text ?? "",
    explanation: question.answer ?? "",
  };
}

export async function submitAnswer(session: TutorSession, input: AnswerInput): Promise<TutorSession> {
  const item = currentItem(session);
  if (!item || item.question.id !== input.questionId) throw new TutorStateError("That question isn't active");
  const { question } = item;
  const response = responseText(question, input);
  const topic = getTopic(session.topicId);
  const at = new Date().toISOString();

  if (question.role !== "practice") {
    if (question.role === "check" && !input.confidence) throw new TutorStateError("Choose how sure you are");
    const grade = question.role === "check" && question.kind === "multiple_choice"
      ? gradeMultipleChoice(question, input.optionIndex!)
      : undefined;
    const updated = await updateSession(session.id, (current) => {
      const attempt: Attempt = { response, at, confidence: question.role === "check" ? input.confidence : undefined, ...grade };
      recordFor(current, question).attempts.push(attempt);
      return advanceItem(current);
    });
    if (question.role === "check" && question.kind === "freeform") gradeInBackground(session.id, question, response);
    // The steps can start generating as soon as the assessment is done.
    if (pendingBuild(updated) === "steps") void ensureBuilt(updated);
    return updated;
  }

  const progress = item.progress!;
  if (progress.done) throw new TutorStateError("This step is finished");
  if (progress.misses > 0 && question.id === item.step!.question.id) {
    throw new TutorStateError("Try the similar question instead");
  }
  const grade: Grade = question.kind === "multiple_choice"
    ? gradeMultipleChoice(question, input.optionIndex!)
    : await gradeFreeform(question, response, topic);

  return updateSession(session.id, (current) => {
    const step = current.stepProgress[current.position];
    if (step.activeQuestionId !== question.id || step.done) throw new TutorStateError("That question isn't active");
    const record = recordFor(current, question);
    record.attempts.push({ response, at, ...grade });

    let result = grade.result;
    if (result === "partial") {
      if (!step.partialRetryUsed) {
        step.partialRetryUsed = true;
        return current;
      }
      result = "incorrect";
    }
    if (result === "correct") {
      step.done = true;
      step.mastered = !step.revealed;
      return current;
    }
    step.misses += 1;
    if (step.misses >= 2) {
      record.reveal = { ...revealFor(question), via: "auto_after_two_misses" };
      step.revealed = true;
      step.done = true;
    }
    return current;
  });
}

function gradeInBackground(sessionId: string, question: TutorQuestion, response: string) {
  const grades = pendingGrades.get(sessionId) ?? new Set();
  pendingGrades.set(sessionId, grades);
  const grading = (async () => {
    const session = await updateSession(sessionId, (current) => current);
    const grade = await gradeFreeform(question, response, getTopic(session.topicId));
    await updateSession(sessionId, (current) => {
      const attempt = current.answers.find((answer) => answer.questionId === question.id)?.attempts.at(-1);
      if (attempt) Object.assign(attempt, grade);
      return current;
    });
  })()
    .catch((error) => console.error("Tutor: background grading failed", error))
    .finally(() => grades.delete(grading));
  grades.add(grading);
}

export function reveal(session: TutorSession, questionId: string, via: "show_me" | "show_answer") {
  const item = currentItem(session);
  if (!item || item.section !== "step" || item.question.id !== questionId) {
    throw new TutorStateError("Answers can only be shown on practice questions");
  }
  if (via === "show_answer" && item.progress!.misses === 0) throw new TutorStateError("Nothing to show yet");
  return updateSession(session.id, (current) => {
    const step = current.stepProgress[current.position];
    const question = currentItem(current)!.question;
    recordFor(current, question).reveal = { ...revealFor(question), via };
    step.revealed = true;
    step.done = true;
    step.mastered = false;
    return current;
  });
}

export function requestExplain(session: TutorSession, questionId: string) {
  const item = currentItem(session);
  if (!item || item.section !== "step" || item.question.id !== questionId || item.progress!.misses === 0) {
    throw new TutorStateError("Nothing to explain yet");
  }
  return updateSession(session.id, (current) => {
    current.stepProgress[current.position].explainRequested = true;
    return current;
  });
}

function canTryParallel(session: TutorSession, item: CurrentItem): boolean {
  if (item.section !== "step" || !item.step || !item.progress) return false;
  const correct = session.answers
    .find((answer) => answer.questionId === item.question.id)
    ?.attempts.some((attempt) => attempt.result === "correct");
  return item.question.id === item.step.question.id && item.progress.misses === 1 && !correct;
}

export function tryParallel(session: TutorSession) {
  const item = currentItem(session);
  if (!item || !canTryParallel(session, item)) throw new TutorStateError("No similar question to try");
  return updateSession(session.id, (current) => {
    const step = current.stepProgress[current.position];
    step.activeQuestionId = current.battery!.steps![current.position].parallel.id;
    step.partialRetryUsed = false;
    step.done = false;
    return markShown(current);
  });
}

// Next step, or skipping the optional bonus. Checks move on by themselves when answered.
export function advance(session: TutorSession, fromQuestionId: string | undefined) {
  if (fromQuestionId !== session.currentQuestionId) throw new TutorStateError("Already moved on");
  const item = currentItem(session);
  if (item?.section === "bonus") {
    return updateSession(session.id, (current) => {
      current.status = "wrap_up";
      return markShown(current);
    });
  }
  if (item?.section !== "step" || !item.progress?.done) throw new TutorStateError("Finish this step first");
  return updateSession(session.id, (current) => {
    const steps = current.battery!.steps!;
    current.position += 1;
    if (current.position >= steps.length) {
      current.status = "final_check";
      current.position = 0;
    } else {
      current.stepProgress[current.position] ??= newStepProgress(steps[current.position]);
    }
    return markShown(current);
  });
}

// ---------------------------------------------------------------------------------------
// The client's view: no answer keys, rationales or check results.

export interface PublicQuestion {
  id: string;
  prompt: string;
  kind: TutorQuestion["kind"];
  role: TutorQuestion["role"];
  resource?: string;
  options?: string[];
}

function publicQuestion(question: TutorQuestion): PublicQuestion {
  return {
    id: question.id,
    prompt: question.prompt,
    kind: question.kind,
    role: question.role,
    resource: question.resource,
    options: question.options?.map((option) => option.text),
  };
}

// Whether the learner can submit (first try, or the one retry after a partial answer), or
// has missed and now chooses Show answer / Explain my thinking.
function practiceTurn(record: AnswerRecord | undefined, done: boolean) {
  const attempts = record?.attempts ?? [];
  const last = attempts.at(-1);
  const partials = attempts.filter((attempt) => attempt.result === "partial").length;
  const canSubmit = !done && (!last || (last.result === "partial" && partials === 1));
  return { canSubmit, missed: !done && !canSubmit };
}

export function publicSession(session: TutorSession) {
  const topic = getTopic(session.topicId);
  const item = currentItem(session);
  const steps = session.battery?.steps;
  let current;
  if (item) {
    const record = session.answers.find((answer) => answer.questionId === item.question.id);
    const practice = item.section === "step";
    current = {
      section: item.section,
      stepIndex: item.stepIndex,
      step: item.step && {
        instruction: item.step.instruction,
        artifact: item.step.artifact,
        bloomLevel: item.step.bloomLevel,
      },
      question: publicQuestion(item.question),
      // Results are only shown on practice questions.
      attempts: practice
        ? (record?.attempts ?? []).map(({ response, result, feedback }) => ({ response, result, feedback }))
        : [],
      reveal: practice ? record?.reveal : undefined,
      practice: item.progress && {
        misses: item.progress.misses,
        done: item.progress.done,
        ...practiceTurn(record, item.progress.done),
        onParallel: item.question.id !== item.step?.question.id,
        explainRequested: item.progress.explainRequested,
        canTryParallel: canTryParallel(session, item),
      },
    };
  }

  const finalCount = session.battery?.finalCheck?.length ?? 2;
  return {
    id: session.id,
    status: session.status,
    subject: topic?.title ?? session.subject,
    mode: session.mode,
    requestedMode: session.requestedMode,
    offerMessageId: session.offerMessageId,
    scoping: session.scoping,
    building: pendingBuild(session),
    generationError: session.generation.error,
    counts: {
      assessment: session.battery?.assessment.length ?? 3,
      steps: steps?.length ?? 3,
      finalCheck: finalCount,
      bonus: Boolean(session.battery?.bonus),
    },
    position: session.position,
    current,
  };
}

// ---------------------------------------------------------------------------------------
// What the tutor is told about the workbook on each chat turn.

const SECTION_LABELS: Record<Section, string> = {
  assessment: "Opening check",
  step: "Teaching step",
  final: "Final check",
  bonus: "Bonus question (optional)",
};

function attemptLine(attempt: Attempt, showResult: boolean): string {
  const result = showResult && attempt.result ? ` -> ${attempt.result}` : "";
  const feedback = showResult && attempt.feedback ? ` (workbook feedback: "${attempt.feedback}")` : "";
  return `- "${attempt.response}"${result}${feedback}`;
}

export function describeWorkbook(session: TutorSession, draft: WorkbookDraft | undefined): string {
  if (session.status === "scoping") return "Empty. The workbook is built after scoping (goal and time).";
  if (pendingBuild(session)) {
    return session.generation.error
      ? "The workbook failed to build. The learner can retry from the workbook."
      : session.status === "assessing"
        ? "The opening check is being prepared."
        : "The opening check is done. The 3 teaching steps are being generated from it.";
  }
  if (session.status === "wrap_up") return "The learner has finished the whole workbook.";

  const item = currentItem(session);
  if (!item) return "Nothing is on screen.";
  const lines: string[] = [];
  const isCheck = item.question.role !== "practice";

  if (item.section === "step") {
    lines.push(`${SECTION_LABELS.step} ${item.stepIndex! + 1} of ${session.battery!.steps!.length} (practice: help freely).`);
    lines.push(`Instruction shown:\n${item.step!.instruction}`);
    if (item.step!.artifact) lines.push(`Visual: ${item.step!.artifact.title}. ${item.step!.artifact.description}`);
    if (item.progress!.activeQuestionId !== item.step!.question.id) {
      lines.push("The learner missed the first question and is now on a similar (parallel) question.");
    }
  } else {
    const total = item.section === "assessment" ? session.battery!.assessment.length : session.battery!.finalCheck!.length;
    const number = item.section === "bonus" ? "" : ` ${session.position + 1} of ${total}`;
    lines.push(`${SECTION_LABELS[item.section]}${number} (${item.question.role === "self_report" ? "a self-report question, not graded" : "check: hints only, never give or confirm the answer"}).`);
  }

  if (item.question.resource) lines.push(`Reading shown with the question:\n${item.question.resource}`);
  lines.push(`Question:\n${describeItem(item.question, !isCheck)}`);
  if (!isCheck) {
    if (item.question.answer) lines.push(`Answer explanation (for you): ${item.question.answer}`);
    if (item.question.rubric) {
      lines.push(`Rubric (for you): 2 = ${item.question.rubric.full}; 1 = ${item.question.rubric.partial}; 0 = ${item.question.rubric.none}`);
    }
  }

  const record = session.answers.find((answer) => answer.questionId === item.question.id);
  if (record?.attempts.length) {
    lines.push(`Submitted so far:\n${record.attempts.map((attempt) => attemptLine(attempt, !isCheck)).join("\n")}`);
  }
  if (record?.reveal) lines.push("The answer has been shown to the learner in the workbook.");
  const lastResult = record?.attempts.at(-1)?.result;
  const turn = item.progress && practiceTurn(record, item.progress.done);
  if (turn?.missed) {
    lines.push(
      "The learner can't resubmit this question. The workbook now offers Show answer and Explain my thinking, then Try a similar question. Point them to those, not to resubmitting.",
    );
  }
  if (turn?.canSubmit && lastResult === "partial") {
    lines.push("The answer was partly right; the learner has one more try at this question in the workbook.");
  }
  if (item.progress?.done && !record?.reveal) lines.push("The learner has finished this step and can press Next.");

  if (draft?.questionId === item.question.id) {
    if (draft.selectedOption !== undefined && item.question.options?.[draft.selectedOption]) {
      const letter = String.fromCharCode(65 + draft.selectedOption);
      lines.push(`Selected but not submitted: ${letter}) ${item.question.options[draft.selectedOption].text}`);
    }
    if (draft.text?.trim()) lines.push(`Typed but not submitted: "${draft.text.trim()}"`);
  }

  const finishedSteps = session.stepProgress
    .slice(0, session.status === "teaching" ? session.position : undefined)
    .map((step, index) => `step ${index + 1} ${step.mastered ? "mastered" : step.revealed ? "answer shown, not mastered" : "done"}`);
  if (finishedSteps.length) lines.push(`Earlier steps: ${finishedSteps.join("; ")}.`);

  return lines.join("\n\n");
}
