"use client";

import { useState } from "react";
import { CheckIcon, CopyIcon } from "./icons";

/** On/off switch. Ink when on, like the console's other primary controls. */
export function Switch({
  checked,
  onChange,
  label,
  describedBy,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  describedBy?: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      aria-describedby={describedBy}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-[26px] w-[46px] shrink-0 items-center rounded-full transition-colors duration-200 ${
        checked ? "bg-fg" : "bg-dim/50 hover:bg-dim/70"
      }`}
    >
      <span
        aria-hidden
        className={`absolute left-[3px] h-5 w-5 rounded-full bg-white shadow-[0_1px_3px_rgba(18,20,23,0.28)] transition-transform duration-200 ease-out ${
          checked ? "translate-x-5" : "translate-x-0"
        }`}
      />
    </button>
  );
}

/** Small pill button for secondary actions inside a panel. */
export const pillButton =
  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border border-rule bg-sheet px-3 text-[13px] font-semibold text-fg transition-colors hover:border-steel disabled:cursor-not-allowed disabled:opacity-50";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={pillButton}
      disabled={!text}
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setDone(true);
        setTimeout(() => setDone(false), 1600);
      }}
    >
      {done ? <CheckIcon className="h-3.5 w-3.5 text-live" /> : <CopyIcon className="h-3.5 w-3.5 text-muted" />}
      {done ? "Copied" : label}
    </button>
  );
}
