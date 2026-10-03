"use client";

import { useState } from "react";

export function CardOnFile({ customerId, paymentMethodId }: { customerId: string | null; paymentMethodId: string | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function addCard() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/stripe/setup", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.url) window.location.href = body.url;
    else {
      setError(body.error ?? `Could not start Stripe Checkout (${res.status})`);
      setPending(false);
    }
  }
  return (
    <div className="panel rounded-[4px] p-6">
      {paymentMethodId ? (
        <div className="flex items-center justify-between gap-4">
          <div>
            <div className="font-medium">Card on file</div>
            <div className="mt-1 font-mono text-xs text-muted">
              {paymentMethodId.slice(0, 8)}...{paymentMethodId.slice(-4)} on {customerId}
            </div>
          </div>
          <span className="rounded-[2px] bg-[#635BFF] px-1.5 py-px font-mono text-[10px] font-semibold text-white">stripe test</span>
        </div>
      ) : (
        <p className="text-sm text-muted">No card yet. Bookings need one to authorize.</p>
      )}
      <button type="button" className="btn-ghost mt-5" onClick={addCard} disabled={pending}>
        {pending ? "Opening Stripe..." : paymentMethodId ? "Replace card" : "Add a card"}
      </button>
      {error && <p className="mt-3 font-mono text-xs text-alarm">{error}</p>}
    </div>
  );
}
