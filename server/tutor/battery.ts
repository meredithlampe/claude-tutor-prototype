import { randomUUID } from "node:crypto";
import Anthropic from "@anthropic-ai/sdk";
import type { StoredMessage } from "../types";
import { GENERATION_SYSTEM, describeItem, questionStem } from "./prompts";
import { sanitizeSvg } from "./svg";
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

// A fixed item's hand-drawn visual, cleaned like a generated one.
function fixedArtifact(item: TopicItem): TutorArtifact | undefined {
  if (!item.artifact) return undefined;
  const cleaned = sanitizeSvg(item.artifact.svg, item.artifact.title);
  if (!cleaned.ok) {
    console.warn(`Tutor: fixed item ${item.itemKey} visual rejected (${cleaned.reason})`);
    return undefined;
  }
  return { kind: "svg", title: item.artifact.title, description: item.artifact.description, content: cleaned.svg };
}

function fromTopicItem(item: TopicItem, role: TutorQuestion["role"]): TutorQuestion {
  return {
    artifact: fixedArtifact(item),
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

// The opening check's self-report question (S0), for library and generated topics alike.
export function selfReportPrompt(topicName: string): string {
  return `Which part of ${topicName} feels confusing?`;
}

// Form 1: A items in the assessment, F items in the final check. Form 2: the reverse.
export function fixedAssessment(topic: Topic, form: 1 | 2): TutorQuestion[] {
  const [first, second] = form === 1 ? ["A1", "A2"] as const : ["F1", "F2"] as const;
  return [
    {
      ...fromTopicItem({ ...topic.items.selfReport, prompt: selfReportPrompt(topic.name) }, "self_report"),
      context: topic.definition,
    },
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
    // Streamed because battery output (several steps with SVG) can be long.
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
    misconceptionTag: { type: "string", description: "A short snake_case tag for a wrong option's misconception; empty for the correct option." },
  },
};

// Always present (no null branches), so the output grammar stays small enough. Multiple
// choice leaves it empty.
const rubricSchema = {
  type: "object",
  additionalProperties: false,
  required: ["full", "partial", "none"],
  description: "Freeform only; empty strings for multiple choice.",
  properties: {
    full: { type: "string", description: "What a fully correct answer (2 points) includes." },
    partial: { type: "string", description: "What a partially correct answer (1 point) looks like." },
    none: { type: "string", description: "What an incorrect answer (0 points) looks like." },
  },
};

const artifactSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "description", "svg"],
  properties: {
    title: { type: "string", description: "A short title, shown as the visual's caption." },
    description: {
      type: "string",
      description: "For screen-reader users: what the visual shows, with its key labels and numbers, in 1 to 3 sentences.",
    },
    svg: { type: "string", description: "A complete, self-contained <svg> element that follows the visual rules." },
  },
};

// Shown above the instruction or prompt, so an item makes sense without its visual or the chat.
const scenarioDescription =
  'One plain sentence that states the situation and its numbers in words (e.g. "A thousand people take a screening test: 100 have the condition, the test flags 80 of them, and it also wrongly flags 180 healthy people."). The text after it doesn\'t repeat it.';

const questionSchema = {
  type: "object",
  additionalProperties: false,
  required: ["kind", "scenario", "prompt", "artifact", "options", "answer", "rubric"],
  properties: {
    kind: { type: "string", enum: ["multiple_choice", "freeform"] },
    scenario: {
      type: "string",
      description: `${scenarioDescription} Empty only for a step's question that asks about the step's own scenario and visual, shown right above it.`,
    },
    prompt: { type: "string", description: "One or two short sentences, after the scenario. Refers to the question's visual." },
    artifact: {
      ...artifactSchema,
      description: "The question's own visual: its scenario and given numbers, never its answer. All fields empty when it has none.",
    },
    options: {
      type: "array",
      description: "Multiple choice: exactly 4 options, exactly one correct. Freeform: empty.",
      items: optionSchema,
    },
    answer: {
      type: "string",
      description: "A worked explanation of the correct answer in 1 or 2 sentences, shown when the answer is revealed.",
    },
    rubric: rubricSchema,
  },
};

const BLOOM_LEVELS: BloomLevel[] = ["remember", "understand", "apply", "analyze", "evaluate", "create"];
const KNOWLEDGE_TYPES: KnowledgeType[] = ["factual", "conceptual", "procedural", "metacognitive"];

