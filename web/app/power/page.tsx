import Link from "next/link";
import Meter from "@/components/Meter";
import TeamMark from "@/components/TeamMark";
import { getBundle } from "@/lib/data";
import { fmtPts, record } from "@/lib/format";
import { statLookup, weeklyPoints } from "@/lib/stats";

export const revalidate = 60;

function Movement({ now, prev }: { now: number; prev: number | undefined }) {
  if (prev == null || prev === now)
    return <span className="tnum w-8 text-center text-xs text-muted">—</span>;
  const up = prev > now;
  return (
    <span className={`tnum w-8 text-center text-xs font-bold ${up ? "text-goodtext" : "text-bad"}`}>
      {up ? "▲" : "▼"}
      {Math.abs(prev - now)}
    </span>
  );
}

export default async function Power() {
  const bundle = await getBundle();
  const stat = statLookup(bundle);

  const rows = bundle.teams
    .map((t) => ({
      team: t,
      score: stat(t.id, "power_score") ?? 0,
      rank: stat(t.id, "power_rank") ?? 99,
      prev: stat(t.id, "power_rank_prev"),
      recent: weeklyPoints(bundle, t.id).slice(-3),
      apW: stat(t.id, "all_play_wins") ?? 0,
      apL: stat(t.id, "all_play_losses") ?? 0,
    }))
    .sort((a, b) => a.rank - b.rank);

  return (
    <div>
      <h2 className="mb-1 text-lg font-extrabold tracking-tight">Power rankings</h2>
      <p className="mb-4 text-sm text-ink2">
        Composite of recent scoring (last 3 weeks, weighted), season points, all-play win %, and
        roster strength from this week&apos;s projections. Arrows show week-over-week movement.
      </p>
      <ol className="space-y-3">
        {rows.map(({ team: t, score, rank, prev, recent, apW, apL }) => {
          const recentAvg = recent.length
            ? recent.reduce((a, w) => a + w.points, 0) / recent.length
            : 0;
          return (
            <li key={t.id} className="card flex items-center gap-3 p-3 sm:gap-4 sm:p-4">
              <div className="tnum w-8 text-center text-2xl font-extrabold text-ink2">{rank}</div>
              <Movement now={rank} prev={prev} />
              <TeamMark team={t} size="lg" />
              <div className="min-w-0 flex-1">
                <Link href={`/teams/${t.id}`} className="hover:underline">
                  <span className="block truncate font-bold">{t.name}</span>
                </Link>
                <div className="text-xs text-muted">
                  {record(t.wins, t.losses, t.ties)} · {t.ownerName}
                </div>
                <div className="mt-1.5 hidden gap-4 text-xs text-ink2 sm:flex">
                  <span>
                    <span className="text-muted">L3 avg</span>{" "}
                    <span className="tnum font-semibold">{fmtPts(recentAvg)}</span>
                  </span>
                  <span>
                    <span className="text-muted">Season PF</span>{" "}
                    <span className="tnum font-semibold">{fmtPts(t.pointsFor, 0)}</span>
                  </span>
                  <span>
                    <span className="text-muted">All-play</span>{" "}
                    <span className="tnum font-semibold">
                      {apW}-{apL}
                    </span>
                  </span>
                </div>
              </div>
              <div className="w-24 shrink-0 sm:w-40">
                <div className="mb-1 text-right tnum text-sm font-extrabold">{fmtPts(score)}</div>
                <Meter fraction={score / 100} label={`${t.name} power score`} />
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
