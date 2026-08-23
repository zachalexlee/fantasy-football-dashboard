import Link from "next/link";
import { notFound } from "next/navigation";
import AutoRefresh from "@/components/AutoRefresh";
import TeamMark from "@/components/TeamMark";
import { getBundle } from "@/lib/data";
import { fmtPts, record } from "@/lib/format";
import { headToHead, playerById, teamById, winProbability } from "@/lib/stats";
import { statLine } from "@/lib/statline";
import type { RosterSlot } from "@/lib/types";

// Starter slots, in display order. Bench/IR handled separately.
const STARTER_ORDER = ["QB", "RB", "WR", "TE", "FLEX", "RB/WR", "WR/TE", "OP", "D/ST", "K"];

function slotRank(slot: string): number {
  const i = STARTER_ORDER.indexOf(slot);
  return i === -1 ? 99 : i;
}

export default async function MatchupPage({
  params,
  searchParams,
}: {
  params: Promise<{ teamId: string }>;
  searchParams: Promise<{ week?: string }>;
}) {
  const { teamId } = await params;
  const { week: weekParam } = await searchParams;
  const bundle = await getBundle();
  const { league } = bundle;
  const team = teamById(bundle);
  const player = playerById(bundle);

  const week = Math.min(Math.max(Number(weekParam) || league.currentWeek, 1), league.finalWeek);
  const m = bundle.matchups.find(
    (x) => x.week === week && (x.homeTeamId === teamId || x.awayTeamId === teamId)
  );
  if (!m) notFound();

  const home = team(m.homeTeamId)!;
  const away = team(m.awayTeamId);
  if (!away) notFound(); // bye week — no head-to-head to show

  const live = !m.isFinal && m.homeScore + m.awayScore > 0;
  const started = live || m.isFinal;
  // Only bold an actual leader/winner — never on a 0-0 pre-game or a tie.
  const homeWon = started && m.homeScore > m.awayScore;
  const awayWon = started && m.awayScore > m.homeScore;
  const prob = live ? winProbability(m) : null;
  const series = headToHead(bundle)(home.id, away.id);
  const seriesGames = series.w + series.l + series.t;

  const startersFor = (tid: string) =>
    bundle.rosterSlots
      .filter((r) => r.teamId === tid && r.week === week && r.isStarter)
      .sort((a, b) => slotRank(a.slot) - slotRank(b.slot));
  const benchFor = (tid: string) =>
    bundle.rosterSlots
      .filter((r) => r.teamId === tid && r.week === week && !r.isStarter && r.slot !== "IR")
      .sort((a, b) => b.points - a.points);

  const homeStart = startersFor(home.id);
  const awayStart = startersFor(away.id);
  // Pair starters by slot position so the two lineups line up row-for-row.
  const rows = Math.max(homeStart.length, awayStart.length);

  const PlayerCell = ({ rs, align }: { rs: RosterSlot | undefined; align: "left" | "right" }) => {
    if (!rs) return <div className="flex-1" />;
    const p = player(rs.playerId);
    const done = rs.projected != null && rs.points > 0;
    const line = statLine(rs.stats);
    return (
      <div className={`flex min-w-0 flex-1 items-center gap-2 ${align === "right" ? "flex-row-reverse text-right" : ""}`}>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-semibold">{p?.name ?? "—"}</div>
          <div className="truncate text-xs text-muted">
            {p?.position} · {p?.nflTeam}
            {p?.injuryStatus ? ` · ${p.injuryStatus[0]}` : ""}
          </div>
          {line && <div className="truncate text-[11px] text-ink2">{line}</div>}
        </div>
        <div className={`shrink-0 ${align === "right" ? "text-left" : "text-right"}`}>
          <div className="tnum text-sm font-bold">{fmtPts(rs.points)}</div>
          {live && !done && rs.projected != null && (
            <div className="tnum text-[11px] text-muted">{fmtPts(rs.projected, 0)}p</div>
          )}
        </div>
      </div>
    );
  };

  const BenchList = ({ tid }: { tid: string }) => {
    const bench = benchFor(tid);
    const total = bench.reduce((a, s) => a + s.points, 0);
    return (
      <div>
        <div className="mb-1 flex items-baseline justify-between">
          <span className="kicker">Bench</span>
          <span className="tnum text-xs text-muted">{fmtPts(total)}</span>
        </div>
        <ul className="space-y-1">
          {bench.map((rs) => {
            const p = player(rs.playerId);
            return (
              <li key={rs.playerId} className="flex items-center justify-between text-xs text-ink2">
                <span className="truncate">
                  <span className="text-muted">{p?.position}</span> {p?.name ?? "—"}
                </span>
                <span className="tnum">{fmtPts(rs.points)}</span>
              </li>
            );
          })}
          {!bench.length && <li className="text-xs text-muted">No bench synced.</li>}
        </ul>
      </div>
    );
  };

  const TeamHead = ({
    t,
    score,
    projected,
    ytp,
    won,
  }: {
    t: typeof home;
    score: number;
    projected: number | null;
    ytp: number | null;
    won: boolean;
  }) => (
    <div className="flex items-center gap-2.5">
      <TeamMark team={t} size="md" />
      <div className="min-w-0">
        <Link href={`/teams/${t.id}`} className="block truncate font-bold hover:underline">
          {t.name}
        </Link>
        <div className="text-xs text-muted">
          {record(t.wins, t.losses, t.ties)}
          {live && ytp != null && ytp > 0 ? ` · ${ytp} to play` : ""}
        </div>
      </div>
      <div className="ml-auto text-right">
        {started ? (
          <div className={`tnum text-2xl font-extrabold ${won ? "" : "text-ink2"}`}>
            {fmtPts(score)}
          </div>
        ) : (
          <div className="tnum text-2xl font-extrabold text-ink2">
            {projected != null ? fmtPts(projected, 0) : "—"}
            <span className="ml-1 align-middle text-[11px] font-semibold text-muted">proj</span>
          </div>
        )}
      </div>
    </div>
  );

  const weeks = [...new Set(bundle.matchups.map((x) => x.week))].sort((a, b) => a - b);

  return (
    <div className="space-y-6">
      {live && <AutoRefresh seconds={60} />}

      <div className="flex items-center justify-between gap-3">
        <Link href="/live" className="text-sm font-semibold text-accent hover:underline">
          ← Live
        </Link>
        <div className="table-scroll">
          <div className="flex gap-1">
            {weeks.map((w) => (
              <Link
                key={w}
                href={`/matchup/${teamId}?week=${w}`}
                className={`inline-flex h-7 min-w-7 items-center justify-center rounded-lg px-2 text-xs font-semibold tnum ${
                  w === week ? "bg-accent text-white" : "bg-surface2 text-ink2"
                }`}
              >
                {w}
              </Link>
            ))}
          </div>
        </div>
      </div>

      <div className="card p-4">
        {live && (
          <div className="mb-2 flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-good" aria-hidden />
            <span className="kicker text-goodtext">Live · Week {week}</span>
          </div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <TeamHead t={home} score={m.homeScore} projected={m.homeProjected} ytp={m.homeYetToPlay} won={homeWon} />
          <TeamHead t={away} score={m.awayScore} projected={m.awayProjected} ytp={m.awayYetToPlay} won={awayWon} />
        </div>
        {seriesGames > 0 && (
          <p className="mt-3 text-center text-xs text-muted">
            Season series: <span className="font-semibold text-ink2">{home.abbrev} {series.w}–{series.l}{series.t ? `–${series.t}` : ""} {away.abbrev}</span>
          </p>
        )}
        {prob != null && (
          <div className="mt-3">
            <div className="flex h-1.5 w-full gap-0.5 overflow-hidden rounded-full">
              <div className="rounded-l-full bg-accent" style={{ width: `${prob * 100}%` }} />
              <div className="flex-1 rounded-r-full bg-accentsoft" />
            </div>
            <div className="mt-1 flex justify-between text-[11px] text-muted">
              <span>{home.abbrev} {Math.round(prob * 100)}% win</span>
              <span>{away.abbrev} {Math.round((1 - prob) * 100)}%</span>
            </div>
          </div>
        )}
      </div>

      {/* Starters, slot by slot, side by side */}
      <div className="card divide-y divide-hairline">
        {Array.from({ length: rows }).map((_, i) => {
          const h = homeStart[i];
          const a = awayStart[i];
          const slot = h?.slot ?? a?.slot ?? "";
          return (
            <div key={i} className="flex items-stretch gap-2 px-3 py-2">
              <PlayerCell rs={h} align="left" />
              <div className="flex w-14 shrink-0 items-center justify-center">
                <span className="rounded bg-surface2 px-1.5 py-0.5 text-center text-[11px] font-bold text-muted">
                  {slot}
                </span>
              </div>
              <PlayerCell rs={a} align="right" />
            </div>
          );
        })}
        {!homeStart.length && !awayStart.length && (
          <div className="px-3 py-4 text-center text-sm text-muted">
            Lineups appear once rosters sync for week {week}.
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="card p-3">
          <BenchList tid={home.id} />
        </div>
        <div className="card p-3">
          <BenchList tid={away.id} />
        </div>
      </div>
    </div>
  );
}
