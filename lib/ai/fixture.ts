// DEV ONLY. Deterministic stand-ins for Claude, used when DEV_ONLY_FIXTURE_AI=true and no AI Gateway
// credentials exist, so the UI can animate end to end before keys arrive.
// The extractor only understands the replay scripts (it reads the annotations in lib/replay/script.ts);
// on any other transcript it hears nothing. Real Claude (lib/ai/claude.ts) replaces both automatically
// once AI_GATEWAY_API_KEY is set. Never enable this in production.
import { buildScripts } from "@/lib/replay/script";
import { formatUsd, type Accessorial } from "@/lib/money";
import { shortDate } from "@/lib/dates";
import { daysBetween } from "@/lib/money";
import type { ExtractedQuote, QuoteExtractor, QuoteField, QuoteRecommender, RankableQuote } from "./types";

export const extractQuoteFromFixture: QuoteExtractor = async (lines, ctx) => {
  console.warn("[DEV ONLY] fixture extractor in use: set AI_GATEWAY_API_KEY for real Claude extraction");
  const annotated = new Map<string, NonNullable<ReturnType<typeof buildScripts>[number]["lines"][number]["fields"]>>();
  for (const script of buildScripts(ctx.container, ctx.importerName)) {
    for (const line of script.lines) if (line.role === "user" && line.fields) annotated.set(line.text, line.fields);
  }

  const out: ExtractedQuote = {
    linehaul_cents: null,
    fuel_surcharge_cents: null,
    chassis_per_day_cents: null,
    est_chassis_days: null,
    accessorials: null,
    earliest_pickup: null,
    can_meet_deadline: null,
    notes: null,
    field_sources: {},
  };
  for (const line of lines) {
    if (line.role !== "user") continue;
    const fields = annotated.get(line.text);
    if (!fields) continue;
    for (const [field, value] of Object.entries(fields) as [QuoteField, unknown][]) {
      (out as Record<string, unknown>)[field] = field === "accessorials" ? (value as Accessorial[]) : value;
      out.field_sources[field] = line.id;
    }
  }
  return out;
};

export const recommendFromFixture: QuoteRecommender = async (quotes, ctx) => {
  console.warn("[DEV ONLY] fixture recommender in use: set AI_GATEWAY_API_KEY for real Claude ranking");
  const ranked = [...quotes].sort(
    (a, b) =>
      a.risk_adjusted_cents - b.risk_adjusted_cents ||
      Number(b.can_meet_deadline === true) - Number(a.can_meet_deadline === true),
  );
  const winner = ranked[0];
  const lfd = ctx.container.last_free_day;
  const sentences: string[] = [];
  sentences.push(
    `${winner.provider_name} wins at ${formatUsd(winner.all_in_cents)} all-in with pickup ${shortDate(winner.earliest_pickup)}${
      lfd ? `, inside the ${shortDate(lfd)} last free day` : ""
    }.`,
  );
  const cheapest = [...quotes].sort((a, b) => a.all_in_cents - b.all_in_cents)[0];
  if (cheapest.quote_id !== winner.quote_id && cheapest.projected_demurrage_cents > 0 && lfd && cheapest.earliest_pickup) {
    const days = daysBetween(lfd, cheapest.earliest_pickup);
    sentences.push(
      `${cheapest.provider_name} is ${formatUsd(winner.all_in_cents - cheapest.all_in_cents)} cheaper on paper but can't pick up until ${days} day${
        days === 1 ? "" : "s"
      } after the last free day; ${formatUsd(cheapest.projected_demurrage_cents)} of estimated demurrage makes it ${formatUsd(
        cheapest.risk_adjusted_cents - winner.risk_adjusted_cents,
      )} more${cheapest.can_meet_deadline === false ? ", and it misses the deliver-by date" : ""}.`,
    );
  }
  const rest = ranked.filter((q) => q.quote_id !== winner.quote_id && q.quote_id !== cheapest.quote_id);
  for (const q of rest) {
    const fees = q.accessorials.reduce((s, a) => s + a.cents, 0);
    sentences.push(
      fees > 0
        ? `${q.provider_name} lands at ${formatUsd(q.all_in_cents)} once the ${formatUsd(fees)} in extra fees are counted.`
        : `${q.provider_name} comes in at ${formatUsd(q.all_in_cents)}.`,
    );
  }
  return { ranked_quote_ids: ranked.map((q: RankableQuote) => q.quote_id), winner_quote_id: winner.quote_id, reasoning: sentences.slice(0, 3).join(" ") };
};
