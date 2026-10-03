import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";

/**
 * Service-role client for server routes, webhooks and background work. Bypasses RLS,
 * so it must never be imported into a client component.
 */
export function createAdminClient() {
  return createClient<Database>(supabaseUrl(), supabaseServiceRoleKey(), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AdminClient = ReturnType<typeof createAdminClient>;
