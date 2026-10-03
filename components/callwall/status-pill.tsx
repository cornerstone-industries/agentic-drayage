const PILL: Record<string, { label: string; cls: string; dot: string }> = {
  standby: { label: "Standing by", cls: "text-muted", dot: "bg-dim" },
  queued: { label: "Dialing", cls: "text-muted", dot: "bg-steel" },
  ringing: { label: "Ringing", cls: "text-crane", dot: "bg-crane animate-pulse" },
  in_progress: { label: "On the line", cls: "text-live", dot: "bg-live animate-live-dot" },
  ended: { label: "Hung up", cls: "text-muted", dot: "bg-dim" },
  no_answer: { label: "No answer", cls: "text-red", dot: "bg-red" },
  failed: { label: "Call failed", cls: "text-red", dot: "bg-red" },
};

export function StatusPill({ status }: { status: string }) {
  const p = PILL[status] ?? PILL.queued;
  return (
    <span className={`inline-flex items-center gap-2 font-cond text-[13px] font-bold tracking-[0.02em] ${p.cls}`}>
      <span className={`h-2 w-2 rounded-full ${p.dot}`} />
      {p.label}
    </span>
  );
}
