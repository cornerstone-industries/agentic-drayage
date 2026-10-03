import { NextResponse } from "next/server";
import { hasInternalSecret } from "@/lib/auth";
import { NotConfiguredError } from "@/lib/env";
import { QuoteRequestError, startQuoteRequest } from "@/lib/quotes/request";
import { createAdminClient } from "@/lib/supabase/admin";

// Auto trigger (CLAUDE.md section 10) for Vercel Cron or a manual run. The pg_cron job in
// supabase/migrations/20261003200000_autoquote_cron.sql picks containers with the same rule and calls
// /api/quotes/request directly. Auth: x-internal-secret or Authorization: Bearer = INTERNAL_CRON_SECRET
// (Vercel Cron sends CRON_SECRET as a Bearer token, so set CRON_SECRET to the same value).
export const dynamic = "force-dynamic";
// Replay mode keeps running after the response (after()), so give it the full budget.
export const maxDuration = 300;

const DAY_MS = 86_400_000;

type DueContainer = { id: string; container_number: string; importer_id: string };

/**
 * Inbound containers whose importer has auto-quote on, whose ETA is inside the importer's
 * "N days before arrival" window (and not more than 2 days past), and that have no quote request yet.
 */
async function dueContainers(): Promise<DueContainer[]> {
  const db = createAdminClient();
  const { data: importers, error: importerErr } = await db
    .from("importers")
    .select("id, auto_quote_days_before_eta")
    .eq("auto_quote_enabled", true);
  if (importerErr) throw importerErr;
  if (!importers?.length) return [];
  const daysBefore = new Map(importers.map((i) => [i.id, i.auto_quote_days_before_eta]));

  const now = Date.now();
  const { data: boxes, error: boxErr } = await db
    .from("containers")
    .select("id, container_number, importer_id, eta")
    .in("importer_id", [...daysBefore.keys()])
    .eq("status", "inbound")
    .gt("eta", new Date(now - 2 * DAY_MS).toISOString())
    .order("eta");
  if (boxErr) throw boxErr;

  const inWindow = (boxes ?? []).filter(
    (c): c is typeof c & { importer_id: string; eta: string } =>
      c.importer_id != null && c.eta != null && Date.parse(c.eta) <= now + (daysBefore.get(c.importer_id) ?? 0) * DAY_MS,
  );
  if (!inWindow.length) return [];

  const { data: asked, error: askedErr } = await db
    .from("quote_requests")
    .select("container_id")
    .in("container_id", inWindow.map((c) => c.id));
  if (askedErr) throw askedErr;
  const alreadyAsked = new Set((asked ?? []).map((q) => q.container_id));
  return inWindow.filter((c) => !alreadyAsked.has(c.id));
}

async function handle(req: Request) {
  let authorized: boolean;
  try {
    authorized = hasInternalSecret(req);
  } catch (err) {
    if (err instanceof NotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    throw err;
  }
  if (!authorized) return NextResponse.json({ error: "Bad internal secret" }, { status: 401 });

  try {
    const due = await dueContainers();
    const started: { container_id: string; container_number: string; quote_request_id: string; mode: string; reused: boolean; calls: number; skipped: number }[] = [];
    const failed: { container_id: string; container_number: string; status: number; error: string }[] = [];

    // One container at a time, so a failure on one does not hide the rest. Each run returns as soon as its
    // calls are placed, so two due boxes can still overlap and pass Vapi's cap (4 lines on Usage only).
    for (const c of due) {
      try {
        const r = await startQuoteRequest({ containerId: c.id, importerId: c.importer_id, triggeredBy: "auto" });
        started.push({
          container_id: c.id,
          container_number: c.container_number,
          quote_request_id: r.quoteRequestId,
          mode: r.mode,
          reused: r.reused,
          calls: r.calls.length,
          skipped: r.skipped.length,
        });
      } catch (err) {
        failed.push({
          container_id: c.id,
          container_number: c.container_number,
          status: err instanceof QuoteRequestError ? err.status : err instanceof NotConfiguredError ? 503 : 500,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }
    return NextResponse.json({ ok: failed.length === 0, due: due.length, started, failed }, { status: failed.length ? 500 : 200 });
  } catch (err) {
    if (err instanceof NotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.error("[cron/autoquote]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Auto-quote run failed" }, { status: 500 });
  }
}

export { handle as GET, handle as POST };
