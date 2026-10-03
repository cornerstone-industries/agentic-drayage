// Booking: authorize the importer's card with the payout routed to the provider's Connect account,
// then tender the load. Shared by the Book button, auto-book (lib/pipeline.ts) and the MCP book_quote tool.
import { createHmac } from "node:crypto";
import Stripe from "stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import { platformFeeBps, requireEnv } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { formatContainerNumber, platformFeeCents } from "@/lib/money";
import { accountIsOnboarded, getStripe, isMissingResource, stripeMessage, syncProviderOnboarding } from "@/lib/stripe";
import { sendTenderEmail, usd } from "@/lib/tender-email";
import type { BookedBy, Booking } from "@/lib/types";

export type BookingErrorCode =
  | "needs_human_approval"
  | "not_found"
  | "already_booked"
  | "no_payment_method"
  | "provider_not_onboarded"
  | "stripe_failed";

export class BookingError extends Error {
  readonly code: BookingErrorCode;
  readonly status: number;
  constructor(code: BookingErrorCode, message: string, status: number) {
    super(message);
    this.name = "BookingError";
    this.code = code;
    this.status = status;
  }
}

export type BookQuoteResult = { booking: Booking; paymentIntentStatus: string; alreadyBooked: boolean };

/**
 * The tender token for a PaymentIntent. Derived (HMAC, so still unguessable) rather than random: two
 * simultaneous bookings share one PaymentIntent via the idempotency key, hence the same token, and the
 * unique tender_token column makes exactly one insert win.
 */
function tenderTokenFor(paymentIntentId: string): string {
  const { STRIPE_SECRET_KEY } = requireEnv("Stripe", ["STRIPE_SECRET_KEY"]);
  return createHmac("sha256", STRIPE_SECRET_KEY).update(`tender:${paymentIntentId}`).digest("hex").slice(0, 32);
}

/** Maps a failed PaymentIntent create onto the booking error the caller (and an agent) can act on. */
function classifyStripeFailure(err: unknown): BookingError {
  const message = stripeMessage(err);
  if (err instanceof Stripe.errors.StripeInvalidRequestError) {
    if (err.param === "customer" || err.param === "payment_method") {
      return new BookingError("no_payment_method", "The saved card is no longer valid at Stripe. Add a card in Settings first", 422);
    }
    if (err.code === "insufficient_capabilities_for_transfer" || err.param?.startsWith("transfer_data")) {
      return new BookingError("provider_not_onboarded", message, 422);
    }
  }
  return new BookingError("stripe_failed", message, err instanceof Stripe.errors.StripeCardError ? 402 : 502);
}

