"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { LayoutGroup, motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { authorizeRealtime } from "@/lib/supabase/realtime";
import { daysBetween, formatContainerNumber, formatUsd } from "@/lib/money";
import { cityFromAddress, portDate, shortDate } from "@/lib/dates";
import { stateFromAddress } from "@/lib/money";
import { ContainerDoor } from "@/components/freight/container-door";
import { stageIndex } from "@/components/freight/journey-track";
import type { Booking, Container } from "@/lib/types";

type BookingLite = Pick<Booking, "id" | "payment_status" | "tender_status" | "amount_cents" | "created_at"> & {
  provider: { name: string } | null;
};
export type BoardRow = { container: Container; booking: BookingLite | null };

const DAY = 86_400_000;
const HOUR = 3_600_000;

const STATUS_COPY: Record<string, string> = {
  inbound: "Needs quotes",
  quoting: "Calling carriers now",
  quoted: "Quotes ready to book",
  booked: "Booked, waiting on carrier",
  accepted: "Carrier accepted",
  picked_up: "On the road",
  delivered: "Delivered",
};
const CTA: Record<string, string> = { inbound: "Call carriers", quoting: "Watch the calls", quoted: "Review quotes" };

/** The board's progress steps. Accepted gets its own step so it never draws the same bar as booked. */
const STEPS = ["At sea", "Discharged", "Quoted", "Booked", "Accepted", "Picked up", "Delivered"] as const;
function stepIndex(status: string | null, eta: string | null): number {
  if (status === "accepted") return 4;
  if (status === "picked_up") return 5;
  if (status === "delivered") return 6;
  return stageIndex(status, eta); // at sea 0, discharged 1, quoted 2, booked 3
}

const GROUPS = [
  { key: "needs", label: "Needs a carrier" },
  { key: "moving", label: "Booked" },
  { key: "done", label: "Delivered" },
] as const;
type GroupKey = (typeof GROUPS)[number]["key"];

function groupOf(r: BoardRow): GroupKey {
  const s = r.container.status ?? "inbound";
  if (s === "delivered") return "done";
  if ((s === "inbound" || s === "quoting" || s === "quoted") && !r.booking) return "needs";
  return "moving";
}

/** End of the last free day at the port (EDT). */
function lfdEndsAt(lfd: string) {
  return new Date(`${lfd}T23:59:59-04:00`).getTime();
}

/** One shared clock for every row: relative times only need minute precision. */
function useNow() {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(Date.now()), 0);
    const id = setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  return now;
}

/** Calendar days in port time, so the words agree with the date printed above them. */
function arrivesIn(eta: string, now: number) {
  const days = daysBetween(portDate(new Date(now).toISOString()), portDate(eta));
  if (days > 1) return `in ${days} days`;
  if (days === 1) return "tomorrow";
  if (days === 0) return new Date(eta).getTime() <= now ? "arrived today" : "today";
  if (days === -1) return "arrived yesterday";
  return `arrived ${-days} days ago`;
}

function timeLeft(ms: number) {
  if (ms >= 2 * DAY) return `${Math.floor(ms / DAY)} days left`;
  if (ms >= DAY) return `1 day ${Math.floor((ms - DAY) / HOUR)} hrs left`;
  return `${Math.max(1, Math.floor(ms / HOUR))} hrs left`;
}

