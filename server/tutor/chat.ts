import type { Request, Response } from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { appendMessage, getConversation } from "../repo/conversations";
import { streamReply } from "../services/claude";
import { openEventStream } from "../services/sse";
import { tutorSystemPrompt } from "./prompts";
import { getLatestSession, updateSession } from "./repo";
import { describeWorkbook, ensureBuilt, isActive, publicSession, trackReply } from "./session";
import { getTopic } from "./topics";
import type { Conversation } from "../types";
import type { TutorSession, WorkbookDraft, WorkbookEvent } from "./types";

interface ChatBody {
  message?: string;
  event?: WorkbookEvent;
  workbook?: WorkbookDraft;
  retry?: boolean;
  // The fixed first line of the session's first message (client copy), sent with session_started.
  opening?: string;
  // "voice" when `message` is a speech-recognition transcript rather than typed text.
  origin?: "voice";
}

const OPENING_MAX_LENGTH = 300;

const EVENT_TYPES = new Set<WorkbookEvent["type"]>([
  "session_started",
  "step_started",
  "wrong_answer",
  "explain_my_thinking",
  "final_check_started",
  "battery_complete",
  "practice_started",
  "session_resumed",
]);

function readBody(body: unknown): ChatBody {
  if (typeof body !== "object" || body === null) return {};
  const { message, event, workbook, retry, opening, origin } = body as Record<string, unknown>;
  const parsedEvent =
    typeof event === "object" && event !== null && EVENT_TYPES.has((event as WorkbookEvent).type)
      ? (event as WorkbookEvent)
      : undefined;
  return {
    message: typeof message === "string" && message.trim() ? message.trim() : undefined,
    event: parsedEvent,
    workbook: typeof workbook === "object" && workbook !== null ? (workbook as WorkbookDraft) : undefined,
    retry: retry === true,
    opening:
      parsedEvent?.type === "session_started" && typeof opening === "string" && opening.trim()
        ? opening.trim().slice(0, OPENING_MAX_LENGTH)
        : undefined,
    origin: origin === "voice" ? "voice" : undefined,
  };
}

// Scoping asks for the goal, then the time available, and takes each answer as given (no
// confirming). A goal the opening question already states isn't asked for again.
const GOALS_IN_QUESTION: { pattern: RegExp; goal: string }[] = [
  { pattern: /\b(exams?|finals?|midterms?|quiz(zes)?)\b/i, goal: "An exam" },
  { pattern: /\b(homework|assignments?|problem sets?|coursework)\b/i, goal: "Homework" },
];

function goalIn(text: string): string | undefined {
  return GOALS_IN_QUESTION.find(({ pattern }) => pattern.test(text))?.goal;
}

// The question Tutor was offered after (or, failing that, the conversation's first).
function goalInQuestion(session: TutorSession, conversation: Conversation): string | undefined {
  const users = conversation.messages.filter((message) => message.role === "user");
  const question = users.find((message) => message.id === session.offerMessageId) ?? users[0];
  return goalIn(question?.content ?? "");
}

// "20 minutes", "an hour", "as long as it takes": an answer about time, whichever was asked.
const TIME_ANSWER =
  /\b(\d+|an?|one|two|three|five|ten|fifteen|twenty|thirty|forty|forty-five|sixty|half an?)[\s-]*(min|mins|minutes?|hours?|hrs?)\b|long as it takes|no (rush|time limit)/i;

// A tapped choice and a typed reply both answer the current question. A time given when the
// goal was asked counts as the time (with the goal too, if it names one: "exam, 20 minutes").
function recordScoping(session: TutorSession, message: string): TutorSession {
  const { scoping } = session;
  if (!scoping.goal && !scoping.time && TIME_ANSWER.test(message)) {
    scoping.time = message;
    scoping.goal = goalIn(message);
  } else if (!scoping.goal) scoping.goal = message;
  else if (!scoping.time) scoping.time = message;
  if (session.scoping.goal && session.scoping.time) {
    session.status = "assessing";
    session.position = 0;
  }
  return session;
}

