"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { buildScripts, speakingMs, type DispatcherScript } from "@/lib/replay/script";
import { computeQuoteTotals, formatUsd, type Accessorial } from "@/lib/money";
import { addDays, shortDate } from "@/lib/dates";
import { VoiceTrace } from "@/components/callwall/voice-trace";
import { Odometer } from "@/components/freight/odometer";
import { RubberStamp } from "@/components/freight/rubber-stamp";
import { ContainerDoor } from "@/components/freight/container-door";
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
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <ContainerDoor number="PHGU4829137" size="40HC" compact />
          <div>
            <div className="stencil text-[20px] leading-none text-fg">PHGU 482913-7</div>
            <div className="mt-1 text-[12.5px] text-muted">Wando Welch to Fairburn, GA</div>
          </div>
        </div>
        <span className="text-[13px] font-semibold text-crane">Replay of a recorded quote run</span>
      </div>
      <div className="relative pt-2">
        <div className="absolute left-[-10px] right-[-10px] top-2 z-10 h-[9px] rounded-full bg-[linear-gradient(180deg,#D9DDE1,#8E959D_55%,#6A7179)] shadow-[0_3px_6px_-2px_rgba(0,0,0,0.35)]" aria-hidden />
        <div className="grid gap-4 sm:grid-cols-3">
          {channels.map((c, i) => {
            const isWinner = winner?.script.key === c.script.key;
            return (
              <motion.div key={c.script.key} layout transition={{ type: "spring", stiffness: 200, damping: 24 }} className="relative pt-4">
                <svg className="absolute left-1/2 top-[-4px] z-20 -translate-x-1/2" width="44" height="24" viewBox="0 0 54 30" aria-hidden>
                  <rect x="9" y="1" width="36" height="20" rx="4" fill="#2A2F35" />
                  <rect x="12" y="4" width="30" height="6" rx="2" fill="#4A5159" />
                  <path d="M17 21 v7 M37 21 v7" stroke="#2A2F35" strokeWidth="3" strokeLinecap="round" />
                </svg>
                <div
                  className={`relative origin-top overflow-hidden rounded-[16px] border bg-sheet text-left transition-[box-shadow,transform,border-color] duration-500 ${
                    c.status === "ringing" ? "animate-ring" : ""
                  } ${isWinner ? "-translate-y-1 border-fg shadow-[0_2px_0_#121417,0_24px_50px_-26px_rgba(18,20,23,0.55)]" : "border-rule shadow-[0_14px_36px_-26px_rgba(18,20,23,0.45)]"}`}
                >
                  <div className="h-1.5" style={{ background: ["#121417", "#F2C230", "#EE86A4"][i] }} />
                  <div className="px-4 pt-3">
                    <StatusPill status={c.status} />
                    <div className="mt-2 font-cond text-[19px] font-bold leading-tight text-fg">{c.script.providerName}</div>
                  </div>
                  <div className="mx-4 mt-2 rounded-[8px] border border-rule bg-[linear-gradient(rgba(36,83,214,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(36,83,214,0.07)_1px,transparent_1px)] bg-[size:10px_10px]">
                    <VoiceTrace speaking={(c.speaking?.role as "assistant" | "user") ?? null} live={c.status === "in_progress"} />
                  </div>
                  <div className="mt-3 h-[88px] overflow-hidden border-y border-rule bg-panel-2 px-4 py-2">
                    <AnimatePresence initial={false}>
                      {[...c.said, ...(c.speaking ? [{ ...c.speaking, text: c.speaking.text.slice(0, Math.max(1, Math.round(((t - c.speaking.start) / (c.speaking.end - c.speaking.start)) * c.speaking.text.length))), partial: true }] : [])]
                        .slice(-3)
                        .map((l) => (
                          <motion.p
                            key={`l-${l.start}`}
                            layout
                            initial={{ opacity: 0, y: 8 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            className={`truncate text-[12.5px] leading-[1.6] ${l.role === "assistant" ? "text-muted" : "text-fg"}`}
                          >
                            <span className={`mr-1.5 text-[10.5px] font-semibold ${l.role === "assistant" ? "text-stamp" : "text-live"}`}>{l.role === "assistant" ? "PortCall" : "Dispatch"}</span>
                            <span className="marker" data-on={Boolean(l.fields) && !("partial" in l)}>
                              {l.text}
                            </span>
                          </motion.p>
                        ))}
                    </AnimatePresence>
                  </div>
                  <dl className="space-y-1.5 px-4 py-3 text-[13px]">
                    {[
                      ["Linehaul", c.fields.linehaul_cents != null ? formatUsd(c.fields.linehaul_cents as number) : null],
                      ["Pickup", c.fields.earliest_pickup ? shortDate(c.fields.earliest_pickup as string) : null],
                    ].map(([k, v]) => (
                      <div key={k as string} className="flex items-baseline gap-2">
                        <dt className="text-muted">{k}</dt>
                        <span className="mb-[3px] flex-1 border-b border-dotted border-dim/70" />
                        <dd>
                          <AnimatePresence mode="popLayout" initial={false}>
                            {v ? (
                              <motion.span
                                key={v as string}
                                className={`inline-block font-mono font-semibold ${k === "Pickup" && (c.totals.projected_demurrage_cents ?? 0) > 0 ? "text-red" : "text-stamp"}`}
                                initial={{ scale: 1.9, rotate: -10, opacity: 0 }}
                                animate={{ scale: 1, rotate: 0, opacity: 1 }}
                                transition={{ type: "spring", stiffness: 600, damping: 22 }}
                              >
                                {v}
                              </motion.span>
                            ) : (
                              <span className="text-dim">–</span>
                            )}
                          </AnimatePresence>
                        </dd>
                      </div>
                    ))}
                  </dl>
                  <div className="flex items-end justify-between border-t border-rule px-4 pb-3.5 pt-2.5">
                    <span className="pb-0.5 text-[13px] font-semibold text-fg">All-in</span>
                    {c.totals.all_in_cents != null && c.fields.earliest_pickup ? (
                      <Odometer value={formatUsd(c.totals.all_in_cents)} className="text-[22px] text-fg" />
                    ) : (
                      <span className="font-mono text-[22px] text-dim">$ –</span>
                    )}
                  </div>
                  {allDone && (c.totals.projected_demurrage_cents ?? 0) > 0 && (
                    <div className="px-4 pb-3">
                      <RubberStamp size="sm" rotate={-2}>
                        Misses LFD +{formatUsd(c.totals.projected_demurrage_cents)}
                      </RubberStamp>
                    </div>
                  )}
                  {isWinner && (
                    <div className="absolute right-3 top-[64px]">
                      <RubberStamp size="md" rotate={-11}>
                        Awarded
                      </RubberStamp>
                    </div>
                  )}
                </div>
              </motion.div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
