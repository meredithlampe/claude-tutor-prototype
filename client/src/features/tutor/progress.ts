import { tutorContent } from "./content";
import type { TutorSession } from "./types";

// Where the learner is, for the banner and announcements: "Step 2 of 3", "Final check 1 of 2".
export function progressLabel(session: TutorSession): string {
  const { progress } = tutorContent.banner;
  if (session.status === "scoping") return progress.scoping;
  if (session.status === "wrap_up") return progress.wrapUp;
  if (session.status === "complete") return progress.complete;
  // Waiting on step 2 or 3: the learner is on that step, not back to building the workbook.
  if (session.building === "steps" && session.position > 0) {
    return progress.step(session.position + 1, session.counts.steps);
  }
  // Waiting on a similar question: the learner is still on the same step.
  if (session.building && session.building !== "parallel") return progress.building;
  const current = session.current;
  if (!current) return progress.building;
  switch (current.section) {
    case "assessment":
      return progress.assessment(session.position + 1, session.counts.assessment);
    case "step":
      return progress.step((current.stepIndex ?? 0) + 1, session.counts.steps);
    case "final":
      return progress.final(session.position + 1, session.counts.finalCheck);
    case "bonus":
      return progress.bonus;
    case "practice":
      return progress.practice(session.practicePosition + 1, session.counts.morePractice);
  }
}

// Which progress-bar node the learner is on: 0 opening check, 1–3 the steps, 4 the final check.
// None while scoping, and none after the final check (bonus, wrap-up, More practice).
export function currentPart(session: TutorSession): number | undefined {
  switch (session.status) {
    case "assessing":
      return 0;
    case "teaching":
      return 1 + session.position;
    case "final_check":
      return session.outline.finalCheck === "completed" ? undefined : 1 + session.counts.steps;
    default:
      return undefined;
  }
}
