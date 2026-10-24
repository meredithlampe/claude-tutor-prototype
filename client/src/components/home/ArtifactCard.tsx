import type { Artifact } from "@/types";

type ArtifactCardProps = {
  artifact: Artifact;
};

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function ArtifactCard({ artifact }: ArtifactCardProps) {
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <div
        aria-hidden="true"
        className="flex aspect-[4/3] flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-4"
      >
        <div className="h-2 w-2/3 rounded-full bg-accent" />
        <div className="h-2 w-1/2 rounded-full bg-accent/70" />
        <div className="mt-auto h-1/2 rounded-lg bg-secondary" />
      </div>
      <div className="min-w-0 px-0.5">
        <h3 className="truncate text-sm text-foreground" title={artifact.title}>
          {artifact.title}
        </h3>
        <p className="text-xs text-muted-foreground">
          <time dateTime={artifact.updatedAt}>
            {dateFormat.format(new Date(artifact.updatedAt))}
          </time>
        </p>
      </div>
    </li>
  );
}