function eventText(event: WorkbookEvent): string {
  switch (event.type) {
    case "session_started":
      return "[Workbook event: the learner chose Tutor mode.]";
    case "step_started":
      return `[Workbook event: step ${event.stepIndex + 1} appeared in the workbook.]`;
    case "wrong_answer":
      return "[Workbook event: the learner submitted a wrong answer on a practice question.]";
    case "explain_my_thinking":
      return "[Workbook event: the learner tapped Explain my thinking.]";
    case "final_check_started":
      return "[Workbook event: the final check started.]";
    case "battery_complete":
      return "[Workbook event: the learner finished the workbook.]";
    case "practice_started":
      return "[Workbook event: the More practice questions appeared in the workbook.]";
    case "session_resumed":
      return "[Workbook event: the learner resumed this Tutor session.]";
  }
}

function turnInstruction(body: ChatBody, session: TutorSession, scopedNow: boolean): string | undefined {
  const { event } = body;
  if (event?.type === "session_started") {
    const opening = body.opening
      ? `Your message starts with this fixed line, which the app has already written and shown: "${body.opening}" Continue straight after it; don't repeat it, introduce yourself again or greet them. `
      : "";
    const intro = `The learner just asked the question above and chose Tutor mode instead of a straight answer, so they haven't been given an answer. ${opening}Write your opening message: in one short sentence, say you'll work through their question together so they can solve ones like it`;
    const ask = session.scoping.goal
      ? `${intro} (their question shows they're working toward this: ${session.scoping.goal.toLowerCase()}); then ask how much time they have. Tappable choices appear below your message (about 10 minutes, about 20 minutes, as long as it takes).`
      : `${intro}; then ask what they're working toward. Tappable choices appear below your message (homework, an exam, curiosity). Ask only that; don't ask about time yet.`;
    return `${ask} Two short sentences in total. Don't answer or start solving their question.`;
  }
  if (session.status === "scoping" && session.scoping.goal && !session.scoping.time) {
    return `The learner's goal: "${session.scoping.goal}". Acknowledge it in a few words, then ask how much time they have. Tappable choices appear below your message (about 10 minutes, about 20 minutes, as long as it takes). One or two sentences. Ask only this.`;
  }
  if (session.status === "scoping" && session.scoping.time && !session.scoping.goal) {
    return `The learner has "${session.scoping.time}". That's their session length: acknowledge it in a few words, without asking about time again, then ask what they're working toward. Tappable choices appear below your message (homework, an exam, curiosity). One or two sentences.`;
  }
  if (scopedNow) {
    return `Scoping is done (goal: "${session.scoping.goal}", time: "${session.scoping.time}"). The workbook now shows a short opening check: one question about what feels unclear, then two questions. In at most two short sentences, tell the learner to start it in the workbook; that it's a check, so you can give hints but not answers; and that it's fine to guess. Don't ask them anything else.`;
  }
  switch (event?.type) {
    case "step_started":
      return `Step ${event.stepIndex + 1} appears in the workbook as soon as you finish. Introduce it in one short sentence: the one idea it covers and how it connects to what they've done so far. Point them to its visual in the workbook. Don't explain the content yourself or hint at the answer.`;
    case "wrong_answer":
      return "The learner just answered the practice question above incorrectly, and the workbook showed them one line of feedback. In one or two short sentences, be encouraging and ask one question that helps them see their error, without giving the answer. The workbook also offers Show answer and Explain my thinking.";
    case "explain_my_thinking":
      return "The learner tapped Explain my thinking on the practice question above. In one sentence, ask them to walk you through how they got their answer. Don't correct them yet. (After this discussion, the workbook offers them a similar question.)";
    case "final_check_started":
      return "The final check appears in the workbook as soon as you finish: two questions with no instruction before them, then an optional bonus question. In one short sentence, tell them it works like the opening check: hints only, and it's fine to be unsure.";
    case "battery_complete":
      return "The learner just finished the workbook's questions. The workbook now asks them to write a short summary of what they learned, and then shows yours. In one or two short sentences, congratulate them on what they worked through (without revealing any check answers or scores) and point them to the summary box in the workbook. Don't summarize the session yourself.";
    case "practice_started":
      return "The learner chose More practice, and a few more practice questions appear in the workbook as soon as you finish. They mix ideas from the session. In one sentence, tell them these are practice, so you can work through them together.";
    case "session_resumed":
      return "The learner just resumed this Tutor session after pausing it. In one sentence, welcome them back and say where they are in the workbook, using the workbook state above.";
    default:
      return undefined;
  }
}

