// Lane history: what each carrier usually charges on a lane (port to destination city, box size) and how
// reliable they are, from lane_rates. Every finished quote run records its quotes here, so the history
// grows with each call; seeded rows are synthetic and labeled in the UI.
import type { SupabaseClient } from "@supabase/supabase-js";
import { cityFromAddress, todayPortDate } from "@/lib/dates";
import { accessorialsTotalCents, chassisTotalCents, daysBetween, stateFromAddress, type Accessorial } from "@/lib/money";

const DAY = 86_400_000;

export type LanePoint = { date: string; allInCents: number; late: boolean; won: boolean; source: "call" | "seed" };
export type CarrierHistory = {
  providerId: string | null;
  name: string;
  points: LanePoint[];
  medianCents: number;
  lowCents: number;
  highCents: number;
  trendPct: number | null;
  lateRate: number;
  winRate: number;
  count: number;
};
export type LaneHistory = {
  city: string;
  state: string;
  size: string;
  days: number;
  from: string;
  to: string;
  carriers: CarrierHistory[];
  seedCount: number;
  callCount: number;
};

type LaneRow = {
  provider_id: string | null;
  provider_name: string;
  quoted_on: string;
  all_in_cents: number;
  pickup_vs_lfd_days: number | null;
  won: boolean;
  source: "call" | "seed";
};

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return Math.round(sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo));
}
const median = (xs: number[]) => quantile([...xs].sort((a, b) => a - b), 0.5);

export function laneOf(container: { destination_address: string | null; size: string | null }): { city: string; state: string; size: string } | null {
  const city = cityFromAddress(container.destination_address);
  const state = stateFromAddress(container.destination_address);
  return city && state ? { city, state, size: container.size ?? "40HC" } : null;
}

export async function getLaneHistory(
  client: SupabaseClient<never> | SupabaseClient,
  importerId: string,
  lane: { city: string; state: string; size: string },
  days = 90,
): Promise<LaneHistory | null> {
  const db = client as unknown as SupabaseClient;
  const to = todayPortDate();
  const from = new Date(Date.parse(to) - days * DAY).toISOString().slice(0, 10);
  const { data, error } = await db
    .from("lane_rates")
    .select("provider_id, provider_name, quoted_on, all_in_cents, pickup_vs_lfd_days, won, source")
    .eq("importer_id", importerId)
    .eq("dest_city", lane.city)
    .eq("dest_state", lane.state)
    .eq("size", lane.size)
    .gte("quoted_on", from)
    .order("quoted_on");
  if (error || !data?.length) return null;
  const rows = data as LaneRow[];

  const byCarrier = new Map<string, LaneRow[]>();
  for (const r of rows) byCarrier.set(r.provider_name, [...(byCarrier.get(r.provider_name) ?? []), r]);
  const cut30 = new Date(Date.parse(to) - 30 * DAY).toISOString().slice(0, 10);
  const cut60 = new Date(Date.parse(to) - 60 * DAY).toISOString().slice(0, 10);

  const carriers = [...byCarrier.entries()].map(([name, rs]): CarrierHistory => {
    const prices = rs.map((r) => r.all_in_cents).sort((a, b) => a - b);
    const recent = rs.filter((r) => r.quoted_on >= cut30).map((r) => r.all_in_cents);
    const prior = rs.filter((r) => r.quoted_on >= cut60 && r.quoted_on < cut30).map((r) => r.all_in_cents);
    const trendPct = recent.length && prior.length ? ((median(recent) - median(prior)) / median(prior)) * 100 : null;
    return {
      providerId: rs.find((r) => r.provider_id)?.provider_id ?? null,
      name,
      points: rs.map((r) => ({ date: r.quoted_on, allInCents: r.all_in_cents, late: (r.pickup_vs_lfd_days ?? 0) > 0, won: r.won, source: r.source })),
      medianCents: quantile(prices, 0.5),
      lowCents: quantile(prices, 0.25),
      highCents: quantile(prices, 0.75),
      trendPct,
      lateRate: rs.filter((r) => (r.pickup_vs_lfd_days ?? 0) > 0).length / rs.length,
      winRate: rs.filter((r) => r.won).length / rs.length,
      count: rs.length,
    };
  });
  carriers.sort((a, b) => b.winRate - a.winRate || a.medianCents - b.medianCents);

  return {
    ...lane,
    days,
    from,
    to,
    carriers,
    seedCount: rows.filter((r) => r.source === "seed").length,
    callCount: rows.filter((r) => r.source === "call").length,
  };
}

type RecordableQuote = {
  id: string;
  provider_id: string | null;
  provider?: { name: string } | null;
  linehaul_cents: number | null;
  fuel_surcharge_cents: number | null;
  chassis_per_day_cents: number | null;
  est_chassis_days: number | null;
  accessorials: unknown;
  all_in_cents: number | null;
  earliest_pickup: string | null;
  can_meet_deadline: boolean | null;
};

/** After a run is ranked: add its quotes to the lane history. Never throws; history must not break a run. */
export async function recordLaneRates(
  client: SupabaseClient<never> | SupabaseClient,
  args: {
    importerId: string;
    container: { port: string | null; terminal: string | null; destination_address: string | null; size: string | null; last_free_day: string | null };
    quotes: RecordableQuote[];
    winnerId: string | null;
  },
): Promise<void> {
  try {
    const db = client as unknown as SupabaseClient;
    const lane = laneOf(args.container);
    if (!lane) return;
    const rows = args.quotes
      .filter((q) => q.all_in_cents != null)
      .map((q) => {
        const chassisKnown = q.chassis_per_day_cents != null && q.est_chassis_days != null;
        return {
          importer_id: args.importerId,
          provider_id: q.provider_id,
          provider_name: q.provider?.name ?? "Carrier",
          origin: args.container.port ?? "Charleston",
          terminal: args.container.terminal,
          dest_city: lane.city,
          dest_state: lane.state,
          size: lane.size,
          quoted_on: todayPortDate(),
          linehaul_cents: q.linehaul_cents,
          fuel_cents: q.fuel_surcharge_cents,
          chassis_cents: chassisKnown ? chassisTotalCents(q) : null,
          accessorials_cents: accessorialsTotalCents((Array.isArray(q.accessorials) ? q.accessorials : []) as Accessorial[]),
          all_in_cents: q.all_in_cents!,
          pickup_vs_lfd_days: q.earliest_pickup && args.container.last_free_day ? daysBetween(args.container.last_free_day, q.earliest_pickup) : null,
          met_deadline: q.can_meet_deadline,
          won: q.id === args.winnerId,
          source: "call",
          quote_id: q.id,
        };
      });
    if (!rows.length) return;
    const { error } = await db.from("lane_rates").upsert(rows, { onConflict: "quote_id" });
    if (error) console.error("[lanes] could not record lane history:", error.message);
  } catch (err) {
    console.error("[lanes] could not record lane history:", err instanceof Error ? err.message : err);
  }
}
