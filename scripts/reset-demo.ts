// Puts the scripted demo container (PHGU4829137) back to "inbound" and deletes everything a quote run
// left on it (quote requests, calls, transcripts, quotes, recommendations, bookings, events), so the
// next "Get quotes" starts clean. Stripe objects from earlier bookings are not touched.
//
//   npm run demo:reset      (reads .env.local, then .env; needs SUPABASE_SERVICE_ROLE_KEY)
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { connectAdmin, resetDemoContainer, runScript } from "./lib/demo";

void runScript(async (r) => {
  const db = await r.run("supabase", () => connectAdmin(), "service role connected");
  if (!db) return;

  const reset = await r.run("demo-container", () => resetDemoContainer(db), ({ container }) => `${container.container_number} ${container.id}`);
  if (!reset) return;

  const { removed } = reset;
  r.pass(
    "cleared",
    `${removed.quote_requests} quote requests, ${removed.quotes} quotes, ${removed.recommendations} recommendations, ${removed.bookings} bookings, ${removed.events} events`,
  );
  r.pass("status", `${reset.container.container_number} is ${reset.container.status}`);
});
