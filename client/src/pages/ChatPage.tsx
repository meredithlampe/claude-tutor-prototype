import { useLocation, useParams } from "react-router-dom";
import { ChatThread } from "@/components/chat/ChatThread";
import type { NewChatLocationState } from "@/types";

export function ChatPage() {
  const { id } = useParams();
  const location = useLocation();
  if (!id) return null;

  const state = location.state as Partial<NewChatLocationState> | null;
  const newChat =
    state?.conversation?.id === id && typeof state.pendingMessage === "string"
      ? (state as NewChatLocationState)
      : undefined;

  // Keyed so switching conversations starts from a fresh thread.
  return <ChatThread key={id} conversationId={id} newChat={newChat} />;
}
