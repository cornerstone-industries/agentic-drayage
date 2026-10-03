import Link from "next/link";

/** A berth light + the name, stenciled wide. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="PortCall home">
      <span className="relative grid h-6 w-6 place-items-center">
        <span className="absolute inset-0 rounded-full bg-sodium/20 blur-[6px] transition-opacity group-hover:opacity-100" />
        <svg viewBox="0 0 24 24" className="relative h-6 w-6" aria-hidden>
          <rect x="3" y="7" width="18" height="10" rx="1" fill="none" stroke="var(--sodium)" strokeWidth="1.6" />
          {[7, 10, 13, 16].map((x) => (
            <line key={x} x1={x} y1="9" x2={x} y2="15" stroke="var(--sodium)" strokeWidth="1.2" />
          ))}
          <circle cx="12" cy="3.5" r="1.6" fill="var(--sodium)" />
        </svg>
      </span>
      <span className="font-display text-[15px] font-black uppercase tracking-[0.08em] font-wide">PortCall</span>
    </Link>
  );
}
