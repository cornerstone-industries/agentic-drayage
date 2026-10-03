// The tender email: what a dispatcher gets after the importer books. One big Accept button opens the
// mobile tender page. Freight mapping (small print in the mail): tender = EDI 204, Accept = 990.
import { Resend } from "resend";
import { appUrl, requireEnv } from "@/lib/env";
import { createAdminClient } from "@/lib/supabase/admin";
import { chassisTotalCents, formatContainerNumber, stateFromAddress, type Accessorial } from "@/lib/money";
import { cityFromAddress, longDate } from "@/lib/dates";
import type { Booking, Container, Provider, Quote } from "@/lib/types";

/** "$847.00": money in a tender always shows exact cents. */
export function usd(cents: number): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export type TenderEmailInput = {
  booking: Pick<Booking, "amount_cents" | "platform_fee_cents">;
  container: Pick<Container, "container_number" | "size" | "port" | "terminal" | "last_free_day" | "destination_name" | "destination_address" | "deliver_by">;
  provider: Pick<Provider, "name" | "contact_name" | "email">;
  quote: Pick<Quote, "linehaul_cents" | "fuel_surcharge_cents" | "chassis_per_day_cents" | "est_chassis_days" | "accessorials" | "earliest_pickup">;
  importerName: string;
  acceptUrl: string;
  /** Set when TENDER_EMAIL_OVERRIDE_TO redirected the mail: the provider address it was meant for. */
  intendedFor?: string;
};

// Same tokens as the app (app/globals.css): port control room at night.
const C = { ink: "#0A0E13", panel: "#10161E", line: "#1C2733", text: "#E6EDF3", muted: "#7D8B99", dim: "#4A5866", sodium: "#FFB020", signal: "#2EE6C5" };
const MONO = "'IBM Plex Mono', ui-monospace, SFMono-Regular, Menlo, Consolas, 'Courier New', monospace";
const SANS = "Archivo, -apple-system, 'Segoe UI', Helvetica, Arial, sans-serif";

