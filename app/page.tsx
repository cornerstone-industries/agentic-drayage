import Link from "next/link";
import { Wordmark } from "@/components/console/wordmark";
import { HeroPreview } from "@/components/landing/hero-preview";

const STEPS = [
  { title: "Your agent asks", body: "Claude calls request_quotes over MCP. Or you press Get quotes, or pg_cron fires when a box is three days out." },
  { title: "Three carriers, one minute", body: "PortCall phones your own drayage providers in parallel with a Vapi voice agent that says it is an AI." },
  { title: "Fields stamp in as they're said", body: "Claude pulls linehaul, fuel, chassis, fees and pickup from the live transcript, each linked to the line it came from." },
  { title: "Ranked on risk, not sticker price", body: "All-in plus the demurrage you'd eat if pickup lands after the last free day. Claude explains the call in plain English." },
  { title: "Booked, tendered, paid", body: "Stripe authorizes your card, the carrier taps Accept on the tender email, and delivery captures the payment." },
];

const SUPABASE = [
  { name: "Realtime", body: "Every transcript line, stamped field, ranking and payment status streams to the Call Wall as Postgres changes." },
  { name: "Postgres + RLS", body: "Ten tables, row level security on all of them. Importers only ever see their own boxes, calls and money." },
  { name: "Auth", body: "Cookie sessions for the console; the tender page runs on a one-time token; agents use a per-importer MCP key." },
  { name: "pg_cron + pg_net", body: "A cron job inside the database dials carriers on its own when a container gets close to arrival." },
];

export default function Landing() {
  return (
    <div className="overflow-x-clip">
      <header className="mx-auto flex h-16 max-w-[1280px] items-center justify-between px-4 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-2">
          <a href="#agents" className="hidden px-3 py-2 text-sm text-muted hover:text-fg sm:inline">
            For agents
          </a>
          <Link href="/dashboard" className="btn-sodium !px-4 !py-2">
            Open live demo
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1280px] gap-12 px-4 pb-20 pt-10 sm:px-6 lg:grid-cols-[1fr_minmax(0,1.05fr)] lg:items-center lg:pt-16">
          <div>
            <h1 className="font-display text-[44px] font-black uppercase leading-[0.92] tracking-tight font-wide sm:text-[64px] xl:text-[76px]">
              Agents can&apos;t pick up a phone. We give them one.
            </h1>
            <p className="mt-7 max-w-xl text-lg leading-relaxed text-muted">
              Half of freight still runs on phone calls. With PortCall, a one-person import team gets three drayage quotes in two minutes without
              making a single call, and the agent books and pays before late fees hit.
            </p>
            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link href="/dashboard" className="btn-sodium">
                Open live demo
              </Link>
              <a href="#agents" className="btn-ghost">
                Connect your agent
              </a>
            </div>
            <p className="mt-6 font-mono text-[11px] text-dim">Built on Supabase for the Select Hackathon. All data synthetic, Stripe in test mode.</p>
          </div>
          <HeroPreview />
        </section>

        <section className="border-y border-line bg-panel-2/60">
          <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6">
            <h2 className="font-display text-3xl font-black uppercase tracking-tight font-wide">How a quote run works</h2>
            <ol className="mt-10 grid gap-8 md:grid-cols-5">
              {STEPS.map((s, i) => (
                <li key={s.title} className="border-t border-line pt-4">
                  <span className="font-mono text-xs text-sodium">{String(i + 1).padStart(2, "0")}</span>
                  <h3 className="mt-2 font-display text-lg font-extrabold leading-tight font-semiwide">{s.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted">{s.body}</p>
                </li>
              ))}
            </ol>
            <p className="mt-10 max-w-3xl font-mono text-xs text-muted">
              Freight speaks EDI: the tender email is our 204, Accept is the 990, pickup and delivery are 214s, and capture on delivery is the 210.
              Voice comes first because that is where carriers already are.
            </p>
          </div>
        </section>

        <section id="agents" className="mx-auto grid max-w-[1280px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-display text-3xl font-black uppercase tracking-tight font-wide">Built for agents</h2>
            <p className="mt-4 max-w-lg text-muted">
              PortCall is an MCP server. Point Claude at it and say what you need in plain words. It lists containers, starts the calls, polls the
              quotes, books inside your guardrail and reads the timeline back.
            </p>
            <pre className="panel mt-6 overflow-x-auto rounded-[4px] p-5 font-mono text-[12.5px] leading-6 text-fg">
{`POST /api/mcp   Authorization: Bearer <importer key>

list_containers({ status? })
request_quotes({ container_id })
get_quotes({ container_id })
book_quote({ quote_id })          // over the limit? "needs human approval"
get_container_status({ container_id })`}
            </pre>
            <p className="mt-4 rounded-[4px] border border-line p-4 text-sm leading-relaxed text-fg">
              &ldquo;Container PHGU4829137 lands in Charleston in 2 days. Get it to our Atlanta DC by Friday, cheapest reliable option, book it if
              it&apos;s under our limit.&rdquo;
            </p>
          </div>
          <div>
            <h2 className="font-display text-3xl font-black uppercase tracking-tight font-wide">Running on Supabase</h2>
            <dl className="mt-6 divide-y divide-line border-y border-line">
              {SUPABASE.map((s) => (
                <div key={s.name} className="grid gap-2 py-5 sm:grid-cols-[150px_1fr]">
                  <dt className="font-display font-extrabold font-semiwide text-signal">{s.name}</dt>
                  <dd className="text-sm leading-relaxed text-muted">{s.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-line">
          <div className="mx-auto max-w-[1280px] px-4 py-16 sm:px-6">
            <p className="max-w-3xl font-display text-2xl font-extrabold leading-snug font-semiwide sm:text-3xl">
              Every call adds rate and availability data to the database. As voice models get better, agents negotiate harder and reach more of
              the carriers that only answer the phone.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link href="/dashboard" className="btn-sodium">
                Open live demo
              </Link>
              <span className="font-mono text-xs text-muted">Judge login is on the sign-in page.</span>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
