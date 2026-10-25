import { Fragment, useEffect, useEffectEvent, useLayoutEffect, useRef, useState } from "react";
import { useLocation, useNavigate, useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "@/components/AppLayout";
import { content } from "@/constants/content";
import { useChatFeatures } from "@/features";
import type { SendOptions } from "@/features/types";
import { fetchConversation, isCoreEvent, sendMessage } from "@/lib/api";
import type { ChatMessage, ChatMessageStatus, NewChatLocationState } from "@/types";
import { Composer } from "./Composer";
import { MessageList } from "./MessageList";

type ChatThreadProps = {
  conversationId: string;
  // Set when arriving from the home composer: the conversation is new and its first
  // message still has to be sent.
  newChat?: NewChatLocationState;
};

type LoadState = "loading" | "ready" | "notFound" | "error";

// How close to the bottom (px) still counts as "at the bottom" for auto-scroll.
const STICK_THRESHOLD = 48;

function createMessage(
  role: ChatMessage["role"],
  messageContent: string,
  status: ChatMessageStatus,
): ChatMessage {
  return {
    id: crypto.randomUUID(),
    role,
    content: messageContent,
    createdAt: new Date().toISOString(),
    status,
  };
}

export function ChatThread({ conversationId, newChat: newChatProp }: ChatThreadProps) {
  const { refreshConversations } = useOutletContext<AppOutletContext>();
  const navigate = useNavigate();
  const location = useLocation();
  // Captured once: the router state is cleared after the first message is sent.
  const [newChat] = useState(newChatProp);
  const [loadState, setLoadState] = useState<LoadState>(newChat ? "ready" : "loading");
  const [title, setTitle] = useState(newChat?.conversation.title ?? "");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const stickToBottomRef = useRef(true);
  const newChatSentRef = useRef(false);
  // What each reply was requested with, by reply id, so Retry can repeat the same request.
  const requestsRef = useRef(new Map<string, { text: string; options: SendOptions }>());

  const featureSlots = useChatFeatures({
    conversationId,
    isStreaming,
    send: handleSubmit,
    stop: handleStop,
  });
  const activeFeature = featureSlots.find((slots) => slots.active);
  const hasFeatureLayout = Boolean(activeFeature?.layout);
  // A reply reads the latest slots while it streams, not the ones from when it started.
  const featureSlotsRef = useRef(featureSlots);
  useLayoutEffect(() => {
    featureSlotsRef.current = featureSlots;
  });

  async function streamReply(text: string, retry: boolean, options: SendOptions = {}) {
    const controller = new AbortController();
    abortRef.current = controller;
    const reply = createMessage("assistant", "", "streaming");
    requestsRef.current.set(reply.id, { text, options });
    const updateReply = (update: (message: ChatMessage) => ChatMessage) =>
      setMessages((current) =>
        current.map((message) => (message.id === reply.id ? update(message) : message)),
      );

    setMessages((current) =>
      retry || options.silent
        ? [...current, reply]
        : [...current, createMessage("user", text, "complete"), reply],
    );
    setIsStreaming(true);
    stickToBottomRef.current = true;

    const send =
      featureSlotsRef.current.find((slots) => slots.active)?.sendMessage ?? sendMessage;
    let status: ChatMessageStatus = "error";
    try {
      for await (const event of send(conversationId, {
        ...options,
        content: text,
        retry,
        signal: controller.signal,
      })) {
        if (!isCoreEvent(event)) {
          for (const slots of featureSlotsRef.current) slots.onEvent?.(event, reply.id);
        } else if (event.type === "text") {
          updateReply((message) => ({ ...message, content: message.content + event.text }));
        } else {
          status = event.type === "done" ? "complete" : event.type;
          break;
        }
      }
    } catch {
      if (controller.signal.aborted) status = "stopped";
    }

    // A refusal or error replaces any partial text with a notice.
    const keepText = status === "complete" || status === "stopped";
    updateReply((message) => ({ ...message, status, content: keepText ? message.content : "" }));
    abortRef.current = null;
    setIsStreaming(false);
    refreshConversations();
  }

  const sendNewChatMessage = useEffectEvent(() => {
    if (!newChat || newChatSentRef.current) return;
    newChatSentRef.current = true;
    // Clear the router state so a reload doesn't send the message again.
    navigate(location.pathname, { replace: true, state: null });
    void streamReply(newChat.pendingMessage, false);
  });

  useEffect(() => {
    sendNewChatMessage();
  }, []);

  useEffect(() => {
    if (newChat) return;
    const controller = new AbortController();
    fetchConversation(conversationId, controller.signal)
      .then((conversation) => {
        if (!conversation) {
          setLoadState("notFound");
          return;
        }
        setTitle(conversation.title);
        setMessages(
          conversation.messages.map((message) => ({ ...message, status: "complete" })),
        );
        setLoadState("ready");
      })
      .catch(() => {
        if (!controller.signal.aborted) setLoadState("error");
      });
    return () => controller.abort();
  }, [conversationId, newChat]);

  // Follow the reply as it streams, unless the user has scrolled up to read. A feature layout
  // re-mounts the thread, so that scrolls to the bottom too.
  useLayoutEffect(() => {
    const scroller = scrollRef.current;
    if (scroller && stickToBottomRef.current) scroller.scrollTop = scroller.scrollHeight;
  }, [messages, loadState, hasFeatureLayout]);

  // If the stop button had focus when the reply finished, it is gone now: return focus to
  // the composer instead of dropping it on the page.
  useEffect(() => {
    if (!isStreaming && document.activeElement === document.body) inputRef.current?.focus();
  }, [isStreaming]);

  function handleScroll() {
    const scroller = scrollRef.current;
    if (!scroller) return;
    const distanceFromBottom = scroller.scrollHeight - scroller.scrollTop - scroller.clientHeight;
    stickToBottomRef.current = distanceFromBottom < STICK_THRESHOLD;
  }

  function handleSubmit(text: string, options?: SendOptions) {
    if (isStreaming) return false;
    void streamReply(text, false, options);
    return true;
  }

  function handleStop() {
    abortRef.current?.abort();
    inputRef.current?.focus();
  }

  function handleRetry(failed: ChatMessage) {
    if (isStreaming) return;
    const request = requestsRef.current.get(failed.id);
    const index = messages.indexOf(failed);
    const prompt = messages
      .slice(0, index)
      .reverse()
      .find((message) => message.role === "user");
    const text = request?.text ?? prompt?.content;
    if (text === undefined) return;
    inputRef.current?.focus();
    setMessages((current) => current.filter((message) => message.id !== failed.id));
    void streamReply(text, true, request?.options);
  }

  if (loadState === "loading") return null;

  if (loadState !== "ready") {
    return (
      <div className="mx-auto flex w-full max-w-[70ch] flex-1 flex-col gap-2 px-4 py-12">
        <h1 className="font-serif text-2xl text-foreground">
          {loadState === "notFound" ? content.chat.notFound : content.chat.loadFailed}
        </h1>
      </div>
    );
  }

  function renderAfterMessage(message: ChatMessage) {
    return featureSlots.map((slots) => (
      <Fragment key={slots.id}>{slots.renderAfterMessage?.(message)}</Fragment>
    ));
  }

  const thread = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div ref={scrollRef} onScroll={handleScroll} className="min-h-0 flex-1 overflow-y-auto">
        <div className="px-4 pt-4 pb-8">
          <div className="mx-auto w-full max-w-[70ch]">
            <MessageList
              messages={messages}
              onRetry={handleRetry}
              renderAfterMessage={renderAfterMessage}
            />
          </div>
        </div>
      </div>
      <div className="shrink-0 px-4 pb-4">
        <div className="mx-auto w-full max-w-[70ch]">
          {activeFeature?.composer ?? (
            <Composer
              onSubmit={handleSubmit}
              isStreaming={isStreaming}
              onStop={handleStop}
              focusOnMount={Boolean(newChat)}
              inputRef={inputRef}
            />
          )}
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <header className="flex h-12 shrink-0 items-center px-4 md:px-6">
        <h1 className="min-w-0 truncate text-sm font-medium text-foreground">{title}</h1>
      </header>
      {featureSlots.map((slots) => (
        <Fragment key={slots.id}>{slots.banner}</Fragment>
      ))}
      {activeFeature?.layout ? (
        activeFeature.layout(thread)
      ) : (
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          {thread}
          {featureSlots.map((slots) => (
            <Fragment key={slots.id}>{slots.panel}</Fragment>
          ))}
        </div>
      )}
    </div>
  );
}
