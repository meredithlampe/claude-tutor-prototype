import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { StoredMessage } from "../types";
import { GENERATION_SYSTEM, describeItem } from "./prompts";
import type {
  BloomLevel,
  FreeformRubric,
  GradeResult,
  KnowledgeType,
  Topic,
  TopicItem,
  TutorArtifact,
  TutorQuestion,
  TutorSession,
  TutorStep,
} from "./types";

// ---------------------------------------------------------------------------------------
// Fixed items from the topic library.

function newId(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8)}`;
}

function fromTopicItem(item: TopicItem, role: TutorQuestion["role"]): TutorQuestion {
  return {
    id: newId(item.itemKey.replace(/\W+/g, "-")),
    itemKey: item.itemKey,
    prompt: item.prompt,
    kind: item.kind,
    role,
    resource: item.resource,
    options: item.options?.map((option) => ({ ...option })),
    answer: item.answer,
    rubric: item.rubric,
  };
}

// Form 1: A items in the assessment, F items in the final check. Form 2: the reverse.
export function fixedAssessment(topic: Topic, form: 1 | 2): TutorQuestion[] {
  const [first, second] = form === 1 ? ["A1", "A2"] as const : ["F1", "F2"] as const;
  return [
    fromTopicItem(topic.items.selfReport, "self_report"),
    fromTopicItem(topic.items[first], "check"),
    fromTopicItem(topic.items[second], "check"),
  ];
}

export function fixedFinalCheck(topic: Topic, form: 1 | 2): TutorQuestion[] {
  const [first, second] = form === 1 ? ["F1", "F2"] as const : ["A1", "A2"] as const;
  return [fromTopicItem(topic.items[first], "check"), fromTopicItem(topic.items[second], "check")];
}

export function fixedBonus(topic: Topic): TutorQuestion {
  return fromTopicItem(topic.items.P1, "check");
}

// ---------------------------------------------------------------------------------------
// Structured-output calls. Same model and thinking settings as the chat (services/claude.ts).

let client: Anthropic | undefined;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

type Effort = "low" | "medium";

async function structuredCall<T>(
  label: string,
  prompt: string,
  schema: Record<string, unknown>,
  effort: Effort,
): Promise<T> {
  try {
    // Streamed because battery output (several steps, maybe with SVG) can be long.
    const final = await getClient()
      .messages.stream({
        model: "claude-opus-5-5",
        max_tokens: 32000,
        thinking: { type: "adaptive" },
        output_config: { effort, format: { type: "json_schema", schema } },
        system: GENERATION_SYSTEM,
        messages: [{ role: "user", content: prompt }],
      })
      .finalMessage();

    if (final.stop_reason === "refusal") throw new Error(`${label}: Claude declined`);
    if (final.stop_reason === "max_tokens") throw new Error(`${label}: output was cut off`);
    const text = final.content
      .filter((block): block is Anthropic.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");
    return JSON.parse(text) as T;
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) {
      console.error(`Tutor ${label}: rate limited (429).`);
    } else if (error instanceof Anthropic.BadRequestError) {
      console.error(`Tutor ${label}: bad request (400): ${error.message}`);
    } else if (error instanceof Anthropic.APIConnectionError) {
      console.error(`Tutor ${label}: connection error: ${error.message}`);
    } else if (error instanceof Anthropic.APIError) {
      console.error(`Tutor ${label}: API error (${error.status}): ${error.message}`);
    } else {
      console.error(`Tutor ${label}:`, error);
    }
    throw error;
  }
}

// ---------------------------------------------------------------------------------------
// Schemas.

const nullable = (schema: Record<string, unknown>) => ({ anyOf: [schema, { type: "null" }] });

const optionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["text", "correct", "rationale", "misconceptionTag"],
  properties: {
    text: { type: "string" },
    correct: { type: "boolean" },
    rationale: {
      type: "string",
      description:
        "One sentence shown to the learner after they pick this option. For a wrong option, name the misconception that leads to it, without giving the right answer.",
    },
    misconceptionTag: nullable({ type: "string", description: "A short snake_case tag for a wrong option's misconception." }),
  },
};

const rubricSchema = {
  type: "object",
  additionalProperties: false,
  required: ["full", "partial", "none"],
  properties: {
    full: { type: "string", description: "What a fully correct answer (2 points) includes." },
    partial: { type: "string", description: "What a partially correct answer (1 point) looks like." },
    none: { type: "string", description: "What an incorrect answer (0 points) looks like." },
  },
};

const questionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "prompt", "options", "answer", "rubric"],
  properties: {
    kind: { type: "string", enum: ["multiple_choice", "freeform"] },
    prompt: { type: "string" },
    options: {
      type: "array",
      description: "Multiple choice: exactly 4 options, exactly one correct. Freeform: empty.",
      items: optionSchema,
    },
    answer: {
      type: "string",
      description: "A worked explanation of the correct answer in 1 to 3 sentences, shown when the answer is revealed.",
    },
    rubric: nullable(rubricSchema),
  },
};

const BLOOM_LEVELS: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
const KNOWLEDGE_TYPES: KnowledgeType[] = ["factual", "conceptual", "procedural", "metacognitive"];

const stepSchema = {
  type: "object",
  additionalProperties: false,
  required: ["instruction", "bloomLevel", "knowledgeType", "artifact", "question", "parallel"],
  properties: {
    instruction: { type: "string", description: "Markdown, 2 to 5 sentences, one idea." },
    bloomLevel: { type: "string", enum: BLOOM_LEVELS },
    knowledgeType: { type: "string", enum: KNOWLEDGE_TYPES },
    artifact: nullable({
      type: "object",
      additionalProperties: false,
      required: ["title", "description", "svg"],
      properties: {
        title: { type: "string" },
        description: { type: "string", description: "A text description of the visual for screen-reader users." },
        svg: { type: "string", description: "A complete, self-contained <svg> element." },
      },
    }),
    question: questionSchema,
    parallel: questionSchema,
  },
};

// ---------------------------------------------------------------------------------------
// Converting and checking generated items.

interface GeneratedOption {
  text: string;
  correct: boolean;
  rationale: string;
  misconceptionTag: string | null;
}

interface GeneratedQuestion {
  kind: TutorQuestion["kind"];
  prompt: string;
  options: GeneratedOption[];
  answer: string;
  rubric: FreeformRubric | null;
}

interface GeneratedStep {
  instruction: string;
  bloomLevel: BloomLevel;
  knowledgeType: KnowledgeType;
  artifact: { title: string; description: string; svg: string } | null;
  question: GeneratedQuestion;
  parallel: GeneratedQuestion;
}

function shuffle<T>(items: T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function checkQuestion(question: GeneratedQuestion, where: string): void {
  if (question.kind === "multiple_choice") {
    const correct = question.options.filter((option) => option.correct).length;
    if (question.options.length < 3 || correct !== 1) {
      throw new Error(`${where}: multiple choice needs 3+ options with exactly one correct`);
    }
  } else if (!question.rubric) {
    throw new Error(`${where}: freeform needs a rubric`);
  }
}

function toQuestion(question: GeneratedQuestion, role: TutorQuestion["role"], prefix: string): TutorQuestion {
  return {
    id: newId(prefix),
    prompt: question.prompt,
    kind: question.kind,
    role,
    // Generated options are shuffled so the correct one isn't always in the same place.
    options:
      question.kind === "multiple_choice"
        ? shuffle(question.options).map((option) => ({
            text: option.text,
            correct: option.correct,
            rationale: option.rationale,
            misconceptionTag: option.misconceptionTag ?? undefined,
          }))
        : undefined,
    answer: question.answer,
    rubric: question.kind === "freeform" ? (question.rubric ?? undefined) : undefined,
  };
}

// The SVG is shown through <img>, where scripts never run. This only drops output that
// isn't a plain SVG document, so a bad visual can't break the step.
function toArtifact(artifact: GeneratedStep["artifact"]): TutorArtifact | undefined {
  if (!artifact) return undefined;
  const svg = artifact.svg.trim();
  if (!/^<svg[\s>]/i.test(svg) || !/<\/svg>$/i.test(svg)) return undefined;
  if (/<script|<foreignObject|\son\w+\s*=|href\s*=\s*["']?(?:https?:|javascript:)/i.test(svg)) {
    return undefined;
  }
  return { kind: "svg", title: artifact.title, description: artifact.description, content: svg };
}

// ---------------------------------------------------------------------------------------
// Prompts for generation.

const OPENING_LIMIT = 4000;

function openingExchange(messages: StoredMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  const firstAnswer = messages.find((message) => message.role === "assistant");
  const clip = (text = "") => (text.length > OPENING_LIMIT ? `${text.slice(0, OPENING_LIMIT)}…` : text);
  return `The learner's first message:\n"""${clip(firstUser?.content)}"""\n\nThe answer they already got from Claude:\n"""${clip(firstAnswer?.content)}"""`;
}

