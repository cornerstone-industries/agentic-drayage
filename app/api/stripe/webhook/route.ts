import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { requireEnv } from "@/lib/env";
import { logEvent, type EventType } from "@/lib/events";
import { getStripe, isStripeConfigError, saveDefaultCard, syncProviderOnboarding } from "@/lib/stripe";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";

// Stripe signs the raw body, so nothing here may touch it before verification.
export const maxDuration = 30;

type PaymentStatus = "authorized" | "captured" | "canceled" | "failed";

// PaymentIntent events mirrored onto bookings.payment_status (the AUTHORIZED / PAID stamps stream from it).
const MIRRORED: Record<string, { status: PaymentStatus; event: EventType }> = {
  "payment_intent.amount_capturable_updated": { status: "authorized", event: "payment_authorized" },
  "payment_intent.succeeded": { status: "captured", event: "payment_captured" },
  "payment_intent.canceled": { status: "canceled", event: "payment_canceled" },
  "payment_intent.payment_failed": { status: "failed", event: "payment_failed" },
};

/**
 * One endpoint, up to two signing secrets: a platform endpoint and a Connect endpoint (account.updated
 * from connected accounts) each get their own whsec_. STRIPE_WEBHOOK_SECRET may list both, comma separated.
 */
function constructEvent(stripe: Stripe, body: string, signature: string, secrets: string): Stripe.Event {
  let last: unknown;
  for (const secret of secrets.split(",").map((s) => s.trim()).filter(Boolean)) {
    try {
      return stripe.webhooks.constructEvent(body, signature, secret);
    } catch (err) {
      last = err;
    }
  }
  throw last ?? new Error("No webhook secret configured");
}

async function mirrorPayment(db: AdminClient, pi: Stripe.PaymentIntent, status: PaymentStatus, event: EventType): Promise<void> {
  const { data: booking, error } = await db.from("bookings").select("*").eq("stripe_payment_intent_id", pi.id).maybeSingle();
  if (error) throw new Error(`booking lookup failed: ${error.message}`);
  // No row yet means the event beat lib/book's insert, which writes "authorized" itself.
  if (!booking) return;

  const current = booking.payment_status;
  if (current === status) return;
  // captured and canceled are final: a late or out-of-order event never reopens them.
  if (current === "captured" || current === "canceled") return;

  // Compare-and-swap, so a concurrent change from lib/tender wins exactly once and logs its own event.
  const update = db.from("bookings").update({ payment_status: status }).eq("id", booking.id);
  const { data: won, error: upErr } = await (current ? update.eq("payment_status", current) : update).select("id");
  if (upErr) throw new Error(`booking update failed: ${upErr.message}`);
  if (!won?.length || !booking.container_id) return;

  await logEvent(db, booking.container_id, event, {
    booking_id: booking.id,
    payment_intent_id: pi.id,
    amount_cents: booking.amount_cents,
    source: "stripe_webhook",
    ...(status === "failed" ? { error: pi.last_payment_error?.message ?? null } : {}),
    ...(status === "canceled" ? { reason: pi.cancellation_reason ?? null } : {}),
  });
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");
  if (!signature) return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  const body = await req.text();

  let event: Stripe.Event;
  let stripe: Stripe;
  try {
    const { STRIPE_WEBHOOK_SECRET } = requireEnv("Stripe webhook", ["STRIPE_WEBHOOK_SECRET"]);
    stripe = getStripe();
    event = constructEvent(stripe, body, signature, STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    if (isStripeConfigError(err)) return NextResponse.json({ error: err.message }, { status: 503 });
    return NextResponse.json({ error: "Invalid signature" }, { status: 400 });
  }

  try {
    const db = createAdminClient();
    const mirrored = MIRRORED[event.type];
    if (mirrored) {
      await mirrorPayment(db, event.data.object as Stripe.PaymentIntent, mirrored.status, mirrored.event);
    } else if (event.type === "checkout.session.completed") {
      const cs = event.data.object as Stripe.Checkout.Session;
      if (cs.mode === "setup") {
        const customerId = typeof cs.customer === "string" ? cs.customer : cs.customer?.id;
        const setupIntentId = typeof cs.setup_intent === "string" ? cs.setup_intent : cs.setup_intent?.id;
        if (customerId && setupIntentId) await saveDefaultCard(db, stripe, { customerId, setupIntentId });
      }
    } else if (event.type === "account.updated") {
      // Arrives on the Connect endpoint (event.account is the connected account).
      await syncProviderOnboarding(db, event.data.object as Stripe.Account);
    }
    return NextResponse.json({ received: true });
  } catch (err) {
    // Non-2xx makes Stripe retry, which is what we want for a transient database or Stripe failure.
    console.error(`[stripe webhook] ${event.type}`, err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Webhook handler failed" }, { status: 500 });
  }
}
