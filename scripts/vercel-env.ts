// Pushes the deploy-time environment from .env.local to the linked Vercel project (production), so keys
// are typed once. Prints only names and value lengths, never values.
//
//   npm run vercel:env -- --app-url https://portcall.vercel.app [--only NAME1,NAME2]
//
// APP_URL is taken from --app-url (the production URL), not from .env.local (which points at localhost).
// DEV_ONLY_FIXTURE_AI is always pushed as false: production never uses the fixture AI.
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { parse } from "dotenv";

const NAMES = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "AI_GATEWAY_API_KEY",
  "AI_EXTRACT_MODEL",
  "AI_RECOMMEND_MODEL",
  "VAPI_API_KEY",
  "VAPI_ASSISTANT_ID",
  "VAPI_PHONE_NUMBER_ID",
  "VAPI_WEBHOOK_SECRET",
  "STRIPE_SECRET_KEY",
  "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY",
  "STRIPE_WEBHOOK_SECRET",
  "RESEND_API_KEY",
  "TENDER_FROM_EMAIL",
  "TENDER_EMAIL_OVERRIDE_TO",
  "INTERNAL_CRON_SECRET",
  "DEMURRAGE_PER_DAY_CENTS",
  "PLATFORM_FEE_BPS",
  "CALL_MODE",
  "DEMO_MCP_API_KEY",
  "REPLAY_SPEED",
];

const args = process.argv.slice(2);
const appUrlArg = args[args.indexOf("--app-url") + 1];
if (!args.includes("--app-url") || !appUrlArg?.startsWith("https://")) {
  console.error("FAIL usage: npm run vercel:env -- --app-url https://<your-production-domain>");
  process.exit(1);
}

const env = parse(readFileSync(".env.local"));
const values: Record<string, string> = {};
for (const n of NAMES) if (env[n]?.trim()) values[n] = env[n].trim();
values.APP_URL = appUrlArg.replace(/\/+$/, "");
values.DEV_ONLY_FIXTURE_AI = "false";

// Public and plain config values stay readable; everything else is stored as a Vercel secret.
const CONFIG = new Set(["APP_URL", "CALL_MODE", "DEV_ONLY_FIXTURE_AI", "DEMURRAGE_PER_DAY_CENTS", "PLATFORM_FEE_BPS", "REPLAY_SPEED", "AI_EXTRACT_MODEL", "AI_RECOMMEND_MODEL", "TENDER_FROM_EMAIL", "TENDER_EMAIL_OVERRIDE_TO"]);
const only = args.includes("--only") ? args[args.indexOf("--only") + 1]?.split(",") : null;

let failed = 0;
for (const [name, value] of Object.entries(values)) {
  if (only && !only.includes(name)) continue;
  const kind = name.startsWith("NEXT_PUBLIC_") || CONFIG.has(name) ? "--no-sensitive" : "--sensitive";
  const r = spawnSync("vercel", ["env", "add", name, "production", "--force", "--yes", kind], { input: value, encoding: "utf8" });
  if (r.status === 0) console.log(`PASS ${name} (${value.length} chars)`);
  else {
    failed++;
    console.log(`FAIL ${name}: ${(r.stderr || r.stdout).trim().split("\n").pop()}`);
  }
}
const missing = NAMES.filter((n) => !values[n]);
if (missing.length) console.log(`INFO not in .env.local, not pushed: ${missing.join(", ")}`);
console.log(failed ? `${failed} variable(s) failed` : "Done. Redeploy for the new values to take effect: vercel deploy --prod");
process.exit(failed ? 1 : 0);
