import { tutorContent } from "./content";
import type { TutorSession } from "./types";

// Where the learner is, for the banner and announcements: "Step 2 of 3", "Final check 1 of 2".
export function progressLabel(session: TutorSession): string {
  const { progress } = tutorContent.banner;
  if (session.status === "scoping") return progress.scoping;
  if (session.status === "wrap_up") return progress.wrapUp;
  if (session.status === "complete") return progress.complete;
  if (session.building) return progress.building;
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
