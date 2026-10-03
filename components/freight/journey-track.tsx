"use client";

import { motion } from "motion/react";

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

/** A little ISO box riding the track from ship to door, one station per real event. */
export function JourneyTrack({ status, eta, compact = false }: { status: string | null; eta: string | null; compact?: boolean }) {
  const idx = stageIndex(status, eta);
  const quoting = status === "quoting";
  const pct = (idx / (STATIONS.length - 1)) * 100;
  return (
    <div className={`relative ${compact ? "h-7" : "h-16"} w-full`} aria-label={`Journey: ${quoting ? "Getting quotes" : STATIONS[idx]}`}>
      <div className={`absolute left-0 right-0 ${compact ? "top-[13px]" : "top-[13px]"} h-px bg-line`} />
      <motion.div
        className="absolute left-0 top-[13px] h-px bg-sodium shadow-[0_0_8px_var(--sodium)]"
        initial={false}
        animate={{ width: `${pct}%` }}
        transition={{ type: "spring", stiffness: 120, damping: 20 }}
      />
      {STATIONS.map((s, i) => {
        const left = (i / (STATIONS.length - 1)) * 100;
        const lit = i <= idx;
        return (
          <div key={s} className="absolute top-[9px] -translate-x-1/2" style={{ left: `${left}%` }}>
            <div className={`mx-auto h-[9px] w-[9px] rotate-45 border ${lit ? "border-sodium bg-sodium" : "border-dim bg-ink"}`} />
            {!compact && (
              <div className={`mt-2.5 whitespace-nowrap text-center font-mono text-[10.5px] ${i === idx ? "text-fg" : lit ? "text-muted" : "text-dim"}`}>{s}</div>
            )}
          </div>
        );
      })}
      <motion.div
        className="absolute top-0 -translate-x-1/2"
        initial={false}
        animate={{ left: `${quoting ? Math.min(pct + 10, 100) : pct}%` }}
        transition={{ type: "spring", stiffness: 140, damping: 18 }}
      >
        <svg width="30" height="14" viewBox="0 0 30 14" aria-hidden className={quoting ? "animate-pulse" : ""}>
          <rect x="0.5" y="0.5" width="29" height="13" rx="1" fill="var(--sodium)" />
          {[5, 9, 13, 17, 21, 25].map((x) => (
            <line key={x} x1={x} y1="2.5" x2={x} y2="11.5" stroke="rgba(10,14,19,0.55)" strokeWidth="1" />
          ))}
        </svg>
      </motion.div>
    </div>
  );
}
