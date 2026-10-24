import { ChevronDown, LayoutGrid } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { StubTooltip } from "@/components/StubTooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { content } from "@/constants/content";
import { cn } from "@/lib/utils";
import { stubClasses } from "@/lib/stub";
import type { User } from "@/types";

type UserFooterProps = {
  user: User | undefined;
  collapsed: boolean;
};

export function UserFooter({ user, collapsed }: UserFooterProps) {
  const initial = user?.name.charAt(0).toUpperCase() ?? "";

  const accountButton = (
    <button
      type="button"
      aria-label={collapsed ? content.sidebar.userMenu : undefined}
      className={cn(
        "flex h-10 min-w-0 items-center gap-2.5 rounded-lg px-1.5 text-left text-sm text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring pointer-coarse:h-11",
        !collapsed && "flex-1",
        stubClasses,
      )}
    >
      <Avatar size="sm" aria-hidden="true">
        <AvatarFallback className="bg-sidebar-border text-[0.625rem] text-disabled-foreground">
          {initial}
        </AvatarFallback>
      </Avatar>
      {!collapsed && user && (
        <>
          <span className="min-w-0 truncate">
            {user.name} {content.sidebar.planSeparator} {user.plan}
          </span>
          <ChevronDown className="size-3.5 shrink-0" aria-hidden="true" />
        </>
      )}
    </button>
  );

  return (
    <div className="flex items-center gap-1 border-t border-sidebar-border px-2 py-2">
      <StubTooltip
        label={collapsed ? content.sidebar.userMenu : undefined}
        side={collapsed ? "right" : "top"}
      >
        {accountButton}
      </StubTooltip>
      {!collapsed && (
        <IconButton label={content.sidebar.getApps} stub>
          <LayoutGrid aria-hidden="true" />
        </IconButton>
      )}
    </div>
  );
}
