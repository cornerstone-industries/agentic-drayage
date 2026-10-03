import { redirect } from "next/navigation";
import { TopBar } from "@/components/console/top-bar";
import { GuardrailsForm, type RecentQuote } from "@/components/settings/guardrails-form";
import { ProvidersList } from "@/components/settings/providers-list";
import { CardOnFile, type CardDetails } from "@/components/settings/card-on-file";
import { AgentAccess } from "@/components/settings/agent-access";
import { SettingsNav } from "@/components/settings/settings-nav";
import { Notice, Section } from "@/components/settings/section";
import { getSessionImporter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { appUrl, callMode, type CallMode } from "@/lib/env";
import { getStripe } from "@/lib/stripe";
import { PLACEHOLDER_PHONE } from "@/lib/quotes/request";

export const dynamic = "force-dynamic";

function safeAppUrl() {
  try {
    return appUrl();
  } catch {
    return null;
  }
}

/** Brand, last four and expiry of the saved card. Null when Stripe is slow or unreachable: the page still renders. */
async function cardDetails(paymentMethodId: string | null): Promise<CardDetails | null> {
  if (!paymentMethodId) return null;
  try {
    const pm = await Promise.race([
      getStripe().paymentMethods.retrieve(paymentMethodId),
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Stripe timed out")), 2500)),
    ]);
    return pm.card ? { brand: pm.card.brand, last4: pm.card.last4, expMonth: pm.card.exp_month, expYear: pm.card.exp_year } : null;
  } catch {
    return null;
  }
}

const MODE_PILL: Record<CallMode, { dot: string; label: string; note: string }> = {
  live: { dot: "bg-red", label: "Live calls", note: "Calls ring these numbers." },
  web: { dot: "bg-stamp", label: "Web calls", note: "Each carrier answers on their phone page, /phone/<provider id>." },
  replay: { dot: "bg-crane", label: "Replay mode", note: "Recorded calls play back, so no phones ring." },
};

function notice(params: Record<string, string | undefined>) {
  const reason = params.reason ? ` ${params.reason}` : "";
  if (params.card === "saved") return <Notice tone="ok">Card saved. New bookings will put their hold on it.</Notice>;
  if (params.card === "error") return <Notice tone="error">The card was not saved.{reason}</Notice>;
  if (params.provider === "onboarded") return <Notice tone="ok">Stripe is set up. That carrier can now be paid.</Notice>;
  if (params.provider === "incomplete") return <Notice tone="warn">Stripe setup is not finished yet. Pick it up again with Finish Stripe setup.</Notice>;
  if (params.provider === "error") return <Notice tone="error">Stripe setup failed.{reason}</Notice>;
  return null;
}

export default async function SettingsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const session = await getSessionImporter();
  if (!session) redirect("/login?next=/settings");
  const params = await searchParams;
  const imp = session.importer;
  const supabase = await createClient();
  const [{ data: providers }, { data: quotes }, card] = await Promise.all([
    supabase.from("providers").select("*").order("name"),
    supabase.from("quotes").select("all_in_cents, provider_id").not("all_in_cents", "is", null).order("updated_at", { ascending: false }).limit(12),
    cardDetails(imp.default_payment_method_id),
  ]);
  const base = safeAppUrl();
  const mode = callMode();
  const pill = MODE_PILL[mode];

  const providerName = new Map((providers ?? []).map((p) => [p.id, p.name]));
  const recentQuotes: RecentQuote[] = (quotes ?? []).flatMap((q) =>
    q.all_in_cents == null ? [] : [{ cents: q.all_in_cents, provider: (q.provider_id && providerName.get(q.provider_id)) || "a carrier" }],
  );
  const rows = (providers ?? []).map((p) => ({ ...p, placeholder: PLACEHOLDER_PHONE.test(p.phone ?? "") }));

  return (
    <>
      <TopBar importerName={imp.name} active="/settings" />
      <main className="mx-auto max-w-[1160px] px-4 pb-28 pt-10 sm:px-6" data-testid="settings-page">
        <h1 className="font-cond text-[56px] font-extrabold leading-[1] tracking-[-0.025em] text-fg">Settings</h1>
        <p className="mt-3 max-w-[640px] text-[17px] leading-relaxed text-muted">
          What agents may do without you, how bookings get paid, and which carriers get the calls.
        </p>
        {notice(params)}

        <div className="mt-12 grid gap-12 lg:grid-cols-[180px_minmax(0,1fr)] lg:gap-14">
          <SettingsNav />
          <div className="min-w-0 space-y-16">
            <Section id="guardrails" title="Guardrails" description="How far PortCall and your agents can go before a person has to say yes.">
              <GuardrailsForm
                initial={{
                  auto_book_enabled: imp.auto_book_enabled,
                  auto_book_limit_usd: imp.auto_book_limit_cents / 100,
                  auto_quote_enabled: imp.auto_quote_enabled,
                  auto_quote_days_before_eta: imp.auto_quote_days_before_eta,
                }}
                recentQuotes={recentQuotes}
                mode={mode}
              />
            </Section>

            <Section
              id="payment"
              title="Payment method"
              description="Each booking puts a hold on this card. It is charged only when the carrier marks the box delivered."
            >
              <CardOnFile hasCard={Boolean(imp.default_payment_method_id)} card={card} />
            </Section>

            <Section
              id="carriers"
              title="Carriers"
              description={`Your own drayage providers. PortCall calls the ones that serve the lane and pays them through Stripe Connect. ${pill.note}`}
              aside={
                <span className="inline-flex items-center gap-2 rounded-full border border-rule bg-sheet px-3 py-1.5 text-[13px] font-semibold text-fg">
                  <span className={`h-2 w-2 rounded-full ${pill.dot}`} aria-hidden />
                  {pill.label}
                </span>
              }
            >
              <ProvidersList providers={rows} mode={mode} />
            </Section>

            <Section id="agent" title="Agent access" description={`Connect Claude or any MCP client. The key only sees ${imp.name}.`}>
              <AgentAccess endpoint={base ? `${base}/api/mcp` : "/api/mcp"} apiKey={imp.mcp_api_key ?? ""} importerName={imp.name} />
            </Section>
          </div>
        </div>
      </main>
    </>
  );
}