const stepSchema = {
  type: "object",
  additionalProperties: false,
  required: ["scenario", "instruction", "bloomLevel", "knowledgeType", "artifact", "question", "parallel"],
  properties: {
    scenario: { type: "string", description: scenarioDescription },
    instruction: {
      type: "string",
      description: "Markdown, 1 or 2 short sentences (under 40 words) after the scenario, that point at the step's visual.",
    },
    bloomLevel: { type: "string", enum: BLOOM_LEVELS },
    knowledgeType: { type: "string", enum: KNOWLEDGE_TYPES },
    artifact: artifactSchema,
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
  // Empty for none.
  misconceptionTag: string;
}

interface GeneratedArtifact {
  title: string;
  description: string;
  svg: string;
}

interface GeneratedQuestion {
  kind: TutorQuestion["kind"];
  // Empty only for a step's question about the step's own scenario.
  scenario: string;
  prompt: string;
  // An empty svg means none.
  artifact: GeneratedArtifact;
  options: GeneratedOption[];
  answer: string;
  // Empty strings for multiple choice.
  rubric: FreeformRubric;
}

interface GeneratedStep {
  scenario: string;
  instruction: string;
  bloomLevel: BloomLevel;
  knowledgeType: KnowledgeType;
  artifact: GeneratedArtifact;
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
  } else if (!question.rubric.full.trim()) {
    throw new Error(`${where}: freeform needs a rubric`);
  }
}

function toQuestion(
  question: GeneratedQuestion,
  role: TutorQuestion["role"],
  prefix: string,
  artifact: TutorArtifact | undefined,
  context: string | undefined,
): TutorQuestion {
  return {
    id: newId(prefix),
    prompt: question.prompt,
    context,
    kind: question.kind,
    role,
    artifact,
    // Generated options are shuffled so the correct one isn't always in the same place.
    options:
      question.kind === "multiple_choice"
        ? shuffle(question.options).map((option) => ({
            text: option.text,
            correct: option.correct,
            rationale: option.rationale,
            misconceptionTag: option.misconceptionTag.trim() || undefined,
          }))
        : undefined,
    answer: question.answer,
    rubric: question.kind === "freeform" ? question.rubric : undefined,
  };
}

type ArtifactResult = { artifact: TutorArtifact } | { reason: string };

function toArtifact(artifact: GeneratedArtifact): ArtifactResult {
  const title = artifact.title.trim();
  const description = artifact.description.trim();
  if (!title || !description) return { reason: "missing title or description" };
  const cleaned = sanitizeSvg(artifact.svg, title);
  if (!cleaned.ok) return { reason: cleaned.reason };
  return { artifact: { kind: "svg", title, description, content: cleaned.svg } };
}

// What a visual is for, so a redraw can match it.
interface VisualFor {
  label: string;
  // "instruction" visuals explain; "question" visuals show the scenario without the answer.
  kind: "instruction" | "question";
  text: string;
}

// A visual that fails validation (or a required one that's missing) gets one redraw. If that
// fails too, the item goes without it and its text stands alone.
async function checkedVisual(
  artifact: GeneratedArtifact | null,
  target: VisualFor,
  topic: Topic | undefined,
  required: boolean,
): Promise<TutorArtifact | undefined> {
  let reason = "it had none";
  if (artifact) {
    const first = toArtifact(artifact);
    if ("artifact" in first) return first.artifact;
    reason = `it was rejected: ${first.reason}`;
  } else if (!required) {
    return undefined;
  }
  console.warn(`Tutor: ${target.label} visual needed a redraw (${reason})`);
  try {
    const redrawn = toArtifact(await redrawVisual(target, reason, topic));
    if ("artifact" in redrawn) return redrawn.artifact;
    console.warn(`Tutor: ${target.label} redraw rejected (${redrawn.reason}); no visual`);
  } catch {
    console.warn(`Tutor: ${target.label} redraw failed; no visual`);
  }
  return undefined;
}

