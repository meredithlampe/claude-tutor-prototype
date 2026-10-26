import { Router, type Request, type Response } from "express";
import { appendMessage, getConversation } from "../repo/conversations";
import { getUser } from "../repo/user";
import { streamReply } from "../services/claude";
import { handleChat } from "./chat";
import { getLatestSession, getTutorUser, listSessions, updateSession, updateTutorUser } from "./repo";
import {
  advance,
  ensureBuilt,
  exitSession,
  isActive,
  publicSession,
  requestExplain,
  resumeSession,
  reveal,
  setDelayedCheckConsent,
  setMode,
  startMorePractice,
  submitAnswer,
  submitSummary,
  tryParallel,
  TutorStateError,
  type AnswerInput,
} from "./session";
import type { Confidence, TutorMode, TutorSession } from "./types";
import { voiceProvider, voiceProviderId, VoiceProviderError } from "./voice";

type Params = { conversationId: string };

export const tutorRouter = Router();

function field(body: unknown, key: string): unknown {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// Runs a learner action on the conversation's active session (or, with `allow`, a session
// in another state) and responds with the new view.
async function withActiveSession(
  req: Request<Params>,
  res: Response,
  action: (session: TutorSession) => Promise<TutorSession>,
  allow: (session: TutorSession) => boolean = isActive,
) {
  const session = await getLatestSession(req.params.conversationId);
  if (!session || !allow(session)) {
    res.status(409).json({ error: "No active Tutor session", session: session ? publicSession(session) : undefined });
    return;
  }
  try {
    res.json({ session: publicSession(await action(session)) });
  } catch (error) {
    if (error instanceof TutorStateError) {
      res.status(409).json({ error: error.message, session: publicSession(session) });
      return;
    }
    console.error("Tutor: action failed", error);
    res.status(500).json({ error: "Something went wrong", session: publicSession(session) });
  }
}

// Which voice the client should use: "browser" (speechSynthesis) or a server provider.
// Before /:conversationId, which would otherwise match.
tutorRouter.get("/voice", (_req, res) => {
  res.json({ provider: voiceProviderId() });
});

// One sentence of the tutor's reply as audio, streamed from the voice provider.
const TTS_MAX_LENGTH = 1000;
tutorRouter.post("/tts", async (req, res) => {
  const text = optionalString(field(req.body, "text"))?.trim();
  if (!text || text.length > TTS_MAX_LENGTH) {
    res.status(400).json({ error: `text is required (at most ${TTS_MAX_LENGTH} characters)` });
    return;
  }
  const provider = voiceProvider();
  if (!provider) {
    res.status(404).json({ error: "The tutor's voice is the browser's; there's no server audio" });
    return;
  }
  // Stop the vendor's request when the client goes away (Stop speaking, Mute, Exit).
  const controller = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) controller.abort();
  });
  try {
    const audio = await provider.synthesize(text, controller.signal);
    res.writeHead(200, { "Content-Type": audio.contentType, "Cache-Control": "no-store" });
    const reader = audio.body.getReader();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      res.write(value);
    }
    res.end();
  } catch (error) {
    if (controller.signal.aborted) return;
    if (res.headersSent) {
      res.destroy();
      return;
    }
    if (error instanceof VoiceProviderError) {
      console.error(`Tutor: voice ${provider.id} failed: ${error.message}`);
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error(`Tutor: voice ${provider.id} failed`, error instanceof Error ? error.message : "");
    res.status(502).json({ error: "The voice provider didn't respond" });
  }
});

// The first-time intro dialog, shown once per user. DELETE resets it, to see it again.
// Before /:conversationId, which would otherwise match.
tutorRouter.get("/intro", async (_req, res) => {
  const user = await getUser();
  res.json({ seen: Boolean((await getTutorUser(user.name)).introSeenAt) });
});

tutorRouter.post("/intro", async (_req, res) => {
  const user = await getUser();
  await updateTutorUser(user.name, (state) => ({ ...state, introSeenAt: state.introSeenAt ?? new Date().toISOString() }));
  res.json({ seen: true });
});

tutorRouter.delete("/intro", async (_req, res) => {
  const user = await getUser();
  await updateTutorUser(user.name, (state) => ({ ...state, introSeenAt: undefined }));
  res.json({ seen: false });
});

tutorRouter.get("/:conversationId", async (req: Request<Params>, res) => {
  const session = await getLatestSession(req.params.conversationId);
  res.json({ session: session ? publicSession(session) : null });
});

// Forms alternate across all sessions, so participants are counterbalanced.
async function nextForm(): Promise<1 | 2> {
  const last = (await listSessions()).filter((session) => session.form).at(-1);
  return last?.form === 1 ? 2 : 1;
}

