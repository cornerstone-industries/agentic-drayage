// Shared by the demo scripts: the service-role client, the scripted demo container, a clean reset of
// everything a quote run leaves on it, and the PASS/FAIL reporter every script prints through.
// Nothing here reads the environment at import time, so dotenv in the calling script still wins.
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import type { Container } from "@/lib/types";

/** The container the demo and every test are scripted around (CLAUDE.md section 5). */
export const DEMO_CONTAINER_NUMBER = "PHGU4829137";

export const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Service-role client. Throws NotConfiguredError when the Supabase URL or service role key is missing. */
export function getAdmin(): AdminClient {
  return createAdminClient();
}

/** getAdmin() plus one query, so a wrong or revoked key fails here and not deep inside a later check. */
export async function connectAdmin(): Promise<AdminClient> {
  const db = getAdmin();
  const { error } = await db.from("containers").select("id", { head: true }).limit(1);
  if (error) throw new Error(`Supabase rejected the service role key: ${error.message}`);
  return db;
}

export async function findDemoContainer(db: AdminClient = getAdmin()): Promise<Container> {
  const { data, error } = await db
    .from("containers")
    .select("*")
    .eq("container_number", DEMO_CONTAINER_NUMBER)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`could not look up ${DEMO_CONTAINER_NUMBER}: ${error.message}`);
  if (!data) throw new Error(`demo container ${DEMO_CONTAINER_NUMBER} not found: run npm run seed`);
  return data;
}

export type ResetSummary = {
  container: Container;
  removed: { bookings: number; recommendations: number; quote_requests: number; quotes: number; events: number };
};

async function removed(label: string, deletion: PromiseLike<{ count: number | null; error: { message: string } | null }>): Promise<number> {
  const { count, error } = await deletion;
  if (error) throw new Error(`could not clear ${label}: ${error.message}`);
  return count ?? 0;
}

/**
 * Back to the pre-quote state: deletes the demo container's quote requests (which cascade to calls,
 * transcript lines and their quotes), recommendations, bookings and events, and sets it to inbound.
 * Stripe objects from earlier bookings are not touched.
 */
export async function resetDemoContainer(db: AdminClient = getAdmin()): Promise<ResetSummary> {
  const container = await findDemoContainer(db);
  const id = container.id;
  // Children before parents: bookings point at quotes, recommendations at quotes and quote requests.
  const bookings = await removed("bookings", db.from("bookings").delete({ count: "exact" }).eq("container_id", id));
  const recommendations = await removed("recommendations", db.from("recommendations").delete({ count: "exact" }).eq("container_id", id));
  const quote_requests = await removed("quote requests", db.from("quote_requests").delete({ count: "exact" }).eq("container_id", id));
  const quotes = await removed("quotes", db.from("quotes").delete({ count: "exact" }).eq("container_id", id));
  const events = await removed("events", db.from("events").delete({ count: "exact" }).eq("container_id", id));
  const { data: reset, error } = await db.from("containers").update({ status: "inbound" }).eq("id", id).select("*").single();
  if (error) throw new Error(`could not set ${container.container_number} back to inbound: ${error.message}`);
  return { container: reset, removed: { bookings, recommendations, quote_requests, quotes, events } };
}

/** Error text for a script line, including the cause code node's fetch hides ("fetch failed" -> ECONNREFUSED). */
export function describeError(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const cause = (err as { cause?: { code?: string; message?: string } }).cause;
  const extra = cause?.code ?? cause?.message;
  return extra && !err.message.includes(extra) ? `${err.message} (${extra})` : err.message;
}

// Collapses a message to one line and drops terminal color codes (Playwright errors carry them).
const oneLine = (text: string, max = 500) => {
  const flat = text.replace(/\u001b\[[0-9;]*m/g, "").replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max)}...` : flat;
};

export type Reporter = {
  /** FAIL lines printed so far. */
  readonly failures: number;
  pass(check: string, detail?: string): void;
  fail(check: string, reason: string): void;
  info(message: string): void;
  /** Advice that does not fail the run. */
  warn(message: string): void;
  /** Runs fn and prints PASS (with detail) or FAIL (with the thrown message). Resolves undefined on failure. */
  run<T>(check: string, fn: () => Promise<T>, detail?: string | ((value: T) => string | undefined)): Promise<T | undefined>;
};

/** One `PASS <check> (detail)` or `FAIL <check>: reason` line per check, always on a single line. */
export function createReporter(): Reporter {
  let failures = 0;
  const reporter: Reporter = {
    get failures() {
      return failures;
    },
    pass(check, detail) {
      console.log(detail ? `PASS ${check} (${oneLine(detail)})` : `PASS ${check}`);
    },
    fail(check, reason) {
      failures++;
      console.log(`FAIL ${check}: ${oneLine(reason)}`);
    },
    info(message) {
      console.log(`INFO ${oneLine(message)}`);
    },
    warn(message) {
      console.log(`WARN ${oneLine(message)}`);
    },
    async run(check, fn, detail) {
      try {
        const value = await fn();
        reporter.pass(check, typeof detail === "function" ? detail(value) : detail);
        return value;
      } catch (err) {
        reporter.fail(check, describeError(err));
        return undefined;
      }
    },
  };
  return reporter;
}

/** Runs a script body, turns a thrown error into a FAIL line, and exits 1 if any check failed. */
export async function runScript(main: (r: Reporter) => Promise<void>): Promise<void> {
  const r = createReporter();
  try {
    await main(r);
  } catch (err) {
    r.fail("script", describeError(err));
  }
  process.exitCode = r.failures ? 1 : 0;
  // A stray open handle (browser, socket) must not keep a finished script alive.
  setTimeout(() => process.exit(), 3000).unref();
}
