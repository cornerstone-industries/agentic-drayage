"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { motion } from "motion/react";
import { createClient } from "@/lib/supabase/client";
import { formatContainerNumber, formatUsd } from "@/lib/money";
import { cityFromAddress, portDate, shortDate } from "@/lib/dates";
import { stateFromAddress } from "@/lib/money";
import { LfdMeter } from "@/components/freight/lfd-meter";
import { JourneyTrack, STATIONS, stageIndex } from "@/components/freight/journey-track";
import type { Booking, Container } from "@/lib/types";

type BookingLite = Pick<Booking, "id" | "payment_status" | "tender_status" | "amount_cents" | "created_at"> & {
  provider: { name: string } | null;
};
export type BoardRow = { container: Container; booking: BookingLite | null };

const STATUS_COPY: Record<string, string> = {
  inbound: "Inbound",
  quoting: "Calling carriers",
  quoted: "Quotes ranked",
  booked: "Booked, tender out",
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
    const channel = supabase
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
    return () => {
      supabase.removeChannel(channel);
    };
  }, []);

  const active = rows.filter((r) => r.container.status !== "delivered");
  const done = rows.filter((r) => r.container.status === "delivered");

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-line pb-6">
        <div>
          <h1 className="font-display text-4xl font-black uppercase leading-none tracking-tight font-wide sm:text-5xl">Inbound board</h1>
          <p className="mt-3 max-w-xl text-muted">
            Every box headed for your DCs, with the clock on its last free day. Open one to put three carriers on the phone at once.
          </p>
        </div>
        <dl className="grid grid-cols-3 gap-6 font-mono text-xs">
          <div>
            <dt className="text-muted">In motion</dt>
            <dd className="mt-1 text-2xl text-fg">{active.length}</dd>
          </div>
          <div>
            <dt className="text-muted">Auto-quote</dt>
            <dd className="mt-1 text-sm text-fg">{autoQuote == null ? "Off" : `${autoQuote} days out`}</dd>
          </div>
          <div>
            <dt className="text-muted">Auto-book under</dt>
            <dd className="mt-1 text-sm text-fg">{autoBookLimitCents == null ? "Off" : formatUsd(autoBookLimitCents)}</dd>
          </div>
        </dl>
      </div>

      <div className="hidden grid-cols-[minmax(220px,1.2fr)_minmax(260px,1.6fr)_minmax(200px,1fr)_minmax(170px,0.9fr)] gap-6 border-b border-line py-2.5 lg:grid">
        <span className="tick-label">Box</span>
        <span className="tick-label">Journey</span>
        <span className="tick-label">Free time</span>
        <span className="tick-label">Deliver to</span>
      </div>

      <ol>
        {[...active, ...done].map((r, i) => (
          <motion.li
            key={r.container.id}
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05, duration: 0.3 }}
          >
            <Row row={r} demurragePerDayCents={demurragePerDayCents} />
          </motion.li>
        ))}
      </ol>
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
      className="group grid gap-x-6 gap-y-4 border-b border-line py-5 transition-colors hover:bg-panel/60 lg:grid-cols-[minmax(220px,1.2fr)_minmax(260px,1.6fr)_minmax(200px,1fr)_minmax(170px,0.9fr)] lg:items-center"
      data-container={c.container_number}
    >
      <div className="min-w-0">
        <div className="stencil text-lg text-fg transition-colors group-hover:text-sodium">{formatContainerNumber(c.container_number)}</div>
        <div className="mt-1 truncate font-mono text-[11px] text-muted">
          {c.size} on {c.vessel} at {c.terminal?.replace(" Terminal", "")}
        </div>
        <div className="mt-0.5 font-mono text-[11px] text-muted">ETA {c.eta ? shortDate(portDate(c.eta)) : "--"}</div>
      </div>
      <div>
        <JourneyTrack status={c.status} eta={c.eta} compact />
        <div className="mt-1 flex items-center gap-2 font-mono text-[11px]">
          <span className={c.status === "quoting" ? "text-sodium" : "text-fg"}>{STATUS_COPY[c.status ?? "inbound"] ?? STATIONS[idx]}</span>
          {row.booking && (
            <span className="text-muted">
              {row.booking.provider?.name ? `${row.booking.provider.name}, ` : ""}
              {formatUsd(row.booking.amount_cents)}
              {payment === "captured" ? " paid" : payment === "authorized" ? " authorized" : ""}
            </span>
          )}
        </div>
      </div>
      <LfdMeter eta={c.eta} lastFreeDay={c.last_free_day} status={c.status} demurragePerDayCents={demurragePerDayCents} compact />
      <div className="font-mono text-xs">
        <div className="text-fg">
          {city}
          {state ? `, ${state}` : ""}
        </div>
        <div className="mt-0.5 text-muted">by {shortDate(c.deliver_by)}</div>
      </div>
    </Link>
  );
}
