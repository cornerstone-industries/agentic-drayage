// Sets up the Stripe TEST world for the seeded importer (owner = JUDGE_EMAIL, default judge@portcall.dev):
// a Customer with a saved test card, and test connected accounts for Marshgrass Drayage, Ironclad
// Intermodal and Sweetgrass Transport that can receive destination transfers without anyone opening a
// browser (Custom accounts filled with Stripe's test values). Re-runnable: ready accounts are reused,
// stale ids (a wiped sandbox) are replaced, and ids are saved on the importer / provider rows.
//
//   npm run setup:stripe        (reads .env.local, then .env; needs STRIPE_SECRET_KEY=sk_test_...)
//
// Stripe test values: https://docs.stripe.com/connect/testing
import { config } from "dotenv";
config({ path: ".env.local" });
config();

import type Stripe from "stripe";
import { accountIsOnboarded, createOnboardingLink, ensureExpressAccount, ensureImporterCustomer, getStripe, isMissingResource, stripeMessage, syncProviderOnboarding } from "@/lib/stripe";
import type { AdminClient } from "@/lib/supabase/admin";
import type { Importer, Provider } from "@/lib/types";
import { connectAdmin, runScript, sleep, type Reporter } from "./lib/demo";

const JUDGE_EMAIL = (process.env.JUDGE_EMAIL || "judge@portcall.dev").toLowerCase();
const TARGETS = ["Marshgrass Drayage", "Ironclad Intermodal", "Sweetgrass Transport"];
const READY_TIMEOUT_MS = 45_000;

const slug = (name: string) => name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

/** What a destination charge needs: the transfers capability live, charges and payouts on. */
const isReady = (a: Stripe.Account) => a.capabilities?.transfers === "active" && accountIsOnboarded(a);

async function findImporter(db: AdminClient): Promise<Importer> {
  const { data: list, error } = await db.auth.admin.listUsers({ page: 1, perPage: 1000 });
  if (error) throw new Error(`could not list users: ${error.message}`);
  const user = list.users.find((u) => u.email?.toLowerCase() === JUDGE_EMAIL);
  if (!user) throw new Error(`no user ${JUDGE_EMAIL}: run npm run seed first`);
  const { data: importer, error: impErr } = await db.from("importers").select("*").eq("owner_id", user.id).maybeSingle();
  if (impErr) throw new Error(`importer lookup failed: ${impErr.message}`);
  if (!importer) throw new Error(`${JUDGE_EMAIL} has no importer: run npm run seed first`);
  return importer;
}

/** A card on the customer that works off-session: reuse the saved one, else attach Stripe's test Visa. */
async function ensureCard(db: AdminClient, stripe: Stripe, importerId: string, customerId: string, saved: string | null): Promise<Stripe.PaymentMethod> {
  if (saved) {
    const pm = await stripe.paymentMethods.retrieve(saved).catch((err: unknown) => {
      if (isMissingResource(err)) return null;
      throw err;
    });
    const owner = typeof pm?.customer === "string" ? pm.customer : pm?.customer?.id;
    if (pm?.card && owner === customerId) return pm;
  }
  // pm_card_visa is a test token: attaching it is what makes it usable off-session.
  const pm = await stripe.paymentMethods.attach("pm_card_visa", { customer: customerId });
  await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm.id } });
  const { error } = await db.from("importers").update({ default_payment_method_id: pm.id }).eq("id", importerId);
  if (error) throw new Error(`importers update failed: ${error.message}`);
  return pm;
}

/** The test individual behind a Custom account: every value is a Stripe test token that verifies instantly. */
function testPerson(provider: Provider) {
  const s = slug(provider.name);
  return {
    first_name: "Test",
    last_name: provider.name.split(" ")[0],
    email: `${s}@example.com`,
    phone: "0000000000", // test phone token
    dob: { day: 1, month: 1, year: 1901 }, // successful match
    id_number: "000000000", // successful ID match
    address: { line1: "address_full_match", city: "San Francisco", state: "CA", postal_code: "94102" }, // charges AND payouts enabled
  };
}

const testBusiness = { mcc: "5045", url: "https://accessible.stripe.com", product_description: "Container drayage and intermodal trucking" };
const tosNow = () => ({ date: Math.floor(Date.now() / 1000), ip: "127.0.0.1" });

async function createCustomTestAccount(stripe: Stripe, provider: Provider): Promise<Stripe.Account> {
  return stripe.accounts.create({
    type: "custom",
    country: "US",
    email: `${slug(provider.name)}@example.com`,
    business_type: "individual",
    capabilities: { card_payments: { requested: true }, transfers: { requested: true } },
    business_profile: { ...testBusiness, name: provider.name },
    individual: testPerson(provider),
    external_account: { object: "bank_account", country: "US", currency: "usd", routing_number: "110000000", account_number: "000123456789" }, // payout succeeds
    tos_acceptance: tosNow(),
    metadata: { provider_id: provider.id, importer_id: provider.importer_id ?? "", test_account: "true" },
  });
}

