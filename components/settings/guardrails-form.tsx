"use client";

import { useState, useTransition } from "react";
import { saveGuardrails } from "@/app/settings/actions";

type Values = { auto_book_enabled: boolean; auto_book_limit_usd: number; auto_quote_enabled: boolean; auto_quote_days_before_eta: number };

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full border transition-colors ${checked ? "border-fg bg-fg" : "border-rule bg-panel-2"}`}
    >
      <span className={`absolute top-0.5 h-[18px] w-[18px] rounded-full transition-all ${checked ? "left-[22px] bg-white" : "left-0.5 bg-dim"}`} />
    </button>
  );
}

export function GuardrailsForm({ initial }: { initial: Values }) {
  const [v, setV] = useState(initial);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  return (
    <form
      className="panel space-y-6 p-6"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveGuardrails(v);
          setMsg({ ok: r.ok, text: r.message });
        });
      }}
    >
      <div className="flex items-start justify-between gap-6">
        <div>
          <div className="font-medium">Auto-book the winner</div>
          <p className="mt-1 text-sm text-muted">When Claude&apos;s pick is under the limit, book and authorize it without waiting.</p>
        </div>
        <Toggle checked={v.auto_book_enabled} onChange={(x) => setV({ ...v, auto_book_enabled: x })} label="Auto-book the winner" />
      </div>
      <label className="block">
        <span className="tick-label">Spending limit for agents and auto-book (USD)</span>
        <input
          type="number"
          min={0}
          step={50}
          value={v.auto_book_limit_usd}
          onChange={(e) => setV({ ...v, auto_book_limit_usd: Number(e.target.value) })}
          className="mt-1.5 w-48 rounded-[10px] border border-rule bg-sheet px-3 py-2 font-mono text-[15px] text-fg outline-none focus:border-stamp"
        />
      </label>
      <div className="flex items-start justify-between gap-6 border-t border-line pt-6">
        <div>
          <div className="font-medium">Auto-quote before arrival</div>
          <p className="mt-1 text-sm text-muted">pg_cron checks every minute and calls carriers for boxes this close to their ETA.</p>
        </div>
        <Toggle checked={v.auto_quote_enabled} onChange={(x) => setV({ ...v, auto_quote_enabled: x })} label="Auto-quote before arrival" />
      </div>
      <label className="block">
        <span className="tick-label">Days before ETA</span>
        <input
          type="number"
          min={1}
          max={14}
          value={v.auto_quote_days_before_eta}
          onChange={(e) => setV({ ...v, auto_quote_days_before_eta: Number(e.target.value) })}
          className="mt-1.5 w-24 rounded-[10px] border border-rule bg-sheet px-3 py-2 font-mono text-[15px] text-fg outline-none focus:border-stamp"
        />
      </label>
      <div className="flex items-center gap-4">
        <button type="submit" className="btn-sodium" disabled={pending}>
          {pending ? "Saving..." : "Save guardrails"}
        </button>
        {msg && <span className={`text-[14px] font-semibold ${msg.ok ? "text-live" : "text-red"}`}>{msg.text}</span>}
      </div>
    </form>
  );
}