function redrawVisual(target: VisualFor, reason: string, topic: Topic | undefined) {
  const prompt = `A workbook ${target.kind === "instruction" ? "step" : "question"} needs a visual (${reason}). Draw one that matches this text exactly:
"""${target.text}"""
${target.kind === "question" ? "\nIt shows the question's scenario and given numbers only, never the answer or a solved result.\n" : ""}${topic ? `\nVisual ideas for this topic:\n${topic.visualSuggestions.map((idea) => `- ${idea}`).join("\n")}\n` : ""}
${VISUAL_RULES}`;
  return structuredCall<GeneratedArtifact>("visual redraw", prompt, artifactSchema, "low");
}

function questionText(question: GeneratedQuestion): string {
  const options = question.options.map((option, index) => `${String.fromCharCode(65 + index)}) ${option.text}`);
  return [questionStem({ context: question.scenario, prompt: question.prompt }), ...options].join("\n");
}

// Every practice item stands alone: a scenario sentence states the situation and its numbers
// before any text that refers to the visual. A missing one gets one short call to write it; if
// that fails too, the build fails and the workbook offers a retry.
async function checkedScenario(
  scenario: string,
  target: { label: string; text: string; visual?: string },
  required: boolean,
): Promise<string | undefined> {
  const given = scenario.trim();
  if (given || !required) return given || undefined;
  console.warn(`Tutor: ${target.label} had no scenario; writing one`);
  const prompt = `A workbook practice item is missing its scenario sentence, so it doesn't make sense on its own. Write it. ${scenarioDescription}
Use only facts and numbers already in the item and its visual; add nothing new, and don't give away the answer.

The item:
"""${target.text}"""
${target.visual ? `\nIts visual: ${target.visual}\n` : ""}`;
  const repaired = await structuredCall<{ scenario: string }>(
    "scenario repair",
    prompt,
    {
      type: "object",
      additionalProperties: false,
      required: ["scenario"],
      properties: { scenario: { type: "string" } },
    },
    "low",
  );
  const written = repaired.scenario.trim();
  if (!written) throw new Error(`${target.label}: no scenario`);
  return written;
}

interface QuestionNeeds {
  // It must have its own visual (everything except a step's question, which can use the
  // step's visual above it).
  visual: boolean;
  // It must have its own scenario. A practice question with its own visual (a new scenario)
  // always does.
  scenario: boolean;
}

// A generated question with its visual and scenario checked.
async function checkedQuestion(
  question: GeneratedQuestion,
  role: TutorQuestion["role"],
  prefix: string,
  topic: Topic | undefined,
  needs: QuestionNeeds,
): Promise<TutorQuestion> {
  const ownVisual = question.artifact.svg.trim() ? question.artifact : null;
  const [artifact, context] = await Promise.all([
    checkedVisual(ownVisual, { label: prefix, kind: "question", text: questionText(question) }, topic, needs.visual),
    checkedScenario(
      question.scenario,
      { label: prefix, text: questionText(question), visual: ownVisual?.description },
      needs.scenario || (role === "practice" && Boolean(ownVisual)),
    ),
  ]);
  return toQuestion(question, role, prefix, artifact, context);
}

// ---------------------------------------------------------------------------------------
// Prompts for generation.

const OPENING_LIMIT = 4000;

