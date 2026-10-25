import { useId } from "react";
import { PartyPopper } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tutorContent } from "./content";

type SessionCompleteCardProps = {
  exiting: boolean;
  onExit: () => void;
};

// Minimal end of session. The full wrap-up (summary, More practice) comes later.
export function SessionCompleteCard({ exiting, onExit }: SessionCompleteCardProps) {
  const titleId = useId();
  const { complete } = tutorContent;
  return (
    <section aria-labelledby={titleId} className="flex flex-col gap-3 rounded-2xl border border-input bg-card p-5">
      <h3 id={titleId} className="flex items-center gap-2 font-serif text-xl text-foreground">
        <PartyPopper className="size-5 text-brand" aria-hidden="true" />
        {complete.title}
      </h3>
      <p className="leading-7 text-secondary-foreground">{complete.body}</p>
      <div>
        <Button
          type="button"
          onClick={onExit}
          disabled={exiting}
          className="bg-brand text-brand-foreground hover:bg-brand/85 pointer-coarse:h-11"
        >
          {complete.exit}
        </Button>
      </div>
    </section>
  );
}
