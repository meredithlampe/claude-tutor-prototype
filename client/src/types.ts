// Mirrors server/types.ts. Keep the two in sync.

export type ConversationIcon = "project" | "chat" | "file" | null;

export interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  pinned: boolean;
  icon: ConversationIcon;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
}

export type ConversationSummary = Omit<Conversation, "messages">;

export interface Artifact {
  id: string;
  title: string;
  updatedAt: string;
}

export interface User {
  name: string;
  plan: string;
}
