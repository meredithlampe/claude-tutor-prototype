import type { ChatContext, ChatFeature, FeatureSlots } from "./types";

// TUTOR_ENABLED=false turns Tutor off without a code change. Its registration line checks this.
export const tutorEnabled = import.meta.env.TUTOR_ENABLED !== "false";

// The enabled features. Removing a feature's line here turns it off.
const features: ChatFeature[] = [];

export type RegisteredFeatureSlots = FeatureSlots & { id: string };

export function useChatFeatures(chat: ChatContext): RegisteredFeatureSlots[] {
  // `features` never changes at runtime, so these hooks run in the same order on every render.
  return features.map((feature) => ({ id: feature.id, ...feature.useSlots(chat) }));
}
