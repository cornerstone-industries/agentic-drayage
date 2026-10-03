import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionImporter, hasInternalSecret } from "@/lib/auth";
import { BookingError, bookQuote } from "@/lib/book";
import { NotConfiguredError } from "@/lib/env";
import { isStripeConfigError } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";
import type { BookedBy } from "@/lib/types";

// Stripe authorization plus the tender email.
export const maxDuration = 60;

const Body = z.object({
  quoteId: z.string().uuid(),
  bookedBy: z.enum(["human", "agent", "auto"]).optional(),
});

export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Body must be { quoteId: uuid }" }, { status: 400 });
  const { quoteId } = parsed.data;

  try {
    let importerId: string;
    let bookedBy: BookedBy;
    const internal = req.headers.has("x-internal-secret") || req.headers.has("authorization");
    if (internal) {
      // The test scripts: the importer comes from the quote, bookedBy from the body (default agent, so the limit applies).
      if (!hasInternalSecret(req)) return NextResponse.json({ error: "Bad internal secret" }, { status: 401 });
      const { data } = await createAdminClient().from("quotes").select("container:containers(importer_id)").eq("id", quoteId).maybeSingle();
      if (!data?.container?.importer_id) return NextResponse.json({ error: "Quote not found", code: "not_found" }, { status: 404 });
      importerId = data.container.importer_id;
      bookedBy = parsed.data.bookedBy ?? "agent";
    } else {
      // The Book button: a signed-in human, whatever the body says.
      const session = await getSessionImporter();
      if (!session) return NextResponse.json({ error: "Sign in to book" }, { status: 401 });
      importerId = session.importer.id;
      bookedBy = "human";
    }

    return NextResponse.json(await bookQuote({ quoteId, importerId, bookedBy }));
  } catch (err) {
    if (err instanceof BookingError) return NextResponse.json({ error: err.message, code: err.code }, { status: err.status });
    if (err instanceof NotConfiguredError || isStripeConfigError(err)) return NextResponse.json({ error: (err as Error).message }, { status: 503 });
    console.error("[book]", err);
    return NextResponse.json({ error: err instanceof Error ? err.message : "Could not book" }, { status: 500 });
  }
}
