"use client";

import { useState, useTransition } from "react";
import { saveProviderPhone } from "@/app/settings/actions";
import type { CallMode } from "@/lib/env";
import type { Provider } from "@/lib/types";
import { pillButton } from "./controls";
import { ArrowRightIcon, PhoneIcon } from "./icons";

export type ProviderRow = Provider & { placeholder: boolean };

/** "+18435550141" -> "(843) 555-0141". Numbers outside the US stay in E.164. */
function formatPhone(phone: string): string {
  const m = phone.match(/^\+1(\d{3})(\d{3})(\d{4})$/);
  return m ? `(${m[1]}) ${m[2]}-${m[3]}` : phone;
}

function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join("")
    .toUpperCase();
}

function Payouts({ provider }: { provider: Provider }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (provider.stripe_onboarded) {
    return (
      <span className="inline-flex items-center gap-2 text-[13.5px] font-semibold text-live">
        <span className="h-2 w-2 rounded-full bg-live" aria-hidden />
        Payouts on
      </span>
    );
  }
  return (
    <div className="md:text-right">
      <button
        type="button"
        className={pillButton}
        disabled={pending}
        onClick={async () => {
          setPending(true);
          setError(null);
          const res = await fetch("/api/stripe/connect", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ providerId: provider.id }),
          });
          const body = await res.json().catch(() => ({}));
          if (res.ok && body.url) window.location.href = body.url;
          else {
            setError(body.error ?? `Could not open Stripe (${res.status})`);
            setPending(false);
          }
        }}
      >
        {pending ? "Opening Stripe..." : provider.stripe_account_id ? "Finish Stripe setup" : "Invite to Stripe"}
      </button>
      {error && <p className="mt-1.5 max-w-[240px] text-[12.5px] text-red">{error}</p>}
    </div>
  );
}

function Row({ provider: p, mode }: { provider: ProviderRow; mode: CallMode }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [justSaved, setJustSaved] = useState(false);
  const [pending, start] = useTransition();

  const cancel = () => {
    setEditing(false);
    setError(null);
  };
  const save = () =>
    start(async () => {
      const r = await saveProviderPhone(p.id, draft);
      if (!r.ok) return setError(r.message);
      setEditing(false);
      setError(null);
      setJustSaved(true);
      setTimeout(() => setJustSaved(false), 2500);
    });

  const lanes = `${(p.ports ?? []).join(", ")}`;
  const states = (p.service_states ?? []).join(", ");

  return (
    <li className="grid gap-4 p-5 sm:px-7 sm:py-6 md:grid-cols-[minmax(0,1fr)_210px_140px] md:items-center md:gap-5">
      <div className="flex min-w-0 items-start gap-4">
        <span
          aria-hidden
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px] border border-rule bg-panel-2 font-cond text-[16px] font-bold text-fg"
        >
          {initials(p.name)}
        </span>
        <div className="min-w-0">
          <div className="text-[16px] font-semibold text-fg">{p.name}</div>
          <div className="mt-0.5 truncate text-[13.5px] text-muted">{[p.contact_name, p.email].filter(Boolean).join(" · ")}</div>
          <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[12.5px]">
            <span className="rounded-full border border-rule bg-panel-2 px-2 py-0.5 font-semibold text-fg">{lanes || "No port"}</span>
            <ArrowRightIcon className="h-3 w-3 text-dim" />
            <span className="font-medium text-muted">{states || "No states"}</span>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 md:justify-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-[15px] font-semibold tabular-nums text-fg">
            <PhoneIcon className="h-3.5 w-3.5 shrink-0 text-muted" />
            {formatPhone(p.phone)}
          </div>
          {justSaved ? (
            <div className="mt-0.5 text-[12.5px] font-semibold text-live">Number saved</div>
          ) : (
            p.placeholder &&
            mode === "live" && <div className="mt-0.5 text-[12.5px] font-semibold text-crane">Placeholder, skipped on live calls</div>
          )}
        </div>
        {!editing && (
          <button
            type="button"
            className={pillButton}
            onClick={() => {
              setDraft(formatPhone(p.phone));
              setEditing(true);
            }}
            aria-label={`Edit phone for ${p.name}`}
          >
            Edit
          </button>
        )}
      </div>

      <div className="md:flex md:justify-end">
        <Payouts provider={p} />
      </div>

      {editing && (
        <div className="rounded-[12px] border border-rule bg-panel-2 p-4 md:col-span-3">
          <label htmlFor={`phone-${p.id}`} className="text-[13.5px] font-semibold text-fg">
            Phone for {p.name}
          </label>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              id={`phone-${p.id}`}
              autoFocus
              type="tel"
              autoComplete="off"
              value={draft}
              aria-invalid={Boolean(error)}
              aria-describedby={`phone-help-${p.id}`}
              onChange={(e) => {
                setDraft(e.target.value);
                setError(null);
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  save();
                }
                if (e.key === "Escape") cancel();
              }}
              className="h-10 w-[200px] rounded-[10px] border border-rule bg-sheet px-3 text-[15px] font-semibold tabular-nums text-fg outline-none transition-[border-color,box-shadow] focus:border-fg focus:shadow-[0_0_0_4px_rgb(var(--text-rgb)/0.07)] aria-[invalid=true]:border-red"
            />
            <button type="button" className="btn-sodium h-10 px-5 py-0 text-[14px]" onClick={save} disabled={pending || !draft.trim()}>
              {pending ? "Saving..." : "Save"}
            </button>
            <button type="button" className="btn-ghost h-10 px-4 py-0 text-[14px]" onClick={cancel}>
              Cancel
            </button>
          </div>
          <p id={`phone-help-${p.id}`} className={`mt-2 text-[12.5px] ${error ? "font-semibold text-red" : "text-muted"}`}>
            {error ?? `PortCall dials this number when ${p.name} is on the lane. US numbers can skip the +1.`}
          </p>
        </div>
      )}
    </li>
  );
}

/** The importer's own drayage carriers: who gets called, at what number, and whether Stripe can pay them. */
export function ProvidersList({ providers, mode }: { providers: ProviderRow[]; mode: CallMode }) {
  if (!providers.length) {
    return <div className="panel p-6 text-[15px] text-muted sm:p-7">No carriers yet. Add your drayage providers to start getting quotes.</div>;
  }
  return (
    <ul className="panel divide-y divide-rule overflow-hidden">
      {providers.map((p) => (
        <Row key={p.id} provider={p} mode={mode} />
      ))}
    </ul>
  );
}
