"use client";

import { motion } from "motion/react";
import { boxColor } from "./container-door";

export const STATIONS = ["At sea", "Discharged", "Quoted", "Booked", "Picked up", "Delivered"] as const;

export function stageIndex(status: string | null, eta: string | null): number {
  switch (status) {
    case "delivered":
      return 5;
    case "picked_up":
      return 4;
    case "booked":
    case "accepted":
      return 3;
    case "quoted":
      return 2;
    default:
      return eta && new Date(eta).getTime() <= Date.now() ? 1 : 0;
  }
}

/** A route map from ship to door: the box rides the line in its own steel color, one stop per real event. */
export function JourneyTrack({
  status,
  eta,
  compact = false,
  boxNumber = "",
}: {
  status: string | null;
  eta: string | null;
  compact?: boolean;
  boxNumber?: string;
}) {
  const idx = stageIndex(status, eta);
  const quoting = status === "quoting";
  const pct = (idx / (STATIONS.length - 1)) * 100;
  const color = boxColor(boxNumber);
  return (
    // Inset by half the box so the end stops and the box never spill past the column.
    <div className={`relative ${compact ? "h-7" : "h-[58px]"} mx-[16px]`} aria-label={`Journey: ${quoting ? "Getting quotes" : STATIONS[idx]}`}>
      <div className="absolute left-0 right-0 top-[14px] h-[3px] rounded-full bg-rule" />
      <motion.div
        className="absolute left-0 top-[14px] h-[3px] rounded-full bg-fg"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 110, damping: 20 }}
      />
      {STATIONS.map((s, i) => {
        const left = (i / (STATIONS.length - 1)) * 100;
        const passed = i <= idx;
        return (
          <div key={s} className="absolute top-[9px] -translate-x-1/2" style={{ left: `${left}%` }}>
            <div className={`mx-auto h-[13px] w-[13px] rounded-full border-[3px] ${passed ? "border-fg bg-fg" : "border-rule bg-sheet"}`} />
            {!compact && (
              <div
                className={`absolute mt-2 whitespace-nowrap text-[12.5px] ${i === idx ? "font-semibold text-fg" : passed ? "text-muted" : "text-dim"} ${
                  i === 0 ? "left-[-4px]" : i === STATIONS.length - 1 ? "right-[-4px]" : "left-1/2 -translate-x-1/2"
                } ${i !== idx && i !== 0 && i !== STATIONS.length - 1 ? "hidden sm:block" : ""}`}
              >
                {s}
              </div>
            )}
          </div>
        );
      })}
      <motion.div
        className="absolute top-[1px] -translate-x-1/2"
        initial={false}
        animate={{ left: `${quoting ? Math.min(pct + 10, 100) : pct}%` }}
        transition={{ type: "spring", stiffness: 130, damping: 18 }}
      >
        <svg width="34" height="17" viewBox="0 0 34 17" aria-hidden className={quoting ? "animate-pulse" : ""}>
          <rect x="0.5" y="0.5" width="33" height="16" rx="2.5" fill={color} stroke="rgba(0,0,0,0.35)" />
          {[6, 10.5, 15, 19.5, 24, 28.5].map((x) => (
            <line key={x} x1={x} y1="3" x2={x} y2="14" stroke="rgba(255,255,255,0.28)" strokeWidth="1.2" />
          ))}
        </svg>
      </motion.div>
    </div>
  );
}
