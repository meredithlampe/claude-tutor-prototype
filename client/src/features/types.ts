import type { ReactNode } from "react";
import type { ChatMessage, FeatureEvent, StreamEvent } from "@/types";

// What the chat thread gives a feature.
export interface ChatContext {
  conversationId: string;
  isStreaming: boolean;
  // Sends a user message through the thread, which shows it and streams the reply (using the
  // active feature's sendMessage, if it has one). Returns false while a reply is streaming.
  send: (text: string) => boolean;
  stop: () => void;
}

export interface SendMessageOptions {
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
  composer?: ReactNode;
  // Rendered inside a message's list item, after its content.
  renderAfterMessage?: (message: ChatMessage) => ReactNode;
  sendMessage?: SendMessage;
  // A stream event the clone doesn't know, with the id of the reply it arrived during.
  onEvent?: (event: FeatureEvent, replyId: string) => void;
}

export interface ChatFeature {
  id: string;
  // Called on every render of the chat thread, so it can use hooks to hold the feature's state.
  useSlots: (chat: ChatContext) => FeatureSlots;
}
