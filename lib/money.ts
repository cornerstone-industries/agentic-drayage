// Money and date math for quotes. Totals are computed here, never by the LLM.

export type Accessorial = { name: string; cents: number };

export type QuoteMoneyFields = {
  linehaul_cents: number | null;
  fuel_surcharge_cents: number | null;
  chassis_per_day_cents: number | null;
  est_chassis_days: number | null;
  accessorials: Accessorial[] | null;
  earliest_pickup: string | null; // YYYY-MM-DD
};

export type QuoteTotals = {
  all_in_cents: number | null;
  projected_demurrage_cents: number | null;
  risk_adjusted_cents: number | null;
  demurrage_days: number;
};

/** Whole days from date a to date b (YYYY-MM-DD or ISO), b minus a. */
export function daysBetween(a: string, b: string): number {
  const da = Date.UTC(+a.slice(0, 4), +a.slice(5, 7) - 1, +a.slice(8, 10));
  const db = Date.UTC(+b.slice(0, 4), +b.slice(5, 7) - 1, +b.slice(8, 10));
  return Math.round((db - da) / 86_400_000);
}

export function chassisTotalCents(q: Pick<QuoteMoneyFields, "chassis_per_day_cents" | "est_chassis_days">): number {
  return (q.chassis_per_day_cents ?? 0) * (q.est_chassis_days ?? 0);
}

export function accessorialsTotalCents(list: Accessorial[] | null | undefined): number {
  return (list ?? []).reduce((sum, a) => sum + (Number.isFinite(a.cents) ? a.cents : 0), 0);
}

/**
 * all-in = linehaul + fuel + chassis/day x days + accessorials (null until a linehaul is heard)
 * demurrage = days the earliest pickup lands past the last free day x per-day estimate
 * risk-adjusted = all-in + projected demurrage
 */
export function computeQuoteTotals(
  q: QuoteMoneyFields,
  lastFreeDay: string | null,
  demurragePerDay: number,
): QuoteTotals {
  const all_in_cents =
    q.linehaul_cents == null
      ? null
      : q.linehaul_cents + (q.fuel_surcharge_cents ?? 0) + chassisTotalCents(q) + accessorialsTotalCents(q.accessorials);

  let demurrage_days = 0;
  let projected_demurrage_cents: number | null = null;
  if (q.earliest_pickup && lastFreeDay) {
    demurrage_days = Math.max(0, daysBetween(lastFreeDay, q.earliest_pickup));
    projected_demurrage_cents = demurrage_days * demurragePerDay;
  }

  const risk_adjusted_cents = all_in_cents == null ? null : all_in_cents + (projected_demurrage_cents ?? 0);
  return { all_in_cents, projected_demurrage_cents, risk_adjusted_cents, demurrage_days };
}

export function platformFeeCents(amountCents: number, bps: number): number {
  return Math.round((amountCents * bps) / 10_000);
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" });
const usdWhole = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export function formatUsd(cents: number | null | undefined, opts: { whole?: boolean } = {}): string {
  if (cents == null) return "--";
  const value = cents / 100;
  if (opts.whole || Number.isInteger(value)) return usdWhole.format(value);
  return usd.format(value);
}

/** "PHGU4829137" -> "PHGU 482913-7", the way it is stenciled on the box. */
export function formatContainerNumber(n: string): string {
  const clean = n.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (clean.length !== 11) return n;
  return `${clean.slice(0, 4)} ${clean.slice(4, 10)}-${clean.slice(10)}`;
}

/** Two-letter state from an address like "500 Oakley Industrial Blvd, Fairburn, GA 30213". */
export function stateFromAddress(address: string | null | undefined): string | null {
  const m = address?.match(/,\s*([A-Z]{2})\s+\d{5}/) ?? address?.match(/,\s*([A-Z]{2})\b/);
  return m ? m[1] : null;
}
