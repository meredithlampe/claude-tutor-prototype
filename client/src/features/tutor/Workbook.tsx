import { useEffect, useRef } from "react";
import { tutorContent } from "./content";
import { InstructionCard } from "./InstructionCard";
import { QuestionCard } from "./QuestionCard";
import { SessionCompleteCard } from "./SessionCompleteCard";
import type { CurrentItem, TutorSession } from "./types";
import type { TutorState } from "./useTutorSession";
import { WorkbookStatus } from "./WorkbookStatus";

type WorkbookProps = {
  session: TutorSession;
  tutor: TutorState;
};

function itemHeading(item: CurrentItem, session: TutorSession): { title: string; counter?: string } {
  const { sections, counter } = tutorContent.workbook;
  switch (item.section) {
    case "assessment":
      return { title: sections.assessment, counter: counter(session.position + 1, session.counts.assessment) };
    case "step":
      return { title: sections.step((item.stepIndex ?? 0) + 1, session.counts.steps) };
    case "final":
      return { title: sections.final, counter: counter(session.position + 1, session.counts.finalCheck) };
    case "bonus":
      return { title: sections.bonus, counter: tutorContent.workbook.optional };
  }
}

export function Workbook({ session, tutor }: WorkbookProps) {
  const { workbook } = tutorContent;
  const item = session.current;
  const questionId = item?.question.id;

  // When a new item replaces the one the learner was on, move focus to its heading. Not on
  // first render, so loading or reloading the page doesn't move focus.
  const headingRef = useRef<HTMLHeadingElement>(null);
  const shownRef = useRef(questionId);
  useEffect(() => {
    if (shownRef.current === questionId) return;
    shownRef.current = questionId;
    if (questionId) headingRef.current?.focus();
  }, [questionId]);

  let body;
  if (session.status === "wrap_up") {
    body = <SessionCompleteCard exiting={tutor.busy === "exit"} onExit={tutor.exit} />;
  } else if (session.status === "scoping") {
    body = <WorkbookStatus kind="empty" />;
  } else if (session.building && session.generationError) {
    body = <WorkbookStatus kind="failed" retrying={tutor.busy === "build"} onRetry={tutor.retryBuild} />;
  } else if (session.building || !item) {
    body = <WorkbookStatus kind="building" part={session.building ?? "assessment"} />;
  } else {
    const heading = itemHeading(item, session);
    const role = item.question.role;
    body = (
      <article className="flex flex-col gap-5" aria-labelledby="tutor-item-heading">
        <header className="flex flex-col gap-2">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3
              id="tutor-item-heading"
              ref={headingRef}
              tabIndex={-1}
              className="font-serif text-xl text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {heading.title}
              {heading.counter && " "}
              {heading.counter && (
                <span className="ml-2 font-sans text-sm text-secondary-foreground">{heading.counter}</span>
              )}
            </h3>
            {item.practice?.onParallel && (
              <span className="text-sm text-secondary-foreground">{workbook.similarQuestion}</span>
            )}
          </div>
          <p className="flex flex-wrap items-center gap-2 text-sm text-secondary-foreground">
            <span className="rounded-md border border-input px-1.5 py-0.5 text-xs font-semibold tracking-wide text-foreground uppercase">
              {workbook.kind[role]}
            </span>
            {workbook.kindHelp[role]}
          </p>
        </header>
        {item.step && (
          <InstructionCard instruction={item.step.instruction} artifact={item.step.artifact} />
        )}
        <QuestionCard
          key={item.question.id}
          item={item}
          isLastStep={item.section === "step" && (item.stepIndex ?? 0) + 1 >= session.counts.steps}
          busy={tutor.busy}
          onSubmit={tutor.submit}
          onReveal={(via) => tutor.revealAnswer(item.question.id, via)}
          onExplain={() => tutor.explain(item.question.id)}
          onTryParallel={tutor.tryParallel}
          onNext={() => tutor.next(item.question.id)}
          onDraftChange={tutor.setDraft}
        />
      </article>
    );
  }

  return (
    <section aria-labelledby="tutor-workbook-heading" className="flex min-h-0 flex-1 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-[70ch] flex-col gap-5 px-4 py-5 lg:px-6">
          <h2 id="tutor-workbook-heading" className="sr-only lg:not-sr-only lg:text-sm lg:font-medium lg:text-muted-foreground">
            {workbook.heading}
          </h2>
          {body}
          {tutor.failed && tutor.failed !== "build" && (
            <p role="alert" className="text-sm text-destructive">
              {workbook.actionFailed}
            </p>
          )}
        </div>
      </div>
      <p aria-live="polite" className="sr-only">
        {tutor.announcement}
      </p>
    </section>
  );
}
