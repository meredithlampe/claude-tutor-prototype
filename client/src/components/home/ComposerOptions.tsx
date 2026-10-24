import { ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { content } from "@/constants/content";

export function ComposerOptions() {
  const { composer } = content;

  return (
    <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-2 text-sm">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="text-sidebar-foreground pointer-coarse:h-11"
      >
        {composer.project}
        <ChevronDown className="size-3.5 text-muted-foreground" aria-hidden="true" />
      </Button>
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
