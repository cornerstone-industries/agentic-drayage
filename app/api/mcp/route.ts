// PortCall's MCP server: Streamable HTTP at /api/mcp. Agents authenticate with the importer's key
// (Authorization: Bearer <importers.mcp_api_key>) and get five tools for running drayage end to end.
import type { AuthInfo } from "@modelcontextprotocol/server";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { importerForMcpKey } from "@/lib/auth";
import { NotConfiguredError, supabaseServiceRoleKey, supabaseUrl } from "@/lib/env";
import { registerPortCallTools } from "@/lib/mcp/tools";

// request_quotes starts the replay (or the 3 minute live-call timeout) with after(), which keeps this
// function alive up to maxDuration. 300s is the Hobby maximum and covers both.
export const maxDuration = 300;

const handler = createMcpHandler(registerPortCallTools, {
  serverInfo: { name: "portcall", version: "1.0.0" },
  instructions:
    "PortCall gets drayage quotes for import containers by phone. An AI voice agent calls the importer's trucking providers in parallel, " +
    "Claude ranks the quotes on risk-adjusted cost (all-in rate plus demurrage if pickup is after the last free day), and you can book the winner. " +
    "Workflow: list_containers, then request_quotes for the container, then poll get_quotes every 5 to 10 seconds until it returns a recommendation " +
    "(about 1 to 3 minutes), then book_quote with the winner's quote_id, then get_container_status to follow acceptance, pickup and delivery. " +
    "Every response carries a next_step hint. Quotes above the importer's auto-book limit need human approval: do not retry those.",
});

// The key is the importer's own; it is only used to find which importer is calling.
// Clients that cannot send headers (claude.ai custom connectors expect OAuth) may pass it as ?key=.
async function verifyToken(req: Request, bearer?: string): Promise<AuthInfo | undefined> {
  const key = bearer ?? new URL(req.url).searchParams.get("key") ?? undefined;
  const importer = await importerForMcpKey(key);
  if (!key || !importer) return undefined;
  return { token: key, clientId: importer.id, scopes: ["portcall"], extra: { importerId: importer.id, importerName: importer.name } };
}

const authed = withMcpAuth(handler, verifyToken, { required: true });

async function handle(req: Request): Promise<Response> {
  // withMcpAuth turns anything verifyToken throws into a 401, so a missing Supabase key would look like
  // a bad API key. Check first and say what is actually wrong.
  try {
    supabaseUrl();
    supabaseServiceRoleKey();
  } catch (err) {
    if (err instanceof NotConfiguredError) return Response.json({ error: err.message }, { status: 503 });
    throw err;
  }
  return authed(req);
}

// The handler is stateless Streamable HTTP: it answers GET and DELETE session requests itself with 405.
export { handle as GET, handle as POST, handle as DELETE };
