"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { motion } from "motion/react";
import { formatContainerNumber, formatUsd } from "@/lib/money";
import { cityFromAddress, portDate, shortDate } from "@/lib/dates";
import { stateFromAddress } from "@/lib/money";
import { PaymentStamp } from "@/components/callwall/payment-stamp";
import { Wordmark } from "@/components/console/wordmark";

export type TenderData = {
  token: string;
  amountCents: number;
  paymentStatus: string | null;
  tenderStatus: string | null;
  containerStatus: string | null;
  providerName: string;
  contactName: string | null;
  importerName: string;
  container: {
    number: string;
    size: string | null;
    terminal: string | null;
    vessel: string | null;
    eta: string | null;
    lastFreeDay: string | null;
    deliverBy: string | null;
    destinationName: string | null;
    destinationAddress: string | null;
  };
  quote: {
    linehaul: number | null;
    fuel: number | null;
    chassisPerDay: number | null;
    chassisDays: number | null;
    accessorials: { name: string; cents: number }[];
    earliestPickup: string | null;
  } | null;
};

type Action = "accept" | "decline" | "picked_up" | "delivered";

export function TenderView({ data }: { data: TenderData }) {
  const router = useRouter();
  const [pending, setPending] = useState<Action | null>(null);
  const [error, setError] = useState<string | null>(null);
  const c = data.container;
  const city = cityFromAddress(c.destinationAddress);
  const state = stateFromAddress(c.destinationAddress);

  async function act(action: Action) {
    setPending(action);
    setError(null);
    try {
      const res = await fetch(`/api/tender/${data.token}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setError(body.error ?? `That didn't go through (${res.status})`);
      else router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Network error");
    } finally {
      setPending(null);
    }
  }

  const accepted = data.tenderStatus === "accepted";
  const declined = data.tenderStatus === "declined";
  const pickedUp = data.containerStatus === "picked_up" || data.containerStatus === "delivered";
  const delivered = data.containerStatus === "delivered";
  const q = data.quote;
  const chassisTotal = (q?.chassisPerDay ?? 0) * (q?.chassisDays ?? 0);

  return (
    <main className="mx-auto min-h-dvh max-w-[440px] px-4 pb-10 pt-5" data-testid="tender-page">
      <div className="flex items-center justify-between">
        <Wordmark href="/" />
        <span className="font-mono text-[10.5px] text-muted">Load tender</span>
      </div>

      <section className="mt-6">
        <p className="font-mono text-[11px] text-muted">
          For {data.providerName}
          {data.contactName ? `, attn ${data.contactName}` : ""}
        </p>
        <h1 className="stencil mt-2 text-[34px] leading-none text-fg">{formatContainerNumber(c.number)}</h1>
        <p className="mt-3 text-[15px] text-fg">
          {c.size} at {c.terminal}
          <span className="text-muted"> to </span>
          {city}
          {state ? `, ${state}` : ""}
        </p>
      </section>

      <section className="panel relative mt-5 overflow-hidden rounded-[6px] p-4">
        <div className="flex items-start justify-between">
          <div>
            <div className="font-mono text-[11px] text-muted">Agreed rate, all-in</div>
            <div className="mt-1 font-mono text-[34px] font-semibold leading-none text-sodium">{formatUsd(data.amountCents)}</div>
          </div>
          <div className="pt-1">
            <PaymentStamp status={data.paymentStatus === "captured" ? "captured" : declined ? "canceled" : null} />
          </div>
        </div>
        {q && (
          <dl className="mt-4 space-y-1.5 border-t border-line pt-3 font-mono text-[12.5px]">
            <Row k="Linehaul" v={formatUsd(q.linehaul)} />
            <Row k="Fuel" v={q.fuel ? formatUsd(q.fuel) : "Included"} />
            <Row k="Chassis" v={chassisTotal ? `${formatUsd(q.chassisPerDay)}/day x ${q.chassisDays}` : "Included"} />
            {q.accessorials.map((a) => (
              <Row key={a.name} k={a.name} v={formatUsd(a.cents)} />
            ))}
          </dl>
        )}
      </section>

      <section className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[6px] border border-line bg-line font-mono text-[12px]">
        <Cell k="Available" v={c.eta ? shortDate(portDate(c.eta)) : "--"} />
        <Cell k="Last free day" v={shortDate(c.lastFreeDay)} tone="text-alarm" />
        <Cell k="Your pickup" v={shortDate(q?.earliestPickup)} />
        <Cell k="Deliver by" v={shortDate(c.deliverBy)} />
        <div className="col-span-2 bg-panel p-3">
          <div className="text-muted">Deliver to</div>
          <div className="mt-1 text-fg">{c.destinationName}</div>
          <div className="text-muted">{c.destinationAddress}</div>
        </div>
      </section>

      <section className="mt-6">
        {declined ? (
          <p className="rounded-[4px] border border-alarm/40 bg-alarm/10 p-4 text-sm text-alarm">You declined this load. The card hold was released.</p>
        ) : !accepted ? (
          <div className="grid gap-3">
            <button type="button" className="btn-sodium w-full !py-4 !text-base" onClick={() => act("accept")} disabled={!!pending} data-testid="tender-accept">
              {pending === "accept" ? "Accepting..." : `Accept load for ${formatUsd(data.amountCents)}`}
            </button>
            <button type="button" className="btn-ghost w-full" onClick={() => act("decline")} disabled={!!pending}>
              {pending === "decline" ? "Declining..." : "Decline"}
            </button>
          </div>
        ) : (
          <div>
            <ol className="grid grid-cols-3 gap-2">
              {[
                ["Accepted", true],
                ["Picked up", pickedUp],
                ["Delivered", delivered],
              ].map(([label, on]) => (
                <li key={label as string} className="flex flex-col gap-1.5">
                  <motion.span
                    className="h-1.5 rounded-full"
                    initial={false}
                    animate={{ backgroundColor: on ? "var(--signal)" : "var(--line)" }}
                    style={{ boxShadow: on ? "0 0 8px var(--signal)" : undefined }}
                  />
                  <span className={`font-mono text-[11px] ${on ? "text-fg" : "text-dim"}`}>{label as string}</span>
                </li>
              ))}
            </ol>
            <div className="mt-5">
              {!pickedUp ? (
                <button type="button" className="btn-sodium w-full !py-4 !text-base" onClick={() => act("picked_up")} disabled={!!pending} data-testid="tender-picked-up">
                  {pending === "picked_up" ? "Updating..." : "Mark picked up"}
                </button>
              ) : !delivered ? (
                <button type="button" className="btn-sodium w-full !py-4 !text-base" onClick={() => act("delivered")} disabled={!!pending} data-testid="tender-delivered">
                  {pending === "delivered" ? "Capturing payment..." : "Mark delivered"}
                </button>
              ) : (
                <p className="rounded-[4px] border border-signal/40 bg-signal/10 p-4 text-sm text-signal">
                  Delivered. {formatUsd(data.amountCents)} is captured and on its way to your Stripe account.
                </p>
              )}
            </div>
          </div>
        )}
        {error && <p className="mt-3 rounded-[4px] border border-alarm/40 bg-alarm/10 p-3 font-mono text-xs text-alarm">{error}</p>}
      </section>

      <p className="mt-8 font-mono text-[10.5px] leading-5 text-dim">
        Tendered by PortCall for {data.importerName}. Accept works as an EDI 990, the status buttons as 214s. Payment is authorized now and
        captured on delivery through Stripe Connect (test mode).
      </p>
    </main>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted">{k}</dt>
      <dd className="text-fg">{v}</dd>
    </div>
  );
}

function Cell({ k, v, tone = "text-fg" }: { k: string; v: string; tone?: string }) {
  return (
    <div className="bg-panel p-3">
      <div className="text-muted">{k}</div>
      <div className={`mt-1 ${tone}`}>{v}</div>
    </div>
  );
}
