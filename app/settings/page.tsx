import { redirect } from "next/navigation";
import { TopBar } from "@/components/console/top-bar";
import { GuardrailsForm } from "@/components/settings/guardrails-form";
import { ProvidersTable } from "@/components/settings/providers-table";
import { CardOnFile } from "@/components/settings/card-on-file";
import { AgentAccess } from "@/components/settings/agent-access";
import { getSessionImporter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { appUrl, callMode } from "@/lib/env";

export const dynamic = "force-dynamic";

function safeAppUrl() {
  try {
    return appUrl();
  } catch {
    return null;
  }
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSessionImporter();
  if (!session) redirect("/login?next=/settings");
  const params = await searchParams;
  const supabase = await createClient();
  const { data: providers } = await supabase.from("providers").select("*").order("created_at");
  const imp = session.importer;
  const base = safeAppUrl();

  return (
    <>
      <TopBar importerName={imp.name} active="/settings" />
      <main className="mx-auto max-w-[1100px] px-4 pb-20 pt-8 sm:px-6">
        <h1 className="font-cond text-[56px] font-extrabold leading-[1] tracking-[-0.025em] text-fg">Settings</h1>
        <p className="mt-3 text-[17px] text-muted">Guardrails for what agents may do on their own, how you pay, and who gets the calls.</p>
        {params.card === "saved" && <p className="mt-6 rounded-[12px] border border-live/30 bg-live/5 px-4 py-2.5 text-[14px] text-live">Card saved. Bookings will authorize it off-session.</p>}
        {params.provider === "onboarded" && <p className="mt-6 rounded-[12px] border border-live/30 bg-live/5 px-4 py-2.5 text-[14px] text-live">Provider onboarding updated.</p>}

        <section className="mt-10 grid gap-10 border-t border-line pt-8 lg:grid-cols-[260px_1fr]">
          <div>
            <h2 className="font-cond text-[20px] font-bold text-fg">Guardrails</h2>
            <p className="mt-2 text-sm text-muted">Agents and auto-book can spend up to this limit. Anything above it waits for a person.</p>
          </div>
          <GuardrailsForm
            initial={{
              auto_book_enabled: imp.auto_book_enabled,
              auto_book_limit_usd: imp.auto_book_limit_cents / 100,
              auto_quote_enabled: imp.auto_quote_enabled,
              auto_quote_days_before_eta: imp.auto_quote_days_before_eta,
            }}
          />
        </section>

        <section className="mt-10 grid gap-10 border-t border-line pt-8 lg:grid-cols-[260px_1fr]">
          <div>
            <h2 className="font-cond text-[20px] font-bold text-fg">Payment method</h2>
            <p className="mt-2 text-sm text-muted">Bookings authorize this card and capture it when the carrier marks the box delivered.</p>
          </div>
          <CardOnFile customerId={imp.stripe_customer_id} paymentMethodId={imp.default_payment_method_id} />
        </section>

        <section className="mt-10 grid gap-10 border-t border-line pt-8 lg:grid-cols-[260px_1fr]">
          <div>
            <h2 className="font-cond text-[20px] font-bold text-fg">Drayage providers</h2>
            <p className="mt-2 text-sm text-muted">
              Your own carriers. PortCall only calls the ones that serve the lane, and pays them through Stripe Connect.
              {callMode() === "live" ? " Calls go to these numbers." : " Replay mode is on, so no phones ring."}
            </p>
          </div>
          <ProvidersTable providers={providers ?? []} />
        </section>

        <section className="mt-10 grid gap-10 border-t border-line pt-8 lg:grid-cols-[260px_1fr]">
          <div>
            <h2 className="font-cond text-[20px] font-bold text-fg">Agent access</h2>
            <p className="mt-2 text-sm text-muted">Connect Claude or any MCP client. The key is scoped to {imp.name}.</p>
          </div>
          <AgentAccess endpoint={base ? `${base}/api/mcp` : "/api/mcp"} apiKey={imp.mcp_api_key ?? ""} />
        </section>
      </main>
    </>
  );
}
