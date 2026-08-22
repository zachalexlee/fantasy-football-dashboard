import TeamMark from "@/components/TeamMark";
import { getBundle } from "@/lib/data";
import { fmtPts } from "@/lib/format";
import { headToHead, recordBook, standings, teamById } from "@/lib/stats";

export default async function History() {
  const bundle = await getBundle();
  const team = teamById(bundle);
  const book = recordBook(bundle);
  const h2h = headToHead(bundle);
  const order = standings(bundle);

  const ScoreList = ({
    title,
    rows,
  }: {
    title: string;
    rows: { teamId: string; week: number; points: number; against: string }[];
  }) => (
    <section>
      <h3 className="mb-3 font-bold">{title}</h3>
      <ol className="card divide-y divide-hairline">
        {rows.map((r, i) => (
          <li key={i} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="tnum w-5 text-center text-xs font-bold text-muted">{i + 1}</span>
            <div className="min-w-0 flex-1">
              <span className="font-semibold">{team(r.teamId)?.name}</span>
              <span className="ml-1.5 text-xs text-muted">
                Wk {r.week} vs {team(r.against)?.abbrev}
              </span>
            </div>
            <span className="tnum font-bold">{fmtPts(r.points)}</span>
          </li>
        ))}
      </ol>
    </section>
  );

  const GameList = ({
    title,
    rows,
  }: {
    title: string;
    rows: typeof book.blowouts;
  }) => (
    <section>
      <h3 className="mb-3 font-bold">{title}</h3>
      <ol className="card divide-y divide-hairline">
        {rows.map((m) => (
          <li key={m.id} className="flex items-center gap-3 px-3 py-2 text-sm">
            <span className="tnum w-11 shrink-0 text-xs text-muted">Wk {m.week}</span>
            <div className="min-w-0 flex-1 truncate">
              <span className={m.winnerId === m.homeTeamId ? "font-bold" : ""}>
                {team(m.homeTeamId)?.abbrev}
              </span>{" "}
              <span className="tnum">{fmtPts(m.homeScore)}</span>
              <span className="text-muted"> — </span>
              <span className="tnum">{fmtPts(m.awayScore)}</span>{" "}
              <span className={m.winnerId === m.awayTeamId ? "font-bold" : ""}>
                {team(m.awayTeamId)?.abbrev}
              </span>
            </div>
            <span className="tnum text-xs font-semibold text-ink2">
              Δ {fmtPts(Math.abs(m.homeScore - m.awayScore))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );

  return (
    <div className="space-y-10">
      <div>
        <h2 className="mb-1 text-lg font-extrabold tracking-tight">Record book</h2>
        <p className="text-sm text-ink2">
          Season highs, lows, and every head-to-head. Backfill prior seasons with the worker to
          make these all-time.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <ScoreList title="🚀 Highest single-week scores" rows={book.topScores} />
        <ScoreList title="🥶 Lowest single-week scores" rows={book.lowScores} />
        <GameList title="💥 Biggest blowouts" rows={book.blowouts} />
        <GameList title="🫀 Closest finishes" rows={book.nailbiters} />
      </div>

      <section>
        <h3 className="mb-2 font-bold">Head-to-head grid</h3>
        <p className="mb-3 text-xs text-muted">Row team&apos;s record against column team.</p>
        <div className="card table-scroll">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-hairline text-muted">
                <th className="px-2 py-2 text-left">vs →</th>
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
                    if (a.id === b.id)
                      return <td key={b.id} className="bg-surface2 px-1.5 py-1.5 text-center text-muted">·</td>;
                    const c = h2h(a.id, b.id);
                    const played = c.w + c.l + c.t > 0;
                    return (
                      <td
                        key={b.id}
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
