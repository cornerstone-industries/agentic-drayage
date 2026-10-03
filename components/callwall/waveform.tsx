"use client";

const BARS = 32;
// Fixed pseudo-random heights and phases so each card has its own voice print.
const SHAPE = Array.from({ length: BARS }, (_, i) => 0.35 + 0.65 * Math.abs(Math.sin(i * 1.7) * Math.cos(i * 0.6)));

/** Animates only while that side is actually speaking (speech-update over Realtime). */
export function Waveform({ speaking, live }: { speaking: "assistant" | "user" | null; live: boolean }) {
  const color = speaking === "assistant" ? "var(--sodium)" : speaking === "user" ? "var(--signal)" : "var(--dim)";
  return (
    <div className="flex h-9 min-w-0 flex-1 items-center gap-[3px] overflow-hidden" aria-hidden>
      {SHAPE.map((h, i) => (
        <span
          key={i}
          className={speaking ? "bar w-[3px] shrink-0 rounded-full" : "w-[3px] shrink-0 rounded-full transition-transform duration-300"}
          style={{
            height: `${Math.round(h * 100)}%`,
            background: color,
            opacity: live ? 1 : 0.45,
            transform: speaking ? undefined : `scaleY(${live ? 0.12 : 0.06})`,
            animationDelay: `${(i % 7) * 0.09 + (i % 3) * 0.05}s`,
            animationDuration: `${0.7 + (i % 5) * 0.11}s`,
            boxShadow: speaking ? `0 0 6px ${color}` : undefined,
          }}
        />
      ))}
    </div>
  );
}