// A spoken message in a voice session: the tutor checks whether it was meant for it.
function isVoiceTurn(body: ChatBody, session: TutorSession): boolean {
  return body.origin === "voice" && Boolean(body.message) && !body.event && session.mode === "voice";
}

// The Mute reminder is given once per session. The model decides whether a turn needs it; the
// server records that it was given (the reply names Mute) and then stops offering it.
const MUTE_MENTION = /\bmute\b/i;

function sendEvent(res: Response, event: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

export async function handleChat(req: Request<{ conversationId: string }>, res: Response) {
  const { conversationId } = req.params;
  const body = readBody(req.body);
  if (!body.message && !body.event) {
    res.status(400).json({ error: "message or event is required" });
    return;
  }
  let session = await getLatestSession(conversationId);
  if (!isActive(session)) {
    res.status(409).json({ error: "No active Tutor session" });
    return;
  }

  let conversation = await getConversation(conversationId);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  // A goal the learner's question already states isn't asked for.
  if (body.event?.type === "session_started" && session.status === "scoping" && !session.scoping.goal) {
    const goal = goalInQuestion(session, conversation);
    if (goal) {
      session = await updateSession(session.id, (current) => {
        current.scoping.goal ??= goal;
        return current;
      });
    }
  }

  let scopedNow = false;
  if (body.message) {
    const last = conversation.messages.at(-1);
    const alreadyStored = body.retry && last?.role === "user" && last.content === body.message;
    if (!alreadyStored) conversation = (await appendMessage(conversationId, "user", body.message)) ?? conversation;
    if (session.status === "scoping" && !body.event) {
      session = await updateSession(session.id, (current) => recordScoping(current, body.message!));
      scopedNow = session.status === "assessing";
      // Library topics build instantly; generated ones take a while, so the reply streams meanwhile.
      if (scopedNow) {
        const pending = ensureBuilt(session);
        if (session.topicId) session = await pending;
      }
    }
  }

  openEventStream(res);
  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abortController.abort();
  });
  // Exit waits for this, so its card goes after a reply it stopped.
  let replyStored = () => {};
  trackReply(conversationId, new Promise<void>((resolve) => (replyStored = resolve)));
  try {
    await streamTutorReply(res, { session, conversation, body, scopedNow, signal: abortController.signal });
  } finally {
    replyStored();
  }
}

interface ReplyInput {
  session: TutorSession;
  conversation: Conversation;
  body: ChatBody;
  scopedNow: boolean;
  signal: AbortSignal;
}

async function streamTutorReply(res: Response, { session, conversation, body, scopedNow, signal }: ReplyInput) {
  // The workbook may have changed (scoping recorded, assessment built).
  sendEvent(res, { type: "tutor_session", session: publicSession(session) });

  const system = tutorSystemPrompt({
    session,
    topic: getTopic(session.topicId),
    workbookState: describeWorkbook(session, body.workbook),
    turnInstruction: turnInstruction(body, session, scopedNow),
    voiceTurn: isVoiceTurn(body, session) ? { canRemindMute: !session.muteReminderAt } : undefined,
  });
  const messages: Anthropic.MessageParam[] = conversation.messages.map(({ role, content }) => ({ role, content }));
  // A workbook event isn't stored; it only asks the tutor to speak.
  if (body.event && !body.message) messages.push({ role: "user", content: eventText(body.event) });

  // The fixed opening line streams first and is stored as part of the reply.
  const prefix = body.opening ? `${body.opening} ` : "";
  if (prefix) sendEvent(res, { type: "text", text: prefix });

  const result = await streamReply({
    messages,
    system,
    signal,
    onText: (text) => sendEvent(res, { type: "text", text }),
  });

  if (result.type === "aborted") {
    if (result.text.trim()) await appendMessage(conversation.id, "assistant", prefix + result.text);
    return;
  }
  if (result.type === "done") {
    if (result.text) await appendMessage(conversation.id, "assistant", prefix + result.text);
    if (isVoiceTurn(body, session) && !session.muteReminderAt && MUTE_MENTION.test(result.text)) {
      await updateSession(session.id, (current) => ({ ...current, muteReminderAt: new Date().toISOString() }));
    }
    sendEvent(res, { type: "done" });
  } else {
    sendEvent(res, { type: result.type });
  }
  res.end();
}
