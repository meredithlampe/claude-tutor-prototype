import { Button } from "@/components/ui/button";
import { content } from "@/constants/content";
import { fetchArtifacts } from "@/lib/api";
import { useApiData } from "@/hooks/useApiData";
import { ArtifactCard } from "./ArtifactCard";

const CARD_COUNT = 3;

export function RecentArtifacts() {
  const artifacts = useApiData(fetchArtifacts);

  if (artifacts.status === "loading") return null;

  return (
    <section aria-labelledby="recent-artifacts-heading" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 id="recent-artifacts-heading" className="text-sm text-sidebar-foreground">
          {content.home.recentArtifacts}
        </h2>
        <Button
          type="button"
          variant="link"
          size="sm"
          className="px-0 text-muted-foreground hover:text-foreground pointer-coarse:h-11"
        >
          {content.home.viewAll}
        </Button>
      </div>
      {artifacts.status === "error" ? (
        <p role="alert" className="text-sm text-muted-foreground">
          {content.home.artifactsLoadFailed}
        </p>
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {artifacts.data.slice(0, CARD_COUNT).map((artifact) => (
            <ArtifactCard key={artifact.id} artifact={artifact} />
          ))}
        </ul>
      )}
    </section>
  );
}
