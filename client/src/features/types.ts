import type { ReactNode } from "react";
import type { ChatMessage, FeatureEvent, StreamEvent } from "@/types";

// What the chat thread gives a feature.
export interface ChatContext {
  conversationId: string;
  isStreaming: boolean;
  // Sends a user message through the thread, which shows it and streams the reply (using the
  // active feature's sendMessage, if it has one). Returns false while a reply is streaming.
  send: (text: string, options?: SendOptions) => boolean;
  stop: () => void;
}

export interface SendOptions {
  // Streams a reply without showing `text` as a user message, e.g. when a feature asks the
  // assistant to speak first. Only meaningful with an active feature's sendMessage.
  silent?: boolean;
  // Passed through to the active feature's sendMessage.
  data?: Record<string, unknown>;
  // Streams this one reply through the given sender, even when no feature is active (e.g. a
  // feature's own endpoint that answers on the user's behalf).
  sendMessage?: SendMessage;
}

export interface SendMessageOptions extends SendOptions {
  content: string;
  retry: boolean;
  signal: AbortSignal;
}

export type SendMessage = (
  conversationId: string,
  options: SendMessageOptions,
) => AsyncIterable<StreamEvent | FeatureEvent>;

// What a feature renders into the chat view. Every slot is optional.
export interface FeatureSlots {
  // While true, `composer` replaces the clone's composer and `sendMessage` replaces the
  // clone's send. Only one feature should be active at a time; the first one wins.
  active: boolean;
  // Full width, above the thread.
  banner?: ReactNode;
  // Beside the thread from md up, below it on narrow screens. The feature sets its own size.
  panel?: ReactNode;
  // While active: arranges the thread (messages and composer) together with the feature's own
  // content, in place of the default thread-and-panels row.
  layout?: (thread: ReactNode) => ReactNode;
  composer?: ReactNode;
  // Rendered inside a message's list item, after its content.
  renderAfterMessage?: (message: ChatMessage) => ReactNode;
  sendMessage?: SendMessage;
  // A stream event the clone doesn't know, with the id of the reply it arrived during.
  onEvent?: (event: FeatureEvent, replyId: string) => void;
}

// What the clone's debug menu gives a debug action.
export interface DebugContext {
  // Creates a conversation with this first message and opens it, the same way sending from
  // Home does.
  startChat: (text: string) => Promise<void>;
}

// A prototype operation in the clone's debug menu, which only renders in dev builds.
export interface DebugAction {
  id: string;
  label: string;
  // Resolves to a short confirmation to show and announce, if any. Throwing shows a failure.
  run: (debug: DebugContext) => Promise<string | void>;
}

export interface ChatFeature {
  id: string;
  // Called on every render of the chat thread, so it can use hooks to hold the feature's state.
  useSlots: (chat: ChatContext) => FeatureSlots;
  debugActions?: DebugAction[];
}
