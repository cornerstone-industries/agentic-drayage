"use client";

import { motion } from "motion/react";

const DIGITS = "0123456789".split("");

/** A mechanical counter: each digit wheel rolls to its new value when the number changes. */
export function Odometer({ value, className = "" }: { value: string; className?: string }) {
  const chars = [...value];
  return (
    <span className={`inline-flex items-baseline font-mono font-semibold tabular-nums leading-none ${className}`} aria-label={value} role="text">
      {chars.map((ch, i) => {
        const fromRight = chars.length - i;
        if (!/\d/.test(ch)) {
          return (
            <span key={`s${fromRight}`} aria-hidden className="inline-block">
              {ch}
            </span>
          );
        }
        return (
          <span key={`d${fromRight}`} aria-hidden className="relative inline-block h-[1em] w-[0.6em] overflow-hidden">
            <motion.span
              className="absolute left-0 top-0 flex flex-col"
              initial={{ y: "0em" }}
              animate={{ y: `-${Number(ch)}em` }}
              transition={{ type: "spring", stiffness: 90, damping: 16, delay: fromRight * 0.05 }}
            >
              {DIGITS.map((d) => (
                <span key={d} className="block h-[1em] leading-none">
                  {d}
                </span>
              ))}
            </motion.span>
          </span>
        );
      })}
    </span>
  );
}
