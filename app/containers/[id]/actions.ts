"use server";

import { revalidatePath } from "next/cache";
import { getSessionImporter } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { resetContainerHistory } from "@/lib/demo-reset";

export async function resetBox(containerId: string): Promise<{ ok: boolean; message: string }> {
  const session = await getSessionImporter();
  if (!session) return { ok: false, message: "Sign in again to reset" };
  const db = createAdminClient();
  const { data: c } = await db.from("containers").select("id").eq("id", containerId).eq("importer_id", session.importer.id).maybeSingle();
  if (!c) return { ok: false, message: "Container not found" };
  try {
    await resetContainerHistory(db, c.id);
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : "Reset failed" };
  }
  revalidatePath(`/containers/${containerId}`);
  revalidatePath("/dashboard");
  return { ok: true, message: "Reset" };
}
