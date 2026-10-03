import { notFound } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/admin";
import { TenderView, type TenderData } from "@/components/tender/tender-view";

export const dynamic = "force-dynamic";
export const metadata = { title: "Load tender | PortCall" };

// Public carrier page: the unguessable tender token is the only credential.
export default async function TenderPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[a-f0-9]{32}$/.test(token)) notFound();
  const db = createAdminClient();
  const { data: b } = await db
    .from("bookings")
    .select("*, container:containers(*, importer:importers(name)), provider:providers(name, contact_name), quote:quotes(*)")
    .eq("tender_token", token)
    .maybeSingle();
  if (!b || !b.container) notFound();

  const data: TenderData = {
    token,
    amountCents: b.amount_cents,
    paymentStatus: b.payment_status,
    tenderStatus: b.tender_status,
    containerStatus: b.container.status,
    providerName: b.provider?.name ?? "Carrier",
    contactName: b.provider?.contact_name ?? null,
    importerName: b.container.importer?.name ?? "Importer",
    container: {
      number: b.container.container_number,
      size: b.container.size,
      terminal: b.container.terminal,
      vessel: b.container.vessel,
      eta: b.container.eta,
      lastFreeDay: b.container.last_free_day,
      deliverBy: b.container.deliver_by,
      destinationName: b.container.destination_name,
      destinationAddress: b.container.destination_address,
    },
    quote: b.quote
      ? {
          linehaul: b.quote.linehaul_cents,
          fuel: b.quote.fuel_surcharge_cents,
          chassisPerDay: b.quote.chassis_per_day_cents,
          chassisDays: b.quote.est_chassis_days,
          accessorials: (b.quote.accessorials as { name: string; cents: number }[] | null) ?? [],
          earliestPickup: b.quote.earliest_pickup,
        }
      : null,
  };
  return <TenderView data={data} />;
}
