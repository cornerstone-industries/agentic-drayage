// Seeds the fictional demo world: Palmetto Home Goods, its five drayage providers and five
// containers at different stages. Re-runnable: wipes the demo importer's containers (and
// everything hanging off them) but keeps Stripe ids already attached by `npm run setup:stripe`.
//
//   npm run seed            (reads .env.local, then .env)
//
// All names, numbers, rates and addresses are invented.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";
import type { Database, Json } from "../lib/database.types";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY;
if (!url || !serviceKey) {
  console.error("FAIL Supabase not configured: set NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY");
  process.exit(1);
}

const db = createClient<Database>(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

const JUDGE_EMAIL = process.env.JUDGE_EMAIL || "judge@portcall.dev";
const JUDGE_PASSWORD = process.env.JUDGE_PASSWORD || "portcall-judge-2026";
const DEMURRAGE = Number.parseInt(process.env.DEMURRAGE_PER_DAY_CENTS || "17500", 10);
const FEE_BPS = Number.parseInt(process.env.PLATFORM_FEE_BPS || "300", 10);

// ISO 6346 check digit, so every seeded box number (except the scripted demo one) is valid.
function checkDigit(ownerAndSerial: string): string {
  const values: Record<string, number> = {};
  let v = 10;
  for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ") {
    if (v % 11 === 0) v++;
    values[ch] = v++;
  }
  let sum = 0;
  [...ownerAndSerial].forEach((ch, i) => {
    const n = /[A-Z]/.test(ch) ? values[ch] : Number(ch);
    sum += n * 2 ** i;
  });
  return String((sum % 11) % 10);
}
const box = (prefix: string) => `${prefix}${checkDigit(prefix)}`;

const DAY = 86_400_000;
const now = new Date();
const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
const at = (dayOffset: number, hourUtc = 11) => new Date(today.getTime() + dayOffset * DAY + hourUtc * 3_600_000);
const iso = (d: Date) => d.toISOString();
const dateOnly = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * DAY);

const FAIRBURN = {
  destination_name: "Palmetto Home Goods DC, Fairburn GA",
  destination_address: "6100 Southpark Logistics Way, Fairburn, GA 30213",
};
const CHARLOTTE = {
  destination_name: "Palmetto Home Goods DC, Charlotte NC",
  destination_address: "2400 Steele Creek Commerce Dr, Charlotte, NC 28273",
};

async function ensureJudge(): Promise<string> {
  const { data: list, error: listErr } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (listErr) throw listErr;
  const existing = list.users.find((u) => u.email?.toLowerCase() === JUDGE_EMAIL.toLowerCase());
  if (existing) {
    const { error } = await db.auth.admin.updateUserById(existing.id, { password: JUDGE_PASSWORD, email_confirm: true });
    if (error) throw error;
    return existing.id;
  }
  const { data, error } = await db.auth.admin.createUser({ email: JUDGE_EMAIL, password: JUDGE_PASSWORD, email_confirm: true });
  if (error || !data.user) throw error ?? new Error("createUser returned no user");
  return data.user.id;
}

