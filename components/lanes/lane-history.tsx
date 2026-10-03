import type { LaneHistory } from "@/lib/lanes";

const COLORS: Record<string, string> = {
  "Marshgrass Drayage": "#121417",
  "Ironclad Intermodal": "#E9561A",
  "Sweetgrass Transport": "#2453D6",
};
const FALLBACK = ["#0B875B", "#7A2E3B", "#5E6670"];
const RED = "#D83A2E";

const usd = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100).replace(/\.00$/, "");
const usd0 = (cents: number) => `$${Math.round(cents / 100).toLocaleString("en-US")}`;
const pct = (x: number) => `${Math.round(x * 100)}%`;
const label = (date: string) => new Date(`${date}T12:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** Smooths a carrier's quotes into a readable line: the median of each point and its two neighbors. */
function smooth(values: number[]): number[] {
  return values.map((_, i) => {
    const w = values.slice(Math.max(0, i - 1), i + 2).sort((a, b) => a - b);
    return w[Math.floor(w.length / 2)];
  });
}

export function LaneHistoryPanel({ history, today }: { history: LaneHistory; today: Record<string, number> }) {
  const colorOf = (name: string, i: number) => COLORS[name] ?? FALLBACK[i % FALLBACK.length];
  const W = 760;
  const H = 230;
  const L = 54;
  const R = 70;
  const T = 14;
  const B = 28;
  const iw = W - L - R;
  const ih = H - T - B;

  const t0 = Date.parse(history.from);
  const t1 = Date.parse(history.to);
  const all = [...history.carriers.flatMap((c) => c.points.map((p) => p.allInCents)), ...Object.values(today)];
  const lo = Math.min(...all);
  const hi = Math.max(...all);
  const pad = Math.max(2000, (hi - lo) * 0.08);
  const step = 5000; // $50 gridlines
  const yMin = Math.floor((lo - pad) / step) * step;
  const yMax = Math.ceil((hi + pad) / step) * step;
  const x = (date: string) => L + ((Date.parse(date) - t0) / Math.max(1, t1 - t0)) * iw;
  const y = (cents: number) => T + (1 - (cents - yMin) / Math.max(1, yMax - yMin)) * ih;
  const ticks: number[] = [];
  for (let v = yMin; v <= yMax; v += step * Math.max(1, Math.round((yMax - yMin) / step / 4))) ticks.push(v);

  // Three plain findings, strongest first: the cheap-but-late trap, who is reliable, and who is moving.
  const cheapest = [...history.carriers].sort((a, b) => a.medianCents - b.medianCents)[0];
  const reliable = [...history.carriers].sort((a, b) => a.lateRate - b.lateRate || b.winRate - a.winRate)[0];
  const mover = [...history.carriers].filter((c) => c.trendPct != null && Math.abs(c.trendPct) >= 1.5).sort((a, b) => Math.abs(b.trendPct!) - Math.abs(a.trendPct!))[0];
  const insights: string[] = [];
  if (cheapest && cheapest.lateRate >= 0.2) {
    insights.push(`${cheapest.name} is usually the cheapest at ${usd0(cheapest.medianCents)}, but picked up after the last free day on ${pct(cheapest.lateRate)} of loads.`);
  }
  if (reliable && reliable !== cheapest) {
    insights.push(`${reliable.name} picked up on time on ${pct(1 - reliable.lateRate)} of loads, usually at ${usd0(reliable.medianCents)}.`);
  }
  if (mover) insights.push(`${mover.name} is ${mover.trendPct! > 0 ? "up" : "down"} ${Math.abs(mover.trendPct!).toFixed(1)}% over the last 30 days.`);

  return (
    <section className="mt-12" aria-label="Lane history" data-testid="lane-history">
      <div className="overflow-hidden rounded-[18px] border border-rule bg-sheet">
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-rule px-6 py-4">
          <div>
            <h2 className="font-cond text-[24px] font-bold leading-tight text-fg">Lane history</h2>
            <p className="mt-0.5 text-[14px] text-muted">
              Charleston to {history.city}, {history.state}, {history.size}, last {history.days} days
            </p>
          </div>
          <p className="text-[12.5px] text-muted">
            {history.seedCount + history.callCount} quotes: {history.seedCount} synthetic seed, {history.callCount} from PortCall calls. Every call adds to it.
          </p>
        </div>

        {insights.length > 0 && (
          <div className="border-b border-rule bg-panel-2 px-6 py-3.5 text-[15px] leading-relaxed text-fg">
            {insights.map((s) => (
              <p key={s}>{s}</p>
            ))}
          </div>
        )}

        <div className="px-4 pt-4 sm:px-6">
          <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="All-in quotes per carrier over time">
            {ticks.map((v) => (
              <g key={v}>
                <line x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke="rgb(var(--rule-rgb))" strokeWidth="1" />
                <text x={L - 10} y={y(v) + 4} textAnchor="end" fontSize="11" fill="rgb(var(--muted-rgb))" fontFamily="var(--font-plex-mono)">
                  {usd0(v)}
                </text>
              </g>
            ))}
            {[history.from, new Date((t0 + t1) / 2).toISOString().slice(0, 10)].map((d, i) => (
              <text key={d} x={x(d)} y={H - 8} textAnchor={i === 0 ? "start" : "middle"} fontSize="11" fill="rgb(var(--muted-rgb))">
                {label(d)}
              </text>
            ))}
            <text x={W - R} y={H - 8} textAnchor="end" fontSize="11" fontWeight="600" fill="rgb(var(--text-rgb))">
              Today
            </text>

            {history.carriers.map((c, i) => {
              const color = colorOf(c.name, i);
              const pts = c.points;
              const sm = smooth(pts.map((p) => p.allInCents));
              return (
                <g key={c.name}>
                  <polyline
                    points={pts.map((p, j) => `${x(p.date).toFixed(1)},${y(sm[j]).toFixed(1)}`).join(" ")}
                    fill="none"
                    stroke={color}
                    strokeWidth="2"
                    strokeLinejoin="round"
                    strokeLinecap="round"
                    opacity="0.85"
                  />
                  {pts.map((p, j) => (
                    <circle
                      key={`${p.date}-${j}`}
                      cx={x(p.date)}
                      cy={y(p.allInCents)}
                      r={p.late ? 3.6 : 2.6}
                      fill={p.late ? "white" : color}
                      stroke={p.late ? RED : "none"}
                      strokeWidth={p.late ? 1.6 : 0}
                      opacity={p.late ? 1 : 0.45}
                    >
                      <title>{`${c.name}, ${label(p.date)}: ${usd(p.allInCents)}${p.late ? ", picked up after the last free day" : ""}${p.won ? ", won" : ""}`}</title>
                    </circle>
                  ))}
                  {today[c.name] != null && (
                    <g>
                      <circle cx={W - R} cy={y(today[c.name])} r="6.5" fill={color} stroke="white" strokeWidth="2.5" />
                      <text x={W - R + 11} y={y(today[c.name]) + 4} fontSize="11.5" fontWeight="700" fill={color} fontFamily="var(--font-plex-mono)">
                        {usd0(today[c.name])}
                      </text>
                    </g>
                  )}
                </g>
              );
            })}
          </svg>
          <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 pb-4 pt-1 text-[12.5px] text-muted">
            {history.carriers.map((c, i) => (
              <span key={c.name} className="inline-flex items-center gap-1.5">
                <span className="h-[3px] w-4 rounded-full" style={{ background: colorOf(c.name, i) }} />
                {c.name}
              </span>
            ))}
            <span className="inline-flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full border-[1.6px] bg-white" style={{ borderColor: RED }} />
              Picked up after the last free day
            </span>
          </div>
        </div>

        <div className="overflow-x-auto border-t border-rule">
          <table className="w-full min-w-[640px] text-left text-[14px]">
            <thead>
              <tr className="text-[12.5px] text-muted">
                <th className="px-6 py-2.5 font-semibold">Carrier</th>
                <th className="px-3 py-2.5 font-semibold">Usually (middle 50%)</th>
                <th className="px-3 py-2.5 font-semibold">30-day trend</th>
                <th className="px-3 py-2.5 font-semibold">Picks up late</th>
                <th className="px-3 py-2.5 font-semibold">Wins</th>
                <th className="px-6 py-2.5 text-right font-semibold">Today</th>
              </tr>
            </thead>
            <tbody>
              {history.carriers.map((c, i) => {
                const now = today[c.name];
                const vs = now != null ? ((now - c.medianCents) / c.medianCents) * 100 : null;
                return (
                  <tr key={c.name} className="border-t border-rule">
                    <td className="px-6 py-3">
                      <span className="inline-flex items-center gap-2 font-semibold text-fg">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ background: colorOf(c.name, i) }} />
                        {c.name}
                      </span>
                      <span className="block pl-[18px] text-[12px] text-muted">{c.count} quotes</span>
                    </td>
                    <td className="px-3 py-3">
                      <span className="font-mono font-semibold text-fg">{usd0(c.medianCents)}</span>
                      <span className="ml-2 text-[12.5px] text-muted">
                        {usd0(c.lowCents)} to {usd0(c.highCents)}
                      </span>
                    </td>
                    <td className={`px-3 py-3 font-mono ${c.trendPct == null ? "text-dim" : c.trendPct > 0.5 ? "text-red" : c.trendPct < -0.5 ? "text-live" : "text-muted"}`}>
                      {c.trendPct == null ? "–" : `${c.trendPct > 0 ? "▲" : c.trendPct < 0 ? "▼" : ""} ${Math.abs(c.trendPct).toFixed(1)}%`}
                    </td>
                    <td className={`px-3 py-3 font-mono ${c.lateRate >= 0.2 ? "font-semibold text-red" : "text-fg"}`}>{pct(c.lateRate)}</td>
                    <td className="px-3 py-3 font-mono text-fg">{pct(c.winRate)}</td>
                    <td className="px-6 py-3 text-right">
                      {now == null ? (
                        <span className="text-dim">–</span>
                      ) : (
                        <span>
                          <span className="font-mono font-semibold text-fg">{usd(now)}</span>
                          <span className={`ml-2 text-[12.5px] ${vs! > 5 ? "text-red" : vs! < -5 ? "text-live" : "text-muted"}`}>
                            {Math.abs(vs!) < 2 ? "about usual" : `${Math.abs(vs!).toFixed(0)}% ${vs! > 0 ? "above" : "below"} usual`}
                          </span>
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}
