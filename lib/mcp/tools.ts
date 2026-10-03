// The five MCP tools an outside agent uses to run drayage end to end: find a container, have PortCall
// phone the importer's providers, read the ranked quotes, book, and follow the box to delivery.
// They reuse the dashboard's pipeline (startQuoteRequest, bookQuote), and every query is scoped to
// the importer that owns the API key.
import type { McpServer } from "@modelcontextprotocol/server";
import type { z } from "zod";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { NotConfiguredError, demurragePerDayCents } from "@/lib/env";
import { QUOTE_FIELDS, type QuoteField } from "@/lib/ai/types";
import { chassisTotalCents, accessorialsTotalCents, daysBetween, formatContainerNumber, type Accessorial } from "@/lib/money";
import { portDate, todayPortDate } from "@/lib/dates";
import { QuoteRequestError, startQuoteRequest } from "@/lib/quotes/request";
import { BookingError, bookQuote } from "@/lib/book";
import type { Json } from "@/lib/database.types";
import type { Booking, Container, EventRow, Quote, QuoteRequest, Recommendation } from "@/lib/types";
import {
  bookQuoteInput,
  bookQuoteOutput,
  getContainerStatusInput,
  getContainerStatusOutput,
  getQuotesInput,
  getQuotesOutput,
  listContainersInput,
  listContainersOutput,
  requestQuotesInput,
  requestQuotesOutput,
  type BookingView,
  type CallView,
  type ContainerView,
  type EventView,
  type QuoteRequestView,
  type QuoteView,
  type RecommendationView,
} from "./schemas";

type McpCtx = { http?: { authInfo?: { extra?: Record<string, unknown> } } };

/** A problem the calling agent can fix (unknown id, nothing to book yet). The message is returned as written. */
class ToolError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CALL_DONE = new Set(["ended", "failed", "no_answer"]);

const usdFormat = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const money = (c: number): string => usdFormat.format(c / 100);
const moneyOrNull = (c: number | null | undefined): string | null => (c == null ? null : money(c));

// What an agent should do when booking is refused. The BookingError message itself is passed through verbatim.
const BOOKING_HINTS: Record<string, string> = {
  needs_human_approval: "Do not retry. Tell the user this booking needs their approval in the PortCall dashboard.",
  no_payment_method: "The importer has no saved card. Ask the user to add a payment method in PortCall settings.",
  provider_not_onboarded: "This provider cannot receive payment yet. Pick another quote from get_quotes or ask the user to onboard them.",
  not_found: "Use a quote_id from get_quotes for this importer.",
  already_booked: "This container is already booked. Call get_container_status to follow it.",
  stripe_failed: "The payment did not go through. Do not retry blindly; report the error to the user.",
};

function errorResult(message: string, hint?: string) {
  const content = [{ type: "text" as const, text: message }];
  if (hint) content.push({ type: "text" as const, text: hint });
  return { isError: true as const, content };
}

function failure(err: unknown) {
  if (err instanceof BookingError) return errorResult(err.message, BOOKING_HINTS[err.code]);
  if (err instanceof QuoteRequestError || err instanceof NotConfiguredError || err instanceof ToolError) return errorResult(err.message);
  console.error("[mcp] tool failed", err);
  return errorResult(`PortCall hit an unexpected error: ${err instanceof Error ? err.message : String(err)}`);
}

// Both the JSON text and structuredContent are returned: many clients only show the model `content`.
function success(data: Record<string, unknown>) {
  return { content: [{ type: "text" as const, text: JSON.stringify(data) }], structuredContent: data };
}

function importerIdOf(ctx: McpCtx): string {
  const id = ctx.http?.authInfo?.extra?.importerId;
  if (typeof id !== "string" || !id) throw new ToolError("Not authenticated: send Authorization: Bearer <importer MCP API key>.");
  return id;
}

/** Wraps a tool body: resolves the importer from auth, turns throws into isError results. */
function tool<A>(body: (args: A, importerId: string, db: AdminClient) => Promise<Record<string, unknown>>) {
  return async (args: A, ctx: McpCtx) => {
    try {
      return success(await body(args, importerIdOf(ctx), createAdminClient()));
    } catch (err) {
      return failure(err);
    }
  };
}

type Res<T> = { data: T | null; error: { message: string } | null };

