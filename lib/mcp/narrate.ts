// Plain-language status an agent can relay to its user as is. Every tool returns one as `say`, and it is
// the first text block of the result, so a chat app reads "Calling Marshgrass (Dana)..." instead of JSON.
// Short lines, the carriers' own words in quotes, the decision first, money spelled out.
import { cityFromAddress, shortDate } from "@/lib/dates";
import { stateFromAddress } from "@/lib/money";
import type { BookingView, CallView, ContainerView, EventView, QuoteView, RecommendationView } from "./schemas";

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100).replace(/\.00$/, "");
const first = (contact: string | null | undefined) => contact?.trim().split(/\s+/)[0] ?? null;
const who = (name: string, contact: string | null | undefined) => (first(contact) ? `${name} (${first(contact)})` : name);
const box = (c: ContainerView) => c.container_number_formatted;
const day = (d: string | null | undefined) => (d ? shortDate(d) : "unknown");

const CALL_WORDS: Record<string, string> = {
  queued: "dialing",
  ringing: "ringing",
  in_progress: "on the line",
  ended: "hung up",
  no_answer: "no answer",
  failed: "call did not connect",
};

export type Contacts = Map<string, string | null>; // provider_id -> contact name
/** Lane history per carrier name: typical all-in and how often they picked up after the last free day. */
export type Usual = Map<string, { medianCents: number; lateRate: number; count: number }>;

const pctOf = (x: number) => `${Math.round(x * 100)}%`;
/** "about its usual", "4% below its usual $833", "12% above its usual $833". */
function vsUsual(cents: number, u: { medianCents: number } | undefined): string {
  if (!u) return "";
  const d = ((cents - u.medianCents) / u.medianCents) * 100;
  const typical = `$${Math.round(u.medianCents / 100).toLocaleString("en-US")}`;
  return Math.abs(d) < 2 ? `about its usual ${typical} on this lane` : `${Math.abs(d).toFixed(0)}% ${d > 0 ? "above" : "below"} its usual ${typical} on this lane`;
}
function track(u: { lateRate: number; count: number } | undefined): string {
  if (!u || u.count < 5) return "";
  return u.lateRate >= 0.2 ? `late on ${pctOf(u.lateRate)} of past loads` : `on time on ${pctOf(1 - u.lateRate)} of past loads`;
}

/** What was heard so far on one call, e.g. "$650 linehaul, fuel $117, chassis $40/day x 2, pickup Tue 10/6". */
function heard(q: QuoteView): string {
  const parts: string[] = [];
  if (q.linehaul_cents != null) parts.push(`${usd(q.linehaul_cents)} linehaul`);
  if (q.fuel_surcharge_cents != null) parts.push(q.fuel_surcharge_cents === 0 ? "fuel included" : `fuel ${usd(q.fuel_surcharge_cents)}`);
  if (q.chassis_per_day_cents != null) parts.push(q.chassis_per_day_cents === 0 ? "chassis included" : `chassis ${usd(q.chassis_per_day_cents)}/day${q.est_chassis_days ? ` x ${q.est_chassis_days}` : ""}`);
  for (const a of q.accessorials) parts.push(`${a.usd} ${a.name.toLowerCase()}`);
  if (q.earliest_pickup) parts.push(`pickup ${day(q.earliest_pickup)}`);
  return parts.join(", ");
}

/** One ranked line: price, the real cost when late fees apply, and the reason in plain words. */
function rankedLine(q: QuoteView, rank: number, u?: { medianCents: number; lateRate: number; count: number }): string {
  const late = q.projected_demurrage_cents ?? 0;
  const price = late > 0 && q.all_in_cents != null ? `${usd(q.all_in_cents + late)} real cost (${usd(q.all_in_cents)} quote + ${usd(late)} est. late fees)` : q.all_in_cents != null ? usd(q.all_in_cents) : "no price";
  const when = q.earliest_pickup ? `picks up ${day(q.earliest_pickup)}` : "no pickup date";
  const fit = q.can_meet_deadline === false ? ", misses the deliver-by date" : late > 0 ? ", after the last free day" : ", on time";
  const history = [q.all_in_cents != null ? vsUsual(q.all_in_cents, u) : "", track(u)].filter(Boolean).join(", ");
  return `${rank}. ${q.provider_name}: ${price}, ${when}${fit}.${history ? ` History: ${history}.` : ""}`;
}

