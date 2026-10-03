import { NextResponse } from "next/server";
import { runInBackground } from "@/lib/background";
import { secretsMatch } from "@/lib/auth";
import { NotConfiguredError, requireEnv } from "@/lib/env";
import { processVapiMessage } from "@/lib/vapi/webhook";

// Extraction and ranking run after the response (after()), within this budget.
export const maxDuration = 300;

export async function POST(req: Request) {
  let secret: string;
  try {
    secret = requireEnv("Vapi webhook", ["VAPI_WEBHOOK_SECRET"]).VAPI_WEBHOOK_SECRET;
  } catch (err) {
    return NextResponse.json({ error: (err as NotConfiguredError).message }, { status: 503 });
  }
  const given =
    req.headers.get("x-webhook-secret") ??
    req.headers.get("x-vapi-secret") ??
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    null;
  if (!secretsMatch(given, secret)) return NextResponse.json({ error: "Bad webhook secret" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { message?: unknown } | null;
  if (!body?.message) return NextResponse.json({ error: "Expected { message }" }, { status: 400 });

  try {
    const result = await processVapiMessage(body.message);
    if (result.followUp) runInBackground("vapi-followup", result.followUp);
    return NextResponse.json({ ok: true, handled: result.handled });
  } catch (err) {
    console.error("[vapi webhook]", err);
    const status = err instanceof NotConfiguredError ? 503 : 500;
    return NextResponse.json({ error: err instanceof Error ? err.message : "Webhook failed" }, { status });
  }
}