/** Query result that may legitimately be empty. */
function maybe<T>(res: Res<T>, what: string): T | null {
  if (res.error) throw new Error(`${what} failed: ${res.error.message}`);
  return res.data;
}

/** Query result that must exist. */
function one<T>(res: Res<T>, what: string): T {
  const data = maybe(res, what);
  if (data == null) throw new Error(`${what} failed: not found`);
  return data;
}

function many<T>(res: Res<T[]>, what: string): T[] {
  return maybe(res, what) ?? [];
}

const compactNumber = (n: string) => n.replace(/[^A-Za-z0-9]/g, "").toUpperCase();

/** Container by uuid or by container number in any format ("PHGU4829137", "phgu 482913-7"), owned by this importer. */
async function resolveContainer(db: AdminClient, importerId: string, ref: string): Promise<Container> {
  const raw = ref.trim();
  if (UUID_RE.test(raw)) {
    const found = maybe(await db.from("containers").select("*").eq("id", raw).eq("importer_id", importerId).maybeSingle(), "container lookup");
    if (found) return found;
  } else if (compactNumber(raw)) {
    const compact = compactNumber(raw);
    // Narrow in SQL with a subsequence pattern, then compare exactly in code so stored formatting never matters.
    const rows = many(
      await db.from("containers").select("*").eq("importer_id", importerId).ilike("container_number", `%${[...compact].join("%")}%`),
      "container lookup",
    );
    const match = rows.find((c) => compactNumber(c.container_number) === compact);
    if (match) return match;
  }
  throw new ToolError(`No container "${raw}" for this importer. Call list_containers to see valid container ids and numbers.`);
}

function toContainerView(c: Container, today: string): ContainerView {
  const eta = c.eta ? portDate(c.eta) : null;
  return {
    container_id: c.id,
    container_number: compactNumber(c.container_number),
    container_number_formatted: formatContainerNumber(c.container_number),
    size: c.size,
    port: c.port,
    terminal: c.terminal,
    vessel: c.vessel,
    eta: c.eta,
    last_free_day: c.last_free_day,
    deliver_by: c.deliver_by,
    destination_name: c.destination_name,
    destination_address: c.destination_address,
    status: c.status ?? "inbound",
    days_until_eta: eta ? daysBetween(today, eta) : null,
    days_until_last_free_day: c.last_free_day ? daysBetween(today, c.last_free_day) : null,
  };
}

function parseAccessorials(raw: Json | null): Accessorial[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((a) =>
    a && typeof a === "object" && !Array.isArray(a) && typeof a.name === "string" && typeof a.cents === "number"
      ? [{ name: a.name, cents: a.cents }]
      : [],
  );
}

/** Quote fields not heard yet. Only meaningful for quotes built from a call (seeded history has none). */
function missingFields(q: Quote, accessorials: Accessorial[]): string[] {
  if (!q.call_id) return [];
  const sources = (q.field_sources ?? {}) as Record<string, number>;
  // accessorials defaults to [], so "discussed" is a non-empty list or a recorded source line.
  const heard: Record<QuoteField, boolean> = {
    linehaul_cents: q.linehaul_cents != null,
    fuel_surcharge_cents: q.fuel_surcharge_cents != null,
    chassis_per_day_cents: q.chassis_per_day_cents != null,
    est_chassis_days: q.est_chassis_days != null,
    accessorials: accessorials.length > 0 || sources.accessorials != null,
    earliest_pickup: q.earliest_pickup != null,
    can_meet_deadline: q.can_meet_deadline != null,
  };
  return QUOTE_FIELDS.filter((f) => !heard[f]);
}

