"use client";

import { AnimatePresence, motion } from "motion/react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { formatUsd } from "@/lib/money";
import { SplitFlap } from "@/components/freight/split-flap";
import { StatusPill } from "./status-pill";
import { Waveform } from "./waveform";
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

const TONE: Record<string, string> = { fg: "text-fg", signal: "text-signal", alarm: "text-alarm", muted: "text-muted" };

function useCallClock(call: Call | null) {
  const [now, setNow] = useState(() => Date.now());
  const live = call?.status === "in_progress";
  useEffect(() => {
    if (!live) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [live]);
  if (!call?.started_at) return "00:00";
  const end = call.ended_at ? new Date(call.ended_at).getTime() : now;
  const s = Math.max(0, Math.floor((end - new Date(call.started_at).getTime()) / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
}

/** The source line for a displayed row (chassis rows can come from the days line). */
function sourceFor(key: QuoteField, sources: Record<string, number>): number | null {
  return sources[key] ?? (key === "chassis_per_day_cents" ? sources.est_chassis_days ?? null : null);
}

export function CallCard({ channel, provider, call, lines, quote, lastFreeDay, rank, isWinner, reasons }: Props) {
  const status = call?.status ?? "standby";
  const live = status === "in_progress";
  const clock = useCallClock(call);
  const sources = (quote?.field_sources ?? {}) as Record<string, number>;

  // Which fields just got heard: they stamp in, and their source line lights up with a connector.
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
      if (changed.length) setFresh({ fields: changed, at: Date.now() });
    }
    prev.current = current;
  }, [quote, lastFreeDay]);
  useEffect(() => {
    if (!fresh) return;
    const t = setTimeout(() => setFresh(null), 1700);
    return () => clearTimeout(t);
  }, [fresh]);
  const freshLines = new Set((fresh?.fields ?? []).map((f) => sourceFor(f, sources)).filter((x): x is number => x != null));

  // Transcript ticker keeps the newest line in view.
  const ticker = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ticker.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [lines.length]);

  // Connector glow from each freshly stamped field back to the line it came from.
  const card = useRef<HTMLDivElement>(null);
  const fieldEls = useRef(new Map<QuoteField, HTMLElement>());
  const lineEls = useRef(new Map<number, HTMLElement>());
  const [paths, setPaths] = useState<{ d: string; key: string }[]>([]);
  useLayoutEffect(() => {
    if (!fresh || !card.current) {
      setPaths([]);
      return;
    }
    const box = card.current.getBoundingClientRect();
    const tick = ticker.current?.getBoundingClientRect();
    const out: { d: string; key: string }[] = [];
    for (const f of fresh.fields) {
      const src = sourceFor(f, sources);
      const fe = fieldEls.current.get(f);
      const le = src != null ? lineEls.current.get(src) : undefined;
      if (!fe || !le) continue;
      const fr = fe.getBoundingClientRect();
      const lr = le.getBoundingClientRect();
      const fx = fr.left - box.left + 6;
      const fy = fr.top - box.top + fr.height / 2;
      const lx = lr.left - box.left + 4;
      let ly = lr.top - box.top + Math.min(lr.height / 2, 10);
      if (tick) ly = Math.min(Math.max(ly, tick.top - box.top + 6), tick.bottom - box.top - 6);
      const bend = Math.max(14, Math.min(40, Math.abs(fy - ly) / 4));
      out.push({ d: `M ${fx} ${fy} C ${fx - bend} ${fy}, ${lx - bend} ${ly}, ${lx} ${ly}`, key: `${f}-${fresh.at}` });
    }
    setPaths(out);
    // sources only change together with fresh
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fresh]);

  const allIn = quote?.all_in_cents ?? null;
  const demurrage = quote?.projected_demurrage_cents ?? 0;

  return (
    <div
      ref={card}
      data-testid="call-card"
      data-status={status}
      data-provider={provider.name}
      className={`panel relative flex h-full flex-col overflow-hidden rounded-[4px] transition-shadow duration-500 ${
        isWinner ? "shadow-[0_0_0_1.5px_var(--sodium),0_0_48px_-6px_rgba(255,176,32,0.45)]" : ""
      } ${rank && !isWinner ? "opacity-[0.86]" : ""}`}
    >
      {/* channel strip */}
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <div className="flex items-center gap-3">
          <span className="font-mono text-[11px] text-dim">CH {channel}</span>
          <StatusPill status={status} />
        </div>
        <div className="flex items-center gap-3">
          {rank != null && (
            <span className={`font-mono text-[11px] ${isWinner ? "text-sodium" : "text-muted"}`}>{isWinner ? "Recommended" : `#${rank}`}</span>
          )}
          <span className="font-mono text-xs tabular-nums text-muted">{clock}</span>
        </div>
      </div>

      <div className="px-4 pb-3 pt-4">
        <h3 className="font-display text-[22px] font-extrabold leading-tight font-semiwide">{provider.name}</h3>
        <p className="mt-1 font-mono text-[11px] text-muted">
          {provider.contact_name ?? "Dispatch"}, {provider.phone}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <Waveform speaking={(call?.speaking as "assistant" | "user" | null) ?? null} live={live} />
          <span className="whitespace-nowrap font-mono text-[11px] text-muted">
            {call?.speaking === "assistant" ? (
              <span className="text-sodium">PortCall speaking</span>
            ) : call?.speaking === "user" ? (
              <span className="text-signal">Dispatcher speaking</span>
            ) : live ? (
              "Line open"
            ) : status === "ringing" ? (
              "Ringing"
            ) : status === "standby" ? (
              "Idle"
            ) : status === "queued" ? (
              "Dialing"
            ) : (
              "Hung up"
            )}
          </span>
        </div>
      </div>

      {/* transcript ticker */}
      <div ref={ticker} className="relative h-[178px] overflow-y-auto border-y border-line bg-ink/60 px-4 py-3 [scrollbar-width:thin]" aria-live="polite">
        {lines.length === 0 ? (
          <p className="font-mono text-[11px] leading-5 text-dim">{call ? "Waiting for the first words..." : "Transcript appears here as they talk."}</p>
        ) : (
          <ul className="space-y-1.5">
            {lines.map((l) => {
              const tagged = Object.entries(sources).filter(([, id]) => id === l.id).map(([k]) => k);
              const isFresh = freshLines.has(l.id);
              return (
                <motion.li
                  key={l.id}
                  ref={(el) => {
                    if (el) lineEls.current.set(l.id, el);
                    else lineEls.current.delete(l.id);
                  }}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25 }}
                  className={`relative rounded-[2px] border-l-2 py-0.5 pl-2 pr-1 text-[12.5px] leading-[1.45] transition-colors duration-500 ${
                    isFresh ? "border-sodium bg-sodium/15" : tagged.length ? "border-signal/50" : "border-transparent"
                  }`}
                >
                  <span className={`mr-1.5 font-mono text-[10px] ${l.role === "assistant" ? "text-sodium/70" : "text-signal/80"}`}>
                    {l.role === "assistant" ? "AI" : "DSP"}
                  </span>
                  <span className={l.role === "assistant" ? "text-muted" : "text-fg"}>{l.text}</span>
                  {tagged.length > 0 && (
                    <span className="ml-1.5 whitespace-nowrap font-mono text-[10px] text-signal">[{tagged.map(fieldLabel).join(", ")}]</span>
                  )}
                </motion.li>
              );
            })}
          </ul>
        )}
      </div>

      {/* quote field stack */}
      <dl className="flex-1 px-4 py-3">
        {FIELD_ROWS.map((f) => {
          const d = quote ? displayField(f.key, quote, lastFreeDay) : null;
          const isFresh = fresh?.fields.includes(f.key);
          return (
            <div
              key={f.key}
              ref={(el) => {
                if (el) fieldEls.current.set(f.key, el);
                else fieldEls.current.delete(f.key);
              }}
              className="relative flex items-baseline justify-between gap-3 border-b border-line/60 py-[7px] last:border-0"
            >
              {isFresh && (
                <motion.span
                  key={fresh!.at}
                  className="pointer-events-none absolute inset-x-[-8px] inset-y-0 rounded-[2px] bg-sodium"
                  initial={{ opacity: 0.5 }}
                  animate={{ opacity: 0 }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              )}
              <dt className="relative flex items-center gap-1.5 text-[13px] text-muted">
                <span className={`h-1 w-1 rounded-full ${d ? "bg-signal" : "bg-line"}`} />
                {f.label}
              </dt>
              <dd className="relative text-right">
                <AnimatePresence mode="popLayout" initial={false}>
                  {d ? (
                    <motion.span
                      key={d.text}
                      className={`inline-block font-mono text-[14px] font-semibold tabular-nums ${TONE[d.tone]}`}
                      initial={{ scale: 1.9, rotate: -8, opacity: 0 }}
                      animate={{ scale: 1, rotate: 0, opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ type: "spring", stiffness: 520, damping: 20 }}
                    >
                      {d.text}
                    </motion.span>
                  ) : (
                    <motion.span key="empty" className="font-mono text-[13px] text-dim" exit={{ opacity: 0 }}>
                      {call && status !== "ended" ? "listening" : "--"}
                    </motion.span>
                  )}
                </AnimatePresence>
                {d?.note && <span className="block font-mono text-[10.5px] text-muted">{d.note}</span>}
              </dd>
            </div>
          );
        })}
      </dl>

      {/* totals */}
      <div className="border-t border-line bg-panel-2 px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <span className="text-[13px] text-muted">All-in</span>
          <SplitFlap value={allIn == null ? "   --   " : formatUsd(allIn).padStart(9, " ")} className="text-[19px]" />
        </div>
        {demurrage > 0 && (
          <div className="mt-2 flex items-center justify-between gap-3">
            <span className="text-[13px] text-alarm">With demurrage</span>
            <SplitFlap value={formatUsd(quote?.risk_adjusted_cents ?? 0).padStart(9, " ")} className="text-[19px]" tone="text-alarm" />
          </div>
        )}
        <AnimatePresence>
          {reasons && reasons.length > 0 && !isWinner && (
            <motion.ul initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} className="mt-3 flex flex-wrap gap-1.5">
              {reasons.map((r) => (
                <li key={r} className="rounded-[2px] border border-alarm/40 bg-alarm/10 px-2 py-0.5 font-mono text-[11px] text-alarm">
                  {r}
                </li>
              ))}
            </motion.ul>
          )}
        </AnimatePresence>
      </div>

      {/* connector glow from stamped field to its transcript line */}
      <svg className="pointer-events-none absolute inset-0 h-full w-full overflow-visible" aria-hidden>
        <AnimatePresence>
          {paths.map((p) => (
            <motion.path
              key={p.key}
              d={p.d}
              fill="none"
              stroke="var(--sodium)"
              strokeWidth={1.6}
              style={{ filter: "drop-shadow(0 0 4px var(--sodium))" }}
              initial={{ pathLength: 0, opacity: 1 }}
              animate={{ pathLength: 1, opacity: [1, 1, 0] }}
              exit={{ opacity: 0 }}
              transition={{ pathLength: { duration: 0.45, ease: "easeOut" }, opacity: { duration: 1.6, times: [0, 0.6, 1] } }}
            />
          ))}
        </AnimatePresence>
      </svg>
    </div>
  );
}
