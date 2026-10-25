import type { Request, Response } from "express";
import type Anthropic from "@anthropic-ai/sdk";
import { appendMessage, getConversation } from "../repo/conversations";
import { streamReply } from "../services/claude";
import { tutorSystemPrompt } from "./prompts";
import { getLatestSession, updateSession } from "./repo";
import { describeWorkbook, ensureBuilt, isActive, publicSession } from "./session";
import { getTopic } from "./topics";
import type { TutorSession, WorkbookDraft, WorkbookEvent } from "./types";

interface ChatBody {
  message?: string;
  event?: WorkbookEvent;
  workbook?: WorkbookDraft;
  retry?: boolean;
}

const EVENT_TYPES = new Set<WorkbookEvent["type"]>([
  "session_started",
  "step_started",
  "wrong_answer",
  "explain_my_thinking",
  "final_check_started",
  "battery_complete",
]);

function readBody(body: unknown): ChatBody {
  if (typeof body !== "object" || body === null) return {};
  const { message, event, workbook, retry } = body as Record<string, unknown>;
  const parsedEvent =
    typeof event === "object" && event !== null && EVENT_TYPES.has((event as WorkbookEvent).type)
      ? (event as WorkbookEvent)
      : undefined;
  return {
    message: typeof message === "string" && message.trim() ? message.trim() : undefined,
    event: parsedEvent,
    workbook: typeof workbook === "object" && workbook !== null ? (workbook as WorkbookDraft) : undefined,
    retry: retry === true,
  };
}

// Scoping asks for the goal, then the time available. A tapped choice and a typed reply both
// answer the current question.
function recordScoping(session: TutorSession, message: string): TutorSession {
  if (!session.scoping.goal) session.scoping.goal = message;
  else if (!session.scoping.time) session.scoping.time = message;
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
  }
}

function turnInstruction(session: TutorSession, event: WorkbookEvent | undefined, scopedNow: boolean): string | undefined {
  if (event?.type === "session_started") {
    return `The learner just switched this conversation to Tutor mode. Write your opening message. First acknowledge that they already have an answer from earlier in the conversation, along the lines of "You have the answer. Let's make sure you could solve the next one." Then ask what they're working toward. Tappable choices appear below your message (homework, an exam, curiosity), and they can also type. Two or three sentences in total, and ask only this one question.`;
  }
  if (session.status === "scoping" && session.scoping.goal && !session.scoping.time) {
    return `The learner's goal: "${session.scoping.goal}". Acknowledge it in a few words, then ask how much time they have. Tappable choices appear below your message (about 10 minutes, about 20 minutes, as long as it takes). One or two sentences.`;
  }
  if (scopedNow) {
    return `Scoping is done (goal: "${session.scoping.goal}", time: "${session.scoping.time}"). The workbook now shows a short opening check: one question about what feels unclear, then two questions. In two sentences, tell the learner to start it in the workbook; that it's a check, so you can give hints but not answers; and that it's fine to guess. Don't ask them anything else.`;
  }
  switch (event?.type) {
    case "step_started":
      return `Step ${event.stepIndex + 1} just appeared in the workbook. Introduce it in one or two sentences: the one idea it covers and how it connects to what they've done so far. Point them to the instruction and question in the workbook. Don't explain the content yourself or hint at the answer.`;
    case "wrong_answer":
      return "The learner just answered the practice question above incorrectly, and the workbook showed them one line of feedback. In one or two sentences, be encouraging and ask one question that helps them see their error, without giving the answer. The workbook also offers Show answer and Explain my thinking.";
    case "explain_my_thinking":
      return "The learner tapped Explain my thinking on the practice question above. In one sentence, ask them to walk you through how they got their answer. Don't correct them yet. (After this discussion, the workbook offers them a similar question.)";
    case "final_check_started":
      return "The final check just started in the workbook: two questions with no instruction before them, then an optional bonus question. In one or two sentences, tell them it works like the opening check: hints only, and it's fine to be unsure.";
    case "battery_complete":
      return "The learner just finished the whole workbook. In two or three sentences, congratulate them on what they worked through (without revealing any check answers or scores) and tell them they can leave Tutor mode with Exit.";
    default:
      return undefined;
  }
}

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

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });
  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abortController.abort();
  });

  // The workbook may have changed (scoping recorded, assessment built).
  sendEvent(res, { type: "tutor_session", session: publicSession(session) });

  const system = tutorSystemPrompt({
    session,
    topic: getTopic(session.topicId),
    workbookState: describeWorkbook(session, body.workbook),
    turnInstruction: turnInstruction(session, body.event, scopedNow),
  });
  const messages: Anthropic.MessageParam[] = conversation.messages.map(({ role, content }) => ({ role, content }));
  // A workbook event isn't stored; it only asks the tutor to speak.
  if (body.event && !body.message) messages.push({ role: "user", content: eventText(body.event) });

  const result = await streamReply({
    messages,
    system,
    signal: abortController.signal,
    onText: (text) => sendEvent(res, { type: "text", text }),
  });

  if (result.type === "aborted") {
    if (result.text.trim()) await appendMessage(conversationId, "assistant", result.text);
    return;
  }
  if (result.type === "done") {
    if (result.text) await appendMessage(conversationId, "assistant", result.text);
    sendEvent(res, { type: "done" });
  } else {
    sendEvent(res, { type: result.type });
  }
  res.end();
}
