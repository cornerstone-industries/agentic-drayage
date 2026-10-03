"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/** Claude's reasoning types onto the pad once, the only animation allowed to run long. Key it to restart. */
export function Typewriter({ text, speedMs = 14 }: { text: string; speedMs?: number }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setN((x) => (x >= text.length ? x : x + 1)), speedMs);
    return () => clearInterval(id);
  }, [text, speedMs, reduce]);
  const shown = reduce ? text.length : n;
  return (
    <p className="text-[18px] leading-[1.6] text-fg">
      {text.slice(0, shown)}
      {shown < text.length && <span className="ml-0.5 inline-block h-[1.05em] w-[2px] translate-y-[3px] animate-blink bg-fg" />}
    </p>
  );
}