export function Board({
  initialRows,
  autoQuote,
  autoBookLimitCents,
  demurragePerDayCents,
}: {
  initialRows: BoardRow[];
  importerName: string;
  autoQuote: number | null;
  autoBookLimitCents: number | null;
  demurragePerDayCents: number;
}) {
  const [rows, setRows] = useState(initialRows);
  const now = useNow();

  // Status changes from calls, bookings, resets and the provider's phone land here live.
  useEffect(() => {
    const supabase = createClient();
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      await authorizeRealtime(supabase);
      if (cancelled) return;
      channel = supabase
        .channel("board")
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "containers" }, (p) => {
          const next = p.new as Container;
          // A box back to inbound (a reset) has no live booking.
          setRows((rs) =>
            rs.map((r) => (r.container.id === next.id ? { container: { ...r.container, ...next }, booking: next.status === "inbound" ? null : r.booking } : r)),
          );
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, (p) => {
          if (p.eventType === "DELETE") {
            const gone = (p.old as { id?: string }).id;
            setRows((rs) => rs.map((r) => (r.booking?.id === gone ? { ...r, booking: null } : r)));
            return;
          }
          const b = p.new as Booking;
          if (!b?.container_id) return;
          setRows((rs) =>
            rs.map((r) =>
              r.container.id === b.container_id
                ? { ...r, booking: { ...b, provider: r.booking?.id === b.id ? r.booking.provider : null } as BookingLite }
                : r,
            ),
          );
          // A new booking arrives without its carrier's name; fetch it once.
          if (b.provider_id) {
            supabase
              .from("providers")
              .select("name")
              .eq("id", b.provider_id)
              .single()
              .then(({ data }) => {
                if (!data) return;
                setRows((rs) => rs.map((r) => (r.booking?.id === b.id ? { ...r, booking: { ...r.booking, provider: { name: data.name } } } : r)));
              });
          }
        })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const byLfd = (a: BoardRow, b: BoardRow) => (a.container.last_free_day ?? "9999").localeCompare(b.container.last_free_day ?? "9999");
  const grouped = GROUPS.map((g) => ({ ...g, rows: rows.filter((r) => groupOf(r) === g.key).sort(byLfd) })).filter((g) => g.rows.length);
  const inMotion = rows.filter((r) => r.container.status !== "delivered").length;

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-8 pb-8">
        <div className="max-w-2xl">
          <h1 className="font-cond text-[64px] font-extrabold leading-[0.95] tracking-[-0.025em] text-fg sm:text-[76px]">Inbound</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-muted">
            Every container headed for your warehouses, when it lands, and how long until late fees start. Open one to put every carrier on
            the lane on the phone at once.
          </p>
        </div>
        <p className="max-w-sm text-[15px] leading-relaxed text-muted xl:text-right">
          <span className="font-semibold text-fg">{inMotion} containers in motion.</span> Auto-quote is{" "}
          {autoQuote == null ? "off" : `on, ${autoQuote} days before arrival`}.{" "}
          {autoBookLimitCents == null ? "Every booking waits for you." : `Agents can book up to ${formatUsd(autoBookLimitCents)} on their own.`}
        </p>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-rule bg-sheet shadow-[0_18px_50px_-36px_rgba(18,20,23,0.45)]">
        <div className={`hidden ${COLS} gap-x-5 border-b border-rule px-6 py-3 lg:grid`}>
          {["Container", "Arrives", "Free time left", "Status", "Deliver to"].map((h) => (
            <span key={h} className="tick-label">
              {h}
            </span>
          ))}
        </div>
        <LayoutGroup>
          <ol>
            {grouped.map((g) => (
              <motion.li key={g.key} layout="position">
                <div className="border-b border-rule bg-panel-2 px-6 py-2 text-[13px] font-semibold text-fg">
                  {g.label} <span className="ml-1 font-normal text-muted">{g.rows.length}</span>
                </div>
                <ol>
                  {g.rows.map((r) => (
                    <motion.li key={r.container.id} layout="position" transition={{ type: "spring", stiffness: 260, damping: 30 }}>
                      <Row row={r} now={now} demurragePerDayCents={demurragePerDayCents} />
                    </motion.li>
                  ))}
                </ol>
              </motion.li>
            ))}
          </ol>
        </LayoutGroup>
      </div>
    </div>
  );
}

const COLS = "lg:grid-cols-[minmax(220px,1.3fr)_minmax(120px,0.6fr)_minmax(150px,0.9fr)_minmax(190px,1.1fr)_minmax(130px,0.8fr)]";

function MobileLabel({ children }: { children: React.ReactNode }) {
  return <div className="mb-0.5 text-[12px] text-muted lg:hidden">{children}</div>;
}

