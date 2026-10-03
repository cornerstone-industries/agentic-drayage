"use client";

import { useEffect, useReducer, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadSnapshot, type LiveSnapshot } from "@/lib/live/snapshot";
import { authorizeRealtime } from "@/lib/supabase/realtime";
import type { Booking, Call, Container, EventRow, Quote, QuoteRequest, Recommendation, TranscriptLine } from "@/lib/types";

type Action =
  | { t: "snapshot"; s: LiveSnapshot; replace?: boolean }
  | { t: "container"; row: Container }
  | { t: "quote_request"; row: QuoteRequest }
  | { t: "call"; row: Call }
  | { t: "line"; row: TranscriptLine }
  | { t: "quote"; row: Quote }
  | { t: "recommendation"; row: Recommendation }
  | { t: "booking"; row: Booking }
  | { t: "event"; row: EventRow };

function upsert<T extends { id: string | number }>(list: T[], row: T, newestFirst = false): T[] {
  const i = list.findIndex((x) => x.id === row.id);
  if (i >= 0) {
    const next = list.slice();
    next[i] = { ...next[i], ...row };
    return next;
  }
  return newestFirst ? [row, ...list] : [...list, row];
}

const CALL_RANK: Record<string, number> = { queued: 0, ringing: 1, in_progress: 2, ended: 3, failed: 3, no_answer: 3 };
const PAY_RANK: Record<string, number> = { authorized: 1, captured: 2, canceled: 2, failed: 2 };
const byNewest = (a: { created_at: string | null }, b: { created_at: string | null }) => (b.created_at ?? "").localeCompare(a.created_at ?? "");

/** Union by id; when both sides have a row, `pick` decides which one is further along. */
function mergeRows<T extends { id: string | number }>(snap: T[], live: T[], pick: (a: T, b: T) => T = (a) => a): T[] {
  const out = new Map<string | number, T>();
  for (const r of snap) out.set(r.id, r);
  for (const r of live) {
    const have = out.get(r.id);
    out.set(r.id, have ? pick(have, r) : r);
  }
  return [...out.values()];
}

/**
 * The catch-up snapshot is fetched while live events may already be arriving, so it can be older than
 * what Realtime delivered. Merge instead of replace: never lose a newer quote run or a further-along row.
 */
function mergeSnapshot(s: LiveSnapshot, snap: LiveSnapshot): LiveSnapshot {
  const quoteRequests = mergeRows(snap.quoteRequests, s.quoteRequests, (a, b) => (a.status !== "calling" ? a : b)).sort(byNewest);
  const latest = quoteRequests[0]?.id;
  const calls = mergeRows(snap.calls, s.calls, (a, b) => ((CALL_RANK[b.status ?? ""] ?? 0) > (CALL_RANK[a.status ?? ""] ?? 0) ? b : a)).filter(
    (c) => c.quote_request_id === latest,
  );
  const callIds = new Set(calls.map((c) => c.id));
  return {
    container: snap.container,
    quoteRequests,
    calls,
    lines: mergeRows(snap.lines, s.lines).filter((l) => callIds.has(l.call_id ?? "")).sort((x, y) => x.id - y.id),
    quotes: mergeRows(snap.quotes, s.quotes, (a, b) => ((b.updated_at ?? "") > (a.updated_at ?? "") ? b : a)),
    recommendations: mergeRows(snap.recommendations, s.recommendations).sort(byNewest),
    bookings: mergeRows(snap.bookings, s.bookings, (a, b) =>
      (PAY_RANK[b.payment_status ?? ""] ?? 0) > (PAY_RANK[a.payment_status ?? ""] ?? 0) || (b.tender_status !== "sent" && a.tender_status === "sent") ? b : a,
    ).sort(byNewest),
    events: mergeRows(snap.events, s.events).sort((x, y) => x.id - y.id),
  };
}

function reducer(s: LiveSnapshot, a: Action): LiveSnapshot {
  switch (a.t) {
    case "snapshot":
      return a.replace ? a.s : mergeSnapshot(s, a.s);
    case "container":
      return a.row.id === s.container.id ? { ...s, container: { ...s.container, ...a.row } } : s;
    case "quote_request": {
      const isNew = !s.quoteRequests.some((q) => q.id === a.row.id);
      // A fresh run replaces the wall's calls and transcript.
      return isNew
        ? { ...s, quoteRequests: [a.row, ...s.quoteRequests], calls: [], lines: [] }
        : { ...s, quoteRequests: upsert(s.quoteRequests, a.row) };
    }
    case "call":
      return s.quoteRequests[0]?.id === a.row.quote_request_id ? { ...s, calls: upsert(s.calls, a.row) } : s;
    case "line":
      return s.calls.some((c) => c.id === a.row.call_id) && !s.lines.some((l) => l.id === a.row.id)
        ? { ...s, lines: [...s.lines, a.row].sort((x, y) => x.id - y.id) }
        : s;
    case "quote":
      return { ...s, quotes: upsert(s.quotes, a.row) };
    case "recommendation":
      return { ...s, recommendations: upsert(s.recommendations, a.row, true) };
    case "booking":
      return { ...s, bookings: upsert(s.bookings, a.row, true) };
    case "event":
      return s.events.some((e) => e.id === a.row.id) ? s : { ...s, events: [...s.events, a.row] };
  }
}

/** Initial server snapshot, then every change streams in over Supabase Realtime (RLS-scoped). */
export function useContainerLive(initial: LiveSnapshot) {
  const [state, dispatch] = useReducer(reducer, initial);
  const [connected, setConnected] = useState(false);
  const id = initial.container.id;

  useEffect(() => {
    const supabase = createClient();
    const f = `container_id=eq.${id}`;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let cancelled = false;
    (async () => {
      await authorizeRealtime(supabase);
      if (cancelled) return;
      channel = supabase
        .channel(`container:${id}`)
        .on("postgres_changes", { event: "UPDATE", schema: "public", table: "containers", filter: `id=eq.${id}` }, (p) => dispatch({ t: "container", row: p.new as Container }))
        .on("postgres_changes", { event: "*", schema: "public", table: "quote_requests", filter: f }, (p) => dispatch({ t: "quote_request", row: p.new as QuoteRequest }))
        .on("postgres_changes", { event: "*", schema: "public", table: "calls" }, (p) => dispatch({ t: "call", row: p.new as Call }))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "transcript_lines" }, (p) => dispatch({ t: "line", row: p.new as TranscriptLine }))
        .on("postgres_changes", { event: "*", schema: "public", table: "quotes", filter: f }, (p) => dispatch({ t: "quote", row: p.new as Quote }))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "recommendations", filter: f }, (p) => dispatch({ t: "recommendation", row: p.new as Recommendation }))
        .on("postgres_changes", { event: "*", schema: "public", table: "bookings", filter: f }, (p) => dispatch({ t: "booking", row: p.new as Booking }))
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "events", filter: f }, (p) => dispatch({ t: "event", row: p.new as EventRow }))
        .subscribe(async (status) => {
          setConnected(status === "SUBSCRIBED");
          if (status === "SUBSCRIBED") {
            // Catch anything that changed between the server render and the subscription.
            const s = await loadSnapshot(supabase, id);
            if (s) dispatch({ t: "snapshot", s });
          }
        });
    })();
    return () => {
      cancelled = true;
      if (channel) supabase.removeChannel(channel);
    };
  }, [id]);

  return {
    state,
    connected,
    /** Full reload that replaces local state (after a reset, where rows were deleted). */
    refresh: async () => {
      const s = await loadSnapshot(createClient(), id);
      if (s) dispatch({ t: "snapshot", s, replace: true });
    },
  };
}
