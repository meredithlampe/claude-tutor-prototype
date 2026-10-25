import { Router, type Request, type Response } from "express";
import { getUser } from "../repo/user";
import { handleChat } from "./chat";
import { getLatestSession, listSessions, updateSession } from "./repo";
import {
  advance,
  ensureBuilt,
  isActive,
  publicSession,
  requestExplain,
  reveal,
  submitAnswer,
  tryParallel,
  TutorStateError,
  type AnswerInput,
} from "./session";
import type { Confidence, TutorMode, TutorSession } from "./types";

type Params = { conversationId: string };

export const tutorRouter = Router();

function field(body: unknown, key: string): unknown {
  return typeof body === "object" && body !== null ? (body as Record<string, unknown>)[key] : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

// Runs a learner action on the conversation's active session and responds with the new view.
async function withActiveSession(
  req: Request<Params>,
  res: Response,
  action: (session: TutorSession) => Promise<TutorSession>,
) {
  const session = await getLatestSession(req.params.conversationId);
  if (!isActive(session)) {
    res.status(409).json({ error: "No active Tutor session" });
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
    // Voice isn't built yet: a voice start runs as text, and the UI says so.
    mode: "text",
    requestedMode: mode,
    form,
  }));
  res.json({ session: publicSession(started) });
});

tutorRouter.post("/:conversationId/decline", async (req: Request<Params>, res) => {
  const session = await getLatestSession(req.params.conversationId);
  if (session?.status !== "offered") {
    res.status(409).json({ error: "No open offer" });
    return;
  }
  const declined = await updateSession(session.id, (current) => ({ ...current, status: "declined" }));
  res.json({ session: publicSession(declined) });
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

tutorRouter.post("/:conversationId/exit", (req: Request<Params>, res) =>
  withActiveSession(req, res, (session) =>
    updateSession(session.id, (current) => ({
      ...current,
      status: current.status === "wrap_up" ? "complete" : "paused",
    })),
  ),
);
