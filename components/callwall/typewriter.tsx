"use client";

import { useEffect, useState } from "react";
import { useReducedMotion } from "motion/react";

/** Claude's reasoning types out once, the only animation allowed to run long. Key it by the text's source to restart. */
export function Typewriter({ text, speedMs = 16 }: { text: string; speedMs?: number }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = setInterval(() => setN((x) => (x >= text.length ? x : x + 1)), speedMs);
    return () => clearInterval(id);
  }, [text, speedMs, reduce]);
  const shown = reduce ? text.length : n;
  return (
    <p className="text-[17px] leading-relaxed text-fg">
      {text.slice(0, shown)}
      {shown < text.length && <span className="ml-0.5 inline-block h-[1.05em] w-[0.5ch] translate-y-[2px] animate-blink bg-sodium" />}
    </p>
  );
}
