import { Router, type Response } from "express";
import {
  appendMessage,
  createConversation,
  getConversation,
  listConversations,
} from "../repo/conversations";
import { streamReply } from "../services/claude";

type StreamEvent =
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "refusal" }
  | { type: "error" };

function sendEvent(res: Response, event: StreamEvent) {
  res.write(`data: ${JSON.stringify(event)}\n\n`);
}

function readMessage(body: unknown): string | undefined {
  if (typeof body !== "object" || body === null || !("content" in body)) return undefined;
  const { content } = body;
  return typeof content === "string" && content.trim() ? content : undefined;
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

  const conversation = await appendMessage(req.params.id, "user", content);
  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
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

  const result = await streamReply({
    messages: conversation.messages.map(({ role, content }) => ({ role, content })),
    signal: abortController.signal,
    onText: (text) => sendEvent(res, { type: "text", text }),
  });

  if (result.type === "aborted") return;

  if (result.type === "done") {
    if (result.text) await appendMessage(conversation.id, "assistant", result.text);
    sendEvent(res, { type: "done" });
  } else {
    sendEvent(res, { type: result.type });
  }
  res.end();
});
