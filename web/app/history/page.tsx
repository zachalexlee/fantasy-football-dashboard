import TeamMark from "@/components/TeamMark";
import { getBundle } from "@/lib/data";
import { fmtPts, ordinal, record } from "@/lib/format";
import {
  championshipHistory,
  franchiseH2H,
  franchises,
  recordBookAllTime,
  seasonBests,
  winPct,
  type AllTimeGame,
  type AllTimePerf,
} from "@/lib/stats";

export default async function History() {
  const bundle = await getBundle();
  const allFranchises = franchises(bundle);
  const champs = championshipHistory(bundle);
  const book = recordBookAllTime(bundle);
  const bests = seasonBests(bundle);
  const h2h = franchiseH2H(bundle);
  const seasonsSpanned = bundle.seasons.map((s) => s.league.season);
  const spanLabel =
    seasonsSpanned.length > 1
      ? `${Math.min(...seasonsSpanned)}–${Math.max(...seasonsSpanned)}`
      : `${seasonsSpanned[0] ?? ""}`;
  // Grid rows: current-season franchises first (in franchise order), then alumni.
  const gridFranchises = allFranchises.filter((f) => f.inCurrentSeason);

  const ScoreList = ({ title, rows }: { title: string; rows: AllTimePerf[] }) => (
    <section>
      <h3 className="mb-3 font-bold">{title}</h3>
      <ol className="card divide-y divide-hairline">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="tnum w-5 text-center text-xs font-bold text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{r.teamName}</span>
              <span className="ml-1.5 text-xs text-muted">
                Wk {r.week} &rsquo;{`${r.season}`.slice(2)} vs {r.oppAbbrev}
              </span>
            </div>
            <span className="tnum font-bold">{fmtPts(r.points)}</span>
          </li>
        ))}
        {!rows.length && <li className="px-3 py-2.5 text-sm text-muted">No completed games yet.</li>}
      </ol>
    </section>
  );

  const GameList = ({ title, rows }: { title: string; rows: AllTimeGame[] }) => (
    <section>
      <h3 className="mb-3 font-bold">{title}</h3>
      <ol className="card divide-y divide-hairline">
        {rows.map((m, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="tnum w-16 shrink-0 text-xs text-muted">
              Wk {m.week} &rsquo;{`${m.season}`.slice(2)}
            </span>
            <div className="min-w-0 flex-1 truncate">
              <span className={m.homeWon ? "font-bold" : ""}>{m.homeAbbrev}</span>{" "}
              <span className="tnum">{fmtPts(m.homeScore)}</span>
              <span className="text-muted"> — </span>
              <span className="tnum">{fmtPts(m.awayScore)}</span>{" "}
              <span className={!m.homeWon ? "font-bold" : ""}>{m.awayAbbrev}</span>
            </div>
            <span className="tnum text-xs font-semibold text-ink2">Δ {fmtPts(m.margin)}</span>
          </li>
        ))}
        {!rows.length && <li className="px-3 py-2.5 text-sm text-muted">No completed games yet.</li>}
      </ol>
    </section>
  );

  return (
    <div className="space-y-10">
      <div>
        <h2 className="mb-1 text-lg font-extrabold tracking-tight">
          League history <span className="text-muted">· {spanLabel}</span>
        </h2>
        <p className="text-sm text-ink2">
          Every synced season combined: {bundle.seasons.length}{" "}
          {bundle.seasons.length === 1 ? "season" : "seasons"} of championships, franchise records,
          and all-time head-to-heads.
        </p>
      </div>

      <section>
        <h3 className="mb-3 font-bold">Franchise records (all-time)</h3>
        <div className="card table-scroll">
          <table className="w-full min-w-190 text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-muted">
                <th className="px-3 py-2.5">Manager</th>
                <th className="px-2 py-2.5 text-center">Seasons</th>
                <th className="px-2 py-2.5 text-center">🏆 Titles</th>
                <th className="px-2 py-2.5 text-center">🥈</th>
                <th className="px-2 py-2.5">Best finish</th>
                <th className="px-2 py-2.5 text-center">Top-5s</th>
                <th className="px-2 py-2.5 text-center">Playoffs</th>
                <th className="px-2 py-2.5">W-L-T</th>
                <th className="px-2 py-2.5 text-right">Win %</th>
                <th className="px-2 py-2.5 text-right">Total PF</th>
                <th className="px-3 py-2.5 text-right">Total PA</th>
              </tr>
            </thead>
            <tbody>
              {allFranchises.map((f) => (
                <tr
                  key={f.key}
                  className={`border-b border-hairline last:border-0 ${f.inCurrentSeason ? "" : "text-ink2"}`}
                >
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <TeamMark team={f.team} size="sm" />
                      <div className="min-w-0">
                        <div className="max-w-44 truncate font-semibold">{f.team.name}</div>
                        <div className="truncate text-xs text-muted">
                          {f.managerName}
                          {!f.inCurrentSeason && " · alumni"}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="px-2 py-2 text-center tnum">{f.seasonsPlayed}</td>
                  <td className="px-2 py-2 text-center tnum font-bold">
                    {f.championships > 0 ? `${"🏆".repeat(Math.min(f.championships, 3))}${f.championships > 3 ? ` ×${f.championships}` : ""}` : "—"}
                  </td>
                  <td className="px-2 py-2 text-center tnum text-ink2">{f.runnerUps || "—"}</td>
                  <td className="px-2 py-2 tnum">
                    {f.bestFinish
                      ? `${ordinal(f.bestFinish.rank)} ('${`${f.bestFinish.season}`.slice(2)})`
                      : "—"}
                  </td>
                  <td className="px-2 py-2 text-center tnum">{f.top5 || "—"}</td>
                  <td className="px-2 py-2 text-center tnum">{f.playoffBerths || "—"}</td>
                  <td className="px-2 py-2 tnum">{record(f.wins, f.losses, f.ties)}</td>
                  <td className="px-2 py-2 text-right tnum font-semibold">
                    {(winPct(f) * 100).toFixed(1)}%
                  </td>
                  <td className="px-2 py-2 text-right tnum">{fmtPts(f.pointsFor, 0)}</td>
                  <td className="px-3 py-2 text-right tnum text-ink2">{fmtPts(f.pointsAgainst, 0)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Managers matched across seasons by ESPN account. Best finish counts completed seasons;
          totals include the season in progress.
        </p>
      </section>

      {champs.length > 0 && (
        <section>
          <h3 className="mb-3 font-bold">Championship history</h3>
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {champs.map((c) => (
              <li key={c.season} className="card p-4">
                <div className="kicker text-accent">{c.season}</div>
                {c.champion && (
                  <div className="mt-1.5 flex items-center gap-2">
                    <TeamMark team={c.champion} size="md" />
                    <div className="min-w-0">
                      <div className="truncate font-bold">🏆 {c.champion.name}</div>
                      <div className="truncate text-xs text-muted">{c.champion.ownerName}</div>
                    </div>
                  </div>
                )}
                {c.runnerUp && (
                  <div className="mt-2 truncate text-xs text-ink2">
                    🥈 {c.runnerUp.name} <span className="text-muted">({c.runnerUp.ownerName})</span>
                  </div>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className="grid gap-8 lg:grid-cols-2">
        <ScoreList title="🚀 Highest single-week scores" rows={book.topScores} />
        <ScoreList title="🥶 Lowest single-week scores" rows={book.lowScores} />
        <GameList title="💥 Biggest blowouts" rows={book.blowouts} />
        <GameList title="🫀 Closest finishes" rows={book.nailbiters} />
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="mb-3 font-bold">🔥 Best scoring seasons</h3>
          <ol className="card divide-y divide-hairline">
            {bests.topPF.map((r, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="tnum w-5 text-center text-xs font-bold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold">{r.team.name}</span>
                  <span className="ml-1.5 text-xs text-muted">
                    {r.season} · {record(r.record.wins, r.record.losses, r.record.ties)}
                  </span>
                </div>
                <span className="tnum font-bold">{fmtPts(r.pf, 0)}</span>
              </li>
            ))}
            {!bests.topPF.length && (
              <li className="px-3 py-2.5 text-sm text-muted">No completed seasons yet.</li>
            )}
          </ol>
        </section>
        <section>
          <h3 className="mb-3 font-bold">📈 Best season records</h3>
          <ol className="card divide-y divide-hairline">
            {bests.bestRecords.map((r, i) => (
              <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
                <span className="tnum w-5 text-center text-xs font-bold text-muted">{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <span className="font-semibold">{r.team.name}</span>
                  <span className="ml-1.5 text-xs text-muted">
                    {r.season} · {fmtPts(r.pf, 0)} PF
                  </span>
                </div>
                <span className="tnum font-bold">
                  {record(r.record.wins, r.record.losses, r.record.ties)}
                </span>
              </li>
            ))}
            {!bests.bestRecords.length && (
              <li className="px-3 py-2.5 text-sm text-muted">No completed seasons yet.</li>
            )}
          </ol>
        </section>
      </div>

      <section>
        <h3 className="mb-2 font-bold">All-time head-to-head</h3>
        <p className="mb-3 text-xs text-muted">
          Row manager&apos;s record against column manager, every season combined (playoffs
          included).
        </p>
        <div className="card table-scroll">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-hairline text-muted">
                <th className="px-2 py-2 text-left">vs →</th>
                {gridFranchises.map((f) => (
                  <th key={f.key} className="px-1.5 py-2 text-center font-semibold">
                    {f.team.abbrev}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {gridFranchises.map((a) => (
                <tr key={a.key} className="border-b border-hairline last:border-0">
                  <td className="flex items-center gap-1.5 px-2 py-1.5 font-semibold">
                    <TeamMark team={a.team} size="sm" />
                    <span className="hidden sm:inline">{a.team.abbrev}</span>
                  </td>
                  {gridFranchises.map((b) => {
                    if (a.key === b.key)
                      return (
                        <td key={b.key} className="bg-surface2 px-1.5 py-1.5 text-center text-muted">
                          ·
                        </td>
                      );
                    const c = h2h(a.key, b.key);
                    const played = c.w + c.l + c.t > 0;
                    return (
                      <td
                        key={b.key}
                        className={`px-1.5 py-1.5 text-center tnum ${!played ? "text-muted" : c.w > c.l ? "font-semibold text-goodtext" : c.l > c.w ? "text-bad" : ""}`}
                      >
                        {played ? `${c.w}-${c.l}${c.t ? `-${c.t}` : ""}` : "—"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
