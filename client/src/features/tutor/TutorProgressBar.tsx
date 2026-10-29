import { Circle, CircleCheck, CircleDashed, LoaderCircle, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { tutorContent } from "./content";
import { currentPart } from "./progress";
import type { PartState, TutorSession } from "./types";

type TutorProgressBarProps = {
  session: TutorSession;
};

// Each state has its own icon and bar style, and its name for screen readers, so it isn't
// shown by colour alone.
const STATE_STYLES: Record<PartState, { Icon: LucideIcon; icon: string; bar: string }> = {
  not_started: { Icon: CircleDashed, icon: "text-muted-foreground", bar: "bg-accent" },
  generating: {
    Icon: LoaderCircle,
    icon: "text-secondary-foreground motion-safe:animate-spin",
    bar: "bg-input/60 motion-safe:animate-pulse",
  },
  ready: { Icon: Circle, icon: "text-secondary-foreground", bar: "border border-input" },
  completed: { Icon: CircleCheck, icon: "text-brand", bar: "bg-brand" },
};

// The workbook's five parts in order, each marked not started, being written, ready or
// completed. The learner's current part has a ring and a bold label.
export function TutorProgressBar({ session }: TutorProgressBarProps) {
  const { outline } = tutorContent.banner;
  const nodes = [
    { label: outline.assessment, state: session.outline.assessment },
    ...session.outline.steps.map((state, index) => ({ label: outline.step(index + 1), state })),
    { label: outline.final, state: session.outline.finalCheck },
  ];
  const current = currentPart(session);

  return (
    <ol aria-label={outline.label} className="mt-2 grid grid-cols-5 gap-2 pb-1">
      {nodes.map((node, index) => {
        const isCurrent = index === current;
        const { Icon, icon, bar } = STATE_STYLES[node.state];
        return (
          <li key={node.label} aria-current={isCurrent ? "step" : undefined} className="flex min-w-0 flex-col gap-1">
            <span className="flex items-center gap-1" aria-hidden="true">
              <Icon className={cn("size-3.5 shrink-0", icon)} />
              <span
                className={cn(
                  "h-1.5 min-w-0 flex-1 rounded-full",
                  bar,
                  isCurrent && "ring-2 ring-foreground ring-offset-2 ring-offset-card",
                )}
              />
            </span>
            <span
              className={cn(
                "text-xs leading-4 wrap-break-word",
                isCurrent ? "font-semibold text-foreground" : "text-secondary-foreground",
              )}
            >
              {node.label}
              <span className="sr-only">, {outline.states[node.state]}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
