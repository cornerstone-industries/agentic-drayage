import { Suspense } from "react";
import { Wordmark } from "@/components/console/wordmark";
import { LoginForm } from "@/components/login-form";

export default function LoginPage() {
  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden border-r border-line lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(80%_60%_at_30%_20%,rgba(255,176,32,0.12),transparent_60%)]" />
        <div className="relative flex h-full flex-col justify-between p-10">
          <Wordmark />
          <div>
            <p className="stencil text-sm text-sodium">PHGU 482913-7</p>
            <p className="mt-4 max-w-md font-display text-4xl font-black uppercase leading-[0.95] font-wide">
              Three carriers on the phone before your coffee cools.
            </p>
            <p className="mt-5 max-w-sm text-muted">
              Sign in to the Palmetto Home Goods console. Every quote, booking and payment streams in live.
            </p>
          </div>
          <p className="font-mono text-[11px] text-dim">All data is synthetic. Stripe runs in test mode.</p>
        </div>
      </section>
      <section className="flex items-center justify-center px-6 py-16">
        <div className="w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Wordmark />
          </div>
          <h1 className="font-display text-2xl font-extrabold font-semiwide">Sign in</h1>
          <p className="mt-2 text-sm text-muted">Judges: use the judge login below.</p>
          <Suspense>
            <LoginForm />
          </Suspense>
        </div>
      </section>
    </main>
  );
}
