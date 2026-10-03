// Date helpers for freight dates. Date-only values (LFD, deliver-by, pickup) are YYYY-MM-DD and
// treated as calendar days; the ETA is a timestamp shown in port time (Charleston, America/New_York).

export const PORT_TZ = "America/New_York";

/** Calendar date (YYYY-MM-DD) of a timestamp in port time. */
export function portDate(iso: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: PORT_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  return parts; // en-CA formats as YYYY-MM-DD
}

export function todayPortDate(): string {
  return portDate(new Date().toISOString());
}

export function addDays(date: string, n: number): string {
  const d = new Date(`${date.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

const asUtc = (date: string) => new Date(`${date.slice(0, 10)}T00:00:00Z`);

export function weekday(date: string): string {
  return asUtc(date).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" });
}

function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

/** "Tuesday the 6th", how a dispatcher says it. */
export function spokenDay(date: string): string {
  return `${weekday(date)} the ${ordinal(asUtc(date).getUTCDate())}`;
}

/** "Tuesday, October 6" */
export function longDate(date: string): string {
  return asUtc(date).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", timeZone: "UTC" });
}

/** "Tue 10/6" */
export function shortDate(date: string | null | undefined): string {
  if (!date) return "--";
  const d = asUtc(date);
  return `${d.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" })} ${d.getUTCMonth() + 1}/${d.getUTCDate()}`;
}

export function cityFromAddress(address: string | null | undefined): string | null {
  const parts = address?.split(",").map((s) => s.trim()) ?? [];
  return parts.length >= 3 ? parts[parts.length - 2] : null;
}

const STATE_NAMES: Record<string, string> = { GA: "Georgia", NC: "North Carolina", SC: "South Carolina", TN: "Tennessee", FL: "Florida" };
export function stateName(code: string | null | undefined): string {
  return (code && STATE_NAMES[code]) || code || "";
}

/** "forty-foot high cube" for TTS-friendly speech. */
export function spokenSize(size: string | null | undefined): string {
  switch (size) {
    case "40HC":
      return "forty-foot high cube";
    case "40GP":
      return "forty-foot standard";
    case "20GP":
      return "twenty-foot standard";
    case "45HC":
      return "forty-five-foot high cube";
    default:
      return size ?? "container";
  }
}
