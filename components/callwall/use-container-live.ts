"use client";

import { useEffect, useReducer, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { loadSnapshot, type LiveSnapshot } from "@/lib/live/snapshot";
import type { Booking, Call, Container, EventRow, Quote, QuoteRequest, Recommendation, TranscriptLine } from "@/lib/types";

type Action =
  | { t: "snapshot"; s: LiveSnapshot }
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

function reducer(s: LiveSnapshot, a: Action): LiveSnapshot {
  switch (a.t) {
    case "snapshot":
      return a.s;
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
    const channel = supabase
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
    return () => {
      supabase.removeChannel(channel);
    };
  }, [id]);

  return { state, connected, refresh: async () => {
    const s = await loadSnapshot(createClient(), id);
    if (s) dispatch({ t: "snapshot", s });
  } };
}
