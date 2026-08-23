import Link from "next/link";
import TeamMark from "./TeamMark";
import { fmtPts, record } from "@/lib/format";
import { winProbability } from "@/lib/stats";
import type { Matchup, Team } from "@/lib/types";

function Row({
  team,
  score,
  projected,
  yetToPlay,
  won,
  live,
}: {
  team: Team;
  score: number;
  projected: number | null;
  yetToPlay: number | null;
  won: boolean;
  live: boolean;
}) {
  return (
    <div className="flex items-center gap-2.5 py-1.5">
      <TeamMark team={team} size="md" />
      <div className="min-w-0 flex-1">
        <div className={`truncate text-sm ${won ? "font-bold" : "font-medium"}`}>{team.name}</div>
        <div className="text-xs text-muted">
          {record(team.wins, team.losses, team.ties)}
          {live && yetToPlay != null && yetToPlay > 0 && (
            <span> · {yetToPlay} yet to play</span>
          )}
        </div>
      </div>
      <div className="text-right">
        <div className={`tnum text-lg ${won ? "font-extrabold" : "font-semibold text-ink2"}`}>
          {fmtPts(score)}
        </div>
        {live && projected != null && (
          <div className="tnum text-xs text-muted">proj {fmtPts(projected, 0)}</div>
        )}
      </div>
    </div>
  );
}

export default function MatchupCard({
  matchup,
  home,
  away,
  live,
  href,
}: {
  matchup: Matchup;
  home: Team;
  away: Team | undefined;
  live: boolean;
  href?: string;
}) {
  if (!away)
    return (
      <div className="card p-3">
        <Row team={home} score={matchup.homeScore} projected={null} yetToPlay={null} won={false} live={false} />
        <div className="text-xs text-muted">Bye week</div>
      </div>
    );
  const prob = live ? winProbability(matchup) : null;
  const homeWon = matchup.isFinal && matchup.winnerId === home.id;
  const awayWon = matchup.isFinal && matchup.winnerId === away.id;
  const Card = href ? Link : "div";
  const cardProps = href ? { href } : {};
  return (
    <Card {...(cardProps as { href: string })} className={`card block p-3 ${href ? "hover:border-accent" : ""}`}>
      {live && (
        <div className="mb-1 flex items-center gap-1.5">
          <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" aria-hidden />
          <span className="kicker text-goodtext">Live</span>
        </div>
      )}
      <Row team={home} score={matchup.homeScore} projected={matchup.homeProjected} yetToPlay={matchup.homeYetToPlay} won={homeWon} live={live} />
      <Row team={away} score={matchup.awayScore} projected={matchup.awayProjected} yetToPlay={matchup.awayYetToPlay} won={awayWon} live={live} />
      {prob != null && (
        <div className="mt-2">
          <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
            <div className="rounded-l-full bg-accent" style={{ width: `${prob * 100}%` }} />
            <div className="flex-1 rounded-r-full bg-accentsoft" />
          </div>
          <div className="mt-1 flex justify-between text-[11px] text-muted">
            <span>
              {home.abbrev} {Math.round(prob * 100)}%
            </span>
            <span>
              {away.abbrev} {Math.round((1 - prob) * 100)}%
            </span>
          </div>
        </div>
      )}
    </Card>
  );
}
