// End-to-end check of the MCP server, the way an outside agent uses it:
//
//   npm run test:mcp        (reads .env.local, then .env)
//
// Connects to BASE_URL/api/mcp (default APP_URL) with DEMO_MCP_API_KEY, then walks the demo container
// PHGU4829137 through all five tools: list, request quotes, poll until Claude has ranked them, book,
// follow the timeline. Every structuredContent is validated against the schemas the server registers.
// Run it against a deployment with CALL_MODE=replay; request_quotes would otherwise ring real phones.
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import type { z } from "zod";
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { TOOL_NAMES, TOOL_OUTPUT_SCHEMAS, type ToolName } from "@/lib/mcp/schemas";
import { DEMO_CONTAINER_NUMBER, resetDemoContainer, runScript, sleep, type Reporter } from "./lib/demo";

const POLL_EVERY_MS = 3_000;
const POLL_TIMEOUT_MS = 240_000;

type Out<T extends ToolName> = z.infer<(typeof TOOL_OUTPUT_SCHEMAS)[T]>;

/** Calls a tool and returns its structuredContent parsed with the server's own output schema. */
async function call<T extends ToolName>(client: Client, name: T, args: Record<string, unknown>): Promise<Out<T>> {
  const res = await client.callTool({ name, arguments: args });
  const text = res.content
    .map((c) => (c.type === "text" ? c.text : `[${c.type}]`))
    .join(" ")
    .slice(0, 400);
  if (res.isError) throw new Error(`${name} returned an error: ${text}`);
  const parsed = TOOL_OUTPUT_SCHEMAS[name].safeParse(res.structuredContent);
  if (!parsed.success) {
    const issues = parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`);
    throw new Error(`structuredContent does not match the ${name} schema: ${issues.join("; ")}`);
  }
  return parsed.data as Out<T>;
}

const same = (a: readonly string[], b: readonly string[]) => a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);

async function main(r: Reporter): Promise<void> {
  const baseUrl = (process.env.BASE_URL || process.env.APP_URL || "").trim().replace(/\/+$/, "");
  const key = process.env.DEMO_MCP_API_KEY?.trim();
  if (!baseUrl || !key) {
    r.fail("env", `set ${[!baseUrl && "BASE_URL (or APP_URL)", !key && "DEMO_MCP_API_KEY"].filter(Boolean).join(" and ")}`);
    return;
  }
  const endpoint = `${baseUrl}/api/mcp`;

  // A wrong key must be refused before any tool can run.
  await r.run(
    "auth rejects a bad key",
    async () => {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json", accept: "application/json, text/event-stream", authorization: "Bearer not-a-real-key" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
      });
      if (res.status !== 401) throw new Error(`expected 401, got ${res.status}`);
    },
    "401",
  );

  const client = new Client({ name: "portcall-test-mcp", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(endpoint), { requestInit: { headers: { Authorization: `Bearer ${key}` } } });
  const connected = await r.run("connect", async () => {
    await client.connect(transport);
    return true;
  }, endpoint);
  if (!connected) return;

  try {
    await r.run("tools/list", async () => {
      const { tools } = await client.listTools();
      const names = tools.map((t) => t.name);
      if (!same(names, TOOL_NAMES)) throw new Error(`expected exactly ${TOOL_NAMES.join(", ")}; got ${names.join(", ")}`);
      const bare = tools.filter((t) => !t.description || !t.outputSchema).map((t) => t.name);
      if (bare.length) throw new Error(`missing description or outputSchema: ${bare.join(", ")}`);
      return names;
    }, `${TOOL_NAMES.length} tools`);

    const reset = await r.run("reset demo container", () => resetDemoContainer(), (s) => `${s.container.container_number} back to inbound`);
    if (!reset) {
      for (const t of TOOL_NAMES) r.fail(t, "skipped: could not reset the demo container");
      return;
    }

    const listed = await r.run(
      "list_containers",
      async () => {
        const out = await call(client, "list_containers", {});
        const demo = out.containers.find((c) => c.container_number === DEMO_CONTAINER_NUMBER);
        if (!demo) throw new Error(`${DEMO_CONTAINER_NUMBER} is not in the list`);
        if (demo.status !== "inbound") throw new Error(`${DEMO_CONTAINER_NUMBER} should be inbound after the reset, got ${demo.status}`);
        const filtered = await call(client, "list_containers", { status: "inbound" });
        if (filtered.containers.some((c) => c.status !== "inbound")) throw new Error("status filter returned other statuses");
        return { out, demo };
      },
      ({ out }) => `${out.count} containers, ${DEMO_CONTAINER_NUMBER} inbound`,
    );
    if (!listed) {
      for (const t of TOOL_NAMES.slice(1)) r.fail(t, "skipped: list_containers failed");
      return;
    }
    const containerId = listed.demo.container_id;

    // Ask by container number in a spaced format to exercise the lenient lookup.
    const requested = await r.run(
      "request_quotes",
      async () => {
        const out = await call(client, "request_quotes", { container_id: "PHGU 482913-7" });
        if (out.container.container_id !== containerId) throw new Error("container number lookup resolved to a different container");
        if (out.mode !== "replay") throw new Error(`server is in ${out.mode} call mode; set CALL_MODE=replay on the deployment so this test does not ring real phones`);
        if (out.calls.length !== 3) throw new Error(`expected 3 calls, got ${out.calls.length}`);
        if (out.skipped.length !== 2) throw new Error(`expected 2 skipped providers, got ${out.skipped.length}`);
        if (!out.next_step.includes("get_quotes")) throw new Error("next_step does not point at get_quotes");
        return out;
      },
      (out) => `${out.calls.length} calls (${out.mode}), ${out.skipped.length} skipped${out.reused ? ", reused" : ""}`,
    );
    if (!requested) {
      for (const t of ["get_quotes", "book_quote", "get_container_status"]) r.fail(t, "skipped: request_quotes failed");
      return;
    }

    // Poll until Claude has ranked the quotes (replay takes about a minute and a half).
    const ranked = await r.run(
      "get_quotes",
      async () => {
        const t0 = Date.now();
        let last: Out<"get_quotes"> | undefined;
        let nextInfo = 15_000;
        while (Date.now() - t0 < POLL_TIMEOUT_MS) {
          last = await call(client, "get_quotes", { container_id: containerId });
          if (last.recommendation) break;
          if (Date.now() - t0 >= nextInfo) {
            r.info(`get_quotes waiting (${Math.round((Date.now() - t0) / 1000)}s): ${last.next_step}`);
            nextInfo += 15_000;
          }
          await sleep(POLL_EVERY_MS);
        }
        const rec = last?.recommendation;
        if (!last || !rec) throw new Error(`no recommendation after ${POLL_TIMEOUT_MS / 1000}s; last next_step: ${last?.next_step ?? "none"}`);

        if (last.quotes.length !== 3) throw new Error(`expected 3 quotes, got ${last.quotes.length}`);
        const missingPrice = last.quotes.filter((q) => q.all_in_cents == null || !q.all_in_usd);
        if (missingPrice.length) throw new Error(`quotes without an all-in price: ${missingPrice.map((q) => q.provider_name).join(", ")}`);
        if (rec.ranked_quote_ids.length !== last.quotes.length || rec.ranking.length !== last.quotes.length) throw new Error("ranking does not cover every quote");
        const winner = last.quotes.find((q) => q.quote_id === rec.winner_quote_id);
        if (!winner) throw new Error("winner_quote_id is not among the quotes");
        if (!winner.is_recommended || winner.rank !== 1) throw new Error("winner is not marked rank 1 / is_recommended");
        if (!winner.provider_name.includes("Marshgrass")) throw new Error(`expected Marshgrass to win, got ${winner.provider_name}`);
        if (winner.all_in_cents !== 84700) throw new Error(`expected Marshgrass at 84700 cents all-in, got ${winner.all_in_cents}`);
        const ironclad = last.quotes.find((q) => q.provider_name.includes("Ironclad"));
        if (!ironclad || ironclad.can_meet_deadline !== false || !(ironclad.projected_demurrage_cents && ironclad.projected_demurrage_cents > 0)) {
          throw new Error("Ironclad should be flagged: misses the deliver-by date with projected demurrage");
        }
        if (!rec.reasoning || !/\$\d/.test(rec.reasoning)) throw new Error("reasoning has no dollar amounts");
        if (/[\u2014\u2013]/.test(rec.reasoning)) throw new Error("reasoning contains an em or en dash");
        if (!last.calls.every((c) => ["ended", "failed", "no_answer"].includes(c.status))) throw new Error("recommendation exists but a call is not finished");
        return { last, winner, seconds: Math.round((Date.now() - t0) / 1000) };
      },
      ({ winner, seconds, last }) => `ranked after ${seconds}s: ${winner.provider_name} ${winner.all_in_usd} wins, ${last.quotes.length} quotes`,
    );
    if (!ranked) {
      for (const t of ["book_quote", "get_container_status"]) r.fail(t, "skipped: get_quotes failed");
      return;
    }
    const { winner } = ranked;

    // The pipeline may auto-book the winner (booked_by auto) the moment it is ranked. Either path is valid here.
    const booked = await r.run(
      "book_quote",
      async () => {
        const out = await call(client, "book_quote", { quote_id: winner.quote_id });
        if (out.booking.quote_id !== winner.quote_id) throw new Error("booking is for a different quote");
        if (out.booking.amount_cents !== winner.all_in_cents) throw new Error(`booked ${out.booking.amount_cents} cents, quote is ${winner.all_in_cents}`);
        if (out.booking.provider_name !== winner.provider_name) throw new Error(`booking provider ${out.booking.provider_name} is not ${winner.provider_name}`);
        if (out.booking.payment_status !== "authorized") throw new Error(`payment_status should be authorized, got ${out.booking.payment_status}`);
        if (out.payment.stripe_status !== "requires_capture") throw new Error(`Stripe status should be requires_capture, got ${out.payment.stripe_status}`);
        if (!out.already_booked && out.booking.booked_by !== "agent") throw new Error(`a fresh booking should be booked_by agent, got ${out.booking.booked_by}`);
        if (out.container.status !== "booked") throw new Error(`container should be booked, got ${out.container.status}`);
        return out;
      },
      (out) => `${out.booking.amount_usd} ${out.payment.stripe_status}, booked_by ${out.booking.booked_by}${out.already_booked ? " (already booked)" : ""}`,
    );
    if (booked?.already_booked) {
      r.warn(`auto-book booked it first (booked_by ${booked.booking.booked_by}), so the agent booking path was not exercised; set the importer's auto_book_enabled to false to test it`);
    }
    // Without a booking the timeline is still checked (schema, order, quote events) so the tool is exercised;
    // the run already fails on book_quote above.
    await r.run(
      "get_container_status",
      async () => {
        const out = await call(client, "get_container_status", { container_id: DEMO_CONTAINER_NUMBER });
        if (out.container.container_id !== containerId) throw new Error("resolved to a different container");
        if (!booked) {
          const types = new Set(out.events.map((e) => e.type));
          const missing = ["quote_requested", "recommended"].filter((t) => !types.has(t));
          if (missing.length) throw new Error(`timeline is missing: ${missing.join(", ")}`);
          return out;
        }
        if (out.container.status !== "booked") throw new Error(`container should be booked, got ${out.container.status}`);
        if (out.booking?.quote_id !== winner.quote_id) throw new Error("booking missing or for a different quote");
        const ids = out.events.map((e) => e.event_id);
        if (ids.some((id, i) => i > 0 && id <= ids[i - 1])) throw new Error("events are not in ascending order");
        const types = new Set(out.events.map((e) => e.type));
        const missing = ["quote_requested", "recommended", "booked", "payment_authorized"].filter((t) => !types.has(t));
        if (missing.length) throw new Error(`timeline is missing: ${missing.join(", ")}`);
        return out;
      },
      (out) => `${out.events.length} events, status ${out.container.status}${booked ? "" : " (no booking: Stripe step failed)"}`,
    );
  } finally {
    await client.close().catch(() => undefined);
  }
}

void runScript(main);
