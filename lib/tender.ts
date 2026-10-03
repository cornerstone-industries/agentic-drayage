// The provider's side of a tender: view it, accept or decline, then mark picked up and delivered.
// The token in the URL is the only credential. Declining cancels the card hold; Delivered captures it.
// Every transition is a compare-and-swap, so a double tap (or the Stripe webhook racing us) never
// logs an event twice and a repeated action is a harmless no-op.
import Stripe from "stripe";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/events";
import { getStripe, stripeMessage } from "@/lib/stripe";
import type { Booking, Container, Provider, Quote } from "@/lib/types";

export class TenderError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "TenderError";
    this.status = status;
  }
}

export type TenderAction = "accept" | "decline" | "picked_up" | "delivered";
export type TenderStage = "awaiting_response" | "accepted" | "picked_up" | "delivered" | "declined";

/** What the public tender page may see. Stripe ids and the token itself are deliberately left out. */
export type TenderView = {
  stage: TenderStage;
  booking: Omit<Booking, "stripe_payment_intent_id" | "tender_token">;
  container: Container;
  provider: Pick<Provider, "id" | "name" | "contact_name">;
  quote: Quote;
  importerName: string;
};

export type TenderResult = { action: TenderAction; changed: boolean; view: TenderView };

type Loaded = { booking: Booking; container: Container; provider: Provider; quote: Quote; importerName: string };

const SELECT = "*, provider:providers(*), quote:quotes(*), container:containers(*, importer:importers(name))";

async function load(db: AdminClient, token: string): Promise<Loaded | null> {
  const { data, error } = await db.from("bookings").select(SELECT).eq("tender_token", token).maybeSingle();
  if (error) throw new Error(`tender lookup failed: ${error.message}`);
  if (!data?.provider || !data.quote || !data.container) return null;
  const { provider, quote, container, ...booking } = data;
  const { importer, ...box } = container;
  return { booking, container: box, provider, quote, importerName: importer?.name ?? "" };
}

function stageOf(booking: Booking, container: Container): TenderStage {
  if (booking.tender_status === "declined") return "declined";
  if (booking.tender_status !== "accepted") return "awaiting_response";
  if (container.status === "picked_up") return "picked_up";
  if (container.status === "delivered") return "delivered";
  return "accepted";
}

function toView(l: Loaded): TenderView {
  const b = l.booking;
  return {
    stage: stageOf(b, l.container),
    booking: {
      id: b.id,
      container_id: b.container_id,
      quote_id: b.quote_id,
      provider_id: b.provider_id,
      amount_cents: b.amount_cents,
      platform_fee_cents: b.platform_fee_cents,
      payment_status: b.payment_status,
      tender_status: b.tender_status,
      booked_by: b.booked_by,
      created_at: b.created_at,
      accepted_at: b.accepted_at,
    },
    container: l.container,
    provider: { id: l.provider.id, name: l.provider.name, contact_name: l.provider.contact_name },
    quote: l.quote,
    importerName: l.importerName,
  };
}

export async function getTenderView(token: string): Promise<TenderView | null> {
  const l = await load(createAdminClient(), token);
  return l ? toView(l) : null;
}

const who = (l: Loaded) => ({ booking_id: l.booking.id, provider_id: l.provider.id, provider_name: l.provider.name });

async function must(op: PromiseLike<{ error: { message: string } | null }>, label: string): Promise<void> {
  const { error } = await op;
  if (error) throw new Error(`${label} failed: ${error.message}`);
}

const isUnexpectedState = (err: unknown) => err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "payment_intent_unexpected_state";

/** Releases the card hold. Already canceled counts as done. */
async function cancelHold(paymentIntentId: string, bookingId: string): Promise<void> {
  const stripe = getStripe();
  try {
    await stripe.paymentIntents.cancel(paymentIntentId, undefined, { idempotencyKey: `cancel_${bookingId}` });
  } catch (err) {
    if (isUnexpectedState(err)) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status === "canceled") return;
      throw new TenderError(409, `The payment is ${pi.status} and its hold cannot be canceled`);
    }
    throw new TenderError(502, `Stripe could not cancel the payment hold: ${stripeMessage(err)}`);
  }
}

/** Captures the held payment. Already captured counts as done; an expired hold is a clear error. */
async function captureHold(paymentIntentId: string, bookingId: string): Promise<void> {
  const stripe = getStripe();
  try {
    await stripe.paymentIntents.capture(paymentIntentId, undefined, { idempotencyKey: `capture_${bookingId}` });
  } catch (err) {
    if (isUnexpectedState(err)) {
      const pi = await stripe.paymentIntents.retrieve(paymentIntentId);
      if (pi.status === "succeeded") return;
      throw new TenderError(
        409,
        pi.status === "canceled"
          ? "The payment hold was canceled or has expired, so it cannot be captured: ask the importer to rebook"
          : `The payment is ${pi.status} and cannot be captured`,
      );
    }
    throw new TenderError(502, `Stripe could not capture the payment: ${stripeMessage(err)}`);
  }
}

