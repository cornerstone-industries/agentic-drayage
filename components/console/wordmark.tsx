import Link from "next/link";

/** A container end-on, with one lit call light. */
export function Wordmark({ href = "/" }: { href?: string }) {
  return (
    <Link href={href} className="group inline-flex items-center gap-2.5" aria-label="PortCall home">
      <span className="relative grid h-[26px] w-[26px] place-items-center overflow-hidden rounded-[7px] bg-fg">
        <span className="absolute inset-[5px] flex justify-between">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="w-[2px] rounded-full bg-white/80" />
          ))}
        </span>
        <span className="absolute right-[3px] top-[3px] h-[5px] w-[5px] rounded-full bg-crane ring-2 ring-fg" />
      </span>
      <span className="font-cond text-[21px] font-extrabold tracking-[-0.01em] text-fg">PortCall</span>
    </Link>
  );
}
