// Starting a quote run: one quote_request, one call per eligible provider, then either real Vapi
// calls (CALL_MODE=live) or the fixture replay through the real webhook (CALL_MODE=replay).
// Shared by the Get quotes button, the auto trigger (pg_cron) and the MCP request_quotes tool.
import { createAdminClient } from "@/lib/supabase/admin";
import { callMode, requireEnv, type CallMode } from "@/lib/env";
import { logEvent } from "@/lib/events";
import { formatContainerNumber, stateFromAddress } from "@/lib/money";
import { cityFromAddress, longDate, portDate, spokenSize, stateName } from "@/lib/dates";
import { runInBackground, sleep } from "@/lib/background";
import { finalizeQuoteRequest } from "@/lib/pipeline";
import type { Provider, TriggeredBy } from "@/lib/types";

export class QuoteRequestError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.name = "QuoteRequestError";
    this.status = status;
  }
}

export type StartQuoteResult = {
  quoteRequestId: string;
  mode: CallMode;
  reused: boolean;
  calls: { callId: string; providerId: string; providerName: string; status: string }[];
  skipped: { providerId: string; providerName: string; reason: string }[];
};

const CLOSED = new Set(["booked", "accepted", "picked_up", "delivered"]);
/** Live calls get this long before the run is ranked with whatever was heard. */
const LIVE_TIMEOUT_MS = 3 * 60_000 + 10_000;
/** How long after dialing to check that Vapi actually started each call. */
const START_CHECK_MS = 8_000;

/** NANP's fictional range (NXX-555-0100 to 0199): seeded demo phones that can never answer. */
export const PLACEHOLDER_PHONE = /^\+1\d{3}55501\d{2}$/;

export function laneCheck(p: Provider, port: string, destState: string | null): string | null {
  if (!(p.ports ?? []).includes(port)) return `Not called: doesn't serve the Port of ${port}`;
  if (destState && !(p.service_states ?? []).includes(destState)) return `Not called: lane not served (no ${destState} deliveries)`;
  // Live calls to a 555-01xx number can't connect and still spend a carrier dial (the Telnyx trial caps dials per hour).
  if (callMode() === "live" && PLACEHOLDER_PHONE.test(p.phone ?? "")) return "Not called: no reachable phone number on file";
  return null;
}

