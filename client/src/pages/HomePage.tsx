import { useState } from "react";
import { Ghost } from "lucide-react";
import { useOutletContext } from "react-router-dom";
import type { AppOutletContext } from "@/components/AppLayout";
import { IconButton } from "@/components/IconButton";
import { Composer } from "@/components/chat/Composer";
import { ComposerOptions } from "@/components/home/ComposerOptions";
import { Greeting } from "@/components/home/Greeting";
import { content } from "@/constants/content";
import { useStartChat } from "@/hooks/useStartChat";

export function HomePage() {
  const { user, refreshConversations } = useOutletContext<AppOutletContext>();
  const startChat = useStartChat(refreshConversations);
  const [isCreating, setIsCreating] = useState(false);
  const [createFailed, setCreateFailed] = useState(false);

  async function handleSubmit(text: string) {
    setIsCreating(true);
    setCreateFailed(false);
    try {
      await startChat(text);
      return true;
    } catch {
      setCreateFailed(true);
      setIsCreating(false);
      return false;
    }
  }

  return (
    <>
      <div className="fixed top-0 right-2 z-10 flex h-12 items-center md:absolute md:top-2">
        <IconButton label={content.home.incognito} tooltipSide="left" stub>
          <Ghost aria-hidden="true" />
        </IconButton>
      </div>
      <div className="mx-auto flex w-full max-w-[880px] flex-1 flex-col justify-center gap-8 px-4 py-12 sm:px-6">
        <Greeting name={user.status === "success" ? user.data.name : undefined} />
        <div className="flex flex-col gap-2">
          <Composer onSubmit={handleSubmit} isBusy={isCreating} />
          {createFailed && (
            <p role="alert" className="px-2 text-sm text-destructive">
              {content.home.createFailed}
            </p>
          )}
          <ComposerOptions />
        </div>
      </div>
    </>
  );
}
