"use client";

import { useEffect, useState } from "react";

/** Charleston local time, the clock everyone at the port works to. */
export function PortClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const time = now?.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) ?? "--:--:--";
  return (
    <span className="text-[13px] tabular-nums text-muted" title="Port of Charleston local time">
      Charleston <span className="font-mono font-medium text-fg">{time}</span>
    </span>
  );
}
