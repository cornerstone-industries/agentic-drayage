"use client";

import { useEffect, useState } from "react";
import { formatUsd } from "@/lib/money";
import { shortDate } from "@/lib/dates";

const DAY = 86_400_000;

/** End of the last free day at the port (EDT). */
function lfdEndsAt(lfd: string) {
  return new Date(`${lfd}T23:59:59-04:00`).getTime();
}

function countdown(ms: number) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const d = Math.floor(s / 86400);
  const hh = String(Math.floor((s % 86400) / 3600)).padStart(2, "0");
  const mm = String(Math.floor((s % 3600) / 60)).padStart(2, "0");
  const ss = String(s % 60).padStart(2, "0");
  return `${d}d ${hh}:${mm}:${ss}`;
}

/**
 * Countdown to the last free day with a meter that fills toward red across the free-time window
 * (discharge to end of LFD). Past the LFD, estimated demurrage ticks up in real time.
 */
export function LfdMeter({
  eta,
  lastFreeDay,
  status,
  demurragePerDayCents,
  compact = false,
}: {
  eta: string | null;
  lastFreeDay: string | null;
  status: string | null;
  demurragePerDayCents: number;
  compact?: boolean;
}) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  if (!eta || !lastFreeDay) return <span className="tick-label">No LFD</span>;
  const outOfTerminal = status === "picked_up" || status === "delivered";
  const start = new Date(eta).getTime();
  const end = lfdEndsAt(lastFreeDay);
  const t = now ?? start;
  const window = Math.max(DAY, end - start);
  const fraction = outOfTerminal ? 1 : Math.min(1, Math.max(0, (t - start) / window));
  const overdue = !outOfTerminal && t > end;
  const atSea = t < start;
  const color = outOfTerminal ? "var(--signal)" : overdue || fraction > 0.85 ? "var(--alarm)" : fraction > 0.55 ? "var(--sodium)" : "var(--signal)";
  const freeDays = Math.max(1, Math.round(window / DAY));
  const accrued = overdue ? ((t - end) / DAY) * demurragePerDayCents : 0;

  return (
    <div className={compact ? "w-full" : "w-full max-w-sm"}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="tick-label">
          LFD <span className="text-fg">{shortDate(lastFreeDay)}</span>
        </span>
        <span className={`font-mono text-xs tabular-nums ${overdue ? "text-alarm" : outOfTerminal ? "text-signal" : "text-fg"}`}>
          {outOfTerminal ? "Out of terminal" : overdue ? "Past LFD" : now == null ? "--" : countdown(end - t)}
        </span>
      </div>
      <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-[1px] bg-line" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(fraction * 100)} aria-label="Free time used">
        <div className="absolute inset-y-0 left-0 transition-[width,background-color] duration-700" style={{ width: `${fraction * 100}%`, background: color, boxShadow: `0 0 10px ${color}` }} />
        {Array.from({ length: freeDays - 1 }, (_, i) => (
          <span key={i} className="absolute inset-y-0 w-px bg-ink" style={{ left: `${((i + 1) / freeDays) * 100}%` }} />
        ))}
      </div>
      {!compact && (
        <div className="mt-1.5 font-mono text-[11px] text-muted">
          {outOfTerminal ? (
            "No demurrage risk"
          ) : overdue ? (
            <span className="text-alarm">
              Accruing {formatUsd(demurragePerDayCents)}/day est. {formatUsd(Math.round(accrued))} so far
            </span>
          ) : atSea ? (
            <>Free time starts at discharge. {formatUsd(demurragePerDayCents)}/day est. after LFD</>
          ) : (
            <>{formatUsd(demurragePerDayCents)}/day at risk after LFD (estimated)</>
          )}
        </div>
      )}
    </div>
  );
}
