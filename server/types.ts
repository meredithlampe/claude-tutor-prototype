import type Anthropic from "@anthropic-ai/sdk";

export type ConversationIcon = "project" | "chat" | "file" | null;

export interface StoredMessage {
  id: string;
  role: Anthropic.MessageParam["role"];
  content: string;
  createdAt: string;
}

export interface Conversation {
  id: string;
  title: string;
  icon: ConversationIcon;
  messages: StoredMessage[];
  createdAt: string;
  updatedAt: string;
}

export type ConversationSummary = Omit<Conversation, "messages">;

export interface User {
  name: string;
  plan: string;
}
