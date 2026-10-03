import Link from "next/link";
import { Wordmark } from "./wordmark";
import { PortClock } from "./port-clock";
import { SignOut } from "./sign-out";
import { callMode } from "@/lib/env";
import { aiMode } from "@/lib/ai";

const NAV = [
  { href: "/dashboard", label: "Board" },
  { href: "/settings", label: "Settings" },
];

export function TopBar({ importerName, active }: { importerName: string; active?: "/dashboard" | "/settings" }) {
  const mode = callMode();
  const ai = aiMode();
  return (
    <header className="sticky top-0 z-40 border-b border-line bg-ink/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Wordmark href="/dashboard" />
        <nav className="flex items-center gap-1" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.href ? "page" : undefined}
              className={`rounded-[3px] px-3 py-1.5 text-sm transition-colors ${
                active === n.href ? "bg-panel text-fg" : "text-muted hover:text-fg"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {mode === "replay" && (
            <span className="hidden rounded-[3px] border border-sodium/40 px-2 py-0.5 font-mono text-[11px] text-sodium md:inline" title="CALL_MODE=replay: recorded dispatcher scripts, not live calls">
              Replay mode
            </span>
          )}
          {ai === "fixture" && (
            <span className="hidden rounded-[3px] border border-alarm/40 px-2 py-0.5 font-mono text-[11px] text-alarm md:inline" title="DEV_ONLY_FIXTURE_AI: deterministic stand-in for Claude until the AI Gateway key is set">
              Fixture AI, dev only
            </span>
          )}
          <span className="hidden sm:inline">
            <PortClock />
          </span>
          <span className="hidden text-sm text-muted lg:inline">{importerName}</span>
          <SignOut />
        </div>
      </div>
    </header>
  );
}
