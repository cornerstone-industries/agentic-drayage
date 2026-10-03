// Thin Vapi REST client. Keys are read when a call is made, so a missing key fails as
// "Vapi not configured: set VAPI_API_KEY" instead of a vague 401 from Vapi.
import { z } from "zod";
import { requireEnv } from "@/lib/env";

const VAPI_API = "https://api.vapi.ai";
const LIVE_KEYS = ["VAPI_API_KEY", "VAPI_ASSISTANT_ID", "VAPI_PHONE_NUMBER_ID"] as const;

/** Throws NotConfiguredError listing every Vapi key a live call needs that the environment lacks. */
export function assertVapiConfigured(): void {
  requireEnv("Vapi", LIVE_KEYS);
}

/** One authenticated Vapi request. Non-2xx throws with Vapi's response body so the reason is visible. */
export async function vapiRequest(method: "GET" | "POST" | "PATCH", path: string, body?: unknown): Promise<unknown> {
  const { VAPI_API_KEY } = requireEnv("Vapi", ["VAPI_API_KEY"]);
  let res: Response;
  try {
    res = await fetch(`${VAPI_API}${path}`, {
      method,
      headers: { Authorization: `Bearer ${VAPI_API_KEY}`, "Content-Type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    throw new Error(`Vapi ${method} ${path} could not be reached: ${err instanceof Error ? err.message : String(err)}`);
  }
  const text = await res.text();
  if (!res.ok) throw new Error(`Vapi ${method} ${path} failed (${res.status}): ${text.slice(0, 800)}`);
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    throw new Error(`Vapi ${method} ${path} returned something that is not JSON: ${text.slice(0, 200)}`);
  }
}

const CreatedCall = z.object({ id: z.string().min(1) });

/**
 * Place one outbound call with the saved assistant. Our calls.id travels three ways (name,
 * customer.externalId, assistantOverrides.metadata.callId) because POST /call has no top-level
 * metadata field and the first webhooks can beat the vapi_call_id write.
 */
export async function createVapiCall(args: {
  callId: string;
  customerNumber: string;
  customerName: string;
  variableValues: Record<string, string>;
}): Promise<{ vapiCallId: string }> {
  const { VAPI_ASSISTANT_ID, VAPI_PHONE_NUMBER_ID } = requireEnv("Vapi", LIVE_KEYS);
  if (!/^\+[1-9]\d{6,14}$/.test(args.customerNumber)) {
    throw new Error(`Vapi needs an E.164 phone number like +14155551234, got "${args.customerNumber}"`);
  }
  const json = await vapiRequest("POST", "/call", {
    name: args.callId,
    assistantId: VAPI_ASSISTANT_ID,
    phoneNumberId: VAPI_PHONE_NUMBER_ID,
    customer: { number: args.customerNumber, name: args.customerName, externalId: args.callId },
    assistantOverrides: { variableValues: args.variableValues, metadata: { callId: args.callId } },
  });
  const parsed = CreatedCall.safeParse(json);
  if (!parsed.success) throw new Error(`Vapi create call answered without a call id: ${JSON.stringify(json).slice(0, 300)}`);
  return { vapiCallId: parsed.data.id };
}
