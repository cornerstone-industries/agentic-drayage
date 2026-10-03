import Link from "next/link";
import { Wordmark } from "./wordmark";
import { PortClock } from "./port-clock";
import { SignOut } from "./sign-out";
import { callMode } from "@/lib/env";
import { aiMode } from "@/lib/ai";

const NAV = [
  { href: "/dashboard", label: "Inbound" },
  { href: "/connect", label: "Connect agent" },
  { href: "/settings", label: "Settings" },
];

export function TopBar({ importerName, active }: { importerName: string; active?: "/dashboard" | "/settings" | "/connect" }) {
  const mode = callMode();
  const ai = aiMode();
  return (
    <header className="sticky top-0 z-40 border-b border-rule bg-paper/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-3 gap-y-1 px-4 pb-2 pt-3 sm:px-6 md:h-16 md:flex-nowrap md:gap-6 md:py-0">
        <Wordmark href="/dashboard" />
        <nav className="-mx-1 order-last flex w-full items-center gap-1 overflow-x-auto px-1 py-1 md:order-none md:mx-0 md:w-auto md:overflow-visible md:p-0" aria-label="Main">
          {NAV.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              aria-current={active === n.href ? "page" : undefined}
              className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[14.5px] font-semibold transition-colors ${
                active === n.href ? "bg-sheet text-fg shadow-[0_0_0_1px_rgb(var(--rule-rgb))]" : "text-muted hover:text-fg"
              }`}
            >
              {n.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3 sm:gap-4">
          {mode === "replay" && (
            <span
              className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-rule bg-sheet px-2.5 py-1 text-[12.5px] font-semibold text-muted"
              title="CALL_MODE=replay: recorded dispatcher calls, not live calls"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-steel" aria-hidden="true" />
              Replay mode
            </span>
          )}
          {ai === "fixture" && (
            <span
              className="hidden items-center gap-1.5 whitespace-nowrap rounded-full border border-red/30 bg-sheet px-2.5 py-1 text-[12.5px] font-semibold text-red md:inline-flex"
              title="DEV_ONLY_FIXTURE_AI: stand-in for Claude until the AI Gateway key is set"
            >
              <span className="h-1.5 w-1.5 rounded-full bg-red" aria-hidden="true" />
              Fixture AI, dev only
            </span>
          )}
          <span className="hidden lg:inline">
            <PortClock />
          </span>
          <span className="hidden text-[14px] font-semibold text-fg xl:inline">{importerName}</span>
          <SignOut />
        </div>
      </div>
    </header>
  );
}
