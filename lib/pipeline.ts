// The quote pipeline after the phones ring: live extraction per call, then ranking once every call
// is done, then auto-book under the importer's limit. Runs identically for live Vapi calls and replay.
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/events";
import { aiMode, extractQuote, recommendQuotes } from "@/lib/ai";
import { recordLaneRates } from "@/lib/lanes";
import { QUOTE_FIELDS, type ContainerContext, type ExtractedQuote, type RankableQuote, type TranscriptLineInput } from "@/lib/ai/types";
import { computeQuoteTotals, formatUsd, type Accessorial } from "@/lib/money";
import { demurragePerDayCents } from "@/lib/env";
import { todayPortDate } from "@/lib/dates";
import type { Json } from "@/lib/database.types";
import type { Container, Quote } from "@/lib/types";

const TERMINAL_CALL = new Set(["ended", "failed", "no_answer"]);

export function containerContext(c: Container): ContainerContext {
  return {
    container_number: c.container_number,
    size: c.size,
    terminal: c.terminal,
    eta: c.eta,
    last_free_day: c.last_free_day,
    deliver_by: c.deliver_by,
    destination_name: c.destination_name,
    destination_address: c.destination_address,
  };
}

async function loadCall(db: AdminClient, callId: string) {
  const { data: call, error } = await db
    .from("calls")
    .select("*, provider:providers(*), quote_request:quote_requests(*, container:containers(*, importer:importers(*)))")
    .eq("id", callId)
    .single();
  if (error || !call) throw new Error(`call ${callId} not found: ${error?.message}`);
  const qr = call.quote_request!;
  const container = qr.container!;
  return { call, provider: call.provider!, qr, container, importer: container.importer! };
}

function sameValue(a: unknown, b: unknown): boolean {
  return JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
}

/** One extraction pass over the call's transcript so far. Newly heard fields stamp in via field_heard events. */
export async function runExtraction(callId: string): Promise<void> {
  const db = createAdminClient();
  const { call, provider, container, importer } = await loadCall(db, callId);

  const { data: lines, error: linesErr } = await db.from("transcript_lines").select("id, role, text").eq("call_id", callId).order("id");
  if (linesErr) throw linesErr;
  if (!lines?.length) return;

  const extracted: ExtractedQuote = await extractQuote(lines as TranscriptLineInput[], {
    today: todayPortDate(),
    providerName: provider.name,
    importerName: importer.name,
    container: containerContext(container),
  });

  const { data: existing } = await db.from("quotes").select("*").eq("call_id", callId).maybeSingle();
  const prevSources = (existing?.field_sources as Record<string, number> | null) ?? {};

  // Merge: a newly heard value wins; silence never erases what was already heard.
  const merged = {
    linehaul_cents: extracted.linehaul_cents ?? existing?.linehaul_cents ?? null,
    fuel_surcharge_cents: extracted.fuel_surcharge_cents ?? existing?.fuel_surcharge_cents ?? null,
    chassis_per_day_cents: extracted.chassis_per_day_cents ?? existing?.chassis_per_day_cents ?? null,
    est_chassis_days: extracted.est_chassis_days ?? existing?.est_chassis_days ?? null,
    // The column defaults to [], so "discussed" is tracked by field_sources, not by the value.
    accessorials: (extracted.accessorials ??
      (prevSources.accessorials != null ? (existing?.accessorials as Accessorial[] | null) : null) ??
      null) as Accessorial[] | null,
    earliest_pickup: extracted.earliest_pickup ?? existing?.earliest_pickup ?? null,
    can_meet_deadline: extracted.can_meet_deadline ?? existing?.can_meet_deadline ?? null,
  };
  const sources: Record<string, number> = { ...prevSources };
  for (const f of QUOTE_FIELDS) {
    const src = extracted.field_sources[f];
    if (src != null && extracted[f] != null) sources[f] = src;
  }
  const totals = computeQuoteTotals(merged, container.last_free_day, demurragePerDayCents());

  const row = {
    call_id: callId,
    provider_id: provider.id,
    container_id: container.id,
    ...merged,
    accessorials: (merged.accessorials ?? []) as unknown as Json,
    all_in_cents: totals.all_in_cents,
    projected_demurrage_cents: totals.projected_demurrage_cents,
    risk_adjusted_cents: totals.risk_adjusted_cents,
    notes: extracted.notes ?? existing?.notes ?? null,
    field_sources: sources as unknown as Json,
    updated_at: new Date().toISOString(),
  };
  const { error: upErr } = await db.from("quotes").upsert(row, { onConflict: "call_id" });
  if (upErr) throw new Error(`quotes upsert failed: ${upErr.message}`);

  const engine = aiMode();
  for (const f of QUOTE_FIELDS) {
    const before =
      f === "accessorials" ? (prevSources.accessorials != null ? existing?.accessorials : null) : (existing?.[f] ?? null);
    const now = merged[f];
    if (now == null || sameValue(before, now)) continue;
    await logEvent(db, container.id, "field_heard", {
      call_id: call.id,
      provider_id: provider.id,
      provider_name: provider.name,
      field: f,
      value: now,
      line_id: sources[f] ?? null,
      engine,
    });
  }
}

