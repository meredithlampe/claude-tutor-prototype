import type { ComponentProps, ReactNode } from "react";
import type { VariantProps } from "class-variance-authority";
import { buttonVariants } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

type IconButtonProps = Omit<ComponentProps<typeof TooltipTrigger>, "aria-label" | "children" | "asChild"> &
  VariantProps<typeof buttonVariants> & {
    label: string;
    children: ReactNode;
    tooltipSide?: ComponentProps<typeof TooltipContent>["side"];
  };

// Icon-only button with an accessible name and a matching tooltip.
// The Radix trigger renders the <button> itself: the shadcn Button doesn't forward refs
// under React 18, so it can't be used with asChild. Grows to a 44px target on touch devices.
export function IconButton({
  label,
  children,
  tooltipSide,
  className,
  variant = "ghost",
  size = "icon-sm",
  ...props
}: IconButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger
        type="button"
        aria-label={label}
        className={cn(
          buttonVariants({ variant, size }),
          "text-muted-foreground hover:text-foreground pointer-coarse:size-11",
          className,
        )}
        {...props}
      >
        {children}
      </TooltipTrigger>
      <TooltipContent side={tooltipSide}>{label}</TooltipContent>
    </Tooltip>
  );
}
