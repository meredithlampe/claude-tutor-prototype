import { useOutletContext, useParams } from "react-router-dom";
import type { AppOutletContext } from "@/components/AppLayout";
import { content } from "@/constants/content";

// Placeholder until build step 4 adds the message list and composer.
export function ChatPage() {
  const { id } = useParams();
  const { conversations } = useOutletContext<AppOutletContext>();
  if (conversations.status === "loading") return null;

  const conversation =
    conversations.status === "success"
      ? conversations.data.find((summary) => summary.id === id)
      : undefined;

  return (
    <div className="mx-auto flex w-full max-w-[70ch] flex-1 flex-col gap-2 px-4 py-12">
      <h1 className="font-serif text-2xl text-foreground">
        {conversation?.title ?? content.chat.notFound}
      </h1>
      <p className="text-sm text-muted-foreground">{content.chat.placeholderNotice}</p>
    </div>
  );
}
