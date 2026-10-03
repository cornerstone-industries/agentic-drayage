"use client";

import { AnimatePresence, motion } from "motion/react";

/** Solari departure-board digits: each character flips when its value changes. */
export function SplitFlap({
  value,
  className = "",
  cellClassName = "",
  tone = "text-fg",
}: {
  value: string;
  className?: string;
  cellClassName?: string;
  tone?: string;
}) {
  const chars = [...value];
  return (
    <span className={`inline-flex gap-[2px] font-mono font-semibold tabular-nums ${tone} ${className}`} aria-label={value} role="text">
      {chars.map((ch, i) => (
        <span key={`${chars.length - i}`} className={`flap px-[0.06em] ${cellClassName}`} aria-hidden>
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={ch + i}
              initial={{ rotateX: -95, opacity: 0.2 }}
              animate={{ rotateX: 0, opacity: 1 }}
              exit={{ rotateX: 95, opacity: 0 }}
              transition={{ duration: 0.26, delay: (chars.length - i) * 0.035, ease: [0.3, 0.7, 0.4, 1] }}
              style={{ display: "inline-block", transformOrigin: "50% 50%" }}
            >
              {ch === " " ? " " : ch}
            </motion.span>
          </AnimatePresence>
        </span>
      ))}
    </span>
  );
}
