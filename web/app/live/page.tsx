import Markdown from "react-markdown";
import MatchupCard from "@/components/MatchupCard";
import TeamMark from "@/components/TeamMark";
import AutoRefresh from "@/components/AutoRefresh";
import { getBundle } from "@/lib/data";
import { fmtPts } from "@/lib/format";
import { teamById } from "@/lib/stats";
import type { GameAnalysis } from "@/lib/types";

export default async function Live() {
  const bundle = await getBundle();
  const { league } = bundle;
  const team = teamById(bundle);
  const week = league.currentWeek;
  const matchups = bundle.matchups.filter((m) => m.week === week);
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
          <h3 className="mb-2 font-bold">NFL slate</h3>
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
                      <span className="text-[11px] text-muted">{g.statusDetail ?? ""}</span>
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

      <section className="space-y-4">
        {matchups.map((m) => {
          const home = team(m.homeTeamId)!;
          const away = team(m.awayTeamId);
          const analysis = analysisByHome.get(m.homeTeamId);
          const live = !m.isFinal && m.homeScore + m.awayScore > 0;
          return (
            <div key={m.id} className="grid gap-3 lg:grid-cols-5">
              <div className="lg:col-span-2">
                <MatchupCard matchup={m} home={home} away={away} live={live} />
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