async function main() {
  const ownerId = await ensureJudge();

  // Importer (keep Stripe ids and the MCP key across re-seeds)
  const { data: existingImporter } = await db.from("importers").select("*").eq("owner_id", ownerId).maybeSingle();
  const importerFields = {
    owner_id: ownerId,
    name: "Palmetto Home Goods",
    auto_book_limit_cents: 150000,
    auto_book_enabled: true,
    auto_quote_enabled: false,
    auto_quote_days_before_eta: 3,
    ...(process.env.DEMO_MCP_API_KEY ? { mcp_api_key: process.env.DEMO_MCP_API_KEY } : {}),
  };
  let importerId: string;
  if (existingImporter) {
    importerId = existingImporter.id;
    const { error } = await db.from("importers").update(importerFields).eq("id", importerId);
    if (error) throw error;
  } else {
    const { data, error } = await db.from("importers").insert(importerFields).select("id").single();
    if (error) throw error;
    importerId = data.id;
  }

  // Wipe demo containers (cascades quote_requests, calls, transcript_lines, quotes, recommendations, bookings, events)
  {
    const { error } = await db.from("containers").delete().eq("importer_id", importerId);
    if (error) throw error;
  }

  // Providers, preserving Stripe Connect ids by name
  const { data: oldProviders } = await db.from("providers").select("name, stripe_account_id, stripe_onboarded").eq("importer_id", importerId);
  const keepStripe = new Map((oldProviders ?? []).map((p) => [p.name, p]));
  {
    const { error } = await db.from("providers").delete().eq("importer_id", importerId);
    if (error) throw error;
  }
  const phones = (process.env.DEMO_PROVIDER_PHONES || "").split(",").map((s) => s.trim()).filter(Boolean);
  const providerSeed = [
    { name: "Marshgrass Drayage", contact_name: "Dana Whitlock", phone: phones[0] || "+18435550141", email: "dispatch@marshgrass.example", ports: ["Charleston"], service_states: ["SC", "GA", "NC"] },
    { name: "Ironclad Intermodal", contact_name: "Ray Okafor", phone: phones[1] || "+18435550172", email: "quotes@ironclad-intermodal.example", ports: ["Charleston", "Savannah"], service_states: ["SC", "GA", "NC", "TN"] },
    { name: "Sweetgrass Transport", contact_name: "Lena Brooks", phone: phones[2] || "+18435550188", email: "dispatch@sweetgrass-transport.example", ports: ["Charleston"], service_states: ["SC", "GA", "NC"] },
    { name: "Lowcountry Box Haulers", contact_name: "Pete Rawl", phone: "+18435550113", email: "office@lowcountrybox.example", ports: ["Charleston"], service_states: ["SC"] },
    { name: "Tybee Gate Cartage", contact_name: "Marisol Vance", phone: "+19125550126", email: "dispatch@tybeegate.example", ports: ["Savannah"], service_states: ["GA", "FL"] },
  ].map((p) => ({
    ...p,
    importer_id: importerId,
    stripe_account_id: keepStripe.get(p.name)?.stripe_account_id ?? null,
    stripe_onboarded: keepStripe.get(p.name)?.stripe_onboarded ?? false,
  }));
  const { data: providers, error: provErr } = await db.from("providers").insert(providerSeed).select("id, name");
  if (provErr) throw provErr;
  const pid = (name: string) => providers!.find((p) => p.name.startsWith(name))!.id;

  // Containers
  // Discharged this morning (6 AM ET): the box is available now, so quote, book, pick up and deliver can all
  // really happen today. Last free day is 4 days out, deliver-by 5.
  const demoEta = at(0, 10);
  const containers = [
    {
      // The demo container (number exactly as scripted in CLAUDE.md)
      container_number: "PHGU4829137",
      size: "40HC",
      terminal: "Wando Welch Terminal",
      vessel: "MV Cooper Meridian",
      eta: iso(demoEta),
      last_free_day: dateOnly(addDays(demoEta, 4)),
      deliver_by: dateOnly(addDays(demoEta, 5)),
      status: "inbound",
      ...FAIRBURN,
    },
    {
      container_number: box("PHGU604417"),
      size: "40HC",
      terminal: "North Charleston Terminal",
      vessel: "MV Atlantic Heron",
      eta: iso(at(6)),
      last_free_day: dateOnly(addDays(at(6), 4)),
      deliver_by: dateOnly(addDays(at(6), 6)),
      status: "inbound",
      ...FAIRBURN,
    },
    {
      container_number: box("PHGU330981"),
      size: "40GP",
      terminal: "Hugh K. Leatherman Terminal",
      vessel: "MV Sea Island Grace",
      eta: iso(at(-1)),
      last_free_day: dateOnly(addDays(at(-1), 4)),
      deliver_by: dateOnly(addDays(at(-1), 5)),
      status: "accepted",
      ...CHARLOTTE,
    },
    {
      container_number: box("PHGU275530"),
      size: "40HC",
      terminal: "Wando Welch Terminal",
      vessel: "MV Ashley Tide",
      eta: iso(at(-3)),
      last_free_day: dateOnly(addDays(at(-3), 4)),
      deliver_by: dateOnly(addDays(at(-3), 4)),
      status: "picked_up",
      ...FAIRBURN,
    },
    {
      container_number: box("PHGU517204"),
      size: "20GP",
      terminal: "North Charleston Terminal",
      vessel: "MV Morris Light",
      eta: iso(at(-9)),
      last_free_day: dateOnly(addDays(at(-9), 4)),
      deliver_by: dateOnly(addDays(at(-9), 5)),
      status: "delivered",
      ...CHARLOTTE,
    },
  ].map((c) => ({ ...c, importer_id: importerId, port: "Charleston" }));
  const { data: boxes, error: boxErr } = await db.from("containers").insert(containers).select("id, container_number, eta, last_free_day");
  if (boxErr) throw boxErr;
  const cid = (n: string) => boxes!.find((b) => b.container_number.startsWith(n))!.id;

  // History for the three containers already in motion: winning quote, booking, timeline.
  type History = {
    container: string;
    provider: string;
    linehaul: number;
    fuel: number;
    chassisDay: number;
    chassisDays: number;
    pickupOffset: number; // days after ETA
    bookedBy: "human" | "auto" | "agent";
    stage: "accepted" | "picked_up" | "delivered";
    etaOffset: number;
  };
  const history: History[] = [
    { container: "PHGU330981", provider: "Sweetgrass", linehaul: 61000, fuel: 11590, chassisDay: 0, chassisDays: 0, pickupOffset: 2, bookedBy: "auto", stage: "accepted", etaOffset: -1 },
    { container: "PHGU275530", provider: "Marshgrass", linehaul: 65000, fuel: 11700, chassisDay: 4000, chassisDays: 2, pickupOffset: 1, bookedBy: "agent", stage: "picked_up", etaOffset: -3 },
    { container: "PHGU517204", provider: "Marshgrass", linehaul: 58000, fuel: 10440, chassisDay: 4000, chassisDays: 2, pickupOffset: 1, bookedBy: "human", stage: "delivered", etaOffset: -9 },
  ];

  for (const h of history) {
    const containerId = cid(h.container);
    const providerId = pid(h.provider);
    const eta = at(h.etaOffset);
    const allIn = h.linehaul + h.fuel + h.chassisDay * h.chassisDays;
    const { data: quote, error: qErr } = await db
      .from("quotes")
      .insert({
        provider_id: providerId,
        container_id: containerId,
        linehaul_cents: h.linehaul,
        fuel_surcharge_cents: h.fuel,
        chassis_per_day_cents: h.chassisDay,
        est_chassis_days: h.chassisDays,
        accessorials: [],
        all_in_cents: allIn,
        earliest_pickup: dateOnly(addDays(eta, h.pickupOffset)),
        can_meet_deadline: true,
        projected_demurrage_cents: 0,
        risk_adjusted_cents: allIn,
        notes: "Seeded history",
      })
      .select("id")
      .single();
    if (qErr) throw qErr;

    const fee = Math.round((allIn * FEE_BPS) / 10_000);
    const bookedAt = addDays(eta, -2);
    const acceptedAt = new Date(bookedAt.getTime() + 25 * 60_000);
    const { error: bErr } = await db.from("bookings").insert({
      container_id: containerId,
      quote_id: quote.id,
      provider_id: providerId,
      amount_cents: allIn,
      platform_fee_cents: fee,
      payment_status: h.stage === "delivered" ? "captured" : "authorized",
      tender_status: "accepted",
      booked_by: h.bookedBy,
      created_at: iso(bookedAt),
      accepted_at: iso(acceptedAt),
    });
    if (bErr) throw bErr;

    const t = (base: Date, minutes: number) => iso(new Date(base.getTime() + minutes * 60_000));
    const events: { container_id: string; type: string; payload: Json; created_at: string }[] = [
      { container_id: containerId, type: "quote_requested", payload: { triggered_by: h.bookedBy === "human" ? "button" : h.bookedBy, seeded: true }, created_at: t(bookedAt, -4) },
      { container_id: containerId, type: "recommended", payload: { provider_id: providerId, seeded: true }, created_at: t(bookedAt, -1) },
      { container_id: containerId, type: "booked", payload: { provider_id: providerId, amount_cents: allIn, booked_by: h.bookedBy, seeded: true }, created_at: t(bookedAt, 0) },
      { container_id: containerId, type: "payment_authorized", payload: { amount_cents: allIn, seeded: true }, created_at: t(bookedAt, 0) },
      { container_id: containerId, type: "tender_sent", payload: { provider_id: providerId, seeded: true }, created_at: t(bookedAt, 1) },
      { container_id: containerId, type: "accepted", payload: { provider_id: providerId, seeded: true }, created_at: iso(acceptedAt) },
    ];
    if (h.stage === "picked_up" || h.stage === "delivered") {
      events.push({ container_id: containerId, type: "picked_up", payload: { provider_id: providerId, seeded: true }, created_at: iso(addDays(eta, h.pickupOffset)) });
    }
    if (h.stage === "delivered") {
      const deliveredAt = addDays(eta, h.pickupOffset + 1);
      events.push({ container_id: containerId, type: "delivered", payload: { provider_id: providerId, seeded: true }, created_at: iso(deliveredAt) });
      events.push({ container_id: containerId, type: "payment_captured", payload: { amount_cents: allIn, seeded: true }, created_at: iso(deliveredAt) });
    }
    const { error: eErr } = await db.from("events").insert(events);
    if (eErr) throw eErr;
  }

  const { data: imp } = await db.from("importers").select("mcp_api_key").eq("id", importerId).single();
  console.log(`judge login: ${JUDGE_EMAIL} / ${JUDGE_PASSWORD}`);
  if (!process.env.DEMO_MCP_API_KEY) console.log(`DEMO_MCP_API_KEY=${imp?.mcp_api_key}  (add to .env.local to pin it across re-seeds)`);
  console.log(`demurrage estimate: $${(DEMURRAGE / 100).toFixed(2)}/day`);
  console.log(`seeded: 1 importer, ${providers!.length} providers, ${boxes!.length} containers`);
}

main().catch((err) => {
  console.error("FAIL seed:", err?.message ?? err);
  process.exit(1);
});
