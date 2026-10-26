import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { tutorContent } from "./content";
import { IntroArrow } from "./IntroArrow";
import { IntroSketch } from "./IntroSketch";

type TutorIntroDialogProps = {
  open: boolean;
  // Got it, Esc or a click outside. The tutor starts after this.
  onDone: () => void;
};

// Shown once per user, when they first start Tutor mode. On wide screens the chat and the
// workbook sit side by side behind it, so the arrows point at them; on narrow screens they're
// tabs, so the sections stack and name their tab instead.
export function TutorIntroDialog({ open, onDone }: TutorIntroDialogProps) {
  const tutorTitleId = useId();
  const workbookTitleId = useId();
  const { intro } = tutorContent;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onDone()}>
      <DialogContent
        showCloseButton={false}
        // The offer card that had focus is gone; the banner takes focus once the dialog closes.
        onCloseAutoFocus={(event) => event.preventDefault()}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto border border-input sm:max-w-lg lg:max-w-3xl lg:p-8"
      >
        <DialogHeader>
          <DialogTitle className="text-xl">{intro.title}</DialogTitle>
        </DialogHeader>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:gap-x-6">
          <section
            aria-labelledby={tutorTitleId}
            className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-4 lg:flex lg:flex-col lg:gap-3"
          >
            <IntroSketch part="chat" />
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground lg:hidden">{intro.tutorTab}</p>
              <h3 id={tutorTitleId} className="flex items-center gap-2 text-base font-semibold text-foreground">
                <IntroArrow direction="left" className="hidden lg:block" />
                {intro.tutorTitle}
              </h3>
              <p className="leading-6 text-secondary-foreground">{intro.tutorBody}</p>
            </div>
          </section>

          <section
            aria-labelledby={workbookTitleId}
            className="grid grid-cols-[5.5rem_minmax(0,1fr)] items-start gap-x-4 lg:flex lg:flex-col lg:gap-3"
          >
            <IntroSketch part="workbook" />
            <div className="flex flex-col gap-1">
              <p className="text-xs text-muted-foreground lg:hidden">{intro.workbookTab}</p>
              <h3 id={workbookTitleId} className="flex items-center gap-2 text-base font-semibold text-foreground">
                {intro.workbookTitle}
                <IntroArrow direction="right" className="hidden lg:block" />
              </h3>
              <p className="leading-6 text-secondary-foreground">
                <span className="lg:hidden">{intro.workbookBodyNarrow}</span>
                <span className="hidden lg:inline">{intro.workbookBody}</span>
              </p>
            </div>
          </section>
        </div>

        <DialogDescription className="border-t border-border pt-4 text-sm leading-6 text-secondary-foreground">
          {intro.note}
        </DialogDescription>

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" className="bg-brand px-5 text-brand-foreground hover:bg-brand/85 pointer-coarse:h-11">
              {intro.gotIt}
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
