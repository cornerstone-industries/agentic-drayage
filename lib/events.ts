import type { Json } from "@/lib/database.types";
import type { AdminClient } from "@/lib/supabase/admin";

// Every step of a container's life lands here; the timeline, journey track and stamps stream from it.
// Freight mapping: tender_sent ~ EDI 204, accepted ~ 990, picked_up/delivered ~ 214, payment_captured ~ 210.
export type EventType =
  | "quote_requested"
  | "call_started"
  | "call_failed"
  | "field_heard"
  | "call_ended"
  | "recommended"
  | "quote_failed"
  | "auto_book_skipped"
  | "auto_book_failed"
  | "booked"
  | "payment_authorized"
  | "payment_failed"
  | "tender_sent"
  | "tender_email_failed"
  | "accepted"
  | "declined"
  | "picked_up"
  | "delivered"
  | "payment_captured"
  | "payment_canceled";

export async function logEvent(
  db: AdminClient,
  containerId: string,
  type: EventType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  const { error } = await db.from("events").insert({ container_id: containerId, type, payload: payload as Json });
  if (error) throw new Error(`events insert failed (${type}): ${error.message}`);
}