export function sayPayment(b: BookingView, contact: string | null | undefined): string {
  const carrier = b.provider_name ?? "the carrier";
  const payout = usd(b.amount_cents - b.platform_fee_cents);
  const fee = usd(b.platform_fee_cents);
  if (!b.payment_on_file) {
    const state = b.payment_status === "captured" ? "paid" : b.payment_status === "authorized" ? "held" : (b.payment_status ?? "pending");
    return `Recorded as ${state} in PortCall's seeded history: ${usd(b.amount_cents - b.platform_fee_cents)} to ${carrier}, ${usd(b.platform_fee_cents)} PortCall fee. It predates live payments, so no Stripe charge is behind it.`;
  }
  const tender =
    b.tender_status === "accepted" ? `${first(contact) ?? carrier} accepted the load.` : b.tender_status === "declined" ? `${carrier} declined the tender.` : `Tender emailed to ${first(contact) ?? carrier} with a one-tap Accept.`;
  switch (b.payment_status) {
    case "captured":
      return `Paid through Stripe (test mode): ${payout} to ${carrier}, ${fee} PortCall fee. ${tender}`;
    case "canceled":
      return `The ${usd(b.amount_cents)} card hold was released; nothing was charged. ${tender}`;
    case "failed":
      return `The card was declined, so nothing is held. ${tender}`;
    default:
      return `Stripe is holding ${usd(b.amount_cents)} on your card (test mode). It is charged only when ${carrier} marks the box delivered: ${payout} to them, ${fee} PortCall fee. ${tender}`;
  }
}

export function sayContainers(importer: string, containers: ContainerView[]): string {
  if (!containers.length) return `${importer} has no containers that match.`;
  const open = containers.filter((c) => c.status !== "delivered");
  const lines = open.slice(0, 6).map((c) => {
    const lfd = c.days_until_last_free_day;
    const out = c.status === "picked_up" || c.status === "delivered";
    const plural = (n: number) => `${n} day${n === 1 ? "" : "s"}`;
    const clock = out || lfd == null ? "" : lfd < 0 ? `, ${plural(-lfd)} past its last free day` : `, last free day ${day(c.last_free_day)} (${plural(lfd)} left)`;
    const city = cityFromAddress(c.destination_address);
    const state = stateFromAddress(c.destination_address);
    const dest = city ? `${city}${state ? `, ${state}` : ""}` : (c.destination_name ?? "the DC");
    return `${box(c)}: ${c.status.replace("_", " ")}, lands ${day(c.eta?.slice(0, 10))} at ${c.terminal ?? "the terminal"}${clock}, due in ${dest} by ${day(c.deliver_by)}.`;
  });
  return [`${importer} has ${open.length} container${open.length === 1 ? "" : "s"} in motion.`, ...lines].join("\n");
}

export function sayRequest(args: {
  container: ContainerView;
  calls: { provider_id: string; provider_name: string; status: string }[];
  skipped: { provider_name: string; reason: string }[];
  contacts: Contacts;
  mode: string;
  reused: boolean;
}): string {
  const { container, calls, skipped, contacts, mode, reused } = args;
  const names = calls.map((c) => who(c.provider_name, contacts.get(c.provider_id)));
  const lines = [
    reused
      ? `Already on the phone about ${box(container)} with ${names.join(", ")}.`
      : `Calling ${calls.length} carrier${calls.length === 1 ? "" : "s"} at once about ${box(container)}: ${names.join(", ")}.`,
  ];
  for (const s of skipped) lines.push(`Not calling ${s.provider_name}: ${s.reason.replace(/^Not called: /, "")}.`);
  if (mode === "replay") lines.push("This is a replay: recorded dispatcher answers, no phones ring.");
  lines.push("Quotes usually land in about two minutes. I'll tell you what each carrier says.");
  return lines.join("\n");
}

