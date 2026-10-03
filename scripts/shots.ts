// Captures the submission screenshots with Playwright (CLAUDE.md section 14b) and fails on any console
// error or uncaught page error. Point it at an app running CALL_MODE=replay with the demo data seeded:
//
//   CALL_MODE=replay npm run shots      (BASE_URL defaults to http://localhost:3000)
//
// Writes screenshots/dashboard.png, call-wall-mid-call.png, ranking-reveal.png and tender-phone.png.
// Like test:replay it refuses to run unless CALL_MODE=replay is set here, because clicking Get quotes on a
// live server would dial the real provider phones. First run needs the browser: npx playwright install chromium
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { mkdir } from "node:fs/promises";
import path from "node:path";
import { chromium, type Page } from "playwright";
import { callMode } from "@/lib/env";
import { connectAdmin, resetDemoContainer, runScript, sleep } from "./lib/demo";

const BOOKING_TIMEOUT_MS = 60_000;

void runScript(async (r) => {
  const mode = callMode();
  if (mode !== "replay") {
    r.fail(
      "call-mode",
      `CALL_MODE is "${mode}" here. Refusing to start: Get quotes on a live server would dial the real provider phones. Run CALL_MODE=replay npm run shots, and start the server with CALL_MODE=replay too`,
    );
    return;
  }
  const baseUrl = (process.env.BASE_URL || "http://localhost:3000").trim().replace(/\/+$/, "");
  const email = process.env.JUDGE_EMAIL || "judge@portcall.dev";
  const password = process.env.JUDGE_PASSWORD || "portcall-judge-2026";
  const outDir = path.join(process.cwd(), "screenshots");

  const db = await r.run("supabase", () => connectAdmin(), "service role connected");
  if (!db) return;
  const browser = await r.run("browser", () => chromium.launch(), "chromium launched");
  if (!browser) return;

  const problems: string[] = [];
  const watch = (page: Page, label: string) => {
    page.setDefaultTimeout(30_000);
    page.setDefaultNavigationTimeout(90_000);
    page.on("console", (msg) => {
      if (msg.type() === "error") problems.push(`${label} console error: ${msg.text()}`);
    });
    page.on("pageerror", (err) => problems.push(`${label} page error: ${err.message}`));
  };
  const shot = async (page: Page, name: string) => {
    await mkdir(outDir, { recursive: true });
    await page.screenshot({ path: path.join(outDir, name) });
    return `screenshots/${name}`;
  };
  // Entrance animations finish well inside this (nothing runs longer than about 600 ms).
  const settle = (page: Page, ms = 1200) => page.waitForTimeout(ms);

  try {
    const desktop = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await desktop.newPage();
    watch(page, "desktop");

    const signedIn = await r.run(
      "login",
      async () => {
        await page.goto(`${baseUrl}/login`);
        await page.fill('input[name="email"]', email);
        await page.fill('input[name="password"]', password);
        await Promise.all([page.waitForURL("**/dashboard", { timeout: 60_000 }), page.click('button[type="submit"]')]);
        return true;
      },
      `signed in as ${email}`,
    );
    if (!signedIn) return;

    const dashboard = await r.run(
      "dashboard",
      async () => {
        await page.locator('[data-testid="dashboard"]').waitFor({ state: "visible" });
        await settle(page);
        return shot(page, "dashboard.png");
      },
      (file) => file,
    );
    if (!dashboard) return;

    const reset = await r.run("reset", () => resetDemoContainer(db), ({ container }) => `${container.container_number} back to inbound`);
    if (!reset) return;
    const containerId = reset.container.id;

    const midCall = await r.run(
      "call-wall",
      async () => {
        await page.goto(`${baseUrl}/containers/${containerId}`);
        // Click only once the page is hydrated and its Realtime channel is live, or the click (and early events) are lost.
        await page.locator('[data-testid="call-wall"][data-realtime="on"]').waitFor({ state: "visible", timeout: 60_000 });
        await page.locator('[data-testid="get-quotes"]').click();
        await page.locator('[data-testid="call-card"][data-status="in_progress"]').first().waitFor({ state: "visible", timeout: 120_000 });
        await settle(page, 6000);
        return shot(page, "call-wall-mid-call.png");
      },
      (file) => file,
    );
    if (!midCall) return;

    const ranking = await r.run(
      "ranking-reveal",
      async () => {
        await page.locator('[data-testid="ranking-reveal"]').first().waitFor({ state: "visible", timeout: 240_000 });
        await settle(page, 4000);
        return shot(page, "ranking-reveal.png");
      },
      (file) => file,
    );
    if (!ranking) return;

    // Auto-book runs right after the recommendation, so give it a moment before declaring no booking.
    const token = await r.run(
      "booking",
      async () => {
        const deadline = Date.now() + BOOKING_TIMEOUT_MS;
        for (;;) {
          const { data, error } = await db
            .from("bookings")
            .select("tender_token")
            .eq("container_id", containerId)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw new Error(`bookings lookup failed: ${error.message}`);
          if (data?.tender_token) return data.tender_token;
          if (Date.now() > deadline) throw new Error("no booking yet: Stripe not configured or auto-book off");
          await sleep(2000);
        }
      },
      "booked, tender link found",
    );
    if (!token) return;

    await r.run(
      "tender-phone",
      async () => {
        const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
        const tender = await phone.newPage();
        watch(tender, "phone");
        await tender.goto(`${baseUrl}/tender/${token}`);
        await tender.locator('[data-testid="tender-page"]').waitFor({ state: "visible" });
        await settle(tender);
        return shot(tender, "tender-phone.png");
      },
      (file) => file,
    );
  } finally {
    await browser.close();
    if (problems.length) {
      r.fail("console", `${problems.length} console or page errors, first: ${problems.slice(0, 3).join(" | ")}`);
    } else {
      r.pass("console", "no console errors or page errors");
    }
  }
});
