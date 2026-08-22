import Link from "next/link";
import { notFound } from "next/navigation";
import Sparkline from "@/components/Sparkline";
import TeamMark from "@/components/TeamMark";
import { getBundle } from "@/lib/data";
import { fmtPct, fmtPts, fmtSigned, ordinal, record } from "@/lib/format";
import { playerById, statLookup, teamById, weeklyPoints } from "@/lib/stats";

function Chip({ label, value }: { label: string; value: string }) {
  return (
    <div className="card px-3 py-2">
      <div className="kicker">{label}</div>
      <div className="mt-0.5 text-lg font-extrabold tnum">{value}</div>
    </div>
  );
}

export default async function TeamPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const bundle = await getBundle();
  const t = bundle.teams.find((x) => x.id === id);
  if (!t) notFound();
  const stat = statLookup(bundle);
  const team = teamById(bundle);
  const player = playerById(bundle);
  const { league } = bundle;

  const rosterWeek = Math.min(league.currentWeek, league.finalWeek);
  const roster = bundle.rosterSlots
    .filter((r) => r.teamId === t.id && r.week === rosterWeek)
    .sort((a, b) => Number(b.isStarter) - Number(a.isStarter) || b.points - a.points);
  const slotOrder = ["QB", "RB", "WR", "TE", "FLEX", "RB/WR", "WR/TE", "OP", "D/ST", "K", "BE", "IR"];
  roster.sort(
    (a, b) =>
      Number(b.isStarter) - Number(a.isStarter) ||
      slotOrder.indexOf(a.slot) - slotOrder.indexOf(b.slot) ||
      b.points - a.points
  );

  const schedule = bundle.matchups
    .filter((m) => m.homeTeamId === t.id || m.awayTeamId === t.id)
    .sort((a, b) => a.week - b.week);

  const luck = stat(t.id, "luck_delta");
  const eff = stat(t.id, "lineup_efficiency");
  const rank = stat(t.id, "power_rank");
  const odds = stat(t.id, "playoff_odds");

  return (
    <div className="space-y-8">
      <section className="flex flex-wrap items-center gap-4">
        <TeamMark team={t} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-2xl font-extrabold tracking-tight">{t.name}</h2>
          <p className="text-sm text-ink2">
            {t.ownerName} · {record(t.wins, t.losses, t.ties)} · {fmtPts(t.pointsFor)} PF
          </p>
        </div>
        <Sparkline values={weeklyPoints(bundle, t.id).map((w) => w.points)} width={140} height={36} />
      </section>

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Chip label="Power rank" value={rank ? ordinal(rank) : "—"} />
        <Chip label="Playoff odds" value={fmtPct(odds)} />
        <Chip label="Luck" value={luck == null ? "—" : fmtSigned(luck)} />
        <Chip label="Lineup efficiency" value={fmtPct(eff)} />
      </section>

      <div className="grid gap-8 lg:grid-cols-5">
        <section className="lg:col-span-3">
          <h3 className="mb-3 font-bold">Week {rosterWeek} roster</h3>
          <div className="card table-scroll">
            <table className="w-full min-w-100 text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-muted">
                  <th className="px-3 py-2">Slot</th>
                  <th className="px-2 py-2">Player</th>
                  <th className="px-2 py-2 text-right">Proj</th>
                  <th className="px-3 py-2 text-right">Pts</th>
                </tr>
              </thead>
              <tbody>
                {roster.map((rs) => {
                  const p = player(rs.playerId);
                  return (
                    <tr
                      key={rs.playerId}
                      className={`border-b border-hairline last:border-0 ${rs.isStarter ? "" : "text-ink2"}`}
                    >
                      <td className="px-3 py-1.5">
                        <span className={`inline-block w-11 rounded px-1.5 py-0.5 text-center text-xs font-bold ${rs.isStarter ? "bg-accent text-white" : "bg-surface2 text-muted"}`}>
                          {rs.slot}
                        </span>
                      </td>
                      <td className="px-2 py-1.5">
                        <span className="font-semibold">{p?.name ?? "?"}</span>
                        <span className="ml-1.5 text-xs text-muted">
                          {p?.position} · {p?.nflTeam}
                          {p?.injuryStatus ? ` · ${p.injuryStatus[0]}` : ""}
                        </span>
                      </td>
                      <td className="px-2 py-1.5 text-right tnum text-muted">{fmtPts(rs.projected)}</td>
                      <td className="px-3 py-1.5 text-right tnum font-semibold">{fmtPts(rs.points)}</td>
                    </tr>
                  );
                })}
                {!roster.length && (
                  <tr>
                    <td colSpan={4} className="px-3 py-3 text-sm text-muted">
                      No roster synced for this week yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="lg:col-span-2">
          <h3 className="mb-3 font-bold">Schedule</h3>
          <ul className="card divide-y divide-hairline">
            {schedule.map((m) => {
              const isHome = m.homeTeamId === t.id;
              const opp = team(isHome ? m.awayTeamId : m.homeTeamId);
              const my = isHome ? m.homeScore : m.awayScore;
              const their = isHome ? m.awayScore : m.homeScore;
              const won = m.isFinal && m.winnerId === t.id;
              return (
                <li key={m.id} className="flex items-center gap-2.5 px-3 py-2 text-sm">
                  <span className="tnum w-10 shrink-0 text-xs text-muted">Wk {m.week}</span>
                  <span className="w-6 text-xs text-muted">{isHome ? "vs" : "@"}</span>
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {opp ? (
                      <Link href={`/teams/${opp.id}`} className="hover:underline">{opp.name}</Link>
                    ) : ("Bye")}
                  </span>
                  {m.isFinal ? (
                    <span className="tnum text-xs">
                      <span className={`font-bold ${won ? "text-goodtext" : "text-bad"}`}>
                        {won ? "W" : my === their ? "T" : "L"}
                      </span>{" "}
                      {fmtPts(my)}–{fmtPts(their)}
                    </span>
                  ) : m.week === league.currentWeek ? (
                    <span className="tnum text-xs font-semibold">{fmtPts(my)}–{fmtPts(their)}</span>
                  ) : (
                    <span className="text-xs text-muted">{m.isPlayoff ? "Playoffs" : "—"}</span>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      </div>
    </div>
  );
}
