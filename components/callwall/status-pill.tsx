const PILL: Record<string, { label: string; cls: string }> = {
  standby: { label: "Standing by", cls: "border-line text-muted" },
  queued: { label: "Dialing", cls: "border-line text-muted" },
  ringing: { label: "Ringing", cls: "border-sodium text-sodium animate-ring-pulse" },
  in_progress: { label: "Live", cls: "border-signal bg-signal/10 text-signal animate-live-glow" },
  ended: { label: "Ended", cls: "border-line text-muted" },
  no_answer: { label: "No answer", cls: "border-alarm/60 text-alarm" },
  failed: { label: "Failed", cls: "border-alarm/60 text-alarm" },
};

export function StatusPill({ status }: { status: string }) {
  const p = PILL[status] ?? PILL.queued;
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 font-mono text-[11px] ${p.cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === "in_progress" ? "bg-signal" : status === "ringing" ? "bg-sodium" : "bg-current"}`} />
      {p.label}
    </span>
  );
}
