// CALL_MODE=replay: plays the dispatcher scripts as Vapi-shaped webhook events, POSTed over HTTP to
// this deployment's real /api/vapi/webhook with the real secret. Extraction, Realtime, ranking and
// booking all run for real; only the phone audio is missing. Never present this as a live call.
import { createAdminClient } from "@/lib/supabase/admin";
import { appUrl, requireEnv } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { sleep } from "@/lib/background";
import { buildScripts, scriptKeyForProvider, speakingMs, type DispatcherScript } from "./script";

type ReplayEvent = { at: number; message: Record<string, unknown> };

function replaySpeed(): number {
  const n = Number.parseFloat(process.env.REPLAY_SPEED ?? "1");
  return Number.isFinite(n) && n > 0 ? n : 1;
}

/** The Vapi event stream for one call, with offsets in ms from the start of the run. */
export function eventsForCall(script: DispatcherScript, callId: string, vapiCallId: string, offsetMs: number): ReplayEvent[] {
  const call = { id: vapiCallId, name: callId, assistantOverrides: { metadata: { callId, replay: true } } };
  const ev: ReplayEvent[] = [];
  let t = offsetMs;
  const push = (dt: number, message: Record<string, unknown>) => {
    t += dt;
    ev.push({ at: t, message: { ...message, call } });
  };
  push(0, { type: "status-update", status: "queued" });
  push(350, { type: "status-update", status: "ringing" });
  push(script.ringSeconds * 1000, { type: "status-update", status: "in-progress" });
  t += 500;
  script.lines.forEach((line, i) => {
    const dur = speakingMs(line);
    push(i === 0 ? 0 : line.role === "user" ? 520 : 680, { type: "speech-update", status: "started", role: line.role, turn: i });
    push(dur, { type: "speech-update", status: "stopped", role: line.role, turn: i });
    push(160, { type: "transcript", role: line.role, transcriptType: "final", transcript: line.text });
  });
  const transcript = script.lines.map((l) => `${l.role === "assistant" ? "AI" : "User"}: ${l.text}`).join("\n");
  push(900, { type: "status-update", status: "ended", endedReason: "assistant-ended-call" });
  push(1400, {
    type: "end-of-call-report",
    endedReason: "assistant-ended-call",
    analysis: { summary: `Replay of the ${script.providerName} dispatcher script.` },
    artifact: { transcript, messages: [] },
  });
  return ev;
}

export async function runReplay(quoteRequestId: string): Promise<void> {
  const db = createAdminClient();
  const { VAPI_WEBHOOK_SECRET } = requireEnv("Vapi webhook", ["VAPI_WEBHOOK_SECRET"]);
  const url = `${appUrl()}/api/vapi/webhook`;

  const { data: qr, error } = await db
    .from("quote_requests")
    .select("id, container:containers(*, importer:importers(name)), calls(id, vapi_call_id, provider:providers(name))")
    .eq("id", quoteRequestId)
    .single();
  if (error || !qr?.container) throw new Error(`replay: quote request ${quoteRequestId} not found`);
  const scripts = buildScripts(qr.container, qr.container.importer?.name ?? undefined);

  const speed = replaySpeed();
  const start = Date.now();
  let consecutiveFailures = 0;

  const timelines = (qr.calls ?? []).map((c, i) => {
    const key = scriptKeyForProvider(c.provider?.name ?? "");
    const script = scripts.find((s) => s.key === key);
    if (!script) {
      // A provider without a script is replayed as a no-answer, the honest outcome.
      return [
        { at: i * 400, message: { type: "status-update", status: "ringing", call: { id: c.vapi_call_id, name: c.id } } },
        { at: i * 400 + 15000, message: { type: "status-update", status: "ended", endedReason: "customer-did-not-answer", call: { id: c.vapi_call_id, name: c.id } } },
      ];
    }
    return eventsForCall(script, c.id, c.vapi_call_id ?? `replay_${c.id}`, i * 450);
  });

  await Promise.all(
    timelines.map(async (events) => {
      for (const e of events) {
        const wait = start + e.at / speed - Date.now();
        if (wait > 0) await sleep(wait);
        const message = { ...e.message, timestamp: Date.now() };
        try {
          const res = await fetch(url, {
            method: "POST",
            headers: { "content-type": "application/json", "x-webhook-secret": VAPI_WEBHOOK_SECRET },
            body: JSON.stringify({ message }),
          });
          if (!res.ok) throw new Error(`webhook answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
          consecutiveFailures = 0;
        } catch (err) {
          consecutiveFailures++;
          console.error("[replay]", err instanceof Error ? err.message : err);
          if (consecutiveFailures >= 3) throw err;
        }
      }
    }),
  ).catch(async (err) => {
    await db.from("quote_requests").update({ status: "failed" }).eq("id", quoteRequestId).eq("status", "calling");
    await db.from("containers").update({ status: "inbound" }).eq("id", qr.container!.id);
    await logEvent(db, qr.container!.id, "quote_failed", {
      quote_request_id: quoteRequestId,
      reason: `Replay could not reach ${url}: ${err instanceof Error ? err.message : String(err)}`,
    });
  });
}
