import { redirect } from "next/navigation";
import { TopBar } from "@/components/console/top-bar";
import { Board, type BoardRow } from "@/components/dashboard/board";
import { getSessionImporter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { demurragePerDayCents } from "@/lib/env";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const session = await getSessionImporter();
  if (!session) redirect("/login?next=/dashboard");
  const supabase = await createClient();
  const { data: containers } = await supabase
    .from("containers")
    .select("*, bookings(id, payment_status, tender_status, amount_cents, provider:providers(name), created_at)")
    .order("eta", { ascending: true });

  const rows: BoardRow[] = (containers ?? []).map(({ bookings, ...c }) => ({
    container: c,
    booking: [...(bookings ?? [])].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""))[0] ?? null,
  }));

  return (
    <>
      <TopBar importerName={session.importer.name} active="/dashboard" />
      <main className="mx-auto max-w-[1440px] px-4 pb-16 pt-8 sm:px-6" data-testid="dashboard">
        <Board
          initialRows={rows}
          importerName={session.importer.name}
          autoQuote={session.importer.auto_quote_enabled ? session.importer.auto_quote_days_before_eta : null}
          autoBookLimitCents={session.importer.auto_book_enabled ? session.importer.auto_book_limit_cents : null}
          demurragePerDayCents={demurragePerDayCents()}
        />
      </main>
    </>
  );
}
