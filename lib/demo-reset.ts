// Puts a box back to "inbound" so a quote run can be replayed from the start (judges, rehearsals).
// Open Stripe authorizations for it are canceled first so no test hold is left dangling.
import type { AdminClient } from "@/lib/supabase/admin";

/** Cancels the box's open Stripe holds. Shared with the CLI npm run demo:reset. Returns how many were canceled. */
export async function cancelOpenHolds(db: AdminClient, containerId: string): Promise<number> {
  const { data: holds } = await db
    .from("bookings")
    .select("stripe_payment_intent_id")
    .eq("container_id", containerId)
    .eq("payment_status", "authorized");
  const intents = (holds ?? []).map((b) => b.stripe_payment_intent_id).filter((id): id is string => Boolean(id?.startsWith("pi_")));
  if (intents.length && process.env.STRIPE_SECRET_KEY) {
    const { getStripe } = await import("@/lib/stripe");
    const stripe = getStripe();
    const results = await Promise.all(intents.map((id) => stripe.paymentIntents.cancel(id).then(() => true, () => false)));
    return results.filter(Boolean).length;
  }
  return 0;
}

export async function resetContainerHistory(db: AdminClient, containerId: string): Promise<void> {
  await cancelOpenHolds(db, containerId);
  for (const table of ["bookings", "recommendations", "quote_requests", "quotes", "events"] as const) {
    const { error } = await db.from(table).delete().eq("container_id", containerId);
    if (error) throw new Error(`reset ${table}: ${error.message}`);
  }
  const { error } = await db.from("containers").update({ status: "inbound" }).eq("id", containerId);
  if (error) throw new Error(`reset container: ${error.message}`);
}
