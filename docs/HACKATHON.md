# Hackathon Notes: Supabase Select 2026

Event context and research for PortCall. The build doc is `CLAUDE.md`; this file is background only.

---

## The event

| | |
|---|---|
| **Event** | Supabase Select 2026 Hackathon, onsite at 580 20th Street, San Francisco |
| **Date** | Saturday, October 3, 2026 |
| **Building ends** | 5:30 PM PDT (00:30 UTC Oct 4). Fixed; cannot be moved by judges or admins. Submit by 4:45. Top teams demo at 6:15 PM. |
| **Prompt** | "Build something agents want." |
| **Judging (1–5 each)** | **Innovation** (original idea) · **Design** (clear and polished) · **Functionality** (it has to work) · **Impact** (solves an important, high-impact problem) |
| **Prizes** | Share of up to $100k in credits from Supabase, Vercel, Anthropic, Stripe |
| **Unconfirmed** | Judges reportedly include Supabase founders (Ant Wilson, Paul Copplestone) plus reps from Stripe, Anthropic and Vercel. |

**Rules** ([hackathon rules](https://hackathon.supabase.com/hackathon-rules))
- Must **meaningfully integrate Supabase** (database, auth, storage, edge functions or realtime) to win prizes.
- Bringing code, libraries and skeleton projects from past work is allowed.
- No sensitive personal data or health information.
- Submission: title, description, coding tools used, **public repo**, **demo link**, **screenshots**; a good demo video is strongly recommended. Show the product in screenshots before a judge opens anything.
- 18+. Supabase employees can't win. Teams keep their IP; Supabase gets a non-exclusive license for marketing and research.

## What the sponsors said they want

- **Anthropic:** build things that add value to the world, and ask "how does this scale with intelligence?" Likely rooted in Anthropic's "build for the model six months from now" advice: thin agent loop plus tools, not hard-coded pipelines. Recent Anthropic hackathon winners were domain experts with a hard before/after number (e.g. CrossBeam: CA housing permits, months → ~20 minutes).
- **Google:** build multimodal: voice and vision as the core of the experience.
- **Stripe:** agentic commerce ([shipbysundown.dev](https://shipbysundown.dev/#tools)): Payment Links, Checkout, Billing, Machine Payments Protocol (pay per request), Link agent wallet (spend limits + human approval), Stripe Projects (`stripe projects add supabase vercel …`). A plain Checkout button is weak; their showcase examples are agent-initiated, approval-gated payments.
- **Vercel:** "treat an agent as your product's user"; name the agent, the task, and the observable benefit. Deploy early. AI SDK, AI Gateway, eve, Sandbox, Workflows. Their sample ideas (memory service, retrieval API, task coordination, code sandbox, approval service) will be common.
- **Supabase:** see launches below.

## Supabase launches (Select 2026 conference, Oct 2)

From the [Select 2026 recap](https://supabase.com/blog/supabase-select-2026-recap):

- **Your app's MCP server**: let users connect their own agents to your app; the server runs as an Edge Function next to your data.
- **Supabase Compute** (private alpha, [waitlist](https://supabase.com/compute)): run web services and agents in any language next to the database, no wall-clock limit. Two shapes: ephemeral sandboxes for untrusted agent code, and always-on HTTP services. Node, Deno, Docker. Deploy via `supabase compute deploy`, MCP server, Management API or GitHub Actions. Use cases: agent sandboxes, long-running agents, APIs, background workers, heavy processing (ffmpeg, headless browsers).
- **Build:** local development without Docker (alpha), Declarative Schemas 2.0.
- **Operate:** agent prompts for health/security checks in Claude/Codex/Cursor, Health Check Advisors, Database Connections dashboard, `query_logs` MCP tool, Explorer and Notebooks, Enterprise-managed auth for MCP (Okta, GA), scoped personal access tokens (GA), MCP Elicitations, Supabase Pipelines (public alpha).
- **Scale:** Multigres (private alpha), OrioleDB (public beta), dbarena benchmarks.
- Also announced: Supabase is acquiring Turso.

## Past Supabase hackathons

**Supabase Select 2025 — Y Combinator office, San Francisco** (Oct 4–5, 2025, onsite 48-hour, 54 submissions) — the direct predecessor of today's event. ([event page](https://hackathon.supabase.com/supabase-select-2025))
- **Grand Winner: [Repatch](https://github.com/areibman/repatch)** (Team A, [demo](https://repatch-coral.vercel.app)): reads GitHub repo changes, uses Gemini 2.5 Flash to write patch notes, emails them via Resend, optional Remotion video. Next.js 15, ShadCN. Supabase use was only Postgres + Auth (video lived on AWS S3).
- **Finalists:** WZRD.Studio (generative creative assets), Vortal (Vapi voice-agent dashboard), Women's Wellness Tracker (Supabase Auth + Edge Functions), Minty (visual full-stack builder), PromptStudio IDE (prompt workspace with versioning).
- **Criteria:** Innovation/Creativity, UX/Design, Functionality/Completeness, Impact/Usefulness, Technical Implementation, plus a Best Use of Resend bonus category.
- Why it likely won (inference; no judge commentary published): one-sentence chore everyone has, end-to-end flow, used a sponsor, deployed and polished.

**Launch Week hackathons (online)** — Best Overall winners:
- LW15 (Aug 2025): Figma AI Tickets — Figma frames → dev tickets with GPT-4
- LW13 (Dec 2024): Brainrot GPT — PDFs → short-form video summaries
- LW12 (Sep 2024): Whisker Jam — realtime multi-device cat rock band
- OSS 2024: vdbs — database diagram image → SQL
- LWX (Jan 2024): Supafork — clone Supabase projects
- LW8 (Aug 2023): WITAS — AI sticker generator
- LW7 (Apr 2023): Page Assist — chat with web pages

**Patterns:** Best Overall is a demoable one-sentence value prop, not the most complex build. AI appears in ~5 of 7 winners, so it's table stakes. Voice is rare among winners (open lane). Solo/small teams win (5 of 7). Polish and one memorable moment matter.

## Winning approach (judges' and winners' advice)

- One-sentence problem the whole room already feels.
- Design backward from a 90-second demo; write the demo script first. Show one working "this is now possible" moment.
- AI must be load-bearing and visible: a before/after, not a chat box.
- One excellent flow beats five half-working features. ~60% build, 20% polish, 20% demo.
- Deploy early; seed realistic data; record a backup video; rehearse aloud.
- Own and understand the differentiated logic so you can answer judges' questions.
- Losing patterns: generic AI wrapper, niche problem that needs explaining, feature sprawl, Supabase used only as a data dump, rushed demo.

## Industry facts for the pitch (verified Oct 3, 2026)

- **$15.4B** in demurrage and detention collected by the nine major ocean carriers, April 2020 – March 2025 ([FMC](https://www.fmc.gov/detention-and-demurrage/)).
- **Sept 23, 2025:** the D.C. Circuit (WSC v. FMC) vacated the FMC rule limiting who can be billed, so ocean carriers can again bill truckers directly for D&D ([Husch Blackwell](https://www.huschblackwell.com/newsandinsights/appeals-court-decision-reshapes-detention-and-demurrage-billing-landscape-for-truckers)).
- Small carriers commonly wait **30–90 days** to be paid; factoring costs **1.5–5%** per invoice.
- Drayage is fragmented: "thousands" of carriers (6,000+ in one directory, per [RXO](https://rxo.com/resources/shipper/what-is-drayage-carrier/)). Don't quote 12,000; it didn't verify.
- SC Ports: Inland Port Greer ~200k rail moves in 2025 (record).

## Competitive landscape

| Player | What it is |
|---|---|
| **Flexport MCP** (Sept 29, 2026) | Agents track, rate and book freight on Flexport's network; ocean first ([FreightWaves](https://www.freightwaves.com/news/flexport-mcp-server-ai-agents-freight-booking)) |
| **Warp agent MCP** (Apr 2026) | Production MCP to quote/book/track LTL, FTL, box truck; calls itself the first freight MCP ([Glama](https://glama.ai/mcp/servers/warpfreight/warp-agent-mcp)) |
| **Shipwell MCP** | TMS data access incl. drayage for existing shippers |
| **DrayScout** | Drayage marketplace for brokers, 500+ verified carriers, instant booking |
| **Draying.io** | Drayage capacity marketplace; "MCP agent extensions" on roadmap |
| **PortPro** | Drayage TMS with in-app AI agents (May 2025) |
| **HappyRobot, Augment, Vooma, Pallet** | Well-funded AI voice/email agents for freight brokers |

Don't claim "first freight MCP." PortCall's angle: agents get a phone line to the carriers who only answer the phone.

## Sources

[Hackathon home](https://hackathon.supabase.com/) · [Rules](https://hackathon.supabase.com/hackathon-rules) · [Docs](https://hackathon.supabase.com/docs) · [Select 2025](https://hackathon.supabase.com/supabase-select-2025) · [LW15 winners](https://supabase.com/blog/lw15-hackathon-winners) · [Hackathon blog tag](https://supabase.com/blog/tags/hackathon) · [Select 2026 recap](https://supabase.com/blog/supabase-select-2026-recap) · [Supabase Compute](https://supabase.com/compute) · [Ship by Sundown](https://shipbysundown.dev/#tools) · [Luma event](https://luma.com/supabase-select-2026)