export async function bookQuote(args: { quoteId: string; importerId: string; bookedBy: BookedBy }): Promise<BookQuoteResult> {
  const db = createAdminClient();

  // 1. Load everything, scoped to this importer.
  const { data: quote, error: quoteErr } = await db
    .from("quotes")
    .select("*, provider:providers(*), container:containers(*)")
    .eq("id", args.quoteId)
    .maybeSingle();
  if (quoteErr) throw new Error(`quote lookup failed: ${quoteErr.message}`);
  const container = quote?.container;
  const provider = quote?.provider;
  if (!quote || !container || !provider || container.importer_id !== args.importerId || provider.importer_id !== args.importerId) {
    throw new BookingError("not_found", "Quote not found for this importer", 404);
  }
  const { data: importer, error: impErr } = await db.from("importers").select("*").eq("id", args.importerId).maybeSingle();
  if (impErr) throw new Error(`importer lookup failed: ${impErr.message}`);
  if (!importer) throw new BookingError("not_found", "Importer not found", 404);

  const box = formatContainerNumber(container.container_number);
  const amount = quote.all_in_cents;
  if (amount == null) throw new BookingError("not_found", `${provider.name} has not given a price for ${box} yet: nothing to book`, 404);

  // 2. Guardrail, before any Stripe call: only a human may book above the auto-book limit.
  if (args.bookedBy !== "human") {
    if (amount > importer.auto_book_limit_cents) {
      throw new BookingError("needs_human_approval", `Quote ${usd(amount)} exceeds the ${usd(importer.auto_book_limit_cents)} auto-book limit: needs human approval`, 403);
    }
    if (args.bookedBy === "auto" && !importer.auto_book_enabled) {
      throw new BookingError("needs_human_approval", "Auto-book is turned off: needs human approval", 403);
    }
  }

  // 3. Idempotent per container: a live booking for this quote is returned, one for another quote is a conflict.
  const { data: live, error: liveErr } = await db
    .from("bookings")
    .select("*")
    .eq("container_id", container.id)
    .in("payment_status", ["authorized", "captured"])
    .order("created_at", { ascending: false });
  if (liveErr) throw new Error(`booking lookup failed: ${liveErr.message}`);
  if (live?.length) {
    const same = live.find((b) => b.quote_id === quote.id);
    if (same) {
      return { booking: same, paymentIntentStatus: same.payment_status === "captured" ? "succeeded" : "requires_capture", alreadyBooked: true };
    }
    const { data: other } = await db.from("providers").select("name").eq("id", live[0].provider_id ?? "").maybeSingle();
    throw new BookingError("already_booked", `${box} is already booked with ${other?.name ?? "another provider"}`, 409);
  }

  // 4. Money prerequisites.
  if (!importer.stripe_customer_id || !importer.default_payment_method_id) {
    throw new BookingError("no_payment_method", "Add a card in Settings first", 422);
  }
  if (!provider.stripe_account_id) {
    throw new BookingError("provider_not_onboarded", `${provider.name} has no Stripe account yet: invite them to onboard in Settings`, 422);
  }

  const fee = platformFeeCents(amount, platformFeeBps());

  // A key per attempt: a retry after a failure or a decline must not replay Stripe's cached first answer.
  const [{ count: oldBookings }, { count: failures }] = await Promise.all([
    db.from("bookings").select("id", { count: "exact", head: true }).eq("quote_id", quote.id),
    db.from("events").select("id", { count: "exact", head: true }).eq("container_id", container.id).eq("type", "payment_failed").contains("payload", { quote_id: quote.id }),
  ]);
  const attempt = (oldBookings ?? 0) + (failures ?? 0);
  const idempotencyKey = attempt === 0 ? `book_${quote.id}` : `book_${quote.id}_${attempt}`;

  // 5. Authorize (hold, not capture), payout destination is the provider, our fee rides along.
  const stripe = getStripe();
  const paymentFailed = async (error: string, code?: string | null) => {
    await logEvent(db, container.id, "payment_failed", {
      quote_id: quote.id,
      provider_id: provider.id,
      provider_name: provider.name,
      amount_cents: amount,
      error,
      code: code ?? null,
    });
  };

  let pi: Stripe.PaymentIntent;
  try {
    if (!provider.stripe_onboarded) {
      // The saved flag can be stale (webhook not wired yet): trust Stripe, and heal the flag.
      const acct = await stripe.accounts.retrieve(provider.stripe_account_id).catch((err: unknown) => {
        if (isMissingResource(err)) {
          throw new BookingError("provider_not_onboarded", `${provider.name}'s Stripe account no longer exists: set it up again in Settings`, 422);
        }
        throw err;
      });
      if (!accountIsOnboarded(acct)) throw new BookingError("provider_not_onboarded", `${provider.name} has not finished Stripe onboarding yet`, 422);
      await syncProviderOnboarding(db, acct);
    }
    pi = await stripe.paymentIntents.create(
      {
        amount,
        currency: "usd",
        customer: importer.stripe_customer_id,
        payment_method: importer.default_payment_method_id,
        off_session: true,
        confirm: true,
        error_on_requires_action: true, // nobody is there to complete 3DS: fail fast instead of hanging
        capture_method: "manual",
        transfer_data: { destination: provider.stripe_account_id },
        application_fee_amount: fee,
        description: `PortCall drayage ${box} with ${provider.name}`,
        metadata: {
          importer_id: importer.id,
          container_id: container.id,
          container_number: container.container_number,
          quote_id: quote.id,
          provider_id: provider.id,
          booked_by: args.bookedBy,
        },
        expand: ["latest_charge"],
      },
      { idempotencyKey },
    );
  } catch (err) {
    if (err instanceof BookingError) throw err;
    const failure = classifyStripeFailure(err);
    await paymentFailed(failure.message, err instanceof Stripe.errors.StripeError ? err.code : null);
    throw failure;
  }

  if (pi.status !== "requires_capture") {
    // Should not happen with off_session + confirm + manual capture, but never book on an unconfirmed hold.
    await stripe.paymentIntents.cancel(pi.id).catch(() => undefined);
    const reason = `Payment ended in status ${pi.status} instead of requires_capture`;
    await paymentFailed(reason);
    throw new BookingError("stripe_failed", reason, 502);
  }

  // 6. Record it. A concurrent duplicate lands on the same PaymentIntent and the same tender token.
  const tenderToken = tenderTokenFor(pi.id);
  const { data: inserted, error: insErr } = await db
    .from("bookings")
    .insert({
      container_id: container.id,
      quote_id: quote.id,
      provider_id: provider.id,
      amount_cents: amount,
      platform_fee_cents: fee,
      stripe_payment_intent_id: pi.id,
      payment_status: "authorized",
      tender_token: tenderToken,
      booked_by: args.bookedBy,
    })
    .select("*")
    .single();
  if (insErr?.code === "23505") {
    // The other tap won the race: hand back its booking, and leave the shared PaymentIntent alone.
    const { data: winner } = await db.from("bookings").select("*").eq("tender_token", tenderToken).single();
    if (winner) return { booking: winner, paymentIntentStatus: pi.status, alreadyBooked: true };
  }
  if (insErr || !inserted) {
    // Do not leave a hold on the customer's card that no booking points at.
    await stripe.paymentIntents.cancel(pi.id).catch(() => undefined);
    await paymentFailed(`Booking could not be saved: ${insErr?.message ?? "no row returned"}`);
    throw new Error(`booking insert failed: ${insErr?.message ?? "no row returned"}`);
  }
  const booking = inserted;

  const { error: boxErr } = await db.from("containers").update({ status: "booked" }).eq("id", container.id);
  if (boxErr) throw new Error(`container update failed: ${boxErr.message}`);

  const charge = typeof pi.latest_charge === "object" ? pi.latest_charge : null;
  const captureBefore = charge?.payment_method_details?.card?.capture_before;
  await logEvent(db, container.id, "booked", {
    booking_id: booking.id,
    quote_id: quote.id,
    provider_id: provider.id,
    provider_name: provider.name,
    amount_cents: amount,
    platform_fee_cents: fee,
    booked_by: args.bookedBy,
  });
  await logEvent(db, container.id, "payment_authorized", {
    booking_id: booking.id,
    provider_id: provider.id,
    provider_name: provider.name,
    amount_cents: amount,
    platform_fee_cents: fee,
    payment_intent_id: pi.id,
    destination: provider.stripe_account_id,
    capture_before: captureBefore ? new Date(captureBefore * 1000).toISOString() : null,
  });

  // 7. Tender the load. The booking stands even if the email cannot go out.
  try {
    const sent = await sendTenderEmail(booking.id);
    await logEvent(db, container.id, "tender_sent", {
      booking_id: booking.id,
      provider_id: provider.id,
      provider_name: provider.name,
      to: sent.to,
      intended_for: sent.intendedFor,
      redirected: sent.redirected,
      email_id: sent.id,
    });
  } catch (err) {
    await logEvent(db, container.id, "tender_email_failed", {
      booking_id: booking.id,
      provider_id: provider.id,
      provider_name: provider.name,
      error: err instanceof Error ? err.message : String(err),
    });
  }

  return { booking, paymentIntentStatus: pi.status, alreadyBooked: false };
}
