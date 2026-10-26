import { useId } from "react";
import { CircleCheck, GraduationCap, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tutorContent } from "./content";

type TutorPausedCardProps = {
  subject: string;
  // A finished session gets a record of it instead of Resume.
  complete: boolean;
  resuming: boolean;
  failed: boolean;
  onResume: () => void;
};

// Left in the thread where the learner exited Tutor mode, from the saved session, so it's
// still there after a reload.
export function TutorPausedCard({ subject, complete, resuming, failed, onResume }: TutorPausedCardProps) {
  const titleId = useId();
  const { paused } = tutorContent;
  const Icon = complete ? CircleCheck : GraduationCap;

  return (
    <section
      aria-labelledby={titleId}
      className="flex flex-col gap-3 rounded-2xl border border-input bg-card p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5"
    >
      <div className="flex min-w-0 flex-col gap-1">
        <h3 id={titleId} className="flex items-center gap-2 font-medium text-foreground">
          <Icon className="size-5 shrink-0 text-brand" aria-hidden="true" />
          {complete ? paused.completeTitle : paused.title}
        </h3>
        <p className="text-sm leading-6 text-secondary-foreground">
          {complete ? paused.completeBody(subject) : paused.body(subject)}
        </p>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {paused.resumeFailed}
          </p>
        )}
      </div>
      {!complete && (
        <Button
          type="button"
          onClick={onResume}
          disabled={resuming}
          className="shrink-0 self-start bg-brand text-brand-foreground hover:bg-brand/85 sm:self-center pointer-coarse:h-11"
        >
          <Play aria-hidden="true" />
          {paused.resume}
        </Button>
      )}
    </section>
  );
}