tutorRouter.post("/:conversationId/start", async (req: Request<Params>, res) => {
  const mode: TutorMode = field(req.body, "mode") === "voice" ? "voice" : "text";
  const session = await getLatestSession(req.params.conversationId);
  if (session?.status !== "offered") {
    res.status(409).json({ error: "No open offer" });
    return;
  }
  const user = await getUser();
  const form = session.topicId ? await nextForm() : undefined;
  const started = await updateSession(session.id, (current) => ({
    ...current,
    userId: user.name,
    status: "scoping",
    // The client checks speech support and the microphone first, and sends "text" with the
    // learner's voice choice in requestedMode when voice isn't available.
    mode,
    requestedMode: field(req.body, "requestedMode") === "voice" ? "voice" : mode,
    form,
  }));
  res.json({ session: publicSession(started) });
});

// No thanks: records the decline, then streams Claude's normal answer to the user's message
// (which the offer stood in for), with no Tutor instructions or tool. Repeatable until the
// answer is stored, so a failed answer can be retried.
tutorRouter.post("/:conversationId/decline", async (req: Request<Params>, res) => {
  const { conversationId } = req.params;
  const session = await getLatestSession(conversationId);
  const canAnswer = session?.status === "offered" || (session?.status === "declined" && !session.declineMessageId);
  const conversation = await getConversation(conversationId);
  if (!session || !canAnswer || !conversation) {
    res.status(409).json({ error: "No open offer" });
    return;
  }
  const declined = await updateSession(session.id, (current) => ({ ...current, status: "declined" }));

  res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-cache", Connection: "keep-alive" });
  const send = (event: Record<string, unknown>) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abortController.abort();
  });
  // Tells the client which reply the answer is, for the decline note.
  send({ type: "tutor_session", session: publicSession(declined) });

  const result = await streamReply({
    messages: conversation.messages.map(({ role, content }) => ({ role, content })),
    signal: abortController.signal,
    onText: (text) => send({ type: "text", text }),
  });
  const text = result.type === "done" || result.type === "aborted" ? result.text : "";
  if (text.trim()) {
    const stored = (await appendMessage(conversationId, "assistant", text))?.messages.at(-1);
    await updateSession(session.id, (current) => ({ ...current, declineMessageId: stored?.id }));
  }
  if (result.type === "aborted") return;
  send({ type: result.type === "done" ? "done" : result.type });
  res.end();
});

tutorRouter.post("/:conversationId/chat", handleChat);

const CONFIDENCE: Confidence[] = ["sure", "think_so", "guessing"];

tutorRouter.post("/:conversationId/answer", (req: Request<Params>, res) =>
  withActiveSession(req, res, (session) => {
    const optionIndex = field(req.body, "optionIndex");
    const confidence = field(req.body, "confidence");
    const input: AnswerInput = {
      questionId: optionalString(field(req.body, "questionId")) ?? "",
      optionIndex: typeof optionIndex === "number" ? optionIndex : undefined,
      text: optionalString(field(req.body, "text")),
      confidence: CONFIDENCE.includes(confidence as Confidence) ? (confidence as Confidence) : undefined,
    };
    return submitAnswer(session, input);
  }),
);

tutorRouter.post("/:conversationId/reveal", (req: Request<Params>, res) =>
  withActiveSession(req, res, (session) => {
    const via = field(req.body, "via") === "show_me" ? "show_me" : "show_answer";
    return reveal(session, optionalString(field(req.body, "questionId")) ?? "", via);
  }),
);

tutorRouter.post("/:conversationId/explain", (req: Request<Params>, res) =>
  withActiveSession(req, res, (session) =>
    requestExplain(session, optionalString(field(req.body, "questionId")) ?? ""),
  ),
);

tutorRouter.post("/:conversationId/parallel", (req: Request<Params>, res) =>
  withActiveSession(req, res, (session) => tryParallel(session)),
);

// Builds the next part of the battery if it's missing, otherwise moves to the next item.
tutorRouter.post("/:conversationId/advance", (req: Request<Params>, res) =>
  withActiveSession(req, res, async (session) => {
    const built = await ensureBuilt(session);
    if (built !== session || built.generation.error) return built;
    return advance(session, optionalString(field(req.body, "fromQuestionId")));
  }),
);

tutorRouter.post("/:conversationId/summary", (req: Request<Params>, res) =>
  withActiveSession(req, res, (session) => submitSummary(session, optionalString(field(req.body, "text")))),
);

tutorRouter.post("/:conversationId/consent", (req: Request<Params>, res) =>
  withActiveSession(req, res, (session) => {
    const consented = field(req.body, "consented");
    if (typeof consented !== "boolean") throw new TutorStateError("Choose yes or no");
    return setDelayedCheckConsent(session, consented);
  }),
);

tutorRouter.post("/:conversationId/practice", (req: Request<Params>, res) =>
  withActiveSession(req, res, (session) => startMorePractice(session)),
);

tutorRouter.post("/:conversationId/mode", (req: Request<Params>, res) =>
  withActiveSession(req, res, (session) => setMode(session, field(req.body, "mode") === "voice" ? "voice" : "text")),
);

tutorRouter.post("/:conversationId/exit", (req: Request<Params>, res) =>
  withActiveSession(req, res, (session) => exitSession(session)),
);

tutorRouter.post("/:conversationId/resume", (req: Request<Params>, res) =>
  withActiveSession(req, res, (session) => resumeSession(session), (session) => session.status === "paused"),
);
