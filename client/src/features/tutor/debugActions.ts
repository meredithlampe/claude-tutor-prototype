import type { DebugAction } from "@/features/types";
import { resetIntroSeen } from "./api";
import { tutorContent } from "./content";

const { debug } = tutorContent;

export const tutorDebugActions: DebugAction[] = [
  {
    id: "tutor-reset-intro",
    label: debug.resetIntro,
    run: async () => {
      await resetIntroSeen();
      return debug.introReset;
    },
  },
  {
    id: "tutor-start-bystander",
    label: debug.startBystander,
    run: (app) => app.startChat(debug.bystanderMessage),
  },
  {
    id: "tutor-start-base-rates",
    label: debug.startBaseRates,
    run: (app) => app.startChat(debug.baseRatesMessage),
  },
];
