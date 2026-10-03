import { notFound, redirect } from "next/navigation";
import { TopBar } from "@/components/console/top-bar";
import { ContainerLive } from "@/components/callwall/container-live";
import { getSessionImporter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { loadSnapshot } from "@/lib/live/snapshot";
import { callMode, demurragePerDayCents } from "@/lib/env";
import { aiMode } from "@/lib/ai";
import { laneCheck } from "@/lib/quotes/request";
import { stateFromAddress } from "@/lib/money";
import { getLaneHistory, laneOf } from "@/lib/lanes";

export const dynamic = "force-dynamic";

export default async function ContainerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSessionImporter();
  if (!session) redirect(`/login?next=/containers/${id}`);
  const supabase = await createClient();
  const snapshot = await loadSnapshot(supabase, id);
  if (!snapshot) notFound();
  const { data: providers } = await supabase.from("providers").select("*").order("created_at");

  const lane = laneOf(snapshot.container);
  const laneHistory = lane ? await getLaneHistory(supabase, session.importer.id, lane) : null;
  const port = snapshot.container.port ?? "Charleston";
  const dest = stateFromAddress(snapshot.container.destination_address);
  const eligibleIds: string[] = [];
  const skipped: { providerId: string; providerName: string; reason: string }[] = [];
  for (const p of providers ?? []) {
    const reason = laneCheck(p, port, dest);
    if (reason) skipped.push({ providerId: p.id, providerName: p.name, reason });
    else eligibleIds.push(p.id);
  }

  return (
    <>
      <TopBar importerName={session.importer.name} />
      <main className="mx-auto max-w-[1440px] px-4 pb-20 pt-6 sm:px-6">
        <ContainerLive
          laneHistory={laneHistory}
          initial={snapshot}
          providers={providers ?? []}
          eligibleIds={eligibleIds}
          skipped={skipped}
          mode={callMode()}
          aiEngine={aiMode()}
          demurragePerDayCents={demurragePerDayCents()}
          autoBook={{ enabled: session.importer.auto_book_enabled, limitCents: session.importer.auto_book_limit_cents }}
        />
      </main>
    </>
  );
}