export async function startQuoteRequest(args: {
  containerId: string;
  importerId: string;
  triggeredBy: TriggeredBy;
}): Promise<StartQuoteResult> {
  const db = createAdminClient();
  const mode = callMode();
  if (mode === "live") {
    const { assertVapiConfigured } = await import("@/lib/vapi/client");
    assertVapiConfigured();
  } else if (mode === "web") {
    requireEnv("Vapi web calls", ["VAPI_ASSISTANT_ID", "NEXT_PUBLIC_VAPI_PUBLIC_KEY"]);
  }

  const { data: container } = await db
    .from("containers")
    .select("*, importer:importers(*)")
    .eq("id", args.containerId)
    .eq("importer_id", args.importerId)
    .maybeSingle();
  if (!container) throw new QuoteRequestError(404, "Container not found for this importer");
  const box = formatContainerNumber(container.container_number);
  if (CLOSED.has(container.status ?? "")) {
    throw new QuoteRequestError(409, `${box} is already ${container.status?.replace("_", " ")}; quoting is closed`);
  }

  // A run already in flight for this box is returned instead of dialing everyone twice.
  const { data: active } = await db
    .from("quote_requests")
    .select("id, calls(id, status, provider:providers(id, name))")
    .eq("container_id", container.id)
    .eq("status", "calling")
    .gte("created_at", new Date(Date.now() - LIVE_TIMEOUT_MS).toISOString())
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (active) {
    return {
      quoteRequestId: active.id,
      mode,
      reused: true,
      calls: (active.calls ?? []).map((c) => ({ callId: c.id, providerId: c.provider!.id, providerName: c.provider!.name, status: c.status ?? "queued" })),
      skipped: [],
    };
  }

  const { data: providers, error: provErr } = await db.from("providers").select("*").eq("importer_id", args.importerId).order("created_at");
  if (provErr) throw provErr;
  const port = container.port ?? "Charleston";
  const destState = stateFromAddress(container.destination_address);
  const eligible: Provider[] = [];
  const skipped: StartQuoteResult["skipped"] = [];
  for (const p of providers ?? []) {
    const reason = laneCheck(p, port, destState);
    if (reason) skipped.push({ providerId: p.id, providerName: p.name, reason });
    else eligible.push(p);
  }
  if (!eligible.length) throw new QuoteRequestError(422, `No provider serves ${port} to ${destState ?? "this destination"}`);

  const { data: qr, error: qrErr } = await db
    .from("quote_requests")
    .insert({ container_id: container.id, triggered_by: args.triggeredBy })
    .select("id")
    .single();
  if (qrErr) throw qrErr;
  await db.from("containers").update({ status: "quoting" }).eq("id", container.id);

  const { data: callRows, error: callErr } = await db
    .from("calls")
    .insert(eligible.map((p) => ({ quote_request_id: qr.id, provider_id: p.id, status: "queued" })))
    .select("id, provider_id");
  if (callErr) throw callErr;
  const calls = callRows.map((c) => {
    const p = eligible.find((e) => e.id === c.provider_id)!;
    return { callId: c.id, providerId: p.id, providerName: p.name, phone: p.phone, status: "queued" };
  });

  await logEvent(db, container.id, "quote_requested", {
    quote_request_id: qr.id,
    triggered_by: args.triggeredBy,
    mode,
    providers: calls.map((c) => c.providerName),
    skipped,
  });

  if (mode === "replay") {
    for (const c of calls) await db.from("calls").update({ vapi_call_id: `replay_${c.callId}` }).eq("id", c.callId);
    runInBackground("replay", async () => {
      const { runReplay } = await import("@/lib/replay/run");
      await runReplay(qr.id);
    });
  } else if (mode === "web") {
    // Nothing is dialed: each carrier's /phone/[providerId] page polls for its queued call and starts a
    // Vapi web call carrying our calls.id in metadata, so the webhook maps it exactly like a phone call.
    runInBackground("web-timeout", async () => {
      await sleep(LIVE_TIMEOUT_MS);
      await finalizeQuoteRequest(qr.id, { force: true });
    });
  } else {
    const { createVapiCall } = await import("@/lib/vapi/client");
    const variables = callVariables(container, box, destState);
    await Promise.all(
      calls.map(async (c) => {
        try {
          const { vapiCallId } = await createVapiCall({
            callId: c.callId,
            customerNumber: c.phone,
            customerName: c.providerName,
            variableValues: { ...variables, providerName: c.providerName },
          });
          await db.from("calls").update({ vapi_call_id: vapiCallId }).eq("id", c.callId);
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          c.status = "failed";
          await db
            .from("calls")
            .update({ status: "failed", ended_at: new Date().toISOString(), summary: `Call could not be placed: ${message}` })
            .eq("id", c.callId);
          await logEvent(db, container.id, "call_failed", { call_id: c.callId, provider_name: c.providerName, error: message });
        }
      }),
    );
    // Vapi accepts a call and only then asks the carrier to dial; a refused dial (the Telnyx trial's dials-per-hour
    // cap shows as call.start.error-get-transport) ends the call without any webhook, leaving it "queued" until the
    // 3 minute timeout. Check each call a few seconds in and fail the ones that never started.
    runInBackground("live-start-check", async () => {
      await sleep(START_CHECK_MS);
      const { vapiRequest } = await import("@/lib/vapi/client");
      const { data: queued } = await db.from("calls").select("id, vapi_call_id").eq("quote_request_id", qr.id).eq("status", "queued");
      let failedAny = false;
      for (const row of queued ?? []) {
        if (!row.vapi_call_id) continue;
        const vc = (await vapiRequest("GET", `/call/${row.vapi_call_id}`).catch(() => null)) as { status?: string; endedReason?: string } | null;
        if (vc?.status !== "ended" || !vc.endedReason?.startsWith("call.start")) continue;
        failedAny = true;
        const provider = calls.find((c) => c.callId === row.id)?.providerName ?? "Carrier";
        const message = `the phone line refused the dial (${vc.endedReason})`;
        await db
          .from("calls")
          .update({ status: "failed", ended_at: new Date().toISOString(), summary: `Call could not be placed: ${message}` })
          .eq("id", row.id)
          .eq("status", "queued");
        await logEvent(db, container.id, "call_failed", { call_id: row.id, provider_name: provider, error: message });
      }
      if (failedAny) await finalizeQuoteRequest(qr.id);
    });
    // Rank with whatever was heard if a call never reports back.
    runInBackground("live-timeout", async () => {
      await sleep(LIVE_TIMEOUT_MS);
      await finalizeQuoteRequest(qr.id, { force: true });
    });
    if (calls.every((c) => c.status === "failed")) await finalizeQuoteRequest(qr.id);
  }

  return {
    quoteRequestId: qr.id,
    mode,
    reused: false,
    calls: calls.map(({ callId, providerId, providerName, status }) => ({ callId, providerId, providerName, status })),
    skipped,
  };
}

/** The assistant's {{template}} values for one container (providerName is added per call). */
export function callVariables(
  container: {
    importer?: { name: string | null } | null;
    size: string | null;
    terminal: string | null;
    eta: string | null;
    last_free_day: string | null;
    destination_address: string | null;
    destination_name: string | null;
    deliver_by: string | null;
  },
  box: string,
  destState: string | null,
): Record<string, string> {
  const eta = container.eta ? portDate(container.eta) : null;
  const city = cityFromAddress(container.destination_address);
  return {
    importerName: container.importer?.name ?? "our client",
    size: spokenSize(container.size),
    containerNumber: box,
    terminal: container.terminal ?? "the terminal",
    eta: eta ? longDate(eta) : "this week",
    lastFreeDay: container.last_free_day ? longDate(container.last_free_day) : "unknown",
    destination: city ? `our DC in ${city}, ${stateName(destState)}` : (container.destination_name ?? "our DC"),
    deliverBy: container.deliver_by ? longDate(container.deliver_by) : "as soon as possible",
  };
}
