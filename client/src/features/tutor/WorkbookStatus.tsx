import { BookOpen, CircleAlert, LoaderCircle, MessageSquareText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { tutorContent } from "./content";

type WorkbookStatusProps =
  | { kind: "empty" }
  | { kind: "waiting" }
  | { kind: "building"; part: "assessment" | "steps" | "practice" }
  | { kind: "failed"; retrying: boolean; onRetry: () => void };

// The workbook before there's a question to show: empty during scoping, loading while it's
// generated, or failed with a retry.
export function WorkbookStatus(props: WorkbookStatusProps) {
  const { workbook } = tutorContent;
  const boxClasses = "flex flex-col items-start gap-3 rounded-2xl border border-dashed border-input p-5";

  if (props.kind === "empty") {
    return (
      <div className={boxClasses}>
        <BookOpen className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium text-foreground">{workbook.emptyTitle}</p>
        <p className="text-sm leading-6 text-secondary-foreground">{workbook.emptyBody}</p>
      </div>
    );
  }

  if (props.kind === "waiting") {
    return (
      <div className={boxClasses}>
        <MessageSquareText className="size-6 text-muted-foreground" aria-hidden="true" />
        <p className="font-medium text-foreground">{workbook.waitingTitle}</p>
        <p className="text-sm leading-6 text-secondary-foreground">{workbook.waitingBody}</p>
      </div>
    );
  }

  if (props.kind === "building") {
    return (
      <div className={boxClasses}>
        <LoaderCircle className="size-6 text-brand motion-safe:animate-spin" aria-hidden="true" />
        <p className="font-medium text-foreground">
          {props.part === "assessment"
            ? workbook.buildingAssessment
            : props.part === "steps"
              ? workbook.buildingSteps
              : workbook.buildingPractice}
        </p>
        <p className="text-sm leading-6 text-secondary-foreground">{workbook.buildingHint}</p>
      </div>
    );
  }

  return (
    <div className={boxClasses}>
      <CircleAlert className="size-6 text-destructive" aria-hidden="true" />
      <p className="font-medium text-foreground">{workbook.buildFailed}</p>
      <Button type="button" variant="outline" onClick={props.onRetry} disabled={props.retrying} className="pointer-coarse:h-11">
        {workbook.tryAgain}
      </Button>
    </div>
  );
}
