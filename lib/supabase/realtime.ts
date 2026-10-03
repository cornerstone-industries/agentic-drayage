import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Realtime applies RLS with the token the channel joins with. On a cold page load the browser client
 * has not restored the session from cookies yet, so a channel subscribed right away joins as anon and
 * every row is filtered out. Load the session and hand its token to Realtime before subscribing.
 */
export async function authorizeRealtime(supabase: SupabaseClient): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (token) await supabase.realtime.setAuth(token);
}