function toQuoteView(q: Quote, providerName: string, c: Container, rec: Recommendation | null): QuoteView {
  const accessorials = parseAccessorials(q.accessorials);
  const accessorialsTotal = accessorialsTotalCents(accessorials);
  const chassisKnown = q.chassis_per_day_cents != null && q.est_chassis_days != null;
  const chassisTotal = chassisKnown ? chassisTotalCents(q) : null;
  const rankIndex = rec?.ranked_quote_ids?.indexOf(q.id) ?? -1;
  return {
    quote_id: q.id,
    call_id: q.call_id,
    provider_id: q.provider_id,
    provider_name: providerName,
    rank: rankIndex >= 0 ? rankIndex + 1 : null,
    is_recommended: rec?.winner_quote_id === q.id,
    linehaul_cents: q.linehaul_cents,
    linehaul_usd: moneyOrNull(q.linehaul_cents),
    fuel_surcharge_cents: q.fuel_surcharge_cents,
    fuel_surcharge_usd: moneyOrNull(q.fuel_surcharge_cents),
    chassis_per_day_cents: q.chassis_per_day_cents,
    chassis_per_day_usd: moneyOrNull(q.chassis_per_day_cents),
    est_chassis_days: q.est_chassis_days,
    chassis_total_cents: chassisTotal,
    chassis_total_usd: moneyOrNull(chassisTotal),
    accessorials: accessorials.map((a) => ({ name: a.name, cents: a.cents, usd: money(a.cents) })),
    accessorials_total_cents: accessorialsTotal,
    accessorials_total_usd: money(accessorialsTotal),
    all_in_cents: q.all_in_cents,
    all_in_usd: moneyOrNull(q.all_in_cents),
    earliest_pickup: q.earliest_pickup,
    can_meet_deadline: q.can_meet_deadline,
    demurrage_days: q.earliest_pickup && c.last_free_day ? Math.max(0, daysBetween(c.last_free_day, q.earliest_pickup)) : null,
    projected_demurrage_cents: q.projected_demurrage_cents,
    projected_demurrage_usd: moneyOrNull(q.projected_demurrage_cents),
    risk_adjusted_cents: q.risk_adjusted_cents,
    risk_adjusted_usd: moneyOrNull(q.risk_adjusted_cents),
    notes: q.notes,
    missing_fields: missingFields(q, accessorials),
    updated_at: q.updated_at,
  };
}

function toRecommendationView(rec: Recommendation, quotes: QuoteView[]): RecommendationView {
  const ids = rec.ranked_quote_ids ?? [];
  const byId = new Map(quotes.map((q) => [q.quote_id, q]));
  return {
    recommendation_id: rec.id,
    winner_quote_id: rec.winner_quote_id,
    winner_provider_name: (rec.winner_quote_id && byId.get(rec.winner_quote_id)?.provider_name) || null,
    ranked_quote_ids: ids,
    ranking: ids.flatMap((id, i) => {
      const q = byId.get(id);
      return q
        ? [{ rank: i + 1, quote_id: id, provider_name: q.provider_name, all_in_cents: q.all_in_cents, all_in_usd: q.all_in_usd, risk_adjusted_cents: q.risk_adjusted_cents, risk_adjusted_usd: q.risk_adjusted_usd }]
        : [];
    }),
    reasoning: rec.reasoning,
    created_at: rec.created_at,
  };
}

function toBookingView(b: Booking, providerName: string | null): BookingView {
  return {
    booking_id: b.id,
    quote_id: b.quote_id,
    provider_id: b.provider_id,
    provider_name: providerName,
    amount_cents: b.amount_cents,
    amount_usd: money(b.amount_cents),
    platform_fee_cents: b.platform_fee_cents,
    platform_fee_usd: money(b.platform_fee_cents),
    payment_status: b.payment_status,
    tender_status: b.tender_status,
    booked_by: b.booked_by,
    created_at: b.created_at,
    accepted_at: b.accepted_at,
  };
}

function toQuoteRequestView(r: QuoteRequest): QuoteRequestView {
  return { quote_request_id: r.id, status: r.status ?? "calling", triggered_by: r.triggered_by, created_at: r.created_at, completed_at: r.completed_at };
}

const EVENT_LABELS: Record<string, string> = {
  quote_requested: "Quote requested",
  call_started: "Call started",
  call_failed: "Call failed",
  field_heard: "Quote detail heard",
  call_ended: "Call ended",
  recommended: "Recommendation made",
  quote_failed: "Quote run failed",
  auto_book_skipped: "Auto-book skipped",
  auto_book_failed: "Auto-book failed",
  booked: "Booked",
  payment_authorized: "Payment authorized",
  payment_failed: "Payment failed",
  tender_sent: "Tender sent to provider",
  tender_email_failed: "Tender email failed",
  accepted: "Provider accepted",
  declined: "Provider declined",
  picked_up: "Picked up",
  delivered: "Delivered",
  payment_captured: "Payment captured",
  payment_canceled: "Payment canceled",
};