// The question that started the session. Tutor is offered instead of an answer, so the
// learner hasn't been given one.
function openingExchange(messages: StoredMessage[]): string {
  const firstUser = messages.find((message) => message.role === "user");
  const clip = (text = "") => (text.length > OPENING_LIMIT ? `${text.slice(0, OPENING_LIMIT)}…` : text);
  return `The learner's question, which started this session (they haven't been given an answer):\n"""${clip(firstUser?.content)}"""`;
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

// Shared by every call that draws visuals.
const VISUAL_RULES = `Visual rules. Each visual is a simple SVG diagram (a frequency tree, icon array, flowchart, graph, number line, labelled figure or a plain picture of a situation). Where the topic lists visual ideas, use them. Visuals carry the explanation, so the text around them stays short.
- A step's visual shows the step's one idea; the instruction points at it. A question's visual shows the question's scenario and given numbers, never its answer or a solved result.
- Root element: <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 W H">, with W from 360 to 480 (400 is ideal) and H no more than 1.2 times W. No width or height attributes.
- Padding: keep everything, including the full width of every label, at least 16 units inside the viewBox. A label is about 0.55 times its font size wide per character, so check that long labels fit, and split them over two lines with <tspan x="…" dy="1.2em"> when they don't. Don't rotate or transform text.
- Text: font-family="system-ui, sans-serif"; font-size 16 for labels, 18 to 20 for headings and key numbers, never below 14. Labels are a few words.
- Colours: it's shown on a dark background (#1d1d1d), so don't draw a background rect. Text #EDECE9; secondary text #BBBAAF; lines and axes #8A8983; accents #E8906F (orange), #7DB4EA (blue), #8DC891 (green), #E6C46A (yellow). Boxes behind text: fill #2A2A28 with an accent or #8A8983 stroke. Never put text on a light fill.
- Don't rely on colour alone: label groups directly or with a legend, and also vary shape or fill (solid versus outlined).
- First children: <title> (the visual's title) and <desc> (its text description).
- Self-contained and small: no scripts, event handlers, <style>, <image>, <foreignObject>, links or external references. Keep it under 8 KB. For many repeated marks (like an icon array of 1,000 people), fill a rect with a <pattern> or <use> one shape from <defs>; never write hundreds of separate elements.
- Every number in the visual matches the text and is arithmetically correct.`;

const MC_RULES = `Multiple choice: exactly 4 short options and exactly one correct. Each wrong option's rationale names the misconception behind it in one sentence, written to the learner, without giving away the right answer. The correct option's rationale says briefly why it's right.`;

function stepRules(first: boolean): string {
  return `Write ${first ? "step 1" : "steps 2 and 3"} of 3 teaching steps. Rules:
- Steps climb Bloom's levels: step 1 "understand", step 2 "apply", step 3 "analyze" or "evaluate". Each step teaches one idea${first ? "" : ", building on step 1 without repeating it"}.
- Every step opens with a scenario: one plain sentence that states the situation and its numbers in words, so the step makes sense to someone who can't see the visual and hasn't read the chat (e.g. "A thousand people take a screening test: 100 have the condition, the test flags 80 of them, and it also wrongly flags 180 healthy people."). It comes before any text that refers to the visual.
- Instruction: after the scenario, 1 or 2 short sentences (under 40 words) that point at the step's visual, e.g. "Of the 1,000 people in the grid, find the ones who test positive." The visual does the explaining.
- Every step has a visual (see the visual rules).
- Then one question that checks the step's idea, in one or two short sentences. Steps 1 and 2 are multiple choice. ${MC_RULES}
- Step 3 is freeform, asking the learner to explain in their own words ("explain why…", "spot the error in…"), with a rubric for 2 / 1 / 0 points. Set options to [].
- Question visuals: when the step's question asks about the step's scenario and visual (shown right above it), leave the question's scenario and artifact fields empty. When it uses a new scenario, give it its own scenario sentence and its own visual.
- Each step also has a parallel question: same idea, same kind, similar difficulty, but a different scenario or numbers, so it can't be answered by eliminating options already tried. It's shown on its own, so every parallel question has its own scenario sentence and its own visual of that scenario.
- Pitch the steps at the level the opening check showed, aiming for about 80% first-try success. Build toward the learner's own question, without solving it outright.
- Every question must have one defensible correct answer. Double-check any arithmetic.

${VISUAL_RULES}`;
}

export async function generateAssessment(
  session: TutorSession,
  messages: StoredMessage[],
  topic: Topic | undefined,
): Promise<TutorQuestion[]> {
  const prompt = `Subject: ${session.subject}
Learner's goal: ${session.scoping.goal ?? "not given"}. Time available: ${session.scoping.time ?? "not given"}.

${openingExchange(messages)}

Write the opening check for a short Tutor session on this subject:
1. A self-report question, "${selfReportPrompt(session.subject)}": a definition (one plain sentence saying what the subject is, for an adult non-expert, shown above the question) and 3 or 4 short options naming parts of the subject, the last being "Not sure". No visual.
2. Two probe questions that show what the learner understands now: one multiple choice ("apply" level; ${MC_RULES}) and one freeform ("understand" level, explain in their own words, with a rubric). Each probe has its own visual that pictures the scenario plainly and never gives away the answer.
Use a different scenario from the learner's question, so the probes test transfer.

${VISUAL_RULES}`;

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["selfReport", "probes"],
    properties: {
      selfReport: {
        type: "object",
        additionalProperties: false,
        required: ["definition", "options"],
        properties: {
          definition: { type: "string", description: "One plain sentence saying what the subject is." },
          options: { type: "array", items: { type: "string" } },
        },
      },
      probes: { type: "array", items: questionSchema },
    },
  };

  const result = await structuredCall<{
    selfReport: { definition: string; options: string[] };
    probes: GeneratedQuestion[];
  }>("assessment", prompt, schema, "medium");

  if (result.probes.length !== 2) throw new Error("assessment: expected 2 probes");
  result.probes.forEach((probe, index) => checkQuestion(probe, `assessment probe ${index + 1}`));
  const probes = await Promise.all(
    result.probes.map((probe, index) => checkedQuestion(probe, "check", `probe${index + 1}`, topic, { visual: true, scenario: false })),
  );
  return [
    {
      id: newId("self-report"),
      prompt: selfReportPrompt(session.subject),
      context: result.selfReport.definition.trim() || undefined,
      kind: "multiple_choice",
      role: "self_report",
      options: result.selfReport.options.map((text) => ({ text })),
    },
    ...probes,
  ];
}

