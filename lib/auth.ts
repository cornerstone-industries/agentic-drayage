import { timingSafeEqual } from "node:crypto";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireEnv } from "@/lib/env";
import type { Importer } from "@/lib/types";

/** Constant-time string compare for shared secrets. */
export function secretsMatch(given: string | null | undefined, expected: string): boolean {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** The signed-in user's importer (cookie session, RLS-scoped), or null. */
export async function getSessionImporter(): Promise<{ userId: string; importer: Importer } | null> {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) return null;
  const { data: importer } = await supabase.from("importers").select("*").eq("owner_id", userId).maybeSingle();
  if (!importer) return null;
  return { userId, importer };
}

/** pg_cron, Vercel cron and the test scripts authenticate with the internal secret header. */
export function hasInternalSecret(req: Request): boolean {
  const { INTERNAL_CRON_SECRET } = requireEnv("Internal cron secret", ["INTERNAL_CRON_SECRET"]);
  const header = req.headers.get("x-internal-secret") ?? req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  return secretsMatch(header, INTERNAL_CRON_SECRET);
}

/** Importer that owns an MCP API key (Authorization: Bearer <importers.mcp_api_key>). */
export async function importerForMcpKey(key: string | undefined): Promise<Importer | null> {
  if (!key) return null;
  const db = createAdminClient();
  const { data } = await db.from("importers").select("*").eq("mcp_api_key", key).maybeSingle();
  return data ?? null;
}
