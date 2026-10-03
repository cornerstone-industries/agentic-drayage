# Handoff: who can take what (updated Oct 3, 2:00 PM PT)

Read in this order: this file, then `KEYS_TODO.md` (the runbook), then `CLAUDE.md` (the build doc, with a build status section at the top).

## State

**Live: https://portcall-three.vercel.app** (Vercel project `portcall`, Cornerstone team; pushes to main auto-deploy). Judge login `judge@portcall.dev` / `portcall-judge-2026`.

Verified on production:
- Supabase seeded; judge login works; RLS (judge sees 5 boxes, anon sees 0).
- Claude via AI Gateway: `CALL_MODE=replay npm run test:replay` all PASS (Haiku extracts, Sonnet ranks, Marshgrass wins).
- Stripe sandbox "PortCall" (inside Cornerstone's Stripe): card on file, 3 carriers onboarded via API, both webhooks created; `npm run test:stripe` all PASS (authorize, accept, picked up, delivered captures, agent over limit rejected).
- Resend: tender email lands in lammerswill33@gmail.com (onboarding@resend.dev can only mail the account owner).
- MCP: `npm run test:mcp` all PASS against prod.

Left: **Vapi live calls (Ben)**, then rehearsal, video, screenshots, README URL, repo public, submit.

Production still runs `CALL_MODE=replay` until Vapi is set up. Every `.env.local` key is on Vercel; `vercel env pull .env.local` gets them.

## Divide and conquer

Each lane is independent once section 1 (service role key + seed) and section 2 (Vercel deploy) of KEYS_TODO are done. Do those two first, together, about 10 minutes.

| Lane | Owner | Steps (KEYS_TODO section) | Done when |
|---|---|---|---|
| A. Deploy + AI | Will | 1, 2, 3 | DONE |
| B. Phones | Ben | 4 | a real call to a teammate's phone streams onto the Call Wall; then all 3 teammates run the dispatcher scripts in CLAUDE.md section 15 (Sweetgrass must say "fuel 19% on top") |
| C. Money | Will | 5, 6 | DONE |
| D. Agent demo | Ben | 7 | `npm run test:mcp` passes against prod and Claude Code runs the stage prompt end to end |
| E. Submission | both | 8 | screenshots, 60 to 90 s backup video (replay mode is fine, say so), README `APP_URL_HERE` filled, repo public, submitted by 4:45 |

## Code map

| Area | Files |
|---|---|
| Quote run start (button, MCP, cron share it) | `lib/quotes/request.ts`, `app/api/quotes/request/route.ts` |
| Vapi webhook to Supabase rows | `lib/vapi/webhook.ts`, `app/api/vapi/webhook/route.ts` |
| Extraction, ranking, auto-book | `lib/pipeline.ts`, `lib/ai/claude.ts` (real), `lib/ai/fixture.ts` (DEV ONLY) |
| Replay scripts and runner | `lib/replay/script.ts`, `lib/replay/run.ts` |
| Vapi assistant + calls | `lib/vapi/assistant-config.ts`, `lib/vapi/client.ts`, `scripts/setup-vapi.ts` |
| Booking, tender, payments | `lib/book.ts`, `lib/tender.ts`, `lib/tender-email.ts`, `lib/stripe.ts`, `app/api/book`, `app/api/tender`, `app/api/stripe/*` |
| MCP | `lib/mcp/tools.ts`, `lib/mcp/schemas.ts`, `app/api/mcp/route.ts` |
| Call Wall UI (Realtime) | `components/callwall/*`, `lib/live/snapshot.ts`, `lib/supabase/realtime.ts` |
| Board, settings, tender page, landing | `components/dashboard`, `components/settings`, `components/tender`, `components/landing` |
| Money and dates | `lib/money.ts`, `lib/dates.ts` |
| Database | `supabase/migrations/*` (keep file names equal to the applied versions) |

## Rules that bit us (keep them)

- Realtime channels must call `authorizeRealtime()` before subscribing, or a cold page load joins as anon and RLS drops every event.
- Never present replay as a live call; the UI labels it. `DEV_ONLY_FIXTURE_AI` never goes to production (`npm run vercel:env` forces it false).
- Stripe test keys only; the code refuses `sk_live_`.
- Before a rehearsal: `npm run demo:reset` or the "Reset this box" button on the container page.
- After the event: set `CALL_MODE=replay` and redeploy so judges never ring a teammate's phone.