export interface GeneratedSteps {
  steps: TutorStep[];
  // Only for subjects outside the library, with the later steps.
  finalCheck?: TutorQuestion[];
}

export const STEP_COUNT = 3;

// The steps are written in two calls, so the learner can start sooner: step 1 first, then
// steps 2 and 3 (given step 1) in the background while the learner works on it.
export async function generateSteps(
  session: TutorSession,
  messages: StoredMessage[],
  topic: Topic | undefined,
  laterItems: TutorQuestion[],
  earlier: TutorStep[],
): Promise<GeneratedSteps> {
  const first = earlier.length === 0;
  const count = first ? 1 : STEP_COUNT - earlier.length;
  const withFinalCheck = !topic && !first;
  const avoid = laterItems.length
    ? `\nThese questions come later in the session. Don't reuse their scenarios, numbers or wording:\n${laterItems.map((item) => `- ${questionStem(item)}`).join("\n")}\n`
    : "";
  const earlierText = first
    ? ""
    : `\nThe steps already written (the learner is working on them now):\n${earlier
        .map((step, index) => `Step ${index + 1} (${step.bloomLevel}): ${questionStem({ context: step.context, prompt: step.instruction })}\nVisual: ${step.artifact?.description ?? "none"}\nQuestion: ${questionStem(step.question)}`)
        .join("\n\n")}\n`;
  const finalRules = withFinalCheck
    ? `\nAlso write the final check: 2 questions, each parallel to one opening-check probe above (same kind and difficulty, different scenario or numbers), mixing ideas from the steps. ${MC_RULES} Freeform needs a rubric. Each has its own visual that pictures the scenario without giving away the answer.`
    : "";

  const prompt = `Subject: ${session.subject}${topic ? ` (library topic: ${topic.title})` : ""}
Learner's goal: ${session.scoping.goal ?? "not given"}. Time available: ${session.scoping.time ?? "not given"}.

${topic ? topicContext(topic) : "There are no vetted notes for this subject. Be careful to stay accurate."}

${openingExchange(messages)}

The learner's opening check (correct options marked; the learner's answers follow each):
${assessmentResults(session)}
${avoid}${earlierText}
${stepRules(first)}${finalRules}`;

  const schema = {
    type: "object",
    additionalProperties: false,
    required: withFinalCheck ? ["steps", "finalCheck"] : ["steps"],
    properties: {
      steps: { type: "array", items: stepSchema },
      ...(withFinalCheck ? { finalCheck: { type: "array", items: questionSchema } } : {}),
    },
  };

  const label = first ? "step 1" : "steps 2-3";
  const result = await structuredCall<{ steps: GeneratedStep[]; finalCheck?: GeneratedQuestion[] }>(
    label,
    prompt,
    schema,
    "medium",
  );

  if (result.steps.length !== count) throw new Error(`${label}: expected ${count}, got ${result.steps.length}`);
  result.steps.forEach((step, index) => {
    checkQuestion(step.question, `step ${earlier.length + index + 1}`);
    checkQuestion(step.parallel, `step ${earlier.length + index + 1} parallel`);
  });
  if (!first && result.steps.at(-1)?.question.kind !== "freeform") throw new Error("steps: step 3 must be freeform");
  if (withFinalCheck) {
    if (result.finalCheck?.length !== 2) throw new Error("final check: expected 2 questions");
    result.finalCheck.forEach((question, index) => checkQuestion(question, `final check ${index + 1}`));
  }

  const steps = await Promise.all(
    result.steps.map(async (step, index): Promise<TutorStep> => {
      const number = earlier.length + index + 1;
      const text = questionStem({ context: step.scenario, prompt: step.instruction });
      const [artifact, context, question, parallel] = await Promise.all([
        checkedVisual(step.artifact, { label: `step ${number}`, kind: "instruction", text }, topic, true),
        checkedScenario(step.scenario, { label: `step ${number}`, text, visual: step.artifact.description }, true),
        checkedQuestion(step.question, "practice", `step${number}`, topic, { visual: false, scenario: false }),
        checkedQuestion(step.parallel, "practice", `step${number}-parallel`, topic, { visual: true, scenario: true }),
      ]);
      return {
        id: `step-${number}`,
        context,
        instruction: step.instruction,
        artifact,
        bloomLevel: step.bloomLevel,
        knowledgeType: step.knowledgeType,
        question,
        parallel,
      };
    }),
  );
  const finalCheck = result.finalCheck
    ? await Promise.all(
        result.finalCheck.map((question, index) =>
          checkedQuestion(question, "check", `final${index + 1}`, topic, { visual: true, scenario: false }),
        ),
      )
    : undefined;
  return { steps, finalCheck };
}

