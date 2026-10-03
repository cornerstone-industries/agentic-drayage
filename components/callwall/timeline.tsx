"use client";

import { AnimatePresence, motion } from "motion/react";
import { formatUsd } from "@/lib/money";
import { fieldLabel } from "./fields";
import { shortDate } from "@/lib/dates";
import type { EventRow, Provider } from "@/lib/types";

type P = Record<string, unknown>;

const TRIGGER: Record<string, string> = { agent: "by an agent over MCP", button: "from the board", auto: "automatically before arrival" };

function describe(e: EventRow, providers: Map<string, Provider>): { text: string; tone: string; code?: string } {
  const p = (e.payload ?? {}) as P;
  const prov = (p.provider_name as string) ?? providers.get(p.provider_id as string)?.name ?? "Carrier";
  const usd = (k: string) => formatUsd(p[k] as number);
  switch (e.type) {
    case "quote_requested": {
      const n = (p.providers as string[] | undefined)?.length ?? 0;
      const skipped = (p.skipped as unknown[] | undefined)?.length ?? 0;
      return { text: `Quotes requested ${TRIGGER[p.triggered_by as string] ?? ""}. Dialing ${n}${skipped ? `, ${skipped} skipped (lane not served)` : ""}${p.mode === "replay" ? " [replay]" : ""}`, tone: "text-fg font-semibold" };
    }
    case "call_started":
      return { text: `${prov} picked up`, tone: "text-live" };
    case "field_heard": {
      const v = p.value;
      const field = String(p.field);
      let val: string;
      if (field === "earliest_pickup") val = shortDate(String(v));
      else if (field === "est_chassis_days") val = `${v} day${v === 1 ? "" : "s"}`;
      else if (typeof v === "number") val = v === 0 && field !== "linehaul_cents" ? "included" : formatUsd(v);
      else if (typeof v === "boolean") val = v ? "yes" : "no";
      else if (Array.isArray(v)) val = v.length ? v.map((a: { name: string; cents: number }) => `${formatUsd(a.cents)} ${a.name.toLowerCase()}`).join(", ") : "none";
      else val = String(v);
      return { text: `${prov}: ${fieldLabel(field).toLowerCase()} ${val}`, tone: "text-muted" };
    }
    case "call_ended":
      return { text: `${prov} ${p.status === "no_answer" ? "did not answer" : p.status === "failed" ? "call failed" : "hung up"}`, tone: "text-muted" };
    case "call_failed":
      return { text: `${prov} call failed: ${p.error}`, tone: "text-red" };
    case "recommended":
      return { text: `Ranked. ${p.winner_provider} recommended at ${usd("all_in_cents")}${p.engine === "fixture" ? " [fixture AI]" : ""}`, tone: "text-fg font-semibold" };
    case "quote_failed":
      return { text: `Quote run failed: ${p.reason}`, tone: "text-red" };
    case "auto_book_skipped":
      return { text: `Auto-book held: ${p.reason}`, tone: "text-muted" };
    case "auto_book_failed":
      return { text: `Auto-book failed: ${p.error}`, tone: "text-red" };
    case "booked":
      return { text: `Booked ${prov} for ${usd("amount_cents")}${p.booked_by === "agent" ? " by the agent" : p.booked_by === "auto" ? " automatically" : ""}`, tone: "text-fg font-semibold" };
    case "payment_authorized":
      return { text: `Card authorized ${usd("amount_cents")}`, tone: "text-fg font-semibold", code: "Stripe" };
    case "payment_failed":
      return { text: `Payment failed: ${p.error ?? p.message ?? ""}`, tone: "text-red" };
    case "tender_sent":
      return { text: `Tender emailed to ${prov}`, tone: "text-fg", code: "204" };
    case "tender_email_failed":
      return { text: `Tender email failed: ${p.error}`, tone: "text-red" };
    case "accepted":
      return { text: `${prov} accepted the tender`, tone: "text-live", code: "990" };
    case "declined":
      return { text: `${prov} declined the tender`, tone: "text-red", code: "990" };
    case "picked_up":
      return { text: "Picked up at the terminal", tone: "text-live", code: "214" };
    case "delivered":
      return { text: "Delivered to the DC", tone: "text-live", code: "214" };
    case "payment_captured":
      return { text: `Payment captured ${usd("amount_cents")}`, tone: "text-live", code: "210" };
    case "payment_canceled":
      return { text: "Authorization released", tone: "text-muted" };
    default:
      return { text: e.type.replace(/_/g, " "), tone: "text-muted" };
  }
}

// "chassis days 0" next to "chassis included" is noise on the log.
const quiet = (e: EventRow) => {
  const p = (e.payload ?? {}) as P;
  return e.type === "field_heard" && p.field === "est_chassis_days" && !p.value;
};

export function Timeline({ events, providers }: { events: EventRow[]; providers: Map<string, Provider> }) {
  const recent = events.filter((e) => !quiet(e)).slice(-80);
  return (
    <ol className="space-y-0.5" aria-label="Container timeline">
      <AnimatePresence initial={false}>
        {recent.map((e) => {
          const d = describe(e, providers);
          const t = e.created_at ? new Date(e.created_at) : null;
          return (
            <motion.li
              key={e.id}
              initial={{ opacity: 0, x: -6 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.25 }}
              className="grid grid-cols-[58px_1fr_auto] gap-2 border-b border-dashed border-rule py-1.5 font-mono text-[11.5px] leading-snug last:border-0"
            >
              <time className="text-muted tabular-nums">
                {t ? t.toLocaleTimeString("en-US", { hour12: false, timeZone: "America/New_York" }) : ""}
              </time>
              <span className={d.tone}>{d.text}</span>
              {d.code && d.code !== "Stripe" ? (
                <span className="self-start rounded-[3px] border border-stamp/40 px-1 text-[10px] text-stamp" title={`EDI ${d.code} equivalent`}>
                  {d.code}
                </span>
              ) : (
                <span />
              )}
            </motion.li>
          );
        })}
      </AnimatePresence>
    </ol>
  );
}
