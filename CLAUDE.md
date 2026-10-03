# PortCall: Master Build Doc (Supabase Select Hackathon, Oct 3 2026)

Read this whole file before writing code. It is the source of truth for scope, design, and order of work. Working name is PortCall (a ship's "port call" + phone calls). Rename freely.

**Repo:** https://github.com/cornerstone-industries/agentic-drayage (must be public at submission)

---

## Build status (updated Oct 3, 1:15 PM PT)

- Supabase project **portcall** in the Cornerstone org, ref `apbvdeghnqrvagjdscog` (us-east-1). Migrations in `supabase/migrations` are applied there (schema + RLS + Realtime, pg_cron auto-quote job, RLS helpers in a private schema). Supabase Realtime drives every live surface.
- Everything is built; only keys are missing. Start with `HANDOFF.md` (who takes what), then `KEYS_TODO.md`, the runbook: each key, where to get it, the env var, and the exact command to run after adding it.
- Verified against a local Supabase stack with the DEV ONLY fixture AI: `npm run build`, `npm run lint`, `npx tsc --noEmit`, `npm run test:replay` (all PASS) and `npm run test:mcp` (all PASS except `book_quote`, which needs Stripe keys).
- Current API facts that differ from this doc: AI SDK 7 prefers `generateText({ output: Output.object(...) })` (generateObject is deprecated); gateway slugs are `anthropic/claude-haiku-4.5` (extraction) and `anthropic/claude-sonnet-5.5` (ranking); `mcp-handler` 2.x uses `server.registerTool` and Streamable HTTP only; Vapi's webhook config is `server: { url, headers }` (no `serverUrl`), `transcript` must be listed in `serverMessages`, POST /call has no top-level `metadata`, and free Vapi numbers cannot dial out (import a Twilio number).

## 0. Hard constraints

- **Submission closes 5:30 PM PT. It does not move.** Submit by 4:45 PM, keep editing until 5:30. Top teams demo at 6:15 PM.
- Theme: **"build something agents want."** The agent is our user.
- Judging (1 to 5 each): **Innovation**, **Functionality** (real auth, real data, not mockups), **UX/Design** (polished, creative, unique), **Impact**.
- Must meaningfully use Supabase. No sensitive personal data.
- **All data is synthetic.** Nothing from any employer, no real company rates. Fictional carrier and importer names only.
- Stripe in **test mode only**. Secrets only in env vars, never in the repo.
- Repo must be public at submission. App must be live on Vercel with a working judge login.

## 1. North star (every feature must serve these)

1. **Value:** "A one-person import team gets 3 drayage quotes in 2 minutes without making a single phone call, and the agent books and pays before late fees hit." If a feature doesn't make that sentence more real, cut it.
2. **Scales with intelligence:** smarter voice agents negotiate better and reach more carriers; every call adds rate and availability data to Supabase, so the product compounds as models improve.

Stage line: **"Agents can't pick up a phone, and freight still runs on phone calls: 84% of freight forwarders still get quotes by phone and email. We give agents a phone line to the freight world."** (Source: Container xChange and Copenhagen Business School survey of 137 forwarders, Nov 2022, https://www.insidelogistics.ca/digitization/phone-and-email-still-most-common-way-to-make-a-freight-booking-183672/. The old "half of freight" line had no source; don't use it.)

## 2. The product in one flow

1. Importer dashboard shows inbound containers: container #, terminal, ETA, last free day (LFD), destination DC, deliver-by date.
2. Trigger quoting: **"Get quotes" button**, or **automatically** when a container is X days from arrival, or **an outside agent via MCP**.
3. PortCall places **3 parallel phone calls** (Vapi) to the importer's own drayage providers.
4. **Live call wall:** 3 call cards stream the transcript in real time; quote fields (rate, fuel, chassis, earliest pickup, can-meet-deadline, extra fees) **light up the moment they are spoken**, each linked to the transcript line it came from.
5. Calls end. **Claude ranks the quotes on risk-adjusted cost** (all-in rate + projected demurrage if pickup is after LFD) and explains why. Cheapest is not always best.
6. **Book:** human clicks Book, or it auto-books under the importer's limit, or an agent books via MCP. Stripe authorizes the importer's saved card with the payout routed to the provider's Stripe Connect account (we take a platform fee).
7. **Tender email** (Resend) goes to the provider with container details and a one-tap Accept link. Accept = booked. Provider marks Picked up, then Delivered. **Delivered captures the payment.**
8. Every step streams to a live container timeline via Supabase Realtime.

Industry mapping (say this to show we know freight): tender email = EDI 204, Accept = 990, status updates = 214, payment capture on delivery = 210. EDI/API integrations come later; voice first.

## 3. Stack

| Layer | Choice |
|---|---|
| App | Next.js App Router + TypeScript + Tailwind, deployed on Vercel. Start from the official Next.js + Supabase starter (cookie auth). |
| Data | Supabase: Postgres, Auth, RLS, Realtime, pg_cron (+ pg_net) for the auto trigger |
| Voice calls | **Vapi** outbound calls (Twilio or Vapi phone number). Assistant LLM: the fastest Claude model Vapi lists. |
| LLM (extraction + ranking) | Claude via **Vercel AI SDK + AI Gateway** (`generateObject` with zod). Use a fast Claude model for live extraction, a stronger one for the recommendation. Verify current model slugs in the AI Gateway model list. |
| Payments | **Stripe**: Checkout (setup mode) for importer card, **Connect Express** for providers, PaymentIntents with manual capture + destination payout + application fee |
| Email | **Resend** |
| Agent interface | **MCP server** as a Next.js route (use Vercel's `mcp-handler` package; verify current name and API in docs) |
| Motion | `motion` (Framer Motion) |

Always check current official docs for Vapi, Stripe, Resend, AI SDK, and mcp-handler before writing integration code. Field names below are best-known; verify them.

## 4. Data model (Supabase SQL)

Create as a migration. Enable RLS on every table. Importer owner can read their own rows; webhooks and server routes write with the service role.

```sql
create extension if not exists pgcrypto;

create table importers (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid references auth.users(id),
  name text not null,
  stripe_customer_id text,
  default_payment_method_id text,
  auto_book_limit_cents int not null default 150000,
  auto_quote_days_before_eta int not null default 3,
  mcp_api_key text unique default encode(gen_random_bytes(24),'hex'),
  created_at timestamptz default now()
);

create table providers (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  name text not null,
  contact_name text,
  phone text not null,
  email text not null,
  ports text[] default '{Charleston}',
  stripe_account_id text,
  stripe_onboarded boolean default false,
  created_at timestamptz default now()
);

create table containers (
  id uuid primary key default gen_random_uuid(),
  importer_id uuid references importers(id) on delete cascade,
  container_number text not null,
  size text default '40HC',
  port text default 'Charleston',
  terminal text,
  vessel text,
  eta timestamptz,
  last_free_day date,
  destination_name text,
  destination_address text,
  deliver_by date,
  status text default 'inbound' check (status in
    ('inbound','quoting','quoted','booked','accepted','picked_up','delivered')),
  created_at timestamptz default now()
);

create table quote_requests (
  id uuid primary key default gen_random_uuid(),
  container_id uuid references containers(id) on delete cascade,
  triggered_by text check (triggered_by in ('button','auto','agent')),
  status text default 'calling' check (status in ('calling','complete','failed')),
  created_at timestamptz default now(),
  completed_at timestamptz
);

create table calls (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid references quote_requests(id) on delete cascade,
  provider_id uuid references providers(id),
  vapi_call_id text unique,
  status text default 'queued' check (status in
    ('queued','ringing','in_progress','ended','failed','no_answer')),
  speaking text check (speaking in ('assistant','user')),
  started_at timestamptz,
  ended_at timestamptz,
  recording_url text,
  summary text
);

create table transcript_lines (
  id bigserial primary key,
  call_id uuid references calls(id) on delete cascade,
  role text check (role in ('assistant','user')),
  text text not null,
  created_at timestamptz default now()
);

create table quotes (
  id uuid primary key default gen_random_uuid(),
  call_id uuid unique references calls(id) on delete cascade,
  provider_id uuid references providers(id),
  container_id uuid references containers(id),
  linehaul_cents int,
  fuel_surcharge_cents int,
  chassis_per_day_cents int,
  est_chassis_days int,
  accessorials jsonb default '[]',      -- [{name, cents}]
  all_in_cents int,
  earliest_pickup date,
  can_meet_deadline boolean,
  projected_demurrage_cents int,        -- computed: days past LFD * DEMURRAGE_PER_DAY
  risk_adjusted_cents int,
  notes text,
  field_sources jsonb default '{}',     -- {field_name: transcript_line_id} for highlight linking
  updated_at timestamptz default now()
);

create table recommendations (
  id uuid primary key default gen_random_uuid(),
  quote_request_id uuid references quote_requests(id) on delete cascade,
  container_id uuid references containers(id),
  ranked_quote_ids uuid[],
  winner_quote_id uuid references quotes(id),
  reasoning text,
  created_at timestamptz default now()
);

create table bookings (
  id uuid primary key default gen_random_uuid(),
  container_id uuid references containers(id),
  quote_id uuid references quotes(id),
  provider_id uuid references providers(id),
  amount_cents int not null,
  platform_fee_cents int not null,
  stripe_payment_intent_id text,
  payment_status text check (payment_status in ('authorized','captured','canceled','failed')),
  tender_token text unique default encode(gen_random_bytes(16),'hex'),
  tender_status text default 'sent' check (tender_status in ('sent','accepted','declined')),
  booked_by text check (booked_by in ('human','agent','auto')),
  created_at timestamptz default now(),
  accepted_at timestamptz
);

create table events (
  id bigserial primary key,
  container_id uuid references containers(id) on delete cascade,
  type text not null,      -- quote_requested, call_started, field_heard, call_ended, recommended, booked, payment_authorized, tender_sent, accepted, picked_up, delivered, payment_captured
  payload jsonb default '{}',
  created_at timestamptz default now()
);

alter publication supabase_realtime add table
  containers, calls, transcript_lines, quotes, recommendations, bookings, events;
```

## 5. Seed data (fictional, Charleston-flavored)

Importer: **Palmetto Home Goods** (small importer, one logistics coordinator). DCs: Fairburn, GA (Atlanta area) and Charlotte, NC.

Containers (use invented owner codes; format is 4 letters + 7 digits):
- `PHGU 482913-7`, 40HC, Wando Welch Terminal, ETA in 2 days, LFD = ETA + 4 days, deliver to Fairburn, GA by ETA + 5 days. **This is the demo container.**
- 3 to 4 more at various stages (one delivered, one booked, one 6 days out) so the dashboard looks alive.

Providers (fictional; phones = teammates' phones for the demo):
- **Marshgrass Drayage**
- **Ironclad Intermodal**
- **Sweetgrass Transport**
- 2 more with no phone answering (shown as "not called: lane not served")

Demurrage assumption for risk math: `DEMURRAGE_PER_DAY_CENTS` env (e.g. 17500), labeled "estimated" in the UI.

## 6. Voice calls (Vapi)

**Assistant config** (create once via Vapi API or dashboard, store ID in env):
- Model: fastest Claude model available in Vapi. Low-latency voice, natural pacing.
- `serverUrl` -> `${APP_URL}/api/vapi/webhook` with a secret. Enable server messages: `status-update`, `transcript`, `speech-update`, `end-of-call-report`.
- Max duration about 3 minutes.

**System prompt for the calling agent** (template variables filled per call via `assistantOverrides.variableValues`):

```
You are PortCall, an AI assistant calling {{providerName}} on behalf of {{importerName}} to get a drayage quote. Say you are an AI assistant in your first sentence.

Load: one {{size}} container, number {{containerNumber}}, discharging at {{terminal}}, Port of Charleston, ETA {{eta}}. Last free day is {{lastFreeDay}}. Deliver to {{destination}} by {{deliverBy}}.

Get, in a natural conversation:
1. Linehaul rate
2. Fuel surcharge (percent or dollars)
3. Chassis cost per day and expected chassis days
4. Any other fees (pre-pull, storage, overweight, wait time)
5. Earliest pickup date
6. Whether they can deliver by {{deliverBy}}

Read the numbers back to confirm. Do not commit to booking; say "we'll confirm by email shortly." Be brief, friendly, and professional, like an experienced logistics coordinator. Keep the call under 90 seconds. Thank them and end the call.
```

**Placing calls:** `POST /api/quotes/request { containerId, triggeredBy }` creates a `quote_request`, one `calls` row per provider, then calls Vapi's create-call API in parallel (`assistantId`, `phoneNumberId`, `customer.number`, `assistantOverrides.variableValues`, `metadata: { callId }`). Store `vapi_call_id`.

**Webhook** `POST /api/vapi/webhook` (verify secret, respond fast):
- `status-update` -> update `calls.status`, timestamps, insert `events`.
- `speech-update` -> set `calls.speaking` (drives the live waveform).
- `transcript` -> store **final** lines only in `transcript_lines`. For user (dispatcher) lines, trigger **live extraction** (below), debounced about 800ms per call.
- `end-of-call-report` -> save recording URL + summary, run a final extraction pass on the full transcript, mark call ended. When all calls in the request have ended (or 3 min timeout), run the **recommendation**.

**Live extraction** (`lib/extract.ts`): `generateObject` with a zod schema of the quote fields + `field_sources` (which transcript line id produced each field). Input: full transcript so far with line ids. Upsert into `quotes`. Compute `all_in_cents`, `projected_demurrage_cents`, `risk_adjusted_cents` in code, not in the LLM. Insert a `field_heard` event per newly filled field (drives the stamp animation).

**Recommendation** (`lib/recommend.ts`): stronger Claude model, `generateObject` -> ranked quote ids, winner, 2 to 3 sentence reasoning in plain English ("Ironclad is $55 cheaper but can't pick up until after the last free day; 2 days of demurrage makes it $295 more expensive"). If winner's all-in is under `auto_book_limit_cents` and auto-book is on, book immediately (`booked_by = 'auto'`).

## 7. Stripe (test mode)

- **Importer card:** Checkout Session `mode: 'setup'` with a Stripe Customer; on success save `stripe_customer_id` + `default_payment_method_id`. Pre-do this for the demo importer.
- **Providers:** Connect **Express** accounts. Settings page has "Invite provider" that generates an Account Link (hosted onboarding). **Pre-create and fully onboard the 3 demo providers in test mode before the demo.**
- **Booking** (`lib/book.ts`, shared by the Book button, auto-book, and MCP):
  - PaymentIntent: `amount = all_in_cents`, `currency: 'usd'`, `customer`, `payment_method`, `off_session: true`, `confirm: true`, `capture_method: 'manual'`, `transfer_data.destination = provider.stripe_account_id`, `application_fee_amount = platform fee (e.g. 3%)`.
  - Insert `bookings` (`payment_status: 'authorized'`), event `payment_authorized`, send tender email.
  - Enforce the guardrail server-side: agent/auto bookings above `auto_book_limit_cents` are rejected with a clear error ("needs human approval").
- **Capture** when the provider marks Delivered. Cancel the PaymentIntent if the provider declines.
- `POST /api/stripe/webhook` verifies signature, mirrors payment status, inserts events.

## 8. Tender email + provider page

- Resend email to the provider: subject `Tender: PHGU 482913-7, Wando Welch -> Fairburn GA, $X`. Body: container, size, terminal, LFD, pickup window, delivery address, deliver-by, agreed rate breakdown, big **Accept** button -> `${APP_URL}/tender/[token]`.
- Resend's default sender can only email your own account address. For the demo either verify a domain you own or send all tender emails to the team's own inbox.
- `/tender/[token]`: **mobile-first** public page (token is the auth). Accept / Decline, then after accept: "Picked up" and "Delivered" buttons. Each updates `bookings`/`containers` + inserts events. Delivered triggers capture. This page is shown on a phone on stage.

## 9. MCP server (the "agents want" part)

Route: `/api/mcp` via `mcp-handler`. Auth: `Authorization: Bearer <importers.mcp_api_key>`.

Tools (clear descriptions, typed inputs, structured JSON outputs, helpful errors):
- `list_containers({ status? })` -> containers with ETA, LFD, destination, status
- `request_quotes({ container_id })` -> starts the calls, returns `quote_request_id`
- `get_quotes({ container_id })` -> quotes + recommendation + call statuses (agent can poll)
- `book_quote({ quote_id })` -> books and pays within the guardrail, returns booking + payment status
- `get_container_status({ container_id })` -> timeline events

Demo: connect Claude (Claude Desktop/Claude.ai custom connector or Claude Code) to `/api/mcp` and say: "Container PHGU4829137 lands in Charleston in 2 days. Get it to our Atlanta DC by Friday, cheapest reliable option, book it if it's under our limit."

## 10. Auto trigger

pg_cron job every minute: containers where `eta <= now() + importer.auto_quote_days_before_eta` and no quote_request -> `net.http_post` to `/api/quotes/request` with `triggeredBy: 'auto'` and an internal secret. Dashboard toggle "Auto-quote X days before arrival". **Stretch: first thing cut if behind.**

## 11. Design direction (judges explicitly reward creative, unique, animated)

**Concept: "Port control room at night."** Dark, cinematic, industrial, alive. It should feel like an air traffic control console for freight, not a SaaS dashboard. If a frontend-design skill or plugin is available, load it before any UI work.

**Do not ship:** default shadcn look, purple/blue gradients, generic card grids, Inter-everywhere, stock dashboard charts.

**Palette (CSS variables):**
- `--ink #0A0E13` background, `--panel #10161E`, `--line #1C2733`
- `--sodium #FFB020` (port sodium-vapor lights; primary accent)
- `--signal #2EE6C5` (live/active, "heard" fields)
- `--alarm #FF4D4D` (LFD risk, demurrage)
- `--text #E6EDF3`, `--muted #7D8B99`
- Subtle film grain + faint grid/scanline overlay on the background.

**Type:** wide industrial display for headings (e.g. Archivo at expanded width, heavy weight), monospace for all data, container numbers, and money (e.g. JetBrains Mono or IBM Plex Mono). Container numbers always mono, letter-spaced, like they're stenciled on steel.

**Signature moments (build these, in priority order):**
1. **The Call Wall** (hero of the demo): 3 tall call cards side by side, like radio channels. Each has: provider name, live status pill (Ringing pulses, Live glows teal), a waveform that animates when that side is speaking (from `speech-update`), a scrolling transcript ticker, and a quote field stack. When a field is extracted it **stamps in** (scale + slight rotate + sodium flash, like a shipping stamp) and the transcript line it came from **highlights** with a connecting glow.
2. **Split-flap numbers:** rates and all-in totals roll in like a Solari departure board when they change.
3. **The ranking reveal:** when calls end, cards re-sort with spring layout animation; the winner gets a sodium glow ring; Claude's reasoning types out beneath; losers show why ("misses LFD: +$350 demurrage" in alarm red).
4. **LFD demurrage meter:** each container shows a countdown to last free day and a meter that fills toward red, with "$/day at risk" ticking.
5. **Container journey track:** a stylized ISO container block moving along a track: At sea -> Discharged -> Quoted -> Booked -> Picked up -> Delivered, each step lighting up live from `events`.
6. **Payment moment:** "AUTHORIZED" then "PAID" stamp animation tied to Stripe status; small Stripe badge.
7. Phone-sized tender page with the same aesthetic.

**Motion rules:** `motion` layout animations and springs, staggered entrances, nothing over 600ms except the reasoning typewriter. Respect `prefers-reduced-motion`. Every animation should be driven by real Realtime data, never faked timers.

## 12. Routes

- `/` landing: one-line pitch, "Open live demo", animated hero (call wall preview)
- `/login` Supabase Auth (judge account: create `judge@...` with a password, put it in the README and submission)
- `/dashboard` containers list + LFD meters + journey tracks
- `/containers/[id]` the Call Wall, ranking, Book button, timeline
- `/settings` guardrail limit, auto-quote toggle, payment method (Stripe setup), providers + invite to Stripe
- `/tender/[token]` provider mobile page
- `/api/quotes/request`, `/api/vapi/webhook`, `/api/stripe/webhook`, `/api/book`, `/api/mcp`, `/api/cron/autoquote`

## 13. Env vars

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
AI_GATEWAY_API_KEY=
VAPI_API_KEY=
VAPI_ASSISTANT_ID=
VAPI_PHONE_NUMBER_ID=
VAPI_WEBHOOK_SECRET=
STRIPE_SECRET_KEY=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=
STRIPE_WEBHOOK_SECRET=
RESEND_API_KEY=
TENDER_FROM_EMAIL=
APP_URL=
INTERNAL_CRON_SECRET=
DEMURRAGE_PER_DAY_CENTS=17500
PLATFORM_FEE_BPS=300
CALL_MODE=live            # live | replay
DEMO_MCP_API_KEY=
```

**`CALL_MODE=replay`**: instead of calling Vapi, `/api/quotes/request` replays fixture webhook events (3 calls, realistic timing, the dispatcher scripts in section 15) through the **same** `/api/vapi/webhook` handler, so extraction, Realtime, ranking, and booking all run for real. Used by the test scripts and as stage insurance if phones or venue wifi fail. Never present replay as a live call.

## 14. Build order with checkpoints (deploy to Vercel FIRST so webhooks have a public URL)

| By | Checkpoint |
|---|---|
| 12:45 | Starter deployed on Vercel, Supabase migration + seed, login works, dashboard lists containers (unstyled is fine) |
| 2:00 | **One real Vapi call end to end**: button -> phone rings -> transcript lines appear live on screen via Realtime |
| 3:00 | Live extraction + field stamping, 3 parallel calls, recommendation with reasoning |
| 3:45 | Stripe booking (authorize -> tender email -> accept page -> delivered -> capture) |
| 4:15 | MCP tools working from Claude; design polish pass on Call Wall + ranking reveal |
| 4:30 | Record backup demo video, screenshots, README |
| 4:45 | **Submit.** Keep polishing until 5:30 |

**Cut order if behind:** auto trigger -> journey track -> split-flap -> provider invite flow (keep pre-onboarded). **Never cut:** live call wall, extraction, recommendation, Stripe booking, MCP.

## 14b. Verification scripts (build these early; every goal below depends on them)

All scripts print one `PASS`/`FAIL` line per check and exit non-zero on any FAIL.

- `npm run test:replay`: with `CALL_MODE=replay`, triggers quotes for the demo container against the deployed app, waits, then checks: 3 calls ended; each call has transcript lines; each quote has `all_in_cents` and `earliest_pickup`; every filled field has a `field_sources` transcript line id; a recommendation exists and the winner is Marshgrass (Ironclad flagged for LFD).
- `npm run test:stripe`: books the winning quote; checks PaymentIntent is `requires_capture` with the provider as transfer destination; hits the tender Accept endpoint and checks `tender_status = accepted`; marks Delivered and checks the PaymentIntent is `succeeded`; attempts an agent booking above the limit and checks it is rejected with "needs human approval".
- `npm run test:mcp`: connects to the deployed `/api/mcp` with `DEMO_MCP_API_KEY`, calls all 5 tools in order (replay mode), validates each response against its zod schema.
- `npm run shots`: Playwright captures `/dashboard`, the Call Wall mid-call, the ranking reveal, and `/tender/[token]` at phone size, and fails on any console error. Screenshots go to `/screenshots` for human review and the submission.

## 14c. How to run this autonomously (`/goal`, one per checkpoint)

Use one `/goal` per checkpoint, never one giant goal. Pair with auto mode. Confirm current `/goal` and auto mode flag names in the live Claude Code docs. Cap each goal at the time noted; if the same command fails the same way 3 times in a row, stop and report instead of retrying.

1. **Foundation (cap 40 min):** `/goal npm run build exits 0, the migration applies with all 10 public tables listed in the output, the seed script prints "seeded: 1 importer, 5 providers, 5 containers", and curl on the production Vercel URL /login prints 200`
2. **Call pipeline (cap 60 min):** `/goal npm run test:replay exits 0 with every check printing PASS`
   Then a human does one real Vapi call to a teammate's phone before moving on.
3. **Booking (cap 45 min):** `/goal npm run test:stripe exits 0 with every check printing PASS`
4. **Agent interface (cap 30 min):** `/goal npm run test:mcp exits 0 with all 5 tools printing PASS`
5. **Design is hands-on, not a goal.** "World class" can't be checked by a script. Work the Call Wall and ranking reveal in a live session, using `npm run shots` (exits 0, zero console errors) as the floor and human review as the bar.

## 15. Demo script (90 seconds, live on stage)

1. (10s) "Small importers have one logistics person and a phone. Every container that lands means calling truckers for quotes before late fees start. Agents can't make those calls. PortCall lets them."
2. (5s) Claude, connected to our MCP: "Container lands in 2 days, get it to Atlanta by Friday, book if under our limit."
3. (35s) The Call Wall lights up: 3 teammates' phones ring, the room hears the AI calling, fields stamp in as dispatchers talk.
4. (15s) Ranking reveal: "Ironclad is cheapest but can't pick up before the last free day; demurrage makes it $295 more. Marshgrass wins." Auto-books: Stripe AUTHORIZED.
5. (15s) Teammate's phone shows the tender email -> taps Accept -> dashboard flips to Booked live. Mark Delivered -> PAID.
6. (10s) "Every call makes our rate data smarter. As models get better, agents negotiate and reach more of the carriers that only answer the phone."

**Dispatcher scripts for teammates** (these exact numbers are also the replay fixtures in `lib/replay/script.ts`):
- **Marshgrass Drayage:** $650 linehaul, fuel 18%, chassis $40/day for 2 days, pickup the day it's available, can deliver by Friday. All-in $847. (Winner)
- **Ironclad Intermodal:** $595 flat, fuel and chassis included, but earliest pickup is 2 days after LFD, so it misses the deliver-by date. $595 + $350 estimated demurrage = $945. (Cheapest trap)
- **Sweetgrass Transport:** $720 including chassis, **fuel 19% on top**, pickup on time, but $75 pre-pull fee if no terminal appointment. $720 + $136.80 + $75 = $931.80. (Accessorial curveball)

Sweetgrass must say the fuel line: without it Sweetgrass is $795 and beats Marshgrass. With these numbers the stage line is: "Ironclad is $252 cheaper on paper but can't pick up until 2 days after the last free day; $350 of estimated demurrage makes it $98 more, and it misses the deliver-by date. Marshgrass wins at $847."

## 16. Submission checklist

- [ ] Public GitHub repo with README: pitch, how it works, architecture, Supabase features used, how to run, env vars, judge login
- [ ] Live Vercel URL, judge login works
- [ ] 60 to 90 second demo video (recorded at 4:30 as backup)
- [ ] 3 to 5 screenshots: Call Wall mid-call, ranking reveal, tender phone page, MCP in Claude
- [ ] Description leads with north star #1, closes with #2
- [ ] Submit on hackathon.supabase.com by 4:45 PM
