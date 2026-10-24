import { ChevronDown } from "lucide-react";
import { StubTooltip } from "@/components/StubTooltip";
import { Button } from "@/components/ui/button";
import { content } from "@/constants/content";
import { cn } from "@/lib/utils";
import { stubClasses } from "@/lib/stub";

export function ComposerOptions() {
  const { composer } = content;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 text-sm">
      <StubTooltip>
        <Button type="button" variant="ghost" size="sm" className={cn("pointer-coarse:h-11", stubClasses)}>
          {composer.project}
          <ChevronDown className="size-3.5" aria-hidden="true" />
        </Button>
      </StubTooltip>
      <p className="flex items-center gap-4 px-2.5">
        <span>
          <span className="text-foreground">{composer.model}</span>{" "}
          <span className="text-muted-foreground">{composer.effort}</span>
        </span>
        <span className="text-sidebar-foreground">{composer.mode}</span>
      </p>
    </div>
  );
}
