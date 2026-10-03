import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionImporter, hasInternalSecret } from "@/lib/auth";
import { NotConfiguredError } from "@/lib/env";
import { QuoteRequestError, startQuoteRequest } from "@/lib/quotes/request";
import { createAdminClient } from "@/lib/supabase/admin";
import type { TriggeredBy } from "@/lib/types";

// Replay mode keeps running after the response (after()), so give it the full budget.
export const maxDuration = 300;

const Body = z.object({
  containerId: z.string().uuid(),
  triggeredBy: z.enum(["button", "auto", "agent"]).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Body must be { containerId: uuid }" }, { status: 400 });
  const { containerId } = parsed.data;

  try {
    let importerId: string;
    let triggeredBy: TriggeredBy;
    const internal = req.headers.has("x-internal-secret") || req.headers.has("authorization");
    if (internal) {
      // pg_cron auto trigger and the test scripts
      if (!hasInternalSecret(req)) return NextResponse.json({ error: "Bad internal secret" }, { status: 401 });
      const { data: c } = await createAdminClient().from("containers").select("importer_id").eq("id", containerId).maybeSingle();
      if (!c?.importer_id) return NextResponse.json({ error: "Container not found" }, { status: 404 });
      importerId = c.importer_id;
      triggeredBy = parsed.data.triggeredBy ?? "auto";
    } else {
      // The Get quotes button
      const session = await getSessionImporter();
      if (!session) return NextResponse.json({ error: "Sign in to request quotes" }, { status: 401 });
      importerId = session.importer.id;
      triggeredBy = "button";
    }

    const result = await startQuoteRequest({ containerId, importerId, triggeredBy });
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof QuoteRequestError) return NextResponse.json({ error: err.message }, { status: err.status });
    if (err instanceof NotConfiguredError) return NextResponse.json({ error: err.message }, { status: 503 });
    console.error("[quotes/request]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not start quotes" }, { status: 500 });
  }
}
