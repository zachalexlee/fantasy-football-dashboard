import type { Boxscore, BoxTeam } from "@/lib/types";

function periods(box: Boxscore): number[] {
  const n = Math.max(box.home.linescores.length, box.away.linescores.length, 4);
  return Array.from({ length: n }, (_, i) => i + 1);
}

function qLabel(p: number): string {
  return p <= 4 ? `Q${p}` : p === 5 ? "OT" : `OT${p - 4}`;
}

function LineRow({
  team,
  score,
  cols,
  winner,
}: {
  team: BoxTeam;
  score: number | null;
  cols: number[];
  winner: boolean;
}) {
  const byPeriod = new Map(team.linescores.map((l) => [l.period, l.display]));
  return (
    <tr className={winner ? "font-bold" : ""}>
      <td className="py-1 pr-3 text-left">
        {team.abbrev ?? "—"}
        {team.record && <span className="ml-1.5 text-xs font-normal text-muted">({team.record})</span>}
      </td>
      {cols.map((p) => (
        <td key={p} className="tnum px-2 py-1 text-center text-ink2">
          {byPeriod.get(p) ?? "·"}
        </td>
      ))}
      <td className="tnum pl-3 py-1 text-center">{score ?? "—"}</td>
    </tr>
  );
}

export default function BoxScore({
  box,
  homeScore,
  awayScore,
}: {
  box: Boxscore;
  homeScore: number | null;
  awayScore: number | null;
}) {
  const cols = periods(box);
  const homeWins = (homeScore ?? 0) > (awayScore ?? 0);
  const awayWins = (awayScore ?? 0) > (homeScore ?? 0);
  const hasLine = box.home.linescores.length > 0 || box.away.linescores.length > 0;
  const stats = box.home.statistics.length ? box.home.statistics : [];

  return (
    <div className="space-y-3">
      {hasLine && (
        <div className="table-scroll">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-[11px] uppercase tracking-wide text-muted">
                <th className="py-1 pr-3 text-left font-semibold">Team</th>
                {cols.map((p) => (
                  <th key={p} className="px-2 py-1 text-center font-semibold">
                    {qLabel(p)}
                  </th>
                ))}
                <th className="pl-3 py-1 text-center font-semibold">T</th>
              </tr>
            </thead>
            <tbody>
              <LineRow team={box.away} score={awayScore} cols={cols} winner={awayWins} />
              <LineRow team={box.home} score={homeScore} cols={cols} winner={homeWins} />
            </tbody>
          </table>
        </div>
      )}

      {stats.length > 0 && (
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
          {stats.map((s) => (
            <div key={s.name ?? s.label} className="flex justify-between gap-2">
              <span className="text-muted">{s.label}</span>
              <span className="tnum font-semibold">{s.display}</span>
            </div>
          ))}
        </div>
      )}

      {box.leaders.length > 0 && (
        <div>
          <div className="mb-1 text-[11px] uppercase tracking-wide text-muted">Game leaders</div>
          <ul className="space-y-1">
            {box.leaders.map((l, i) => (
              <li key={`${l.category}-${i}`} className="flex items-baseline justify-between gap-2 text-sm">
                <span className="text-muted">{l.category}</span>
                <span className="min-w-0 flex-1 truncate text-right">
                  <span className="font-semibold">{l.athlete}</span>
                  {l.team && <span className="text-muted"> · {l.team}</span>}
                  {l.position && <span className="text-muted"> · {l.position}</span>}
                </span>
                <span className="tnum shrink-0 font-semibold">{l.value}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {(box.venue || box.attendance) && (
        <p className="text-xs text-muted">
          {box.venue}
          {box.location ? ` · ${box.location}` : ""}
          {box.attendance ? ` · ${box.attendance.toLocaleString("en-US")} fans` : ""}
        </p>
      )}
    </div>
  );
}
