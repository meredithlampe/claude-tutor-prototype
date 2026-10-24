import { CodeXml, MessagesSquare, PanelLeft } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { content } from "@/constants/content";
import { cn } from "@/lib/utils";

type SidebarHeaderProps = {
  collapsed: boolean;
  toggleLabel: string;
  onToggle: () => void;
};

// Both modes are stubs, so the pressed one keeps the greyed text on a darker pill for contrast.
const modeButtonClasses = "aria-pressed:bg-sidebar-border aria-pressed:hover:bg-sidebar-border";

export function SidebarHeader({ collapsed, toggleLabel, onToggle }: SidebarHeaderProps) {
  return (
    <div className={cn("flex h-12 items-center gap-2 px-2", collapsed && "justify-center")}>
      <IconButton label={toggleLabel} onClick={onToggle} tooltipSide="right">
        <PanelLeft aria-hidden="true" />
      </IconButton>
      {!collapsed && (
        <>
          <span className="font-serif text-xl font-medium text-foreground">
            {content.app.name}
          </span>
          <div
            role="group"
            aria-label={content.sidebar.modeToggleLabel}
            className="ml-auto flex items-center rounded-lg bg-secondary p-0.5"
          >
            <IconButton
              label={content.sidebar.chatMode}
              aria-pressed={true}
              size="icon-xs"
              className={modeButtonClasses}
              stub
            >
              <MessagesSquare aria-hidden="true" />
            </IconButton>
            <IconButton
              label={content.sidebar.codeMode}
              aria-pressed={false}
              size="icon-xs"
              className={modeButtonClasses}
              stub
            >
              <CodeXml aria-hidden="true" />
            </IconButton>
          </div>
        </>
      )}
    </div>
  );
}
