import type {
  Artifact,
  Conversation,
  ConversationSummary,
  FeatureEvent,
  StreamEvent,
  User,
} from "@/types";
import { readSseData } from "@/lib/sse";

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const response = await fetch(path, { signal });
  if (!response.ok) throw new Error(`GET ${path} failed with ${response.status}`);
  return (await response.json()) as T;
}

export function fetchConversations(signal?: AbortSignal) {
  return getJson<ConversationSummary[]>("/api/conversations", signal);
}

// Resolves to null when the conversation doesn't exist.
export async function fetchConversation(
  id: string,
  signal?: AbortSignal,
): Promise<Conversation | null> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(id)}`, { signal });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GET conversation failed with ${response.status}`);
  return (await response.json()) as Conversation;
}

export async function createConversation(content: string): Promise<Conversation> {
  const response = await fetch("/api/conversations", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content }),
  });
  if (!response.ok) throw new Error(`POST conversation failed with ${response.status}`);
  return (await response.json()) as Conversation;
}

type SendMessageOptions = {
  content: string;
  // Re-requests a reply to `content` without storing it again if it is already the
  // conversation's last message (after an error).
  retry?: boolean;
  signal: AbortSignal;
};

const CORE_EVENT_TYPES = new Set<string>(["text", "done", "refusal", "error", "discard"]);

// Anything else is a feature's event.
export function isCoreEvent(event: StreamEvent | FeatureEvent): event is StreamEvent {
  return CORE_EVENT_TYPES.has(event.type);
}

// Sends a user message and yields Claude's reply as stream events.
export async function* sendMessage(
  conversationId: string,
  { content, retry = false, signal }: SendMessageOptions,
): AsyncGenerator<StreamEvent | FeatureEvent> {
  const response = await fetch(`/api/conversations/${encodeURIComponent(conversationId)}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ content, retry }),
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`POST message failed with ${response.status}`);
  }
  for await (const data of readSseData(response.body)) {
    yield JSON.parse(data) as StreamEvent | FeatureEvent;
  }
}

export function fetchArtifacts(signal?: AbortSignal) {
  return getJson<Artifact[]>("/api/artifacts", signal);
}

export function fetchUser(signal?: AbortSignal) {
  return getJson<User>("/api/user", signal);
}

// Puts conversations back to the sample chats and clears features' per-chat state.
export async function resetChats(): Promise<void> {
  const response = await fetch("/api/reset", { method: "POST" });
  if (!response.ok) throw new Error(`POST reset failed with ${response.status}`);
}
