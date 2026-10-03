// End-to-end check of booking and payment (CLAUDE.md section 14b), against a running server:
// books the demo container's winning quote, checks the card hold and the payout destination, walks the
// tender through Accept, Picked up and Delivered (capture), and proves an agent cannot book above the limit.
//
//   npm run test:stripe        (BASE_URL defaults to APP_URL)
//
// Needs STRIPE_SECRET_KEY (sk_test_), SUPABASE_SERVICE_ROLE_KEY and INTERNAL_CRON_SECRET in .env.local,
// the same values the server runs with. Run npm run setup:stripe once first, and npm run test:replay so
// the demo container has a recommendation. To run again: npm run demo:reset, then test:replay.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { z } from "zod";
import type Stripe from "stripe";
import { appUrl, requireEnv } from "@/lib/env";
import { formatUsd } from "@/lib/money";
import { getStripe } from "@/lib/stripe";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Booking, Container, Provider, Quote } from "@/lib/types";
import { connectAdmin, describeError, findDemoContainer, runScript, type Reporter } from "./lib/demo";

const BookResponse = z
  .object({
    booking: z.object({ id: z.string() }).passthrough(),
    paymentIntentStatus: z.string(),
    alreadyBooked: z.boolean(),
  })
  .passthrough();
const TenderResponse = z
  .object({ action: z.string(), changed: z.boolean(), view: z.object({ stage: z.string() }).passthrough() })
  .passthrough();

type Http = { status: number; json: unknown; text: string };

