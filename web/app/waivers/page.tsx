import Link from "next/link";
import Meter from "@/components/Meter";
import TeamMark from "@/components/TeamMark";
import { getBundle } from "@/lib/data";
import { fmtPts, fmtSignedPct } from "@/lib/format";
import { playerById, statLookup, teamById } from "@/lib/stats";

export const metadata = { title: "Waivers" };

export default async function Waivers() {
  const bundle = await getBundle();
  const stat = statLookup(bundle);
  const team = teamById(bundle);
  const player = playerById(bundle);
  // A null budget = this league uses waiver priority, not FAAB dollars. Don't
  // fabricate a $100 budget and fake $ meters for it.
  const hasFaab = bundle.league.faabBudget != null;
  const budget = bundle.league.faabBudget ?? 100;

  const faabRows = bundle.teams
    .map((t) => {
      const spent = stat(t.id, "faab_spent") ?? 0;
      const points = stat(t.id, "faab_points") ?? 0;
      return {
        team: t,
        spent,
        points,
        remaining: t.faabRemaining ?? budget - spent,
        perDollar: spent > 0 ? points / spent : null,
      };
    })
    .sort((a, b) =>
      hasFaab ? (b.perDollar ?? -1) - (a.perDollar ?? -1) : b.points - a.points
    );

  const rostered = new Set(
    bundle.rosterSlots.filter((r) => r.week === bundle.league.currentWeek).map((r) => r.playerId)
  );
  const trending = bundle.players
    .filter((p) => !rostered.has(p.id) && (p.ownershipDelta ?? 0) > 0.5)
    .sort((a, b) => (b.ownershipDelta ?? 0) - (a.ownershipDelta ?? 0))
    .slice(0, 10);

  const pickups = [...bundle.transactions]
    .filter((t) => t.type !== "TRADE")
    .sort((a, b) => b.week - a.week || (b.faabBid ?? 0) - (a.faabBid ?? 0))
    .slice(0, 40);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-1 text-lg font-extrabold tracking-tight">Waiver Wire HQ</h2>
        <p className="mb-4 text-sm text-ink2">
          FAAB budgets, who spends well, and who the league is sleeping on.
        </p>
        <div className="mb-3 flex items-baseline justify-between">
          <h3 className="font-bold">{hasFaab ? "FAAB leaderboard" : "Pickup production"}</h3>
          <span className="text-xs text-muted">
            {hasFaab ? `$${budget} season budget` : "Waiver-priority league"}
          </span>
        </div>
        <div className="card table-scroll">
          <table className="w-full min-w-140 text-sm">
            <thead>
              <tr className="border-b border-hairline text-left text-xs text-muted">
                <th className="px-3 py-2.5">Team</th>
                {hasFaab && <th className="px-2 py-2.5">Remaining</th>}
                {hasFaab && <th className="px-2 py-2.5 text-right">Spent</th>}
                <th className="px-2 py-2.5 text-right">Pts from pickups</th>
                {hasFaab && <th className="px-3 py-2.5 text-right">Pts / $</th>}
              </tr>
            </thead>
            <tbody>
              {faabRows.map(({ team: t, spent, points, remaining, perDollar }) => (
                <tr key={t.id} className="border-b border-hairline last:border-0">
                  <td className="px-3 py-2">
                    <Link href={`/teams/${t.id}`} className="flex items-center gap-2 hover:underline">
                      <TeamMark team={t} size="sm" />
                      <span className="max-w-44 truncate font-semibold">{t.name}</span>
                    </Link>
                  </td>
                  {hasFaab && (
                    <td className="px-2 py-2">
                      <div className="flex items-center gap-2">
                        <Meter fraction={remaining / budget} label={`${t.name} FAAB remaining`} />
                        <span className="tnum w-9 text-right text-xs">${remaining}</span>
                      </div>
                    </td>
                  )}
                  {hasFaab && <td className="px-2 py-2 text-right tnum">${spent}</td>}
                  <td className="px-2 py-2 text-right tnum">{fmtPts(points)}</td>
                  {hasFaab && (
                    <td className="px-3 py-2 text-right tnum font-semibold">
                      {perDollar == null ? "—" : fmtPts(perDollar, 2)}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-muted">
          Pts from pickups counts starter points from waiver adds, from the pickup week on
          {hasFaab ? " — did that $37 bid actually produce?" : "."}
        </p>
      </section>

      <div className="grid gap-8 lg:grid-cols-2">
        <section>
          <h3 className="mb-3 font-bold">🔥 Trending targets</h3>
          {trending.length ? (
            <ul className="card divide-y divide-hairline">
              {trending.map((p) => (
                <li key={p.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="w-10 rounded bg-surface2 px-1.5 py-0.5 text-center text-xs font-bold text-ink2">
                    {p.position}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold">{p.name}</div>
                    <div className="text-xs text-muted">
                      {p.nflTeam}
                      {p.injuryStatus ? ` · ${p.injuryStatus.toLowerCase()}` : ""}
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="tnum text-sm font-bold text-goodtext">
                      {fmtSignedPct(p.ownershipDelta)}
                    </div>
                    <div className="tnum text-xs text-muted">{Math.round(p.ownershipPct ?? 0)}% owned</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted">No fast risers right now.</p>
          )}
          <p className="mt-2 text-xs text-muted">
            League-wide ownership jumps on free agents — grab them before your rivals notice.
          </p>
        </section>

        <section>
          <h3 className="mb-3 font-bold">Recent pickups</h3>
          <ul className="card divide-y divide-hairline">
            {pickups.map((tx) => {
              const t = team(tx.teamId);
              const added = player(tx.playerInId);
              const dropped = player(tx.playerOutId);
              return (
                <li key={tx.id} className="flex items-center gap-3 px-3 py-2.5">
                  <span className="tnum w-11 shrink-0 text-xs text-muted">Wk {tx.week}</span>
                  <div className="min-w-0 flex-1 text-sm">
                    <span className="font-semibold">{t?.abbrev ?? "?"}</span>{" "}
                    <span className="text-goodtext">+ {added?.name ?? "?"}</span>
                    {dropped && <span className="text-muted"> / − {dropped.name}</span>}
                  </div>
                  {tx.type === "WAIVER" ? (
                    <span className="tnum rounded-full bg-surface2 px-2 py-0.5 text-xs font-bold">
                      ${tx.faabBid ?? 0}
                    </span>
                  ) : (
                    <span className="rounded-full bg-surface2 px-2 py-0.5 text-xs text-muted">FA</span>
                  )}
                </li>
              );
            })}
            {!pickups.length && <li className="px-3 py-2.5 text-sm text-muted">No transactions yet.</li>}
          </ul>
        </section>
      </div>
    </div>
  );
}
