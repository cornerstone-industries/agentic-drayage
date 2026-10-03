import type { Accessorial } from "@/lib/money";

/** Quote fields the voice agent listens for. field_sources maps each to the transcript line that produced it. */
export const QUOTE_FIELDS = [
  "linehaul_cents",
  "fuel_surcharge_cents",
  "chassis_per_day_cents",
  "est_chassis_days",
  "accessorials",
  "earliest_pickup",
  "can_meet_deadline",
] as const;
export type QuoteField = (typeof QUOTE_FIELDS)[number];

export type TranscriptLineInput = { id: number; role: "assistant" | "user"; text: string };

export type ContainerContext = {
  container_number: string;
  size: string | null;
  terminal: string | null;
  eta: string | null; // ISO timestamp
  last_free_day: string | null; // YYYY-MM-DD
  deliver_by: string | null; // YYYY-MM-DD
  destination_name: string | null;
  destination_address: string | null;
};

export type ExtractionContext = {
  today: string; // YYYY-MM-DD, for resolving "Tuesday" into a date
  providerName: string;
  importerName: string;
  container: ContainerContext;
};

/**
 * What one extraction pass returns. null = not heard yet. Money is integer cents; a percent fuel
 * surcharge must already be converted to cents against the linehaul. accessorials: [] means the
 * dispatcher confirmed there are no extra fees; null means not discussed yet.
 */
export type ExtractedQuote = {
  linehaul_cents: number | null;
  fuel_surcharge_cents: number | null;
  chassis_per_day_cents: number | null;
  est_chassis_days: number | null;
  accessorials: Accessorial[] | null;
  earliest_pickup: string | null; // YYYY-MM-DD
  can_meet_deadline: boolean | null;
  notes: string | null;
  field_sources: Partial<Record<QuoteField, number>>; // transcript_lines.id
};

export type QuoteExtractor = (lines: TranscriptLineInput[], ctx: ExtractionContext) => Promise<ExtractedQuote>;

export type RankableQuote = {
  quote_id: string;
  provider_name: string;
  linehaul_cents: number | null;
  fuel_surcharge_cents: number | null;
  chassis_per_day_cents: number | null;
  est_chassis_days: number | null;
  accessorials: Accessorial[];
  all_in_cents: number;
  projected_demurrage_cents: number;
  risk_adjusted_cents: number;
  earliest_pickup: string | null;
  can_meet_deadline: boolean | null;
  notes: string | null;
};

export type RecommendationContext = {
  today: string;
  container: ContainerContext;
  demurragePerDayCents: number;
};

export type RecommendationResult = {
  ranked_quote_ids: string[]; // every input quote_id exactly once, best first
  winner_quote_id: string;
  reasoning: string; // 2 to 3 plain-English sentences with dollar amounts
};

export type QuoteRecommender = (quotes: RankableQuote[], ctx: RecommendationContext) => Promise<RecommendationResult>;
