// End-to-end check of the call pipeline with no phones (CLAUDE.md section 14b): resets the demo
// container, starts a quote run on a server running CALL_MODE=replay, waits for the replayed calls to
// finish, then verifies what landed in Supabase.
//
//   CALL_MODE=replay npm run test:replay      (BASE_URL defaults to APP_URL)
//
// The server under test must run with CALL_MODE=replay too. A live server would dial the real provider
// phones, so this refuses to start unless CALL_MODE=replay is set here. Needs SUPABASE_SERVICE_ROLE_KEY
// and INTERNAL_CRON_SECRET in .env.local.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { z } from "zod";
import { callMode } from "@/lib/env";
import { formatUsd } from "@/lib/money";
import type { AdminClient } from "@/lib/supabase/admin";
import { connectAdmin, describeError, resetDemoContainer, runScript, sleep, type Reporter } from "./lib/demo";

const RUN_TIMEOUT_MS = 240_000;
const RANKING_TIMEOUT_MS = 90_000;
const POLL_MS = 2000;

const MARSHGRASS = "Marshgrass Drayage";
const IRONCLAD = "Ironclad Intermodal";
const EXPECTED_CALLS = 3;

const Started = z
  .object({
    quoteRequestId: z.string().min(1),
    mode: z.enum(["live", "replay", "web"]),
    reused: z.boolean(),
    calls: z.array(z.object({ providerName: z.string() }).passthrough()),
  })
  .passthrough();

async function startRun(baseUrl: string, secret: string, containerId: string) {
  let res: Response;
  try {
    res = await fetch(`${baseUrl}/api/quotes/request`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-internal-secret": secret },
      body: JSON.stringify({ containerId }),
      signal: AbortSignal.timeout(60_000),
    });
  } catch (err) {
    throw new Error(`could not reach ${baseUrl}: ${describeError(err)}. Is the server up, running with CALL_MODE=replay?`);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`POST /api/quotes/request answered ${res.status}: ${text.slice(0, 300)}`);
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    throw new Error(`POST /api/quotes/request answered something that is not JSON: ${text.slice(0, 200)}`);
  }
  const parsed = Started.safeParse(json);
  if (!parsed.success) throw new Error(`unexpected /api/quotes/request answer: ${text.slice(0, 300)}`);
  if (parsed.data.mode !== "replay") {
    throw new Error(`the server answered mode "${parsed.data.mode}": it must run with CALL_MODE=replay (real calls may have just been placed)`);
  }
  if (parsed.data.reused) throw new Error("the server returned a quote run that was already in flight instead of starting a new one");
  return parsed.data;
}

async function failureReason(db: AdminClient, containerId: string): Promise<string> {
  const { data } = await db
    .from("events")
    .select("payload")
    .eq("container_id", containerId)
    .eq("type", "quote_failed")
    .order("id", { ascending: false })
    .limit(1)
    .maybeSingle();
  const reason = (data?.payload as { reason?: string } | null)?.reason;
  return reason ?? "no quote_failed event recorded";
}

/** Waits for quote_requests.status to leave "calling". Resolves with the elapsed seconds. */
async function waitForRun(db: AdminClient, r: Reporter, quoteRequestId: string, containerId: string): Promise<number> {
  const started = Date.now();
  let lastInfo = started;
  for (;;) {
    const { data: qr, error } = await db
      .from("quote_requests")
      .select("status, calls(status, provider:providers(name))")
      .eq("id", quoteRequestId)
      .single();
    if (error) throw new Error(`quote_requests lookup failed: ${error.message}`);
    const calls = qr.calls ?? [];
    const elapsed = Math.round((Date.now() - started) / 1000);
    if (qr.status === "complete") return elapsed;
    if (qr.status === "failed") throw new Error(`the run failed: ${await failureReason(db, containerId)}`);
    if (Date.now() - started > RUN_TIMEOUT_MS) {
      const states = calls.map((c) => `${c.provider?.name ?? "?"} ${c.status}`).join(", ");
      throw new Error(
        `still "${qr.status}" after ${RUN_TIMEOUT_MS / 1000}s (${states || "no calls"}). Is the server running with CALL_MODE=replay, and does its VAPI_WEBHOOK_SECRET match this one?`,
      );
    }
    if (Date.now() - lastInfo >= 10_000) {
      lastInfo = Date.now();
      const done = calls.filter((c) => c.status === "ended" || c.status === "failed" || c.status === "no_answer").length;
      r.info(`waiting, ${elapsed}s: ${done}/${calls.length} calls done`);
    }
    await sleep(POLL_MS);
  }
}

