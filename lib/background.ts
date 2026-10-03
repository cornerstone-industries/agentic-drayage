import { after } from "next/server";

/**
 * Run work after the response is sent. On Vercel, after() keeps the function alive (waitUntil)
 * up to the route's maxDuration. Outside a request scope (scripts) it just runs detached.
 */
export function runInBackground(label: string, fn: () => Promise<unknown>): void {
  const wrapped = async () => {
    try {
      await fn();
    } catch (err) {
      console.error(`[${label}]`, err instanceof Error ? err.message : err);
    }
  };
  try {
    after(wrapped);
  } catch {
    void wrapped();
  }
}

export const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));
