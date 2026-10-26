import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createConversation } from "@/lib/api";
import type { NewChatLocationState } from "@/types";

// Creates a conversation and opens it; the chat thread then sends `text` as its first message.
// Rejects if the conversation couldn't be created.
export function useStartChat(refreshConversations: () => void) {
  const navigate = useNavigate();
  return useCallback(
    async (text: string) => {
      const conversation = await createConversation(text);
      refreshConversations();
      const state: NewChatLocationState = { conversation, pendingMessage: text };
      navigate(`/chat/${conversation.id}`, { state });
    },
    [navigate, refreshConversations],
  );
}
