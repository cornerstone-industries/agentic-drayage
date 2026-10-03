import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionImporter } from "@/lib/auth";
import { NotConfiguredError } from "@/lib/env";
import {
  accountIsOnboarded,
  createOnboardingLink,
  ensureExpressAccount,
  getStripe,
  isStripeConfigError,
  stripeMessage,
  syncProviderOnboarding,
} from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

class ConnectError extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

const Body = z.object({ providerId: z.string().uuid() });

/** Express account for the provider (created once), then a one-time hosted onboarding link. */
async function startOnboarding(providerId: string, requestUrl: string): Promise<{ url: string; onboarded: boolean }> {
  const session = await getSessionImporter();
  if (!session) throw new ConnectError(401, "Sign in to invite a provider");

  const db = createAdminClient();
  const { data: provider, error } = await db.from("providers").select("*").eq("id", providerId).eq("importer_id", session.importer.id).maybeSingle();
  if (error) throw new Error(`provider lookup failed: ${error.message}`);
  if (!provider) throw new ConnectError(404, "Provider not found");

  const stripe = getStripe();
  const acct = await ensureExpressAccount(db, stripe, provider);
  if (accountIsOnboarded(acct)) {
    await syncProviderOnboarding(db, acct);
    return { url: new URL("/settings?provider=onboarded", requestUrl).toString(), onboarded: true };
  }
  return { url: await createOnboardingLink(stripe, acct.id, provider.id), onboarded: false };
}

function failure(err: unknown) {
  if (err instanceof ConnectError) return NextResponse.json({ error: err.message }, { status: err.status });
  if (err instanceof NotConfiguredError || isStripeConfigError(err)) return NextResponse.json({ error: (err as Error).message }, { status: 503 });
  console.error("[stripe connect]", err);
  return NextResponse.json({ error: stripeMessage(err) }, { status: 502 });
}

/** Settings "Invite provider". Returns { url, onboarded }: redirect the browser to url. */
export async function POST(req: Request) {
  const parsed = Body.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Body must be { providerId: uuid }" }, { status: 400 });
  try {
    return NextResponse.json(await startOnboarding(parsed.data.providerId, req.url));
  } catch (err) {
    return failure(err);
  }
}

/** Stripe's refresh_url: the link expired or was already opened, so mint a fresh one and send the browser on. */
export async function GET(req: Request) {
  const providerId = new URL(req.url).searchParams.get("providerId");
  const parsed = z.string().uuid().safeParse(providerId);
  const back = (reason: string) => NextResponse.redirect(new URL(`/settings?provider=error&reason=${encodeURIComponent(reason)}`, req.url));
  if (!parsed.success) return back("Missing provider");
  try {
    return NextResponse.redirect((await startOnboarding(parsed.data, req.url)).url);
  } catch (err) {
    if (err instanceof ConnectError && err.status === 401) return NextResponse.redirect(new URL("/login", req.url));
    console.error("[stripe connect refresh]", err);
    return back(err instanceof Error ? err.message : "Could not restart onboarding");
  }
}
