import { useId, useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/types";
import { ConversationItem } from "./ConversationItem";

type ConversationListProps = {
  title: string;
  conversations: ConversationSummary[];
  onNavigate?: () => void;
};

export function ConversationList({ title, conversations, onNavigate }: ConversationListProps) {
  const [expanded, setExpanded] = useState(true);
  const listId = useId();

  if (conversations.length === 0) return null;

  return (
    <section className="flex flex-col gap-0.5">
      <h2>
        <button
          type="button"
          aria-expanded={expanded}
          aria-controls={listId}
          onClick={() => setExpanded((value) => !value)}
          className="group flex h-8 items-center gap-1 rounded-md px-2 text-xs text-muted-foreground outline-none hover:text-sidebar-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring pointer-coarse:h-11"
        >
          {title}
          <ChevronDown
            className={cn("size-3 transition-transform", !expanded && "-rotate-90")}
            aria-hidden="true"
          />
        </button>
      </h2>
      <ul id={listId} hidden={!expanded} className="flex flex-col gap-0.5">
        {conversations.map((conversation) => (
          <ConversationItem
            key={conversation.id}
            conversation={conversation}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </section>
  );
}
