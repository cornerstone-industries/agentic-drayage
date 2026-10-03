// Puts a box back to "inbound" so a quote run can be replayed from the start (judges, rehearsals).
// Open Stripe authorizations for it are canceled first so no test hold is left dangling.
import type { AdminClient } from "@/lib/supabase/admin";

export async function resetContainerHistory(db: AdminClient, containerId: string): Promise<void> {
  const { data: holds } = await db
    .from("bookings")
    .select("stripe_payment_intent_id")
    .eq("container_id", containerId)
    .eq("payment_status", "authorized");
  const intents = (holds ?? []).map((b) => b.stripe_payment_intent_id).filter((id): id is string => Boolean(id?.startsWith("pi_")));
  if (intents.length && process.env.STRIPE_SECRET_KEY) {
    const { getStripe } = await import("@/lib/stripe");
    const stripe = getStripe();
    await Promise.all(intents.map((id) => stripe.paymentIntents.cancel(id).catch(() => undefined)));
  }
  for (const table of ["bookings", "recommendations", "quote_requests", "quotes", "events"] as const) {
    const { error } = await db.from(table).delete().eq("container_id", containerId);
    if (error) throw new Error(`reset ${table}: ${error.message}`);
  }
  const { error } = await db.from("containers").update({ status: "inbound" }).eq("id", containerId);
  if (error) throw new Error(`reset container: ${error.message}`);
}
