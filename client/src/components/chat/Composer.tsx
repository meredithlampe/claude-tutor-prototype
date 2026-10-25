import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { ArrowUp, AudioLines, ChevronDown, Mic, Plus, Square } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { StubTooltip } from "@/components/StubTooltip";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { content } from "@/constants/content";
import { cn } from "@/lib/utils";
import { stubClasses } from "@/lib/stub";

type ComposerProps = {
  // Returns (or resolves to) true when the message was accepted, which clears the input.
  onSubmit: (text: string) => boolean | Promise<boolean>;
  // While true, the send button becomes a stop button and Enter doesn't send.
  isStreaming?: boolean;
  onStop?: () => void;
  // Blocks sending without showing stop, e.g. while a new conversation is being created.
  isBusy?: boolean;
  focusOnMount?: boolean;
  // Lets the parent move focus back to the input (after stop or retry).
  inputRef?: RefObject<HTMLTextAreaElement | null>;
  // Defaults to the clone's "How can I help you today?".
  placeholder?: string;
};

export function Composer({
  onSubmit,
  isStreaming = false,
  onStop,
  isBusy = false,
  focusOnMount = false,
  inputRef,
  placeholder,
}: ComposerProps) {
  const inputId = useId();
  const ownRef = useRef<HTMLTextAreaElement>(null);
  const textareaRef = inputRef ?? ownRef;
  const [value, setValue] = useState("");
  const { composer } = content;
  const canSend = value.trim() !== "" && !isStreaming && !isBusy;

  useEffect(() => {
    if (focusOnMount) textareaRef.current?.focus();
  }, [focusOnMount, textareaRef]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSend) return;
    textareaRef.current?.focus();
    if (await onSubmit(value.trim())) setValue("");
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="rounded-[20px] border border-input bg-card shadow-sm transition-colors focus-within:border-ring"
    >
      <label htmlFor={inputId} className="sr-only">
        {composer.label}
      </label>
      <Textarea
        ref={textareaRef}
        id={inputId}
        rows={1}
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder ?? composer.placeholder}
        className="max-h-60 min-h-14 resize-none rounded-none border-0 bg-transparent px-4 pt-4 pb-1 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
      />
      <div className="flex items-center gap-1 px-2.5 pb-2.5">
        <IconButton label={composer.addContent} stub>
          <Plus aria-hidden="true" />
        </IconButton>
        <div className="ml-auto flex items-center gap-1">
          <StubTooltip label={composer.dictation}>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              aria-label={composer.dictation}
              className={cn("gap-0.5 px-1.5 pointer-coarse:h-11", stubClasses)}
            >
              <Mic aria-hidden="true" />
              <ChevronDown className="size-3" aria-hidden="true" />
            </Button>
          </StubTooltip>
          <IconButton label={composer.voiceMode} stub>
            <AudioLines aria-hidden="true" />
          </IconButton>
          {isStreaming ? (
            <IconButton
              label={composer.stop}
              variant="default"
              onClick={onStop}
              className="text-primary-foreground hover:text-primary-foreground"
            >
              <Square className="size-3.5 fill-current" aria-hidden="true" />
            </IconButton>
          ) : (
            <IconButton
              type="submit"
              label={composer.send}
              variant="default"
              aria-disabled={!canSend}
              className="bg-brand text-brand-foreground hover:bg-brand/85 hover:text-brand-foreground aria-disabled:cursor-not-allowed aria-disabled:opacity-50 aria-disabled:hover:bg-brand"
            >
              <ArrowUp aria-hidden="true" />
            </IconButton>
          )}
        </div>
      </div>
    </form>
  );
}
