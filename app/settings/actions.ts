"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getSessionImporter } from "@/lib/auth";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type ActionResult = { ok: true; message: string } | { ok: false; message: string };

const Guardrails = z.object({
  auto_book_enabled: z.boolean(),
  auto_book_limit_usd: z.number().min(0).max(100000),
  auto_quote_enabled: z.boolean(),
  auto_quote_days_before_eta: z.number().int().min(1).max(14),
});

export async function saveGuardrails(input: z.infer<typeof Guardrails>): Promise<ActionResult> {
  const session = await getSessionImporter();
  if (!session) return { ok: false, message: "Sign in again to change settings" };
  const parsed = Guardrails.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the numbers: limit $0 to $100,000, auto-quote 1 to 14 days" };
  const v = parsed.data;
  // RLS: the owner may update their own importer row.
  const supabase = await createClient();
  const { error } = await supabase
    .from("importers")
    .update({
      auto_book_enabled: v.auto_book_enabled,
      auto_book_limit_cents: Math.round(v.auto_book_limit_usd * 100),
      auto_quote_enabled: v.auto_quote_enabled,
      auto_quote_days_before_eta: v.auto_quote_days_before_eta,
    })
    .eq("id", session.importer.id);
  if (error) return { ok: false, message: error.message };
  revalidatePath("/settings");
  revalidatePath("/dashboard");
  return { ok: true, message: "Saved" };
}

const Phone = z.string().regex(/^\+[1-9]\d{7,14}$/, "Enter a full number, like (843) 555-0141 or +44 20 7946 0958");

/** "(843) 555-0141" and "1-843-555-0141" become "+18435550141"; anything starting with + keeps its country code. */
function toE164(phone: string): string {
  const cleaned = phone.replace(/[\s().-]/g, "");
  if (/^\d{10}$/.test(cleaned)) return `+1${cleaned}`;
  if (/^1\d{10}$/.test(cleaned)) return `+${cleaned}`;
  return cleaned;
}

export async function saveProviderPhone(providerId: string, phone: string): Promise<ActionResult> {
  const session = await getSessionImporter();
  if (!session) return { ok: false, message: "Sign in again to change settings" };
  const parsed = Phone.safeParse(toE164(phone));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const db = createAdminClient();
  const { data, error } = await db
    .from("providers")
    .update({ phone: parsed.data })
    .eq("id", providerId)
    .eq("importer_id", session.importer.id)
    .select("id");
  if (error) return { ok: false, message: error.message };
  if (!data?.length) return { ok: false, message: "Provider not found" };
  revalidatePath("/settings");
  return { ok: true, message: "Phone saved" };
}
