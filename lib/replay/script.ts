// The three dispatcher scripts from CLAUDE.md section 15, written out as real conversations for
// CALL_MODE=replay. Dates are generated from the container, so the dialogue always matches the
// seeded ETA, last free day and deliver-by. Each dispatcher line carries the quote fields it states;
// only the DEV ONLY fixture extractor reads those annotations. Real extraction reads the words.
import { addDays, cityFromAddress, portDate, spokenDay, spokenSize, stateName } from "@/lib/dates";
import { formatContainerNumber, stateFromAddress, type Accessorial } from "@/lib/money";
import type { QuoteField } from "@/lib/ai/types";

export type ScriptLine = {
  role: "assistant" | "user";
  text: string;
  fields?: Partial<Record<QuoteField, number | boolean | string | Accessorial[]>>;
};

export type DispatcherScript = {
  key: "marshgrass" | "ironclad" | "sweetgrass";
  providerName: string;
  ringSeconds: number; // how long it rings before the dispatcher picks up
  lines: ScriptLine[];
};

export type ScriptContainer = {
  container_number: string;
  size: string | null;
  terminal: string | null;
  eta: string | null;
  last_free_day: string | null;
  deliver_by: string | null;
  destination_address: string | null;
};

export function scriptKeyForProvider(name: string): DispatcherScript["key"] | null {
  const n = name.toLowerCase();
  if (n.includes("marshgrass")) return "marshgrass";
  if (n.includes("ironclad")) return "ironclad";
  if (n.includes("sweetgrass")) return "sweetgrass";
  return null;
}

