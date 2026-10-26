import { useId } from "react";
import { tutorContent } from "./content";
import type { CheckScores } from "./types";

type ScoreSummaryProps = {
  scores: CheckScores;
};

// The wrap-up's before/after: each opening-check probe beside its final-check pair, as a
// table, with words for right and wrong (never color alone). The bonus and self-report are
// left out on the server.
export function ScoreSummary({ scores }: ScoreSummaryProps) {
  const headingId = useId();
  const { wrapUp: copy } = tutorContent;

  function cell(score: number | null, max: number, kind: "multiple_choice" | "freeform") {
    if (score === null) return scores.pending ? copy.scoresGrading : copy.scoresMissing;
    if (kind === "multiple_choice") return score === max ? copy.scoresRight : copy.scoresWrong;
    return copy.scoresPoints(score, max);
  }

  return (
    <section aria-labelledby={headingId} className="flex flex-col gap-3 rounded-2xl border border-input bg-card p-4 sm:p-5">
      <h4 id={headingId} className="font-medium text-foreground">
        {copy.scoresHeading}
      </h4>
      <p className="text-sm leading-6 text-secondary-foreground">{copy.scoresIntro}</p>
      <table className="w-full text-left text-sm">
        <thead className="text-secondary-foreground">
          <tr>
            <th scope="col" className="py-1.5 pr-3 font-medium">{copy.scoresQuestion}</th>
            <th scope="col" className="py-1.5 pr-3 font-medium">{copy.scoresBefore}</th>
            <th scope="col" className="py-1.5 font-medium">{copy.scoresAfter}</th>
          </tr>
        </thead>
        <tbody className="text-foreground">
          {scores.items.map((item, index) => (
            <tr key={index} className="border-t border-border">
              <th scope="row" className="py-2 pr-3 font-normal">{copy.scoresItem(index + 1, item.kind)}</th>
              <td className="py-2 pr-3">{cell(item.before, item.max, item.kind)}</td>
              <td className="py-2">{cell(item.after, item.max, item.kind)}</td>
            </tr>
          ))}
          <tr className="border-t border-border font-semibold">
            <th scope="row" className="py-2 pr-3">{copy.scoresTotal}</th>
            <td className="py-2 pr-3">{copy.scoresPoints(scores.total.before, scores.total.max)}</td>
            <td className="py-2">{copy.scoresPoints(scores.total.after, scores.total.max)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}