function topicContext(topic: Topic): string {
  const { notes } = topic;
  return `Vetted notes (stay consistent with these):
${notes.keyIdeas.map((idea) => `- ${idea}`).join("\n")}

Learning levels:
${Object.entries(notes.learningModel).map(([level, text]) => `- ${level}: ${text}`).join("\n")}

Misconceptions (use these tags for wrong options where they fit):
${notes.misconceptions.map((m) => `- ${m.tag}: ${m.description}`).join("\n")}

Accuracy caveats:
${notes.caveats.map((caveat) => `- ${caveat}`).join("\n")}

Visual ideas:
${topic.visualSuggestions.map((idea) => `- ${idea}`).join("\n")}`;
}

function assessmentResults(session: TutorSession): string {
  const assessment = session.battery?.assessment ?? [];
  return assessment
    .map((question) => {
      const record = session.answers.find((answer) => answer.questionId === question.id);
      const attempt = record?.attempts.at(-1);
      if (!attempt) return `${describeItem(question, true)}\nLearner: (no answer)`;
      const result =
        question.role === "self_report"
          ? ""
          : ` -> ${attempt.result ?? "not graded"}${attempt.misconceptionTag ? ` (${attempt.misconceptionTag})` : ""}${attempt.confidence ? `, confidence: ${attempt.confidence}` : ""}`;
      return `${describeItem(question, true)}\nLearner: "${attempt.response}"${result}`;
    })
    .join("\n\n");
}

