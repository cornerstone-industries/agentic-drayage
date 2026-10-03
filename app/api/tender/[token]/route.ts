import { NextResponse } from "next/server";
import { z } from "zod";
import { isStripeConfigError } from "@/lib/stripe";
import { TenderError, getTenderView, tenderAction } from "@/lib/tender";

// Public on purpose: the tender token is the credential (the provider taps a link on a phone).
// A capture can take a moment, so give it room; the state changes on every tap, so never cache.
export const maxDuration = 30;

const NO_STORE = { "Cache-Control": "no-store" };
const TOKEN = /^[A-Za-z0-9_-]{8,128}$/;
const Body = z.object({ action: z.enum(["accept", "decline", "picked_up", "delivered"]) });

type Ctx = { params: Promise<{ token: string }> };

function failure(err: unknown) {
  if (err instanceof TenderError) return NextResponse.json({ error: err.message }, { status: err.status, headers: NO_STORE });
  if (isStripeConfigError(err)) return NextResponse.json({ error: err.message }, { status: 503, headers: NO_STORE });
  console.error("[tender]", err);
  return NextResponse.json({ error: "Could not update the tender. Try again." }, { status: 500, headers: NO_STORE });
}

export async function GET(_req: Request, { params }: Ctx) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: "Tender not found" }, { status: 404, headers: NO_STORE });
  try {
    const view = await getTenderView(token);
    if (!view) return NextResponse.json({ error: "Tender not found" }, { status: 404, headers: NO_STORE });
    return NextResponse.json(view, { headers: NO_STORE });
  } catch (err) {
    return failure(err);
  }
}

export async function POST(req: Request, { params }: Ctx) {
  const { token } = await params;
  if (!TOKEN.test(token)) return NextResponse.json({ error: "Tender not found" }, { status: 404, headers: NO_STORE });
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: "Body must be { action: accept | decline | picked_up | delivered }" }, { status: 400, headers: NO_STORE });
  }
  try {
    return NextResponse.json(await tenderAction(token, parsed.data.action), { headers: NO_STORE });
  } catch (err) {
    return failure(err);
  }
}