function Row({ row, now, demurragePerDayCents }: { row: BoardRow; now: number | null; demurragePerDayCents: number }) {
  const c = row.container;
  const status = c.status ?? "inbound";
  const idx = stepIndex(c.status, c.eta);
  const city = cityFromAddress(c.destination_address);
  const state = stateFromAddress(c.destination_address);
  const payment = row.booking?.payment_status;
  const cta = !row.booking ? CTA[status] : undefined;
  return (
    <Link
      href={`/containers/${c.id}`}
      className={`group grid grid-cols-2 gap-x-5 gap-y-3 border-b border-rule px-6 py-5 transition-colors hover:bg-panel-2/60 lg:items-center ${COLS}`}
      data-container={c.container_number}
    >
      <div className="col-span-2 flex min-w-0 items-center gap-4 lg:col-span-1">
        <ContainerDoor number={c.container_number} size={c.size} compact />
        <div className="min-w-0">
          <div className="stencil text-[22px] leading-none text-fg">{formatContainerNumber(c.container_number)}</div>
          <div className="mt-1.5 truncate text-[13px] text-muted">
            {c.size} on {c.vessel}
          </div>
        </div>
      </div>

      <div>
        <MobileLabel>Arrives</MobileLabel>
        <div className="font-semibold text-fg">{c.eta ? shortDate(portDate(c.eta)) : "–"}</div>
        <div className="mt-0.5 min-h-[19px] text-[13px] text-muted">{c.eta && now != null ? arrivesIn(c.eta, now) : ""}</div>
      </div>

      <div>
        <MobileLabel>Free time left</MobileLabel>
        <FreeTime c={c} now={now} demurragePerDayCents={demurragePerDayCents} />
      </div>

      <div className="col-span-2 lg:col-span-1">
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <div className="min-w-0">
            <div className={`flex items-center gap-2 font-semibold ${status === "quoting" ? "text-crane" : "text-fg"}`}>
              {status === "quoting" && <span className="h-2 w-2 animate-pulse rounded-full bg-crane" />}
              {STATUS_COPY[status] ?? STEPS[idx]}
            </div>
            {row.booking && (
              <div className="mt-0.5 text-[13px] text-muted">
                {row.booking.provider?.name ? `${row.booking.provider.name}, ` : ""}
                {formatUsd(row.booking.amount_cents)}
                {payment === "captured" ? " paid" : payment === "authorized" ? " held on card" : ""}
              </div>
            )}
          </div>
          {cta && (
            <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${status === "inbound" ? "bg-fg text-white group-hover:bg-black" : "border border-rule text-fg group-hover:border-steel"}`}>
              {cta}
              <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
                <path d="M6 3.5 L10.5 8 L6 12.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </span>
          )}
        </div>
        <div className="mt-2.5 flex gap-1" title={`Step ${idx + 1} of ${STEPS.length}: ${STEPS[idx]}`} aria-hidden>
          {STEPS.map((s, i) => (
            <span
              key={s}
              className={`h-1.5 flex-1 rounded-full ${i <= idx ? "bg-fg/75" : status === "quoting" && i === idx + 1 ? "animate-pulse bg-crane" : "bg-rule"}`}
            />
          ))}
        </div>
      </div>

      <div className="col-span-2 lg:col-span-1">
        <MobileLabel>Deliver to</MobileLabel>
        <div className="font-semibold text-fg">
          {city}
          {state ? `, ${state}` : ""}
        </div>
        <div className="mt-0.5 text-[13px] text-muted">by {shortDate(c.deliver_by)}</div>
      </div>
    </Link>
  );
}

/** Plain words first ("6 days left"), the date second, then a bar that drains toward the last free day. */
function FreeTime({ c, now, demurragePerDayCents }: { c: Container; now: number | null; demurragePerDayCents: number }) {
  if (!c.eta || !c.last_free_day) return <div className="text-muted">No last free day</div>;
  const outOfTerminal = c.status === "picked_up" || c.status === "delivered";
  if (outOfTerminal) {
    return (
      <>
        <div className="flex items-center gap-1.5 font-semibold text-live">
          <svg viewBox="0 0 16 16" className="h-3.5 w-3.5" aria-hidden>
            <path d="M3 8.5 L6.5 12 L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Out of the terminal
        </div>
        <div className="mt-0.5 text-[13px] text-muted">No late fees</div>
      </>
    );
  }
  const start = new Date(c.eta).getTime();
  const end = lfdEndsAt(c.last_free_day);
  const left = now == null ? null : end - now;
  const overdue = left != null && left <= 0;
  // Days at sea are not free time: the clock starts when the box is discharged.
  const atSea = now != null && now < start;
  const fraction = now == null ? 0 : Math.min(1, Math.max(0, (now - start) / Math.max(DAY, end - start)));
  const tone = overdue || (left != null && left < DAY) ? "text-red" : left != null && left < 2 * DAY ? "text-crane" : "text-fg";
  const bar = overdue || fraction > 0.85 ? "bg-red" : fraction > 0.55 ? "bg-crane" : "bg-live";
  const accrued = overdue && now != null ? Math.ceil((now - end) / DAY) * demurragePerDayCents : 0;
  return (
    <>
      <div className={`min-h-[24px] font-semibold ${tone}`}>{left == null ? "" : overdue ? "Late fees started" : atSea ? `Clock starts ${shortDate(portDate(c.eta))}` : timeLeft(left)}</div>
      <div className="mt-0.5 text-[13px] text-muted">
        {overdue ? `About ${formatUsd(accrued)} so far (est.)` : `Last free day ${shortDate(c.last_free_day)}`}
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rule" aria-hidden>
        <div className={`h-full rounded-full transition-[width] duration-700 ${bar}`} style={{ width: `${Math.max((1 - fraction) * 100, 3)}%` }} />
      </div>
    </>
  );
}
