import { NextResponse } from "next/server";
import { getSessionImporter } from "@/lib/auth";
import { appUrl, NotConfiguredError } from "@/lib/env";
import { ensureImporterCustomer, getStripe, isStripeConfigError, stripeMessage } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/** Settings "Add card": a Stripe Checkout Session in setup mode for the signed-in importer. Returns { url }. */
export async function POST() {
  try {
    const session = await getSessionImporter();
    if (!session) return NextResponse.json({ error: "Sign in to add a card" }, { status: 401 });

    const stripe = getStripe();
    const customerId = await ensureImporterCustomer(createAdminClient(), stripe, session.importer);
    const base = appUrl();
    const checkout = await stripe.checkout.sessions.create({
      mode: "setup",
      customer: customerId,
      currency: "usd", // required in setup mode now that payment_method_types is gone from this API version
      allowed_payment_method_types: ["card"], // only cards can be held and captured later (no ACH)
      success_url: `${base}/api/stripe/setup/return?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/settings`,
      metadata: { importer_id: session.importer.id },
    });
    if (!checkout.url) return NextResponse.json({ error: "Stripe returned no Checkout URL" }, { status: 502 });
    return NextResponse.json({ url: checkout.url });
  } catch (err) {
    if (err instanceof NotConfiguredError || isStripeConfigError(err)) return NextResponse.json({ error: (err as Error).message }, { status: 503 });
    console.error("[stripe setup]", err);
    return NextResponse.json({ error: stripeMessage(err) }, { status: 502 });
  }
}
