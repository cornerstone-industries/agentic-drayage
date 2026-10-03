// Creates the two Stripe TEST webhook endpoints PortCall needs and saves their signing secrets to
// .env.local as STRIPE_WEBHOOK_SECRET=whsec_A,whsec_B. Prints only lengths, never secrets.
//
//   npm run setup:stripe-webhooks -- --app-url https://portcall-three.vercel.app
//
// Endpoint A listens to this account (PaymentIntents, setup Checkout); endpoint B to connected accounts
// (account.updated). Re-runnable: existing endpoints for the same URL are deleted and recreated, because
// Stripe only reveals a signing secret at creation.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { readFileSync, writeFileSync } from "node:fs";
import { getStripe } from "@/lib/stripe";

const args = process.argv.slice(2);
const appUrl = args[args.indexOf("--app-url") + 1]?.replace(/\/+$/, "");
if (!args.includes("--app-url") || !appUrl?.startsWith("https://")) {
  console.error("FAIL usage: npm run setup:stripe-webhooks -- --app-url https://<production-url>");
  process.exit(1);
}
const url = `${appUrl}/api/stripe/webhook`;

async function main() {
  const stripe = getStripe();
  const existing = await stripe.webhookEndpoints.list({ limit: 100 });
  for (const e of existing.data.filter((e) => e.url === url)) {
    await stripe.webhookEndpoints.del(e.id);
    console.log(`INFO removed old endpoint ${e.id}`);
  }
  const account = await stripe.webhookEndpoints.create({
    url,
    description: "PortCall: payments and card setup",
    enabled_events: [
      "payment_intent.amount_capturable_updated",
      "payment_intent.succeeded",
      "payment_intent.canceled",
      "payment_intent.payment_failed",
      "checkout.session.completed",
    ],
  });
  console.log(`PASS account endpoint ${account.id}`);
  const connect = await stripe.webhookEndpoints.create({
    url,
    connect: true,
    description: "PortCall: connected account onboarding",
    enabled_events: ["account.updated"],
  });
  console.log(`PASS connect endpoint ${connect.id}`);

  const secrets = [account.secret, connect.secret].filter((s): s is string => Boolean(s));
  if (secrets.length !== 2) throw new Error("Stripe did not return both signing secrets");
  const env = readFileSync(".env.local", "utf8").split("\n").filter((l) => !l.startsWith("STRIPE_WEBHOOK_SECRET="));
  env.push(`STRIPE_WEBHOOK_SECRET=${secrets.join(",")}`);
  writeFileSync(".env.local", `${env.join("\n").replace(/\n+$/, "")}\n`);
  console.log(`PASS STRIPE_WEBHOOK_SECRET saved to .env.local (${secrets.join(",").length} chars)`);
  console.log("Next: npm run vercel:env -- --app-url " + appUrl + " --only STRIPE_WEBHOOK_SECRET && vercel deploy --prod");
}

main().catch((err) => {
  console.error(`FAIL ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
});
