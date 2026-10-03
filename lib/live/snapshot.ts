// One container's live state, loaded with the caller's own RLS-scoped client (server or browser).
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import type { Booking, Call, Container, EventRow, Quote, QuoteRequest, Recommendation, TranscriptLine } from "@/lib/types";

export type LiveSnapshot = {
  container: Container;
  quoteRequests: QuoteRequest[]; // newest first
  calls: Call[];
  lines: TranscriptLine[];
  quotes: Quote[];
  recommendations: Recommendation[]; // newest first
  bookings: Booking[]; // newest first
  events: EventRow[]; // oldest first
};

export async function loadSnapshot(supabase: SupabaseClient<Database>, containerId: string): Promise<LiveSnapshot | null> {
  const [c, qrs, quotes, recs, bookings, events] = await Promise.all([
    supabase.from("containers").select("*").eq("id", containerId).maybeSingle(),
    supabase.from("quote_requests").select("*").eq("container_id", containerId).order("created_at", { ascending: false }).limit(10),
    supabase.from("quotes").select("*").eq("container_id", containerId),
    supabase.from("recommendations").select("*").eq("container_id", containerId).order("created_at", { ascending: false }).limit(10),
    supabase.from("bookings").select("*").eq("container_id", containerId).order("created_at", { ascending: false }),
    supabase.from("events").select("*").eq("container_id", containerId).order("id", { ascending: true }).limit(1000),
  ]);
  if (!c.data) return null;
  const latest = qrs.data?.[0];
  let calls: Call[] = [];
  let lines: TranscriptLine[] = [];
  if (latest) {
    const { data } = await supabase.from("calls").select("*").eq("quote_request_id", latest.id);
    calls = data ?? [];
    if (calls.length) {
      const { data: l } = await supabase
        .from("transcript_lines")
        .select("*")
        .in("call_id", calls.map((x) => x.id))
        .order("id", { ascending: true });
      lines = l ?? [];
    }
  }
  return {
    container: c.data,
    quoteRequests: qrs.data ?? [],
    calls,
    lines,
    quotes: quotes.data ?? [],
    recommendations: recs.data ?? [],
    bookings: bookings.data ?? [],
    events: events.data ?? [],
  };
}
