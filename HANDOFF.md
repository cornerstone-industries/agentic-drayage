# Handoff: who can take what (Oct 3, 1:25 PM PT)

Read in this order: this file, then `KEYS_TODO.md` (the runbook), then `CLAUDE.md` (the build doc, with a build status section at the top).

## State

- **Built:** every route in CLAUDE.md section 12, the full call pipeline, replay mode, all integrations (Vapi, Claude via AI Gateway, Stripe Connect, Resend, MCP, pg_cron), verification scripts, README draft.
- **Verified locally** (local Supabase stack, DEV ONLY fixture AI, no third-party keys): `npm run build`, `npm run lint`, `npx tsc --noEmit` clean; `npm run test:replay` all PASS; `npm run test:mcp` all PASS except `book_quote` (needs Stripe); Call Wall, ranking reveal, settings, tender page and phone layouts reviewed in a browser.
- **Not verified yet** (needs keys): real Claude extraction/ranking, real Vapi calls, Stripe, Resend, the hosted deploy.
- **Supabase:** project `portcall`, Cornerstone org, ref `apbvdeghnqrvagjdscog`. Migrations applied. Not seeded until someone adds `SUPABASE_SERVICE_ROLE_KEY` (KEYS_TODO section 1).
- **Local dev trick:** `.env.development.local` (gitignored, may exist on Will's machine) points `next dev` at a local Supabase stack on ports 5442x. Delete it to use the hosted project.

## Divide and conquer

Each lane is independent once section 1 (service role key + seed) and section 2 (Vercel deploy) of KEYS_TODO are done. Do those two first, together, about 10 minutes.

| Lane | Owner | Steps (KEYS_TODO section) | Done when |
|---|---|---|---|
| A. Deploy + AI | Will | 1, 2, 3 | prod `/login` returns 200 and `CALL_MODE=replay npm run test:replay` passes against prod with real Claude |
| B. Phones | Ben | 4 | a real call to a teammate's phone streams onto the Call Wall; then all 3 teammates run the dispatcher scripts in CLAUDE.md section 15 (Sweetgrass must say "fuel 19% on top") |
| C. Money | Will | 5, 6 | `npm run test:stripe` passes and the tender email with Accept lands in the inbox |
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
