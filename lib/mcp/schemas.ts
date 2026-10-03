// Zod schemas for the five PortCall MCP tools. lib/mcp/tools.ts registers them as the tools'
// inputSchema and outputSchema; scripts/test-mcp.ts validates what comes back over the wire against
// the same objects. Every money value is integer cents next to a formatted dollar string.
import { z } from "zod";

export const TOOL_NAMES = ["list_containers", "request_quotes", "get_quotes", "book_quote", "get_container_status"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export const CONTAINER_STATUSES = ["inbound", "quoting", "quoted", "booked", "accepted", "picked_up", "delivered"] as const;

const cents = z.number().nullable();
const usd = z.string().nullable();
const text = z.string().nullable();

const containerRef = z
  .string()
  .describe(
    'The container: its PortCall id (uuid, from list_containers) or its container number in any format, e.g. "PHGU4829137" or "PHGU 482913-7".',
  );

export const containerViewSchema = z.object({
  container_id: z.string().describe("PortCall id (uuid). Accepted anywhere a container_id is expected."),
  container_number: z.string().describe("Container number without spaces, e.g. PHGU4829137."),
  container_number_formatted: z.string().describe("Container number as stenciled on the box, e.g. PHGU 482913-7."),
  size: text,
  port: text,
  terminal: text,
  vessel: text,
  eta: text.describe("Vessel arrival, ISO timestamp."),
  last_free_day: text.describe("Last free day (YYYY-MM-DD). Pickups after this day cost demurrage."),
  deliver_by: text.describe("Date the importer needs the container at its DC (YYYY-MM-DD)."),
  destination_name: text,
  destination_address: text,
  status: z.string().describe("inbound, quoting, quoted, booked, accepted, picked_up or delivered."),
  days_until_eta: z.number().nullable().describe("Negative once the vessel has arrived."),
  days_until_last_free_day: z.number().nullable().describe("Negative once the last free day has passed."),
});

export const accessorialViewSchema = z.object({ name: z.string(), cents: z.number(), usd: z.string() });

export const quoteViewSchema = z.object({
  quote_id: z.string().describe("Pass this to book_quote."),
  call_id: text,
  provider_id: text,
  provider_name: z.string(),
  rank: z.number().nullable().describe("1 is the recommended winner. Null until Claude has ranked the quotes."),
  is_recommended: z.boolean(),
  linehaul_cents: cents,
  linehaul_usd: usd,
  fuel_surcharge_cents: cents,
  fuel_surcharge_usd: usd,
  chassis_per_day_cents: cents,
  chassis_per_day_usd: usd,
  est_chassis_days: z.number().nullable(),
  chassis_total_cents: cents,
  chassis_total_usd: usd,
  accessorials: z.array(accessorialViewSchema).describe("Other fees the dispatcher named (pre-pull, storage, wait time...)."),
  accessorials_total_cents: z.number(),
  accessorials_total_usd: z.string(),
  all_in_cents: cents.describe("Linehaul + fuel + chassis + other fees. Null until a linehaul has been heard."),
  all_in_usd: usd,
  earliest_pickup: text.describe("YYYY-MM-DD"),
  can_meet_deadline: z.boolean().nullable().describe("Whether the provider can deliver by the deliver-by date. Null if not discussed."),
  demurrage_days: z.number().nullable().describe("Days the earliest pickup lands after the last free day."),
  projected_demurrage_cents: cents.describe("Estimated demurrage if the pickup lands after the last free day."),
  projected_demurrage_usd: usd,
  risk_adjusted_cents: cents.describe("All-in plus projected demurrage. The number quotes are ranked on."),
  risk_adjusted_usd: usd,
  notes: text,
  missing_fields: z.array(z.string()).describe("Quote fields not heard yet while the call is still going."),
  updated_at: text,
});

export const callViewSchema = z.object({
  call_id: z.string(),
  provider_id: text,
  provider_name: z.string(),
  status: z.string().describe("queued, ringing, in_progress, ended, failed or no_answer."),
  started_at: text,
  ended_at: text,
  summary: text,
  has_quote: z.boolean().describe("True once a price has been heard on this call."),
});

export const quoteRequestViewSchema = z.object({
  quote_request_id: z.string(),
  status: z.string().describe("calling, complete or failed."),
  triggered_by: text,
  created_at: text,
  completed_at: text,
});

export const recommendationViewSchema = z.object({
  recommendation_id: z.string(),
  winner_quote_id: text,
  winner_provider_name: text,
  ranked_quote_ids: z.array(z.string()).describe("Best first."),
  ranking: z.array(
    z.object({
      rank: z.number(),
      quote_id: z.string(),
      provider_name: z.string(),
      all_in_cents: cents,
      all_in_usd: usd,
      risk_adjusted_cents: cents,
      risk_adjusted_usd: usd,
    }),
  ),
  reasoning: text.describe("Claude's plain-English explanation of the ranking."),
  created_at: text,
});

export const bookingViewSchema = z.object({
  booking_id: z.string(),
  quote_id: text,
  provider_id: text,
  provider_name: text,
  amount_cents: z.number(),
  amount_usd: z.string(),
  platform_fee_cents: z.number(),
  platform_fee_usd: z.string(),
  payment_status: text.describe("authorized, captured, canceled or failed."),
  tender_status: text.describe("sent, accepted or declined."),
  booked_by: text.describe("human, agent or auto."),
  created_at: text,
  accepted_at: text,
});

export const eventViewSchema = z.object({
  event_id: z.number(),
  type: z.string(),
  label: z.string(),
  at: text,
  payload: z.record(z.string(), z.unknown()),
});

// list_containers
export const listContainersInput = z.object({
  status: z.enum(CONTAINER_STATUSES).optional().describe("Only return containers in this status."),
});
export const listContainersOutput = z.object({
  importer_name: z.string(),
  today: z.string().describe("Today's date in port time (YYYY-MM-DD)."),
  count: z.number(),
  containers: z.array(containerViewSchema),
  next_step: z.string(),
});

// request_quotes
export const requestQuotesInput = z.object({ container_id: containerRef });
export const requestQuotesOutput = z.object({
  quote_request_id: z.string(),
  mode: z.enum(["live", "replay"]).describe("replay means recorded dispatcher scripts, not live phone calls."),
  reused: z.boolean().describe("True when a quote request was already in flight and no new calls were placed."),
  container: containerViewSchema,
  calls: z.array(z.object({ call_id: z.string(), provider_id: z.string(), provider_name: z.string(), status: z.string() })),
  skipped: z.array(z.object({ provider_id: z.string(), provider_name: z.string(), reason: z.string() })),
  next_step: z.string(),
});

// get_quotes
export const getQuotesInput = z.object({ container_id: containerRef });
export const getQuotesOutput = z.object({
  container: containerViewSchema,
  auto_book_limit_cents: z.number(),
  auto_book_limit_usd: z.string(),
  demurrage_per_day_cents: z.number().describe("Estimate used to price pickups after the last free day."),
  demurrage_per_day_usd: z.string(),
  quote_request: quoteRequestViewSchema.nullable(),
  calls: z.array(callViewSchema),
  quotes: z.array(quoteViewSchema),
  recommendation: recommendationViewSchema.nullable(),
  booking: bookingViewSchema.nullable(),
  next_step: z.string().describe("What to do next: keep polling, book, or stop."),
});

// book_quote
export const bookQuoteInput = z.object({
  quote_id: z.string().describe("A quote_id from get_quotes. The recommended winner is recommendation.winner_quote_id."),
});
export const bookQuoteOutput = z.object({
  already_booked: z.boolean().describe("True when this quote was already booked and nothing new was charged."),
  booking: bookingViewSchema,
  container: containerViewSchema,
  payment: z.object({
    payment_status: text,
    stripe_status: z.string().describe("Stripe PaymentIntent status, e.g. requires_capture."),
    note: z.string(),
  }),
  next_step: z.string(),
});

// get_container_status
export const getContainerStatusInput = z.object({ container_id: containerRef });
export const getContainerStatusOutput = z.object({
  container: containerViewSchema,
  quote_request: quoteRequestViewSchema.nullable(),
  booking: bookingViewSchema.nullable(),
  events: z.array(eventViewSchema).describe("Oldest first."),
  next_step: z.string(),
});

export type ContainerView = z.infer<typeof containerViewSchema>;
export type QuoteView = z.infer<typeof quoteViewSchema>;
export type CallView = z.infer<typeof callViewSchema>;
export type QuoteRequestView = z.infer<typeof quoteRequestViewSchema>;
export type RecommendationView = z.infer<typeof recommendationViewSchema>;
export type BookingView = z.infer<typeof bookingViewSchema>;
export type EventView = z.infer<typeof eventViewSchema>;

export const TOOL_OUTPUT_SCHEMAS = {
  list_containers: listContainersOutput,
  request_quotes: requestQuotesOutput,
  get_quotes: getQuotesOutput,
  book_quote: bookQuoteOutput,
  get_container_status: getContainerStatusOutput,
} as const satisfies Record<ToolName, z.ZodType>;
