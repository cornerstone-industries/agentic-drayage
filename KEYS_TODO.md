# Keys to-do

Everything is built. Adding keys is the only step left. Each key goes in `.env.local` (local) and in Vercel (production; `npm run vercel:env` pushes them for you). Every integration fails loudly as `X not configured: set NAME` until its key exists.

Work through the sections in order. Commands run from the repo root: `cd ~/developer/agentic-drayage`.

## 0. Status right now

| Piece | State |
|---|---|
| Supabase project `portcall` (Cornerstone org, ref `apbvdeghnqrvagjdscog`, us-east-1) | Created. 3 migrations applied (schema + RLS + Realtime, pg_cron auto-quote job, private RLS helpers). Security advisor clean. Not seeded yet (needs the service role key). |
| `.env.local` | Supabase URL + anon key, `VAPI_WEBHOOK_SECRET`, `INTERNAL_CRON_SECRET`, `CALL_MODE=replay`, `DEV_ONLY_FIXTURE_AI=true` |
| Code | Builds (`npm run build`), typechecks, and the replay pipeline + MCP pass end to end against a local Supabase stack |

## 1. Supabase service role key (unblocks everything)

- **Where:** Supabase dashboard > project `portcall` > Project Settings > API Keys > `service_role` (legacy) or a `sb_secret_...` key.
- **Env var:** `SUPABASE_SERVICE_ROLE_KEY`
- **Add it without printing it** (prints only the length):

```bash
K=$(supabase projects api-keys --project-ref apbvdeghnqrvagjdscog -o json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);const k=(Array.isArray(a)?a:a.keys||[]).find(x=>x.name==="service_role"||x.id==="service_role");process.stdout.write(k?k.api_key:"")})') && echo "SUPABASE_SERVICE_ROLE_KEY=$K" >> .env.local && echo "service_role key length: ${#K}"
```

- **Then run:**

```bash
rm -f .env.development.local      # stop pointing next dev at the local test stack
npm run seed                       # prints: seeded: 1 importer, 5 providers, 5 containers
```

Copy the `DEMO_MCP_API_KEY=...` line the seed prints into `.env.local` (it pins the MCP key across re-seeds).

## 2. Deploy to Vercel (gives webhooks a public URL)

```bash
vercel link --yes --project portcall --scope will-lammers-projects-1208c2dd
vercel deploy --prod                      # first deploy, to learn the production URL
npm run vercel:env -- --app-url https://<production-url>
vercel deploy --prod                      # redeploy with the env
curl -s -o /dev/null -w "%{http_code}\n" https://<production-url>/login     # expect 200
```

Also set `APP_URL=https://<production-url>` in `.env.local`, because the setup and test scripts read it.

Turn on the database auto-quote clock (pg_cron reads these from Supabase Vault). Run in the Supabase SQL editor (or ask me, I can run it through the Supabase MCP):

```sql
select vault.create_secret('https://<production-url>', 'portcall_app_url');
select vault.create_secret('<the INTERNAL_CRON_SECRET value from .env.local>', 'portcall_cron_secret');
```

Then flip "Auto-quote before arrival" on in Settings to watch it fire (it only picks containers with no quote request yet).

## 3. Claude through the Vercel AI Gateway

- **Where:** Vercel dashboard > Cornerstone team > AI Gateway > API Keys > Create key.
- **Env var:** `AI_GATEWAY_API_KEY`. Optional model overrides: `AI_EXTRACT_MODEL` (default `anthropic/claude-haiku-4.5`), `AI_RECOMMEND_MODEL` (default `anthropic/claude-sonnet-5.5`).
- **Set** `DEV_ONLY_FIXTURE_AI=false` in `.env.local` (production always gets false). Real Claude takes over automatically once the key exists; the "Fixture AI, dev only" badge disappears.
- **Then run** (server in replay mode, so no phones ring):

```bash
npm run vercel:env -- --app-url https://<production-url> && vercel deploy --prod
CALL_MODE=replay npm run test:replay        # 11 PASS lines; Marshgrass wins, Ironclad flagged for LFD
```

## 4. Vapi (real phone calls)

