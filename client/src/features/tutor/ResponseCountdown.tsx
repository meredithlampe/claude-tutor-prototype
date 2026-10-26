import { useEffect, useState } from "react";
import { tutorContent } from "./content";

type ResponseCountdownProps = {
  startedAt: number;
  ms: number;
};

const TICK_MS = 100;
const RADIUS = 8;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// The countdown to sending what the learner said: a ring that empties and "Tutor will respond
// in N". Not a live region; VoiceControls announces it once when it starts. With reduced
// motion, the ring steps once a second instead of sweeping.
export function ResponseCountdown({ startedAt, ms }: ResponseCountdownProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const remaining = Math.max(0, startedAt + ms - now);
  const seconds = Math.ceil(remaining / 1000);
  const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const left = reducedMotion ? (seconds * 1000) / ms : remaining / ms;

  return (
    // A row of its own under the status and buttons, so it never wraps mid-phrase.
    <p className="flex basis-full items-center gap-2 text-sm text-secondary-foreground">
      <svg viewBox="0 0 20 20" className="size-5 shrink-0 -rotate-90" aria-hidden="true">
        <circle cx="10" cy="10" r={RADIUS} fill="none" strokeWidth="2.5" className="stroke-muted-foreground/40" />
        <circle
          cx="10"
          cy="10"
          r={RADIUS}
          fill="none"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={CIRCUMFERENCE}
          strokeDashoffset={CIRCUMFERENCE * (1 - left)}
          className="stroke-brand"
        />
      </svg>
      <span className="tabular-nums">{tutorContent.voice.countdown(seconds)}</span>
    </p>
  );
}
