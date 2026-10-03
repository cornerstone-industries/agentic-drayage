// Vapi server messages -> Supabase rows. Every write here is what the Call Wall animates from via
// Realtime. The route answers fast; slow work (extraction, ranking) comes back as a followUp that
// the route runs with after().
import { z } from "zod";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { logEvent } from "@/lib/events";
import { sleep } from "@/lib/background";
import { finalizeQuoteRequest, runExtraction } from "@/lib/pipeline";
import type { Call, CallStatus } from "@/lib/types";

const MessageSchema = z
  .object({
    type: z.string(),
    status: z.string().optional(),
    role: z.string().optional(),
    transcriptType: z.string().optional(),
    transcript: z.string().optional(),
    endedReason: z.string().optional(),
    call: z
      .object({
        id: z.string().optional(),
        name: z.string().optional(),
        assistantOverrides: z.object({ metadata: z.record(z.string(), z.unknown()).optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
    analysis: z.object({ summary: z.string().optional() }).passthrough().optional(),
    artifact: z
      .object({
        transcript: z.string().optional(),
        messages: z.array(z.object({ role: z.string().optional(), message: z.string().optional() }).passthrough()).optional(),
        recordingUrl: z.string().optional(),
        presignedStereoUrl: z.string().optional(),
        recording: z.object({ stereoUrl: z.string().optional() }).passthrough().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type VapiMessage = z.infer<typeof MessageSchema>;
export type ProcessResult = { handled: string; followUp?: () => Promise<void> };

const TERMINAL: ReadonlySet<string> = new Set(["ended", "failed", "no_answer"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Map Vapi's endedReason onto our call status. */
export function statusForEndedReason(reason: string | undefined): CallStatus {
  if (!reason) return "ended";
  if (/did-not-answer|customer-busy|voicemail|no-answer/.test(reason)) return "no_answer";
  if (/error|failed|fault|frozen|insufficient|limit-reached|misdialed/.test(reason)) return "failed";
  return "ended";
}

async function findCall(db: AdminClient, msg: VapiMessage): Promise<(Call & { container_id: string }) | null> {
  const select = "*, quote_request:quote_requests(container_id)";
  const vapiId = msg.call?.id;
  if (vapiId) {
    const { data } = await db.from("calls").select(select).eq("vapi_call_id", vapiId).maybeSingle();
    if (data) return { ...data, container_id: data.quote_request!.container_id! };
  }
  // The first events can beat our own write of vapi_call_id; fall back to the ids we set on the call.
  const ours = [msg.call?.assistantOverrides?.metadata?.callId, msg.call?.name].find((v): v is string => typeof v === "string" && UUID.test(v));
  if (ours) {
    const { data } = await db.from("calls").select(select).eq("id", ours).maybeSingle();
    if (data) {
      if (vapiId && !data.vapi_call_id) await db.from("calls").update({ vapi_call_id: vapiId }).eq("id", data.id);
      return { ...data, container_id: data.quote_request!.container_id! };
    }
  }
  return null;
}

export async function processVapiMessage(raw: unknown): Promise<ProcessResult> {
  const parsed = MessageSchema.safeParse(raw);
  if (!parsed.success) return { handled: "ignored: unrecognized message" };
  const msg = parsed.data;
  const kind = msg.type.startsWith("transcript") ? "transcript" : msg.type;
  if (!["status-update", "speech-update", "transcript", "end-of-call-report"].includes(kind)) {
    return { handled: `ignored: ${msg.type}` };
  }

  const db = createAdminClient();
  const call = await findCall(db, msg);
  if (!call) return { handled: "ignored: unknown call" };
  const now = new Date().toISOString();

  if (kind === "status-update") {
    const s = msg.status;
    if (TERMINAL.has(call.status ?? "")) return { handled: "status-update: already ended" };
    if (s === "ringing" && call.status === "queued") {
      await db.from("calls").update({ status: "ringing" }).eq("id", call.id);
    } else if (s === "in-progress" && call.status !== "in_progress") {
      await db.from("calls").update({ status: "in_progress", started_at: call.started_at ?? now }).eq("id", call.id);
      await logEvent(db, call.container_id, "call_started", { call_id: call.id, provider_id: call.provider_id });
    } else if (s === "ended") {
      const status = statusForEndedReason(msg.endedReason);
      await db.from("calls").update({ status, ended_at: now, speaking: null }).eq("id", call.id);
      await logEvent(db, call.container_id, "call_ended", { call_id: call.id, provider_id: call.provider_id, status, ended_reason: msg.endedReason ?? null });
      if (status !== "ended") {
        // No conversation happened; no end-of-call report work to wait for.
        await db.from("calls").update({ summary: call.summary ?? `Call ended: ${msg.endedReason}` }).eq("id", call.id);
        return { handled: `status-update: ${status}`, followUp: () => finalizeQuoteRequest(call.quote_request_id!) };
      }
    }
    return { handled: `status-update: ${s}` };
  }

  if (kind === "speech-update") {
    if (TERMINAL.has(call.status ?? "")) return { handled: "speech-update: call over" };
    const role = msg.role === "assistant" || msg.role === "user" ? msg.role : null;
    if (!role) return { handled: "speech-update: unknown role" };
    if (msg.status === "started") await db.from("calls").update({ speaking: role }).eq("id", call.id);
    else if (msg.status === "stopped") await db.from("calls").update({ speaking: null }).eq("id", call.id).eq("speaking", role);
    return { handled: `speech-update: ${role} ${msg.status}` };
  }

  if (kind === "transcript") {
    if (msg.transcriptType && msg.transcriptType !== "final") return { handled: "transcript: partial skipped" };
    const text = msg.transcript?.trim();
    const role = msg.role === "assistant" || msg.role === "user" ? msg.role : null;
    if (!text || !role) return { handled: "transcript: empty" };
    const { data: line, error } = await db.from("transcript_lines").insert({ call_id: call.id, role, text }).select("id").single();
    if (error) throw new Error(`transcript insert failed: ${error.message}`);
    if (role !== "user") return { handled: "transcript: assistant line" };
    // Debounced live extraction: only the newest dispatcher line in an 800 ms window runs it.
    return {
      handled: "transcript: dispatcher line",
      followUp: async () => {
        await sleep(800);
        const { data: newer } = await db.from("transcript_lines").select("id").eq("call_id", call.id).eq("role", "user").gt("id", line.id).limit(1);
        if (newer?.length) return;
        await runExtraction(call.id);
      },
    };
  }

  // end-of-call-report
  const recording = msg.artifact?.presignedStereoUrl ?? msg.artifact?.recording?.stereoUrl ?? msg.artifact?.recordingUrl ?? null;
  const status = TERMINAL.has(call.status ?? "") ? call.status : statusForEndedReason(msg.endedReason);
  await db
    .from("calls")
    .update({ recording_url: recording, ended_at: call.ended_at ?? now, status, speaking: null })
    .eq("id", call.id);
  if (call.status !== status && status) {
    await logEvent(db, call.container_id, "call_ended", { call_id: call.id, provider_id: call.provider_id, status, ended_reason: msg.endedReason ?? null });
  }

  return {
    handled: "end-of-call-report",
    followUp: async () => {
      try {
        await backfillTranscript(db, call.id, msg);
        await runExtraction(call.id);
      } finally {
        // summary marks "report processed"; the last call to get here triggers the ranking.
        await db.from("calls").update({ summary: msg.analysis?.summary?.trim() || "Call complete." }).eq("id", call.id);
        await finalizeQuoteRequest(call.quote_request_id!);
      }
    },
  };
}

/** If live transcript events never arrived, rebuild the lines from the end-of-call artifact. */
async function backfillTranscript(db: AdminClient, callId: string, msg: VapiMessage) {
  const { count } = await db.from("transcript_lines").select("id", { count: "exact", head: true }).eq("call_id", callId);
  if (count) return;
  const rows = (msg.artifact?.messages ?? [])
    .map((m) => ({
      call_id: callId,
      role: m.role === "user" ? "user" : m.role === "bot" || m.role === "assistant" ? "assistant" : null,
      text: m.message?.trim() ?? "",
    }))
    .filter((r): r is { call_id: string; role: "user" | "assistant"; text: string } => Boolean(r.role && r.text));
  if (rows.length) await db.from("transcript_lines").insert(rows);
}
