import type { ComponentProps, ReactNode } from "react";
import { StubTooltip } from "@/components/StubTooltip";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { stubClasses } from "@/lib/stub";

type IconButtonProps = Omit<ComponentProps<typeof Button>, "aria-label" | "children" | "asChild"> & {
  label: string;
  children: ReactNode;
  tooltipSide?: ComponentProps<typeof TooltipContent>["side"];
  // Renders a greyed-out, non-functional control with the "not available" tooltip.
  stub?: boolean;
};

// Icon-only button with an accessible name and a matching tooltip.
// Grows to a 44px target on touch devices.
export function IconButton({
  label,
  children,
  tooltipSide,
  className,
  variant = "ghost",
  size = "icon-sm",
  stub = false,
  ...props
}: IconButtonProps) {
  const button = (
    <Button
      type="button"
      variant={variant}
      size={size}
      aria-label={label}
      className={cn(
        "text-muted-foreground hover:text-foreground pointer-coarse:size-11",
        stub && stubClasses,
        className,
      )}
      {...props}
    >
      {children}
    </Button>
  );

  if (stub) {
    return (
      <StubTooltip label={label} side={tooltipSide}>
        {button}
      </StubTooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{button}</TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
}
