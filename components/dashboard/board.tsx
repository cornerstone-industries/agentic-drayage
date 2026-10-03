"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { authorizeRealtime } from "@/lib/supabase/realtime";
import { formatContainerNumber, formatUsd } from "@/lib/money";
import { cityFromAddress, portDate, shortDate } from "@/lib/dates";
import { stateFromAddress } from "@/lib/money";
import { LfdMeter } from "@/components/freight/lfd-meter";
import { ContainerDoor } from "@/components/freight/container-door";
import { JourneyTrack, STATIONS, stageIndex } from "@/components/freight/journey-track";
import type { Booking, Container } from "@/lib/types";

type BookingLite = Pick<Booking, "id" | "payment_status" | "tender_status" | "amount_cents" | "created_at"> & {
  provider: { name: string } | null;
};
export type BoardRow = { container: Container; booking: BookingLite | null };

const STATUS_COPY: Record<string, string> = {
  inbound: "Inbound",
  quoting: "Calling carriers now",
  quoted: "Quotes ranked",
  booked: "Booked, waiting on carrier",
  accepted: "Carrier accepted",
  picked_up: "On the road",
  delivered: "Delivered",
};

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

  // Status changes from calls, bookings and the provider's phone land here live.
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
          setRows((rs) => rs.map((r) => (r.container.id === next.id ? { ...r, container: { ...r.container, ...next } } : r)));
        })
        .on("postgres_changes", { event: "*", schema: "public", table: "bookings" }, (p) => {
          const b = p.new as Booking;
          if (!b?.container_id) return;
          setRows((rs) =>
            rs.map((r) =>
              r.container.id === b.container_id
                ? { ...r, booking: { ...(r.booking ?? { provider: null }), ...b, provider: r.booking?.provider ?? null } as BookingLite }
                : r,
            ),
          );
        })
        .subscribe();
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, []);

  const active = rows.filter((r) => r.container.status !== "delivered");
  const done = rows.filter((r) => r.container.status === "delivered");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-8 pb-8">
        <div className="max-w-2xl">
          <h1 className="font-cond text-[64px] font-extrabold leading-[0.95] tracking-[-0.025em] text-fg sm:text-[76px]">Inbound</h1>
          <p className="mt-4 text-[17px] leading-relaxed text-muted">
            Every container headed for your warehouses, and how long until it starts costing you. Open one to put three carriers on the phone at once.
          </p>
        </div>
        <p className="max-w-sm text-[15px] leading-relaxed text-muted lg:text-right">
          <span className="font-semibold text-fg">{active.length} containers in motion.</span> Auto-quote is{" "}
          {autoQuote == null ? "off" : `on, ${autoQuote} days before arrival`}.{" "}
          {autoBookLimitCents == null ? "Every booking waits for you." : `Agents can book up to ${formatUsd(autoBookLimitCents)} on their own.`}
        </p>
      </div>

      <div className="overflow-hidden rounded-[20px] border border-rule bg-sheet shadow-[0_18px_50px_-36px_rgba(18,20,23,0.45)]">
        <div className="hidden grid-cols-[minmax(260px,1.25fr)_minmax(260px,1.5fr)_minmax(210px,1fr)_minmax(150px,0.7fr)] gap-6 border-b border-rule bg-panel-2 px-6 py-3 lg:grid">
          <span className="tick-label">Container</span>
          <span className="tick-label">Journey</span>
          <span className="tick-label">Free time</span>
          <span className="tick-label">Deliver to</span>
        </div>
        <ol>
          {[...active, ...done].map((r, i) => (
            <motion.li key={r.container.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05, duration: 0.3 }}>
              <Row row={r} demurragePerDayCents={demurragePerDayCents} />
            </motion.li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function Row({ row, demurragePerDayCents }: { row: BoardRow; demurragePerDayCents: number }) {
  const c = row.container;
  const idx = stageIndex(c.status, c.eta);
  const city = cityFromAddress(c.destination_address);
  const state = stateFromAddress(c.destination_address);
  const payment = row.booking?.payment_status;
  return (
    <Link
      href={`/containers/${c.id}`}
      className="group grid gap-x-6 gap-y-4 border-b border-rule px-6 py-5 transition-colors last:border-0 hover:bg-panel-2 lg:grid-cols-[minmax(260px,1.25fr)_minmax(260px,1.5fr)_minmax(210px,1fr)_minmax(150px,0.7fr)] lg:items-center"
      data-container={c.container_number}
    >
      <div className="flex min-w-0 items-center gap-4">
        <ContainerDoor number={c.container_number} size={c.size} compact />
        <div className="min-w-0">
          <div className="stencil text-[22px] leading-none text-fg">{formatContainerNumber(c.container_number)}</div>
          <div className="mt-1.5 truncate text-[13px] text-muted">
            {c.size} on {c.vessel}, arrives {c.eta ? shortDate(portDate(c.eta)) : "–"}
          </div>
        </div>
      </div>
      <div>
        <JourneyTrack status={c.status} eta={c.eta} compact boxNumber={c.container_number} />
        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 text-[13px]">
          <span className={`font-semibold ${c.status === "quoting" ? "text-crane" : "text-fg"}`}>{STATUS_COPY[c.status ?? "inbound"] ?? STATIONS[idx]}</span>
          {row.booking && (
            <span className="text-muted">
              {row.booking.provider?.name ? `${row.booking.provider.name}, ` : ""}
              {formatUsd(row.booking.amount_cents)}
              {payment === "captured" ? " paid" : payment === "authorized" ? " held" : ""}
            </span>
          )}
        </div>
      </div>
      <LfdMeter eta={c.eta} lastFreeDay={c.last_free_day} status={c.status} demurragePerDayCents={demurragePerDayCents} compact />
      <div>
        <div className="font-semibold text-fg">
          {city}
          {state ? `, ${state}` : ""}
        </div>
        <div className="mt-0.5 text-[13px] text-muted">by {shortDate(c.deliver_by)}</div>
      </div>
    </Link>
  );
}
