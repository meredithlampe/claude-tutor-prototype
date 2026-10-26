import { useEffect, useId, useRef, useState, type FormEvent, type RefObject } from "react";
import { LoaderCircle, LogOut, Repeat } from "lucide-react";
import { Markdown } from "@/components/chat/Markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { tutorContent } from "./content";
import { ScoreSummary } from "./ScoreSummary";
import type { TutorSession } from "./types";
import type { TutorAction } from "./useTutorSession";

type WrapUpProps = {
  // The workbook moves focus here when the wrap-up replaces the last question.
  headingRef: RefObject<HTMLHeadingElement | null>;
  wrapUp: TutorSession["wrapUp"];
  busy: TutorAction | null;
  onSubmitSummary: (text: string) => void;
  onRetrySummary: () => void;
  onConsent: (consented: boolean) => void;
  onMorePractice: () => void;
  onExit: () => void;
};

// The end of the workbook, in order: the learner's summary, then the tutor's, then the
// check-in question, then More practice or Exit. Each part appears once the one before it
// is done, and focus moves to it so keyboard and screen-reader users follow along.
export function WrapUp({ headingRef, wrapUp, busy, onSubmitSummary, onRetrySummary, onConsent, onMorePractice, onExit }: WrapUpProps) {
  const { wrapUp: copy } = tutorContent;
  const summaryId = useId();
  const helpId = useId();
  const consentId = useId();
  const nextId = useId();
  const [text, setText] = useState("");
  const [missing, setMissing] = useState(false);
  // Shown as submitted while the tutor's summary is written (the server stores both together).
  const [submitted, setSubmitted] = useState<string>();
  const learnerSummary = wrapUp.learnerSummary ?? (busy === "summary" ? submitted : undefined);
  const tutorReady = Boolean(wrapUp.tutorSummary || wrapUp.summaryFailed);
  const consentAnswered = wrapUp.delayedCheckConsent !== undefined;

  const summaryRef = useRef<HTMLDivElement>(null);
  const consentRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLHeadingElement>(null);
  // Focus the part's heading, and bring the whole part (with its buttons) into view.
  function reveal(heading: HTMLElement | null) {
    if (!heading) return;
    heading.focus({ preventScroll: true });
    (heading.closest("section") ?? heading).scrollIntoView({ block: "nearest" });
  }
  const stageRef = useRef({ learnerSummary: Boolean(learnerSummary), tutorReady, consentAnswered });
  useEffect(() => {
    const before = stageRef.current;
    stageRef.current = { learnerSummary: Boolean(learnerSummary), tutorReady, consentAnswered };
    if (consentAnswered && !before.consentAnswered) reveal(nextRef.current);
    else if (tutorReady && !before.tutorReady) reveal(consentRef.current);
    else if (learnerSummary && !before.learnerSummary) summaryRef.current?.focus();
  }, [learnerSummary, tutorReady, consentAnswered]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const summary = text.trim();
    if (!summary) {
      setMissing(true);
      return;
    }
    setSubmitted(summary);
    onSubmitSummary(summary);
  }

  const sectionClasses = "flex flex-col gap-3 rounded-2xl border border-input bg-card p-4 sm:p-5";
  const headingClasses = "font-medium text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring";

  return (
    <article className="flex flex-col gap-5" aria-labelledby="tutor-item-heading">
      <header className="flex flex-col gap-2">
        <h3 id="tutor-item-heading" ref={headingRef} tabIndex={-1} className="font-serif text-xl text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {copy.heading}
        </h3>
        <p className="text-sm leading-6 text-secondary-foreground">{copy.intro}</p>
      </header>

      {!learnerSummary ? (
        <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-2">
          <label htmlFor={summaryId} className="text-base leading-7 font-medium text-foreground">
            {copy.summaryLabel}
          </label>
          <p id={helpId} className="text-sm text-secondary-foreground">
            {copy.summaryHelp}
          </p>
          <Textarea
            id={summaryId}
            aria-describedby={helpId}
            rows={5}
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setMissing(false);
            }}
            className="min-h-28 bg-background text-base dark:bg-background"
          />
          {missing && (
            <p role="alert" className="text-sm text-destructive">
              {copy.writeSummary}
            </p>
          )}
          <div>
            <Button type="submit" className="bg-brand text-brand-foreground hover:bg-brand/85 pointer-coarse:h-11">
              {copy.submitSummary}
            </Button>
          </div>
        </form>
      ) : (
        <div ref={summaryRef} tabIndex={-1} className="flex flex-col gap-4 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <section className={sectionClasses}>
            <h4 className="text-sm font-medium text-secondary-foreground">{copy.yourSummary}</h4>
            <p className="leading-7 whitespace-pre-wrap text-foreground">{learnerSummary}</p>
          </section>
          <section className={sectionClasses}>
            <h4 className="text-sm font-medium text-secondary-foreground">{copy.tutorSummary}</h4>
            {wrapUp.tutorSummary ? (
              <Markdown>{wrapUp.tutorSummary}</Markdown>
            ) : wrapUp.summaryFailed && busy !== "summary" ? (
              <div className="flex flex-wrap items-center gap-3">
                <p className="text-sm text-secondary-foreground">{copy.summaryFailed}</p>
                <Button type="button" variant="outline" size="sm" onClick={onRetrySummary} className="pointer-coarse:h-11">
                  {copy.tryAgain}
                </Button>
              </div>
            ) : (
              <p role="status" className="flex items-center gap-2 text-sm text-secondary-foreground">
                <LoaderCircle className="size-4 text-brand motion-safe:animate-spin" aria-hidden="true" />
                {copy.writingSummary}
              </p>
            )}
          </section>
        </div>
      )}

      {learnerSummary && tutorReady && wrapUp.scores && <ScoreSummary scores={wrapUp.scores} />}

      {learnerSummary && tutorReady && (
        <section aria-labelledby={consentId} className={sectionClasses}>
          <h4 id={consentId} ref={consentRef} tabIndex={-1} className={headingClasses}>
            {copy.consentQuestion}
          </h4>
          <p className="text-sm leading-6 text-secondary-foreground">{copy.consentHelp}</p>
          {consentAnswered ? (
            <p className="text-sm leading-6 text-foreground">{wrapUp.delayedCheckConsent ? copy.consented : copy.declined}</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" onClick={() => onConsent(true)} disabled={busy !== null} className="pointer-coarse:h-11">
                {copy.consentYes}
              </Button>
              <Button type="button" variant="outline" onClick={() => onConsent(false)} disabled={busy !== null} className="pointer-coarse:h-11">
                {copy.consentNo}
              </Button>
            </div>
          )}
        </section>
      )}

      {consentAnswered && wrapUp.learnerSummary && (
        <section aria-labelledby={nextId} className="flex flex-col gap-3">
          <h4 id={nextId} ref={nextRef} tabIndex={-1} className={headingClasses}>
            {copy.nextHeading}
          </h4>
          <p className="text-sm leading-6 text-secondary-foreground">{copy.nextHelp}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              onClick={onMorePractice}
              disabled={busy !== null}
              className="bg-brand text-brand-foreground hover:bg-brand/85 pointer-coarse:h-11"
            >
              <Repeat aria-hidden="true" />
              {copy.morePractice}
            </Button>
            <Button type="button" variant="outline" onClick={onExit} disabled={busy !== null} className="pointer-coarse:h-11">
              <LogOut aria-hidden="true" />
              {copy.exit}
            </Button>
          </div>
        </section>
      )}
    </article>
  );
}
