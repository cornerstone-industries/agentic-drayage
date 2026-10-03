"use client";

import { useState } from "react";

type ClientKey = "claude-code" | "claude" | "cursor" | "vscode" | "other";
type Check =
  | { state: "running" }
  | { state: "ok"; ms: number; tools: { name: string; title: string }[]; containerCount: number }
  | { state: "error"; error: string };

const CLIENTS: { key: ClientKey; label: string }[] = [
  { key: "claude", label: "Claude app" },
  { key: "claude-code", label: "Claude Code" },
  { key: "cursor", label: "Cursor" },
  { key: "vscode", label: "VS Code" },
  { key: "other", label: "Other" },
];

const PROMPT =
  "Our container that landed in Charleston this morning needs to get to our Atlanta DC by Thursday. Get quotes, pick the cheapest reliable option, and book it if it's under our limit.";

/** UTF-8 safe base64 for the Cursor install link. */
const b64 = (s: string) => btoa(String.fromCharCode(...new TextEncoder().encode(s)));

function CopyButton({ text, label = "Copy", dark = false }: { text: string; label?: string; dark?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
      className={`shrink-0 rounded-full px-3 py-1 text-[13px] font-semibold transition-colors ${
        dark ? "bg-white/10 text-white hover:bg-white/20" : "border border-rule bg-sheet text-fg hover:border-steel"
      }`}
    >
      {done ? "Copied" : label}
    </button>
  );
}

