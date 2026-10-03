"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { formatUsd } from "@/lib/money";
import { cityFromAddress, portDate, shortDate } from "@/lib/dates";
import { stateFromAddress } from "@/lib/money";
import { LfdMeter } from "@/components/freight/lfd-meter";
import { JourneyTrack } from "@/components/freight/journey-track";
import { ContainerDoor } from "@/components/freight/container-door";
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
  mode: "live" | "replay" | "web";
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

  // When a run starts (button, an agent over MCP, or the cron), bring the rail into view.
  const wallRef = useRef<HTMLElement>(null);
  const scrolledFor = useRef<string | null>(activeQr?.status === "calling" ? activeQr.id : null);
  useEffect(() => {
    if (!calling || !activeQr || scrolledFor.current === activeQr.id) return;
    scrolledFor.current = activeQr.id;
    wallRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [calling, activeQr]);

  // When the ranking lands, make sure the decision is on screen (it sits above the calls).
  const revealRef = useRef<HTMLElement>(null);
  const revealedFor = useRef<string | null>(recommendation?.id ?? null);
  useEffect(() => {
    if (!recommendation || revealedFor.current === recommendation.id) return;
    revealedFor.current = recommendation.id;
    const t = setTimeout(() => {
      const top = revealRef.current?.getBoundingClientRect().top;
      if (top != null && (top < 0 || top > window.innerHeight * 0.6)) revealRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
    return () => clearTimeout(t);
  }, [recommendation]);
  const canQuote = !CLOSED.has(c.status ?? "") && !calling;
  const city = cityFromAddress(c.destination_address);
  const state2 = stateFromAddress(c.destination_address);
  const autoNote = [...events].reverse().find((e) => e.type === "auto_book_failed" || e.type === "auto_book_skipped");
  const failNote = activeQr?.status === "failed" ? [...events].reverse().find((e) => e.type === "quote_failed") : undefined;

  const headline = calling
    ? "On the phone with your carriers"
    : recommendation
      ? "Quotes are in, ranked by real cost"
      : activeQr?.status === "failed"
        ? "That run did not finish"
        : "Three carriers, about two minutes";
  const subline = calling
    ? mode === "replay"
      ? "Replaying recorded dispatcher calls through the live pipeline. This is not a live call."
      : "Every number is pulled from the conversation the moment it is said."
    : recommendation
      ? `Ranked on all-in price plus estimated demurrage at ${formatUsd(demurragePerDayCents)}/day past the last free day.`
      : mode === "replay"
        ? "Replay mode: recorded dispatcher calls run through the real pipeline."
        : "PortCall phones your own carriers at the same time and writes down every quote as they talk.";

  return (
    <div className="min-w-0">
      <div>
        {/* The box: its door, its dates, its clock */}
        <section>
          <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px] text-muted">
            <Link href="/dashboard" className="font-semibold text-fg hover:underline">
              Inbound
            </Link>
            <span className="text-dim">/</span>
            <span>
              {c.size} on {c.vessel}
            </span>
            <span className={`ml-auto text-[13px] font-semibold ${connected ? "text-live" : "text-dim"}`} title="Supabase Realtime">
              {connected ? "Updating live" : "Connecting..."}
            </span>
          </div>
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
            <ContainerDoor number={c.container_number} size={c.size} />
            <LfdMeter eta={c.eta} lastFreeDay={c.last_free_day} status={c.status} demurragePerDayCents={demurragePerDayCents} />
          </div>
          <div className="mt-5 rounded-[16px] border border-rule bg-sheet px-6 pb-3 pt-4">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              {[
                ["Terminal", c.terminal?.replace(" Terminal", "")],
                ["Arrives", c.eta ? shortDate(portDate(c.eta)) : "–"],
                ["Deliver to", `${city ?? ""}${state2 ? `, ${state2}` : ""}`],
                ["Deliver by", shortDate(c.deliver_by)],
              ].map(([k, v]) => (
                <div key={k}>
                  <dt className="text-[12.5px] text-muted">{k}</dt>
                  <dd className="mt-0.5 font-cond text-[18px] font-bold text-fg">{v}</dd>
                </div>
              ))}
            </dl>
            <div className="mt-4 border-t border-rule pt-4">
              <JourneyTrack status={c.status} eta={c.eta} boxNumber={c.container_number} />
            </div>
          </div>
        </section>

        {/* Call Wall: one card per call */}
        <section ref={wallRef} className="scroll-mt-20 pt-12" data-testid="call-wall" data-realtime={connected ? "on" : "off"} aria-label="Call wall">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div className="max-w-xl">
              <h2 className="font-cond text-[40px] font-extrabold leading-[1] tracking-[-0.02em] text-fg">{headline}</h2>
              <p className="mt-3 text-[15.5px] leading-relaxed text-muted">{subline}</p>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              {state.quoteRequests.length > 0 && !calling && (
                <button type="button" className="btn-ghost" onClick={onReset} disabled={resetting} data-testid="reset-box">
                  {resetting ? "Resetting..." : armed ? "Click again to reset" : "Reset this box"}
                </button>
              )}
              {canQuote && (
                <button type="button" className="btn-primary" onClick={getQuotes} disabled={requesting} data-testid="get-quotes">
                  {requesting ? "Dialing..." : activeQr ? "Call carriers again" : "Call 3 carriers"}
                </button>
              )}
            </div>
          </div>
          {canQuote && !activeQr && <p className="mt-2 text-right text-[12.5px] text-muted">or let your agent call request_quotes over MCP</p>}
          {requestError && <p className="mt-4 rounded-[12px] border border-red/30 bg-red/5 px-4 py-2.5 text-[14px] text-red">{requestError}</p>}
          {failNote && (
            <p className="mt-4 rounded-[12px] border border-red/30 bg-red/5 px-4 py-2.5 text-[14px] text-red">
              {String((failNote.payload as { reason?: string })?.reason ?? "Quote run failed")}
            </p>
          )}

            {/* The decision first: Claude's call and the booking. The calls below are the evidence. */}
          <AnimatePresence>
            {recommendation && (
              <motion.section
                key={recommendation.id}
                initial={{ opacity: 0, y: 24 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ type: "spring", stiffness: 160, damping: 22 }}
                ref={revealRef}
                className="mt-8 grid scroll-mt-20 gap-6 lg:grid-cols-[minmax(0,1fr)_360px]"
                data-testid="ranking-reveal"
              >
                <div className="relative overflow-hidden rounded-[18px] border border-[#E8D98A] bg-[#FFF8CF] shadow-[0_18px_40px_-28px_rgba(120,90,0,0.6)]">
                  <div className="absolute inset-y-0 left-[54px] w-[1.5px] bg-red/50" aria-hidden />
                  <div className="absolute inset-y-0 left-[58px] w-[1.5px] bg-red/30" aria-hidden />
                  <div className="py-6 pl-[78px] pr-7">
                    <div className="flex flex-wrap items-center gap-3">
                      <h3 className="font-cond text-[15px] font-bold text-fg">{recEngine === "fixture" ? "Fixture ranking" : "Claude's call"}</h3>
                      {recEngine === "fixture" && <span className="rounded-full border border-red/40 px-2 text-[11.5px] font-semibold text-red">dev only, not Claude</span>}
                    </div>
                    <div className="mt-2 min-h-[224px] bg-[repeating-linear-gradient(180deg,transparent_0_31px,rgba(36,83,214,0.18)_31px_32px)]">
                      <Typewriter text={recommendation.reasoning ?? ""} />
                    </div>
                  </div>
                </div>

                <div className="panel relative overflow-hidden p-6">
                  {booking ? (
                    <BookingStatus booking={booking} providerName={providerMap.get(booking.provider_id ?? "")?.name ?? "Carrier"} containerStatus={c.status} />
                  ) : winnerQuote ? (
                    <>
                      <div className="text-[13px] text-muted">Recommended</div>
                      <div className="mt-1 font-cond text-[26px] font-bold leading-tight text-fg">{providerMap.get(winnerQuote.provider_id ?? "")?.name}</div>
                      <div className="mt-1 font-mono text-[30px] font-semibold text-fg">{formatUsd(winnerQuote.all_in_cents)}</div>
                      <button type="button" className="btn-primary mt-5 w-full" disabled={booking_} onClick={() => book(winnerQuote.id)} data-testid="book">
                        {booking_ ? "Authorizing card..." : `Book for ${formatUsd(winnerQuote.all_in_cents)}`}
                      </button>
                      <p className="mt-3 text-[13px] leading-relaxed text-muted">Holds your card now. The carrier gets paid through Stripe when they mark it delivered.</p>
                      {autoNote && (
                        <p className={`mt-3 text-[13px] ${autoNote.type === "auto_book_failed" ? "text-red" : "text-muted"}`}>
                          {autoNote.type === "auto_book_failed"
                            ? `Auto-book failed: ${(autoNote.payload as { error?: string }).error}`
                            : `Auto-book held: ${(autoNote.payload as { reason?: string }).reason}`}
                        </p>
                      )}
                      {!autoNote && autoBook.enabled && <p className="mt-3 text-[13px] text-muted">Auto-book is on under {formatUsd(autoBook.limitCents)}.</p>}
                      {bookError && <p className="mt-3 rounded-[12px] border border-red/30 bg-red/5 px-3 py-2 text-[13px] text-red">{bookError}</p>}
                    </>
                  ) : null}
                </div>
              </motion.section>
            )}
          </AnimatePresence>

          {!recommendation && booking && (
            <section className="panel relative mt-8 overflow-hidden p-6">
              <BookingStatus booking={booking} providerName={providerMap.get(booking.provider_id ?? "")?.name ?? "Carrier"} containerStatus={c.status} />
            </section>
          )}

          <div className="relative mt-8">
            <LayoutGroup>
              <div className="grid gap-5 md:grid-cols-3 xl:gap-6">
                {slots.map((s, i) => {
                  const q = s.call ? quoteByCall.get(s.call.id) : undefined;
                  const rank = recommendation && q ? (recommendation.ranked_quote_ids ?? []).indexOf(q.id) + 1 || undefined : undefined;
                  const isWinner = Boolean(recommendation && q && q.id === recommendation.winner_quote_id);
                  return (
                    <motion.div
                      key={s.key}
                      layout
                      transition={{ type: "spring", stiffness: 210, damping: 26 }}
                      initial={{ opacity: 0, y: -24 }}
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
          </div>

          {skipped.length > 0 && (
            <ul className="mt-6 flex flex-wrap gap-2">
              {skipped.map((s) => (
                <li key={s.providerId} className="rounded-full border border-dashed border-steel/40 px-3.5 py-1.5 text-[13px] text-muted">
                  <span className="font-semibold text-fg">{s.providerName}</span> {s.reason.replace(/^Not called: /, "not called, ")}
                </li>
              ))}
            </ul>
          )}
        </section>

        {aiEngine === "unconfigured" && <p className="mt-6 text-[13px] text-red">Claude is not configured: set AI_GATEWAY_API_KEY to extract quotes and rank them.</p>}
      </div>

      {/* The log: every step, as Realtime delivers it */}
      <section className="mt-12" aria-label="Log">
        <div className="overflow-hidden rounded-[16px] border border-rule bg-sheet">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-rule px-5 py-3">
            <h2 className="font-cond text-[17px] font-bold text-fg">Log</h2>
            <span className="text-[12.5px] text-muted">Every step, streamed from Supabase as it happens</span>
          </div>
          <div ref={timelineBox} className="max-h-[360px] overflow-y-auto px-5 py-2 [scrollbar-width:thin]">
            {events.length ? <Timeline events={events} providers={providerMap} /> : <p className="py-2 text-[13px] text-dim">Nothing yet. Call carriers to start the clock.</p>}
          </div>
        </div>
      </section>
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
      <div className="text-[13px] text-muted">
        {booking.booked_by === "agent" ? "Booked by your agent" : booking.booked_by === "auto" ? "Auto-booked under your limit" : "Booked by you"}
      </div>
      <div className="mt-1 font-cond text-[26px] font-bold leading-tight text-fg">{providerName}</div>
      <div className="mt-1 font-mono text-[30px] font-semibold text-fg">{formatUsd(booking.amount_cents)}</div>
      <div className="text-[12.5px] text-muted">includes {formatUsd(booking.platform_fee_cents)} platform fee</div>
      <div className="absolute right-5 top-[92px]">
        <PaymentStamp status={booking.payment_status} />
      </div>
      <ol className="mt-5 space-y-2.5">
        {STEPS.map((s) => {
          const on = reached(s.key);
          const declined = booking.tender_status === "declined" && s.key === "accepted";
          return (
            <li key={s.key} className="flex items-center gap-3">
              <span className={`grid h-5 w-5 place-items-center rounded-[6px] border-2 transition-colors ${on ? "border-live bg-live text-white" : declined ? "border-red text-red" : "border-rule"}`}>
                {on && (
                  <svg viewBox="0 0 16 16" className="h-3 w-3" aria-hidden>
                    <motion.path d="M3 8.5 L6.5 12 L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.35 }} />
                  </svg>
                )}
              </span>
              <span className={`text-[14.5px] ${on ? "font-semibold text-fg" : declined ? "text-red" : "text-muted"}`}>{declined ? "Declined" : s.label}</span>
            </li>
          );
        })}
      </ol>
      <div className="mt-5 flex items-center justify-between border-t border-rule pt-4 text-[13px] text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="rounded-[4px] bg-[#635BFF] px-1.5 py-px text-[11px] font-semibold text-white">stripe</span> test mode
        </span>
        {booking.tender_token && (
          <Link href={`/tender/${booking.tender_token}`} target="_blank" className="font-semibold text-stamp hover:underline">
            Open carrier view
          </Link>
        )}
      </div>
    </div>
  );
}