const esc = (s: string | null | undefined) =>
  (s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** "Wando Welch Terminal" -> "Wando Welch" */
const shortTerminal = (name: string | null) => (name ?? "").replace(/\s+terminal$/i, "").trim() || "Charleston";

function accessorialList(v: Quote["accessorials"]): Accessorial[] {
  if (!Array.isArray(v)) return [];
  return v.flatMap((x) => {
    const a = x as { name?: unknown; cents?: unknown } | null;
    return a && typeof a.name === "string" && typeof a.cents === "number" && a.cents > 0 ? [{ name: a.name, cents: a.cents }] : [];
  });
}

function pickupWindow(pickup: string | null, lfd: string | null): string {
  if (pickup && lfd) return pickup <= lfd ? `${longDate(pickup)} to ${longDate(lfd)} (last free day)` : `${longDate(pickup)} (last free day is ${longDate(lfd)})`;
  if (pickup) return `From ${longDate(pickup)}`;
  if (lfd) return `By ${longDate(lfd)} (last free day)`;
  return "To be confirmed";
}

export function renderTenderEmail(i: TenderEmailInput): { subject: string; html: string; text: string } {
  const box = formatContainerNumber(i.container.container_number);
  const terminal = shortTerminal(i.container.terminal);
  const lane = [cityFromAddress(i.container.destination_address), stateFromAddress(i.container.destination_address)].filter(Boolean).join(" ") || i.container.destination_name || "destination";
  const total = i.booking.amount_cents;
  const fee = i.booking.platform_fee_cents;
  const subject = `Tender: ${box}, ${terminal} -> ${lane}, ${usd(total)}`;

  const firstName = i.provider.contact_name?.trim().split(/\s+/)[0];
  const window = pickupWindow(i.quote.earliest_pickup, i.container.last_free_day);
  const deliverTo = [i.container.destination_name, i.container.destination_address].filter(Boolean).join(", ") || "See tender page";
  const deliverBy = i.container.deliver_by ? longDate(i.container.deliver_by) : "To be confirmed";
  const pickupAt = [i.container.terminal, i.container.port ? `Port of ${i.container.port}` : null].filter(Boolean).join(", ") || "To be confirmed";

  const rates: Array<[string, number]> = [];
  if (i.quote.linehaul_cents != null) rates.push(["Linehaul", i.quote.linehaul_cents]);
  if (i.quote.fuel_surcharge_cents) rates.push(["Fuel surcharge", i.quote.fuel_surcharge_cents]);
  const chassis = chassisTotalCents(i.quote);
  if (chassis) {
    const days = i.quote.est_chassis_days ?? 0;
    rates.push([`Chassis, ${days} day${days === 1 ? "" : "s"} at ${usd(i.quote.chassis_per_day_cents ?? 0)}/day`, chassis]);
  }
  for (const a of accessorialList(i.quote.accessorials)) rates.push([a.name, a.cents]);

  const intro = `${i.importerName} booked your quote for this load. Tap Accept to confirm you will run it. Payment of ${usd(total)} is authorized now and released to you when you mark the load Delivered.`;

  const details: Array<[string, string]> = [
    ["Container", `${box} (${i.container.size ?? "container"})`],
    ["Pick up at", pickupAt],
    ["Pickup window", window],
    ["Deliver to", deliverTo],
    ["Deliver by", deliverBy],
  ];

  // ---- plain text
  const text = [
    ...(i.intendedFor ? [`DEMO ROUTING: this tender is addressed to ${i.provider.name} <${i.intendedFor}> and was delivered here because TENDER_EMAIL_OVERRIDE_TO is set.`, ""] : []),
    `PORTCALL LOAD TENDER`,
    "",
    `${firstName ? `Hi ${firstName},` : `Hi ${i.provider.name} team,`}`,
    intro,
    "",
    ...details.map(([k, v]) => `${k}: ${v}`),
    "",
    "Agreed rate",
    ...rates.map(([k, v]) => `  ${k}: ${usd(v)}`),
    `  Total: ${usd(total)}`,
    `  PortCall platform fee: -${usd(fee)}`,
    `  You receive: ${usd(total - fee)}`,
    "",
    `ACCEPT THE LOAD: ${i.acceptUrl}`,
    "",
    "This message is a load tender, the PortCall equivalent of an EDI 204. Accept replies as a 990; Picked up and Delivered are 214 status updates.",
  ].join("\n");

  // ---- html (table layout, inline styles: email clients ignore everything else)
  const labelCell = `font-family:${MONO};font-size:11px;letter-spacing:0.08em;text-transform:uppercase;color:${C.muted};padding:9px 12px 9px 0;vertical-align:top;width:34%;border-top:1px solid ${C.line};`;
  const valueCell = `font-family:${SANS};font-size:14px;line-height:1.45;color:${C.text};padding:9px 0;vertical-align:top;border-top:1px solid ${C.line};`;
  // The container number already headlines the card, so the table starts at the pickup.
  const detailRows = details
    .filter(([k]) => k !== "Container")
    .map(([k, v]) => `<tr><td style="${labelCell}">${esc(k)}</td><td style="${valueCell}">${esc(v)}</td></tr>`)
    .join("");
  const rateLabel = `font-family:${SANS};font-size:14px;color:${C.text};padding:8px 12px 8px 0;border-top:1px solid ${C.line};`;
  const rateValue = `font-family:${MONO};font-size:14px;color:${C.text};padding:8px 0;text-align:right;white-space:nowrap;border-top:1px solid ${C.line};`;
  const rateRows = rates.map(([k, v]) => `<tr><td style="${rateLabel}">${esc(k)}</td><td style="${rateValue}">${usd(v)}</td></tr>`).join("");

  const banner = i.intendedFor
    ? `<tr><td style="padding:0 0 16px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td style="border:1px dashed ${C.sodium};padding:12px 14px;font-family:${MONO};font-size:12px;line-height:1.5;color:${C.sodium};">DEMO ROUTING<br><span style="color:${C.text};font-family:${SANS};font-size:13px;">This tender is addressed to <strong>${esc(i.provider.name)}</strong> (${esc(i.intendedFor)}). It landed in this inbox because the demo redirects every tender here.</span></td></tr></table></td></tr>`
    : "";

  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark"><meta name="supported-color-schemes" content="dark"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:${C.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">Accept to confirm. Pick up at ${esc(terminal)}, deliver to ${esc(lane)} by ${esc(deliverBy)}.</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${C.ink}" style="background:${C.ink};"><tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
${banner}
<tr><td style="padding:0 0 14px;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td style="font-family:${SANS};font-size:15px;font-weight:800;letter-spacing:0.22em;color:${C.sodium};">PORTCALL</td>
<td align="right" style="font-family:${MONO};font-size:11px;letter-spacing:0.12em;color:${C.muted};">LOAD TENDER</td>
</tr></table></td></tr>
<tr><td style="background:${C.panel};border:1px solid ${C.line};border-top:3px solid ${C.sodium};padding:22px 20px;">
<div style="font-family:${MONO};font-size:11px;letter-spacing:0.12em;color:${C.muted};">CONTAINER</div>
<div style="font-family:${MONO};font-size:28px;font-weight:600;letter-spacing:0.14em;color:${C.sodium};padding:4px 0 2px;">${esc(box)}</div>
<div style="font-family:${SANS};font-size:14px;color:${C.muted};">${esc(i.container.size ?? "container")} &middot; ${esc(terminal)} &rarr; ${esc(lane)}</div>
<p style="font-family:${SANS};font-size:15px;line-height:1.55;color:${C.text};margin:18px 0 20px;">${esc(firstName ? `Hi ${firstName},` : `Hi ${i.provider.name} team,`)}<br>${esc(intro)}</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td bgcolor="${C.sodium}" align="center" style="background:${C.sodium};border-radius:4px;">
<a href="${esc(i.acceptUrl)}" target="_blank" style="display:block;padding:20px 24px;font-family:${SANS};font-size:19px;font-weight:800;letter-spacing:0.04em;color:${C.ink};text-decoration:none;">ACCEPT LOAD &rarr;</a>
</td></tr></table>
<p style="font-family:${MONO};font-size:11px;line-height:1.5;color:${C.dim};margin:10px 0 0;word-break:break-all;">Or open ${esc(i.acceptUrl)}</p>
</td></tr>
<tr><td style="padding:22px 4px 0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${detailRows}</table></td></tr>
<tr><td style="padding:22px 4px 0;">
<div style="font-family:${MONO};font-size:11px;letter-spacing:0.12em;color:${C.muted};padding-bottom:6px;">AGREED RATE</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rateRows}
<tr><td style="${rateLabel}font-weight:700;">Total</td><td style="${rateValue}font-weight:600;color:${C.sodium};">${usd(total)}</td></tr>
<tr><td style="${rateLabel}color:${C.muted};">PortCall platform fee</td><td style="${rateValue}color:${C.muted};">-${usd(fee)}</td></tr>
<tr><td style="${rateLabel}font-weight:700;">You receive</td><td style="${rateValue}font-weight:600;color:${C.signal};">${usd(total - fee)}</td></tr>
</table></td></tr>
<tr><td style="padding:26px 4px 0;font-family:${MONO};font-size:10px;line-height:1.6;letter-spacing:0.04em;color:${C.dim};">This message is a load tender, the PortCall equivalent of an EDI 204. Accept replies as a 990; Picked up and Delivered are 214 status updates; payment capture on delivery is the 210.</td></tr>
</table></td></tr></table>
</body></html>`;

  return { subject, html, text };
}

export type TenderEmailResult = { id: string; to: string[]; intendedFor: string; redirected: boolean; subject: string };

/**
 * Sends the tender for a booking through Resend. To: TENDER_EMAIL_OVERRIDE_TO (comma separated) when set,
 * otherwise the provider's address. Throws on any failure, the caller records tender_email_failed.
 */
export async function sendTenderEmail(bookingId: string): Promise<TenderEmailResult> {
  const { RESEND_API_KEY, TENDER_FROM_EMAIL } = requireEnv("Resend", ["RESEND_API_KEY", "TENDER_FROM_EMAIL"]);
  const db = createAdminClient();

  const { data: booking, error } = await db
    .from("bookings")
    .select("*, provider:providers(*), quote:quotes(*), container:containers(*, importer:importers(name))")
    .eq("id", bookingId)
    .maybeSingle();
  if (error) throw new Error(`booking lookup failed: ${error.message}`);
  if (!booking?.provider || !booking.quote || !booking.container || !booking.tender_token) throw new Error(`booking ${bookingId} is missing its provider, quote, container or tender token`);

  const override = (process.env.TENDER_EMAIL_OVERRIDE_TO ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const to = override.length ? override : [booking.provider.email];
  const { subject, html, text } = renderTenderEmail({
    booking,
    container: booking.container,
    provider: booking.provider,
    quote: booking.quote,
    importerName: booking.container.importer?.name ?? "Your customer",
    acceptUrl: `${appUrl()}/tender/${booking.tender_token}`,
    intendedFor: override.length ? booking.provider.email : undefined,
  });

  const resend = new Resend(RESEND_API_KEY);
  const { data, error: sendErr } = await resend.emails.send({
    from: TENDER_FROM_EMAIL,
    to,
    subject,
    html,
    text,
    tags: [
      { name: "type", value: "tender" },
      { name: "booking_id", value: booking.id },
    ],
  });
  if (sendErr || !data) throw new Error(`Resend refused the tender${sendErr ? ` (${sendErr.name}${sendErr.statusCode ? ` ${sendErr.statusCode}` : ""}): ${sendErr.message}` : ": no response"}`);
  return { id: data.id, to, intendedFor: booking.provider.email, redirected: override.length > 0, subject };
}
