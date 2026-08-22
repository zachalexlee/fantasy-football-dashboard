import { getBundle } from "@/lib/data";
import { fmtPts } from "@/lib/format";
import { playerById, teamById } from "@/lib/stats";

export default async function Draft() {
  const bundle = await getBundle();
  const team = teamById(bundle);
  const player = playerById(bundle);

  if (!bundle.draftPicks.length)
    return (
      <div>
        <h2 className="mb-1 text-lg font-extrabold tracking-tight">Draft recap</h2>
        <p className="text-sm text-muted">No draft synced yet — check back after draft day.</p>
      </div>
    );

  // Season production per player, from every synced roster week.
  const production = new Map<string, number>();
  for (const rs of bundle.rosterSlots)
    production.set(rs.playerId, (production.get(rs.playerId) ?? 0) + rs.points);

  const picks = [...bundle.draftPicks].sort((a, b) => a.pick - b.pick);
  // Position-relative value: production above the positional median among
  // drafted players, so a QB's raw point total doesn't drown out RBs/WRs.
  const byPos = new Map<string, number[]>();
  for (const p of picks) {
    const pos = player(p.playerId)?.position ?? "?";
    if (!byPos.has(pos)) byPos.set(pos, []);
    byPos.get(pos)!.push(production.get(p.playerId) ?? 0);
  }
  const median = new Map(
    [...byPos].map(([pos, vals]) => {
      const s = [...vals].sort((a, b) => a - b);
      return [pos, s[Math.floor(s.length / 2)] ?? 0];
    })
  );
  const adjusted = (p: { playerId: string }) =>
    (production.get(p.playerId) ?? 0) - (median.get(player(p.playerId)?.position ?? "?") ?? 0);
  // Production rank among drafted players: pick 3 who ranks 40th = bust.
  const prodRank = new Map(
    [...picks].sort((a, b) => adjusted(b) - adjusted(a)).map((p, i) => [p.playerId, i + 1])
  );
  const valued = picks.map((p) => ({
    ...p,
    points: production.get(p.playerId) ?? 0,
    delta: p.pick - (prodRank.get(p.playerId) ?? p.pick),
  }));
  const steals = [...valued].sort((a, b) => b.delta - a.delta).slice(0, 6);
  const busts = [...valued].sort((a, b) => a.delta - b.delta).slice(0, 6);
  const rounds = [...new Set(picks.map((p) => p.round))].sort((a, b) => a - b);

  const PickLine = ({ p }: { p: (typeof valued)[number] }) => (
    <li className="flex items-center gap-3 px-3 py-2 text-sm">
      <span className="tnum w-9 shrink-0 text-xs text-muted">#{p.pick}</span>
      <div className="min-w-0 flex-1">
        <span className="font-semibold">{player(p.playerId)?.name ?? "?"}</span>
        <span className="ml-1.5 text-xs text-muted">
          {player(p.playerId)?.position} → {team(p.teamId)?.abbrev}
        </span>
      </div>
      <span className="tnum text-xs text-ink2">{fmtPts(p.points, 0)} pts</span>
      <span className={`tnum w-10 text-right text-xs font-bold ${p.delta > 0 ? "text-goodtext" : p.delta < 0 ? "text-bad" : "text-muted"}`}>
        {p.delta > 0 ? `+${p.delta}` : p.delta}
      </span>
    </li>
  );

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-extrabold tracking-tight">Draft recap &amp; value board</h2>
        <p className="text-sm text-ink2">
          Draft slot vs. season production. +N = producing N spots better than draft position.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="mb-3 font-bold">💎 Steals</h3>
          <ul className="card divide-y divide-hairline">{steals.map((p) => <PickLine key={p.pick} p={p} />)}</ul>
        </section>
        <section>
          <h3 className="mb-3 font-bold">🪦 Busts</h3>
          <ul className="card divide-y divide-hairline">{busts.map((p) => <PickLine key={p.pick} p={p} />)}</ul>
        </section>
      </div>

      <section>
        <h3 className="mb-3 font-bold">Full board</h3>
        <div className="space-y-4">
          {rounds.map((r) => (
            <div key={r}>
              <div className="kicker mb-1.5">Round {r}</div>
              <ul className="card divide-y divide-hairline">
                {valued
                  .filter((p) => p.round === r)
                  .map((p) => (
                    <PickLine key={p.pick} p={p} />
                  ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
