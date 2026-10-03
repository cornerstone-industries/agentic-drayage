"use client";

import { useLayoutEffect, useRef, useState, useTransition } from "react";
import { saveGuardrails } from "@/app/settings/actions";
import { formatUsd } from "@/lib/money";
import type { CallMode } from "@/lib/env";
import { Switch } from "./controls";
import { AlertIcon, CheckIcon, MinusIcon, PlusIcon } from "./icons";

type Values = { auto_book_enabled: boolean; auto_book_limit_usd: number; auto_quote_enabled: boolean; auto_quote_days_before_eta: number };
export type RecentQuote = { cents: number; provider: string };

const MAX_LIMIT = 100_000; // same ceiling as saveGuardrails
const STEP = 50;
const THUMB = 14; // px, the slider handle width in globals.css (.limit-range)

const usd = (dollars: number) => formatUsd(Math.round(dollars * 100), { whole: true });

/** A round top for the band: about twice the recent quotes, never below the saved limit. */
function bandMax(limitUsd: number, quotes: RecentQuote[]): number {
  const top = Math.max(2000, limitUsd * 1.5, ...quotes.map((q) => (q.cents / 100) * 2));
  const step = top <= 5000 ? 500 : top <= 20000 ? 1000 : 5000;
  return Math.ceil(top / step) * step;
}

/** Where a value sits on the band, matching the native range thumb (its center travels THUMB/2 in from each end). */
const at = (pct: number) => `calc(${pct}% + ${((50 - pct) / 100) * THUMB}px)`;

/** Dollar field that keeps its thousands separators while you type, and the caret where you left it. */
function MoneyInput({ value, onChange, id, describedBy }: { value: number | null; onChange: (v: number | null) => void; id: string; describedBy: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const digitsBeforeCaret = useRef<number | null>(null);
  const text = value == null ? "" : value.toLocaleString("en-US");

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el || digitsBeforeCaret.current == null || document.activeElement !== el) return;
    let left = digitsBeforeCaret.current;
    let pos = 0;
    while (pos < text.length && left > 0) {
      if (/\d/.test(text[pos])) left--;
      pos++;
    }
    el.setSelectionRange(pos, pos);
    digitsBeforeCaret.current = null;
  }, [text]);

  return (
    <div className="flex h-14 w-full items-center rounded-[12px] border border-rule bg-sheet transition-[border-color,box-shadow] focus-within:border-fg focus-within:shadow-[0_0_0_4px_rgb(var(--text-rgb)/0.07)] sm:w-[260px]">
      <span className="pl-4 pr-1 font-cond text-[24px] font-bold text-muted" aria-hidden>
        $
      </span>
      <input
        ref={ref}
        id={id}
        inputMode="numeric"
        autoComplete="off"
        aria-describedby={describedBy}
        value={text}
        onChange={(e) => {
          const raw = e.target.value;
          digitsBeforeCaret.current = raw.slice(0, e.target.selectionStart ?? raw.length).replace(/\D/g, "").length;
          const digits = raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
          onChange(digits === "" ? null : Math.min(Number(digits), MAX_LIMIT));
        }}
        onKeyDown={(e) => {
          if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
          e.preventDefault();
          const delta = (e.key === "ArrowUp" ? STEP : -STEP) * (e.shiftKey ? 10 : 1);
          onChange(Math.min(MAX_LIMIT, Math.max(0, (value ?? 0) + delta)));
        }}
        className="h-full min-w-0 flex-1 bg-transparent font-cond text-[24px] font-bold tabular-nums tracking-[-0.01em] text-fg outline-none placeholder:text-dim"
        placeholder="0"
      />
      <span className="whitespace-nowrap pr-4 text-[13.5px] font-medium text-muted">per container</span>
    </div>
  );
}

/**
 * The limit as a band: under it agents may book, over it a person decides. Drag the handle or use the
 * arrow keys. Dots are recent quotes from your carriers, so the number reads against real prices.
 */
