import Link from "next/link";
import Meter from "@/components/Meter";
import TeamMark from "@/components/TeamMark";
import { getBundle } from "@/lib/data";
import { fmtPct, record } from "@/lib/format";
import { statLookup } from "@/lib/stats";

export const metadata = { title: "Playoff Odds" };

function ClinchBadge({ odds }: { odds: number }) {
  if (odds >= 0.9995)
    return (
      <span className="rounded bg-good/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-goodtext" title="Clinched a playoff spot in every simulation">
        Clinched
      </span>
    );
  if (odds <= 0.0005)
    return (
      <span className="rounded bg-surface2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-muted" title="Missed the playoffs in every simulation">
        Eliminated
      </span>
    );
  return null;
}

export default async function Odds() {
  const bundle = await getBundle();
  const { league } = bundle;
  const stat = statLookup(bundle);
  // Only 6-team brackets award first-round byes, so the Bye column is dead
  // weight (all 0%) otherwise.
  const showBye = league.playoffTeamCount === 6;

  const rows = bundle.teams
    .map((t) => ({
      team: t,
      odds: stat(t.id, "playoff_odds") ?? 0,
      bye: stat(t.id, "bye_odds") ?? 0,
      seed: stat(t.id, "proj_seed") ?? 0,
    }))
    .sort((a, b) => a.seed - b.seed);

  return (
    <div>
      <h2 className="mb-1 text-lg font-extrabold tracking-tight">Playoff odds</h2>
      <p className="mb-4 text-sm text-ink2">
        10,000 Monte Carlo season simulations from the remaining schedule and each team&apos;s
        scoring distribution. {league.playoffTeamCount}-team bracket
        {league.playoffTeamCount === 6 ? ", top 2 seeds get a first-round bye" : ""}; regular
        season runs through week {league.regularSeasonWeeks}. Updated every sync.
      </p>
      <div className="card table-scroll">
        <table className="w-full min-w-140 text-sm">
          <thead>
            <tr className="border-b border-hairline text-left text-xs text-muted">
              <th className="px-3 py-2.5">Proj. seed</th>
              <th className="px-2 py-2.5">Team</th>
              <th className="px-2 py-2.5">Record</th>
              <th className="px-2 py-2.5">Playoffs</th>
              {showBye && <th className="px-2 py-2.5 text-right">Bye</th>}
              <th className="px-3 py-2.5 text-right">Avg. seed</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ team: t, odds, bye, seed }, i) => (
              <tr key={t.id} className="border-b border-hairline last:border-0">
                <td className="px-3 py-2.5">
                  <span className={`tnum text-lg font-extrabold ${i < league.playoffTeamCount ? "text-accent" : "text-muted"}`}>
                    {i + 1}
                  </span>
                </td>
                <td className="px-2 py-2.5">
                  <Link href={`/teams/${t.id}`} className="flex items-center gap-2 hover:underline">
                    <TeamMark team={t} size="sm" />
                    <span className="max-w-44 truncate font-semibold">{t.name}</span>
                    <ClinchBadge odds={odds} />
                  </Link>
                </td>
                <td className="px-2 py-2.5 tnum">{record(t.wins, t.losses, t.ties)}</td>
                <td className="px-2 py-2.5">
                  <div className="flex items-center gap-2">
                    <Meter fraction={odds} label={`${t.name} playoff odds`} />
                    <span className="tnum w-11 text-right font-bold">{fmtPct(odds)}</span>
                  </div>
                </td>
                {showBye && <td className="px-2 py-2.5 text-right tnum text-ink2">{fmtPct(bye)}</td>}
                <td className="px-3 py-2.5 text-right tnum text-ink2">{seed.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
