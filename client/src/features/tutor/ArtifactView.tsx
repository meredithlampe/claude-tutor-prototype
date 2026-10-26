import { useState } from "react";
import type { TutorArtifact } from "./types";

type ArtifactViewProps = {
  artifact: TutorArtifact;
};

// Rendered as an image, so nothing inside the SVG can run. The server draws visuals for the
// dark card background and sizes their text for this width, so the image is capped rather
// than stretched across a wide workbook. The figcaption names the figure; the alt text is
// its description.
export function ArtifactView({ artifact }: ArtifactViewProps) {
  const [failed, setFailed] = useState(false);
  if (failed) return null;

  const src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(artifact.content)}`;
  return (
    <figure className="flex w-full max-w-lg flex-col gap-2 self-center">
      <img
        src={src}
        alt={artifact.description}
        onError={() => setFailed(true)}
        className="h-auto w-full rounded-xl border border-border bg-card p-2"
      />
      <figcaption className="text-sm text-secondary-foreground">{artifact.title}</figcaption>
    </figure>
  );
}
