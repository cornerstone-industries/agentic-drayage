import Link from "next/link";

/** Signal P: a stack of three boxes for the stem, the bowl ringing out like a call. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-1.5" aria-label="PortCall home">
      <svg width="15" height="20" viewBox="10 3 40 53" aria-hidden="true" className="shrink-0">
        <rect x="12" y="11" width="12" height="13" rx="2" className="fill-fg" />
        <rect x="12" y="26.5" width="12" height="13" rx="2" className="fill-fg" />
        <rect x="12" y="42" width="12" height="13" rx="2" className="fill-fg" />
        <path d="M24 14A11 11 0 0 1 24 36" fill="none" className="stroke-fg" strokeWidth={6} />
        <path d="M27 6.2A19 19 0 0 1 27 43.8" fill="none" className="stroke-crane" strokeWidth={4.5} strokeLinecap="round" />
      </svg>
      <span className="font-cond text-[21px] font-extrabold tracking-[-0.02em] text-fg">PortCall</span>
    </Link>
  );
}
