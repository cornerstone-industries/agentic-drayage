// How long does the assistant take to answer? Pulls the most recent Vapi calls and prints, per call, the
// gap between the dispatcher finishing a sentence and PortCall starting its reply, plus Vapi's own
// per-turn breakdown when the call object carries one (endpointing, transcriber, model, voice).
//
//   npm run vapi:latency            # last 5 calls
//   npm run vapi:latency -- 10      # last 10 calls
//
// Needs VAPI_API_KEY in .env.local. Prints no secrets.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

type Msg = { role?: string; message?: string; time?: number; endTime?: number; secondsFromStart?: number; duration?: number };
type Turn = Record<string, number | undefined>;
type VapiCall = {
  id: string;
  type?: string;
  status?: string;
  endedReason?: string;
  startedAt?: string;
  endedAt?: string;
  messages?: Msg[];
  artifact?: { messages?: Msg[]; performanceMetrics?: { turnLatencies?: Turn[] } & Record<string, unknown> };
};

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
const s = (ms: number) => (Number.isFinite(ms) ? `${(ms / 1000).toFixed(2)}s` : "n/a");

async function main() {
  const key = process.env.VAPI_API_KEY?.trim();
  if (!key) {
    console.error("FAIL VAPI_API_KEY is not set in .env.local");
    process.exit(1);
  }
  const limit = Number.parseInt(process.argv[2] ?? "5", 10) || 5;
  const res = await fetch(`https://api.vapi.ai/call?limit=${limit}`, { headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok) throw new Error(`Vapi answered ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const calls = (await res.json()) as VapiCall[];

  for (const call of calls) {
    const lengthS = call.startedAt && call.endedAt ? (Date.parse(call.endedAt) - Date.parse(call.startedAt)) / 1000 : NaN;
    console.log(`\n${call.id.slice(0, 8)}  ${call.type ?? ""}  ${call.status ?? ""}  ${call.endedReason ?? ""}  length ${Number.isFinite(lengthS) ? `${lengthS.toFixed(0)}s` : "n/a"}`);

    // 1) Measured from the transcript: dispatcher stops talking -> PortCall starts talking.
    const raw = call.artifact?.messages ?? call.messages;
    const msgs = (Array.isArray(raw) ? raw : []).filter((m) => m.role === "user" || m.role === "bot" || m.role === "assistant");
    const gaps: number[] = [];
    for (let i = 1; i < msgs.length; i++) {
      const prev = msgs[i - 1];
      const cur = msgs[i];
      if (prev.role !== "user" || cur.role === "user") continue;
      const userEnd = prev.endTime ?? (prev.time != null && prev.duration != null ? prev.time + prev.duration : undefined);
      if (userEnd == null || cur.time == null) continue;
      const gap = cur.time - userEnd;
      gaps.push(gap);
      console.log(`  reply after ${s(gap).padStart(6)}  to: "${(prev.message ?? "").slice(0, 60)}"`);
    }
    if (gaps.length) console.log(`  average reply delay ${s(avg(gaps))}, worst ${s(Math.max(...gaps))}`);
    else console.log("  no user -> assistant turns with timestamps in this call");

    // 2) Vapi's own breakdown, if present on this API version.
    const turns = call.artifact?.performanceMetrics?.turnLatencies ?? [];
    if (turns.length) {
      const keys = ["endpointingLatency", "transcriberLatency", "modelLatency", "voiceLatency", "turnLatency"];
      const parts = keys.map((k) => `${k.replace("Latency", "")} ${s(avg(turns.map((t) => t[k] ?? NaN).filter(Number.isFinite)))}`);
      console.log(`  Vapi breakdown (avg of ${turns.length} turns): ${parts.join(", ")}`);
    } else if (call.artifact?.performanceMetrics) {
      console.log(`  Vapi performanceMetrics keys: ${Object.keys(call.artifact.performanceMetrics).join(", ")}`);
    }
  }
}

main().catch((err) => {
  console.error(`FAIL ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