/**
 * When every call in the request is done (or force after the timeout), rank the quotes once,
 * then auto-book the winner if it is under the importer's limit.
 */
export async function finalizeQuoteRequest(quoteRequestId: string, opts: { force?: boolean } = {}): Promise<void> {
  const db = createAdminClient();
  const { data: calls } = await db.from("calls").select("*, provider:providers(name)").eq("quote_request_id", quoteRequestId);
  if (!calls?.length) return;
  const done = calls.every((c) => c.status === "failed" || c.status === "no_answer" || c.summary !== null);
  if (!done && !opts.force) return;

  // Claim the request so exactly one invocation ranks it.
  const { data: claimed } = await db
    .from("quote_requests")
    .update({ status: "complete", completed_at: new Date().toISOString() })
    .eq("id", quoteRequestId)
    .eq("status", "calling")
    .select("*, container:containers(*, importer:importers(*))")
    .maybeSingle();
  if (!claimed) return;
  const container = claimed.container!;
  const importer = container.importer!;

  const callIds = calls.map((c) => c.id);
  const { data: quoteRows } = await db.from("quotes").select("*, provider:providers(name)").in("call_id", callIds);
  const usable = (quoteRows ?? []).filter((q) => q.all_in_cents != null);

  const fail = async (reason: string) => {
    await db.from("quote_requests").update({ status: "failed" }).eq("id", quoteRequestId);
    await db.from("containers").update({ status: "inbound" }).eq("id", container.id);
    await logEvent(db, container.id, "quote_failed", { quote_request_id: quoteRequestId, reason });
  };

  if (!usable.length) {
    await fail(opts.force ? "Timed out with no usable quotes" : "No provider gave a usable quote");
    return;
  }

  const rankable: RankableQuote[] = usable.map((q) => ({
    quote_id: q.id,
    provider_name: q.provider?.name ?? "Provider",
    linehaul_cents: q.linehaul_cents,
    fuel_surcharge_cents: q.fuel_surcharge_cents,
    chassis_per_day_cents: q.chassis_per_day_cents,
    est_chassis_days: q.est_chassis_days,
    accessorials: (q.accessorials as Accessorial[] | null) ?? [],
    all_in_cents: q.all_in_cents!,
    projected_demurrage_cents: q.projected_demurrage_cents ?? 0,
    risk_adjusted_cents: q.risk_adjusted_cents ?? q.all_in_cents!,
    earliest_pickup: q.earliest_pickup,
    can_meet_deadline: q.can_meet_deadline,
    notes: q.notes,
  }));

  let rec;
  try {
    rec = await recommendQuotes(rankable, {
      today: todayPortDate(),
      container: containerContext(container),
      demurragePerDayCents: demurragePerDayCents(),
    });
  } catch (err) {
    await fail(`Ranking failed: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  const { data: recommendation, error: recErr } = await db
    .from("recommendations")
    .insert({
      quote_request_id: quoteRequestId,
      container_id: container.id,
      ranked_quote_ids: rec.ranked_quote_ids,
      winner_quote_id: rec.winner_quote_id,
      reasoning: rec.reasoning,
    })
    .select("*")
    .single();
  if (recErr) throw new Error(`recommendation insert failed: ${recErr.message}`);

  const winner = usable.find((q) => q.id === rec.winner_quote_id)!;
  // Every ranked run adds its quotes to the lane history (never throws).
  await recordLaneRates(db, { importerId: importer.id, container, quotes: usable, winnerId: winner.id });
  await db.from("containers").update({ status: "quoted" }).eq("id", container.id);
  await logEvent(db, container.id, "recommended", {
    quote_request_id: quoteRequestId,
    recommendation_id: recommendation.id,
    winner_quote_id: winner.id,
    winner_provider: winner.provider?.name,
    all_in_cents: winner.all_in_cents,
    engine: aiMode(),
  });

  await maybeAutoBook(db, importer, container.id, winner as Quote & { provider: { name: string } | null });
}

async function maybeAutoBook(
  db: AdminClient,
  importer: { id: string; auto_book_enabled: boolean; auto_book_limit_cents: number },
  containerId: string,
  winner: Quote & { provider: { name: string } | null },
) {
  if (!importer.auto_book_enabled) {
    await logEvent(db, containerId, "auto_book_skipped", { reason: "Auto-book is off: waiting for a human to book" });
    return;
  }
  if ((winner.all_in_cents ?? 0) > importer.auto_book_limit_cents) {
    await logEvent(db, containerId, "auto_book_skipped", {
      reason: `${formatUsd(winner.all_in_cents)} is over the ${formatUsd(importer.auto_book_limit_cents)} auto-book limit: needs human approval`,
    });
    return;
  }
  try {
    const { bookQuote } = await import("@/lib/book");
    await bookQuote({ quoteId: winner.id, importerId: importer.id, bookedBy: "auto" });
  } catch (err) {
    await logEvent(db, containerId, "auto_book_failed", { error: err instanceof Error ? err.message : String(err) });
  }
}

export { TERMINAL_CALL };
