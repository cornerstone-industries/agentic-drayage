import { NextResponse } from "next/server";
import { getSessionImporter } from "@/lib/auth";
import { getStripe, saveDefaultCard, stripeMessage } from "@/lib/stripe";
import { createAdminClient } from "@/lib/supabase/admin";

/** Stripe sends the browser here after the card form: save the card, then back to Settings. */
export async function GET(req: Request) {
  const back = (state: "saved" | "error", reason?: string) =>
    NextResponse.redirect(new URL(`/settings?card=${state}${reason ? `&reason=${encodeURIComponent(reason)}` : ""}`, req.url));

  try {
    const session = await getSessionImporter();
    if (!session) return NextResponse.redirect(new URL("/login", req.url));

    const sessionId = new URL(req.url).searchParams.get("session_id");
    if (!sessionId) return back("error", "Missing Checkout session");

    const stripe = getStripe();
    const cs = await stripe.checkout.sessions.retrieve(sessionId);
    const customerId = typeof cs.customer === "string" ? cs.customer : cs.customer?.id;
    const setupIntentId = typeof cs.setup_intent === "string" ? cs.setup_intent : cs.setup_intent?.id;
    if (cs.mode !== "setup" || cs.status !== "complete" || !customerId || !setupIntentId) return back("error", "Card setup was not completed");
    // Only the importer that started this Checkout may save its card.
    if (customerId !== session.importer.stripe_customer_id) return back("error", "That card setup belongs to another account");

    const saved = await saveDefaultCard(createAdminClient(), stripe, { customerId, setupIntentId });
    if (!saved) return back("error", "No importer found for this card");
    return back("saved");
  } catch (err) {
    console.error("[stripe setup return]", err);
    return back("error", stripeMessage(err));
  }
}