const STEP_RULES = `Write exactly 3 teaching steps. Rules:
- One idea per step: a short instruction (markdown, 2 to 5 sentences), then one question that checks that idea.
- The steps climb Bloom's levels: step 1 "understand", step 2 "apply", step 3 "analyze" or "evaluate".
- Steps 1 and 2: multiple choice with exactly 4 options and exactly one correct. Each wrong option's rationale names the misconception behind it in one sentence, written to the learner, without giving away the right answer. The correct option's rationale says briefly why it's right.
- Step 3: freeform, asking the learner to explain in their own words ("explain why…", "spot the error in…"), with a rubric for 2 / 1 / 0 points. Set options to [].
- Pitch the steps at the level the opening check showed, aiming for about 80% first-try success. Build on the answer the learner already got; don't repeat it.
- Each step also has a parallel question: same idea, same kind, similar difficulty, but a different scenario or different numbers, so it can't be answered by eliminating the options the learner already tried.
- Visuals: include an artifact only when a simple diagram clearly helps the step's idea (otherwise null). If you include one, the instruction refers to it ("In the diagram…"). The SVG must be self-contained: a viewBox, a light background rect covering it, dark text in a sans-serif font at 14px or larger, no scripts, no external links or images, no foreignObject.
- Every question must have one defensible correct answer. Double-check any arithmetic.`;

export async function generateAssessment(
  session: TutorSession,
  messages: StoredMessage[],
): Promise<TutorQuestion[]> {
  const prompt = `Subject: ${session.subject}
Learner's goal: ${session.scoping.goal ?? "not given"}. Time available: ${session.scoping.time ?? "not given"}.

${openingExchange(messages)}

Write the opening check for a short Tutor session on this subject:
1. A self-report question asking what feels least clear about this subject, with 3 or 4 short options, the last being "Not sure".
2. Two probe questions that show what the learner understands now: one multiple choice ("apply" level, 4 options, exactly one correct, each wrong option tied to a common misconception) and one freeform ("understand" level, explain in their own words, with a rubric).
Use a different scenario from the learner's first message, so the probes test transfer rather than recall of the answer above.`;

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["selfReport", "probes"],
    properties: {
      selfReport: {
        type: "object",
        additionalProperties: false,
        required: ["prompt", "options"],
        properties: { prompt: { type: "string" }, options: { type: "array", items: { type: "string" } } },
      },
      probes: { type: "array", items: questionSchema },
    },
  };

  const result = await structuredCall<{
    selfReport: { prompt: string; options: string[] };
    probes: GeneratedQuestion[];
  }>("assessment", prompt, schema, "medium");

  if (result.probes.length !== 2) throw new Error("assessment: expected 2 probes");
  result.probes.forEach((probe, index) => checkQuestion(probe, `assessment probe ${index + 1}`));
  return [
    {
      id: newId("self-report"),
      prompt: result.selfReport.prompt,
      kind: "multiple_choice",
      role: "self_report",
      options: result.selfReport.options.map((text) => ({ text })),
    },
    ...result.probes.map((probe) => toQuestion(probe, "check", "probe")),
  ];
}

export interface GeneratedSteps {
  steps: TutorStep[];
  // Only for subjects outside the library.
  finalCheck?: TutorQuestion[];
}

