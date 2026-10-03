"use client";

import { motion } from "motion/react";

const COLORS = { red: "rgb(216 58 46)", blue: "rgb(36 83 214)", green: "rgb(11 135 91)" } as const;

/**
 * An inked rubber stamp: it lands hard (scale + spin settle), the ink sits slightly worn and
 * multiplies into the paper underneath.
 */
export function RubberStamp({
  children,
  color = "red",
  size = "md",
  rotate = -8,
  className = "",
  testId,
}: {
  children: React.ReactNode;
  color?: keyof typeof COLORS;
  size?: "sm" | "md" | "lg";
  rotate?: number;
  className?: string;
  testId?: string;
}) {
  const c = COLORS[color];
  const sizing =
    size === "lg" ? "px-5 py-2 text-[34px] border-[4px]" : size === "md" ? "px-3.5 py-1.5 text-[22px] border-[3px]" : "px-2 py-0.5 text-[13px] border-2";
  return (
    <motion.div
      initial={{ scale: 2.4, opacity: 0, rotate: rotate - 14 }}
      animate={{ scale: 1, opacity: 0.9, rotate }}
      transition={{ type: "spring", stiffness: 560, damping: 24, mass: 0.8 }}
      className={`pointer-events-none inline-block select-none whitespace-nowrap rounded-[6px] font-stencil font-extrabold uppercase leading-none tracking-[0.08em] ${sizing} ${className}`}
      style={{ color: c, borderColor: c, outline: `${size === "sm" ? 1 : 2}px solid ${c}`, outlineOffset: size === "sm" ? 2 : 3, mixBlendMode: "multiply", background: "rgba(255,255,255,0.55)" }}
      data-testid={testId}
    >
      {children}
    </motion.div>
  );
}
