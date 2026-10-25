import { Markdown } from "@/components/chat/Markdown";
import { ArtifactView } from "./ArtifactView";
import type { TutorArtifact } from "./types";

type InstructionCardProps = {
  instruction: string;
  artifact?: TutorArtifact;
};

export function InstructionCard({ instruction, artifact }: InstructionCardProps) {
  return (
    <div className="flex flex-col gap-4">
      <Markdown>{instruction}</Markdown>
      {artifact && <ArtifactView artifact={artifact} />}
    </div>
  );
}
