import { Ellipsis, File, GalleryVerticalEnd, MessagesSquare, Trash2 } from "lucide-react";
import { NavLink } from "react-router-dom";
import { IconButton } from "@/components/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { content } from "@/constants/content";
import { cn } from "@/lib/utils";
import type { ConversationSummary } from "@/types";

type ConversationItemProps = {
  conversation: ConversationSummary;
  onNavigate?: () => void;
  onDelete: (conversation: ConversationSummary) => void;
};

export function ConversationItem({ conversation, onNavigate, onDelete }: ConversationItemProps) {
  const { id, title, icon } = conversation;
  const LeadingIcon =
    icon === "project" ? GalleryVerticalEnd : icon === "chat" ? MessagesSquare : null;

  return (
    <li className="group/item relative">
      <NavLink
        to={`/chat/${id}`}
        onClick={onNavigate}
        data-conversation-id={id}
        className={({ isActive }) =>
          cn(
            // Highlighted while the pointer is anywhere on the row, including its More button.
            "flex h-8 w-full items-center gap-3 rounded-lg pr-9 pl-2 text-sm text-sidebar-foreground outline-none transition-colors group-hover/item:bg-sidebar-accent group-hover/item:text-sidebar-accent-foreground group-has-data-[state=open]/item:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring pointer-coarse:h-11 pointer-coarse:pr-12",
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* Shown on hover or focus, while its menu is open, and always on touch screens. */}
          <IconButton
            label={content.sidebar.conversationMenu(title)}
            tooltipSide="right"
            data-conversation-menu={id}
            className="absolute top-1/2 right-0.5 -translate-y-1/2 opacity-0 group-hover/item:opacity-100 group-focus-within/item:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100 pointer-coarse:right-0 pointer-coarse:opacity-100"
          >
            <Ellipsis aria-hidden="true" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-36">
          <DropdownMenuItem
            variant="destructive"
            onSelect={() => onDelete(conversation)}
            className="pointer-coarse:min-h-11"
          >
            <Trash2 aria-hidden="true" />
            {content.sidebar.deleteChat}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
