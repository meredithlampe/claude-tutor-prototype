import { useEffect, useId, useRef } from "react";
import { AudioLines, GraduationCap, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tutorContent } from "./content";
import type { TutorAction } from "./useTutorSession";

type TutorOfferCardProps = {
  declined: boolean;
  busy: TutorAction | null;
  failed: boolean;
  // True when the offer just arrived (not on reload): it appears after the reply has finished
  // scrolling, so it brings itself into view.
  scrollIntoView: boolean;
  onStart: (mode: "voice" | "text") => void;
  onDecline: () => void;
};

export function TutorOfferCard({
  declined,
  busy,
  failed,
  scrollIntoView,
  onStart,
  onDecline,
}: TutorOfferCardProps) {
  const titleId = useId();
  const cardRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (scrollIntoView) cardRef.current?.scrollIntoView({ block: "nearest" });
  }, [scrollIntoView]);
  const { offer } = tutorContent;

  if (declined) {
    return <p className="text-sm leading-6 text-secondary-foreground">{offer.declined}</p>;
  }

  const disabled = busy === "start" || busy === "decline";
  return (
    <section
      ref={cardRef}
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-2xl border border-input bg-card p-4 sm:p-5"
    >
      <h3 id={titleId} className="flex items-center gap-2 font-medium text-foreground">
        <GraduationCap className="size-5 text-brand" aria-hidden="true" />
        {offer.title}
      </h3>
      <p className="text-sm leading-6 text-secondary-foreground">{offer.body}</p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => onStart("voice")}
          disabled={disabled}
          className="bg-brand text-brand-foreground hover:bg-brand/85 pointer-coarse:h-11"
        >
          <AudioLines aria-hidden="true" />
          {offer.startVoice} <span className="font-normal">{offer.recommended}</span>
        </Button>
        <Button
          type="button"
          variant="outline"
          onClick={() => onStart("text")}
          disabled={disabled}
          className="pointer-coarse:h-11"
        >
          <MessageSquareText aria-hidden="true" />
          {offer.startText}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={onDecline}
          disabled={disabled}
          className="pointer-coarse:h-11"
        >
          {offer.decline}
        </Button>
      </div>
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          {offer.startFailed}
        </p>
      )}
    </section>
  );
}
