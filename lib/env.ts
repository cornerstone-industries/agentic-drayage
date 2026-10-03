// One place for configuration. Integrations call requireEnv() at the moment they need a key,
// so a missing key fails with the integration's name ("Stripe not configured: set STRIPE_SECRET_KEY")
// instead of a vague 500 deep inside an SDK.

export class NotConfiguredError extends Error {
  readonly integration: string;
  readonly missing: string[];
  constructor(integration: string, missing: string[]) {
    super(`${integration} not configured: set ${missing.join(", ")}`);
    this.name = "NotConfiguredError";
    this.integration = integration;
    this.missing = missing;
  }
}

export function requireEnv<const K extends readonly string[]>(
  integration: string,
  names: K,
): { [P in K[number]]: string } {
  const missing = names.filter((n) => !process.env[n]?.trim());
  if (missing.length) throw new NotConfiguredError(integration, missing);
  return Object.fromEntries(names.map((n) => [n, process.env[n]!.trim()])) as {
    [P in K[number]]: string;
  };
}

function intEnv(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) ? n : fallback;
}

/** live = Vapi dials real phones; web = carriers answer a Vapi web call on /phone/[providerId]; replay = recorded scripts. */
export type CallMode = "live" | "replay" | "web";

export function callMode(): CallMode {
  const mode = process.env.CALL_MODE?.trim();
  return mode === "replay" || mode === "web" ? mode : "live";
}

/** Estimated demurrage per day past the last free day. Shown as "estimated" in the UI. */
export function demurragePerDayCents(): number {
  return intEnv("DEMURRAGE_PER_DAY_CENTS", 17500);
}

/** Platform fee in basis points (300 = 3%). */
export function platformFeeBps(): number {
  return intEnv("PLATFORM_FEE_BPS", 300);
}

/** Public base URL of this deployment, no trailing slash. Falls back to Vercel's production URL. */
export function appUrl(): string {
  const explicit = process.env.APP_URL?.trim();
  if (explicit) return explicit.replace(/\/+$/, "");
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (vercel) return `https://${vercel}`;
  throw new NotConfiguredError("App URL", ["APP_URL"]);
}

/**
 * DEV ONLY. When true and no AI Gateway credentials exist, extraction and ranking use the
 * deterministic fixture implementations (lib/ai/fixture.ts) that only understand the replay scripts.
 * Real Claude takes over automatically as soon as AI_GATEWAY_API_KEY (or Vercel OIDC) is present.
 */
export function devFixtureAiEnabled(): boolean {
  return process.env.DEV_ONLY_FIXTURE_AI?.trim() === "true";
}

export function aiGatewayConfigured(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_OIDC_TOKEN?.trim());
}

export function supabaseUrl(): string {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) throw new NotConfiguredError("Supabase", ["NEXT_PUBLIC_SUPABASE_URL"]);
  return url;
}

export function supabaseAnonKey(): string {
  // NEXT_PUBLIC_* must be referenced literally so Next inlines them into the browser bundle.
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if (!key) throw new NotConfiguredError("Supabase", ["NEXT_PUBLIC_SUPABASE_ANON_KEY"]);
  return key;
}

export function supabaseServiceRoleKey(): string {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SUPABASE_SECRET_KEY?.trim();
  if (!key) throw new NotConfiguredError("Supabase (service role)", ["SUPABASE_SERVICE_ROLE_KEY"]);
  return key;
}
