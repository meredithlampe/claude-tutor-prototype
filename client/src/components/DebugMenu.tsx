import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Bug } from "lucide-react";
import { IconButton } from "@/components/IconButton";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { content } from "@/constants/content";
import type { DebugAction, DebugContext } from "@/features/types";

type DebugMenuProps = {
  actions: DebugAction[];
  debug: DebugContext;
};

// How long a confirmation stays on screen.
const NOTICE_MS = 3000;
// How far (px) the pointer moves before a press on the button counts as a drag, not a click.
const DRAG_THRESHOLD = 5;

type Drag = { pointerX: number; pointerY: number; startX: number; startY: number; rect: DOMRect; wasOpen: boolean; moved: boolean };

// Prototype operations for test administrators, in the lower-right corner of every page.
// Raised above the composer, so it clears the send button. Where something else sits under it
// (e.g. scoping choices that wrap on a phone), it can be dragged out of the way.
export function DebugMenu({ actions, debug }: DebugMenuProps) {
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const dragRef = useRef<Drag | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!notice || busy) return;
    const timer = window.setTimeout(() => setNotice(""), NOTICE_MS);
    return () => window.clearTimeout(timer);
  }, [notice, busy]);

  async function run(action: DebugAction) {
    setBusy(true);
    setNotice(content.debug.working);
    try {
      setNotice((await action.run(debug)) ?? "");
    } catch {
      setNotice(content.debug.failed);
    } finally {
      setBusy(false);
    }
  }

  // Replaces the trigger's open-on-press with open-on-release, so a press can become a drag.
  // Keyboard opening (Enter, Space, ArrowDown) is unchanged.
  function handlePointerDown(event: PointerEvent<HTMLButtonElement>) {
    if (event.button !== 0 || !wrapperRef.current) return;
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerX: event.clientX,
      pointerY: event.clientY,
      startX: offset.x,
      startY: offset.y,
      rect: wrapperRef.current.getBoundingClientRect(),
      wasOpen: open,
      moved: false,
    };
  }

  function handlePointerMove(event: PointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag) return;
    const dx = event.clientX - drag.pointerX;
    const dy = event.clientY - drag.pointerY;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    drag.moved = true;
    // Kept fully on screen.
    const clampedX = Math.min(Math.max(dx, -drag.rect.left), window.innerWidth - drag.rect.right);
    const clampedY = Math.min(Math.max(dy, -drag.rect.top), window.innerHeight - drag.rect.bottom);
    setOffset({ x: drag.startX + clampedX, y: drag.startY + clampedY });
  }

  function handlePointerUp() {
    const drag = dragRef.current;
    dragRef.current = null;
    if (drag && !drag.moved) setOpen(!drag.wasOpen);
  }

  if (actions.length === 0) return null;

  return (
    <div
      ref={wrapperRef}
      // The dragged position is per pointer move, so it can't be a class.
      style={{ transform: `translate(${offset.x}px, ${offset.y}px)` }}
      className="fixed right-2 bottom-40 z-40 flex flex-col items-end gap-2 md:right-3"
    >
      {/* Always mounted, so screen readers announce the confirmation when it's filled in. */}
      <div role="status">
        {notice && (
          <p className="max-w-56 rounded-md bg-popover px-2 py-1 text-sm text-popover-foreground shadow-md ring-1 ring-foreground/10">
            {notice}
          </p>
        )}
      </div>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger
          asChild
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={() => (dragRef.current = null)}
        >
          <IconButton
            label={content.debug.open}
            tooltipSide="left"
            variant="outline"
            className="touch-none rounded-full bg-popover shadow-md"
          >
            <Bug aria-hidden="true" />
          </IconButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align="end" className="w-auto max-w-[calc(100vw-1rem)]">
          <DropdownMenuLabel>{content.debug.heading}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {actions.map((action) => (
            <DropdownMenuItem
              key={action.id}
              disabled={busy}
              onSelect={() => void run(action)}
              className="pointer-coarse:min-h-11"
            >
              {action.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