function LimitBand({ limit, onChange, quotes, max }: { limit: number; onChange: (v: number) => void; quotes: RecentQuote[]; max: number }) {
  const pct = Math.min(100, Math.max(0, (limit / max) * 100));
  const under = quotes.filter((q) => q.cents <= limit * 100).length;
  const cents = quotes.map((q) => q.cents);
  const range = quotes.length ? `${formatUsd(Math.min(...cents))} to ${formatUsd(Math.max(...cents))}` : "";

  return (
    <div className="mt-7">
      <div className="relative h-11">
        <div className="absolute inset-0 overflow-hidden rounded-[10px] border border-rule">
          <div className="absolute inset-y-0 left-0 flex items-center bg-live/[0.13]" style={{ width: at(pct) }}>
            {pct > 26 && (
              <span className="flex min-w-0 items-center gap-1.5 whitespace-nowrap px-3 text-[13px] font-semibold text-fg">
                <CheckIcon className="h-3.5 w-3.5 shrink-0 text-live" />
                Agents can book
              </span>
            )}
          </div>
          <div className="absolute inset-y-0 right-0 flex items-center justify-end bg-canary" style={{ left: at(pct) }}>
            {pct < 74 && <span className="whitespace-nowrap px-3 text-[13px] font-semibold text-fg">Needs your OK</span>}
          </div>
        </div>
        <input
          type="range"
          className="limit-range absolute inset-0 h-full w-full"
          min={0}
          max={max}
          step={STEP}
          value={Math.min(limit, max)}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Spending limit"
          aria-valuetext={`${usd(limit)} per container`}
        />
      </div>

      <div className="relative mx-0 mt-2 h-3" aria-hidden>
        {quotes.map((q, i) => (
          <span
            key={i}
            title={`${formatUsd(q.cents)} from ${q.provider}`}
            className={`absolute top-0.5 h-2 w-2 -translate-x-1/2 rounded-full ring-2 ring-sheet ${q.cents <= limit * 100 ? "bg-live" : "bg-crane"}`}
            style={{ left: at(Math.min(100, (q.cents / 100 / max) * 100)) }}
          />
        ))}
      </div>
      <div className="mt-0.5 flex justify-between text-[12px] tabular-nums text-muted">
        <span>$0</span>
        <span>{limit > max ? `${usd(limit)} limit is off the scale` : usd(max)}</span>
      </div>

      {quotes.length > 0 && (
        <p className="mt-3 text-[13.5px] leading-relaxed text-muted">
          The dots are your last {quotes.length} quotes, {range}.{" "}
          <span className="font-semibold text-fg">
            {under === quotes.length ? `All ${under} fit under this limit.` : under === 0 ? "None fit under this limit." : `${under} of ${quotes.length} fit under this limit.`}
          </span>
        </p>
      )}
    </div>
  );
}

