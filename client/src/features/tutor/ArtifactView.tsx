import { tutorContent } from "./content";
import type { TutorArtifact } from "./types";

type ArtifactViewProps = {
  artifact: TutorArtifact;
};

// Rendered as an image, so nothing inside the SVG can run.
export function ArtifactView({ artifact }: ArtifactViewProps) {
  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artifact.content)}`;
  return (
    <figure className="flex flex-col gap-2">
      <img
        src={src}
        alt={`${tutorContent.artifact.label(artifact.title)}. ${artifact.description}`}
        className="h-auto w-full rounded-xl border border-border bg-white"
      />
      <figcaption className="text-sm text-secondary-foreground">{artifact.title}</figcaption>
    </figure>
  );
}
