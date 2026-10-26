import { Markdown } from "@/components/chat/Markdown";
import { ArtifactView } from "./ArtifactView";
import type { TutorArtifact } from "./types";

type InstructionCardProps = {
  // The step's scenario: the situation and its numbers, before the instruction refers to the visual.
  context?: string;
  instruction: string;
  artifact?: TutorArtifact;
};

export function InstructionCard({ context, instruction, artifact }: InstructionCardProps) {
  return (
    <div className="flex flex-col gap-4">
      {context && <p className="text-base leading-7 text-foreground">{context}</p>}
      <Markdown>{instruction}</Markdown>
      {artifact && <ArtifactView artifact={artifact} />}
    </div>
  );
}
