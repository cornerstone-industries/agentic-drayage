// Web call mode (CALL_MODE=web): the carrier's phone page polls here for a queued call to answer.
// The provider id is the page's only credential, the same idea as the tender token.
import { createAdminClient } from "@/lib/supabase/admin";
import { formatContainerNumber, stateFromAddress } from "@/lib/money";
import { finalizeQuoteRequest } from "@/lib/pipeline";
import { logEvent } from "@/lib/events";
import { callVariables } from "@/lib/quotes/request";

export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Same window the quote run waits before ranking without a call. */
const RING_WINDOW_MS = 3 * 60_000;

export type IncomingCall = {
  callId: string;
  containerNumber: string;
  importerName: string;
  variableValues: Record<string, string>;
};

export async function getProviderName(providerId: string): Promise<string | null> {
  const db = createAdminClient();
  const { data } = await db.from("providers").select("name").eq("id", providerId).maybeSingle();
  return data?.name ?? null;
}

/** The newest queued call for this provider in a quote run that is still calling, or null. */
export async function getIncomingCall(providerId: string): Promise<IncomingCall | null> {
  const db = createAdminClient();
  // calls has no created_at, so the ring window is the quote run's age.
  const { data: rows, error } = await db
    .from("calls")
    .select("id, provider:providers(name), quote_request:quote_requests!inner(status, created_at, container:containers(*, importer:importers(name)))")
    .eq("provider_id", providerId)
    .eq("status", "queued")
    .eq("quote_request.status", "calling")
    .gte("quote_request.created_at", new Date(Date.now() - RING_WINDOW_MS).toISOString())
    .limit(5);
  if (error) throw new Error(`Incoming call lookup failed: ${error.message}`);
  const call = (rows ?? []).sort((a, b) => (b.quote_request?.created_at ?? "").localeCompare(a.quote_request?.created_at ?? ""))[0];
  const container = call?.quote_request?.container;
  if (!call || call.quote_request?.status !== "calling" || !container) return null;
  const box = formatContainerNumber(container.container_number);
  return {
    callId: call.id,
    containerNumber: box,
    importerName: container.importer?.name ?? "Importer",
    variableValues: {
      ...callVariables(container, box, stateFromAddress(container.destination_address)),
      providerName: call.provider?.name ?? "Carrier",
    },
  };
}

/** Carrier tapped Decline: end the call as unanswered and let the run rank without it. */
export async function declineCall(providerId: string, callId: string): Promise<boolean> {
  const db = createAdminClient();
  const { data: call } = await db
    .from("calls")
    .update({ status: "no_answer", ended_at: new Date().toISOString(), summary: "Carrier declined the call." })
    .eq("id", callId)
    .eq("provider_id", providerId)
    .eq("status", "queued")
    .select("id, quote_request_id, quote_request:quote_requests(container_id)")
    .maybeSingle();
  if (!call) return false;
  if (call.quote_request?.container_id) {
    await logEvent(db, call.quote_request.container_id, "call_ended", { call_id: call.id, provider_id: providerId, status: "no_answer", ended_reason: "declined" });
  }
  if (call.quote_request_id) await finalizeQuoteRequest(call.quote_request_id);
  return true;
}
