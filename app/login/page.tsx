import { Suspense } from "react";
import { Wordmark } from "@/components/console/wordmark";
import { ContainerDoor } from "@/components/freight/container-door";
import { RubberStamp } from "@/components/freight/rubber-stamp";
import { LoginForm } from "@/components/login-form";
import { formatUsd } from "@/lib/money";

const SOURCE = "https://www.insidelogistics.ca/digitization/phone-and-email-still-most-common-way-to-make-a-freight-booking-183672/";

// A quote run on the demo box (the same numbers as the replay fixtures). Bars share one scale from $0.
const RUN = [
  { name: "Marshgrass Drayage", quotedCents: 84700, lateCents: 0, note: "Picks up on time", won: true },
  { name: "Sweetgrass Transport", quotedCents: 93180, lateCents: 0, note: "Picks up on time, adds a $75 pre-pull fee" },
  { name: "Ironclad Intermodal", quotedCents: 59500, lateCents: 35000, note: "Quoted $595, but picks up 2 days after the last free day" },
];
const MAX_CENTS = Math.max(...RUN.map((r) => r.quotedCents + r.lateCents));
const LATE_FILL = "repeating-linear-gradient(135deg, rgb(var(--red-rgb)) 0 4px, rgb(var(--red-rgb) / 0.55) 4px 8px)";

function RunResult() {
  return (
    <figure className="mt-7">
      <div className="overflow-hidden rounded-[18px] border border-rule bg-sheet shadow-[0_24px_60px_-40px_rgba(18,20,23,0.5)]">
        <div className="flex items-center gap-3 border-b border-rule px-5 py-3.5">
          <ContainerDoor number="PHGU4829137" size="40HC" compact />
          <div>
            <div className="stencil text-[18px] leading-none text-fg">PHGU 482913-7</div>
            <div className="mt-1 text-[12.5px] text-muted">Wando Welch Terminal to Fairburn, GA</div>
          </div>
        </div>
        <div className="px-5 pt-4 text-[13.5px] font-semibold text-fg">3 quotes, ranked by what each will really cost</div>
        <ol className="space-y-3.5 px-5 pb-4 pt-3">
          {RUN.map((r) => {
            const total = r.quotedCents + r.lateCents;
            return (
              <li key={r.name}>
                <div className="flex items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                    <span className="font-semibold text-fg">{r.name}</span>
                    {r.won && (
                      <RubberStamp size="sm" color="green" rotate={-4}>
                        Booked
                      </RubberStamp>
                    )}
                  </div>
                  <span className="font-mono text-[17px] font-semibold tabular-nums text-fg">{formatUsd(total)}</span>
                </div>
                <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-panel-2" aria-hidden>
                  <span className="bg-fg/75" style={{ width: `${(r.quotedCents / MAX_CENTS) * 100}%` }} />
                  {r.lateCents > 0 && <span className="border-l-2 border-sheet" style={{ width: `${(r.lateCents / MAX_CENTS) * 100}%`, background: LATE_FILL }} />}
                </div>
                <p className={`mt-1.5 text-[13px] ${r.lateCents ? "text-red" : "text-muted"}`}>
                  {r.note}
                  {r.lateCents > 0 && <>: +{formatUsd(r.lateCents)} in port late fees</>}
                </p>
              </li>
            );
          })}
        </ol>
        <div className="flex flex-wrap gap-x-5 gap-y-1 border-t border-rule bg-panel-2 px-5 py-2.5 text-[12.5px] text-muted">
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-4 rounded-full bg-fg/75" /> Quoted price
          </span>
          <span className="inline-flex items-center gap-2">
            <span className="h-2 w-4 rounded-full" style={{ background: LATE_FILL }} /> Port late fees (est. demurrage, $175/day)
          </span>
        </div>
      </div>
      <figcaption className="mt-3.5 text-[15px] leading-relaxed text-fg">
        Ironclad quoted $252 less, but it picks up after the last free day. Counting late fees, Marshgrass costs the least, so PortCall booked it.
      </figcaption>
    </figure>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between gap-10 border-r border-rule p-10 lg:flex xl:px-14">
        <Wordmark />
        <div className="max-w-[560px]">
          <h2 className="font-cond text-[44px] font-extrabold leading-[0.96] tracking-[-0.025em] text-fg xl:text-[52px]">
            Agents can&apos;t pick up a phone. PortCall gives them one.
          </h2>
          <p className="mt-4 text-[16.5px] leading-relaxed text-muted">
            <a
              href={SOURCE}
              target="_blank"
              rel="noreferrer"
              className="underline decoration-dim decoration-dotted decoration-[1.5px] underline-offset-[5px] hover:text-fg hover:decoration-fg"
              title="Container xChange and Copenhagen Business School survey of 137 freight forwarders, November 2022"
            >
              84% of freight forwarders still get quotes by phone and email.
            </a>{" "}
            When a container lands, PortCall calls your truckers at the same time, ranks their quotes on what they will really cost, and books the
            best one before late fees start.
          </p>
          <RunResult />
        </div>
        <p className="text-[13px] text-muted">All data is synthetic. Stripe runs in test mode.</p>
      </section>

      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Wordmark />
            <p className="mt-6 font-cond text-[30px] font-extrabold leading-[1] tracking-[-0.02em] text-fg">
              Agents can&apos;t pick up a phone. PortCall gives them one.
            </p>
          </div>
          <h1 className="font-cond text-[36px] font-extrabold tracking-[-0.02em] text-fg">Sign in</h1>
          <p className="mt-2 text-[15px] text-muted">Judges: use the judge login below.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
