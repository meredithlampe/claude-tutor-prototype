import { useRef, useState } from "react";
import {
  BriefcaseBusiness,
  ChevronRight,
  Clock,
  GalleryVerticalEnd,
  Plus,
  Search,
  Shapes,
  type LucideProps,
} from "lucide-react";
import { ScrollArea } from "@/components/ui/scroll-area";
import { content } from "@/constants/content";
import type { ApiState } from "@/hooks/useApiData";
import { cn } from "@/lib/utils";
import type { ConversationSummary, User } from "@/types";
import { ConversationList } from "./ConversationList";
import { DeleteConversationDialog } from "./DeleteConversationDialog";
import { NavItem } from "./NavItem";
import { SidebarHeader } from "./SidebarHeader";
import { UserFooter } from "./UserFooter";

type SidebarProps = {
  conversations: ApiState<ConversationSummary[]>;
  user: ApiState<User>;
  collapsed: boolean;
  toggleLabel: string;
  onToggle: () => void;
  // Called after a navigation, so the mobile drawer can close itself.
  onNavigate?: () => void;
  // Deletes the conversation, leaving it first if it's open, and refreshes the list.
  onDeleteConversation: (id: string) => Promise<void>;
};

function ProjectsIcon(props: LucideProps) {
  return <GalleryVerticalEnd {...props} className={cn(props.className, "rotate-180")} />;
}

export function Sidebar({
  conversations,
  user,
  collapsed,
  toggleLabel,
  onToggle,
  onNavigate,
  onDeleteConversation,
}: SidebarProps) {
  const { nav } = content.sidebar;
  const summaries = conversations.status === "success" ? conversations.data : [];
  const rootRef = useRef<HTMLDivElement>(null);
  const [pendingDelete, setPendingDelete] = useState<ConversationSummary | null>(null);
  // Where focus goes after a delete: the next chat in the list, else the previous, else New.
  const focusAfterDeleteRef = useRef<string | null>(null);
  const [deletedNotice, setDeletedNotice] = useState("");

  function requestDelete(conversation: ConversationSummary) {
    const index = summaries.findIndex((summary) => summary.id === conversation.id);
    focusAfterDeleteRef.current = (summaries[index + 1] ?? summaries[index - 1])?.id ?? null;
    setDeletedNotice("");
    setPendingDelete(conversation);
  }

  async function confirmDelete(conversation: ConversationSummary) {
    await onDeleteConversation(conversation.id);
    setDeletedNotice(content.sidebar.chatDeleted(conversation.title));
  }

  // After the dialog: a deleted chat's neighbour (or New), or back to the chat's More button.
  function placeFocus(deleted: boolean, conversation: ConversationSummary) {
    const root = rootRef.current;
    if (!root) return;
    const neighbourId = focusAfterDeleteRef.current;
    const target = deleted
      ? (neighbourId && root.querySelector<HTMLElement>(`[data-conversation-id="${CSS.escape(neighbourId)}"]`)) ||
        root.querySelector<HTMLElement>('nav a[href="/"]')
      : root.querySelector<HTMLElement>(`[data-conversation-menu="${CSS.escape(conversation.id)}"]`);
    target?.focus();
  }

  return (
    <div ref={rootRef} className="flex h-full min-h-0 flex-col bg-sidebar text-sidebar-foreground">
      <SidebarHeader collapsed={collapsed} toggleLabel={toggleLabel} onToggle={onToggle} />

      <ScrollArea className="min-h-0 flex-1 [&_[data-slot=scroll-area-viewport]]:relative [&_[data-slot=scroll-area-viewport]>div]:!block">
        <div className="flex flex-col gap-5 px-2 pb-4">
          <nav aria-label={content.sidebar.primaryNavLabel} className="flex flex-col gap-0.5">
            <NavItem
              icon={Search}
              label={content.sidebar.search}
              collapsed={collapsed}
              className={cn(
                "mb-2 text-muted-foreground",
                !collapsed && "border border-input/60 bg-background/40",
              )}
            />
            <NavItem icon={Plus} label={nav.new} to="/" collapsed={collapsed} onNavigate={onNavigate} />
            <NavItem icon={ProjectsIcon} label={nav.projects} collapsed={collapsed} />
            <NavItem icon={Shapes} label={nav.artifacts} collapsed={collapsed} />
            <NavItem icon={Clock} label={nav.scheduled} collapsed={collapsed} />
            <NavItem icon={BriefcaseBusiness} label={nav.customize} collapsed={collapsed} />
            <NavItem
              icon={ChevronRight}
              label={nav.more}
              collapsed={collapsed}
              className="text-muted-foreground"
            />
          </nav>

          {!collapsed && (
            <nav aria-label={content.sidebar.conversationsNavLabel} className="flex flex-col gap-5">
              {conversations.status === "error" && (
                <p role="alert" className="px-2 text-sm text-muted-foreground">
                  {content.sidebar.loadFailed}
                </p>
              )}
              <ConversationList
                title={content.sidebar.recents}
                conversations={summaries}
                onNavigate={onNavigate}
                onDelete={requestDelete}
              />
            </nav>
          )}
        </div>
      </ScrollArea>

      <p role="status" className="sr-only">
        {deletedNotice}
      </p>
      {pendingDelete && (
        <DeleteConversationDialog
          conversation={pendingDelete}
          onConfirm={confirmDelete}
          onClose={() => setPendingDelete(null)}
          onClosed={(deleted) => placeFocus(deleted, pendingDelete)}
        />
      )}

      <UserFooter user={user.status === "success" ? user.data : undefined} collapsed={collapsed} />
    </div>
  );
}
