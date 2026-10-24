import { useId } from "react";
import { AudioLines, ChevronDown, Mic, Plus } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { buttonVariants } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { content } from "@/constants/content";
import { cn } from "@/lib/utils";

// Static for build step 3. Sending (Enter / Shift+Enter) is wired up in step 4.
export function Composer() {
  const inputId = useId();
  const { composer } = content;

  return (
    <div className="rounded-[20px] border border-input bg-card shadow-sm transition-colors focus-within:border-ring">
      <label htmlFor={inputId} className="sr-only">
        {composer.label}
      </label>
      <Textarea
        id={inputId}
        rows={1}
        placeholder={composer.placeholder}
        className="max-h-60 min-h-14 resize-none rounded-none border-0 bg-transparent px-4 pt-4 pb-1 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center gap-1 px-2.5 pb-2.5">
        <IconButton label={composer.addContent}>
          <Plus aria-hidden="true" />
        </IconButton>
        <div className="ml-auto flex items-center gap-1">
          <Tooltip>
            <TooltipTrigger
              type="button"
              aria-label={composer.dictation}
              className={cn(
                buttonVariants({ variant: "ghost", size: "sm" }),
                "gap-0.5 px-1.5 text-muted-foreground hover:text-foreground pointer-coarse:h-11",
              )}
            >
              <Mic aria-hidden="true" />
              <ChevronDown className="size-3" aria-hidden="true" />
            </TooltipTrigger>
            <TooltipContent>{composer.dictation}</TooltipContent>
          </Tooltip>
          <IconButton label={composer.voiceMode}>
            <AudioLines aria-hidden="true" />
          </IconButton>
        </div>
      </div>
    </div>
  );
}
