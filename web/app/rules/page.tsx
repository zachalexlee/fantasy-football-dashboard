import { getBundle } from "@/lib/data";
import { rosterComposition, scoringRules } from "@/lib/scoring";

export const metadata = { title: "League Rules" };

function fmt(n: number): string {
  return n.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

export default async function Rules() {
  const bundle = await getBundle();
  const { league } = bundle;
  const roster = rosterComposition(league.settings);
  const { rules, ppr, unknown } = scoringRules(league.scoring);
  const starters = roster.filter((r) => r.slot !== "BE" && r.slot !== "IR");
  const bench = roster.find((r) => r.slot === "BE")?.count ?? 0;
  const ir = roster.find((r) => r.slot === "IR")?.count ?? 0;

  const pprLabel =
    ppr == null ? null : ppr >= 1 ? "Full PPR" : ppr >= 0.5 ? "Half PPR" : ppr > 0 ? `${ppr} PPR` : "Standard (non-PPR)";

  const format: [string, string][] = [
    ["Season", String(league.season)],
    ["Regular season", `${league.regularSeasonWeeks} weeks`],
    ["Playoff teams", String(league.playoffTeamCount)],
    ["Waivers", league.faabBudget != null ? `FAAB · $${league.faabBudget} budget` : "Waiver priority"],
    ...(pprLabel ? ([["Reception scoring", pprLabel]] as [string, string][]) : []),
  ];

  return (
    <div className="space-y-8">
      <div>
        <h2 className="mb-1 text-lg font-extrabold tracking-tight">League Rules</h2>
        <p className="text-sm text-ink2">Format, roster, and scoring — straight from the ESPN settings.</p>
      </div>

      <section>
        <h3 className="mb-3 font-bold">Format</h3>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {format.map(([k, v]) => (
            <div key={k} className="card px-3 py-2.5">
              <div className="kicker">{k}</div>
              <div className="mt-0.5 text-base font-extrabold">{v}</div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <h3 className="mb-1 font-bold">Starting lineup</h3>
        <p className="mb-3 text-xs text-muted">
          {starters.reduce((a, r) => a + r.count, 0)} starters · {bench} bench{ir ? ` · ${ir} IR` : ""}
        </p>
        {starters.length ? (
          <div className="flex flex-wrap gap-2">
            {starters.map((r) => (
              <span key={r.slot} className="rounded-lg border border-hairline bg-surface px-3 py-1.5 text-sm font-semibold">
                {r.count}× <span className="text-accent">{r.slot}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="text-sm text-muted">Roster settings weren&apos;t synced for this league.</p>
        )}
      </section>

      <section>
        <h3 className="mb-3 font-bold">Scoring</h3>
        {rules.length ? (
          <div className="card table-scroll">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-hairline text-left text-xs text-muted">
                  <th className="px-3 py-2.5">Rule</th>
                  <th className="px-3 py-2.5 text-right">Points</th>
                </tr>
              </thead>
              <tbody>
                {rules.map((r, i) => (
                  <tr key={i} className="border-b border-hairline last:border-0">
                    <td className="px-3 py-2">{r.label}</td>
                    <td className={`px-3 py-2 text-right tnum font-semibold ${r.points < 0 ? "text-bad" : ""}`}>
                      {r.points > 0 ? "+" : ""}
                      {fmt(r.points)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-sm text-muted">Scoring settings weren&apos;t synced for this league.</p>
        )}
        {unknown > 0 && (
          <p className="mt-2 text-xs text-muted">
            + {unknown} more specialized scoring {unknown === 1 ? "rule" : "rules"} (kicking distances,
            defensive tiers) configured in ESPN.
          </p>
        )}
      </section>
    </div>
  );
}