export function sayQuotes(args: {
  container: ContainerView;
  calls: CallView[];
  quotes: QuoteView[];
  recommendation: RecommendationView | null;
  booking: BookingView | null;
  contacts: Contacts;
  saidByCall: Map<string, string>;
  limitCents: number;
  runStatus: string | null;
  usual?: Usual;
}): string {
  const { container, calls, quotes, recommendation, booking, contacts, saidByCall, limitCents, runStatus } = args;
  const usual = args.usual ?? new Map();
  const byCall = new Map(quotes.map((q) => [q.call_id, q]));
  const contactOf = (providerId: string | null) => (providerId ? contacts.get(providerId) : null);

  if (recommendation?.winner_quote_id) {
    const ranked = [...quotes].filter((q) => q.rank != null).sort((a, b) => (a.rank ?? 99) - (b.rank ?? 99));
    const winner = ranked.find((q) => q.quote_id === recommendation.winner_quote_id) ?? ranked[0];
    const lines = [
      `Decision for ${box(container)}: ${winner ? `${winner.provider_name} at ${winner.all_in_cents != null ? usd(winner.all_in_cents) : "an unknown price"}` : recommendation.winner_provider_name}.`,
      recommendation.reasoning ?? "",
      ...ranked.map((q, i) => rankedLine(q, q.rank ?? i + 1, usual.get(q.provider_name))),
    ];
    const active = booking && booking.payment_status !== "canceled" && booking.payment_status !== "failed";
    if (active) {
      lines.push(`${booking.booked_by === "auto" ? "Booked automatically under your limit" : "Booked"} with ${booking.provider_name ?? "the carrier"} for ${usd(booking.amount_cents)}.`);
      lines.push(sayPayment(booking, contactOf(booking.provider_id)));
    } else if (winner?.all_in_cents != null) {
      lines.push(
        winner.all_in_cents <= limitCents
          ? `That is under your ${usd(limitCents)} limit. Say "book it" and I'll book ${winner.provider_name}.`
          : `That is over your ${usd(limitCents)} limit, so it needs your approval in PortCall before I can book it.`,
      );
    }
    return lines.filter(Boolean).join("\n");
  }

  if (runStatus === "failed") return `The quote run for ${box(container)} did not finish, so there is nothing to book yet. I can try again.`;
  if (!calls.length) {
    // Booked from an earlier quote with no run on file (seeded history): describe the booking, not "no quotes".
    if (booking) return [`${box(container)} is booked with ${booking.provider_name ?? "a carrier"} for ${usd(booking.amount_cents)} from an earlier quote.`, sayPayment(booking, contactOf(booking.provider_id))].join("\n");
    return `No quotes requested for ${box(container)} yet. Ask me to get quotes and I'll call every carrier on the lane.`;
  }

  const lines = calls.map((c) => {
    const q = byCall.get(c.call_id);
    const name = who(c.provider_name, contactOf(c.provider_id));
    const facts = q ? heard(q) : "";
    const compare = q?.all_in_cents != null ? vsUsual(q.all_in_cents, usual.get(c.provider_name)) : "";
    const said = saidByCall.get(c.call_id);
    const total = q?.all_in_cents != null ? `. ${usd(q.all_in_cents)} all-in so far${compare ? `, ${compare}` : ""}` : "";
    return `${name}: ${CALL_WORDS[c.status] ?? c.status}${facts ? `. Heard ${facts}` : ""}${total}${said ? `. "${said}"` : ""}`;
  });
  const done = calls.every((c) => c.status === "ended" || c.status === "no_answer" || c.status === "failed");
  lines.push(done ? "All calls are done. Reading each price from the call and ranking them by real cost now, about 10 seconds." : "Still on the phone. I'll report as soon as there's news.");
  return lines.join("\n");
}

export function sayBooking(b: BookingView, container: ContainerView, contact: string | null | undefined, alreadyBooked: boolean): string {
  return [
    alreadyBooked ? `${box(container)} was already booked with ${b.provider_name ?? "the carrier"} for ${usd(b.amount_cents)}; nothing new was charged.` : `Booked ${b.provider_name ?? "the carrier"} for ${usd(b.amount_cents)} on ${box(container)}.`,
    sayPayment(b, contact),
  ].join("\n");
}

export function sayStatus(container: ContainerView, booking: BookingView | null, events: EventView[], contact: string | null | undefined): string {
  const time = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString("en-US", { weekday: "short", month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" }) : "";
  const latest = events
    .filter((e) => e.type !== "field_heard")
    .slice(-5)
    .map((e) => `${time(e.at)} ${e.label}`);
  const lines = [`${box(container)}: ${container.status.replace("_", " ")}.`];
  if (booking) lines.push(sayPayment(booking, contact));
  if (latest.length) lines.push(`Latest: ${latest.join("; ")}.`);
  return lines.join("\n");
}
