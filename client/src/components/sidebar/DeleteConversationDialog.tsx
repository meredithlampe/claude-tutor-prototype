import { useRef, useState, type MouseEvent } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { content } from "@/constants/content";
import type { ConversationSummary } from "@/types";

type DeleteConversationDialogProps = {
  conversation: ConversationSummary;
  onConfirm: (conversation: ConversationSummary) => Promise<void>;
  // Cancel, Escape, or a finished delete. The parent stops rendering the dialog.
  onClose: () => void;
  // After the dialog has gone, with whether the conversation was deleted, so the parent can
  // place focus (the menu item that opened it is gone by then).
  onClosed: (deleted: boolean) => void;
};

// Rendered only while a delete is waiting on confirmation, so it opens fresh each time.
export function DeleteConversationDialog({ conversation, onConfirm, onClose, onClosed }: DeleteConversationDialogProps) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const deletedRef = useRef(false);

  // Stays open while deleting, so a failure can be shown in place.
  async function handleConfirm(event: MouseEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await onConfirm(conversation);
      deletedRef.current = true;
      onClose();
    } catch {
      setFailed(true);
      setBusy(false);
    }
  }

  return (
    <AlertDialog open onOpenChange={(isOpen) => !isOpen && !busy && onClose()}>
      <AlertDialogContent
        onCloseAutoFocus={(event) => {
          event.preventDefault();
          onClosed(deletedRef.current);
        }}
      >
        <AlertDialogHeader>
          <AlertDialogTitle>{content.sidebar.deleteChatTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {content.sidebar.deleteChatDescription(conversation.title)}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {failed && (
          <p role="alert" className="text-sm text-destructive">
            {content.sidebar.deleteChatFailed}
          </p>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy} className="pointer-coarse:min-h-11">
            {content.sidebar.deleteChatCancel}
          </AlertDialogCancel>
          <AlertDialogAction
            variant="destructive"
            aria-disabled={busy}
            className="focus-visible:ring-destructive/60 pointer-coarse:min-h-11"
            onClick={(event) => void handleConfirm(event)}
          >
            {busy ? content.sidebar.deletingChat : content.sidebar.deleteChatConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