// ---------------------------------------------------------------------------------------
// Matching a "tutor" request to the topic library, when its keywords don't settle it. The
// keyword path skips the main Claude call, so this quick call does the matching instead.

export async function matchSubject(
  message: string,
  topics: Topic[],
): Promise<{ subject: string; topicId: string | null }> {
  const prompt = `A learner asked for tutoring:
"""${message.slice(0, OPENING_LIMIT)}"""

Name the academic subject in a few words, and pick the matching library topic only if it clearly matches; otherwise null.
Library topics:
${topics.map((topic) => `- ${topic.id}: ${topic.title} (${topic.subjectArea})`).join("\n")}`;
  return structuredCall(
    "subject match",
    prompt,
    {
      type: "object",
      additionalProperties: false,
      required: ["subject", "topicId"],
      properties: {
        subject: { type: "string" },
        topicId: { anyOf: [{ type: "string", enum: topics.map((topic) => topic.id) }, { type: "null" }] },
      },
    },
    "low",
  );
}

// ---------------------------------------------------------------------------------------
// More practice, after the wrap-up: questions only, mixing the session's ideas.

export const MORE_PRACTICE_COUNT = 3;

// The questions are written in parallel calls, one each with its own visuals, which is much
// faster than one call writing all three.
export function generateMorePractice(
  session: TutorSession,
  topic: Topic | undefined,
  earlierItems: TutorQuestion[],
): Promise<TutorStep[]> {
  const kinds: TutorQuestion["kind"][] = ["multiple_choice", "multiple_choice", "freeform"];
  const stepCount = Math.max(1, session.battery?.steps?.length ?? 1);
  return Promise.all(
    kinds.map((kind, index) =>
      morePracticeQuestion(session, topic, earlierItems, { index, kind, focusStep: (index % stepCount) + 1 }),
    ),
  );
}

interface PracticeSlot {
  index: number;
  kind: TutorQuestion["kind"];
  // The step whose idea this question is mainly about, so the three questions differ.
  focusStep: number;
}

