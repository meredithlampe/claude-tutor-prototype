import { Ghost } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "@/components/AppLayout";
import { IconButton } from "@/components/IconButton";
import { Composer } from "@/components/chat/Composer";
import { ComposerOptions } from "@/components/home/ComposerOptions";
import { Greeting } from "@/components/home/Greeting";
import { RecentArtifacts } from "@/components/home/RecentArtifacts";
import { content } from "@/constants/content";

export function HomePage() {
  const { user } = useOutletContext<AppOutletContext>();

  return (
    <>
      <div className="fixed top-0 right-2 z-10 flex h-12 items-center md:absolute md:top-2">
        <IconButton label={content.home.incognito} tooltipSide="left">
          <Ghost aria-hidden="true" />
        </IconButton>
      </div>
      <div className="mx-auto flex w-full max-w-[880px] flex-1 flex-col justify-center gap-8 px-4 py-12 sm:px-6">
        <Greeting name={user.status === "success" ? user.data.name : undefined} />
        <div className="flex flex-col gap-2">
          <Composer />
          <ComposerOptions />
        </div>
        <RecentArtifacts />
      </div>
    </>
  );
}
