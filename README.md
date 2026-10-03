# PortCall

**A one-person import team gets 3 drayage quotes in 2 minutes without making a single phone call, and the agent books and pays before late fees hit.**

Agents can't pick up a phone, and freight still runs on phone calls and email: 84% of freight forwarders still get quotes that way and 78% still book that way ([Container xChange and Copenhagen Business School survey, Nov 2022](https://www.insidelogistics.ca/digitization/phone-and-email-still-most-common-way-to-make-a-freight-booking-183672/)). PortCall gives agents a phone line to the freight world: an MCP server that dials your own trucking providers in parallel with a voice agent, pulls the quote out of the conversation as it happens, ranks the offers on risk-adjusted cost, and books and pays inside a spending guardrail.

Built for the Supabase Select Hackathon (theme: build something agents want).

- **Live app:** https://portcall-three.vercel.app
- **Judge login:** `judge@portcall.dev` / `portcall-judge-2026` (there is also a "Fill judge login" button on the sign-in page)
- **MCP endpoint:** `https://portcall-three.vercel.app/api/mcp` with `Authorization: Bearer <key from Settings > Agent access>`

All data is synthetic: fictional importer, carriers, rates and addresses. Stripe runs in test mode only.

**Replay and live:** outside our stage demo the app runs in replay mode, so judges never ring a real phone: recorded dispatcher answers go through the real webhook, and extraction (Claude), ranking (Claude), Realtime, Stripe booking, the Resend tender email and capture on delivery all run for real. Live mode (`CALL_MODE=live`) places the same three calls through Vapi.

## How it works

1. **The importer's board** lists inbound containers with ETA, last free day (LFD), destination DC and deliver-by date. Every box shows a live countdown to its LFD and a journey track from ship to door.
2. **Quoting starts** three ways: the Get quotes button, an outside agent calling `request_quotes` over MCP, or automatically when a box is N days from arrival (pg_cron inside Supabase).
3. **PortCall calls every provider that serves the lane, all at once** (two, three or eight; three in the demo), through Vapi. The voice agent says it is an AI in its first sentence, gets linehaul, fuel, chassis, extra fees, earliest pickup and whether they can make the deliver-by date, reads the numbers back, and hangs up. Providers that don't serve the lane are shown as "not called".
4. **The Call Wall** streams every call live from Supabase Realtime: ringing and live status, a waveform that moves only while that side is talking, the transcript, and quote fields that stamp in the moment they are spoken, each linked back to the transcript line it came from.
5. **Claude ranks the quotes** on risk-adjusted cost (all-in rate plus estimated demurrage if pickup lands after the LFD) and explains the call in plain English. Cheapest is not always best.
6. **Booking**: a human clicks Book, the agent books over MCP, or PortCall auto-books when the winner is under the importer's limit. Stripe authorizes the importer's saved card with the payout routed to the provider's Stripe Connect account and a platform fee. Agent and auto bookings above the limit are rejected server-side with "needs human approval".
7. **Tender email** (Resend) goes to the provider with a one-tap Accept link. The provider's phone page has Accept, then Picked up, then Delivered. **Delivered captures the payment.**

Freight mapping: the tender email is an EDI 204, Accept is the 990, pickup and delivery are 214s, capture on delivery is the 210. Voice comes first because that is where carriers already are.

## Architecture

```
 Claude / any MCP client          Importer (browser)                 Provider (phone)
          |                              |                                  |
     /api/mcp (mcp-handler)      Next.js App Router on Vercel        /tender/[token]
          |                              |                                  |
          +------------> lib/quotes/request.ts <---- pg_cron + pg_net (auto trigger)
                                 |
                     Vapi create-call x3 (live)  or  fixture replay (CALL_MODE=replay)
                                 |
                       /api/vapi/webhook  (status, speech, transcript, end-of-call)
                                 |
            Claude via AI Gateway: live extraction (Haiku 4.5) -> ranking (Sonnet 5.5)
                                 |
              lib/book.ts: Stripe PaymentIntent (manual capture, destination charge)
                                 |
                    Resend tender email -> accept -> picked up -> delivered -> capture
                                 |
        Supabase Postgres (RLS) --Realtime--> Call Wall, board, payment stamps, timeline
```