async function morePracticeQuestion(
  session: TutorSession,
  topic: Topic | undefined,
  earlierItems: TutorQuestion[],
  { index, kind, focusStep }: PracticeSlot,
): Promise<TutorStep> {
  const steps = session.battery?.steps ?? [];
  const results = session.stepProgress
    .map((progress, i) => `- Step ${i + 1}: ${progress.mastered ? "mastered" : progress.revealed ? "answer shown, not mastered" : "done"}`)
    .join("\n");
  const kindRule =
    kind === "multiple_choice"
      ? MC_RULES
      : "Freeform: ask the learner to explain or apply an idea in their own words, with a rubric for 2 / 1 / 0 points. Leave options empty.";
  const prompt = `Subject: ${session.subject}${topic ? ` (library topic: ${topic.title})` : ""}

${topic ? topicContext(topic) : "There are no vetted notes for this subject. Be careful to stay accurate."}

The learner finished a Tutor session with these teaching steps:
${steps.map((step, i) => `Step ${i + 1} (${step.bloomLevel}): ${questionStem({ context: step.context, prompt: step.instruction })}`).join("\n\n")}

How the steps went:
${results}

Their own summary of what they learned: """${session.learnerSummary ?? "(none)"}"""

They asked for more practice. Write ONE practice question (number ${index + 1} of ${MORE_PRACTICE_COUNT}; the others are written separately). Rules:
- Base it mainly on step ${focusStep}'s idea, mixed with another step's where natural, so the learner has to choose which idea applies (interleaved practice).
- It's shown on its own, so it opens with a scenario: one plain sentence that states the situation and its numbers in words, before any text that refers to the visual. Then the prompt: one or two short sentences that refer to the question's own visual of that scenario (see the visual rules).
- Use a new scenario and numbers. Don't reuse the scenarios, numbers or wording of these earlier questions:
${earlierItems.map((item) => `  - ${questionStem(item)}`).join("\n")}
- ${kindRule}
- Aim for about 80% first-try success, a little harder than the steps.
- Add a parallel question: same idea, same kind, similar difficulty, different scenario or numbers, with its own scenario sentence and its own visual.
- One defensible correct answer. Double-check any arithmetic.

${VISUAL_RULES}`;

  const itemSchema = {
    type: "object",
    additionalProperties: false,
    required: ["bloomLevel", "knowledgeType", "question", "parallel"],
    properties: {
      bloomLevel: { type: "string", enum: BLOOM_LEVELS },
      knowledgeType: { type: "string", enum: KNOWLEDGE_TYPES },
      question: questionSchema,
      parallel: questionSchema,
    },
  };

  const item = await structuredCall<Omit<GeneratedStep, "scenario" | "instruction" | "artifact">>(
    `more practice ${index + 1}`,
    prompt,
    itemSchema,
    "medium",
  );
  if (item.question.kind !== kind) throw new Error(`more practice ${index + 1}: expected ${kind}`);
  checkQuestion(item.question, `more practice ${index + 1}`);
  checkQuestion(item.parallel, `more practice ${index + 1} parallel`);
  const id = newId("practice");
  const [question, parallel] = await Promise.all([
    checkedQuestion(item.question, "practice", id, topic, { visual: true, scenario: true }),
    checkedQuestion(item.parallel, "practice", `${id}-parallel`, topic, { visual: true, scenario: true }),
  ]);
  return { id, instruction: "", bloomLevel: item.bloomLevel, knowledgeType: item.knowledgeType, question, parallel };
}

// ---------------------------------------------------------------------------------------
// The tutor's wrap-up summary, shown in the workbook after the learner's own.

export async function generateTutorSummary(session: TutorSession, topic: Topic | undefined): Promise<string> {
  const steps = session.battery?.steps ?? [];
  const prompt = `Subject: ${session.subject}${topic ? ` (library topic: ${topic.title})` : ""}

${topic ? topicContext(topic) : ""}

The learner just finished a Tutor session with these teaching steps:
${steps.map((step, index) => `Step ${index + 1}: ${step.instruction}`).join("\n\n")}

They wrote this summary of what they learned:
"""${session.learnerSummary ?? ""}"""

Write the tutor's summary, shown right below theirs in the workbook. Markdown, 60 to 110 words, addressed to the learner:
1. One sentence on what their summary got right, in specific terms.
2. The key ideas of the session as 2 to 4 short bullet points, stated accurately, including any important idea their summary left out or got wrong (say so gently).
3. One sentence on how to use this next time they meet a problem like this.
Don't mention scores, check results or which questions they got right, and don't add a greeting or sign-off.`;

  const result = await structuredCall<{ summary: string }>(
    "tutor summary",
    prompt,
    {
      type: "object",
      additionalProperties: false,
      required: ["summary"],
      properties: { summary: { type: "string" } },
    },
    "low",
  );
  return result.summary.trim();
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

Question: ${questionStem(question)}
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
