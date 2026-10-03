import { NextResponse } from "next/server";
import { z } from "zod";
import { UUID, declineCall, getIncomingCall } from "@/lib/phone";

// Public on purpose: the provider id in the carrier's phone page link is the credential.
const NO_STORE = { "Cache-Control": "no-store" };
const Body = z.object({ action: z.literal("decline"), callId: z.string().regex(UUID) });

type Ctx = { params: Promise<{ providerId: string }> };

export async function GET(_req: Request, { params }: Ctx) {
  const { providerId } = await params;
  if (!UUID.test(providerId)) return NextResponse.json({ error: "Provider not found" }, { status: 404, headers: NO_STORE });
  const call = await getIncomingCall(providerId);
  return NextResponse.json({ call }, { headers: NO_STORE });
}

export async function POST(req: Request, { params }: Ctx) {
  const { providerId } = await params;
  const body = Body.safeParse(await req.json().catch(() => null));
  if (!UUID.test(providerId) || !body.success) return NextResponse.json({ error: "Bad request" }, { status: 400, headers: NO_STORE });
  const ok = await declineCall(providerId, body.data.callId);
  if (!ok) return NextResponse.json({ error: "That call is no longer ringing" }, { status: 409, headers: NO_STORE });
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
