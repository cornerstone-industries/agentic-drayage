import type { Tables } from "@/lib/database.types";

export type Importer = Tables<"importers">;
export type Provider = Tables<"providers">;
export type Container = Tables<"containers">;
export type QuoteRequest = Tables<"quote_requests">;
export type Call = Tables<"calls">;
export type TranscriptLine = Tables<"transcript_lines">;
export type Quote = Tables<"quotes">;
export type Recommendation = Tables<"recommendations">;
export type Booking = Tables<"bookings">;
export type EventRow = Tables<"events">;

export type ContainerStatus = "inbound" | "quoting" | "quoted" | "booked" | "accepted" | "picked_up" | "delivered";
export type CallStatus = "queued" | "ringing" | "in_progress" | "ended" | "failed" | "no_answer";
export type TriggeredBy = "button" | "auto" | "agent";
export type BookedBy = "human" | "agent" | "auto";