async function call(method: "GET" | "POST", url: string, opts: { secret?: string; body?: unknown } = {}): Promise<Http> {
  let res: Response;
  try {
    res = await fetch(url, {
      method,
      headers: { "content-type": "application/json", ...(opts.secret ? { "x-internal-secret": opts.secret } : {}) },
      body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new Error(`could not reach ${url}: ${describeError(err)}. Is the server up?`);
  }
  const text = await res.text();
  let json: unknown = null;
  try {
    json = JSON.parse(text);
  } catch {
    // not JSON: the status and text still tell the story
  }
  return { status: res.status, json, text };
}

const errorText = (h: Http) => (h.json as { error?: string } | null)?.error ?? h.text.slice(0, 300);

const accountOf = (d: string | { id: string } | null | undefined) => (typeof d === "string" ? d : (d?.id ?? null));

type Winner = { container: Container; quote: Quote; provider: Provider };

async function loadWinner(db: AdminClient, container: Container): Promise<Winner> {
  const { data: rec, error } = await db
    .from("recommendations")
    .select("*")
    .eq("container_id", container.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`recommendation lookup failed: ${error.message}`);
  if (!rec?.winner_quote_id) throw new Error("no recommendation yet: run CALL_MODE=replay npm run test:replay first");
  const { data: quote, error: qErr } = await db.from("quotes").select("*, provider:providers(*)").eq("id", rec.winner_quote_id).single();
  if (qErr || !quote?.provider) throw new Error(`winning quote ${rec.winner_quote_id} not found: ${qErr?.message ?? "no provider"}`);
  const { provider, ...rest } = quote;
  if (rest.all_in_cents == null) throw new Error("the winning quote has no all-in price");
  if (!provider.stripe_account_id) throw new Error(`${provider.name} has no Stripe account: run npm run setup:stripe`);
  return { container, quote: rest, provider };
}

async function requireCard(db: AdminClient, container: Container): Promise<void> {
  const { data } = await db.from("importers").select("stripe_customer_id, default_payment_method_id").eq("id", container.importer_id ?? "").maybeSingle();
  if (!data?.stripe_customer_id || !data.default_payment_method_id) throw new Error("the importer has no saved card: run npm run setup:stripe");
}

async function loadBooking(db: AdminClient, id: string): Promise<Booking> {
  const { data, error } = await db.from("bookings").select("*").eq("id", id).single();
  if (error || !data) throw new Error(`booking ${id} not found: ${error?.message}`);
  return data;
}

async function containerStatus(db: AdminClient, id: string): Promise<string | null> {
  const { data } = await db.from("containers").select("status").eq("id", id).single();
  return data?.status ?? null;
}

async function tender(baseUrl: string, token: string, action: string): Promise<z.infer<typeof TenderResponse>> {
  const res = await call("POST", `${baseUrl}/api/tender/${token}`, { body: { action } });
  if (res.status !== 200) throw new Error(`POST /api/tender (${action}) answered ${res.status}: ${errorText(res)}`);
  const parsed = TenderResponse.safeParse(res.json);
  if (!parsed.success) throw new Error(`unexpected /api/tender answer: ${res.text.slice(0, 300)}`);
  return parsed.data;
}

/** Book (or reuse), then Accept, Picked up, Delivered. Stops at the first failure: each step needs the last. */
async function bookingFlow(r: Reporter, db: AdminClient, stripe: Stripe, baseUrl: string, secret: string, w: Winner): Promise<void> {
  const { container, quote } = w;

  // A booking left by an earlier run decides what we can still prove.
  const { data: previous } = await db.from("bookings").select("*").eq("container_id", container.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (previous?.payment_status === "captured") {
    r.fail("fresh booking", `${container.container_number} already has a captured booking from an earlier run: run npm run demo:reset, then npm run test:replay, then this again`);
    return;
  }
  const reuse = previous && previous.payment_status === "authorized" ? previous : null;
  if (reuse) r.info(`reusing the authorized booking ${reuse.id} from an earlier run`);

  const bookingId = await r.run(
    "book",
    async () => {
      if (reuse) return reuse.id;
      const res = await call("POST", `${baseUrl}/api/book`, { secret, body: { quoteId: quote.id, bookedBy: "human" } });
      if (res.status !== 200) throw new Error(`POST /api/book answered ${res.status}: ${errorText(res)}`);
      const parsed = BookResponse.safeParse(res.json);
      if (!parsed.success) throw new Error(`unexpected /api/book answer: ${res.text.slice(0, 300)}`);
      return parsed.data.booking.id;
    },
    (id) => `booking ${id}, ${w.provider.name}, ${formatUsd(quote.all_in_cents)}`,
  );
  if (!bookingId) return;
  const booking = await loadBooking(db, bookingId);
  const token = booking.tender_token;
  const piId = booking.stripe_payment_intent_id;
  if (!token || !piId) {
    r.fail("book", "the booking has no tender token or PaymentIntent id");
    return;
  }
  // The provider on the booking is the one that must be paid (it can differ from the winner on a reused run).
  const { data: bookedProvider } = await db.from("providers").select("*").eq("id", booking.provider_id ?? "").single();
  const destination = bookedProvider?.stripe_account_id ?? null;

  const hold = await r.run(
    "payment hold",
    async () => {
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.status !== "requires_capture") throw new Error(`${pi.id} is ${pi.status}, expected requires_capture`);
      if (pi.capture_method !== "manual") throw new Error(`${pi.id} capture_method is ${pi.capture_method}, expected manual`);
      if (booking.payment_status !== "authorized") throw new Error(`booking.payment_status is ${booking.payment_status}, expected authorized`);
      return pi;
    },
    (pi) => `${pi.id} requires_capture for ${formatUsd(pi.amount)}`,
  );
  if (!hold) return;

  await r.run(
    "payout destination",
    async () => {
      const got = accountOf(hold.transfer_data?.destination);
      if (!destination || got !== destination) throw new Error(`transfer destination is ${got}, expected ${bookedProvider?.name} ${destination}`);
      if (hold.application_fee_amount !== booking.platform_fee_cents) throw new Error(`application fee is ${hold.application_fee_amount}, booking says ${booking.platform_fee_cents}`);
      if (hold.amount !== booking.amount_cents) throw new Error(`amount is ${hold.amount}, booking says ${booking.amount_cents}`);
      return got;
    },
    (got) => `${got} (${bookedProvider?.name}), platform fee ${formatUsd(booking.platform_fee_cents)}`,
  );

  const { data: mail } = await db
    .from("events")
    .select("type, payload")
    .eq("container_id", container.id)
    .in("type", ["tender_sent", "tender_email_failed"])
    .gte("created_at", booking.created_at ?? "1970-01-01")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const mailPayload = (mail?.payload ?? {}) as { to?: string[]; error?: string };
  if (mail?.type === "tender_sent") r.info(`tender email sent to ${(mailPayload.to ?? []).join(", ")}`);
  else r.warn(`tender email was not sent (${mailPayload.error ?? "no tender_sent event"}): the booking stands; set RESEND_API_KEY and TENDER_FROM_EMAIL for the email`);

  const accepted = await r.run(
    "tender accept",
    async () => {
      const view = await call("GET", `${baseUrl}/api/tender/${token}`);
      if (view.status !== 200) throw new Error(`GET /api/tender answered ${view.status}: ${errorText(view)}`);
      const res = await tender(baseUrl, token, "accept");
      const after = await loadBooking(db, booking.id);
      if (after.tender_status !== "accepted") throw new Error(`tender_status is ${after.tender_status}, expected accepted`);
      if (!after.accepted_at) throw new Error("accepted_at was not set");
      const status = await containerStatus(db, container.id);
      if (status !== "accepted") throw new Error(`container status is ${status}, expected accepted`);
      return res;
    },
    (res) => `tender_status accepted (changed ${res.changed})`,
  );
  if (!accepted) return;

  if ((await containerStatus(db, container.id)) === "accepted") {
    await r.run(
      "tender order",
      async () => {
        const res = await call("POST", `${baseUrl}/api/tender/${token}`, { body: { action: "delivered" } });
        if (res.status !== 409) throw new Error(`Delivered before Picked up answered ${res.status}, expected 409: ${errorText(res)}`);
        const pi = await stripe.paymentIntents.retrieve(piId);
        if (pi.status !== "requires_capture") throw new Error(`the rejected Delivered still moved the payment to ${pi.status}`);
        return errorText(res);
      },
      (message) => `Delivered before Picked up rejected: ${message}`,
    );
  }

  const pickedUp = await r.run(
    "picked up",
    async () => {
      await tender(baseUrl, token, "picked_up");
      const status = await containerStatus(db, container.id);
      if (status !== "picked_up") throw new Error(`container status is ${status}, expected picked_up`);
      return status;
    },
    "container picked_up",
  );
  if (!pickedUp) return;

  const delivered = await r.run(
    "delivered captures payment",
    async () => {
      await tender(baseUrl, token, "delivered");
      const pi = await stripe.paymentIntents.retrieve(piId);
      if (pi.status !== "succeeded") throw new Error(`${pi.id} is ${pi.status}, expected succeeded`);
      const after = await loadBooking(db, booking.id);
      if (after.payment_status !== "captured") throw new Error(`booking.payment_status is ${after.payment_status}, expected captured`);
      const status = await containerStatus(db, container.id);
      if (status !== "delivered") throw new Error(`container status is ${status}, expected delivered`);
      return pi;
    },
    (pi) => `${pi.id} succeeded, ${formatUsd(pi.amount_received)} captured, booking captured, container delivered`,
  );
  if (!delivered) return;

  await r.run(
    "delivered is idempotent",
    async () => {
      const res = await tender(baseUrl, token, "delivered");
      if (res.changed) throw new Error("a repeated Delivered reported a change");
      return res;
    },
    "a second Delivered tap is a no-op",
  );

  await r.run(
    "timeline events",
    async () => {
      const { data, error } = await db.from("events").select("type").eq("container_id", container.id).gte("created_at", booking.created_at ?? "1970-01-01");
      if (error) throw new Error(error.message);
      const seen = new Set((data ?? []).map((e) => e.type));
      const missing = ["booked", "payment_authorized", "accepted", "picked_up", "delivered", "payment_captured"].filter((t) => !seen.has(t));
      if (!seen.has("tender_sent") && !seen.has("tender_email_failed")) missing.push("tender_sent or tender_email_failed");
      if (missing.length) throw new Error(`missing events: ${missing.join(", ")}`);
      return seen.size;
    },
    "booked, payment_authorized, tender, accepted, picked_up, delivered, payment_captured",
  );
}

/** An agent may not book above the importer's limit. The limit is lowered for the check and always restored. */
async function guardrail(r: Reporter, db: AdminClient, baseUrl: string, secret: string, w: Winner): Promise<void> {
  const importerId = w.container.importer_id;
  if (!importerId) {
    r.fail("guardrail", "the demo container has no importer");
    return;
  }
  const { data: importer } = await db.from("importers").select("auto_book_limit_cents").eq("id", importerId).single();
  if (!importer) {
    r.fail("guardrail", "importer not found");
    return;
  }
  const original = importer.auto_book_limit_cents;
  const countBookings = async () => (await db.from("bookings").select("id", { count: "exact", head: true }).eq("container_id", w.container.id)).count ?? 0;

  try {
    const { error } = await db.from("importers").update({ auto_book_limit_cents: 100 }).eq("id", importerId);
    if (error) throw new Error(`could not lower the limit: ${error.message}`);
    const before = await countBookings();
    await r.run(
      "guardrail",
      async () => {
        const res = await call("POST", `${baseUrl}/api/book`, { secret, body: { quoteId: w.quote.id, bookedBy: "agent" } });
        const message = errorText(res);
        if (res.status !== 403) throw new Error(`agent booking above the limit answered ${res.status}, expected 403: ${message}`);
        if (!/needs human approval/i.test(message)) throw new Error(`rejected, but without "needs human approval": ${message}`);
        if ((await countBookings()) !== before) throw new Error("a rejected booking still created a booking row");
        return message;
      },
      (message) => `agent booking rejected: ${message}`,
    );
  } catch (err) {
    r.fail("guardrail", describeError(err));
  } finally {
    const { error } = await db.from("importers").update({ auto_book_limit_cents: original }).eq("id", importerId);
    if (error) r.fail("guardrail restore", `could not put auto_book_limit_cents back to ${original}: ${error.message}`);
  }
}

void runScript(async (r) => {
  let baseUrl = process.env.BASE_URL?.trim();
  if (!baseUrl) {
    try {
      baseUrl = appUrl();
    } catch {
      r.fail("config", "set BASE_URL (or APP_URL) to the server under test");
      return;
    }
  }
  baseUrl = baseUrl.replace(/\/+$/, "");
  const secret = await r.run("config", async () => requireEnv("Internal cron secret", ["INTERNAL_CRON_SECRET"]).INTERNAL_CRON_SECRET, `server under test ${baseUrl}`);
  const stripe = await r.run(
    "stripe key",
    async () => {
      const s = getStripe(); // refuses anything but sk_test_
      await s.balance.retrieve();
      return s;
    },
    "test key accepted by Stripe",
  );
  const db = await r.run("supabase", () => connectAdmin(), "service role connected");
  if (!secret || !stripe || !db) return;

  const container = await r.run("demo container", () => findDemoContainer(db), (c) => `${c.container_number} is ${c.status}`);
  if (!container) return;
  const winner = await r.run("winning quote", async () => {
    await requireCard(db, container);
    return loadWinner(db, container);
  }, (w) => `${w.provider.name} ${formatUsd(w.quote.all_in_cents)} (${w.provider.stripe_account_id})`);
  if (!winner) return;

  await bookingFlow(r, db, stripe, baseUrl, secret, winner);
  await guardrail(r, db, baseUrl, secret, winner);
});
