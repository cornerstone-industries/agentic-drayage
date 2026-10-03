"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { buildScripts, speakingMs, type DispatcherScript } from "@/lib/replay/script";
import { computeQuoteTotals, formatUsd, type Accessorial } from "@/lib/money";
import { addDays, shortDate } from "@/lib/dates";
import { Waveform } from "@/components/callwall/waveform";
import { StatusPill } from "@/components/callwall/status-pill";

type Fields = Record<string, unknown>;

// The landing preview runs the recorded scripts faster than real time so a visitor sees the whole run.
const PREVIEW_SPEED = 2.4;

/** Precompute when each line of each script starts and ends, like the replay does. */
function plan(scripts: DispatcherScript[]) {
  return scripts.map((s, i) => {
    let t = 600 + i * 450 + s.ringSeconds * 1000;
    const lines = s.lines.map((l, j) => {
      t += j === 0 ? 0 : l.role === "user" ? 520 : 680;
      const start = t;
      t += speakingMs(l);
      return { ...l, start, end: t };
    });
    return { script: s, answerAt: 600 + i * 450 + s.ringSeconds * 1000, lines, endAt: t + 900 };
  });
}

/** Landing-page preview of the Call Wall. A labeled replay of the recorded scripts, never a live call. */
export function HeroPreview() {
  const reduce = useReducedMotion();
  const today = new Date().toISOString().slice(0, 10);
  const eta = addDays(today, 2);
  const container = useMemo(
    () => ({
      container_number: "PHGU4829137",
      size: "40HC",
      terminal: "Wando Welch Terminal",
      eta: `${eta}T11:00:00Z`,
      last_free_day: addDays(eta, 4),
      deliver_by: addDays(eta, 5),
      destination_address: "6100 Southpark Logistics Way, Fairburn, GA 30213",
    }),
    [eta],
  );
  const timeline = useMemo(() => plan(buildScripts(container)), [container]);
  const total = Math.max(...timeline.map((c) => c.endAt)) + 7000;
  const [tick, setT] = useState(0);
  // Reduced motion shows the finished run instead of playing it.
  const t = reduce ? total - 1 : tick;

  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      setT(((now - start) * PREVIEW_SPEED) % total);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduce, total]);

  const channels = timeline.map((c) => {
    const said = c.lines.filter((l) => l.end <= t);
    const speaking = c.lines.find((l) => l.start <= t && t < l.end);
    const fields: Fields = {};
    for (const l of said) if (l.fields) Object.assign(fields, l.fields);
    const totals = computeQuoteTotals(
      {
        linehaul_cents: (fields.linehaul_cents as number) ?? null,
        fuel_surcharge_cents: (fields.fuel_surcharge_cents as number) ?? null,
        chassis_per_day_cents: (fields.chassis_per_day_cents as number) ?? null,
        est_chassis_days: (fields.est_chassis_days as number) ?? null,
        accessorials: (fields.accessorials as Accessorial[]) ?? null,
        earliest_pickup: (fields.earliest_pickup as string) ?? null,
      },
      container.last_free_day,
      17500,
    );
    const status = t < 600 ? "queued" : t < c.answerAt ? "ringing" : t < c.endAt ? "in_progress" : "ended";
    return { ...c, said, speaking, fields, totals, status };
  });
  const allDone = channels.every((c) => c.status === "ended");
  const winner = allDone ? [...channels].sort((a, b) => (a.totals.risk_adjusted_cents ?? 0) - (b.totals.risk_adjusted_cents ?? 0))[0] : null;

  return (
    <div className="relative">
      <div className="mb-3 flex items-center justify-between font-mono text-[11px] text-muted">
        <span className="stencil text-xs text-fg">PHGU 482913-7</span>
        <span className="rounded-[3px] border border-sodium/40 px-2 py-0.5 text-sodium">Replay of a recorded quote run</span>
      </div>
      <div className="grid gap-2.5 sm:grid-cols-3">
        {channels.map((c, i) => {
          const isWinner = winner?.script.key === c.script.key;
          return (
            <motion.div
              key={c.script.key}
              layout
              className={`panel flex flex-col rounded-[4px] p-3 transition-shadow duration-500 ${isWinner ? "shadow-[0_0_0_1.5px_var(--sodium),0_0_36px_-6px_rgba(255,176,32,0.5)]" : ""}`}
            >
              <div className="flex items-center justify-between">
                <span className="font-mono text-[10px] text-dim">CH {i + 1}</span>
                <StatusPill status={c.status} />
              </div>
              <div className="mt-2 min-h-[2.5em] font-display text-[15px] font-extrabold leading-tight font-semiwide">{c.script.providerName}</div>
              <div className="mt-2">
                <Waveform speaking={(c.speaking?.role as "assistant" | "user") ?? null} live={c.status === "in_progress"} />
              </div>
              <div className="mt-2 h-[84px] overflow-hidden border-y border-line py-1.5">
                <AnimatePresence initial={false}>
                  {[...c.said, ...(c.speaking ? [{ ...c.speaking, text: c.speaking.text.slice(0, Math.max(1, Math.round(((t - c.speaking.start) / (c.speaking.end - c.speaking.start)) * c.speaking.text.length))), partial: true }] : [])].slice(-3).map((l) => (
                    <motion.p
                      key={`l-${l.start}`}
                      layout
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0 }}
                      className={`truncate text-[11.5px] leading-[1.6] ${l.role === "assistant" ? "text-muted" : "text-fg"} ${l.fields ? "border-l-2 border-sodium pl-1.5" : ""}`}
                    >
                      {l.text}
                    </motion.p>
                  ))}
                </AnimatePresence>
              </div>
              <dl className="mt-2 space-y-1 font-mono text-[11.5px]">
                {[
                  ["Linehaul", c.fields.linehaul_cents != null ? formatUsd(c.fields.linehaul_cents as number) : null],
                  ["Pickup", c.fields.earliest_pickup ? shortDate(c.fields.earliest_pickup as string) : null],
                  ["All-in", c.totals.all_in_cents != null && c.fields.earliest_pickup ? formatUsd(c.totals.all_in_cents) : null],
                ].map(([k, v]) => (
                  <div key={k as string} className="flex justify-between">
                    <dt className="text-muted">{k}</dt>
                    <dd>
                      <AnimatePresence mode="popLayout" initial={false}>
                        {v ? (
                          <motion.span
                            key={v as string}
                            className={`inline-block ${k === "Pickup" && (c.totals.projected_demurrage_cents ?? 0) > 0 ? "text-alarm" : "text-fg"}`}
                            initial={{ scale: 1.8, rotate: -8, opacity: 0 }}
                            animate={{ scale: 1, rotate: 0, opacity: 1 }}
                            transition={{ type: "spring", stiffness: 520, damping: 20 }}
                          >
                            {v}
                          </motion.span>
                        ) : (
                          <span className="text-dim">--</span>
                        )}
                      </AnimatePresence>
                    </dd>
                  </div>
                ))}
              </dl>
              {allDone && (c.totals.projected_demurrage_cents ?? 0) > 0 && (
                <p className="mt-2 font-mono text-[10.5px] text-alarm">Misses LFD: +{formatUsd(c.totals.projected_demurrage_cents)}</p>
              )}
              {isWinner && <p className="mt-2 font-mono text-[10.5px] text-sodium">Recommended</p>}
            </motion.div>
          );
        })}
      </div>
    </div>
  );
}