export function buildScripts(c: ScriptContainer, importerName = "Palmetto Home Goods"): DispatcherScript[] {
  const eta = c.eta ? portDate(c.eta) : new Date().toISOString().slice(0, 10);
  const lfd = c.last_free_day ?? addDays(eta, 4);
  const deliverBy = c.deliver_by ?? addDays(eta, 5);
  const city = cityFromAddress(c.destination_address) ?? "the DC";
  const state = stateName(stateFromAddress(c.destination_address));
  const box = formatContainerNumber(c.container_number);
  const terminal = c.terminal ?? "the terminal";
  const size = spokenSize(c.size);

  const intro = `Hi, this is PortCall, an AI assistant calling for ${importerName}. Do you have a minute for a quick drayage quote?`;
  const load = `Great. It's one ${size}, ${box}, discharging at ${terminal} on ${spokenDay(eta)}. Last free day is ${spokenDay(lfd)}, and it needs to reach our DC in ${city}, ${state} by ${spokenDay(deliverBy)}. What would your linehaul be?`;

  // Marshgrass: $650 + 18% fuel + chassis $40/day x 2, picks up the day it's available. Winner.
  const mPickup = addDays(eta, 1);
  const mDeliver = addDays(eta, 3);
  const marshgrass: DispatcherScript = {
    key: "marshgrass",
    providerName: "Marshgrass Drayage",
    ringSeconds: 3.2,
    lines: [
      { role: "assistant", text: intro },
      { role: "user", text: "Sure, this is Dana at Marshgrass. What've you got?" },
      { role: "assistant", text: load },
      { role: "user", text: `For ${city} we're at six fifty linehaul.`, fields: { linehaul_cents: 65000 } },
      { role: "assistant", text: "Got it. And your fuel surcharge?" },
      { role: "user", text: "Fuel's eighteen percent this week.", fields: { fuel_surcharge_cents: 11700 } },
      { role: "assistant", text: "What about chassis?" },
      { role: "user", text: "Chassis is forty a day. Figure two days.", fields: { chassis_per_day_cents: 4000, est_chassis_days: 2 } },
      { role: "assistant", text: "Any other fees I should plan for? Pre-pull, storage, wait time?" },
      { role: "user", text: "Nope, nothing else as long as the terminal turns us quick.", fields: { accessorials: [] } },
      { role: "assistant", text: "When's the earliest you could pick it up?" },
      { role: "user", text: `We can pull it ${spokenDay(mPickup)}, the day it's available.`, fields: { earliest_pickup: mPickup } },
      { role: "assistant", text: `And you can deliver by ${spokenDay(deliverBy)}?` },
      { role: "user", text: `Yeah, we'll have it in ${city} by ${spokenDay(mDeliver)}, no problem.`, fields: { can_meet_deadline: true } },
      { role: "assistant", text: `Let me read that back. Six fifty linehaul, eighteen percent fuel, chassis forty a day for two days, pickup ${spokenDay(mPickup)}. Is that right?` },
      { role: "user", text: "That's right." },
      { role: "assistant", text: "Thanks, Dana. We'll confirm by email shortly." },
      { role: "user", text: "Sounds good. Bye now." },
    ],
  };

  // Ironclad: $595 flat (fuel and chassis included) but earliest pickup is 2 days after LFD. Cheapest trap.
  const iPickup = addDays(lfd, 2);
  const iDeliver = addDays(lfd, 3);
  const ironclad: DispatcherScript = {
    key: "ironclad",
    providerName: "Ironclad Intermodal",
    ringSeconds: 4.6,
    lines: [
      { role: "assistant", text: intro },
      { role: "user", text: "Ironclad, this is Ray. Go ahead." },
      { role: "assistant", text: load },
      {
        role: "user",
        text: "I can do that one at five ninety-five flat. Fuel and chassis included.",
        fields: { linehaul_cents: 59500, fuel_surcharge_cents: 0, chassis_per_day_cents: 0, est_chassis_days: 0 },
      },
      { role: "assistant", text: "Five ninety-five all in. Any other fees? Pre-pull or wait time?" },
      { role: "user", text: "No. Flat is flat.", fields: { accessorials: [] } },
      { role: "assistant", text: "When's the earliest you could pick it up?" },
      { role: "user", text: `Honestly, we're slammed. Earliest I can get a truck on it is ${spokenDay(iPickup)}.`, fields: { earliest_pickup: iPickup } },
      { role: "assistant", text: `That's two days past the last free day on the ${spokenDay(lfd).split(" the ")[1]}. Could you do any sooner?` },
      { role: "user", text: "Not this week, sorry. That's the best I've got." },
      { role: "assistant", text: `Understood. Could you still deliver by ${spokenDay(deliverBy)}?` },
      { role: "user", text: `No. If we pull it ${spokenDay(iPickup)}, it's in ${city} ${spokenDay(iDeliver)}.`, fields: { can_meet_deadline: false } },
      { role: "assistant", text: `So, five ninety-five flat, pickup ${spokenDay(iPickup)}, delivery ${spokenDay(iDeliver)}. Correct?` },
      { role: "user", text: "Yep." },
      { role: "assistant", text: "Thanks, Ray. We'll confirm by email shortly." },
      { role: "user", text: "Take care." },
    ],
  };

  // Sweetgrass: $720 including chassis, 19% fuel on top, $75 pre-pull without a terminal appointment. Curveball.
  const sPickup = addDays(eta, 2);
  const sDeliver = addDays(eta, 4);
  const sweetgrass: DispatcherScript = {
    key: "sweetgrass",
    providerName: "Sweetgrass Transport",
    ringSeconds: 2.4,
    lines: [
      { role: "assistant", text: intro },
      { role: "user", text: "Sweetgrass Transport, Lena speaking." },
      { role: "assistant", text: load },
      { role: "user", text: `We'd be seven twenty for ${city}, and that includes the chassis.`, fields: { linehaul_cents: 72000, chassis_per_day_cents: 0, est_chassis_days: 0 } },
      { role: "assistant", text: "Is fuel included too?" },
      { role: "user", text: "No, fuel is nineteen percent on top.", fields: { fuel_surcharge_cents: 13680 } },
      { role: "assistant", text: "Any other fees?" },
      {
        role: "user",
        text: "Just one. If you don't have a terminal appointment for us, there's a seventy-five dollar pre-pull.",
        fields: { accessorials: [{ name: "Pre-pull (no terminal appointment)", cents: 7500 }] },
      },
      { role: "assistant", text: "Noted. What's your earliest pickup?" },
      { role: "user", text: `We can grab it ${spokenDay(sPickup)}.`, fields: { earliest_pickup: sPickup } },
      { role: "assistant", text: `And delivery by ${spokenDay(deliverBy)} works?` },
      { role: "user", text: `Yes. ${spokenDay(sDeliver)} at the latest.`, fields: { can_meet_deadline: true } },
      { role: "assistant", text: "Reading back: seven twenty with chassis, nineteen percent fuel, seventy-five pre-pull if there's no appointment. Right?" },
      { role: "user", text: "You got it." },
      { role: "assistant", text: "Thanks, Lena. We'll confirm by email shortly." },
      { role: "user", text: "Bye." },
    ],
  };

  return [marshgrass, ironclad, sweetgrass];
}

/** How long a line takes to say, in ms (about 165 wpm for the agent, 185 for dispatchers). */
export function speakingMs(line: ScriptLine): number {
  const words = line.text.split(/\s+/).length;
  const perWord = line.role === "assistant" ? 360 : 325;
  return Math.max(900, words * perWord);
}
