// "Test connection" on /connect: connects to this deployment's MCP server with the signed-in importer's
// key, exactly as an agent would (Streamable HTTP, Bearer key), lists the tools and calls the read-only
// list_containers. Nothing here starts calls or books anything.
import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { getSessionImporter } from "@/lib/auth";

export const dynamic = "force-dynamic";

type ContainerLite = { container_number_formatted?: string; status?: string; eta?: string | null; destination?: string | null };

export async function GET(req: Request) {
  const session = await getSessionImporter();
  if (!session) return Response.json({ ok: false, error: "Sign in to test your connection" }, { status: 401 });
  const key = session.importer.mcp_api_key;
  if (!key) return Response.json({ ok: false, error: "This importer has no MCP key yet" }, { status: 409 });

  const endpoint = new URL("/api/mcp", req.url);
  const client = new Client({ name: "portcall-connect-check", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(endpoint, { requestInit: { headers: { Authorization: `Bearer ${key}` } } });
  const started = Date.now();
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    const res = await client.callTool({ name: "list_containers", arguments: {} });
    const data = (res.structuredContent ?? {}) as { containers?: ContainerLite[] };
    return Response.json({
      ok: true,
      ms: Date.now() - started,
      endpoint: endpoint.toString(),
      tools: tools.map((t) => ({ name: t.name, title: t.title ?? t.name })),
      containers: (data.containers ?? []).slice(0, 6).map((c) => ({ number: c.container_number_formatted, status: c.status })),
      containerCount: data.containers?.length ?? 0,
    });
  } catch (err) {
    return Response.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  } finally {
    await client.close().catch(() => {});
  }
}
