import { CircleAlert, Ban, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { content } from "@/constants/content";
import type { ChatMessage } from "@/types";
import { Markdown } from "./Markdown";

type MessageProps = {
  message: ChatMessage;
  onRetry?: () => void;
};

const noticeClasses =
  "flex items-start gap-2.5 rounded-xl border border-input bg-card px-4 py-3 text-sm text-secondary-foreground";

export function Message({ message, onRetry }: MessageProps) {
  const { chat } = content;

  if (message.role === "user") {
    return (
      <li className="flex flex-col items-end">
        <h2 className="sr-only">{chat.userAuthor}</h2>
        <p className="max-w-[85%] rounded-2xl bg-accent px-4 py-2.5 leading-7 break-words whitespace-pre-wrap text-accent-foreground">
          {message.content}
        </p>
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-3">
      <h2 className="sr-only">{chat.assistantAuthor}</h2>

      {message.status === "streaming" && !message.content && (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <span aria-hidden="true" className="size-2 animate-pulse rounded-full bg-brand" />
          {chat.responding}
        </p>
      )}

      {message.content && (message.status === "streaming" ? (
        // Tokens aren't announced. The finished message is re-mounted (see MessageList)
        // so the live region announces it once, in full.
        <div aria-live="off">
          <Markdown>{message.content}</Markdown>
        </div>
      ) : (
        <Markdown>{message.content}</Markdown>
      ))}

      {message.status === "stopped" && (
        <p className="text-sm text-muted-foreground">{chat.stopped}</p>
      )}

      {message.status === "refusal" && (
        <p className={noticeClasses}>
          <Ban className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
          {chat.refusal}
        </p>
      )}

      {message.status === "error" && (
        <div className={noticeClasses}>
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden="true" />
          <div className="flex flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <p>{chat.error}</p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onRetry}
              className="pointer-coarse:h-11"
            >
              <RotateCcw aria-hidden="true" />
              {chat.retry}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
