"use client";

import { useEffect, useState } from "react";

export const SETTINGS_SECTIONS = [
  { id: "guardrails", label: "Guardrails" },
  { id: "payment", label: "Payment method" },
  { id: "carriers", label: "Carriers" },
  { id: "agent", label: "Agent access" },
] as const;

/** Sticky section list for wide screens. Highlights the section under the top bar as you scroll. */
export function SettingsNav() {
  const [active, setActive] = useState<string>(SETTINGS_SECTIONS[0].id);

  useEffect(() => {
    const onScroll = () => {
      let current: string = SETTINGS_SECTIONS[0].id;
      for (const s of SETTINGS_SECTIONS) {
        const el = document.getElementById(s.id);
        if (el && el.getBoundingClientRect().top <= 140) current = s.id;
      }
      // At the bottom the last section wins, even when it is too short to reach the line.
      if (window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4) {
        current = SETTINGS_SECTIONS[SETTINGS_SECTIONS.length - 1].id;
      }
      setActive(current);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, []);

  return (
    <nav aria-label="Settings sections" className="hidden lg:block">
      <ul className="sticky top-24 space-y-0.5">
        {SETTINGS_SECTIONS.map((s) => (
          <li key={s.id}>
            <a
              href={`#${s.id}`}
              aria-current={active === s.id ? "true" : undefined}
              onClick={(e) => {
                const el = document.getElementById(s.id);
                if (!el) return;
                e.preventDefault();
                const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
                el.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
                history.replaceState(null, "", `#${s.id}`);
              }}
              className={`block rounded-[10px] px-3 py-2 text-[14.5px] font-semibold transition-colors ${
                active === s.id ? "bg-sheet text-fg shadow-[0_0_0_1px_rgb(var(--rule-rgb))]" : "text-muted hover:text-fg"
              }`}
            >
              {s.label}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
