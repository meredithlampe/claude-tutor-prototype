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

// Mirrors the StreamEvent union in server/routes/conversations.ts.
export type StreamEvent =
  | { type: "text"; text: string }
  | { type: "done" }
  | { type: "refusal" }
  | { type: "error" };

// Mirrors FeatureEvent in server/features.ts: an event a feature sends alongside the above.
export type FeatureEvent = { type: string } & Record<string, unknown>;

// A message as shown in the chat view. Stored messages load as "complete".
export type ChatMessageStatus = "complete" | "streaming" | "stopped" | "refusal" | "error";

export interface ChatMessage extends StoredMessage {
  status: ChatMessageStatus;
}

// Router state passed from the home composer to a newly created chat.
export interface NewChatLocationState {
  conversation: Conversation;
  pendingMessage: string;
}
