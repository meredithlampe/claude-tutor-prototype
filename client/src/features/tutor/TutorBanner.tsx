import { useEffect, useRef } from "react";
import { GraduationCap, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tutorContent } from "./content";
import { progressLabel } from "./progress";
import type { TutorSession } from "./types";

type TutorBannerProps = {
  session: TutorSession;
  // Moves focus here when Tutor mode has just started, so keyboard users land at the top.
  focusOnMount: boolean;
  exiting: boolean;
  onExit: () => void;
};

export function TutorBanner({ session, focusOnMount, exiting, onExit }: TutorBannerProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const { banner } = tutorContent;

  useEffect(() => {
    if (focusOnMount) headingRef.current?.focus();
  }, [focusOnMount]);

  return (
    <div className="shrink-0 border-y border-border bg-card px-4 py-2 md:px-6">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
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
        <p className="mr-auto text-sm text-secondary-foreground sm:mr-0">
          {progressLabel(session)}
        </p>
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
      {session.requestedMode === "voice" && (
        <p className="mt-1 text-xs text-muted-foreground">{banner.voiceComingSoon}</p>
      )}
    </div>
  );
}