async function accept(db: AdminClient, l: Loaded): Promise<boolean> {
  const { booking, container } = l;
  if (booking.tender_status === "accepted") return false;
  if (booking.tender_status === "declined") throw new TenderError(409, "This tender was declined, so it can no longer be accepted");
  const { data: won, error } = await db
    .from("bookings")
    .update({ tender_status: "accepted", accepted_at: new Date().toISOString() })
    .eq("id", booking.id)
    .eq("tender_status", "sent")
    .select("id");
  if (error) throw new Error(`booking update failed: ${error.message}`);
  if (!won?.length) return false;
  await must(db.from("containers").update({ status: "accepted" }).eq("id", container.id), "container update");
  await logEvent(db, container.id, "accepted", { ...who(l), amount_cents: booking.amount_cents });
  return true;
}

async function decline(db: AdminClient, l: Loaded): Promise<boolean> {
  const { booking, container } = l;
  if (booking.tender_status === "accepted") throw new TenderError(409, "This tender was already accepted: contact the importer to cancel it");

  // Claim the decline first: if Accept won the race, the hold must stay on the card.
  let changed = false;
  if (booking.tender_status !== "declined") {
    const { data: declined, error } = await db.from("bookings").update({ tender_status: "declined" }).eq("id", booking.id).eq("tender_status", "sent").select("id");
    if (error) throw new Error(`booking update failed: ${error.message}`);
    if (!declined?.length) return false;
    changed = true;
    // The importer can book the next-ranked quote from the same recommendation.
    await must(db.from("containers").update({ status: "quoted" }).eq("id", container.id), "container update");
    await logEvent(db, container.id, "declined", who(l));
  }

  // Release the hold. A repeat Decline retries this if Stripe failed the first time.
  const piId = booking.stripe_payment_intent_id;
  if (piId && booking.payment_status === "authorized") {
    await cancelHold(piId, booking.id);
    const { data: released } = await db.from("bookings").update({ payment_status: "canceled" }).eq("id", booking.id).eq("payment_status", "authorized").select("id");
    if (released?.length) {
      await logEvent(db, container.id, "payment_canceled", { ...who(l), amount_cents: booking.amount_cents, payment_intent_id: piId, reason: "tender_declined" });
    }
  }
  return changed;
}

async function pickedUp(db: AdminClient, l: Loaded): Promise<boolean> {
  const { booking, container } = l;
  if (booking.tender_status === "declined") throw new TenderError(409, "This tender was declined");
  if (booking.tender_status !== "accepted") throw new TenderError(409, "Accept the tender before marking the load picked up");
  if (container.status === "picked_up") return false;
  if (container.status === "delivered") throw new TenderError(409, "This load is already delivered");
  if (container.status !== "accepted") throw new TenderError(409, `The container is ${container.status}, so it cannot be marked picked up`);
  // A trucker cannot pull a box that is still on the ship.
  if (container.eta && Date.parse(container.eta) > Date.now()) {
    const when = new Date(container.eta).toLocaleString("en-US", { weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" });
    throw new TenderError(409, `This container is not off the ship yet. It discharges ${when} ET; mark it picked up after that.`);
  }
  const { data: won, error } = await db.from("containers").update({ status: "picked_up" }).eq("id", container.id).eq("status", "accepted").select("id");
  if (error) throw new Error(`container update failed: ${error.message}`);
  if (!won?.length) return false;
  await logEvent(db, container.id, "picked_up", who(l));
  return true;
}

async function delivered(db: AdminClient, l: Loaded): Promise<boolean> {
  const { booking, container } = l;
  if (booking.tender_status === "declined") throw new TenderError(409, "This tender was declined");
  if (booking.tender_status !== "accepted") throw new TenderError(409, "Accept the tender before marking the load delivered");
  if (container.status === "delivered") return false;
  if (container.status === "accepted") throw new TenderError(409, "Mark the load Picked up before Delivered");
  if (container.status !== "picked_up") throw new TenderError(409, `The container is ${container.status}, so it cannot be marked delivered`);
  const piId = booking.stripe_payment_intent_id;
  if (!piId) throw new TenderError(409, "This booking has no payment on file to capture");

  await captureHold(piId, booking.id);

  // Two independent swaps: whoever flips each one logs its event (the Stripe webhook may beat us to the payment).
  const { data: moved, error } = await db.from("containers").update({ status: "delivered" }).eq("id", container.id).eq("status", "picked_up").select("id");
  if (error) throw new Error(`container update failed: ${error.message}`);
  if (moved?.length) await logEvent(db, container.id, "delivered", who(l));

  const { data: paid, error: payErr } = await db.from("bookings").update({ payment_status: "captured" }).eq("id", booking.id).eq("payment_status", "authorized").select("id");
  if (payErr) throw new Error(`booking update failed: ${payErr.message}`);
  if (paid?.length) {
    await logEvent(db, container.id, "payment_captured", {
      ...who(l),
      amount_cents: booking.amount_cents,
      platform_fee_cents: booking.platform_fee_cents,
      payment_intent_id: piId,
    });
  }
  return Boolean(moved?.length || paid?.length);
}

export async function tenderAction(token: string, action: TenderAction): Promise<TenderResult> {
  const db = createAdminClient();
  const l = await load(db, token);
  if (!l) throw new TenderError(404, "Tender not found");

  let changed: boolean;
  switch (action) {
    case "accept":
      changed = await accept(db, l);
      break;
    case "decline":
      changed = await decline(db, l);
      break;
    case "picked_up":
      changed = await pickedUp(db, l);
      break;
    case "delivered":
      changed = await delivered(db, l);
      break;
  }
  const fresh = (await load(db, token)) ?? l;
  return { action, changed, view: toView(fresh) };
}
