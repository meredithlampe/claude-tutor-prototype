import type { ChatContext, ChatFeature, FeatureSlots, SendMessage } from "@/features/types";
import type { ChatMessage } from "@/types";
import { sendTutorMessage } from "./api";
import { TutorBanner } from "./TutorBanner";
import { TutorComposer } from "./TutorComposer";
import { TutorLayout } from "./TutorLayout";
import { TutorOfferCard } from "./TutorOfferCard";
import { TutorPausedCard } from "./TutorPausedCard";
import type { TutorMode } from "./types";
import { speakStream, useSpeech } from "./useSpeech";
import { useTutorSession } from "./useTutorSession";
import { Workbook } from "./Workbook";

function useTutorSlots(chat: ChatContext): FeatureSlots {
  const tutor = useTutorSession(chat);
  const { session, active } = tutor;
  const speech = useSpeech({
    enabled: active && session?.mode === "voice",
    armed: tutor.voiceArmed,
    replyStreaming: chat.isStreaming,
    // What the learner said is sent as their chat message, and shown in the thread.
    onTranscript: (text) => chat.send(text),
    onUnavailable: tutor.fallbackToText,
  });

  // Tutor's chat turn, with its replies spoken in voice mode (the speaker ignores text otherwise).
  const sendMessage: SendMessage = (conversationId, options) =>
    speakStream(sendTutorMessage(conversationId, options), speech.speaker);

  function exit() {
    speech.stopSpeaking();
    tutor.exit();
  }

  function switchMode(mode: TutorMode) {
    if (mode === "text") speech.stopSpeaking();
    void tutor.switchMode(mode);
  }

  function renderAfterMessage(message: ChatMessage) {
    if (!session) return null;
    const { status } = session;
    if (status === "declined") {
      const isAnswer = message.id === tutor.liveDeclineReplyId || message.id === session.declineMessageId;
      if (!isAnswer || message.status === "streaming") return null;
      return <TutorOfferCard declined busy={null} failed={false} scrollIntoView={false} onStart={tutor.start} onDecline={tutor.decline} />;
    }
    if (message.role !== "assistant" && message.id !== session.offerMessageId) return null;
    if (status === "paused" || status === "complete") {
      const isExitMessage = message.id === tutor.liveExitReplyId || message.id === session.exitedAfterMessageId;
      if (!isExitMessage) return null;
      return (
        <TutorPausedCard
          subject={session.subject}
          complete={status === "complete"}
          resuming={tutor.busy === "resume"}
          failed={tutor.failed === "resume"}
          onResume={() => void tutor.resume()}
        />
      );
    }
    const isOfferMessage = message.id === tutor.liveOfferReplyId || message.id === session.offerMessageId;
    if (!isOfferMessage || status !== "offered") return null;
    return (
      <TutorOfferCard
        declined={false}
        busy={tutor.busy}
        failed={tutor.failed === "start"}
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
        onExit={exit}
        switchingMode={tutor.busy === "mode"}
        onModeChange={switchMode}
        voiceNotice={tutor.voiceNotice}
        onDismissVoiceNotice={tutor.dismissVoiceNotice}
      />
    ),
    layout: (thread) => (
      <TutorLayout
        thread={thread}
        workbook={<Workbook session={session} tutor={tutor} onExit={exit} />}
        tab={tutor.tab}
        onTabChange={tutor.setTab}
        unseen={tutor.unseen}
        focus={tutor.focus}
        onLearnerFocus={tutor.focusByLearner}
      />
    ),
    composer: (
      <TutorComposer
        chat={chat}
        session={session}
        scopingAsked={tutor.scopingAsked}
        inputRef={tutor.composerInputRef}
        speech={speech}
      />
    ),
    renderAfterMessage,
    sendMessage,
    onEvent: tutor.onEvent,
  };
}

export const tutorFeature: ChatFeature = { id: "tutor", useSlots: useTutorSlots };
