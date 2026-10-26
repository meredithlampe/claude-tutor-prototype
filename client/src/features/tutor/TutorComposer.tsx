import type { RefObject } from "react";
import { Composer } from "@/components/chat/Composer";
import type { ChatContext } from "@/features/types";
import { ChoiceChips } from "./ChoiceChips";
import { tutorContent } from "./content";
import type { TutorSession } from "./types";
import type { SpeechState } from "./useSpeech";
import { VoiceControls } from "./VoiceControls";

type TutorComposerProps = {
  chat: ChatContext;
  session: TutorSession;
  scopingAsked: boolean;
  inputRef: RefObject<HTMLTextAreaElement | null>;
  speech: SpeechState;
};

export function TutorComposer({ chat, session, scopingAsked, inputRef, speech }: TutorComposerProps) {
  const { chat: copy } = tutorContent;
  const showChips = session.status === "scoping" && scopingAsked && !chat.isStreaming;
  const askingGoal = !session.scoping.goal;

  return (
    <div className="flex flex-col gap-3">
      <VoiceControls speech={speech} />
      {showChips && (
        <ChoiceChips
          // Re-mounted per question, so focus doesn't sit on a chip that changed meaning.
          key={askingGoal ? "goal" : "time"}
          label={askingGoal ? copy.goalLabel : copy.timeLabel}
          choices={askingGoal ? copy.goals : copy.times}
          onChoose={(choice) => {
            // The chips hide while the tutor replies, so focus moves to the input.
            if (chat.send(choice)) inputRef.current?.focus();
          }}
        />
      )}
      <Composer
        onSubmit={(text) => chat.send(text)}
        isStreaming={chat.isStreaming}
        onStop={chat.stop}
        placeholder={copy.placeholder}
        inputRef={inputRef}
      />
    </div>
  );
}
