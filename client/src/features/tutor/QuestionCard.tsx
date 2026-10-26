import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { Markdown } from "@/components/chat/Markdown";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AnswerFeedback } from "./AnswerFeedback";
import { ArtifactView } from "./ArtifactView";
import { tutorContent } from "./content";
import { OptionGroup } from "./OptionGroup";
import type { AnswerInput, Confidence, CurrentItem, WorkbookDraft } from "./types";
import type { TutorAction } from "./useTutorSession";

type QuestionCardProps = {
  item: CurrentItem;
  isLastStep: boolean;
  busy: TutorAction | null;
  onSubmit: (input: AnswerInput) => void;
  onReveal: (via: "show_me" | "show_answer") => void;
  onExplain: () => void;
  onTryParallel: () => void;
  onNext: () => void;
  onDraftChange: (draft: WorkbookDraft) => void;
};

const CONFIDENCE: Confidence[] = ["sure", "think_so", "guessing"];

// One question: an MC radio group or a textarea, plus Submit. Practice questions add Show me
// and the wrong-answer choices; checks add the confidence control and move on when submitted.
// Keyed by question id, so local state resets for each new question.
export function QuestionCard({
  item,
  isLastStep,
  busy,
  onSubmit,
  onReveal,
  onExplain,
  onTryParallel,
  onNext,
  onDraftChange,
}: QuestionCardProps) {
  const { question: copy } = tutorContent;
  const { question, practice, attempts, reveal } = item;
  const textId = useId();
  const last = attempts.at(-1);
  // After a reload, show the option the learner already submitted.
  const [selected, setSelected] = useState<number | undefined>(() => {
    const index = last ? (question.options?.indexOf(last.response) ?? -1) : -1;
    return index >= 0 ? index : undefined;
  });
  const [text, setText] = useState(last?.result === "partial" ? last.response : "");
  const [confidence, setConfidence] = useState<Confidence>();
  const [missing, setMissing] = useState<string>();

  const isCheck = question.role === "check";
  const done = practice?.done ?? false;
  const canSubmit = practice ? practice.canSubmit : true;
  const missedOriginal = Boolean(practice?.missed);
  const anyBusy = busy !== null;

  // A result or a reveal replaces the buttons that had focus, so focus moves to the feedback.
  const feedbackRef = useRef<HTMLDivElement>(null);
  const feedbackKey = `${attempts.length}:${reveal?.via ?? ""}`;
  const shownFeedbackRef = useRef(feedbackKey);
  useEffect(() => {
    if (shownFeedbackRef.current === feedbackKey) return;
    shownFeedbackRef.current = feedbackKey;
    feedbackRef.current?.focus();
  }, [feedbackKey]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (anyBusy || !canSubmit) return;
    const isChoice = question.kind === "multiple_choice";
    if (isChoice && selected === undefined) return setMissing(copy.chooseAnswer);
    if (!isChoice && !text.trim()) return setMissing(copy.writeAnswer);
    if (isCheck && !confidence) return setMissing(copy.chooseConfidence);
    setMissing(undefined);
    onSubmit({
      questionId: question.id,
      optionIndex: isChoice ? selected : undefined,
      text: isChoice ? undefined : text.trim(),
      confidence: isCheck ? confidence : undefined,
    });
  }

  function select(index: number) {
    if (anyBusy) return;
    setSelected(index);
    setMissing(undefined);
    onDraftChange({ questionId: question.id, selectedOption: index });
  }

  function type(value: string) {
    setText(value);
    setMissing(undefined);
    onDraftChange({ questionId: question.id, text: value });
  }

  const nextLabels: Partial<Record<CurrentItem["section"], string>> = {
    step: isLastStep ? copy.toFinalCheck : copy.nextStep,
    practice: isLastStep ? copy.finishPractice : copy.nextPractice,
  };
  const nextLabel = nextLabels[item.section] ?? copy.next;

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
      {question.resource && (
        <div className="rounded-xl border border-input bg-background p-3 text-sm">
          <Markdown>{question.resource}</Markdown>
        </div>
      )}

      {question.artifact && <ArtifactView artifact={question.artifact} />}

      {question.kind === "multiple_choice" && question.options ? (
        <OptionGroup
          legend={question.prompt}
          legendClassName="text-base leading-7 font-medium text-foreground"
          options={question.options}
          selected={selected}
          onSelect={select}
          disabled={!canSubmit}
          lettered={question.role !== "self_report"}
        />
      ) : (
        <div className="flex flex-col gap-2">
          <p className="text-base leading-7 font-medium text-foreground">{question.prompt}</p>
          {canSubmit ? (
            <>
              <label htmlFor={textId} className="text-sm text-secondary-foreground">
                {copy.answerLabel}
              </label>
              <Textarea
                id={textId}
                rows={4}
                value={text}
                onChange={(event) => type(event.target.value)}
                placeholder={copy.answerPlaceholder}
                readOnly={anyBusy}
                className="min-h-24 bg-background text-base dark:bg-background"
              />
            </>
          ) : (
            last && <p className="text-sm text-secondary-foreground">{copy.yourAnswer(last.response)}</p>
          )}
        </div>
      )}

      {isCheck && (
        <OptionGroup
          legend={copy.confidenceLabel}
          legendClassName="text-sm font-medium text-foreground"
          options={CONFIDENCE.map((value) => copy.confidence[value])}
          selected={confidence ? CONFIDENCE.indexOf(confidence) : undefined}
          onSelect={(index) => {
            setConfidence(CONFIDENCE[index]);
            setMissing(undefined);
          }}
          inline
        />
      )}

      {practice && (
        <div
          ref={feedbackRef}
          tabIndex={-1}
          // Where focus returns after the tutor answers a wrong answer in the chat.
          data-tutor-return={last || reveal ? "" : undefined}
          className="flex flex-col gap-3 rounded-xl outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <AnswerFeedback
            attempt={last}
            partialIsFinal={last?.result === "partial" && !canSubmit}
            reveal={reveal}
          />
        </div>
      )}

      {missedOriginal && practice?.explainRequested && (
        <p className="text-sm text-secondary-foreground">{copy.explainSent}</p>
      )}

      {missing && (
        <p role="alert" className="text-sm text-destructive">
          {missing}
        </p>
      )}

      <div className="flex flex-wrap gap-2">
        {canSubmit && (
          <Button
            type="submit"
            aria-disabled={anyBusy}
            className="bg-brand text-brand-foreground hover:bg-brand/85 aria-disabled:opacity-60 pointer-coarse:h-11"
          >
            {busy === "answer" ? copy.submitting : copy.submit}
          </Button>
        )}
        {practice && canSubmit && (
          <Button
            type="button"
            variant="outline"
            onClick={() => onReveal("show_me")}
            disabled={anyBusy}
            className="pointer-coarse:h-11"
          >
            {copy.showMe}
          </Button>
        )}
        {missedOriginal && (
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => onReveal("show_answer")}
              disabled={anyBusy}
              className="pointer-coarse:h-11"
            >
              {copy.showAnswer}
            </Button>
            {!practice?.explainRequested && (
              <Button
                type="button"
                variant="outline"
                onClick={onExplain}
                disabled={anyBusy}
                className="pointer-coarse:h-11"
              >
                {copy.explain}
              </Button>
            )}
          </>
        )}
        {practice?.canTryParallel && (practice.explainRequested || reveal) && (
          <Button
            type="button"
            variant={done ? "outline" : "default"}
            onClick={onTryParallel}
            disabled={anyBusy}
            className="pointer-coarse:h-11"
          >
            {copy.trySimilar}
          </Button>
        )}
        {done && (
          <Button
            type="button"
            onClick={onNext}
            disabled={anyBusy}
            className="bg-brand text-brand-foreground hover:bg-brand/85 pointer-coarse:h-11"
          >
            {nextLabel}
          </Button>
        )}
        {item.section === "bonus" && (
          <Button type="button" variant="ghost" onClick={onNext} disabled={anyBusy} className="pointer-coarse:h-11">
            {copy.skipBonus}
          </Button>
        )}
      </div>
    </form>
  );
}
