import { formatContainerNumber } from "@/lib/money";

const PALETTE = ["#2F4F6F", "#B8862B", "#2E6658", "#5E6670", "#7A2E3B", "#9B3B2A"];
const ISO: Record<string, string> = { "40HC": "45G1", "40GP": "42G1", "20GP": "22G1", "45HC": "L5G1" };

/** Each box gets a steel color the way a fleet does; the demo box is the classic rust red. */
export function boxColor(number: string): string {
  if (number.startsWith("PHGU482913")) return "#9B3B2A";
  let h = 0;
  for (const ch of number) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return PALETTE[h % PALETTE.length];
}

/** A container door: corrugated steel in the box's color, the number stenciled white, lock rods. */
export function ContainerDoor({
  number,
  size,
  compact = false,
  className = "",
}: {
  number: string;
  size: string | null;
  compact?: boolean;
  className?: string;
}) {
  const color = boxColor(number);
  if (compact) {
    return (
      <span
        className="corrugated relative inline-flex h-9 w-16 shrink-0 items-center justify-center overflow-hidden rounded-[3px] shadow-[inset_0_0_0_1px_rgba(0,0,0,0.25)]"
        style={{ ["--box" as string]: color }}
        aria-hidden
      >
        <span className="absolute inset-y-1 right-2.5 w-[2px] rounded bg-black/25" />
        <span className="absolute inset-y-1 right-5 w-[2px] rounded bg-black/25" />
        <span className="font-stencil text-[11px] font-extrabold tracking-[0.06em] text-white/90">{number.slice(0, 4)}</span>
      </span>
    );
  }
  return (
    <div
      className={`corrugated relative overflow-hidden rounded-[10px] px-6 py-5 text-white shadow-[0_18px_40px_-24px_rgba(0,0,0,0.6),inset_0_0_0_1px_rgba(0,0,0,0.3)] sm:px-7 ${className}`}
      style={{ ["--box" as string]: color }}
    >
      {/* lock rods and handles */}
      {[16, 48].map((r) => (
        <span key={r} className="absolute inset-y-0 w-[5px] rounded bg-gradient-to-r from-black/35 via-white/15 to-black/35" style={{ right: r }}>
          <span className="absolute left-1/2 top-[55%] h-10 w-[11px] -translate-x-1/2 rounded-[3px] bg-black/30 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.15)]" />
        </span>
      ))}
      <div className="relative pr-20">
        <div className="font-stencil text-[13px] font-bold tracking-[0.14em] text-white/70">PALMETTO HOME GOODS</div>
        <h1 className="stencil mt-1 whitespace-nowrap text-[clamp(38px,5vw,68px)] leading-[0.95] text-white" data-container={number}>
          {formatContainerNumber(number)}
        </h1>
        <div className="mt-2 flex flex-wrap gap-x-6 gap-y-1 font-stencil text-[13px] font-bold tracking-[0.12em] text-white/75">
          <span>{ISO[size ?? ""] ?? size}</span>
          <span>MAX GROSS 30,480 KG</span>
          <span>TARE 3,750 KG</span>
        </div>
      </div>
    </div>
  );
}