/** Whole-number stepper with visible minus and plus buttons. */
function Stepper({ value, min, max, disabled, onChange, label }: { value: number; min: number; max: number; disabled: boolean; onChange: (v: number) => void; label: string }) {
  const btn =
    "flex w-10 items-center justify-center text-fg transition-colors hover:bg-panel-2 disabled:cursor-not-allowed disabled:text-dim disabled:hover:bg-transparent";
  return (
    <div className="flex h-10 items-stretch overflow-hidden rounded-[10px] border border-rule bg-sheet" role="group" aria-label={label}>
      <button type="button" className={btn} onClick={() => onChange(Math.max(min, value - 1))} disabled={disabled || value <= min} aria-label="One day fewer">
        <MinusIcon className="h-3.5 w-3.5" />
      </button>
      <span className="flex w-12 items-center justify-center border-x border-rule font-cond text-[18px] font-bold tabular-nums text-fg" aria-live="polite">
        {value}
      </span>
      <button type="button" className={btn} onClick={() => onChange(Math.min(max, value + 1))} disabled={disabled || value >= max} aria-label="One day more">
        <PlusIcon className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

export function GuardrailsForm({ initial, recentQuotes, mode }: { initial: Values; recentQuotes: RecentQuote[]; mode: CallMode }) {
  const [saved, setSaved] = useState(initial);
  const [limit, setLimit] = useState<number | null>(initial.auto_book_limit_usd);
  const [autoBook, setAutoBook] = useState(initial.auto_book_enabled);
  const [autoQuote, setAutoQuote] = useState(initial.auto_quote_enabled);
  const [days, setDays] = useState(initial.auto_quote_days_before_eta);
  const [status, setStatus] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  // Fixed per page load, so the band does not rescale under the handle while you drag.
  const [max] = useState(() => bandMax(initial.auto_book_limit_usd, recentQuotes));

  const dirty =
    limit !== saved.auto_book_limit_usd ||
    autoBook !== saved.auto_book_enabled ||
    autoQuote !== saved.auto_quote_enabled ||
    days !== saved.auto_quote_days_before_eta;

  // Any edit clears the last save result.
  const edit =
    <T,>(set: (v: T) => void) =>
    (v: T) => {
      set(v);
      setStatus(null);
    };

  function discard() {
    setLimit(saved.auto_book_limit_usd);
    setAutoBook(saved.auto_book_enabled);
    setAutoQuote(saved.auto_quote_enabled);
    setDays(saved.auto_quote_days_before_eta);
    setStatus(null);
  }

  return (
    <form
      className="panel overflow-hidden"
      aria-label="Guardrails"
      onSubmit={(e) => {
        e.preventDefault();
        if (limit == null || !dirty) return;
        const next: Values = { auto_book_enabled: autoBook, auto_book_limit_usd: limit, auto_quote_enabled: autoQuote, auto_quote_days_before_eta: days };
        start(async () => {
          const r = await saveGuardrails(next);
          if (r.ok) setSaved(next);
          setStatus({ ok: r.ok, text: r.ok ? "Saved" : r.message });
        });
      }}
    >
      {/* Spending limit */}
      <div className="p-6 sm:p-7">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between sm:gap-8">
          <div className="max-w-[380px]">
            <label htmlFor="limit" className="text-[16px] font-semibold text-fg">
              Spending limit
            </label>
            <p id="limit-help" className="mt-1 text-[14px] leading-relaxed text-muted">
              The most an agent or auto-book can commit to one container. Anything above it waits for a person to click Book.
            </p>
          </div>
          <div className="shrink-0">
            <MoneyInput id="limit" describedBy="limit-help" value={limit} onChange={edit(setLimit)} />
            {limit == null && <p className="mt-1.5 text-[12.5px] font-semibold text-red">Enter a limit. Use 0 to approve every booking yourself.</p>}
          </div>
        </div>
        <LimitBand limit={limit ?? 0} onChange={edit(setLimit)} quotes={recentQuotes} max={max} />
      </div>

      {/* Auto-book */}
      <div className="flex items-start justify-between gap-6 border-t border-rule px-6 py-5 sm:px-7">
        <div className="max-w-[640px]">
          <div className="text-[16px] font-semibold text-fg">Auto-book the winner</div>
          <p id="autobook-help" className="mt-1 text-[14px] leading-relaxed text-muted">
            {autoBook
              ? `When Claude's pick is ${usd(limit ?? 0)} or less, PortCall books it and puts the hold on your card right away.`
              : "You click Book on every container. Agents on your MCP key can still book under the limit."}
          </p>
        </div>
        <Switch checked={autoBook} onChange={edit(setAutoBook)} label="Auto-book the winner" describedBy="autobook-help" />
      </div>

      {/* Auto-quote */}
      <div className="border-t border-rule px-6 py-5 sm:px-7">
        <div className="flex items-start justify-between gap-6">
          <div className="max-w-[640px]">
            <div className="text-[16px] font-semibold text-fg">Auto-quote before arrival</div>
            <p id="autoquote-help" className="mt-1 text-[14px] leading-relaxed text-muted">
              PortCall starts calling carriers on its own once a container is this close to its ETA. It checks every minute.
            </p>
          </div>
          <Switch checked={autoQuote} onChange={edit(setAutoQuote)} label="Auto-quote before arrival" describedBy="autoquote-help" />
        </div>
        <div className={`mt-4 flex items-center gap-3 transition-opacity ${autoQuote ? "" : "opacity-50"}`}>
          <Stepper value={days} min={1} max={14} disabled={!autoQuote} onChange={edit(setDays)} label="Days before ETA" />
          <span className="text-[14.5px] text-muted">{days === 1 ? "day" : "days"} before ETA</span>
        </div>
        {autoQuote && mode === "live" && (
          <p className="mt-4 flex items-start gap-2.5 rounded-[10px] bg-canary px-3.5 py-2.5 text-[13.5px] leading-snug text-fg">
            <AlertIcon className="mt-px h-4 w-4 shrink-0 text-crane" />
            Calls are live. Auto-quote will ring your carriers&apos; phones without anyone clicking.
          </p>
        )}
      </div>

      {/* Save bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-panel-2 px-6 py-3.5 sm:px-7">
        <p aria-live="polite" className="text-[13.5px]">
          {status ? (
            status.ok ? (
              <span className="inline-flex items-center gap-1.5 font-semibold text-live">
                <CheckIcon className="h-3.5 w-3.5" />
                Saved. Agents follow the new rules from their next booking.
              </span>
            ) : (
              <span className="font-semibold text-red">{status.text}</span>
            )
          ) : dirty ? (
            <span className="inline-flex items-center gap-2 font-semibold text-fg">
              <span className="h-1.5 w-1.5 rounded-full bg-crane" aria-hidden />
              Unsaved changes
            </span>
          ) : (
            <span className="text-muted">Applies to auto-book and every agent on your MCP key.</span>
          )}
        </p>
        <div className="flex items-center gap-2">
          {dirty && (
            <button type="button" onClick={discard} className="btn-ghost h-10 px-4 py-0 text-[14px]">
              Discard
            </button>
          )}
          <button type="submit" className="btn-sodium h-10 px-5 py-0 text-[14px]" disabled={!dirty || limit == null || pending}>
            {pending ? "Saving..." : "Save changes"}
          </button>
        </div>
      </div>
    </form>
  );
}
