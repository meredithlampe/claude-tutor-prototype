import { useEffect, useId, useRef } from "react";
import { AudioLines, GraduationCap, LogOut, MessageSquareText, X } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { tutorContent } from "./content";
import { progressLabel } from "./progress";
import type { TutorMode, TutorSession } from "./types";
import type { VoiceUnavailable } from "./useSpeech";

type TutorBannerProps = {
  session: TutorSession;
  // Moves focus here when Tutor mode has just started, so keyboard users land at the top.
  focusOnMount: boolean;
  exiting: boolean;
  onExit: () => void;
  switchingMode: boolean;
  onModeChange: (mode: TutorMode) => void;
  // Why voice isn't on, after the learner asked for it.
  voiceNotice: VoiceUnavailable | null;
  onDismissVoiceNotice: () => void;
};

const MODES: { mode: TutorMode; Icon: typeof AudioLines }[] = [
  { mode: "voice", Icon: AudioLines },
  { mode: "text", Icon: MessageSquareText },
];

export function TutorBanner({
  session,
  focusOnMount,
  exiting,
  onExit,
  switchingMode,
  onModeChange,
  voiceNotice,
  onDismissVoiceNotice,
}: TutorBannerProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const modeLabelId = useId();
  const { banner, voice } = tutorContent;

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  return (
    <div className="shrink-0 border-y border-border bg-card px-4 py-2 md:px-6">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-2 sm:gap-x-4">
        <h2
          ref={headingRef}
          tabIndex={-1}
          className="flex min-w-0 basis-full items-center gap-2 text-sm outline-none sm:flex-1 sm:basis-auto focus-visible:ring-2 focus-visible:ring-ring"
        >
          <GraduationCap className="size-4 shrink-0 text-brand" aria-hidden="true" />
          <span className="shrink-0 font-semibold text-foreground">{banner.mode}</span>
          <span aria-hidden="true" className="text-muted-foreground">
            ·
          </span>
          <span className="truncate text-secondary-foreground">{session.subject}</span>
        </h2>
        <p className="mr-auto text-sm text-secondary-foreground sm:mr-0">{progressLabel(session)}</p>
        {/* A two-button toggle: the pressed one is the current mode. */}
        <div role="group" aria-labelledby={modeLabelId} className="flex items-center rounded-lg border border-input p-0.5">
          <span id={modeLabelId} className="sr-only">
            {banner.modeLabel}
          </span>
          {MODES.map(({ mode, Icon }) => {
            const pressed = session.mode === mode;
            return (
              <Button
                key={mode}
                type="button"
                variant="ghost"
                size="sm"
                aria-pressed={pressed}
                disabled={switchingMode}
                onClick={() => !pressed && onModeChange(mode)}
                className={cn(
                  "h-7 rounded-md px-2 sm:px-2.5 pointer-coarse:h-11",
                  pressed
                    ? "bg-accent font-semibold text-foreground hover:bg-accent"
                    : "text-secondary-foreground hover:text-foreground",
                )}
              >
                <Icon aria-hidden="true" />
                {banner[mode]}
              </Button>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onExit}
          disabled={exiting}
          aria-label={banner.exitLabel}
          className="pointer-coarse:h-11"
        >
          <LogOut aria-hidden="true" />
          {banner.exit}
        </Button>
      </div>
      <div role="status">
        {voiceNotice && (
          <div className="mt-2 flex items-start gap-2 rounded-lg border border-input bg-background px-3 py-2 text-sm leading-6 text-secondary-foreground">
            <p className="flex-1">{voice.fallback[voiceNotice]}</p>
            <IconButton label={banner.dismiss} onClick={onDismissVoiceNotice} tooltipSide="left" className="-my-1">
              <X aria-hidden="true" />
            </IconButton>
          </div>
        )}
      </div>
    </div>
  );
}
