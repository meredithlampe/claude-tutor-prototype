import { Router, type Response } from "express";
import {
  appendMessage,
  createConversation,
  getConversation,
  listConversations,
} from "../repo/conversations";
import { collectCallOptions, notifyReplyDone, type ChatTurn, type FeatureEvent } from "../features";
import { streamReply } from "../services/claude";

type StreamEvent =
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "refusal" }
  | { type: "error" }
  | FeatureEvent;

function sendEvent(res: Response, event: StreamEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function readMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("content" in body)) return undefined;
  const { content } = body;
  return typeof content === "string" && content.trim() ? content : undefined;
}

// A retry re-requests a reply after an error. The user message is only stored again if the
// failed attempt never reached the server.
function readRetry(body: unknown): boolean {
  return typeof body === "object" && body !== null && "retry" in body && body.retry === true;
}

export const conversationsRouter = Router();

conversationsRouter.get("/", async (_req, res) => {
  res.json(await listConversations());
});

conversationsRouter.post("/", async (req, res) => {
  const content = readMessage(req.body);
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }
  res.status(201).json(await createConversation(content));
});

conversationsRouter.get("/:id", async (req, res) => {
  const conversation = await getConversation(req.params.id);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }
  res.json(conversation);
});

conversationsRouter.post("/:id/messages", async (req, res) => {
  const content = readMessage(req.body);
  if (!content) {
    res.status(400).json({ error: "content is required" });
    return;
  }

  const existing = await getConversation(req.params.id);
  const lastMessage = existing?.messages.at(-1);
  const alreadyStored =
    readRetry(req.body) && lastMessage?.role === "user" && lastMessage.content === content;
  const conversation = alreadyStored
    ? existing
    : await appendMessage(req.params.id, "user", content);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const turn: ChatTurn = { conversation, message: content };
  const { system, tools, toolOwners } = await collectCallOptions(turn);

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
  });

  const abortController = new AbortController();
  res.on("close", () => {
    if (!res.writableEnded) abortController.abort();
  });

  const result = await streamReply({
    messages: conversation.messages.map(({ role, content }) => ({ role, content })),
    system,
    tools,
    signal: abortController.signal,
    onText: (text) => sendEvent(res, { type: "text", text }),
  });

  // The client stopped the reply. Keep what streamed so Claude sees it on the next turn.
  // The API rejects whitespace-only text blocks, so those are dropped.
  if (result.type === "aborted") {
    if (result.text.trim()) await appendMessage(conversation.id, "assistant", result.text);
    return;
  }

  if (result.type === "done") {
    const stored = result.text
      ? (await appendMessage(conversation.id, "assistant", result.text))?.messages.at(-1)
      : undefined;
    // Feature events arrive before "done", so the client still has the reply open.
    await notifyReplyDone(stored, result.toolUses, toolOwners, turn, (event) => sendEvent(res, event));
    sendEvent(res, { type: "done" });
  } else {
    sendEvent(res, { type: result.type });
  }
  res.end();
});
