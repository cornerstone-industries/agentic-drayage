"use client";

import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { Odometer } from "@/components/freight/odometer";
import { RubberStamp } from "@/components/freight/rubber-stamp";
import { formatUsd } from "@/lib/money";
import { StatusPill } from "./status-pill";
import { VoiceTrace } from "./voice-trace";
import { FIELD_ROWS, displayField, fieldLabel } from "./fields";
import type { QuoteField } from "@/lib/ai/types";
import type { Call, Provider, Quote, TranscriptLine } from "@/lib/types";

type Props = {
  channel: number;
  provider: Provider;
  call: Call | null;
  lines: TranscriptLine[];
  quote: Quote | undefined;
  lastFreeDay: string | null;
  rank?: number;
  isWinner?: boolean;
  reasons?: string[];
};

// Carbon-copy colors of a 3-part form: white, canary, pink. Used as the ticket's tab.
const COPY_TAB = ["#121417", "#F2C230", "#EE86A4"];
const TONE: Record<string, string> = { fg: "text-fg", signal: "text-live", alarm: "text-red", muted: "text-muted" };

function useCallClock(call: Call | null) {
  const [now, setNow] = useState(() => Date.now());
  const live = call?.status === "in_progress";
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  if (!call?.started_at) return "0:00";
  const end = call.ended_at ? new Date(call.ended_at).getTime() : now;
  const s = Math.max(0, Math.floor((end - new Date(call.started_at).getTime()) / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/** The source line for a displayed row (chassis rows can come from the days line). */
function sourceFor(key: QuoteField, sources: Record<string, number>): number | null {
  return sources[key] ?? (key === "chassis_per_day_cents" ? (sources.est_chassis_days ?? null) : null);
}

/** Types a line out like a teleprinter, only for lines that arrive while you watch. */
function Typed({ text, animate }: { text: string; animate: boolean }) {
  const reduce = useReducedMotion();
  const [n, setN] = useState(animate && !reduce ? 0 : text.length);
  useEffect(() => {
    if (!animate || reduce) return;
    const total = text.length;
    const duration = Math.min(1300, Math.max(320, total * 15));
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const k = Math.min(1, (now - start) / duration);
      setN(Math.ceil(k * total));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, animate, reduce]);
  return (
    <>
      {text.slice(0, n)}
      {n < text.length && <span className="ml-px inline-block h-[0.95em] w-[2px] translate-y-[2px] animate-blink bg-fg" />}
    </>
  );
}

export function CallCard({ channel, provider, call, lines, quote, lastFreeDay, rank, isWinner, reasons }: Props) {
  const status = call?.status ?? "standby";
  const live = status === "in_progress";
  const clock = useCallClock(call);
  const sources = (quote?.field_sources ?? {}) as Record<string, number>;
  const speaking = (call?.speaking as "assistant" | "user" | null) ?? null;

  // Lines already on screen when this ticket mounted are shown whole; new ones type out.
  const [seenAtMount] = useState(() => new Set(lines.map((l) => l.id)));

  // Which fields were just heard: they stamp in, their line gets highlighted, a pencil line connects them.
  const prev = useRef<Map<QuoteField, string> | null>(null);
  const [fresh, setFresh] = useState<{ fields: QuoteField[]; at: number } | null>(null);
  useEffect(() => {
    const current = new Map<QuoteField, string>();
    if (quote) {
      for (const f of FIELD_ROWS) {
        const d = displayField(f.key, quote, lastFreeDay);
        if (d) current.set(f.key, d.text);
      }
    }
    if (prev.current) {
      const changed = [...current.entries()].filter(([k, v]) => prev.current!.get(k) !== v).map(([k]) => k);
      if (changed.length) {
        const t = setTimeout(() => setFresh({ fields: changed, at: Date.now() }), 0);
        prev.current = current;
        return () => clearTimeout(t);
      }
    }
    prev.current = current;
  }, [quote, lastFreeDay]);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 1900);
    return () => clearTimeout(t);
  }, [fresh]);

  // Transcript keeps the newest line in view (and re-pins after a re-sort moves the ticket).
  const tape = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = tape.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [lines.length, rank]);

  // Pencil connector from each freshly stamped field back to the words it came from.
  const card = useRef<HTMLDivElement>(null);
  const fieldEls = useRef(new Map<QuoteField, HTMLElement>());
  const lineEls = useRef(new Map<number, HTMLElement>());
  const [paths, setPaths] = useState<{ d: string; key: string; end: [number, number] }[]>([]);
  useLayoutEffect(() => {
    const box = card.current?.getBoundingClientRect();
    const tapeBox = tape.current?.getBoundingClientRect();
    const out: { d: string; key: string; end: [number, number] }[] = [];
    if (fresh && box) {
      for (const f of fresh.fields) {
        const src = sourceFor(f, sources);
        const fe = fieldEls.current.get(f);
        const le = src != null ? lineEls.current.get(src) : undefined;
        if (!fe || !le) continue;
        const fr = fe.getBoundingClientRect();
        const lr = le.getBoundingClientRect();
        const fx = fr.left - box.left + 2;
        const fy = fr.top - box.top + fr.height / 2;
        const lx = lr.left - box.left + 2;
        let ly = lr.top - box.top + Math.min(lr.height / 2, 11);
        if (tapeBox) ly = Math.min(Math.max(ly, tapeBox.top - box.top + 8), tapeBox.bottom - box.top - 8);
        const bend = Math.max(18, Math.min(46, Math.abs(fy - ly) / 3.5));
        out.push({ d: `M ${fx} ${fy} C ${fx - bend} ${fy}, ${lx - bend} ${ly}, ${lx} ${ly}`, key: `${f}-${fresh.at}`, end: [lx, ly] });
      }
    }
    const t = setTimeout(() => setPaths(out), 0);
    return () => clearTimeout(t);
    // sources change together with fresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);

  const allIn = quote?.all_in_cents ?? null;
  const demurrage = quote?.projected_demurrage_cents ?? 0;
  const freshLines = new Set((fresh?.fields ?? []).map((f) => sourceFor(f, sources)).filter((x): x is number => x != null));

  return (
    <div className="relative" data-testid="call-card" data-status={status} data-provider={provider.name}>
      <div
        ref={card}
        className={`relative overflow-hidden rounded-[18px] border bg-sheet transition-[box-shadow,transform,border-color] duration-500 ${
          status === "ringing" ? "animate-ring" : ""
        } ${
          isWinner
            ? "-translate-y-1.5 border-fg shadow-[0_2px_0_#121417,0_28px_60px_-28px_rgba(18,20,23,0.55)]"
            : rank
              ? "border-rule shadow-[0_10px_30px_-24px_rgba(18,20,23,0.4)]"
              : "border-rule shadow-[0_14px_40px_-26px_rgba(18,20,23,0.45)]"
        }`}
      >
        <div className="h-1.5" style={{ background: COPY_TAB[(channel - 1) % 3] }} />

        {/* header */}
        <div className="px-5 pt-4">
          <div className="flex items-center justify-between">
            <StatusPill status={status} />
            <div className="flex items-center gap-3 font-mono text-[12px] text-muted">
              {rank != null && !isWinner && <span className="rounded-full border border-rule px-2 py-px">#{rank}</span>}
              <span className="tabular-nums">{clock}</span>
            </div>
          </div>
          <h3 className="mt-3 font-cond text-[26px] font-bold leading-[1.05] tracking-[-0.01em] text-fg">{provider.name}</h3>
          <p className="mt-1 text-[13px] text-muted">
            {provider.contact_name ?? "Dispatch"}, {provider.phone}
          </p>
        </div>

        {/* voice trace on graph paper */}
        <div className="mx-5 mt-4 rounded-[10px] border border-rule bg-[linear-gradient(rgba(36,83,214,0.07)_1px,transparent_1px),linear-gradient(90deg,rgba(36,83,214,0.07)_1px,transparent_1px)] bg-[size:12px_12px] px-1">
          <VoiceTrace speaking={speaking} live={live} />
        </div>
        <div className="mx-5 mt-1.5 flex items-center gap-4 text-[12px]">
          <span className={`inline-flex items-center gap-1.5 ${speaking === "assistant" ? "font-semibold text-stamp" : "text-muted"}`}>
            <span className="h-1.5 w-3 rounded-full bg-stamp" /> PortCall AI
          </span>
          <span className={`inline-flex items-center gap-1.5 ${speaking === "user" ? "font-semibold text-live" : "text-muted"}`}>
            <span className="h-1.5 w-3 rounded-full bg-live" /> Dispatcher
          </span>
        </div>

        {/* transcript */}
        <div ref={tape} className="relative mt-4 h-[196px] overflow-y-auto border-y border-rule bg-panel-2 px-5 py-3 [scrollbar-width:thin]" aria-live="polite">
          {lines.length === 0 ? (
            <p className="pt-1 text-[13px] text-dim">{call ? (status === "ringing" ? "Ringing..." : "Waiting for the first words...") : "The conversation shows up here, word for word."}</p>
          ) : (
            <ul className="space-y-2">
              {lines.map((l) => {
                const tagged = Object.entries(sources)
                  .filter(([, id]) => id === l.id)
                  .map(([k]) => k);
                const isSource = tagged.length > 0;
                return (
                  <motion.li
                    key={l.id}
                    ref={(el) => {
                      if (el) lineEls.current.set(l.id, el);
                      else lineEls.current.delete(l.id);
                    }}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.22 }}
                    className="grid grid-cols-[52px_1fr] gap-2 text-[13.5px] leading-[1.45]"
                  >
                    <span className={`pt-px text-[11px] font-semibold ${l.role === "assistant" ? "text-stamp" : "text-live"}`}>{l.role === "assistant" ? "PortCall" : "Dispatch"}</span>
                    <span className={l.role === "assistant" ? "text-muted" : "text-fg"}>
                      <span className="marker rounded-[3px]" data-on={isSource}>
                        <Typed text={l.text} animate={!seenAtMount.has(l.id)} />
                      </span>
                      {isSource && (
                        <span className={`ml-1.5 whitespace-nowrap rounded-full px-1.5 py-px text-[10.5px] font-semibold ${freshLines.has(l.id) ? "bg-stamp text-white" : "bg-stamp/10 text-stamp"}`}>
                          {tagged.map(fieldLabel).join(" + ")}
                        </span>
                      )}
                    </span>
                  </motion.li>
                );
              })}
            </ul>
          )}
        </div>

        {/* the quote, filled in as it is heard */}
        <dl className="px-5 pb-2 pt-3">
          {FIELD_ROWS.map((f) => {
            const d = quote ? displayField(f.key, quote, lastFreeDay) : null;
            const isFresh = Boolean(fresh?.fields.includes(f.key));
            return (
              <div
                key={f.key}
                ref={(el) => {
                  if (el) fieldEls.current.set(f.key, el);
                  else fieldEls.current.delete(f.key);
                }}
                className="relative flex items-baseline gap-2 py-[7px]"
              >
                {isFresh && (
                  <motion.span
                    key={fresh!.at}
                    className="pointer-events-none absolute inset-x-[-10px] inset-y-[1px] rounded-[8px] bg-marker/60"
                    initial={{ opacity: 1 }}
                    animate={{ opacity: 0 }}
                    transition={{ duration: 1.1, ease: "easeOut" }}
                  />
                )}
                <dt className="relative shrink-0 text-[13.5px] text-muted">{f.label}</dt>
                <span className="relative mb-[4px] flex-1 border-b border-dotted border-dim/70" aria-hidden />
                <dd className="relative text-right">
                  <AnimatePresence mode="popLayout" initial={false}>
                    {d ? (
                      <motion.span
                        key={d.text}
                        className={`relative inline-block font-mono text-[15px] font-semibold tabular-nums ${d.tone === "fg" ? "text-stamp" : TONE[d.tone]}`}
                        initial={{ scale: 1.9, rotate: -10, opacity: 0, y: -6 }}
                        animate={{ scale: 1, rotate: 0, opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ type: "spring", stiffness: 600, damping: 22 }}
                      >
                        {isFresh && (
                          <motion.span
                            className="absolute inset-[-6px] rounded-full border-2 border-stamp"
                            initial={{ scale: 0.5, opacity: 0.55 }}
                            animate={{ scale: 1.5, opacity: 0 }}
                            transition={{ duration: 0.55, ease: "easeOut" }}
                          />
                        )}
                        {d.text}
                      </motion.span>
                    ) : (
                      <motion.span key="empty" className="text-[13px] text-dim" exit={{ opacity: 0 }}>
                        {call && status === "in_progress" ? "listening" : "–"}
                      </motion.span>
                    )}
                  </AnimatePresence>
                  {d?.note && <span className="block text-[11.5px] text-muted">{d.note}</span>}
                </dd>
              </div>
            );
          })}
        </dl>

        {/* totals on a mechanical counter */}
        <div className="border-t border-rule px-5 pb-5 pt-4">
          <div className="flex items-end justify-between gap-3">
            <span className="pb-1 text-[13.5px] font-semibold text-fg">All-in</span>
            {allIn == null ? <span className="font-mono text-[30px] text-dim">$ –</span> : <Odometer value={formatUsd(allIn)} className="text-[30px] text-fg" />}
          </div>
          {demurrage > 0 && (
            <div className="mt-2 flex items-end justify-between gap-3">
              <span className="pb-0.5 text-[13px] font-semibold text-red">With est. demurrage</span>
              <Odometer value={formatUsd(quote?.risk_adjusted_cents ?? 0)} className="text-[22px] text-red" />
            </div>
          )}
          {reasons && reasons.length > 0 && !isWinner && (
            <div className="mt-3 flex flex-wrap gap-2">
              {reasons.map((r, i) => (
                <RubberStamp key={r} size="sm" rotate={i % 2 ? 1.5 : -2}>
                  {r}
                </RubberStamp>
              ))}
            </div>
          )}
        </div>

        {/* AWARDED lands on the winner */}
        {isWinner && (
          <div className="absolute right-4 top-[92px] z-10">
            <RubberStamp size="lg" rotate={-11} testId="awarded-stamp">
              Awarded
            </RubberStamp>
          </div>
        )}

        {/* pencil line from the stamped field back to its words */}
        <svg className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible" aria-hidden>
          <AnimatePresence>
            {paths.map((p) => (
              <motion.g key={p.key} initial={{ opacity: 1 }} animate={{ opacity: [1, 1, 0] }} exit={{ opacity: 0 }} transition={{ duration: 1.9, times: [0, 0.7, 1] }}>
                <motion.path
                  d={p.d}
                  fill="none"
                  stroke="rgb(36 83 214)"
                  strokeWidth={1.6}
                  strokeLinecap="round"
                  initial={{ pathLength: 0 }}
                  animate={{ pathLength: 1 }}
                  transition={{ duration: 0.5, ease: "easeOut" }}
                />
                <motion.circle cx={p.end[0]} cy={p.end[1]} r={3} fill="rgb(36 83 214)" initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.45 }} />
              </motion.g>
            ))}
          </AnimatePresence>
        </svg>
      </div>
    </div>
  );
}
