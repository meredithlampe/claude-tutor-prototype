import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { tutorContent } from "./content";
import type { TutorTab } from "./types";

type TutorLayoutProps = {
  thread: ReactNode;
  workbook: ReactNode;
  tab: TutorTab;
  onTabChange: (tab: TutorTab) => void;
  unseen: Record<TutorTab, boolean>;
  // The surface in focus. Side by side (lg up), it's highlighted and the other is dimmed, but
  // both stay fully usable. 70% opacity keeps the faintest text at 3:1.
  focus: TutorTab;
  onLearnerFocus: (tab: TutorTab) => void;
};

function surfaceClasses(inFocus: boolean) {
  return cn(
    "motion-safe:transition-[opacity,background-color] motion-safe:duration-300",
    inFocus ? "lg:bg-card/60" : "lg:opacity-70",
  );
}

const panelClasses =
  "mt-0 flex min-h-0 flex-1 flex-col data-[state=inactive]:hidden lg:data-[state=inactive]:flex";

// Chat on the left, workbook on the right (the wider of the two) from lg up. Below that, the
// same two panels become Chat / Workbook tabs. Both stay mounted, so switching keeps state.
export function TutorLayout({ thread, workbook, tab, onTabChange, unseen, focus, onLearnerFocus }: TutorLayoutProps) {
  const { layout } = tutorContent;
  const tabs: TutorTab[] = ["chat", "workbook"];

  return (
    <Tabs
      value={tab}
      onValueChange={(value) => onTabChange(value as TutorTab)}
      className="flex min-h-0 flex-1 flex-col gap-0"
    >
      <TabsList aria-label={layout.tabsLabel} className="mx-4 mt-2 grid h-11 w-auto grid-cols-2 lg:hidden">
        {tabs.map((value) => (
          <TabsTrigger key={value} value={value} className="h-full gap-2">
            {layout[value]}
            {unseen[value] && tab !== value && (
              <span className="rounded-full bg-brand px-1.5 text-xs font-semibold text-brand-foreground">
                {layout.newContent}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
      <div className="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
        {/* Not tab stops themselves: both panels start with focusable controls. */}
        <TabsContent
          value="chat"
          forceMount
          tabIndex={-1}
          onPointerDownCapture={() => onLearnerFocus("chat")}
          onFocusCapture={() => onLearnerFocus("chat")}
          className={cn(panelClasses, "lg:border-r lg:border-border", surfaceClasses(focus === "chat"))}
        >
          {thread}
        </TabsContent>
        <TabsContent
          value="workbook"
          forceMount
          tabIndex={-1}
          onPointerDownCapture={() => onLearnerFocus("workbook")}
          onFocusCapture={() => onLearnerFocus("workbook")}
          className={cn(panelClasses, surfaceClasses(focus === "workbook"))}
        >
          {workbook}
        </TabsContent>
      </div>
    </Tabs>
  );
}
