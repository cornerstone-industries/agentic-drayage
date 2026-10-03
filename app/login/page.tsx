import { Suspense } from "react";
import { Wordmark } from "@/components/console/wordmark";
import { ContainerDoor } from "@/components/freight/container-door";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      <section className="hidden flex-col justify-between border-r border-rule p-10 lg:flex">
        <Wordmark />
        <div className="max-w-xl">
          <ContainerDoor number="PHGU4829137" size="40HC" />
          <p className="mt-10 font-cond text-[48px] font-extrabold leading-[0.98] tracking-[-0.025em] text-fg">
            Three carriers on the phone before your coffee cools.
          </p>
          <p className="mt-5 max-w-md text-[17px] leading-relaxed text-muted">
            Sign in to the Palmetto Home Goods console. Every quote, booking and payment shows up live.
          </p>
        </div>
        <p className="text-[13px] text-muted">All data is synthetic. Stripe runs in test mode.</p>
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Wordmark />
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