/** Verification can land a few seconds after the create call. */
async function waitUntilReady(stripe: Stripe, accountId: string): Promise<Stripe.Account> {
  const started = Date.now();
  for (;;) {
    const acct = await stripe.accounts.retrieve(accountId);
    if (isReady(acct) || Date.now() - started > READY_TIMEOUT_MS) return acct;
    await sleep(2500);
  }
}

const describeAccount = (a: Stripe.Account) =>
  `transfers=${a.capabilities?.transfers ?? "none"}, charges_enabled=${a.charges_enabled}, payouts_enabled=${a.payouts_enabled}, currently_due=[${(a.requirements?.currently_due ?? []).join(", ")}], disabled_reason=${a.requirements?.disabled_reason ?? "none"}`;

async function setUpProvider(r: Reporter, db: AdminClient, stripe: Stripe, provider: Provider): Promise<void> {
  const check = `provider ${provider.name}`;
  try {
    let acct: Stripe.Account | null = null;
    if (provider.stripe_account_id) {
      acct = await stripe.accounts.retrieve(provider.stripe_account_id).catch((err: unknown) => {
        if (isMissingResource(err)) return null; // the sandbox was reset: replace the stale id
        throw err;
      });
    }

    if (!acct) {
      try {
        acct = await createCustomTestAccount(stripe, provider);
      } catch (err) {
        // No API-only route (Connect not enabled for Custom accounts?): fall back to hosted Express onboarding.
        const express = await ensureExpressAccount(db, stripe, provider);
        const link = await createOnboardingLink(stripe, express.id, provider.id);
        r.fail(check, `could not create a Custom test account (${stripeMessage(err)}). Created Express ${express.id}: finish onboarding in a browser (SMS code 000000, SSN 000-00-0000, DOB 01/01/1901, address line 1 address_full_match, bank 110000000 / 000123456789): ${link}`);
        return;
      }
      const { error } = await db.from("providers").update({ stripe_account_id: acct.id, stripe_onboarded: false }).eq("id", provider.id);
      if (error) throw new Error(`providers update failed: ${error.message}`);
    } else if (!isReady(acct) && acct.type === "custom") {
      // A half-finished Custom account from an earlier run: top it up with the same test values.
      acct = await stripe.accounts.update(acct.id, { business_type: "individual", business_profile: { ...testBusiness, name: provider.name }, individual: testPerson(provider), tos_acceptance: tosNow() });
    }

    acct = await waitUntilReady(stripe, acct.id);
    await syncProviderOnboarding(db, acct);
    if (isReady(acct)) {
      r.pass(check, `${acct.id} (${acct.type}) can receive transfers`);
    } else if (acct.type === "express") {
      const link = await createOnboardingLink(stripe, acct.id, provider.id);
      r.fail(check, `${acct.id} is not onboarded yet (${describeAccount(acct)}). Finish it in a browser: ${link}`);
    } else {
      r.fail(check, `${acct.id} is not ready after ${READY_TIMEOUT_MS / 1000}s (${describeAccount(acct)}). Delete it in the Stripe dashboard (Connect > Accounts) and re-run`);
    }
  } catch (err) {
    r.fail(check, stripeMessage(err));
  }
}

void runScript(async (r) => {
  const stripe = await r.run(
    "stripe key",
    async () => {
      const s = getStripe(); // refuses anything but sk_test_
      await s.balance.retrieve(); // proves Stripe accepts the key
      return s;
    },
    "test key accepted by Stripe",
  );
  const db = await r.run("supabase", () => connectAdmin(), "service role connected");
  if (!stripe || !db) return;

  const importer = await r.run("importer", () => findImporter(db), (i) => `${i.name} (owner ${JUDGE_EMAIL})`);
  if (!importer) return;

  const customerId = await r.run("customer", () => ensureImporterCustomer(db, stripe, importer), (id) => id);
  if (!customerId) return;

  // ensureImporterCustomer clears the saved card when it had to create a new customer: re-read the row.
  const { data: fresh } = await db.from("importers").select("default_payment_method_id").eq("id", importer.id).single();
  const card = await r.run(
    "card",
    () => ensureCard(db, stripe, importer.id, customerId, fresh?.default_payment_method_id ?? null),
    (pm) => `${pm.id} ${pm.card?.brand ?? "card"} ending ${pm.card?.last4 ?? "????"}, default for ${customerId}`,
  );
  if (!card) return;

  const { data: providers, error } = await db.from("providers").select("*").eq("importer_id", importer.id).order("created_at");
  if (error) {
    r.fail("providers", error.message);
    return;
  }
  for (const name of TARGETS) {
    const provider = providers?.find((p) => p.name === name);
    if (!provider) {
      r.fail(`provider ${name}`, "not in the database: run npm run seed first");
      continue;
    }
    await setUpProvider(r, db, stripe, provider);
  }

  if (!r.failures) {
    r.info(`ready: ${importer.name} pays with ${card.id}; ${TARGETS.length} providers can receive destination transfers. Next: npm run test:stripe`);
  }
});
