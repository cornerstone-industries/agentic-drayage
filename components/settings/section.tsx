import type { ReactNode } from "react";

/** One settings section: a heading and one sentence, an optional status on the right, then its panel. */
export function Section({
  id,
  title,
  description,
  aside,
  children,
}: {
  id: string;
  title: string;
  description: ReactNode;
  aside?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section id={id} aria-labelledby={`${id}-title`} className="scroll-mt-24">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="max-w-[580px]">
          <h2 id={`${id}-title`} className="font-cond text-[26px] font-bold leading-tight tracking-[-0.01em] text-fg">
            {title}
          </h2>
          <p className="mt-1.5 text-[15px] leading-relaxed text-muted">{description}</p>
        </div>
        {aside}
      </div>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Banner for the result of a Stripe round trip (card setup, carrier onboarding). */
export function Notice({ tone, children }: { tone: "ok" | "warn" | "error"; children: ReactNode }) {
  const styles = {
    ok: "border-live/25 bg-live/[0.06] text-live",
    warn: "border-crane/25 bg-canary/60 text-fg",
    error: "border-red/25 bg-red/[0.05] text-red",
  }[tone];
  return (
    <p role="status" className={`mt-6 max-w-[720px] rounded-[12px] border px-4 py-3 text-[14.5px] font-semibold ${styles}`}>
      {children}
    </p>
  );
}
