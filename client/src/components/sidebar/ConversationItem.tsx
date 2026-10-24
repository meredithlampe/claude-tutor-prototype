import { File, GalleryVerticalEnd, MessagesSquare } from "lucide-react";
import { NavLink } from "react-router-dom";
import { content } from "@/constants/content";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/types";

type ConversationItemProps = {
  conversation: ConversationSummary;
  onNavigate?: () => void;
};

export function ConversationItem({ conversation, onNavigate }: ConversationItemProps) {
  const { id, title, icon } = conversation;
  const LeadingIcon =
    icon === "project" ? GalleryVerticalEnd : icon === "chat" ? MessagesSquare : null;

  return (
    <li>
      <NavLink
        to={`/chat/${id}`}
        onClick={onNavigate}
        className={({ isActive }) =>
          cn(
            "flex h-8 w-full items-center gap-3 rounded-lg px-2 text-sm text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring pointer-coarse:h-11",
            isActive && "bg-sidebar-accent font-medium text-sidebar-accent-foreground",
          )
        }
      >
        {LeadingIcon && (
          <LeadingIcon
            className={cn("size-4 shrink-0", icon === "project" && "rotate-180")}
            aria-hidden="true"
          />
        )}
        <span className="min-w-0 flex-1 truncate">{title}</span>
        {icon === "file" && (
          <>
            <File className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">{content.sidebar.fileAttached}</span>
          </>
        )}
      </NavLink>
    </li>
  );
}
