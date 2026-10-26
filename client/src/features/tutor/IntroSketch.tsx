import { cn } from "@/lib/utils";

// A hand-drawn-style sketch of one half of the Tutor screen, for the intro dialog: the chat
// (message bubbles as grey bars) or the workbook (a multiple-choice question with a small
// visual). Decorative: the dialog's text says the same thing.

type IntroSketchProps = {
  part: "chat" | "workbook";
  className?: string;
};

// A fixed wobble for each seed, so the sketch looks the same on every render.
function jitter(seed: number, amount: number): number {
  const x = Math.sin(seed * 12.9898) * 43758.5453;
  return (x - Math.floor(x) - 0.5) * 2 * amount;
}

const round = (n: number) => Math.round(n * 10) / 10;

// A box drawn in one wobbly stroke that overshoots where it starts, like a pen sketch.
function sketchRect(x: number, y: number, w: number, h: number, seed: number, amount = 2): string {
  const corners = [
    [x, y],
    [x + w, y],
    [x + w, y + h],
    [x, y + h],
  ].map(([cx, cy], i) => [cx + jitter(seed + i, amount), cy + jitter(seed + i + 10, amount)]);
  let d = `M${round(corners[0][0] - 2)},${round(corners[0][1] + jitter(seed + 20, amount))}`;
  for (let i = 0; i < 4; i++) {
    const [ax, ay] = corners[i];
    const [bx, by] = corners[(i + 1) % 4];
    const mx = (ax + bx) / 2 + jitter(seed + i + 30, amount * 1.5);
    const my = (ay + by) / 2 + jitter(seed + i + 40, amount * 1.5);
    d += ` Q${round(mx)},${round(my)} ${round(bx)},${round(by)}`;
  }
  return `${d} L${round(corners[0][0] + 4)},${round(corners[0][1] + jitter(seed + 50, amount))}`;
}

// A skeleton text line: a thick, slightly wavy stroke with round ends.
function sketchBar(x1: number, x2: number, y: number, seed: number): string {
  const mid = (x1 + x2) / 2;
  return `M${x1},${round(y + jitter(seed, 0.6))} Q${round(mid)},${round(y + jitter(seed + 1, 2.2))} ${x2},${round(y + jitter(seed + 2, 0.6))}`;
}

// A circle drawn as two slightly mismatched arcs.
function sketchCircle(cx: number, cy: number, r: number, seed: number): string {
  const r2 = r + jitter(seed, 0.6);
  return `M${cx - r},${cy} A${r},${r2} 0 1 1 ${round(cx + r)},${round(cy + jitter(seed + 1, 0.5))} A${r2},${r} 0 1 1 ${round(cx - r + 1)},${round(cy - 1)}`;
}

// A box gone over twice, the second pass fainter and a little off, like a quick pen sketch.
function SketchBox({ x, y, w, h, seed }: { x: number; y: number; w: number; h: number; seed: number }) {
  return (
    <>
      <path d={sketchRect(x, y, w, h, seed)} />
      <path d={sketchRect(x, y, w, h, seed + 100, 2.6)} strokeWidth={1} opacity={0.55} />
    </>
  );
}

function Bars({ bars }: { bars: [number, number, number][] }) {
  return (
    <g className="text-muted-foreground" stroke="currentColor" strokeWidth={6} strokeLinecap="round" fill="none">
      {bars.map(([x1, x2, y], i) => (
        <path key={`${x1}-${y}`} d={sketchBar(x1, x2, y, x1 + y + i)} />
      ))}
    </g>
  );
}

function ChatSketch() {
  return (
    <>
      <SketchBox x={4} y={4} w={152} h={142} seed={1} />
      {/* The tutor's message, the learner's reply on the right, then the tutor again. */}
      <path className="text-brand" d={sketchCircle(17, 22, 5, 2)} />
      <Bars bars={[[30, 118, 22], [30, 134, 33], [30, 94, 44]]} />
      <SketchBox x={70} y={56} w={78} h={28} seed={3} />
      <Bars bars={[[80, 138, 65], [80, 116, 75]]} />
      <path className="text-brand" d={sketchCircle(17, 98, 5, 4)} />
      <Bars bars={[[30, 126, 98], [30, 100, 109]]} />
      {/* The composer. */}
      <SketchBox x={12} y={120} w={136} h={19} seed={5} />
      <path className="text-muted-foreground" strokeWidth={3} strokeLinecap="round" d={sketchBar(22, 70, 129.5, 6)} />
      <path className="text-brand" d={sketchCircle(137, 129.5, 4.5, 7)} />
    </>
  );
}

function WorkbookSketch() {
  return (
    <>
      <SketchBox x={4} y={4} w={232} h={142} seed={11} />
      <Bars bars={[[16, 62, 18]]} />
      {/* The question's small visual: a bar chart. */}
      <SketchBox x={16} y={30} w={70} h={54} seed={12} />
      <g stroke="currentColor" strokeWidth={7} strokeLinecap="butt">
        <path d="M32,77 L32.5,50" />
        <path className="text-brand" d="M50,77 L50.4,40" />
        <path d="M68,77 L67.6,60" />
      </g>
      <path d="M22,78 Q50,79.5 80,77.5" />
      {/* The prompt. */}
      <Bars bars={[[98, 222, 38], [98, 204, 50], [98, 160, 62]]} />
      {/* Three options, the second one chosen, and Submit. */}
      <path d={sketchCircle(22, 98, 4.5, 14)} />
      <path className="text-brand" d={sketchCircle(22, 114, 4.5, 15)} />
      <circle className="text-brand" cx={22} cy={114} r={2} fill="currentColor" stroke="none" />
      <path d={sketchCircle(22, 130, 4.5, 16)} />
      <Bars bars={[[34, 132, 98], [34, 112, 114], [34, 148, 130]]} />
      <SketchBox x={178} y={121} w={46} h={18} seed={17} />
      <path className="text-muted-foreground" strokeWidth={4} strokeLinecap="round" d={sketchBar(190, 212, 130, 18)} />
    </>
  );
}

export function IntroSketch({ part, className }: IntroSketchProps) {
  return (
    <svg
      viewBox={part === "chat" ? "0 0 160 150" : "0 0 240 150"}
      aria-hidden="true"
      focusable="false"
      className={cn("h-auto w-full text-secondary-foreground", className)}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {part === "chat" ? <ChatSketch /> : <WorkbookSketch />}
    </svg>
  );
}