- **API key:** dashboard.vapi.ai > API Keys > Private key. Env var `VAPI_API_KEY`.
- **Phone number:** Phone Numbers > Import > Twilio (Account SID, Auth Token, the Twilio number). Free Vapi numbers are documented as inbound only, so plan on Twilio. A Twilio trial can only call verified numbers (verify the 3 teammates' phones in Twilio) and plays a trial notice first; an upgraded Twilio account avoids both. Copy the imported number's id into `VAPI_PHONE_NUMBER_ID`.
- **Webhook secret:** `VAPI_WEBHOOK_SECRET` is already generated in `.env.local`; it must be the same in Vercel (`npm run vercel:env` does that).
- **Create the assistant** (needs the public `APP_URL`; it registers `${APP_URL}/api/vapi/webhook` with the secret header):

```bash
npm run setup:vapi                 # prints VAPI_ASSISTANT_ID=...  -> paste into .env.local
```

- **Teammates' phones:** Settings > Drayage providers > edit the phone for Marshgrass, Ironclad, Sweetgrass (E.164, like `+18435550141`). Or put them in `DEMO_PROVIDER_PHONES=+1...,+1...,+1...` and re-run `npm run seed`.
- **Go live:**

```bash
# in .env.local: CALL_MODE=live
npm run vercel:env -- --app-url https://<production-url> && vercel deploy --prod
```

Then sign in as the judge, open PHGU 482913-7, press Get quotes. Phones ring, the Call Wall streams. Concurrency on a new Vapi plan is 4 lines, enough for 3 calls.

## 5. Stripe (test mode only)

- **Keys:** dashboard.stripe.com, test mode > Developers > API keys. `STRIPE_SECRET_KEY` (`sk_test_...`; live keys are refused by the code) and `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` (`pk_test_...`).
- **Enable Connect** in test mode: Dashboard > Connect > Get started (one time, platform profile can be minimal).
- **Create the demo money world** (customer with a saved test card for the importer, connected accounts for Marshgrass, Ironclad, Sweetgrass that can receive transfers):

```bash
npm run setup:stripe
```

- **Webhook:** Developers > Webhooks > Add endpoint `https://<production-url>/api/stripe/webhook`, events `payment_intent.amount_capturable_updated`, `payment_intent.succeeded`, `payment_intent.canceled`, `payment_intent.payment_failed`, `checkout.session.completed`, `account.updated` (also tick "listen to events on connected accounts" for `account.updated`). Copy the signing secret into `STRIPE_WEBHOOK_SECRET`.
- **Then run:**

```bash
npm run vercel:env -- --app-url https://<production-url> && vercel deploy --prod
npm run demo:reset && CALL_MODE=replay npm run test:replay     # needs a fresh recommendation
npm run test:stripe        # authorize -> accept -> picked up -> delivered (captured) -> agent over limit rejected
```

## 6. Resend (tender email)

- **Key:** resend.com > API Keys. Env var `RESEND_API_KEY`.
- **Sender:** `TENDER_FROM_EMAIL=PortCall <onboarding@resend.dev>` works without a domain but only delivers to the email you signed up to Resend with, so also set `TENDER_EMAIL_OVERRIDE_TO=<that email>` (every tender goes there and names the intended carrier). With a verified domain, use `TENDER_FROM_EMAIL=PortCall <dispatch@yourdomain>` and leave the override empty.
- **Then:** push env, redeploy, book once (Book button or `npm run test:stripe`) and check the inbox for the Accept button.

## 7. MCP (the agent interface)

- **Key:** `DEMO_MCP_API_KEY` (from the seed output; also shown in Settings > Agent access).
- **Then run:**

```bash
CALL_MODE=replay npm run test:mcp      # all 5 tools PASS (book_quote needs section 5 done)
```

- **Connect Claude:** claude.ai > Settings > Connectors > Add custom connector, URL `https://<production-url>/api/mcp`, header `Authorization: Bearer <DEMO_MCP_API_KEY>`. Or Claude Code: `claude mcp add --transport http portcall https://<production-url>/api/mcp --header "Authorization: Bearer <key>"`.

## 8. Screenshots and submission

```bash
CALL_MODE=replay BASE_URL=https://<production-url> npm run shots     # writes screenshots/*.png
gh repo edit cornerstone-industries/agentic-drayage --visibility public --accept-visibility-change-consequences
```

Fill `APP_URL_HERE` in README.md with the production URL.

## Order on stage

Production runs `CALL_MODE=live` for the demo. If phones or wifi fail, set `CALL_MODE=replay`, redeploy (about a minute), and say it is a replay. After the event, set `CALL_MODE=replay` again so a judge pressing Get quotes never rings a teammate's phone.

## Env var reference

| Var | From | Needed for |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase API settings (already set) | everything |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase API keys | server routes, webhooks, seed, tests |
| `AI_GATEWAY_API_KEY` | Vercel AI Gateway | Claude extraction + ranking |
| `VAPI_API_KEY`, `VAPI_PHONE_NUMBER_ID` | Vapi dashboard | live calls |
| `VAPI_ASSISTANT_ID` | `npm run setup:vapi` output | live calls |
| `VAPI_WEBHOOK_SECRET` | generated (in `.env.local`) | webhook auth (live and replay) |
| `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Stripe test API keys | booking, capture, onboarding |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook endpoint | payment status mirroring |
| `RESEND_API_KEY`, `TENDER_FROM_EMAIL`, `TENDER_EMAIL_OVERRIDE_TO` | Resend | tender email |
| `APP_URL` | Vercel production URL | webhooks, tender links, replay |
| `INTERNAL_CRON_SECRET` | generated (in `.env.local`) | pg_cron, tests |
| `DEMO_MCP_API_KEY` | seed output | MCP test, Claude connector |
| `CALL_MODE` | `live` or `replay` | calls |
| `DEV_ONLY_FIXTURE_AI` | `true` only locally before the AI key | dev only |
| `DEMURRAGE_PER_DAY_CENTS`, `PLATFORM_FEE_BPS`, `REPLAY_SPEED` | defaults 17500, 300, 1 | risk math, fee, replay pacing |
