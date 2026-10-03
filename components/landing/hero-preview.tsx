"use client";

import { AnimatePresence, LayoutGroup, motion, useReducedMotion } from "motion/react";
import { useEffect, useMemo, useState } from "react";
import { buildScripts, speakingMs, type DispatcherScript } from "@/lib/replay/script";
import { computeQuoteTotals, formatUsd, type Accessorial } from "@/lib/money";
import { addDays } from "@/lib/dates";
import { RubberStamp } from "@/components/freight/rubber-stamp";

type Fields = Record<string, unknown>;
type Phase = "ask" | "call" | "rank" | "book";

// The recorded calls play faster than real time so a visitor sees the whole run in about half a minute.
const CALL_SPEED = 4;
const ASK_MS = 3400;
const RANK_MS = 3000;
const BOOK_MS = 6000;
const REQUEST = "PHGU 482913-7 lands Monday. Get it to our Atlanta DC by Friday, cheapest reliable option. Book it if it's under our limit.";

const STEPS: { key: Phase; label: string; say: string }[] = [
  { key: "ask", label: "Ask", say: "Your agent asks PortCall for drayage quotes." },
  { key: "call", label: "Call", say: "PortCall phones all your carriers at once and writes down every price." },
  { key: "rank", label: "Rank", say: "Quotes are ranked by real cost: the price plus port late fees." },
  { key: "book", label: "Book", say: "PortCall books the lowest real cost and holds the card." },
];
const NOTES: Record<string, string> = {
  marshgrass: "Picks up on time",
  sweetgrass: "Picks up on time, adds a $75 pre-pull fee",
  ironclad: "Picks up after the last free day",
};
const LATE_FILL = "repeating-linear-gradient(135deg, rgb(var(--red-rgb)) 0 4px, rgb(var(--red-rgb) / 0.55) 4px 8px)";

/** Precompute when each line of each script starts and ends, like the replay does. */
function plan(scripts: DispatcherScript[]) {
  return scripts.map((s, i) => {
    const answerAt = 600 + i * 450 + s.ringSeconds * 1000;
    let t = answerAt;
    const lines = s.lines.map((l, j) => {
      t += j === 0 ? 0 : l.role === "user" ? 520 : 680;
      const start = t;
      t += speakingMs(l);
      return { ...l, start, end: t };
    });
    return { script: s, answerAt, lines, endAt: t + 900 };
  });
}

/** Four bars that move only while someone on that call is talking: blue for PortCall, green for the dispatcher. */
function Talking({ who }: { who: "assistant" | "user" | null }) {
  return (
    <span className="flex h-4 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2, 3].map((i) => (
        <motion.span
          key={i}
          className={`w-[3px] rounded-full ${who === "assistant" ? "bg-stamp" : who === "user" ? "bg-live" : "bg-dim"}`}
          animate={{ height: who ? ["30%", "100%", "45%", "85%", "30%"] : "25%" }}
          transition={who ? { duration: 0.9, repeat: Infinity, delay: i * 0.12, ease: "easeInOut" } : { duration: 0.2 }}
        />
      ))}
    </span>
  );
}

