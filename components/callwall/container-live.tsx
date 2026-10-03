"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { formatContainerNumber, formatUsd } from "@/lib/money";
import { cityFromAddress, portDate, shortDate } from "@/lib/dates";
import { stateFromAddress } from "@/lib/money";
import { LfdMeter } from "@/components/freight/lfd-meter";
import { JourneyTrack } from "@/components/freight/journey-track";
import { CallCard } from "./call-card";
import { Typewriter } from "./typewriter";
import { PaymentStamp } from "./payment-stamp";
import { Timeline } from "./timeline";
import { lossReasons } from "./fields";
import { useContainerLive } from "./use-container-live";
import { resetBox } from "@/app/containers/[id]/actions";
import type { LiveSnapshot } from "@/lib/live/snapshot";
import type { Provider, Quote } from "@/lib/types";

const CLOSED = new Set(["booked", "accepted", "picked_up", "delivered"]);

export function ContainerLive({
  initial,
  providers,
  eligibleIds,
  skipped,
  mode,
  aiEngine,
  demurragePerDayCents,
  autoBook,
}: {
  initial: LiveSnapshot;
  providers: Provider[];
  eligibleIds: string[];
  skipped: { providerId: string; providerName: string; reason: string }[];
  mode: "live" | "replay";
  aiEngine: "claude" | "fixture" | "unconfigured";
  demurragePerDayCents: number;
  autoBook: { enabled: boolean; limitCents: number };
}) {
  const { state, connected, refresh } = useContainerLive(initial);
  const { container: c, events } = state;
  const providerMap = useMemo(() => new Map(providers.map((p) => [p.id, p])), [providers]);
  const activeQr = state.quoteRequests[0] ?? null;
  const recommendation = activeQr ? state.recommendations.find((r) => r.quote_request_id === activeQr.id) ?? null : null;
  const quoteByCall = useMemo(() => {
    const m = new Map<string, Quote>();
    for (const q of state.quotes) if (q.call_id) m.set(q.call_id, q);
    return m;
  }, [state.quotes]);
  const booking = state.bookings.find((b) => b.payment_status !== "canceled") ?? state.bookings[0] ?? null;
  const winnerQuote = recommendation ? state.quotes.find((q) => q.id === recommendation.winner_quote_id) : undefined;
  const recEvent = [...events].reverse().find((e) => e.type === "recommended");
  const recEngine = ((recEvent?.payload ?? {}) as { engine?: string }).engine;

  // Channel order: provider order while calling, ranked order once Claude has spoken.
  const slots = useMemo(() => {
    const calls = state.calls;
    if (!activeQr || !calls.length) {
      return eligibleIds.map((pid, i) => ({ key: pid, channel: i + 1, provider: providerMap.get(pid)!, call: null }));
    }
    const order = eligibleIds.length ? eligibleIds : calls.map((x) => x.provider_id!);
    let list = calls
      .map((call) => ({ key: call.id, provider: providerMap.get(call.provider_id!)!, call }))
      .filter((s) => s.provider)
      .sort((a, b) => order.indexOf(a.provider.id) - order.indexOf(b.provider.id))
      .map((s, i) => ({ ...s, channel: i + 1 }));
    if (recommendation?.ranked_quote_ids?.length) {
      const rankOf = (callId: string) => {
        const q = quoteByCall.get(callId);
        const r = q ? recommendation.ranked_quote_ids!.indexOf(q.id) : -1;
        return r < 0 ? 99 : r;
      };
      list = [...list].sort((a, b) => rankOf(a.call!.id) - rankOf(b.call!.id));
    }
    return list;
  }, [state.calls, activeQr, eligibleIds, providerMap, recommendation, quoteByCall]);

  // The timeline reads like a log: keep the newest entry in view.
  const timelineBox = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = timelineBox.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [events.length]);

  const [requesting, setRequesting] = useState(false);
  const [requestError, setRequestError] = useState<string | null>(null);
  const [booking_, setBooking_] = useState(false);
  const [bookError, setBookError] = useState<string | null>(null);

  async function getQuotes() {
    setRequesting(true);
    setRequestError(null);
    try {
      const res = await fetch("/api/quotes/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ containerId: c.id }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setRequestError(body.error ?? `Request failed (${res.status})`);
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : "Network error");
    } finally {
      setRequesting(false);
    }
  }

  async function book(quoteId: string) {
    setBooking_(true);
    setBookError(null);
    try {
      const res = await fetch("/api/book", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quoteId }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) setBookError(body.error ?? `Booking failed (${res.status})`);
    } catch (err) {
      setBookError(err instanceof Error ? err.message : "Network error");
    } finally {
      setBooking_(false);
    }
  }

  // Two-step reset so a stray click never wipes a run.
  const [armed, setArmed] = useState(false);
  const [resetting, setResetting] = useState(false);
  useEffect(() => {
    if (!armed) return;
    const t = setTimeout(() => setArmed(false), 3500);
    return () => clearTimeout(t);
  }, [armed]);
  async function onReset() {
    if (!armed) return setArmed(true);
    setArmed(false);
    setResetting(true);
    const r = await resetBox(c.id);
    if (!r.ok) setRequestError(r.message);
    else {
      setRequestError(null);
      setBookError(null);
      await refresh();
    }
    setResetting(false);
  }

  const calling = activeQr?.status === "calling";
  const canQuote = !CLOSED.has(c.status ?? "") && !calling;
  const city = cityFromAddress(c.destination_address);
  const state2 = stateFromAddress(c.destination_address);
  const autoNote = [...events].reverse().find((e) => e.type === "auto_book_failed" || e.type === "auto_book_skipped");
  const failNote = activeQr?.status === "failed" ? [...events].reverse().find((e) => e.type === "quote_failed") : undefined;

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0">
        {/* Box header */}
        <section className="grid gap-6 border-b border-line pb-6 lg:grid-cols-[minmax(0,1fr)_minmax(300px,420px)] lg:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3 font-mono text-[11px] text-muted">
              <Link href="/dashboard" className="hover:text-fg">
                Board
              </Link>
              <span className="text-dim">/</span>
              <span>
                {c.size} on {c.vessel}
              </span>
              <span className={`ml-1 inline-flex items-center gap-1.5 ${connected ? "text-signal" : "text-dim"}`} title="Supabase Realtime connection">
                <span className={`h-1.5 w-1.5 rounded-full ${connected ? "bg-signal shadow-[0_0_6px_var(--signal)]" : "bg-dim"}`} />
                {connected ? "Realtime connected" : "Connecting"}
              </span>
            </div>
            <h1 className="stencil mt-3 whitespace-nowrap text-[clamp(28px,4.2vw,56px)] leading-none text-fg" data-container={c.container_number}>
              {formatContainerNumber(c.container_number)}
            </h1>
            <dl className="mt-4 grid grid-cols-2 gap-x-8 gap-y-2 font-mono text-xs sm:grid-cols-4">
              <div>
                <dt className="text-muted">Terminal</dt>
                <dd className="mt-0.5 text-fg">{c.terminal}</dd>
              </div>
              <div>
                <dt className="text-muted">ETA</dt>
                <dd className="mt-0.5 text-fg">{c.eta ? shortDate(portDate(c.eta)) : "--"}</dd>
              </div>
              <div>
                <dt className="text-muted">Deliver to</dt>
                <dd className="mt-0.5 text-fg">
                  {city}
                  {state2 ? `, ${state2}` : ""}
                </dd>
              </div>
              <div>
                <dt className="text-muted">Deliver by</dt>
                <dd className="mt-0.5 text-fg">{shortDate(c.deliver_by)}</dd>
              </div>
            </dl>
          </div>
          <div className="space-y-5">
            <LfdMeter eta={c.eta} lastFreeDay={c.last_free_day} status={c.status} demurragePerDayCents={demurragePerDayCents} />
          </div>
          <div className="lg:col-span-2">
            <JourneyTrack status={c.status} eta={c.eta} />
          </div>
        </section>

        {/* Call Wall */}
        <section className="pt-6" data-testid="call-wall" aria-label="Call wall">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-4">
            <div>
              <h2 className="font-display text-2xl font-black uppercase tracking-tight font-wide">Call wall</h2>
              <p className="mt-1 text-sm text-muted">
                {calling
                  ? mode === "replay"
                    ? "Replaying recorded dispatcher scripts through the live pipeline. Not a live call."
                    : "PortCall is on the phone with your carriers. Fields stamp in as they are said."
                  : recommendation
                    ? "Calls are done. Ranked on all-in cost plus estimated demurrage."
                    : `Three carriers on the line at once. ${mode === "replay" ? "Replay mode is on: recorded scripts, real pipeline." : "Live phone calls through Vapi."}`}
              </p>
            </div>
            <div className="flex flex-wrap items-start gap-3">
            {state.quoteRequests.length > 0 && !calling && (
              <button type="button" className="btn-ghost !py-3" onClick={onReset} disabled={resetting} data-testid="reset-box">
                {resetting ? "Resetting..." : armed ? "Click again to reset" : "Reset this box"}
              </button>
            )}
            {canQuote && (
              <div className="flex flex-col items-end gap-1.5">
                <button type="button" className="btn-sodium" onClick={getQuotes} disabled={requesting} data-testid="get-quotes">
                  {requesting ? "Dialing..." : activeQr ? "Call carriers again" : "Get quotes"}
                </button>
                <span className="font-mono text-[11px] text-muted">or let your agent call request_quotes over MCP</span>
              </div>
            )}
            </div>
          </div>
          {requestError && <p className="mb-4 rounded-[3px] border border-alarm/40 bg-alarm/10 px-3 py-2 font-mono text-xs text-alarm">{requestError}</p>}
          {failNote && (
            <p className="mb-4 rounded-[3px] border border-alarm/40 bg-alarm/10 px-3 py-2 font-mono text-xs text-alarm">
              {String((failNote.payload as { reason?: string })?.reason ?? "Quote run failed")}
            </p>
          )}

          <LayoutGroup>
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {slots.map((s, i) => {
                const q = s.call ? quoteByCall.get(s.call.id) : undefined;
                const rank = recommendation && q ? (recommendation.ranked_quote_ids ?? []).indexOf(q.id) + 1 || undefined : undefined;
                const isWinner = Boolean(recommendation && q && q.id === recommendation.winner_quote_id);
                return (
                  <motion.div
                    key={s.key}
                    layout
                    transition={{ type: "spring", stiffness: 240, damping: 28 }}
                    initial={{ opacity: 0, y: 14 }}
                    animate={{ opacity: 1, y: 0 }}
                    style={{ transitionDelay: `${i * 60}ms` }}
                  >
                    <CallCard
                      channel={s.channel}
                      provider={s.provider}
                      call={s.call}
                      lines={s.call ? state.lines.filter((l) => l.call_id === s.call!.id) : []}
                      quote={q}
                      lastFreeDay={c.last_free_day}
                      rank={rank}
                      isWinner={isWinner}
                      reasons={recommendation && q && !isWinner ? lossReasons(q, winnerQuote) : undefined}
                    />
                  </motion.div>
                );
              })}
            </div>
          </LayoutGroup>

          {skipped.length > 0 && (
            <ul className="mt-4 flex flex-wrap gap-2">
              {skipped.map((s) => (
                <li key={s.providerId} className="rounded-[3px] border border-dashed border-line px-3 py-2 font-mono text-[11px] text-dim">
                  <span className="text-muted">{s.providerName}</span> {s.reason.replace(/^Not called: /, "not called: ")}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* Ranking reveal + booking */}
        <AnimatePresence>
          {recommendation && (
            <motion.section
              key={recommendation.id}
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.45 }}
              className="panel relative mt-8 overflow-hidden rounded-[4px]"
              data-testid="ranking-reveal"
            >
              <div className="absolute inset-y-0 left-0 w-1 bg-sodium shadow-[0_0_18px_var(--sodium)]" />
              <div className="grid gap-8 p-6 pl-8 lg:grid-cols-[minmax(0,1fr)_320px]">
                <div>
                  <div className="flex items-center gap-3">
                    <h2 className="font-display text-lg font-extrabold font-semiwide">{recEngine === "fixture" ? "Fixture ranking" : "Claude's call"}</h2>
                    {recEngine === "fixture" && (
                      <span className="rounded-[3px] border border-alarm/40 px-2 py-0.5 font-mono text-[10.5px] text-alarm">dev only, not Claude</span>
                    )}
                  </div>
                  <div className="mt-3">
                    <Typewriter text={recommendation.reasoning ?? ""} />
                  </div>
                  <p className="mt-4 font-mono text-[11px] text-muted">
                    Risk-adjusted = all-in + estimated demurrage at {formatUsd(demurragePerDayCents)}/day past the last free day.
                  </p>
                </div>

                <div className="flex flex-col gap-4 border-t border-line pt-6 lg:border-l lg:border-t-0 lg:pl-8 lg:pt-0">
                  {booking ? (
                    <BookingStatus booking={booking} providerName={providerMap.get(booking.provider_id ?? "")?.name ?? "Carrier"} containerStatus={c.status} />
                  ) : winnerQuote ? (
                    <>
                      <div>
                        <div className="font-mono text-[11px] text-muted">Recommended</div>
                        <div className="mt-1 font-display text-xl font-extrabold">{providerMap.get(winnerQuote.provider_id ?? "")?.name}</div>
                        <div className="mt-1 font-mono text-2xl text-sodium">{formatUsd(winnerQuote.all_in_cents)}</div>
                      </div>
                      <button type="button" className="btn-sodium w-full" disabled={booking_} onClick={() => book(winnerQuote.id)} data-testid="book">
                        {booking_ ? "Authorizing card..." : `Book for ${formatUsd(winnerQuote.all_in_cents)}`}
                      </button>
                      <p className="font-mono text-[11px] text-muted">
                        Authorizes your saved card now. The carrier is paid through Stripe Connect when they mark it delivered.
                      </p>
                      {autoNote && (
                        <p className={`font-mono text-[11px] ${autoNote.type === "auto_book_failed" ? "text-alarm" : "text-muted"}`}>
                          {autoNote.type === "auto_book_failed"
                            ? `Auto-book failed: ${(autoNote.payload as { error?: string }).error}`
                            : `Auto-book held: ${(autoNote.payload as { reason?: string }).reason}`}
                        </p>
                      )}
                      {!autoNote && autoBook.enabled && (
                        <p className="font-mono text-[11px] text-muted">Auto-book is on under {formatUsd(autoBook.limitCents)}.</p>
                      )}
                      {bookError && <p className="rounded-[3px] border border-alarm/40 bg-alarm/10 px-3 py-2 font-mono text-xs text-alarm">{bookError}</p>}
                    </>
                  ) : null}
                </div>
              </div>
            </motion.section>
          )}
        </AnimatePresence>

        {!recommendation && booking && (
          <section className="panel mt-8 rounded-[4px] p-6">
            <BookingStatus booking={booking} providerName={providerMap.get(booking.provider_id ?? "")?.name ?? "Carrier"} containerStatus={c.status} />
          </section>
        )}

        {aiEngine === "unconfigured" && (
          <p className="mt-6 font-mono text-[11px] text-alarm">Claude is not configured: set AI_GATEWAY_API_KEY to extract quotes and rank them.</p>
        )}
      </div>

      {/* Timeline */}
      <aside className="xl:sticky xl:top-20 xl:h-[calc(100dvh-6rem)]">
        <div className="panel flex h-full max-h-[70vh] flex-col rounded-[4px] xl:max-h-none">
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <h2 className="font-display text-sm font-extrabold uppercase tracking-wide font-semiwide">Timeline</h2>
            <span className="font-mono text-[10.5px] text-dim">live from Supabase</span>
          </div>
          <div ref={timelineBox} className="flex-1 overflow-y-auto px-4 py-3 [scrollbar-width:thin]">
            {events.length ? <Timeline events={events} providers={providerMap} /> : <p className="font-mono text-xs text-dim">Nothing yet. Get quotes to start the clock.</p>}
          </div>
        </div>
      </aside>
    </div>
  );
}

