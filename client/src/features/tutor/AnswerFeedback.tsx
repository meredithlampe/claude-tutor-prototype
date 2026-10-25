import { CircleCheck, CircleHelp, CircleX, Lightbulb } from "lucide-react";
import { tutorContent } from "./content";
import type { CurrentItem, PublicAttempt } from "./types";

type AnswerFeedbackProps = {
  attempt?: PublicAttempt;
  // A partial answer with no retry left counts as a miss.
  partialIsFinal: boolean;
  reveal?: CurrentItem["reveal"];
};

const resultIcons = {
  correct: CircleCheck,
  partial: CircleHelp,
  incorrect: CircleX,
};

// The result line (icon plus words, never color alone) and, once shown, the answer.
export function AnswerFeedback({ attempt, partialIsFinal, reveal }: AnswerFeedbackProps) {
  const { question } = tutorContent;
  const result = attempt?.result;
  const Icon = result ? resultIcons[result] : undefined;
  const resultText =
    result === "partial" && partialIsFinal ? question.results.partialFinal : result && question.results[result];

  return (
    <>
      {attempt && result && Icon && (
        <div className="flex gap-3 rounded-xl border border-input bg-background p-3 text-sm leading-6">
          <Icon
            aria-hidden="true"
            className={result === "correct" ? "mt-0.5 size-5 shrink-0 text-brand" : "mt-0.5 size-5 shrink-0 text-destructive"}
          />
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-foreground">{resultText}</p>
            {attempt.feedback && <p className="text-secondary-foreground">{attempt.feedback}</p>}
          </div>
        </div>
      )}
      {reveal && (
        <div className="flex gap-3 rounded-xl border border-input bg-background p-3 text-sm leading-6">
          <Lightbulb aria-hidden="true" className="mt-0.5 size-5 shrink-0 text-brand" />
          <div className="flex flex-col gap-1">
            <p className="font-semibold text-foreground">
              {question.answerHeading}
              {reveal.answer && `: ${reveal.answer}`}
            </p>
            {reveal.via === "auto_after_two_misses" && (
              <p className="text-secondary-foreground">{question.autoRevealed}</p>
            )}
            {reveal.explanation && <p className="text-secondary-foreground">{reveal.explanation}</p>}
          </div>
        </div>
      )}
    </>
  );
}
