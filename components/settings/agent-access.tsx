"use client";

import Link from "next/link";
import { useState } from "react";

export function AgentAccess({ endpoint, apiKey }: { endpoint: string; apiKey: string }) {
  const [show, setShow] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const copy = async (label: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(null), 1500);
  };
  const masked = apiKey ? `${apiKey.slice(0, 6)}${"•".repeat(18)}${apiKey.slice(-4)}` : "No key";
  const config = JSON.stringify({ mcpServers: { portcall: { url: endpoint, headers: { Authorization: `Bearer ${show ? apiKey : "<key>"}` } } } }, null, 2);
  return (
    <div className="panel space-y-5 p-6">
      <Link href="/connect" className="inline-flex text-[14px] font-semibold text-stamp hover:underline">
        Set it up in Claude, Cursor or VS Code, and test the connection
      </Link>
      <div>
        <div className="tick-label">MCP endpoint (Streamable HTTP)</div>
        <div className="mt-1.5 flex items-center gap-3">
          <code className="font-mono text-sm text-fg">{endpoint}</code>
          <button type="button" className="font-mono text-xs text-stamp hover:underline" onClick={() => copy("url", endpoint)}>
            {copied === "url" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <div>
        <div className="tick-label">Bearer key</div>
        <div className="mt-1.5 flex flex-wrap items-center gap-3">
          <code className="font-mono text-sm text-fg">{show ? apiKey : masked}</code>
          <button type="button" className="font-mono text-xs text-stamp hover:underline" onClick={() => setShow(!show)}>
            {show ? "Hide" : "Reveal"}
          </button>
          <button type="button" className="font-mono text-xs text-stamp hover:underline" onClick={() => copy("key", apiKey)}>
            {copied === "key" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>
      <pre className="overflow-x-auto rounded-[12px] border border-rule bg-panel-2 p-4 font-mono text-[12.5px] leading-5 text-muted">{config}</pre>
    </div>
  );
}
