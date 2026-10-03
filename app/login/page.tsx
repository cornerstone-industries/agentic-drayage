import { Suspense } from "react";
import { Wordmark } from "@/components/console/wordmark";
import { ContainerDoor } from "@/components/freight/container-door";
import { RubberStamp } from "@/components/freight/rubber-stamp";
import { LoginForm } from "@/components/login-form";

// What a quote run on the demo box hands back (the same numbers as the replay fixtures).
const RUN = [
  { name: "Marshgrass Drayage", price: "$847", note: "Picks up on time and meets the deliver-by date", won: true },
  { name: "Sweetgrass Transport", price: "$931.80", note: "$720 with chassis, fuel 19% on top, $75 pre-pull fee" },
  { name: "Ironclad Intermodal", paper: "$595", price: "$945", note: "Picks up after the last free day: +$350 demurrage", bad: true },
];

function RunResult() {
  return (
    <figure className="mt-9">
      <div className="overflow-hidden rounded-[18px] border border-rule bg-sheet shadow-[0_24px_60px_-40px_rgba(18,20,23,0.5)]">
        <div className="flex items-center gap-3 border-b border-rule px-5 py-3.5">
          <ContainerDoor number="PHGU4829137" size="40HC" compact />
          <div>
            <div className="stencil text-[18px] leading-none text-fg">PHGU 482913-7</div>
            <div className="mt-1 text-[12.5px] text-muted">Wando Welch Terminal to Fairburn, GA</div>
          </div>
          <span className="ml-auto text-[12.5px] text-muted">3 carriers called</span>
        </div>
        <ol>
          {RUN.map((r, i) => (
            <li key={r.name} className="grid grid-cols-[18px_1fr_auto] items-start gap-x-3 border-b border-rule px-5 py-3.5 last:border-0">
              <span className="pt-px font-mono text-[13px] text-dim">{i + 1}</span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <span className="font-semibold text-fg">{r.name}</span>
                  {r.won && (
                    <RubberStamp size="sm" rotate={-4}>
                      Awarded
                    </RubberStamp>
                  )}
                </div>
                <div className={`mt-0.5 text-[13px] ${r.bad ? "text-red" : "text-muted"}`}>{r.note}</div>
              </div>
              <div className="whitespace-nowrap text-right font-mono text-[17px] font-semibold tabular-nums text-fg">
                {r.paper && <span className="mr-2 text-[13px] font-normal text-dim line-through">{r.paper}</span>}
                {r.price}
              </div>
            </li>
          ))}
        </ol>
      </div>
      <figcaption className="mt-3 text-[13.5px] text-muted">
        Ranked on all-in price plus estimated demurrage. The cheapest quote on paper ends up the most expensive.
      </figcaption>
    </figure>
  );
}

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="hidden flex-col justify-between gap-12 border-r border-rule p-10 lg:flex xl:p-14">
        <Wordmark />
        <div className="max-w-[560px]">
          <h2 className="font-cond text-[50px] font-extrabold leading-[0.96] tracking-[-0.025em] text-fg xl:text-[58px]">
            Agents can&apos;t pick up a phone. PortCall gives them one.
          </h2>
          <p className="mt-5 text-[17px] leading-relaxed text-muted">
            Half of freight still runs on phone calls. When a container lands, PortCall calls your truckers at the same time, ranks their quotes on
            what they will really cost, and books the best one before late fees start.
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
