"use client";

import { useState, useTransition } from "react";
import { saveProviderPhone } from "@/app/settings/actions";
import type { Provider } from "@/lib/types";

function PhoneField({ provider }: { provider: Provider }) {
  const [phone, setPhone] = useState(provider.phone);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = phone !== provider.phone;
  return (
    <div className="flex flex-wrap items-center gap-2">
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        aria-label={`Phone for ${provider.name}`}
        className="w-40 rounded-[10px] border border-rule bg-sheet px-2.5 py-1.5 font-mono text-[13px] text-fg outline-none focus:border-stamp"
      />
      {dirty && (
        <button
          type="button"
          className="font-mono text-xs text-stamp hover:underline"
          disabled={pending}
          onClick={() => start(async () => {
            const r = await saveProviderPhone(provider.id, phone);
            setMsg({ ok: r.ok, text: r.message });
          })}
        >
          {pending ? "Saving" : "Save"}
        </button>
      )}
      {msg && <span className={`font-mono text-[11px] ${msg.ok ? "text-signal" : "text-alarm"}`}>{msg.text}</span>}
    </div>
  );
}

function StripeCell({ provider }: { provider: Provider }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (provider.stripe_onboarded) return <span className="font-mono text-xs text-signal">Payouts on</span>;
  return (
    <div>
      <button
        type="button"
        className="font-mono text-xs text-stamp hover:underline disabled:opacity-50"
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
            setError(body.error ?? `Failed (${res.status})`);
            setPending(false);
          }
        }}
      >
        {pending ? "Opening Stripe..." : provider.stripe_account_id ? "Finish Stripe onboarding" : "Invite to Stripe"}
      </button>
      {error && <p className="mt-1 max-w-[220px] font-mono text-[11px] text-alarm">{error}</p>}
    </div>
  );
}

export function ProvidersTable({ providers }: { providers: Provider[] }) {
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[640px] text-left">
        <thead>
          <tr className="border-b border-line">
            {["Provider", "Phone", "Lanes", "Payouts"].map((h) => (
              <th key={h} className="px-4 py-2.5 text-[12.5px] font-semibold text-muted">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {providers.map((p) => (
            <tr key={p.id} className="border-b border-line/60 last:border-0">
              <td className="px-4 py-3">
                <div className="font-medium">{p.name}</div>
                <div className="text-[12.5px] text-muted">
                  {p.contact_name}, {p.email}
                </div>
              </td>
              <td className="px-4 py-3">
                <PhoneField provider={p} />
              </td>
              <td className="px-4 py-3 text-[13px] text-muted">
                {(p.ports ?? []).join(", ")} to {(p.service_states ?? []).join(", ")}
              </td>
              <td className="px-4 py-3">
                <StripeCell provider={p} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
