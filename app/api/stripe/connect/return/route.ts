import { NextResponse } from "next/server";
import { z } from "zod";
import { getSessionImporter } from "@/lib/auth";
import { getStripe, stripeMessage, syncProviderOnboarding } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Stripe's return_url. It carries no state, so ask Stripe whether the account is live
 * (charges and payouts enabled) and save that on the provider before going back to Settings.
 */
export async function GET(req: Request) {
  const to = (state: string, reason?: string) =>
    NextResponse.redirect(new URL(`/settings?provider=${state}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`, req.url));

  try {
    const session = await getSessionImporter();
    if (!session) return NextResponse.redirect(new URL("/login", req.url));

    const providerId = z.string().uuid().safeParse(new URL(req.url).searchParams.get("providerId"));
    if (!providerId.success) return to("error", "Missing provider");

    const db = createAdminClient();
    const { data: provider, error } = await db.from("providers").select("*").eq("id", providerId.data).eq("importer_id", session.importer.id).maybeSingle();
    if (error) throw new Error(`provider lookup failed: ${error.message}`);
    if (!provider?.stripe_account_id) return to("error", "Provider has no Stripe account");

    const acct = await getStripe().accounts.retrieve(provider.stripe_account_id);
    const onboarded = await syncProviderOnboarding(db, acct);
    return to(onboarded ? "onboarded" : "incomplete");
  } catch (err) {
    console.error("[stripe connect return]", err);
    return to("error", stripeMessage(err));
  }
}