export async function generateSteps(
  session: TutorSession,
  messages: StoredMessage[],
  topic: Topic | undefined,
  laterItems: TutorQuestion[],
): Promise<GeneratedSteps> {
  const withFinalCheck = !topic;
  const avoid = laterItems.length
    ? `\nThese questions come later in the session. Don't reuse their scenarios, numbers or wording:\n${laterItems.map((item) => `- ${item.prompt}`).join("\n")}\n`
    : "";
  const finalRules = withFinalCheck
    ? `\nAlso write the final check: 2 questions, each parallel to one opening-check probe above (same kind and difficulty, different scenario or numbers), mixing ideas from the steps. Multiple choice needs 4 options with exactly one correct; freeform needs a rubric. No instruction comes before them.`
    : "";

  const prompt = `Subject: ${session.subject}${topic ? ` (library topic: ${topic.title})` : ""}
Learner's goal: ${session.scoping.goal ?? "not given"}. Time available: ${session.scoping.time ?? "not given"}.

${topic ? topicContext(topic) : "There are no vetted notes for this subject. Be careful to stay accurate."}

${openingExchange(messages)}

The learner's opening check (correct options marked; the learner's answers follow each):
${assessmentResults(session)}
${avoid}
${STEP_RULES}${finalRules}`;

  const schema = {
    type: "object",
    additionalProperties: false,
    required: withFinalCheck ? ["steps", "finalCheck"] : ["steps"],
    properties: {
      steps: { type: "array", items: stepSchema },
      ...(withFinalCheck ? { finalCheck: { type: "array", items: questionSchema } } : {}),
    },
  };

  const result = await structuredCall<{ steps: GeneratedStep[]; finalCheck?: GeneratedQuestion[] }>(
    "steps",
    prompt,
    schema,
    "medium",
  );

  if (result.steps.length !== 3) throw new Error(`steps: expected 3, got ${result.steps.length}`);
  result.steps.forEach((step, index) => {
    checkQuestion(step.question, `step ${index + 1}`);
    checkQuestion(step.parallel, `step ${index + 1} parallel`);
  });
  if (result.steps[2].question.kind !== "freeform") throw new Error("steps: step 3 must be freeform");
  if (withFinalCheck) {
    if (result.finalCheck?.length !== 2) throw new Error("final check: expected 2 questions");
    result.finalCheck.forEach((question, index) => checkQuestion(question, `final check ${index + 1}`));
  }

  return {
    steps: result.steps.map((step, index) => ({
      id: `step-${index + 1}`,
      instruction: step.instruction,
      artifact: toArtifact(step.artifact),
      bloomLevel: step.bloomLevel,
      knowledgeType: step.knowledgeType,
      question: toQuestion(step.question, "practice", `step${index + 1}`),
      parallel: toQuestion(step.parallel, "practice", `step${index + 1}-parallel`),
    })),
    finalCheck: result.finalCheck?.map((question) => toQuestion(question, "check", "final")),
  };
}

// ---------------------------------------------------------------------------------------
// Grading.

export interface Grade {
  result: GradeResult;
  score: 0 | 1 | 2;
  feedback?: string;
  misconceptionTag?: string;
}

export function gradeMultipleChoice(question: TutorQuestion, optionIndex: number): Grade {
  const option = question.options?.[optionIndex];
  if (!option) throw new Error("No such option");
  return option.correct
    ? { result: "correct", score: 2, feedback: option.rationale }
    : { result: "incorrect", score: 0, feedback: option.rationale, misconceptionTag: option.misconceptionTag };
}

// Low effort: a short rubric judgment where response time matters to the learner.
export async function gradeFreeform(
  question: TutorQuestion,
  response: string,
  topic: Topic | undefined,
): Promise<Grade> {
  const tags = topic?.notes.misconceptions.map((m) => m.tag).join(", ");
  const prompt = `Grade a learner's freeform answer against the rubric.

Question: ${question.prompt}
Rubric:
- 2 points (correct): ${question.rubric?.full}
- 1 point (partially correct): ${question.rubric?.partial}
- 0 points (incorrect): ${question.rubric?.none}
Model answer: ${question.answer ?? "(none)"}

Learner's answer: """${response}"""

Grade the learner's ideas, not their spelling or wording. Write feedback as one or two sentences to the learner: for 1 point, say what's missing without giving the full answer; for 0 points, name the likely misconception without giving the answer; for 2 points, say briefly what they got right.${tags ? ` If a misconception fits, set misconceptionTag to one of: ${tags}.` : ""} Otherwise set it to null.`;

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["score", "feedback", "misconceptionTag"],
    properties: {
      score: { type: "integer", enum: [0, 1, 2] },
      feedback: { type: "string" },
      misconceptionTag: nullable({ type: "string" }),
    },
  };

  const graded = await structuredCall<{ score: 0 | 1 | 2; feedback: string; misconceptionTag: string | null }>(
    "grading",
    prompt,
    schema,
    "low",
  );
  const result: GradeResult = graded.score === 2 ? "correct" : graded.score === 1 ? "partial" : "incorrect";
  return {
    result,
    score: graded.score,
    feedback: graded.feedback,
    misconceptionTag: graded.misconceptionTag ?? undefined,
  };
}
