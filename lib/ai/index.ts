import { NotConfiguredError, aiGatewayConfigured, devFixtureAiEnabled } from "@/lib/env";
import type {
  ExtractedQuote,
  ExtractionContext,
  RankableQuote,
  RecommendationContext,
  RecommendationResult,
  TranscriptLineInput,
} from "./types";

export type AiMode = "claude" | "fixture" | "unconfigured";

/** Real Claude whenever gateway credentials exist; the DEV ONLY fixture only when explicitly enabled. */
export function aiMode(): AiMode {
  if (aiGatewayConfigured()) return "claude";
  if (devFixtureAiEnabled()) return "fixture";
  return "unconfigured";
}

export async function extractQuote(lines: TranscriptLineInput[], ctx: ExtractionContext): Promise<ExtractedQuote> {
  const mode = aiMode();
  if (mode === "claude") return (await import("./claude")).extractQuoteWithClaude(lines, ctx);
  if (mode === "fixture") return (await import("./fixture")).extractQuoteFromFixture(lines, ctx);
  throw new NotConfiguredError("AI Gateway (Claude extraction)", ["AI_GATEWAY_API_KEY"]);
}

export async function recommendQuotes(quotes: RankableQuote[], ctx: RecommendationContext): Promise<RecommendationResult> {
  const mode = aiMode();
  if (mode === "claude") return (await import("./claude")).recommendWithClaude(quotes, ctx);
  if (mode === "fixture") return (await import("./fixture")).recommendFromFixture(quotes, ctx);
  throw new NotConfiguredError("AI Gateway (Claude recommendation)", ["AI_GATEWAY_API_KEY"]);
}
