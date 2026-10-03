import Link from "next/link";
import { Wordmark } from "./wordmark";
import { PortClock } from "./port-clock";
import { SignOut } from "./sign-out";
import { callMode } from "@/lib/env";
import { aiMode } from "@/lib/ai";

const NAV = [
  { href: "/dashboard", label: "Inbound" },
  { href: "/settings", label: "Settings" },
];

export function TopBar({ importerName, active }: { importerName: string; active?: "/dashboard" | "/settings" }) {
  const mode = callMode();
  const ai = aiMode();
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-[1440px] items-center gap-3 px-4 sm:gap-6 sm:px-6">
        <Wordmark href="/dashboard" />
        <nav className="flex items-center gap-1" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.href ? "page" : undefined}
              className={`rounded-full px-3.5 py-1.5 text-[14.5px] font-semibold transition-colors ${
                active === n.href ? "bg-sheet text-fg shadow-[0_0_0_1px_rgb(var(--rule-rgb))]" : "text-muted hover:text-fg"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {mode === "replay" && (
            <span className="hidden text-[13px] font-semibold text-crane md:inline" title="CALL_MODE=replay: recorded dispatcher calls, not live calls">
              Replay mode
            </span>
          )}
          {ai === "fixture" && (
            <span className="hidden text-[13px] font-semibold text-red md:inline" title="DEV_ONLY_FIXTURE_AI: stand-in for Claude until the AI Gateway key is set">
              Fixture AI, dev only
            </span>
          )}
          <span className="hidden sm:inline">
            <PortClock />
          </span>
          <span className="hidden text-[14px] font-semibold text-fg lg:inline">{importerName}</span>
          <SignOut />
        </div>
      </div>
    </header>
  );
}
