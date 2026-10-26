import { useCallback, useState } from "react";
import { Menu } from "lucide-react";
import { Outlet } from "react-router-dom";
import { DebugMenu } from "@/components/DebugMenu";
import { IconButton } from "@/components/IconButton";
import { Sidebar } from "@/components/sidebar/Sidebar";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { content } from "@/constants/content";
import { debugActions } from "@/features";
import { useApiData, type ApiState } from "@/hooks/useApiData";
import { useStartChat } from "@/hooks/useStartChat";
import { fetchConversations, fetchUser } from "@/lib/api";
import { cn } from "@/lib/utils";
import type { ConversationSummary, User } from "@/types";

export type AppOutletContext = {
  user: ApiState<User>;
  conversations: ApiState<ConversationSummary[]>;
  // Re-fetches the sidebar list after a conversation is created or updated.
  refreshConversations: () => void;
};

export function AppLayout() {
  const [conversationsVersion, setConversationsVersion] = useState(0);
  const conversations = useApiData(fetchConversations, conversationsVersion);
  const refreshConversations = useCallback(
    () => setConversationsVersion((version) => version + 1),
    [],
  );
  const user = useApiData(fetchUser);
  const startChat = useStartChat(refreshConversations);
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const closeDrawer = () => setDrawerOpen(false);

  return (
    <div className="flex h-dvh overflow-hidden bg-background">
      <aside
        aria-label={content.sidebar.label}
        className={cn(
          "hidden shrink-0 border-r border-sidebar-border md:block",
          collapsed ? "w-14" : "w-72",
        )}
      >
        <Sidebar
          conversations={conversations}
          user={user}
          collapsed={collapsed}
          toggleLabel={collapsed ? content.sidebar.expandSidebar : content.sidebar.collapseSidebar}
          onToggle={() => setCollapsed((value) => !value)}
        />
      </aside>

      <Sheet open={drawerOpen} onOpenChange={setDrawerOpen}>
        <SheetContent
          side="left"
          showCloseButton={false}
          aria-describedby={undefined}
          className="w-72 max-w-[85vw] gap-0 border-sidebar-border p-0 md:hidden"
        >
          <SheetTitle className="sr-only">{content.sidebar.label}</SheetTitle>
          <Sidebar
            conversations={conversations}
            user={user}
            collapsed={false}
            toggleLabel={content.sidebar.closeSidebar}
            onToggle={closeDrawer}
            onNavigate={closeDrawer}
          />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-12 shrink-0 items-center px-2 md:hidden">
          <IconButton
            label={content.sidebar.openSidebar}
            aria-expanded={drawerOpen}
            onClick={() => setDrawerOpen(true)}
          >
            <Menu aria-hidden="true" />
          </IconButton>
        </header>
        <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto">
          <Outlet
            context={{ user, conversations, refreshConversations } satisfies AppOutletContext}
          />
        </main>
      </div>
      <DebugMenu actions={debugActions} debug={{ startChat }} />
    </div>
  );
}
