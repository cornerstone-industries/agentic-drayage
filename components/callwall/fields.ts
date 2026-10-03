import { daysBetween, formatUsd, type Accessorial } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import type { QuoteField } from "@/lib/ai/types";
import type { Quote } from "@/lib/types";

export const FIELD_ROWS: { key: QuoteField; label: string; short: string }[] = [
  { key: "linehaul_cents", label: "Linehaul", short: "Linehaul" },
  { key: "fuel_surcharge_cents", label: "Fuel", short: "Fuel" },
  { key: "chassis_per_day_cents", label: "Chassis", short: "Chassis" },
  { key: "accessorials", label: "Extra fees", short: "Fees" },
  { key: "earliest_pickup", label: "Earliest pickup", short: "Pickup" },
  { key: "can_meet_deadline", label: "Meets deliver-by", short: "Deadline" },
];

export function fieldLabel(key: string): string {
  if (key === "est_chassis_days") return "Chassis days";
  return FIELD_ROWS.find((f) => f.key === key)?.label ?? key;
}

export type FieldDisplay = { text: string; tone: "fg" | "signal" | "alarm" | "muted"; note?: string };

export function heardFields(q: Quote | undefined): Set<QuoteField> {
  const sources = (q?.field_sources ?? {}) as Record<string, number>;
  const out = new Set<QuoteField>();
  if (!q) return out;
  if (q.linehaul_cents != null) out.add("linehaul_cents");
  if (q.fuel_surcharge_cents != null) out.add("fuel_surcharge_cents");
  if (q.chassis_per_day_cents != null || q.est_chassis_days != null) out.add("chassis_per_day_cents");
  if (sources.accessorials != null) out.add("accessorials");
  if (q.earliest_pickup) out.add("earliest_pickup");
  if (q.can_meet_deadline != null) out.add("can_meet_deadline");
  return out;
}

export function displayField(key: QuoteField, q: Quote, lastFreeDay: string | null): FieldDisplay | null {
  switch (key) {
    case "linehaul_cents":
      return q.linehaul_cents == null ? null : { text: formatUsd(q.linehaul_cents), tone: "fg" };
    case "fuel_surcharge_cents": {
      if (q.fuel_surcharge_cents == null) return null;
      if (q.fuel_surcharge_cents === 0) return { text: "Included", tone: "muted" };
      const pct = q.linehaul_cents ? Math.round((q.fuel_surcharge_cents / q.linehaul_cents) * 100) : null;
      return { text: formatUsd(q.fuel_surcharge_cents), tone: "fg", note: pct ? `${pct}% of linehaul` : undefined };
    }
    case "chassis_per_day_cents": {
      if (q.chassis_per_day_cents == null && q.est_chassis_days == null) return null;
      if (!q.chassis_per_day_cents) return { text: "Included", tone: "muted" };
      const days = q.est_chassis_days ?? 0;
      return { text: `${formatUsd(q.chassis_per_day_cents)}/day`, tone: "fg", note: days ? `x ${days} days = ${formatUsd(q.chassis_per_day_cents * days)}` : "days not given" };
    }
    case "accessorials": {
      const sources = (q.field_sources ?? {}) as Record<string, number>;
      if (sources.accessorials == null) return null;
      const list = (q.accessorials as Accessorial[] | null) ?? [];
      if (!list.length) return { text: "None", tone: "muted" };
      const total = list.reduce((s, a) => s + a.cents, 0);
      return { text: `+${formatUsd(total)}`, tone: "alarm", note: list.map((a) => a.name).join(", ") };
    }
    case "earliest_pickup": {
      if (!q.earliest_pickup) return null;
      const late = lastFreeDay ? daysBetween(lastFreeDay, q.earliest_pickup) : 0;
      return late > 0
        ? { text: shortDate(q.earliest_pickup), tone: "alarm", note: `${late} day${late === 1 ? "" : "s"} after LFD` }
        : { text: shortDate(q.earliest_pickup), tone: "signal", note: "before LFD" };
    }
    case "can_meet_deadline":
      return q.can_meet_deadline == null ? null : q.can_meet_deadline ? { text: "Yes", tone: "signal" } : { text: "No", tone: "alarm" };
    default:
      return null;
  }
}

/** Why a quote lost, in the words a coordinator would use. */
export function lossReasons(q: Quote, winner: Quote | undefined): string[] {
  const out: string[] = [];
  if ((q.projected_demurrage_cents ?? 0) > 0) out.push(`Misses LFD: +${formatUsd(q.projected_demurrage_cents)} demurrage`);
  if (q.can_meet_deadline === false) out.push("Misses deliver-by");
  const fees = ((q.accessorials as Accessorial[] | null) ?? []).reduce((s, a) => s + a.cents, 0);
  if (fees > 0) out.push(`+${formatUsd(fees)} extra fees`);
  if (!out.length && winner && q.risk_adjusted_cents != null && winner.risk_adjusted_cents != null) {
    out.push(`${formatUsd(q.risk_adjusted_cents - winner.risk_adjusted_cents)} more`);
  }
  return out;
}
