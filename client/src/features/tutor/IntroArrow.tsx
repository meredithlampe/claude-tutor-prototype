import { cn } from "@/lib/utils";

type IntroArrowProps = {
  direction: "left" | "right";
  className?: string;
};

// A hand-drawn arrow for the intro dialog, pointing at the chat (left) or the workbook (right).
// Decorative: the section titles carry the meaning.
export function IntroArrow({ direction, className }: IntroArrowProps) {
  return (
    <svg
      viewBox="0 0 44 18"
      aria-hidden="true"
      focusable="false"
      className={cn("h-[18px] w-11 shrink-0 text-brand", direction === "right" && "-scale-x-100", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M42 10.5 C33 7.5, 22 11.5, 4 8.6" />
      <path d="M10.5 2.8 L3.6 8.7 L11 14.6" />
    </svg>
  );
}
