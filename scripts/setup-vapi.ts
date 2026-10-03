// Creates (or updates) the PortCall calling assistant in Vapi and lists the phone numbers it can dial from.
//
//   npm run setup:vapi      (reads .env.local, then .env)
//
// Needs VAPI_API_KEY, VAPI_WEBHOOK_SECRET and a public APP_URL: Vapi POSTs its webhooks to
// ${APP_URL}/api/vapi/webhook, so localhost will not work (use the Vercel URL or a tunnel such as ngrok).
// With VAPI_ASSISTANT_ID set it updates that assistant (PATCH); otherwise it creates one (POST) and
// prints the VAPI_ASSISTANT_ID line to paste into .env.local and the Vercel env.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { z } from "zod";
import { appUrl, requireEnv } from "@/lib/env";
import { buildAssistantConfig } from "@/lib/vapi/assistant-config";
import { vapiRequest } from "@/lib/vapi/client";
import { runScript } from "./lib/demo";

const Assistant = z
  .object({
    id: z.string().min(1),
    server: z.object({ url: z.string().optional() }).passthrough().optional(),
    model: z.object({ model: z.string().optional() }).passthrough().optional(),
    serverMessages: z.array(z.string()).optional(),
  })
  .passthrough();

const PhoneNumbers = z.array(
  z.object({ id: z.string(), provider: z.string(), number: z.string().optional(), name: z.string().optional() }).passthrough(),
);

/** Hosts Vapi's servers cannot reach. */
function unreachableHost(hostname: string): boolean {
  const h = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  return (
    h === "localhost" ||
    h.endsWith(".localhost") ||
    h.endsWith(".local") ||
    h === "::1" ||
    h === "0.0.0.0" ||
    /^127\./.test(h) ||
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h)
  );
}

void runScript(async (r) => {
  const env = await r.run("config", async () => requireEnv("Vapi", ["VAPI_API_KEY", "VAPI_WEBHOOK_SECRET"]), "VAPI_API_KEY and VAPI_WEBHOOK_SECRET are set");
  if (!env) return;

  const webhookUrl = await r.run(
    "webhook-url",
    async () => {
      const base = appUrl();
      let host: string;
      try {
        host = new URL(base).hostname;
      } catch {
        throw new Error(`APP_URL "${base}" is not a valid URL`);
      }
      if (unreachableHost(host)) {
        throw new Error(`APP_URL is ${base}, which Vapi cannot reach. Set APP_URL to the public deployment URL (or a tunnel such as ngrok) and run again.`);
      }
      return `${base}/api/vapi/webhook`;
    },
    (url) => url,
  );
  if (!webhookUrl) return;

  const existingId = process.env.VAPI_ASSISTANT_ID?.trim();
  const body = buildAssistantConfig({ webhookUrl, webhookSecret: env.VAPI_WEBHOOK_SECRET });
  const assistant = await r.run(
    existingId ? "assistant-update" : "assistant-create",
    async () => {
      const json = await vapiRequest(existingId ? "PATCH" : "POST", existingId ? `/assistant/${existingId}` : "/assistant", body);
      const parsed = Assistant.safeParse(json);
      if (!parsed.success) throw new Error(`Vapi answered without an assistant id: ${JSON.stringify(json).slice(0, 300)}`);
      return parsed.data;
    },
    (a) => `${existingId ? "updated" : "created"} assistant ${a.id}`,
  );
  if (!assistant) return;

  // Read back what Vapi stored: the webhook target, the model and the message types the route handles.
  const problems: string[] = [];
  if (assistant.server?.url !== webhookUrl) problems.push(`server.url is ${assistant.server?.url ?? "empty"}`);
  if (assistant.model?.model !== body.model.model) problems.push(`model is ${assistant.model?.model ?? "empty"}`);
  for (const t of body.serverMessages) if (!assistant.serverMessages?.includes(t)) problems.push(`serverMessages lacks ${t}`);
  if (problems.length) r.fail("assistant-config", `Vapi stored something different from what was sent: ${problems.join("; ")}`);
  else r.pass("assistant-config", `${body.model.model}, webhook ${webhookUrl}`);

  if (!existingId) {
    r.info("paste this into .env.local and the Vercel env:");
    console.log(`VAPI_ASSISTANT_ID=${assistant.id}`);
  }

  const numbers = await r.run(
    "phone-numbers",
    async () => {
      const json = await vapiRequest("GET", "/phone-number?limit=100");
      const parsed = PhoneNumbers.safeParse(json);
      if (!parsed.success) throw new Error(`unexpected /phone-number answer: ${JSON.stringify(json).slice(0, 300)}`);
      if (!parsed.data.length) {
        throw new Error("this Vapi org has no phone numbers: import a Twilio number (Dashboard, Phone Numbers, Import) so calls can dial out");
      }
      return parsed.data;
    },
    (list) => `${list.length} number${list.length === 1 ? "" : "s"}`,
  );
  if (!numbers) return;

  const wanted = process.env.VAPI_PHONE_NUMBER_ID?.trim();
  for (const n of numbers) {
    const mark = n.id === wanted ? "   <- VAPI_PHONE_NUMBER_ID" : "";
    console.log(`  ${n.id}  ${n.provider.padEnd(14)} ${n.number ?? "(no number yet)"}${n.name ? `  ${n.name}` : ""}${mark}`);
  }
  for (const n of numbers.filter((x) => x.provider === "vapi")) {
    r.warn(`${n.id} is a free Vapi number. Vapi's docs say free numbers are inbound only (US national), so outbound calls from it will likely fail. Import a Twilio number and use its id.`);
  }

  if (!wanted) {
    r.info("VAPI_PHONE_NUMBER_ID is not set: pick one of the ids above and add it to .env.local and the Vercel env");
    return;
  }
  const chosen = numbers.find((n) => n.id === wanted);
  if (!chosen) r.fail("phone-number-id", `VAPI_PHONE_NUMBER_ID ${wanted} is not one of the numbers above`);
  else r.pass("phone-number-id", `${chosen.provider} ${chosen.number ?? "(no number yet)"}`);
});
