import { StubTooltip } from "@/components/StubTooltip";
import { cn } from "@/lib/utils";
import { stubClasses } from "@/lib/stub";
import type { Artifact } from "@/types";

type ArtifactCardProps = {
  artifact: Artifact;
};

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

export function ArtifactCard({ artifact }: ArtifactCardProps) {
  return (
    <li className="min-w-0">
      <StubTooltip>
        <button
          type="button"
          className={cn(
            "flex w-full min-w-0 flex-col gap-2 rounded-xl text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            stubClasses,
          )}
        >
          <span
            aria-hidden="true"
            className="flex aspect-[4/3] w-full flex-col gap-2 overflow-hidden rounded-xl border border-border bg-card p-4"
          >
            <span className="h-2 w-2/3 rounded-full bg-accent" />
            <span className="h-2 w-1/2 rounded-full bg-accent/70" />
            <span className="mt-auto h-1/2 rounded-lg bg-secondary" />
          </span>
          <span className="flex min-w-0 flex-col px-0.5">
            <span className="truncate text-sm">
              {artifact.title}
            </span>
            <span className="text-xs">
              <time dateTime={artifact.updatedAt}>
                {dateFormat.format(new Date(artifact.updatedAt))}
              </time>
            </span>
          </span>
        </button>
      </StubTooltip>
    </li>
  );
}
