import { content } from "@/constants/content";
import type { ChatMessage } from "@/types";
import { Message } from "./Message";

type MessageListProps = {
  messages: ChatMessage[];
  onRetry: (message: ChatMessage) => void;
};

// A polite live region. A streaming reply gets its own key, so when it finishes it is
// re-mounted as a new node and announced once, rather than token by token.
export function MessageList({ messages, onRetry }: MessageListProps) {
  return (
    <ol aria-live="polite" aria-label={content.chat.messagesLabel} className="flex flex-col gap-6">
      {messages.map((message) => (
        <Message
          key={message.status === "streaming" ? `${message.id}:streaming` : message.id}
          message={message}
          onRetry={() => onRetry(message)}
        />
      ))}
    </ol>
  );
}
