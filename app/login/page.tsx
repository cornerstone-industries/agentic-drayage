import { Suspense } from "react";
import { Wordmark } from "@/components/console/wordmark";
import { RunResult } from "@/components/landing/run-result";
import { LoginForm } from "@/components/login-form";

const SOURCE = "https://www.insidelogistics.ca/digitization/phone-and-email-still-most-common-way-to-make-a-freight-booking-183672/";

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
          <RunResult className="mt-7" />
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
