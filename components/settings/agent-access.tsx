"use client";

import Link from "next/link";
import { useState, type ReactNode } from "react";
import { CopyButton, pillButton } from "./controls";
import { ArrowRightIcon } from "./icons";

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className="text-[14px] font-semibold text-fg">{label}</span>
        {hint && <span className="text-[12.5px] text-muted">{hint}</span>}
      </div>
      <div className="mt-2 flex h-12 items-center gap-2 rounded-[12px] border border-rule bg-panel-2 pl-4 pr-2">{children}</div>
    </div>
  );
}

export function AgentAccess({ endpoint, apiKey, importerName }: { endpoint: string; apiKey: string; importerName: string }) {
  const [show, setShow] = useState(false);
  const masked = apiKey ? `${apiKey.slice(0, 6)}${"•".repeat(14)}${apiKey.slice(-4)}` : "No key yet";
  return (
    <div className="panel overflow-hidden">
      <div className="space-y-5 p-6 sm:p-7">
        <Field label="MCP endpoint" hint="Streamable HTTP">
          <code className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-fg">{endpoint}</code>
          <CopyButton text={endpoint} />
        </Field>
        <Field label="API key" hint={`Scoped to ${importerName}`}>
          <code className="min-w-0 flex-1 truncate font-mono text-[13.5px] text-fg" data-private>
            {show ? apiKey : masked}
          </code>
          {apiKey && (
            <button type="button" className={pillButton} onClick={() => setShow(!show)} aria-pressed={show}>
              {show ? "Hide" : "Show"}
            </button>
          )}
          <CopyButton text={apiKey} />
        </Field>
        <p className="text-[13.5px] leading-relaxed text-muted">
          Anyone with this key can get quotes and book inside your spending limit. Treat it like a password.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-rule bg-panel-2 px-6 py-3.5 sm:px-7">
        <p className="text-[13.5px] text-muted">Works with Claude, Cursor, VS Code and any MCP client.</p>
        <Link href="/connect" className="btn-ghost h-10 px-4 py-0 text-[14px]">
          Connect an agent
          <ArrowRightIcon className="h-3.5 w-3.5" />
        </Link>
      </div>
    </div>
  );
}
