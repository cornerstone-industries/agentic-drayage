import Link from "next/link";
import { Wordmark } from "@/components/console/wordmark";
import { HeroPreview } from "@/components/landing/hero-preview";

const RUN = [
  { at: "0:00", title: "Claude asks for quotes", body: "An agent calls request_quotes over MCP. A person can press the button, or pg_cron starts it when a box is three days out." },
  { at: "0:03", title: "Three phones ring at once", body: "PortCall calls Marshgrass, Ironclad and Sweetgrass in parallel and says it is an AI in the first sentence." },
  { at: "0:40", title: "Numbers land as they are spoken", body: "Linehaul, fuel, chassis, extra fees and pickup date are pulled from each conversation and linked to the exact words." },
  { at: "1:30", title: "Ranked on what it will really cost", body: "Ironclad is $252 cheaper on paper, but its pickup lands two days after the last free day. Marshgrass wins at $847." },
  { at: "1:31", title: "Booked inside the spending limit", body: "Stripe holds the card, a tender email goes to the carrier, and delivery releases the payment." },
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
      <header className="mx-auto flex h-16 max-w-[1240px] items-center justify-between px-4 sm:px-6">
        <Wordmark />
        <nav className="flex items-center gap-2">
          <a href="#agents" className="hidden rounded-full px-3.5 py-2 text-[14.5px] font-semibold text-muted hover:text-fg sm:inline">
            For agents
          </a>
          <Link href="/dashboard" className="btn-primary !px-5 !py-2.5">
            Open live demo
          </Link>
        </nav>
      </header>

      <main>
        <section className="mx-auto max-w-[1240px] px-4 pb-20 pt-14 text-center sm:px-6 sm:pt-20">
          <h1 className="mx-auto max-w-[15ch] font-cond text-[52px] font-extrabold leading-[0.95] tracking-[-0.03em] text-fg sm:text-[84px] lg:text-[104px]">
            Agents can&apos;t pick up a phone. We give them one.
          </h1>
          <p className="mx-auto mt-7 max-w-[46ch] text-[19px] leading-[1.55] text-muted sm:text-[21px]">
            Half of freight still runs on phone calls. With PortCall, <span className="font-semibold text-fg">a one-person import team</span> gets{" "}
            <span className="font-semibold text-fg">three drayage quotes in two minutes</span> without making a call, and the agent{" "}
            <span className="font-semibold text-fg">books and pays before late fees hit</span>.
          </p>
          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            <Link href="/dashboard" className="btn-primary !px-7 !py-3.5 !text-[16px]">
              Open live demo
            </Link>
            <a href="#agents" className="btn-ghost !px-6 !py-3.5 !text-[16px]">
              Connect your agent
            </a>
          </div>

          <div className="mx-auto mt-16 max-w-[1080px] rounded-[28px] border border-rule bg-sheet/70 p-5 text-left shadow-[0_40px_90px_-60px_rgba(18,20,23,0.6)] sm:p-8">
            <HeroPreview />
          </div>
        </section>

        <section className="border-y border-rule bg-sheet">
          <div className="mx-auto grid max-w-[1240px] gap-12 px-4 py-20 sm:px-6 lg:grid-cols-[380px_1fr]">
            <div>
              <h2 className="font-cond text-[44px] font-extrabold leading-[1] tracking-[-0.02em] text-fg">One quote run, start to finish</h2>
              <p className="mt-5 text-[17px] leading-relaxed text-muted">
                Times from a real run on the demo container. The freight world&apos;s paperwork still happens, it just happens without anyone dialing.
              </p>
            </div>
            <ol className="divide-y divide-rule border-y border-rule">
              {RUN.map((r) => (
                <li key={r.at} className="grid grid-cols-[72px_1fr] gap-6 py-5 sm:grid-cols-[96px_1fr]">
                  <span className="font-mono text-[15px] font-medium tabular-nums text-muted">{r.at}</span>
                  <div>
                    <div className="text-[17px] font-semibold text-fg">{r.title}</div>
                    <div className="mt-1 text-[15px] leading-relaxed text-muted">{r.body}</div>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="agents" className="mx-auto grid max-w-[1240px] gap-14 px-4 py-20 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="font-cond text-[44px] font-extrabold leading-[1] tracking-[-0.02em] text-fg">Built for agents</h2>
            <p className="mt-5 max-w-lg text-[17px] leading-relaxed text-muted">
              PortCall is an MCP server. Point Claude at it and say what you need in plain words. It lists containers, starts the calls, polls the
              quotes, books inside your spending limit and reads the timeline back.
            </p>
            <pre className="mt-7 overflow-x-auto rounded-[18px] bg-fg p-6 font-mono text-[13px] leading-6 text-white/90">
{`POST /api/mcp   Authorization: Bearer <importer key>

list_containers({ status? })
request_quotes({ container_id })
get_quotes({ container_id })
book_quote({ quote_id })
get_container_status({ container_id })`}
            </pre>
            <p className="mt-3 text-[14px] text-muted">Over the importer&apos;s limit, book_quote answers &ldquo;needs human approval&rdquo; and a person decides.</p>
            <p className="mt-4 rounded-[18px] border border-rule bg-sheet p-5 text-[16px] leading-relaxed text-fg">
              &ldquo;Container PHGU4829137 lands in Charleston in 2 days. Get it to our Atlanta DC by Friday, cheapest reliable option, book it if
              it&apos;s under our limit.&rdquo;
            </p>
          </div>
          <div>
            <h2 className="font-cond text-[44px] font-extrabold leading-[1] tracking-[-0.02em] text-fg">Running on Supabase</h2>
            <dl className="mt-7 divide-y divide-rule overflow-hidden rounded-[18px] border border-rule bg-sheet">
              {SUPABASE.map((s) => (
                <div key={s.name} className="grid gap-2 px-6 py-5 sm:grid-cols-[150px_1fr]">
                  <dt className="font-cond text-[18px] font-bold text-fg">{s.name}</dt>
                  <dd className="text-[15px] leading-relaxed text-muted">{s.body}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <section className="border-t border-rule">
          <div className="mx-auto max-w-[1240px] px-4 py-20 sm:px-6">
            <p className="max-w-4xl font-cond text-[36px] font-bold leading-[1.1] tracking-[-0.015em] text-fg sm:text-[44px]">
              Every call adds rate and availability data to the database. As voice models get better, agents negotiate harder and reach more of
              the carriers that only answer the phone.
            </p>
            <div className="mt-9">
              <Link href="/dashboard" className="btn-primary !px-7 !py-3.5 !text-[16px]">
                Open live demo
              </Link>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
