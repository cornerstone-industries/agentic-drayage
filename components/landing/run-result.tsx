import { ContainerDoor } from "@/components/freight/container-door";
import { RubberStamp } from "@/components/freight/rubber-stamp";
import { formatUsd } from "@/lib/money";

// A quote run on the demo box: the same numbers as the replay fixtures, the times from a measured
// production run (Oct 3). Bars share one scale from $0.
const STEPS = [
  { at: "0:04", label: "3 calls placed" },
  { at: "0:38", label: "First prices heard" },
  { at: "1:36", label: "Ranked by real cost" },
  { at: "1:37", label: "Booked" },
];
const RUN = [
  { name: "Marshgrass Drayage", quotedCents: 84700, lateCents: 0, note: "Picks up on time", won: true },
  { name: "Sweetgrass Transport", quotedCents: 93180, lateCents: 0, note: "Picks up on time, adds a $75 pre-pull fee" },
  { name: "Ironclad Intermodal", quotedCents: 59500, lateCents: 35000, note: "Quoted $595, but picks up 2 days after the last free day" },
];
const MAX_CENTS = Math.max(...RUN.map((r) => r.quotedCents + r.lateCents));
const LATE_FILL = "repeating-linear-gradient(135deg, rgb(var(--red-rgb)) 0 4px, rgb(var(--red-rgb) / 0.55) 4px 8px)";

/** What one quote run did and what it decided, readable in ten seconds. */
export function RunResult({ steps = true, className = "" }: { steps?: boolean; className?: string }) {
  return (
    <figure className={className}>
      <div className="overflow-hidden rounded-[18px] border border-rule bg-sheet text-left shadow-[0_24px_60px_-40px_rgba(18,20,23,0.5)]">
        <div className="flex items-center gap-3 border-b border-rule px-5 py-3.5">
          <ContainerDoor number="PHGU4829137" size="40HC" compact />
          <div>
            <div className="stencil text-[18px] leading-none text-fg">PHGU 482913-7</div>
            <div className="mt-1 text-[12.5px] text-muted">Wando Welch Terminal to Fairburn, GA</div>
          </div>
          <span className="ml-auto text-[12.5px] text-muted">Test run</span>
        </div>

        {steps && (
          <ol className="relative grid grid-cols-4 border-b border-rule px-5 pb-3.5 pt-4">
            <span className="absolute top-[21px] h-[2px] bg-fg/75" style={{ left: "calc(20px + (100% - 40px) * 0.125)", right: "calc(20px + (100% - 40px) * 0.125)" }} aria-hidden />
            {STEPS.map((s) => (
              <li key={s.label} className="relative flex flex-col items-center text-center">
                <span className="h-[11px] w-[11px] rounded-full border-2 border-sheet bg-fg ring-2 ring-fg/75" aria-hidden />
                <span className="mt-2 text-[12.5px] font-semibold leading-tight text-fg">{s.label}</span>
                <span className="mt-0.5 font-mono text-[11.5px] tabular-nums text-muted">{s.at}</span>
              </li>
            ))}
          </ol>
        )}

        <div className="px-5 pt-3.5 text-[13.5px] font-semibold text-fg">What each quote would really cost</div>
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
        Ironclad looked $252 cheaper, but it picks up after the last free day. PortCall booked Marshgrass for $847,{" "}
        <span className="font-semibold">$98 less than Ironclad would really have cost</span>, and no one on your team made a call.
      </figcaption>
    </figure>
  );
}