/** The run is marked complete before ranking finishes, so wait for the recommendation row itself. */
async function waitForRecommendation(db: AdminClient, quoteRequestId: string) {
  const started = Date.now();
  for (;;) {
    const { data: rec, error } = await db
      .from("recommendations")
      .select("*")
      .eq("quote_request_id", quoteRequestId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`recommendations lookup failed: ${error.message}`);
    if (rec) return rec;
    const { data: qr } = await db.from("quote_requests").select("status, container_id").eq("id", quoteRequestId).single();
    if (qr?.status === "failed") throw new Error(`ranking failed: ${qr.container_id ? await failureReason(db, qr.container_id) : "unknown reason"}`);
    if (Date.now() - started > RANKING_TIMEOUT_MS) throw new Error(`no recommendation row ${RANKING_TIMEOUT_MS / 1000}s after the run completed`);
    await sleep(POLL_MS);
  }
}

void runScript(async (r) => {
  const mode = callMode();
  if (mode !== "replay") {
    r.fail(
      "call-mode",
      `CALL_MODE is "${mode}" here. Refusing to start: a live server would dial the real provider phones. Run CALL_MODE=replay npm run test:replay, and start the server with CALL_MODE=replay too`,
    );
    return;
  }
  const baseUrl = (process.env.BASE_URL || process.env.APP_URL || "").trim().replace(/\/+$/, "");
  const secret = process.env.INTERNAL_CRON_SECRET?.trim();
  if (!baseUrl) return r.fail("config", "set BASE_URL (or APP_URL) to the server under test");
  if (!secret) return r.fail("config", "set INTERNAL_CRON_SECRET: the server checks it on /api/quotes/request");
  r.pass("config", `${baseUrl}, replay mode`);

  const db = await r.run("supabase", () => connectAdmin(), "service role connected");
  if (!db) return;

  const reset = await r.run("reset", () => resetDemoContainer(db), ({ container }) => `${container.container_number} back to inbound`);
  if (!reset) return;
  const containerId = reset.container.id;

  const started = await r.run(
    "request",
    () => startRun(baseUrl, secret, containerId),
    (s) => `quote request ${s.quoteRequestId}, ${s.mode} mode, ${s.calls.length} calls`,
  );
  if (!started) return;
  const quoteRequestId = started.quoteRequestId;

  const elapsed = await r.run("complete", () => waitForRun(db, r, quoteRequestId, containerId), (s) => `run finished after ${s}s`);
  if (elapsed === undefined) return;

  const rec = await r.run("recommendation", () => waitForRecommendation(db, quoteRequestId), (x) => `winner quote ${x.winner_quote_id ?? "none"}`);

  // What the run left in Supabase
  const { data: callRows, error: callErr } = await db
    .from("calls")
    .select("id, status, provider:providers(name)")
    .eq("quote_request_id", quoteRequestId);
  if (callErr || !callRows) return r.fail("calls-ended", `could not read calls: ${callErr?.message ?? "no rows"}`);
  const callIds = callRows.map((c) => c.id);
  const providerOf = new Map(callRows.map((c) => [c.id, c.provider?.name ?? "unknown provider"]));

  const ended = callRows.filter((c) => c.status === "ended");
  if (callRows.length === EXPECTED_CALLS && ended.length === EXPECTED_CALLS) {
    r.pass("calls-ended", callRows.map((c) => providerOf.get(c.id)).join(", "));
  } else {
    r.fail("calls-ended", `expected ${EXPECTED_CALLS} ended calls, got ${callRows.length} calls: ${callRows.map((c) => `${providerOf.get(c.id)} ${c.status}`).join(", ")}`);
  }

  const { data: lines, error: lineErr } = await db.from("transcript_lines").select("id, call_id").in("call_id", callIds);
  if (lineErr || !lines) return r.fail("transcripts", `could not read transcript lines: ${lineErr?.message ?? "no rows"}`);
  const lineCount = new Map(callIds.map((id) => [id, lines.filter((l) => l.call_id === id).length]));
  const emptyCalls = callIds.filter((id) => !lineCount.get(id));
  if (emptyCalls.length) r.fail("transcripts", `no transcript lines for ${emptyCalls.map((id) => providerOf.get(id)).join(", ")}`);
  else r.pass("transcripts", callIds.map((id) => `${providerOf.get(id)} ${lineCount.get(id)}`).join(", "));

  const { data: quotes, error: quoteErr } = await db.from("quotes").select("*").in("call_id", callIds);
  if (quoteErr || !quotes) return r.fail("quotes", `could not read quotes: ${quoteErr?.message ?? "no rows"}`);
  const quoteProblems: string[] = [];
  for (const id of callIds) {
    const q = quotes.find((x) => x.call_id === id);
    const who = providerOf.get(id);
    if (!q) quoteProblems.push(`${who} has no quote`);
    else {
      if (q.all_in_cents == null) quoteProblems.push(`${who} has no all_in_cents`);
      if (q.earliest_pickup == null) quoteProblems.push(`${who} has no earliest_pickup`);
    }
  }
  if (quoteProblems.length) r.fail("quotes", quoteProblems.join("; "));
  else r.pass("quotes", quotes.map((q) => `${providerOf.get(q.call_id!)} ${formatUsd(q.all_in_cents)} pickup ${q.earliest_pickup}`).join(", "));

  // Every field_sources value must be a transcript line of the same call, so the UI can highlight it.
  const lineIdsByCall = new Map(callIds.map((id) => [id, new Set(lines.filter((l) => l.call_id === id).map((l) => l.id))]));
  const sourceProblems: string[] = [];
  let sourceCount = 0;
  for (const q of quotes) {
    const who = providerOf.get(q.call_id!) ?? "unknown provider";
    const sources = (q.field_sources ?? {}) as Record<string, unknown>;
    for (const [field, value] of Object.entries(sources)) {
      sourceCount++;
      const lineId = Number(value);
      if (!Number.isInteger(lineId) || !lineIdsByCall.get(q.call_id!)?.has(lineId)) {
        sourceProblems.push(`${who} ${field} points at ${String(value)}, which is not a line of that call`);
      }
    }
    for (const needed of ["linehaul_cents", "earliest_pickup"]) {
      if (!(needed in sources)) sourceProblems.push(`${who} has no source line for ${needed}`);
    }
  }
  if (sourceProblems.length) r.fail("field-sources", sourceProblems.join("; "));
  else r.pass("field-sources", `${sourceCount} fields, each linked to a transcript line of its own call`);

  if (!rec) return;
  const winnerQuote = quotes.find((q) => q.id === rec.winner_quote_id);
  const winnerName = winnerQuote ? providerOf.get(winnerQuote.call_id!) : undefined;
  if (winnerName === MARSHGRASS) r.pass("winner", `${winnerName}, ${formatUsd(winnerQuote?.all_in_cents)} all-in, risk-adjusted ${formatUsd(winnerQuote?.risk_adjusted_cents)}`);
  else r.fail("winner", `expected ${MARSHGRASS}, got ${winnerName ?? "no matching quote"}`);

  const ironclad = quotes.find((q) => providerOf.get(q.call_id!) === IRONCLAD);
  if (ironclad && (ironclad.projected_demurrage_cents ?? 0) > 0) {
    r.pass("ironclad-lfd", `projected demurrage ${formatUsd(ironclad.projected_demurrage_cents)}, pickup ${ironclad.earliest_pickup}, can_meet_deadline ${ironclad.can_meet_deadline}`);
  } else {
    r.fail("ironclad-lfd", ironclad ? `projected_demurrage_cents is ${ironclad.projected_demurrage_cents}, expected more than 0` : `no quote from ${IRONCLAD}`);
  }
});