export function ConnectAgent({ endpoint, apiKey, limit, mode }: { endpoint: string; apiKey: string; limit: string | null; mode: "live" | "web" | "replay" }) {
  const [client, setClient] = useState<ClientKey>("claude");
  const [check, setCheck] = useState<Check | null>(null);

  const masked = apiKey ? `${apiKey.slice(0, 4)}...${apiKey.slice(-4)}` : "<key>";
  const snippet = (key: string): Record<ClientKey, string> => ({
    "claude-code": `claude mcp add --transport http portcall ${endpoint} --header "Authorization: Bearer ${key}"`,
    claude: `${endpoint}?key=${key}`,
    cursor: JSON.stringify({ mcpServers: { portcall: { url: endpoint, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
    vscode: JSON.stringify({ servers: { portcall: { type: "http", url: endpoint, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
    other: JSON.stringify({ mcpServers: { portcall: { url: endpoint, headers: { Authorization: `Bearer ${key}` } } } }, null, 2),
  });
  const how: Record<ClientKey, string> = {
    "claude-code": "Run this in your terminal, then start Claude Code.",
    claude: "Tap Add to Claude, or in Claude open Customize, then Connectors, then Add, then Add custom connector. Name it PortCall, paste this URL and choose No sign-in. It works in the Claude mobile app too.",
    cursor: "Click to install, or paste this into ~/.cursor/mcp.json.",
    vscode: "Click to install, or paste this into .vscode/mcp.json.",
    other: "Works with any MCP client that speaks Streamable HTTP.",
  };
  const install =
    client === "claude"
      ? { label: "Add to Claude", href: `https://claude.ai/customize/connectors?modal=add-custom-connector&connectorName=PortCall&connectorUrl=${encodeURIComponent(`${endpoint}?key=${apiKey}`)}` }
      : client === "cursor"
      ? { label: "Add to Cursor", href: `cursor://anysphere.cursor-deeplink/mcp/install?name=portcall&config=${encodeURIComponent(b64(JSON.stringify({ url: endpoint, headers: { Authorization: `Bearer ${apiKey}` } })))}` }
      : client === "vscode"
        ? { label: "Add to VS Code", href: `vscode:mcp/install?${encodeURIComponent(JSON.stringify({ name: "portcall", type: "http", url: endpoint, headers: { Authorization: `Bearer ${apiKey}` } }))}` }
        : null;

  async function runCheck() {
    setCheck({ state: "running" });
    try {
      const res = await fetch("/api/connect/check", { cache: "no-store" });
      const body = await res.json();
      setCheck(body.ok ? { state: "ok", ms: body.ms, tools: body.tools, containerCount: body.containerCount } : { state: "error", error: body.error ?? `HTTP ${res.status}` });
    } catch (err) {
      setCheck({ state: "error", error: err instanceof Error ? err.message : String(err) });
    }
  }

  return (
    <div className="mx-auto max-w-[760px]">
      <h1 className="font-cond text-[52px] font-extrabold leading-[0.98] tracking-[-0.025em] text-fg sm:text-[60px]">Connect your agent</h1>
      <p className="mt-4 text-[17px] leading-relaxed text-muted">
        PortCall is an MCP server. Add it to your AI agent and it can find your containers, get quotes by phone and book
        {limit ? ` inside your ${limit} limit` : " with your approval"}.
      </p>

      {/* 1. Add it */}
      <section className="panel mt-10 p-6 sm:p-7">
        <h2 className="font-cond text-[22px] font-bold text-fg">Add PortCall to your agent</h2>
        <div className="mt-4 flex flex-wrap gap-2" role="tablist" aria-label="Agent">
          {CLIENTS.map((c) => (
            <button
              key={c.key}
              type="button"
              role="tab"
              aria-selected={client === c.key}
              onClick={() => setClient(c.key)}
              className={`rounded-full px-4 py-1.5 text-[14px] font-semibold transition-colors ${
                client === c.key ? "bg-fg text-white" : "border border-rule bg-sheet text-muted hover:text-fg"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <p className="mt-5 text-[15px] text-fg">{how[client]}</p>
        {install && (
          <a href={install.href} className="btn-primary mt-4">
            {install.label}
          </a>
        )}
        <div className="mt-4 overflow-hidden rounded-[14px] bg-fg">
          <div className="flex items-center justify-between gap-3 border-b border-white/10 px-4 py-2">
            <span className="font-mono text-[12px] text-white/50">{client === "claude-code" ? "terminal" : client === "claude" ? "connector URL" : "json"}</span>
            <CopyButton text={snippet(apiKey)[client]} dark />
          </div>
          <pre className="overflow-x-auto px-4 py-4 font-mono text-[13px] leading-6 text-white/90">{snippet(masked)[client]}</pre>
        </div>
        <p className="mt-3 text-[13px] text-muted">Copy puts your real key in the text. It is scoped to your account; treat it like a password.</p>
      </section>

      {/* 2. Test it */}
      <section className="panel mt-5 p-6 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="font-cond text-[22px] font-bold text-fg">Test the connection</h2>
            <p className="mt-1 text-[15px] text-muted">We connect to PortCall the same way your agent will.</p>
          </div>
          <button type="button" className="btn-ghost" onClick={runCheck} disabled={check?.state === "running"} data-testid="connect-test">
            {check?.state === "running" ? "Connecting..." : check ? "Test again" : "Test connection"}
          </button>
        </div>
        {check?.state === "ok" && (
          <div className="mt-5 border-t border-rule pt-5" data-testid="connect-ok">
            <p className="flex items-center gap-2 font-semibold text-live">
              <svg viewBox="0 0 16 16" className="h-4 w-4" aria-hidden>
                <path d="M3 8.5 L6.5 12 L13 4.5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Connected in {(check.ms / 1000).toFixed(1)} s. Your agent sees {check.containerCount} containers.
            </p>
            <ul className="mt-3 flex flex-wrap gap-2">
              {check.tools.map((t) => (
                <li key={t.name} className="rounded-full border border-rule px-3 py-1 font-mono text-[12.5px] text-fg" title={t.title}>
                  {t.name}
                </li>
              ))}
            </ul>
          </div>
        )}
        {check?.state === "error" && <p className="mt-5 rounded-[12px] border border-red/30 bg-red/5 px-4 py-2.5 text-[14px] text-red">{check.error}</p>}
      </section>

      {/* 3. Ask */}
      <section className="panel mt-5 p-6 sm:p-7">
        <h2 className="font-cond text-[22px] font-bold text-fg">Then ask your agent</h2>
        <div className="mt-4 flex items-start justify-between gap-4 rounded-[14px] bg-panel-2 px-5 py-4">
          <p className="text-[16px] leading-relaxed text-fg">&ldquo;{PROMPT}&rdquo;</p>
          <CopyButton text={PROMPT} />
        </div>
        <p className="mt-4 text-[14px] leading-relaxed text-muted">
          It finds the box, calls every carrier on the lane at once, waits about two minutes for the ranking, and books the winner
          {limit ? ` if it is under ${limit}. Above that, it asks you first.` : " once you approve it."}{" "}
          {mode === "replay" ? "Calls are replayed right now, so no phones ring." : "Calls are live right now: this rings real phones."}
        </p>
      </section>
    </div>
  );
}
