// Stripe client plus the small helpers every Stripe route and script shares. TEST MODE ONLY.
import Stripe from "stripe";
import { NotConfiguredError, appUrl, requireEnv } from "@/lib/env";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Importer, Provider } from "@/lib/types";

/** Pinned so an SDK upgrade never changes API behavior mid-demo (this is stripe-node 23.0.0's default). */
export const STRIPE_API_VERSION = "2026-09-30.endive" as const;

/** Raised when STRIPE_SECRET_KEY is not a test key. This app never touches live mode. */
export class StripeModeError extends Error {
  constructor() {
    super("Stripe runs in TEST mode only: STRIPE_SECRET_KEY must start with sk_test_ (refusing to use any other key)");
    this.name = "StripeModeError";
  }
}

/** A missing key and a non-test key are both setup problems: routes answer 503 for either. */
export function isStripeConfigError(err: unknown): err is NotConfiguredError | StripeModeError {
  return err instanceof NotConfiguredError || err instanceof StripeModeError;
}

let cached: { key: string; client: Stripe } | undefined;

/** Read at call time so a missing key fails with "Stripe not configured: set STRIPE_SECRET_KEY". */
export function getStripe(): Stripe {
  const { STRIPE_SECRET_KEY: key } = requireEnv("Stripe", ["STRIPE_SECRET_KEY"]);
  if (!key.startsWith("sk_test_")) throw new StripeModeError();
  if (cached?.key !== key) {
    cached = {
      key,
      client: new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2, timeout: 25_000, appInfo: { name: "PortCall" } }),
    };
  }
  return cached.client;
}

/** Stripe's own message for a failed call, falling back to the generic error text. */
export function stripeMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** True for Stripe's "no such object" error, so stale ids from a wiped sandbox can be replaced. */
export function isMissingResource(err: unknown): boolean {
  return err instanceof Stripe.errors.StripeInvalidRequestError && err.code === "resource_missing";
}

/** Destination transfers need the account live: charges and payouts both enabled. */
export function accountIsOnboarded(a: Pick<Stripe.Account, "charges_enabled" | "payouts_enabled">): boolean {
  return Boolean(a.charges_enabled && a.payouts_enabled);
}

/** Mirrors a connected account's readiness onto the provider row(s) that use it. */
export async function syncProviderOnboarding(db: AdminClient, acct: Stripe.Account): Promise<boolean> {
  const onboarded = accountIsOnboarded(acct);
  const { error } = await db.from("providers").update({ stripe_onboarded: onboarded }).eq("stripe_account_id", acct.id);
  if (error) throw new Error(`providers update failed: ${error.message}`);
  return onboarded;
}

/** The importer's Stripe Customer: reused when it still exists, otherwise created and saved. */
export async function ensureImporterCustomer(
  db: AdminClient,
  stripe: Stripe,
  importer: Pick<Importer, "id" | "name" | "stripe_customer_id">,
): Promise<string> {
  if (importer.stripe_customer_id) {
    const existing = await stripe.customers.retrieve(importer.stripe_customer_id).catch((err: unknown) => {
      if (isMissingResource(err)) return null; // sandbox was reset: the saved id is stale
      throw err;
    });
    if (existing && !("deleted" in existing && existing.deleted)) return existing.id;
  }
  const customer = await stripe.customers.create({
    name: importer.name,
    description: "PortCall importer",
    metadata: { importer_id: importer.id },
  });
  // A new customer owns none of the old payment methods.
  const { error } = await db.from("importers").update({ stripe_customer_id: customer.id, default_payment_method_id: null }).eq("id", importer.id);
  if (error) throw new Error(`importers update failed: ${error.message}`);
  return customer.id;
}

/**
 * After a setup-mode Checkout: saves the new card as the importer's default (and the customer's).
 * Null when no importer uses that customer (a setup that did not come from this app).
 */
export async function saveDefaultCard(
  db: AdminClient,
  stripe: Stripe,
  args: { customerId: string; setupIntentId: string },
): Promise<{ importerId: string; paymentMethodId: string } | null> {
  const { data: importer, error } = await db.from("importers").select("id").eq("stripe_customer_id", args.customerId).maybeSingle();
  if (error) throw new Error(`importers lookup failed: ${error.message}`);
  if (!importer) return null;

  const si = await stripe.setupIntents.retrieve(args.setupIntentId);
  const paymentMethodId = typeof si.payment_method === "string" ? si.payment_method : si.payment_method?.id;
  if (si.status !== "succeeded" || !paymentMethodId) throw new Error(`Card setup ${si.id} is ${si.status}: no card was saved`);

  // PaymentIntents pass payment_method explicitly; the customer default is for the Stripe dashboard.
  await stripe.customers.update(args.customerId, { invoice_settings: { default_payment_method: paymentMethodId } });
  const { error: upErr } = await db.from("importers").update({ default_payment_method_id: paymentMethodId }).eq("id", importer.id);
  if (upErr) throw new Error(`importers update failed: ${upErr.message}`);
  return { importerId: importer.id, paymentMethodId };
}

/** The provider's Express account: reused when it still exists on Stripe, otherwise created and saved. */
export async function ensureExpressAccount(
  db: AdminClient,
  stripe: Stripe,
  provider: Pick<Provider, "id" | "importer_id" | "name" | "email" | "stripe_account_id">,
): Promise<Stripe.Account> {
  if (provider.stripe_account_id) {
    const existing = await stripe.accounts.retrieve(provider.stripe_account_id).catch((err: unknown) => {
      if (isMissingResource(err)) return null;
      throw err;
    });
    if (existing) return existing;
  }
  const acct = await stripe.accounts.create({
    type: "express",
    country: "US",
    email: provider.email,
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_profile: { name: provider.name, product_description: "Container drayage and intermodal trucking" },
    metadata: { provider_id: provider.id, importer_id: provider.importer_id ?? "" },
  });
  const { error } = await db.from("providers").update({ stripe_account_id: acct.id, stripe_onboarded: false }).eq("id", provider.id);
  if (error) throw new Error(`providers update failed: ${error.message}`);
  return acct;
}

/** Hosted onboarding link. refresh_url regenerates a link, return_url re-checks the account. */
export async function createOnboardingLink(stripe: Stripe, accountId: string, providerId: string): Promise<string> {
  const base = appUrl();
  const link = await stripe.accountLinks.create({
    account: accountId,
    type: "account_onboarding",
    refresh_url: `${base}/api/stripe/connect?providerId=${providerId}`,
    return_url: `${base}/api/stripe/connect/return?providerId=${providerId}`,
  });
  return link.url;
}