Every arrow that changes state writes to Supabase first; the UI only animates what Realtime delivers.

## Supabase features used

| Feature | What it does here |
|---|---|
| **Postgres** | 10 tables: importers, providers, containers, quote_requests, calls, transcript_lines, quotes, recommendations, bookings, events |
| **Row Level Security** | On every table. Importers read only their own rows through ownership helpers in a private (non-exposed) schema; webhooks and server routes write with the service role |
| **Realtime** | `postgres_changes` on 8 tables drives the Call Wall: status pills, waveform, transcript, field stamps, ranking reveal, AUTHORIZED/PAID stamps and the timeline, all RLS-scoped |
| **Auth** | Cookie sessions (`@supabase/ssr`) for the console, judge account seeded |
| **pg_cron + pg_net** | `portcall-autoquote` runs every minute inside the database and POSTs to the app for containers inside their auto-quote window; URL and secret live in Supabase Vault |
| **Vault** | Holds the app URL and internal secret the cron job uses |

## The agent interface (MCP)

`/api/mcp` is a Streamable HTTP MCP server built with Vercel's `mcp-handler` 2.x. Auth is `Authorization: Bearer <importers.mcp_api_key>`.

| Tool | Does |
|---|---|
| `list_containers({ status? })` | Containers with ETA, LFD, destination, status |
| `request_quotes({ container_id })` | Starts the calls, returns `quote_request_id` |
| `get_quotes({ container_id })` | Quotes, recommendation and call statuses, with a `next_step` hint for polling |
| `book_quote({ quote_id })` | Books and pays inside the guardrail, or returns "needs human approval" |
| `get_container_status({ container_id })` | The timeline |

`container_id` accepts the uuid or the box number (`PHGU4829137` or `PHGU 482913-7`).

Claude Desktop / claude.ai custom connector config:

```json
{ "mcpServers": { "portcall": { "url": "https://portcall-three.vercel.app/api/mcp", "headers": { "Authorization": "Bearer <key>" } } } }
```

Try: *"Our container that landed in Charleston this morning needs to get to our Atlanta DC by Thursday. Get quotes, pick the cheapest reliable option, and book it if it's under our limit."*

## Replay mode

`CALL_MODE=replay` swaps the phones for three recorded dispatcher scripts (Marshgrass, Ironclad, Sweetgrass). The replay POSTs Vapi-shaped events to the real `/api/vapi/webhook` with the real secret, so extraction, Realtime, ranking, booking and payment all run for real. It exists for the test scripts and as stage insurance. The UI labels it as replay everywhere; it is never presented as a live call.

## Run it locally

```bash
npm install
cp .env.example .env.local      # fill in values, see KEYS_TODO.md
npm run seed                    # judge login, Palmetto Home Goods, 5 providers, 5 containers
npm run dev                     # http://localhost:3000
```

Database migrations are in `supabase/migrations` (`supabase db push` against a linked project).

## Verification scripts

Each prints one PASS/FAIL line per check and exits non-zero on any FAIL.

| Script | Checks |
|---|---|
| `npm run test:replay` | 3 calls end, transcripts exist, every quote has all-in and pickup, every field links to a transcript line, Marshgrass wins and Ironclad is flagged for the LFD |
| `npm run test:stripe` | Booking authorizes with the provider as transfer destination, Accept, Delivered captures, an agent booking above the limit is rejected |
| `npm run test:mcp` | All 5 MCP tools against the deployed endpoint, responses validated with zod |
| `npm run shots` | Playwright screenshots of the board, Call Wall mid-call, ranking reveal and the tender page at phone size, failing on any console error |

## Environment

See `.env.example` for every variable and `KEYS_TODO.md` for where each one comes from.

## Stack

Next.js 16 (App Router) on Vercel, Supabase (Postgres, Auth, RLS, Realtime, pg_cron, pg_net, Vault), Vapi, Claude through the Vercel AI SDK 7 and AI Gateway, Stripe Connect, Resend, mcp-handler, motion, Tailwind.

---

Every call adds rate and availability data to Supabase, so the product compounds: as voice models get better, agents negotiate harder and reach more of the carriers that only answer the phone.
