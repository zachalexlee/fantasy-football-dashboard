import LuckScatter, { type LuckPoint } from "@/components/LuckScatter";
import TeamMark from "@/components/TeamMark";
import { getBundle } from "@/lib/data";
import { fmtPct, fmtPts } from "@/lib/format";
import {
  lastCompletedWeek,
  recordBook,
  recordVsSchedule,
  standings,
  statLookup,
  teamById,
} from "@/lib/stats";

export const metadata = { title: "Analysis" };

export default async function Analysis() {
  const bundle = await getBundle();
  const stat = statLookup(bundle);
  const team = teamById(bundle);
  const through = lastCompletedWeek(bundle);

  // Before any game is final every table here is either all-zero or a divide by
  // nothing — show a single honest placeholder instead of a meaningless grid.
  if (through === 0) {
    return (
      <div className="py-16 text-center">
        <div className="mb-3 text-4xl" aria-hidden>
          📊
        </div>
        <h2 className="mb-1 text-lg font-extrabold">Analysis unlocks after week 1</h2>
        <p className="mx-auto max-w-md text-sm text-ink2">
          Luck charts, strength-of-schedule, lineup efficiency, and the record book all need at
          least one completed week. They&apos;ll light up the moment real games are in the books.
        </p>
      </div>
    );
  }

  const grid = recordVsSchedule(bundle, through);
  const order = standings(bundle);
  const book = recordBook(bundle);

  // Worst bench-management weeks: optimal lineup minus what they actually
  // started (both already computed per team-week).
  const benchBlunders = bundle.teams
    .flatMap((t) =>
      Array.from({ length: through }, (_, i) => i + 1).map((w) => {
        const optimal = stat(t.id, "optimal_points", w);
        const actual = stat(t.id, "weekly_score", w);
        if (optimal == null || actual == null) return null;
        return { team: t, week: w, left: optimal - actual };
      })
    )
    .filter((x): x is { team: (typeof bundle.teams)[number]; week: number; left: number } => !!x && x.left > 0.05)
    .sort((a, b) => b.left - a.left)
    .slice(0, 8);

  const luckPoints: LuckPoint[] = [];
  for (const m of bundle.matchups) {
    if (!m.isFinal || !m.awayTeamId) continue;
    const home = bundle.teams.find((t) => t.id === m.homeTeamId)!;
    const away = bundle.teams.find((t) => t.id === m.awayTeamId)!;
    luckPoints.push(
      { team: home.name, week: m.week, pointsFor: m.homeScore, pointsAgainst: m.awayScore, won: m.winnerId === home.id },
      { team: away.name, week: m.week, pointsFor: m.awayScore, pointsAgainst: m.homeScore, won: m.winnerId === away.id }
    );
  }

  const effRows = bundle.teams
    .map((t) => {
      const eff = stat(t.id, "lineup_efficiency") ?? 1;
      let actual = 0;
      let optimal = 0;
      for (let w = 1; w <= through; w++) {
        optimal += stat(t.id, "optimal_points", w) ?? 0;
      }
      actual = eff * optimal;
      return { team: t, eff, actual, optimal };
    })
    .sort((a, b) => b.eff - a.eff);

  return (
    <div className="space-y-10">
      <section>
        <h2 className="mb-1 text-lg font-extrabold tracking-tight">Luck &amp; schedule analysis</h2>
        <p className="mb-4 text-sm text-ink2">
          The pages that settle every &ldquo;I had the hardest schedule&rdquo; argument.
        </p>
        <h3 className="mb-2 font-bold">Record vs. every schedule</h3>
        <p className="mb-3 text-xs text-muted">
          Each cell: the row team&apos;s record if it had the column team&apos;s schedule. Diagonal = actual record.
        </p>
        <div className="card table-scroll">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-hairline text-muted">
                <th className="px-2 py-2 text-left">Team ↓ / Schedule →</th>
                {order.map((t) => (
                  <th key={t.id} className="px-1.5 py-2 text-center font-semibold">{t.abbrev}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {order.map((a) => (
                <tr key={a.id} className="border-b border-hairline last:border-0">
                  <td className="flex items-center gap-1.5 px-2 py-1.5 font-semibold">
                    <TeamMark team={a} size="sm" />
                    <span className="hidden sm:inline">{a.abbrev}</span>
                  </td>
                  {order.map((b) => {
                    const c = grid.get(a.id)?.get(b.id) ?? { w: 0, l: 0, t: 0 };
                    const own = a.id === b.id;
                    const pct = c.w + c.l + c.t ? c.w / (c.w + c.l + c.t) : 0;
                    return (
                      <td
                        key={b.id}
                        className={`px-1.5 py-1.5 text-center tnum ${own ? "bg-surface2 font-bold" : ""} ${
                          !own && pct >= 0.7 ? "text-goodtext font-semibold" : ""
                        } ${!own && pct <= 0.3 ? "text-bad" : ""}`}
                      >
                        {c.w}-{c.l}
                        {c.t ? `-${c.t}` : ""}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="grid gap-8 lg:grid-cols-2">
        <div>
          <h3 className="mb-2 font-bold">Weekly luck chart</h3>
          <p className="mb-3 text-xs text-muted">
            Every team-week: what you scored vs. what your opponent scored. Wins below the line with
            few points = lucky; losses above it with big points = robbed.
          </p>
          <div className="card p-4">
            <LuckScatter points={luckPoints} />
          </div>
        </div>

        <div>
          <h3 className="mb-2 font-bold">Lineup efficiency</h3>
          <p className="mb-3 text-xs text-muted">
            Actual starter points ÷ optimal lineup points, season to date. Who&apos;s setting
            lineups vs. autopiloting?
          </p>
          <ol className="card divide-y divide-hairline">
            {effRows.map(({ team: t, eff, actual, optimal }, i) => (
              <li key={t.id} className="flex items-center gap-3 px-3 py-2.5">
                <span className="tnum w-5 text-center text-sm font-bold text-muted">{i + 1}</span>
                <TeamMark team={t} size="sm" />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold">{t.name}</div>
                  <div className="tnum text-xs text-muted">
                    {fmtPts(actual, 0)} of {fmtPts(optimal, 0)} possible
                  </div>
                </div>
                <div className="w-28">
                  <div className="mb-1 text-right tnum text-sm font-bold">{fmtPct(eff)}</div>
                  <div className="h-2 w-full overflow-hidden rounded-full bg-metertrack" role="meter" aria-valuenow={Math.round(eff * 100)} aria-valuemin={0} aria-valuemax={100} aria-label={`${t.name} lineup efficiency`}>
                    <div className="h-full rounded-full bg-accent" style={{ width: `${eff * 100}%` }} />
                  </div>
                </div>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-bold">📖 Season record book</h3>
        <p className="mb-3 text-xs text-muted">The high-water marks and heartbreakers, this season.</p>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div className="card p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-goodtext">Top scores</div>
            <ol className="space-y-1.5">
              {book.topScores.map((p, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{team(p.teamId)?.abbrev ?? "?"}</span>
                    <span className="text-muted"> wk {p.week}</span>
                  </span>
                  <span className="tnum font-bold">{fmtPts(p.points)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="card p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-bad">Low scores</div>
            <ol className="space-y-1.5">
              {book.lowScores.map((p, i) => (
                <li key={i} className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="min-w-0 truncate">
                    <span className="font-semibold">{team(p.teamId)?.abbrev ?? "?"}</span>
                    <span className="text-muted"> wk {p.week}</span>
                  </span>
                  <span className="tnum font-bold">{fmtPts(p.points)}</span>
                </li>
              ))}
            </ol>
          </div>
          <div className="card p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink2">Biggest blowouts</div>
            <ol className="space-y-1.5">
              {book.blowouts.map((m) => {
                const win = m.homeScore >= m.awayScore ? m.homeTeamId : m.awayTeamId!;
                const lose = m.homeScore >= m.awayScore ? m.awayTeamId! : m.homeTeamId;
                return (
                  <li key={m.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-semibold">{team(win)?.abbrev ?? "?"}</span>
                      <span className="text-muted"> over {team(lose)?.abbrev ?? "?"}</span>
                    </span>
                    <span className="tnum font-bold">
                      +{fmtPts(Math.abs(m.homeScore - m.awayScore))}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
          <div className="card p-3">
            <div className="mb-2 text-xs font-bold uppercase tracking-wide text-ink2">Nail-biters</div>
            <ol className="space-y-1.5">
              {book.nailbiters.map((m) => {
                const win = m.homeScore >= m.awayScore ? m.homeTeamId : m.awayTeamId!;
                const lose = m.homeScore >= m.awayScore ? m.awayTeamId! : m.homeTeamId;
                return (
                  <li key={m.id} className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="min-w-0 truncate">
                      <span className="font-semibold">{team(win)?.abbrev ?? "?"}</span>
                      <span className="text-muted"> over {team(lose)?.abbrev ?? "?"}</span>
                    </span>
                    <span className="tnum font-bold">
                      {fmtPts(Math.abs(m.homeScore - m.awayScore))}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      </section>

      {benchBlunders.length > 0 && (
        <section>
          <h3 className="mb-1 font-bold">🪑 Left on the bench</h3>
          <p className="mb-3 text-xs text-muted">
            The most points a manager benched — optimal lineup minus what they actually started.
          </p>
          <ol className="card divide-y divide-hairline">
            {benchBlunders.map((b, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <span className="tnum w-5 text-center text-xs font-bold text-muted">{i + 1}</span>
                <TeamMark team={b.team} size="sm" />
                <div className="min-w-0 flex-1">
                  <span className="truncate font-semibold">{b.team.name}</span>
                  <span className="ml-1.5 text-xs text-muted">Week {b.week}</span>
                </div>
                <span className="tnum font-bold text-bad">−{fmtPts(b.left)}</span>
              </li>
            ))}
          </ol>
        </section>
      )}
    </div>
  );
}