/** Landing-page explainer: a labeled, sped-up replay of one recorded quote run, never a live call. */
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
  const callEnd = Math.max(...timeline.map((c) => c.endAt));
  const callMs = callEnd / CALL_SPEED;
  const total = ASK_MS + callMs + RANK_MS + BOOK_MS;
  const [tick, setTick] = useState(0);
  // Reduced motion shows the finished run instead of playing it.
  const r = reduce ? total - 1 : tick;

  useEffect(() => {
    if (reduce) return;
    const start = performance.now();
    let raf = 0;
    const loop = (now: number) => {
      setTick((now - start) % total);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [reduce, total]);

  const phase: Phase = r < ASK_MS ? "ask" : r < ASK_MS + callMs ? "call" : r < ASK_MS + callMs + RANK_MS ? "rank" : "book";
  const step = STEPS.findIndex((s) => s.key === phase);
  const t = phase === "ask" ? 0 : Math.min((r - ASK_MS) * CALL_SPEED, callEnd);
  const ranked = phase === "rank" || phase === "book";
  const typed = phase === "ask" ? REQUEST.slice(0, Math.ceil((r / (ASK_MS * 0.75)) * REQUEST.length)) : REQUEST;

  const channels = timeline.map((c) => {
    const said = c.lines.filter((l) => l.end <= t);
    const speaking = c.lines.find((l) => l.start <= t && t < l.end) ?? null;
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
    const status = phase === "ask" || t < 600 ? "waiting" : t < c.answerAt ? "ringing" : t < c.endAt ? "talking" : "done";
    const partial = speaking ? speaking.text.slice(0, Math.max(1, Math.round(((t - speaking.start) / (speaking.end - speaking.start)) * speaking.text.length))) : null;
    const latest = speaking ? { role: speaking.role, text: partial! } : said.at(-1) ?? null;
    return { ...c, speaking, latest, totals, status };
  });
  const order = ranked ? [...channels].sort((a, b) => (a.totals.risk_adjusted_cents ?? 0) - (b.totals.risk_adjusted_cents ?? 0)) : channels;
  const max = Math.max(...channels.map((c) => c.totals.risk_adjusted_cents ?? 0), 1);
  const winner = ranked ? order[0] : null;

  return (
    <div className="text-left">
      {/* where we are in the story */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <ol className="flex items-center gap-2 sm:gap-3">
          {STEPS.map((s, i) => (
            <li key={s.key} className="flex items-center gap-2 sm:gap-3">
              <span
                className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors duration-300 ${
                  i === step ? "bg-fg text-white" : i < step ? "text-fg" : "text-dim"
                }`}
              >
                <span className="font-mono text-[11.5px] opacity-70">{i + 1}</span>
                {s.label}
              </span>
              {i < STEPS.length - 1 && <span className={`h-px w-4 sm:w-8 ${i < step ? "bg-fg" : "bg-rule"}`} />}
            </li>
          ))}
        </ol>
        <span className="text-[12.5px] font-semibold text-crane">Replay of a recorded run with 3 carriers, sped up</span>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.p
          key={phase}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.25 }}
          className="mt-4 font-cond text-[24px] font-bold leading-tight tracking-[-0.01em] text-fg sm:text-[28px]"
        >
          {STEPS[step].say}
        </motion.p>
      </AnimatePresence>

      {/* the agent's request */}
      <div className="mt-5 flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-fg font-mono text-[11px] font-semibold text-white">AI</span>
        <div className="min-w-0">
          <div className="text-[12.5px] font-semibold text-muted">Your agent, over MCP</div>
          <div className="mt-1 min-h-[48px] rounded-[14px] rounded-tl-[4px] bg-panel-2 px-4 py-2.5 text-[15px] leading-relaxed text-fg">
            {typed}
            {phase === "ask" && typed.length < REQUEST.length && <span className="ml-0.5 inline-block h-[1em] w-[2px] translate-y-[2px] animate-blink bg-fg" />}
          </div>
        </div>
      </div>

      {/* the three calls, then the ranking */}
      <LayoutGroup>
        <ol className="mt-5 space-y-2.5">
          {order.map((c) => {
            const isWinner = winner?.script.key === c.script.key;
            const late = c.totals.projected_demurrage_cents ?? 0;
            const quoted = c.totals.all_in_cents ?? 0;
            const real = c.totals.risk_adjusted_cents ?? quoted;
            const price = ranked ? real : c.totals.all_in_cents;
            const who = c.speaking?.role ?? null;
            return (
              <motion.li
                key={c.script.key}
                layout
                transition={{ type: "spring", stiffness: 220, damping: 26 }}
                className={`rounded-[14px] border bg-sheet px-4 py-3 transition-[border-color,box-shadow] duration-500 ${
                  isWinner && phase === "book" ? "border-fg shadow-[0_14px_34px_-22px_rgba(18,20,23,0.6)]" : "border-rule"
                } ${c.status === "waiting" ? "opacity-60" : ""}`}
              >
                <div className="grid grid-cols-[36px_minmax(0,1fr)_auto] items-center gap-3 sm:gap-4">
                  {/* the call itself */}
                  <span
                    className={`relative grid h-9 w-9 place-items-center rounded-full transition-colors ${
                      c.status === "ringing" ? "bg-crane text-white" : c.status === "talking" ? "bg-live/10" : "bg-panel-2 text-muted"
                    }`}
                  >
                    {c.status === "ringing" && <span className="absolute inset-0 animate-ping rounded-full bg-crane/40" />}
                    {c.status === "talking" ? (
                      <Talking who={who} />
                    ) : (
                      <svg viewBox="0 0 24 24" className="relative h-4 w-4" aria-hidden>
                        {c.status === "done" ? (
                          <path d="M5 12.5 L10 17 L19 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                        ) : (
                          <path
                            d="M6.6 10.8a15.1 15.1 0 0 0 6.6 6.6l2.2-2.2a1 1 0 0 1 1-.25 11.4 11.4 0 0 0 3.6.57 1 1 0 0 1 1 1V20a1 1 0 0 1-1 1A17 17 0 0 1 3 4a1 1 0 0 1 1-1h3.5a1 1 0 0 1 1 1c0 1.25.2 2.45.57 3.6a1 1 0 0 1-.25 1z"
                            fill="currentColor"
                          />
                        )}
                      </svg>
                    )}
                  </span>
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                      <span className="font-semibold text-fg">{c.script.providerName}</span>
                      {isWinner && phase === "book" && (
                        <RubberStamp size="sm" color="green" rotate={-4}>
                          Booked
                        </RubberStamp>
                      )}
                    </div>
                    <div className={`mt-0.5 truncate text-[13px] ${ranked && late > 0 ? "text-red" : "text-muted"}`}>
                      {ranked ? (
                        <>
                          {NOTES[c.script.key]}
                          {late > 0 && <>: +{formatUsd(late)} in late fees</>}
                        </>
                      ) : c.status === "waiting" ? (
                        "Waiting to call"
                      ) : c.status === "ringing" ? (
                        "Ringing..."
                      ) : c.latest ? (
                        <>
                          <span className={`font-semibold ${c.latest.role === "assistant" ? "text-stamp" : "text-live"}`}>
                            {c.latest.role === "assistant" ? "PortCall" : "Dispatcher"}:
                          </span>{" "}
                          {c.latest.text}
                        </>
                      ) : (
                        "Connected"
                      )}
                    </div>
                  </div>
                  <div className="min-w-[88px] text-right">
                    {ranked && late > 0 && <div className="font-mono text-[12px] text-dim line-through">{formatUsd(quoted)}</div>}
                    <AnimatePresence mode="popLayout" initial={false}>
                      {price != null ? (
                        <motion.div
                          key={`${price}-${ranked}`}
                          className={`font-mono text-[18px] font-semibold tabular-nums ${ranked && late > 0 ? "text-red" : "text-fg"}`}
                          initial={{ scale: 1.6, opacity: 0, rotate: -6 }}
                          animate={{ scale: 1, opacity: 1, rotate: 0 }}
                          exit={{ opacity: 0 }}
                          transition={{ type: "spring", stiffness: 520, damping: 24 }}
                        >
                          {formatUsd(price)}
                        </motion.div>
                      ) : (
                        <div className="font-mono text-[18px] text-dim">$ –</div>
                      )}
                    </AnimatePresence>
                  </div>
                </div>
                {/* always laid out, so the panel never changes height while it loops */}
                <div className={`ml-[48px] mt-2.5 flex h-2 overflow-hidden rounded-full bg-panel-2 transition-opacity sm:ml-[52px] ${ranked ? "opacity-100" : "opacity-0"}`} aria-hidden>
                  <motion.span className="bg-fg/75" initial={false} animate={{ width: ranked ? `${(quoted / max) * 100}%` : "0%" }} transition={{ duration: ranked ? 0.6 : 0, ease: "easeOut" }} />
                  {late > 0 && (
                    <motion.span
                      className="border-l-2 border-sheet"
                      style={{ background: LATE_FILL }}
                      initial={false}
                      animate={{ width: ranked ? `${(late / max) * 100}%` : "0%" }}
                      transition={{ duration: ranked ? 0.6 : 0, delay: ranked ? 0.55 : 0, ease: "easeOut" }}
                    />
                  )}
                </div>
              </motion.li>
            );
          })}
        </ol>
      </LayoutGroup>

      {/* the booking */}
      <div className="mt-4 flex min-h-[24px] flex-wrap gap-x-6 gap-y-1.5 text-[13.5px]">
        <AnimatePresence>
          {phase === "book" &&
            ["Card held for $847 (Stripe, test mode)", "Tender emailed to Marshgrass", "Paid out when they deliver"].map((line, i) => (
              <motion.span
                key={line}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ delay: 0.5 + i * 0.35 }}
                className="inline-flex items-center gap-1.5 font-semibold text-fg"
              >
                <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 text-live" aria-hidden>
                  <path d="M3 8.5 L6.5 12 L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                {line}
              </motion.span>
            ))}
        </AnimatePresence>
      </div>
    </div>
  );
}
