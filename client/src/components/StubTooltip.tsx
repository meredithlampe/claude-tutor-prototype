import type { ComponentProps, MouseEvent, ReactElement } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { content } from "@/constants/content";

type StubTooltipProps = {
  // A single focusable control. It should also carry `stubClasses` for the greyed-out look.
  children: ReactElement;
  // Shown above the notice, for controls whose name isn't visible (icon-only, collapsed).
  label?: string;
  side?: ComponentProps<typeof TooltipContent>["side"];
};

function ignoreClick(event: MouseEvent) {
  event.preventDefault();
}

// Marks a control as not functional in this prototype. Uses aria-disabled rather than
// `disabled` so the control stays focusable and the tooltip is reachable by keyboard.
export function StubTooltip({ children, label, side }: StubTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild aria-disabled="true" onClick={ignoreClick}>
        {children}
      </TooltipTrigger>
      <TooltipContent side={side} className="flex-col items-start gap-0.5">
        {label && <span className="font-medium">{label}</span>}
        <span>{content.stub.notAvailable}</span>
      </TooltipContent>
    </Tooltip>
  );
}
