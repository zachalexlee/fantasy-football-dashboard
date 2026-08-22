import Link from "next/link";
import MatchupCard from "@/components/MatchupCard";
import Sparkline from "@/components/Sparkline";
import TeamMark from "@/components/TeamMark";
import WeekPicker from "@/components/WeekPicker";
import { getBundle } from "@/lib/data";
import { fmtPts, fmtSigned, record, streakLabel } from "@/lib/format";
import { standings, statLookup, teamById, weeklyPoints } from "@/lib/stats";

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ week?: string }>;
}) {
  const bundle = await getBundle();
  const { league } = bundle;
  const params = await searchParams;
  const week = Math.min(
    Math.max(Number(params.week) || league.currentWeek, 1),
    league.finalWeek
  );
  const team = teamById(bundle);
  const stat = statLookup(bundle);
  const weekMatchups = bundle.matchups.filter((m) => m.week === week);
  const weeks = [...new Set(bundle.matchups.map((m) => m.week))].sort((a, b) => a - b);
  const live = week === league.currentWeek;

  return (
    <div className="space-y-8">
      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold tracking-tight">
            {live ? "Live matchup board" : `Week ${week} matchups`}
          </h2>
          <span className="kicker">week</span>
        </div>
        <WeekPicker weeks={weeks} current={week} hrefFor={(w) => (w === league.currentWeek ? "/" : `/?week=${w}`)} />
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {weekMatchups.map((m) => (
            <MatchupCard
              key={m.id}
              matchup={m}
              home={team(m.homeTeamId)!}
              away={team(m.awayTeamId)}
              live={live && !m.isFinal}
            />
          ))}
          {!weekMatchups.length && (
            <p className="text-sm text-muted">No matchups scheduled for week {week} yet.</p>
          )}
        </div>
      </section>

      <section>
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-lg font-extrabold tracking-tight">Standings+</h2>
          <span className="text-xs text-muted">
            All-play = your record if you played everyone every week · Luck = wins above expectation
          </span>
        </div>
        <div className="card table-scroll">
          <table className="w-full min-w-175 text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-muted">
                <th className="px-3 py-2.5">#</th>
                <th className="px-2 py-2.5">Team</th>
                <th className="px-2 py-2.5">Record</th>
                <th className="px-2 py-2.5">Streak</th>
                <th className="px-2 py-2.5 text-right">PF</th>
                <th className="px-2 py-2.5 text-right">PA</th>
                <th className="px-2 py-2.5">All-play</th>
                <th className="px-2 py-2.5 text-right">Luck</th>
                <th className="px-2 py-2.5 text-right">FAAB</th>
                <th className="px-3 py-2.5">Trend</th>
              </tr>
            </thead>
            <tbody>
              {standings(bundle).map((t, i) => {
                const luck = stat(t.id, "luck_delta");
                const streak = stat(t.id, "streak") ?? 0;
                const inPlayoffs = i < league.playoffTeamCount;
                return (
                  <tr key={t.id} className="border-b border-hairline last:border-0">
                    <td className={`px-3 py-2 tnum font-semibold ${inPlayoffs ? "text-accent" : "text-muted"}`}>
                      {i + 1}
                    </td>
                    <td className="px-2 py-2">
                      <Link href={`/teams/${t.id}`} className="flex items-center gap-2 hover:underline">
                        <TeamMark team={t} size="sm" />
                        <span className="max-w-44 truncate font-semibold">{t.name}</span>
                        <span className="hidden text-xs text-muted md:inline">{t.ownerName}</span>
                      </Link>
                    </td>
                    <td className="px-2 py-2 tnum font-semibold">{record(t.wins, t.losses, t.ties)}</td>
                    <td className={`px-2 py-2 tnum text-xs font-bold ${streak >= 3 ? "text-goodtext" : streak <= -3 ? "text-bad" : "text-ink2"}`}>
                      {streakLabel(streak)}
                    </td>
                    <td className="px-2 py-2 text-right tnum">{fmtPts(t.pointsFor)}</td>
                    <td className="px-2 py-2 text-right tnum text-ink2">{fmtPts(t.pointsAgainst)}</td>
                    <td className="px-2 py-2 tnum text-ink2">
                      {stat(t.id, "all_play_wins") ?? "—"}-{stat(t.id, "all_play_losses") ?? "—"}
                    </td>
                    <td className="px-2 py-2 text-right tnum">
                      {luck == null ? "—" : (
                        <span title={luck > 0 ? "Winning more than scores deserve" : luck < 0 ? "Losing more than scores deserve" : "Right on expectation"}>
                          {fmtSigned(luck)}
                        </span>
                      )}
                    </td>
                    <td className="px-2 py-2 text-right tnum">
                      {t.faabRemaining == null ? "—" : `$${t.faabRemaining}`}
                    </td>
                    <td className="px-3 py-1">
                      <Sparkline values={weeklyPoints(bundle, t.id).map((w) => w.points)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Top {league.playoffTeamCount} make the playoffs (blue seeds). Trend = weekly points, latest week dotted.
        </p>
      </section>
    </div>
  );
}
