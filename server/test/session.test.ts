// Which part of the battery a session waits on. Pure state checks: nothing here calls Claude.

import assert from "node:assert/strict";
import { test } from "node:test";
import { pendingBuild } from "../tutor/session";
import type { StepProgress, TutorQuestion, TutorSession, TutorStep } from "../tutor/types";

const question = (id: string): TutorQuestion => ({ id, prompt: "?", kind: "multiple_choice", role: "practice" });

const step = (id: string, withParallel: boolean): TutorStep => ({
  id,
  instruction: "Look at the tree.",
  bloomLevel: "understand",
  knowledgeType: "conceptual",
  question: question(`${id}-q`),
  parallel: withParallel ? question(`${id}-p`) : undefined,
});

const progress = (fields: Partial<StepProgress> = {}): StepProgress => ({
  activeQuestionId: "step-1-q",
  misses: 1,
  partialRetryUsed: false,
  explainRequested: false,
  revealed: false,
  done: false,
  mastered: false,
  startedAt: "",
  ...fields,
});

function teaching(steps: TutorStep[], stepProgress: StepProgress[]): TutorSession {
  return {
    id: "s",
    conversationId: "c",
    userId: "u",
    subject: "base rates",
    reason: "",
    trigger: "keyword",
    mode: "text",
    previousSettings: { responseStyle: "default", voice: false },
    status: "teaching",
    scoping: {},
    battery: { itemSource: "fixed", assessment: [], steps },
    position: 0,
    answers: [],
    stepProgress,
    shownAt: {},
    generation: {},
    createdAt: "",
    updatedAt: "",
  };
}

test("a step's missing parallel question isn't waited on until the learner asks for it", () => {
  assert.equal(pendingBuild(teaching([step("step-1", false)], [progress()])), undefined);
});

test("asking for a parallel question that isn't written yet waits on it", () => {
  const session = teaching([step("step-1", false)], [progress({ parallelRequested: true })]);
  assert.equal(pendingBuild(session), "parallel");
});

test("a written parallel question needs no build", () => {
  const session = teaching([step("step-1", true)], [progress({ parallelRequested: true })]);
  assert.equal(pendingBuild(session), undefined);
});

test("reaching a step that isn't written yet waits on the steps", () => {
  const session = teaching([step("step-1", true)], [progress({ done: true })]);
  session.position = 1;
  assert.equal(pendingBuild(session), "steps");
});