const STEPS = [
  { key: "sent", label: "Tender sent" },
  { key: "accepted", label: "Accepted" },
  { key: "picked_up", label: "Picked up" },
  { key: "delivered", label: "Delivered" },
] as const;

function BookingStatus({
  booking,
  providerName,
  containerStatus,
}: {
  booking: { id: string; amount_cents: number; platform_fee_cents: number; payment_status: string | null; tender_status: string | null; tender_token: string | null; booked_by: string | null };
  providerName: string;
  containerStatus: string | null;
}) {
  const reached = (k: (typeof STEPS)[number]["key"]) => {
    if (k === "sent") return true;
    if (k === "accepted") return booking.tender_status === "accepted";
    if (k === "picked_up") return containerStatus === "picked_up" || containerStatus === "delivered";
    return containerStatus === "delivered";
  };
  return (
    <div data-testid="booking-status">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-mono text-[11px] text-muted">
            {booking.booked_by === "agent" ? "Booked by your agent" : booking.booked_by === "auto" ? "Auto-booked under your limit" : "Booked by you"}
          </div>
          <div className="mt-1 font-display text-xl font-extrabold">{providerName}</div>
          <div className="mt-1 font-mono text-2xl text-fg">{formatUsd(booking.amount_cents)}</div>
          <div className="mt-0.5 font-mono text-[11px] text-muted">incl. {formatUsd(booking.platform_fee_cents)} platform fee</div>
        </div>
        <PaymentStamp status={booking.payment_status} />
      </div>
      <ol className="mt-5 grid grid-cols-4 gap-1">
        {STEPS.map((s) => (
          <li key={s.key} className="flex flex-col gap-1.5">
            <span className={`h-1 rounded-full transition-colors duration-500 ${reached(s.key) ? "bg-signal shadow-[0_0_6px_var(--signal)]" : "bg-line"}`} />
            <span className={`font-mono text-[10.5px] ${reached(s.key) ? "text-fg" : "text-dim"}`}>{booking.tender_status === "declined" && s.key === "accepted" ? "Declined" : s.label}</span>
          </li>
        ))}
      </ol>
      <div className="mt-4 flex items-center justify-between font-mono text-[11px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-[2px] bg-[#635BFF] px-1.5 py-px text-[10px] font-semibold text-white">stripe</span> test mode
        </span>
        {booking.tender_token && (
          <Link href={`/tender/${booking.tender_token}`} target="_blank" className="text-sodium hover:underline">
            Open carrier view
          </Link>
        )}
      </div>
    </div>
  );
}
