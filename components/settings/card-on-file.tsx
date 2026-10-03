"use client";

import { useState } from "react";
import { CardIcon } from "./icons";

export type CardDetails = { brand: string; last4: string; expMonth: number; expYear: number };

const BRAND_NAMES: Record<string, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  discover: "Discover",
  diners: "Diners Club",
  jcb: "JCB",
  unionpay: "UnionPay",
};

function BrandMark({ brand }: { brand: string | null }) {
  const box = "flex h-10 w-[60px] shrink-0 items-center justify-center rounded-[8px]";
  if (brand === "visa") {
    return (
      <span className={`${box} bg-[#1a1f71] text-[15px] font-extrabold italic tracking-[-0.02em] text-white`} aria-hidden>
        VISA
      </span>
    );
  }
  if (brand === "mastercard") {
    return (
      <span className={`${box} bg-[#1d1d1f]`} aria-hidden>
        <span className="h-[18px] w-[18px] rounded-full bg-[#eb001b]" />
        <span className="-ml-[7px] h-[18px] w-[18px] rounded-full bg-[#f79e1b]/90" />
      </span>
    );
  }
  if (brand === "amex") {
    return (
      <span className={`${box} bg-[#2e77bc] text-[11px] font-extrabold tracking-[0.04em] text-white`} aria-hidden>
        AMEX
      </span>
    );
  }
  return (
    <span className={`${box} border border-rule bg-panel-2 text-muted`} aria-hidden>
      <CardIcon className="h-5 w-5" />
    </span>
  );
}

/** The importer's saved card. Bookings authorize it; delivery captures it. */
export function CardOnFile({ hasCard, card }: { hasCard: boolean; card: CardDetails | null }) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openCheckout() {
    setPending(true);
    setError(null);
    const res = await fetch("/api/stripe/setup", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (res.ok && body.url) window.location.href = body.url;
    else {
      setError(body.error ?? `Could not open Stripe (${res.status})`);
      setPending(false);
    }
  }

  const title = !hasCard ? "No card yet" : card ? `${BRAND_NAMES[card.brand] ?? card.brand} ending in ${card.last4}` : "Card on file";
  const detail = !hasCard
    ? "Add one so bookings can place their hold."
    : card
      ? `Expires ${String(card.expMonth).padStart(2, "0")}/${card.expYear}`
      : "Saved with Stripe";

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-5 p-6 sm:p-7">
        <div className="flex min-w-0 items-center gap-4">
          <BrandMark brand={hasCard ? (card?.brand ?? null) : null} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-[16px] font-semibold text-fg">{title}</span>
              {hasCard && <span className="rounded-full border border-rule bg-panel-2 px-2 py-px text-[11.5px] font-semibold text-muted">Default</span>}
            </div>
            <div className="mt-0.5 text-[14px] text-muted">{detail}</div>
          </div>
        </div>
        <button
          type="button"
          className={hasCard ? "btn-ghost h-10 px-4 py-0 text-[14px]" : "btn-sodium h-10 px-5 py-0 text-[14px]"}
          onClick={openCheckout}
          disabled={pending}
        >
          {pending ? "Opening Stripe..." : hasCard ? "Replace card" : "Add a card"}
        </button>
      </div>
      {error && <p className="-mt-2 px-6 pb-5 text-[13.5px] font-semibold text-red sm:px-7">{error}</p>}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-rule bg-panel-2 px-6 py-3.5 text-[13.5px] text-muted sm:px-7">
        <span className="rounded-full bg-canary px-2 py-0.5 text-[11.5px] font-semibold text-fg">Test mode</span>
        <span>
          Use <span className="font-semibold tabular-nums text-fg">4242 4242 4242 4242</span>, any future date and any CVC. Other test cards can decline.
        </span>
      </div>
    </div>
  );
}
