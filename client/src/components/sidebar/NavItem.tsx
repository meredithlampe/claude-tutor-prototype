import type { ComponentType } from "react";
import type { LucideProps } from "lucide-react";
import { NavLink } from "react-router-dom";
import { StubTooltip } from "@/components/StubTooltip";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { stubClasses } from "@/lib/stub";

type NavItemProps = {
  icon: ComponentType<LucideProps>;
  label: string;
  collapsed: boolean;
  // When set, the item navigates. Otherwise it renders as a greyed-out stub button.
  to?: string;
  onNavigate?: () => void;
  className?: string;
};

const itemClasses =
  "flex h-8 w-full items-center gap-3 rounded-lg px-2 text-sm text-sidebar-foreground outline-none transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 focus-visible:ring-sidebar-ring pointer-coarse:h-11";

export function NavItem({ icon: Icon, label, collapsed, to, onNavigate, className }: NavItemProps) {
  const inner = (
    <>
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      <span className={cn("truncate", collapsed && "sr-only")}>{label}</span>
    </>
  );

  if (!to) {
    return (
      <StubTooltip label={collapsed ? label : undefined} side="right">
        <button
          type="button"
          className={cn(itemClasses, collapsed && "justify-center px-0", className, stubClasses)}
        >
          {inner}
        </button>
      </StubTooltip>
    );
  }

  const item = (
    <NavLink
      to={to}
      end
      onClick={onNavigate}
      className={cn(
        itemClasses,
        "aria-[current=page]:bg-sidebar-accent aria-[current=page]:font-medium aria-[current=page]:text-sidebar-accent-foreground",
        collapsed && "justify-center px-0",
        className,
      )}
    >
      {inner}
    </NavLink>
  );

  if (!collapsed) return item;

  return (
    <Tooltip>
      <TooltipTrigger asChild>{item}</TooltipTrigger>
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  );
}
