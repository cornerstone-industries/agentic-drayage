"use client";

import { useEffect, useState } from "react";

/** Charleston local time, the clock everyone at the port works to. */
export function PortClock() {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => {
    const first = setTimeout(() => setNow(new Date()), 0);
    const id = setInterval(() => setNow(new Date()), 15000);
    return () => {
      clearTimeout(first);
      clearInterval(id);
    };
  }, []);
  const time = now?.toLocaleTimeString("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit" }) ?? "--:--";
  return (
    <span className="whitespace-nowrap text-[14px] font-semibold tabular-nums text-muted" title="Port of Charleston local time">
      Charleston <span className="text-fg">{time}</span>
    </span>
  );
}
