import Markdown from "react-markdown";
import MatchupCard from "@/components/MatchupCard";
import Highlights from "@/components/Highlights";
import AutoRefresh from "@/components/AutoRefresh";
import { getBundle } from "@/lib/data";
import { fmtKickoff, fmtPts } from "@/lib/format";
import { playerById, teamById } from "@/lib/stats";
import { statLine } from "@/lib/statline";
import type { GameAnalysis } from "@/lib/types";

export const metadata = { title: "Live & Gamecast" };

export default async function Live() {
  const bundle = await getBundle();
  const { league } = bundle;
  const team = teamById(bundle);
  const player = playerById(bundle);
  const week = league.currentWeek;
  const matchups = bundle.matchups.filter((m) => m.week === week);

  // Top fantasy performers among all rostered starters this week.
  const topPerformers = bundle.rosterSlots
    .filter((r) => r.week === week && r.isStarter && r.points > 0)
    .sort((a, b) => b.points - a.points)
    .slice(0, 10);
  const anyLive = matchups.some((m) => !m.isFinal && m.homeScore + m.awayScore > 0);

  const analysisByHome = new Map<string, GameAnalysis>(
    bundle.gameAnalysis.filter((a) => a.week === week).map((a) => [a.homeTeamId, a])
  );

  const stateBadge = (a: GameAnalysis | undefined) => {
    if (!a) return null;
    const map: Record<string, [string, string]> = {
      live: ["bg-good", "Live"],
      final: ["bg-muted", "Final"],
      pre: ["bg-accent", "Preview"],
    };
    const [dot, label] = map[a.state] ?? map.pre;
    return (
      <span className="inline-flex items-center gap-1.5">
        <span className={`h-1.5 w-1.5 rounded-full ${dot} ${a.state === "live" ? "animate-pulse" : ""}`} aria-hidden />
        <span className="kicker">{label}</span>
      </span>
    );
  };

  return (
    <div className="space-y-8">
      {/* Poll for fresh data while any game is live (server revalidates at 60s). */}
      {anyLive && <AutoRefresh seconds={60} />}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <h2 className="text-lg font-extrabold tracking-tight">Live &amp; Gamecast</h2>
          <p className="text-sm text-ink2">
            Week {week} fantasy matchups with AI analysis
            {anyLive && <span className="text-goodtext"> · auto-refreshing</span>}.
          </p>
        </div>
      </div>

      {/* NFL slate strip: real scores + status behind each fantasy game. */}
      {bundle.nflGames.length > 0 && (
        <section>
          <h3 className="mb-2 font-bold">
            NFL slate
            {bundle.nflGames.every((g) => g.seasonType === 1) && (
              <span className="ml-2 rounded-full bg-surface2 px-2 py-0.5 text-[11px] font-semibold text-ink2">
                Preseason
              </span>
            )}
          </h3>
          <div className="table-scroll -mx-1">
            <div className="flex gap-2 px-1 pb-1">
              {bundle.nflGames.map((g) => {
                const live = g.status === "in";
                const post = g.status === "post";
                return (
                  <div key={g.espnEventId} className="card min-w-40 shrink-0 p-2.5">
                    <div className="mb-1 flex items-center justify-between">
                      {live ? (
                        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-goodtext">
                          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" aria-hidden />
                          LIVE
                        </span>
                      ) : (
                        <span className="text-[11px] text-muted">{post ? "Final" : g.network ?? "—"}</span>
                      )}
                      <span className="text-[11px] text-muted">
                        {live || post ? g.statusDetail ?? "" : fmtKickoff(g.kickoff) ?? g.statusDetail ?? ""}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{g.awayAbbrev}</span>
                      <span className="tnum">{live || post ? g.awayScore : ""}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="font-semibold">{g.homeAbbrev}</span>
                      <span className="tnum">{live || post ? g.homeScore : ""}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}

      <Highlights highlights={bundle.highlights} />

      {topPerformers.length > 0 && (
        <section>
          <h3 className="mb-2 font-bold">🌟 Top performers · Week {week}</h3>
          <div className="card table-scroll">
            <ol className="divide-y divide-hairline">
              {topPerformers.map((rs, i) => {
                const p = player(rs.playerId);
                const line = statLine(rs.stats);
                return (
                  <li key={`${rs.teamId}-${rs.playerId}`} className="flex items-center gap-3 px-3 py-2 text-sm">
                    <span className="tnum w-5 text-center text-xs font-bold text-muted">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <span className="font-semibold">{p?.name ?? "—"}</span>
                      <span className="ml-1.5 text-xs text-muted">
                        {p?.position} · {p?.nflTeam} · {team(rs.teamId)?.abbrev}
                      </span>
                      {line && <div className="truncate text-[11px] text-ink2">{line}</div>}
                    </div>
                    <span className="tnum font-bold">{fmtPts(rs.points)}</span>
                  </li>
                );
              })}
            </ol>
          </div>
        </section>
      )}

      <section className="space-y-4">
        {matchups.map((m) => {
          const home = team(m.homeTeamId)!;
          const away = team(m.awayTeamId);
          const analysis = analysisByHome.get(m.homeTeamId);
          const live = !m.isFinal && m.homeScore + m.awayScore > 0;
          return (
            <div key={m.id} className="grid gap-3 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <MatchupCard
                  matchup={m}
                  home={home}
                  away={away}
                  live={live}
                  href={away ? `/matchup/${m.homeTeamId}?week=${week}` : undefined}
                />
              </div>
              <div className="card p-4 lg:col-span-3">
                <div className="mb-1.5 flex items-center justify-between">
                  <h3 className="text-sm font-bold">
                    {away?.name ?? "Bye"} <span className="text-muted">@</span> {home.name}
                  </h3>
                  {stateBadge(analysis)}
                </div>
                {analysis ? (
                  <div className="text-sm leading-relaxed text-ink2 [&_strong]:font-semibold [&_strong]:text-ink [&>p]:mb-2 last:[&>p]:mb-0">
                    <Markdown>{analysis.markdown}</Markdown>
                  </div>
                ) : (
                  <p className="text-sm text-muted">
                    Analysis generates on the next sync once this week&apos;s matchups are set.
                  </p>
                )}
              </div>
            </div>
          );
        })}
        {!matchups.length && (
          <p className="text-sm text-muted">No matchups scheduled for week {week} yet.</p>
        )}
      </section>

      {bundle.demo && (
        <p className="text-xs text-muted">
          Demo mode shows fantasy matchups without a live NFL slate or AI analysis — both populate
          from the worker once connected to your league.
        </p>
      )}
    </div>
  );
}