function toEventView(e: EventRow): EventView {
  const raw = e.payload;
  const payload: Record<string, unknown> =
    raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : raw == null ? {} : { value: raw };
  let label = EVENT_LABELS[e.type] ?? e.type;
  if (e.type === "field_heard" && typeof payload.provider_name === "string" && typeof payload.field === "string") {
    label = `${payload.provider_name}: ${payload.field} heard`;
  }
  return { event_id: e.id, type: e.type, label, at: e.created_at, payload };
}

async function providerNames(db: AdminClient, importerId: string): Promise<Map<string, string>> {
  const rows = many(await db.from("providers").select("id, name").eq("importer_id", importerId), "providers lookup");
  return new Map(rows.map((p) => [p.id, p.name]));
}

async function latestQuoteRequest(db: AdminClient, containerId: string): Promise<QuoteRequest | null> {
  return maybe(
    await db.from("quote_requests").select("*").eq("container_id", containerId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    "quote request lookup",
  );
}

async function latestBooking(db: AdminClient, containerId: string): Promise<Booking | null> {
  return maybe(
    await db.from("bookings").select("*").eq("container_id", containerId).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    "booking lookup",
  );
}

// ---- next_step hints: tell the agent whether to keep polling, book, or stop ----

function quotesNextStep(args: {
  qr: QuoteRequest | null;
  calls: CallView[];
  quotes: QuoteView[];
  rec: RecommendationView | null;
  booking: BookingView | null;
  limitCents: number;
}): string {
  const { qr, calls, quotes, rec, booking, limitCents } = args;
  if (booking && booking.payment_status !== "canceled" && booking.payment_status !== "failed") {
    return `Already booked with ${booking.provider_name ?? "the provider"} for ${booking.amount_usd} (payment ${booking.payment_status ?? "pending"}, tender ${booking.tender_status ?? "sent"}). Call get_container_status to follow acceptance, pickup and delivery. Nothing more to book.`;
  }
  if (!qr) return "No quotes have been requested for this container. Call request_quotes to start the provider calls.";
  if (qr.status === "failed") return "The last quote run failed, so there is nothing to book. Call request_quotes to try again.";
  if (rec?.winner_quote_id) {
    const winner = quotes.find((q) => q.quote_id === rec.winner_quote_id);
    const amount = winner?.all_in_cents ?? null;
    const limit = money(limitCents);
    const within =
      amount == null
        ? ""
        : amount <= limitCents
          ? ` That is within the importer's ${limit} auto-book limit, so you can book it.`
          : ` That is over the importer's ${limit} auto-book limit, so book_quote will be refused: ask a human to approve it in the dashboard.`;
    return `Quotes are final. Recommended: ${rec.winner_provider_name ?? "the winner"} at ${winner?.all_in_usd ?? "an unknown price"} all-in. To book it call book_quote with quote_id=${rec.winner_quote_id}.${within}`;
  }
  const done = calls.filter((c) => CALL_DONE.has(c.status)).length;
  if (qr.status === "complete" || (calls.length > 0 && done === calls.length)) {
    return quotes.some((q) => q.all_in_cents != null)
      ? "All calls have ended and Claude is ranking the quotes. Call get_quotes again in 5 seconds."
      : "All calls ended without a usable price. Call request_quotes to try again.";
  }
  const priced = quotes.filter((q) => q.all_in_cents != null).length;
  return `${done} of ${calls.length} calls have finished and ${priced} quote${priced === 1 ? " has" : "s have"} a price so far. Calls take about 1 to 3 minutes. Call get_quotes again in 5 to 10 seconds; the recommendation appears when every call has ended.`;
}

function statusNextStep(c: Container, booking: BookingView | null): string {
  switch (c.status) {
    case "inbound":
      return "No quotes yet. Call request_quotes to start the provider calls.";
    case "quoting":
      return "Quote calls are in progress. Call get_quotes every 5 to 10 seconds until a recommendation appears.";
    case "quoted":
      return "Quotes are ranked and waiting. Call get_quotes for the recommendation, then book_quote.";
    case "booked":
      return `Booked${booking?.provider_name ? ` with ${booking.provider_name}` : ""} and the card is authorized. Waiting for the provider to accept the tender email; check again shortly.`;
    case "accepted":
      return "The provider accepted the tender. Waiting for pickup; check again later.";
    case "picked_up":
      return "The container is on the road. Payment is captured when the provider marks it delivered.";
    case "delivered":
      return "Delivered and paid. Nothing left to do.";
    default:
      return "Call get_quotes for the latest state.";
  }
}

export function registerPortCallTools(server: McpServer): void {
  server.registerTool(
    "list_containers",
    {
      title: "List containers",
      description:
        "List the importer's containers with vessel ETA, last free day (LFD), deliver-by date, destination and status. Start here to find the container you need. " +
        "Pickups after the LFD cost demurrage, so the container with the nearest LFD is the most urgent. Optionally filter by status " +
        "(inbound, quoting, quoted, booked, accepted, picked_up, delivered). Each container has a container_id you can pass to the other tools.",
      inputSchema: listContainersInput,
      outputSchema: listContainersOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool<z.infer<typeof listContainersInput>>(async ({ status }, importerId, db) => {
      const today = todayPortDate();
      let query = db.from("containers").select("*").eq("importer_id", importerId);
      if (status) query = query.eq("status", status);
      const [importer, rows] = await Promise.all([
        db.from("importers").select("name").eq("id", importerId).maybeSingle(),
        query,
      ]);
      const active = (c: Container) => (c.status === "delivered" ? 1 : 0);
      const containers = many(rows, "containers lookup")
        .sort((a, b) => active(a) - active(b) || (a.eta ?? "9999").localeCompare(b.eta ?? "9999"))
        .map((c) => toContainerView(c, today));
      return {
        importer_name: maybe(importer, "importer lookup")?.name ?? "Importer",
        today,
        count: containers.length,
        containers,
        next_step: containers.length
          ? "To get quotes for a container call request_quotes with its container_id. Use get_quotes if quoting already started, or get_container_status for containers that are booked or moving."
          : "No containers match. Try again without the status filter.",
      } satisfies z.infer<typeof listContainersOutput>;
    }),
  );

  server.registerTool(
    "request_quotes",
    {
      title: "Request quotes by phone",
      description:
        "Start phone calls to the importer's drayage providers to get quotes for one container. PortCall's AI voice agent calls every provider that serves the lane, in parallel, " +
        "and takes about 1 to 3 minutes. Returns the quote_request_id, which providers are being called, and which were skipped and why. " +
        "Safe to call twice: if a request is already in flight for this container it is reused and nobody is called again. " +
        "Containers that are already booked or further along cannot be re-quoted. After calling this, poll get_quotes every 5 to 10 seconds.",
      inputSchema: requestQuotesInput,
      outputSchema: requestQuotesOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    tool<z.infer<typeof requestQuotesInput>>(async ({ container_id }, importerId, db) => {
      const container = await resolveContainer(db, importerId, container_id);
      const started = await startQuoteRequest({ containerId: container.id, importerId, triggeredBy: "agent" });
      // Re-read so the status reflects the run that was just started.
      const fresh = maybe(await db.from("containers").select("*").eq("id", container.id).maybeSingle(), "container lookup") ?? container;
      const calls = started.calls.map((c) => ({ call_id: c.callId, provider_id: c.providerId, provider_name: c.providerName, status: c.status }));
      const parts: string[] = [];
      if (started.reused) parts.push("A quote request was already in flight for this container, so no new calls were placed.");
      if (started.mode === "replay") parts.push("Mode is replay: the calls are recorded dispatcher scripts played through the real pipeline, not live phone calls.");
      if (calls.length > 0 && calls.every((c) => c.status === "failed")) {
        parts.push("Every call failed to connect. Call get_quotes for the details, or call request_quotes again.");
      } else {
        parts.push("Calls take about 1 to 3 minutes. Call get_quotes with the same container_id every 5 to 10 seconds until it returns a recommendation, then call book_quote.");
      }
      return {
        quote_request_id: started.quoteRequestId,
        mode: started.mode,
        reused: started.reused,
        container: toContainerView(fresh, todayPortDate()),
        calls,
        skipped: started.skipped.map((s) => ({ provider_id: s.providerId, provider_name: s.providerName, reason: s.reason })),
        next_step: parts.join(" "),
      } satisfies z.infer<typeof requestQuotesOutput>;
    }),
  );

  server.registerTool(
    "get_quotes",
    {
      title: "Get quotes and recommendation",
      description:
        "Poll this after request_quotes. Returns, for the latest quote run on a container: each provider's call status, the quote heard on each call " +
        "(linehaul, fuel, chassis, other fees, earliest pickup, whether they can deliver by the deliver-by date), projected demurrage and risk-adjusted cost, " +
        "then Claude's ranked recommendation with its reasoning once every call has ended, and the booking if one exists. " +
        "Quotes fill in live while calls are running, so fields may be null at first (see missing_fields). All money is integer cents plus a formatted dollar string. " +
        "Cheapest is not always best: quotes are ranked on risk-adjusted cost (all-in plus estimated demurrage if pickup is after the last free day). " +
        "Read next_step: it says whether to keep polling, book, or stop.",
      inputSchema: getQuotesInput,
      outputSchema: getQuotesOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool<z.infer<typeof getQuotesInput>>(async ({ container_id }, importerId, db) => {
      const today = todayPortDate();
      const [container, names, importerRes] = await Promise.all([
        resolveContainer(db, importerId, container_id),
        providerNames(db, importerId),
        db.from("importers").select("auto_book_limit_cents").eq("id", importerId).single(),
      ]);
      const limitCents = one(importerRes, "importer lookup").auto_book_limit_cents;
      const qr = await latestQuoteRequest(db, container.id);

      const callRows = qr ? many(await db.from("calls").select("*").eq("quote_request_id", qr.id), "calls lookup") : [];
      const callIds = callRows.map((c) => c.id);
      // With a quote run, show that run's quotes; otherwise (older or seeded boxes) whatever is on file for the container.
      const [quoteRows, recRow, bookingRow] = await Promise.all([
        qr
          ? callIds.length
            ? db.from("quotes").select("*").in("call_id", callIds).then((r) => many(r, "quotes lookup"))
            : Promise.resolve([] as Quote[])
          : db.from("quotes").select("*").eq("container_id", container.id).then((r) => many(r, "quotes lookup")),
        qr
          ? db
              .from("recommendations")
              .select("*")
              .eq("quote_request_id", qr.id)
              .order("created_at", { ascending: false })
              .limit(1)
              .maybeSingle()
              .then((r) => maybe(r, "recommendation lookup"))
          : Promise.resolve(null),
        latestBooking(db, container.id),
      ]);

      const nameOf = (id: string | null) => (id ? names.get(id) : undefined) ?? "Unknown provider";
      let quotes = quoteRows.map((q) => toQuoteView(q, nameOf(q.provider_id), container, recRow));
      quotes = recRow
        ? quotes.sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99))
        : quotes.sort((a, b) => (a.risk_adjusted_cents ?? Infinity) - (b.risk_adjusted_cents ?? Infinity) || a.provider_name.localeCompare(b.provider_name));
      const quoteCallIds = new Set(quotes.filter((q) => q.all_in_cents != null).map((q) => q.call_id));
      const calls: CallView[] = callRows
        .map((c) => ({
          call_id: c.id,
          provider_id: c.provider_id,
          provider_name: nameOf(c.provider_id),
          status: c.status ?? "queued",
          started_at: c.started_at,
          ended_at: c.ended_at,
          summary: c.summary,
          has_quote: quoteCallIds.has(c.id),
        }))
        .sort((a, b) => a.provider_name.localeCompare(b.provider_name));

      const recommendation = recRow ? toRecommendationView(recRow, quotes) : null;
      const booking = bookingRow ? toBookingView(bookingRow, bookingRow.provider_id ? names.get(bookingRow.provider_id) ?? null : null) : null;
      const perDay = demurragePerDayCents();
      return {
        container: toContainerView(container, today),
        auto_book_limit_cents: limitCents,
        auto_book_limit_usd: money(limitCents),
        demurrage_per_day_cents: perDay,
        demurrage_per_day_usd: money(perDay),
        quote_request: qr ? toQuoteRequestView(qr) : null,
        calls,
        quotes,
        recommendation,
        booking,
        next_step: quotesNextStep({ qr, calls, quotes, rec: recommendation, booking, limitCents }),
      } satisfies z.infer<typeof getQuotesOutput>;
    }),
  );

  server.registerTool(
    "book_quote",
    {
      title: "Book a quote",
      description:
        "Book one quote: PortCall authorizes the amount on the importer's saved card (captured only when the provider marks the container delivered) " +
        "and emails the provider a tender with an Accept link. Pass a quote_id from get_quotes; the recommended winner is recommendation.winner_quote_id. " +
        "Guardrail: quotes above the importer's auto-book limit are refused with 'needs human approval'. Do not retry those; tell the user to approve in the dashboard. " +
        "Safe to repeat: booking a quote that is already booked returns already_booked: true and charges nothing new.",
      inputSchema: bookQuoteInput,
      outputSchema: bookQuoteOutput,
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    tool<z.infer<typeof bookQuoteInput>>(async ({ quote_id }, importerId, db) => {
      const quoteId = quote_id.trim();
      if (!UUID_RE.test(quoteId)) throw new ToolError(`"${quote_id}" is not a quote id. Use a quote_id from get_quotes.`);
      const result = await bookQuote({ quoteId, importerId, bookedBy: "agent" });
      const { booking } = result;
      const [providerRes, containerRes] = await Promise.all([
        booking.provider_id ? db.from("providers").select("name").eq("id", booking.provider_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
        booking.container_id ? db.from("containers").select("*").eq("id", booking.container_id).maybeSingle() : Promise.resolve({ data: null, error: null }),
      ]);
      const container = maybe(containerRes, "container lookup");
      if (!container) throw new Error("Booked, but the container could not be read back.");
      const providerName = maybe(providerRes, "provider lookup")?.name ?? null;
      const bookingView = toBookingView(booking, providerName);
      const authorized = booking.payment_status === "authorized";
      return {
        already_booked: result.alreadyBooked,
        booking: bookingView,
        container: toContainerView(container, todayPortDate()),
        payment: {
          payment_status: booking.payment_status,
          stripe_status: result.paymentIntentStatus,
          note: authorized
            ? `${bookingView.amount_usd} is authorized on the importer's card and is captured when the provider marks the container delivered.`
            : `Payment status is ${booking.payment_status ?? "unknown"}.`,
        },
        next_step: result.alreadyBooked
          ? "This quote was already booked, so nothing new was charged. Call get_container_status to follow it."
          : `Booked${providerName ? ` with ${providerName}` : ""}. A tender email with an Accept link went to the provider. Call get_container_status to follow acceptance, pickup and delivery.`,
      } satisfies z.infer<typeof bookQuoteOutput>;
    }),
  );

  server.registerTool(
    "get_container_status",
    {
      title: "Get container status and timeline",
      description:
        "The full story of one container: its current status, the latest quote run, the booking if any, and every event in order " +
        "(quote requested, calls, quote details heard, recommendation, booking, payment authorized, tender sent, accepted, picked up, delivered, payment captured). " +
        "Use it after book_quote to follow the box to delivery, or on any container to see where it stands. Events are oldest first.",
      inputSchema: getContainerStatusInput,
      outputSchema: getContainerStatusOutput,
      annotations: { readOnlyHint: true, openWorldHint: false },
    },
    tool<z.infer<typeof getContainerStatusInput>>(async ({ container_id }, importerId, db) => {
      const container = await resolveContainer(db, importerId, container_id);
      const [names, qr, bookingRow, eventRows] = await Promise.all([
        providerNames(db, importerId),
        latestQuoteRequest(db, container.id),
        latestBooking(db, container.id),
        db
          .from("events")
          .select("*")
          .eq("container_id", container.id)
          .order("id", { ascending: false })
          .limit(300)
          .then((r) => many(r, "events lookup")),
      ]);
      const booking = bookingRow ? toBookingView(bookingRow, bookingRow.provider_id ? names.get(bookingRow.provider_id) ?? null : null) : null;
      return {
        container: toContainerView(container, todayPortDate()),
        quote_request: qr ? toQuoteRequestView(qr) : null,
        booking,
        events: eventRows.reverse().map(toEventView),
        next_step: statusNextStep(container, booking),
      } satisfies z.infer<typeof getContainerStatusOutput>;
    }),
  );
}
