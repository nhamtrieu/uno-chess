import type { GameRow } from "@/lib/auth";
import { useT } from "@/lib/i18n";

/** Elo after each game, oldest to newest. */
export default function EloChart({ games, start }: { games: GameRow[]; start: number }) {
  const { t } = useT();
  const pts = [start, ...[...games].reverse().map((g) => g.elo_after)];
  if (pts.length < 2) return <p className="muted">{t("stats.chartEmpty")}</p>;
  const W = 600, H = 160, P = 12;
  const lo = Math.min(...pts) - 10, hi = Math.max(...pts) + 10;
  const x = (i: number) => P + (i / (pts.length - 1)) * (W - 2 * P);
  const y = (v: number) => H - P - ((v - lo) / (hi - lo)) * (H - 2 * P);
  const d = pts.map((v, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(" ");
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="chart" role="img" aria-label={t("stats.chartLabel")}>
      <path d={`${d} L${x(pts.length - 1)},${H - P} L${x(0)},${H - P} Z`} fill="rgba(46,196,182,.12)" />
      <path d={d} fill="none" stroke="var(--cyan)" strokeWidth="2.5" strokeLinejoin="round" />
      <text x={P} y={12} fill="var(--muted)" fontSize="11">{Math.round(hi)}</text>
      <text x={P} y={H - 2} fill="var(--muted)" fontSize="11">{Math.round(lo)}</text>
    </svg>
  );
}
