import { cn } from "@/lib/utils";

type LogoMarkProps = {
  className?: string;
};

const RAY_COUNT = 12;

// Decorative asterisk-burst mark; hidden from assistive tech.
export function LogoMark({ className }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={cn("text-brand", className)}
    >
      <g stroke="currentColor" strokeWidth="2.4" strokeLinecap="round">
        {Array.from({ length: RAY_COUNT }, (_, index) => (
          <line
            key={index}
            x1="16"
            y1="16"
            x2="16"
            y2={index % 2 === 0 ? 2 : 4.5}
            transform={`rotate(${(360 / RAY_COUNT) * index} 16 16)`}
          />
        ))}
      </g>
    </svg>
  );
}
