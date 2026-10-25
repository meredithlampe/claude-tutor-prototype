import type { ChatContext, ChatFeature, FeatureSlots } from "@/features/types";
import type { ChatMessage } from "@/types";
import { sendTutorMessage } from "./api";
import { TutorBanner } from "./TutorBanner";
import { TutorComposer } from "./TutorComposer";
import { TutorLayout } from "./TutorLayout";
import { TutorOfferCard } from "./TutorOfferCard";
import { useTutorSession } from "./useTutorSession";
import { Workbook } from "./Workbook";

function useTutorSlots(chat: ChatContext): FeatureSlots {
  const tutor = useTutorSession(chat);
  const { session, active } = tutor;

  function renderAfterMessage(message: ChatMessage) {
    if (!session || message.role !== "assistant") return null;
    const isOfferMessage = message.id === tutor.liveOfferReplyId || message.id === session.offerMessageId;
    if (!isOfferMessage || (session.status !== "offered" && session.status !== "declined")) return null;
    return (
      <TutorOfferCard
        declined={session.status === "declined"}
        busy={tutor.busy}
        failed={tutor.failed === "start" || tutor.failed === "decline"}
        scrollIntoView={message.id === tutor.liveOfferReplyId}
        onStart={tutor.start}
        onDecline={tutor.decline}
      />
    );
  }

  if (!active || !session) {
    return { active: false, renderAfterMessage, onEvent: tutor.onEvent };
  }

  return {
    active: true,
    banner: (
      <TutorBanner
        session={session}
        focusOnMount={tutor.justStarted}
        exiting={tutor.busy === "exit"}
        onExit={tutor.exit}
      />
    ),
    layout: (thread) => (
      <TutorLayout
        thread={thread}
        workbook={<Workbook session={session} tutor={tutor} />}
        tab={tutor.tab}
        onTabChange={tutor.setTab}
        unseen={tutor.unseen}
      />
    ),
    composer: (
      <TutorComposer
        chat={chat}
        session={session}
        scopingAsked={tutor.scopingAsked}
        inputRef={tutor.composerInputRef}
      />
    ),
    renderAfterMessage,
    sendMessage: sendTutorMessage,
    onEvent: tutor.onEvent,
  };
}

export const tutorFeature: ChatFeature = { id: "tutor", useSlots: useTutorSlots };
