// Seeds 90 days of SYNTHETIC lane history (source 'seed') so the Lane history panel has depth on day one.
// Real quote runs add rows with source 'call'. Re-runnable: it replaces only the seed rows.
//
//   npm run seed:lanes
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { createClient } from "@supabase/supabase-js";

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!, { auth: { persistSession: false } });

// Deterministic so every reseed draws the same history.
function rng(seed: number) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = rng(20261003);
const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
const chance = (p: number) => rand() < p;
const round = (cents: number) => Math.round(cents / 100) * 100;

type Profile = {
  carrier: string;
  linehaul: [number, number]; // dollars, start of window -> end of window (drift)
  fuelPct: number | null; // null = included
  chassis: { perDay: number; days: number } | null; // null = included
  prePull: { cents: number; chance: number } | null;
  late: number; // chance the earliest pickup lands after the last free day
};
type Lane = { city: string; state: string; size: string; terminal: string; profiles: Profile[] };

const LANES: Lane[] = [
  {
    city: "Fairburn",
    state: "GA",
    size: "40HC",
    terminal: "Wando Welch Terminal",
    profiles: [
      { carrier: "Marshgrass Drayage", linehaul: [620, 650], fuelPct: 0.18, chassis: { perDay: 40, days: 2 }, prePull: null, late: 0.05 },
      { carrier: "Ironclad Intermodal", linehaul: [598, 592], fuelPct: null, chassis: null, prePull: null, late: 0.55 },
      { carrier: "Sweetgrass Transport", linehaul: [705, 720], fuelPct: 0.19, chassis: null, prePull: { cents: 7500, chance: 0.4 }, late: 0.1 },
    ],
  },
  {
    city: "Charlotte",
    state: "NC",
    size: "40GP",
    terminal: "Hugh K. Leatherman Terminal",
    profiles: [
      { carrier: "Marshgrass Drayage", linehaul: [540, 560], fuelPct: 0.18, chassis: { perDay: 40, days: 2 }, prePull: null, late: 0.05 },
      { carrier: "Ironclad Intermodal", linehaul: [628, 622], fuelPct: null, chassis: null, prePull: null, late: 0.4 },
      { carrier: "Sweetgrass Transport", linehaul: [600, 612], fuelPct: 0.19, chassis: null, prePull: { cents: 7500, chance: 0.3 }, late: 0.1 },
    ],
  },
];

const DEMURRAGE = Number(process.env.DEMURRAGE_PER_DAY_CENTS ?? 17500);

async function main() {
  const { data: importer } = await db.from("importers").select("id").eq("name", "Palmetto Home Goods").single();
  if (!importer) throw new Error("Palmetto Home Goods not found: run npm run seed first");
  const { data: providers } = await db.from("providers").select("id, name").eq("importer_id", importer.id);
  const providerId = new Map((providers ?? []).map((p) => [p.name, p.id]));

  const rows: Record<string, unknown>[] = [];
  const today = new Date();
  for (const lane of LANES) {
    // A quote run about every three days over the last 90 days, skipping today (real runs land there).
    for (let daysAgo = 90; daysAgo >= 3; daysAgo -= Math.round(between(2, 4))) {
      const day = new Date(today.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 10);
      const progress = (90 - daysAgo) / 87; // 0 at the start of the window, 1 now
      const run = lane.profiles.map((p) => {
        const linehaul = round((p.linehaul[0] + (p.linehaul[1] - p.linehaul[0]) * progress + between(-14, 14)) * 100);
        const fuel = p.fuelPct == null ? null : Math.round(linehaul * (p.fuelPct + between(-0.01, 0.01)));
        const chassis = p.chassis ? p.chassis.perDay * 100 * p.chassis.days : null;
        const accessorials = p.prePull && chance(p.prePull.chance) ? p.prePull.cents : 0;
        const allIn = linehaul + (fuel ?? 0) + (chassis ?? 0) + accessorials;
        const late = chance(p.late);
        const pickupVsLfd = late ? Math.round(between(1, 3)) : -Math.round(between(1, 3));
        const metDeadline = late ? chance(0.25) : chance(0.97);
        return { p, linehaul, fuel, chassis, accessorials, allIn, pickupVsLfd, metDeadline, risk: allIn + Math.max(0, pickupVsLfd) * DEMURRAGE };
      });
      const winner = [...run].sort((a, b) => Number(b.metDeadline) - Number(a.metDeadline) || a.risk - b.risk)[0];
      for (const r of run) {
        rows.push({
          importer_id: importer.id,
          provider_id: providerId.get(r.p.carrier) ?? null,
          provider_name: r.p.carrier,
          origin: "Charleston",
          terminal: lane.terminal,
          dest_city: lane.city,
          dest_state: lane.state,
          size: lane.size,
          quoted_on: day,
          linehaul_cents: r.linehaul,
          fuel_cents: r.fuel,
          chassis_cents: r.chassis,
          accessorials_cents: r.accessorials,
          all_in_cents: r.allIn,
          pickup_vs_lfd_days: r.pickupVsLfd,
          met_deadline: r.metDeadline,
          won: r === winner,
          source: "seed",
        });
      }
    }
  }

  const { error: delErr } = await db.from("lane_rates").delete().eq("importer_id", importer.id).eq("source", "seed");
  if (delErr) throw delErr;
  const { error } = await db.from("lane_rates").insert(rows);
  if (error) throw error;
  console.log(`PASS seeded ${rows.length} synthetic lane quotes across ${LANES.length} lanes`);
}

main().catch((err) => {
  console.error(`FAIL ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
