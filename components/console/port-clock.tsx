"use client";

import { useEffect, useState } from "react";

/** Charleston local time, the clock everyone at the port works to. */
export function PortClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  const time = now?.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour12: false }) ?? "--:--:--";
  return (
    <span className="font-mono text-xs tabular-nums text-muted" title="Port of Charleston local time">
      CHS <span className="text-fg">{time}</span>
    </span>
  );
}
