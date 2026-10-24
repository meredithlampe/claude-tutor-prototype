import { randomUUID } from "node:crypto";
import type { Conversation, ConversationSummary, StoredMessage } from "../types";
import { readJson, updateJson } from "./jsonFile";

const FILE = "conversations.json";
const TITLE_MAX_LENGTH = 40;
const FALLBACK_TITLE = "Untitled";

export function titleFromMessage(message: string): string {
  const text = message.replace(/\s+/g, " ").trim();
  if (!text) return FALLBACK_TITLE;
  if (text.length <= TITLE_MAX_LENGTH) return text;
  const cut = text.slice(0, TITLE_MAX_LENGTH);
  const lastSpace = cut.lastIndexOf(" ");
  return `${(lastSpace > 0 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
}

export async function listConversations(): Promise<ConversationSummary[]> {
  const conversations = await readJson<Conversation[]>(FILE);
  return conversations
    .map(({ id, title, pinned, icon, createdAt, updatedAt }) => ({
      id,
      title,
      pinned,
      icon,
      createdAt,
      updatedAt,
    }))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

export async function getConversation(id: string): Promise<Conversation | undefined> {
  const conversations = await readJson<Conversation[]>(FILE);
  return conversations.find((conversation) => conversation.id === id);
}

export function createConversation(firstMessage: string): Promise<Conversation> {
  const now = new Date().toISOString();
  const conversation: Conversation = {
    id: randomUUID(),
    title: titleFromMessage(firstMessage),
    pinned: false,
    icon: null,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };
  return updateJson<Conversation[], Conversation>(FILE, (conversations) => ({
    data: [...conversations, conversation],
    result: conversation,
  }));
}

export function appendMessage(
  conversationId: string,
  role: StoredMessage["role"],
  content: string,
): Promise<Conversation | undefined> {
  const now = new Date().toISOString();
  const message: StoredMessage = { id: randomUUID(), role, content, createdAt: now };
  return updateJson<Conversation[], Conversation | undefined>(FILE, (conversations) => {
    let updated: Conversation | undefined;
    const data = conversations.map((conversation) => {
      if (conversation.id !== conversationId) return conversation;
      updated = {
        ...conversation,
        messages: [...conversation.messages, message],
        updatedAt: now,
      };
      return updated;
    });
    return { data, result: updated };
  });
}
