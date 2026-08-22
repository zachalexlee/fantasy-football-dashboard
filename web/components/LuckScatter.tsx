"use client";

import { useState } from "react";

export type LuckPoint = {
  team: string;
  week: number;
  pointsFor: number;
  pointsAgainst: number;
  won: boolean;
};

/** Weekly luck chart: points scored vs opponent points, colored by result.
 * Above the diagonal = you lost or your opponent outscored you. */
export default function LuckScatter({ points }: { points: LuckPoint[] }) {
  const [hover, setHover] = useState<LuckPoint | null>(null);
  const size = 340;
  const pad = 40;
  const all = points.flatMap((p) => [p.pointsFor, p.pointsAgainst]);
  const lo = Math.floor(Math.min(...all) / 10) * 10;
  const hi = Math.ceil(Math.max(...all) / 10) * 10;
  const sc = (v: number) => pad + ((v - lo) / (hi - lo)) * (size - pad * 2);
  const ticks: number[] = [];
  for (let t = lo; t <= hi; t += 20) ticks.push(t);

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${size} ${size}`} className="w-full max-w-105" role="img" aria-label="Points scored vs opponent points by week">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={sc(t)} y1={pad} x2={sc(t)} y2={size - pad} stroke="var(--gridline)" strokeWidth="1" />
            <line x1={pad} y1={size - sc(t)} x2={size - pad} y2={size - sc(t)} stroke="var(--gridline)" strokeWidth="1" />
            <text x={sc(t)} y={size - pad + 14} textAnchor="middle" fontSize="9" fill="var(--muted)">{t}</text>
            <text x={pad - 6} y={size - sc(t) + 3} textAnchor="end" fontSize="9" fill="var(--muted)">{t}</text>
          </g>
        ))}
        {/* even-scores diagonal */}
        <line x1={sc(lo)} y1={size - sc(lo)} x2={sc(hi)} y2={size - sc(hi)} stroke="var(--muted)" strokeWidth="1" strokeOpacity="0.6" />
        {/* Losses are hollow so result never rides on hue alone (CVD-safe). */}
        {points.map((p, i) => (
          <circle
            key={i}
            cx={sc(p.pointsFor)}
            cy={size - sc(p.pointsAgainst)}
            r={hover === p ? 6 : 4.5}
            fill={p.won ? "var(--good)" : "var(--surface)"}
            stroke={p.won ? "var(--surface)" : "var(--bad)"}
            strokeWidth="2"
            onMouseEnter={() => setHover(p)}
            onMouseLeave={() => setHover(null)}
          />
        ))}
        <text x={size / 2} y={size - 6} textAnchor="middle" fontSize="10" fill="var(--ink-2)">
          Points scored →
        </text>
        <text x={10} y={size / 2} textAnchor="middle" fontSize="10" fill="var(--ink-2)" transform={`rotate(-90 10 ${size / 2})`}>
          Opponent points →
        </text>
      </svg>
      <div className="mt-1 flex items-center gap-4 text-xs text-ink2">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-good" aria-hidden /> Win
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full border-2 border-bad" aria-hidden /> Loss
        </span>
        <span className="text-muted">Above the line = outscored</span>
      </div>
      {hover && (
        <div className="pointer-events-none absolute left-1/2 top-2 -translate-x-1/2 rounded-lg border border-hairline bg-surface px-3 py-1.5 text-xs shadow-sm">
          <span className="font-semibold">{hover.team}</span> · Wk {hover.week} ·{" "}
          <span className="tnum">{hover.pointsFor.toFixed(1)}</span> vs{" "}
          <span className="tnum">{hover.pointsAgainst.toFixed(1)}</span> ·{" "}
          {hover.won ? "won" : "lost"}
        </div>
      )}
    </div>
  );
}
