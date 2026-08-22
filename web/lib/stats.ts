// Cheap display-level selectors over the bundle. Heavy math (all-play, luck,
// power, odds, efficiency) comes precomputed from computed_stats.

import type { Bundle, Matchup, SeasonSlice, Team } from "./types";

export function statLookup(bundle: Bundle) {
  const map = new Map<string, number>();
  for (const s of bundle.stats) map.set(`${s.teamId}|${s.week}|${s.statKey}`, s.value);
  return (teamId: string, key: string, week = 0) => map.get(`${teamId}|${week}|${key}`);
}

export function standings(bundle: Bundle): Team[] {
  return [...bundle.teams].sort(
    (a, b) => b.wins + b.ties * 0.5 - (a.wins + a.ties * 0.5) || b.pointsFor - a.pointsFor
  );
}

export function teamById(bundle: Bundle) {
  const map = new Map(bundle.teams.map((t) => [t.id, t]));
  return (id: string | null | undefined) => (id ? map.get(id) : undefined);
}

export function playerById(bundle: Bundle) {
  const map = new Map(bundle.players.map((p) => [p.id, p]));
  return (id: string | null | undefined) => (id ? map.get(id) : undefined);
}

export function weeklyPoints(bundle: Bundle, teamId: string): { week: number; points: number }[] {
  return bundle.stats
    .filter((s) => s.teamId === teamId && s.statKey === "weekly_score" && s.week > 0)
    .sort((a, b) => a.week - b.week)
    .map((s) => ({ week: s.week, points: s.value }));
}

export function lastCompletedWeek(bundle: Bundle): number {
  const finals = bundle.matchups.filter((m) => m.isFinal && !m.isPlayoff).map((m) => m.week);
  return finals.length ? Math.max(...finals) : 0;
}

/** Win probability for the home side from projection gap + current margin. */
export function winProbability(m: Matchup): number | null {
  if (m.isFinal || m.homeProjected == null || m.awayProjected == null) return null;
  const projGap = m.homeProjected - m.awayProjected;
  const scoreGap = m.homeScore - m.awayScore;
  const started = (m.homeScore || 0) + (m.awayScore || 0) > 0;
  const x = started ? scoreGap * 0.7 + projGap * 0.5 : projGap;
  return 1 / (1 + Math.exp(-x / 12));
}

export type ScheduleCell = { w: number; l: number; t: number };

/** Record-vs-every-schedule grid: what row-team's record would be with
 * column-team's schedule. Diagonal = actual schedule. */
export function recordVsSchedule(bundle: Bundle, throughWeek: number) {
  const teams = bundle.teams;
  const oppOf = new Map<string, Map<number, { opp: string; oppScore: number }>>();
  const scoreOf = new Map<string, Map<number, number>>();
  for (const m of bundle.matchups) {
    if (!m.isFinal || m.isPlayoff || m.week > throughWeek || !m.awayTeamId) continue;
    for (const [me, opp, myScore, oppScore] of [
      [m.homeTeamId, m.awayTeamId, m.homeScore, m.awayScore],
      [m.awayTeamId, m.homeTeamId, m.awayScore, m.homeScore],
    ] as [string, string, number, number][]) {
      if (!oppOf.has(me)) oppOf.set(me, new Map());
      if (!scoreOf.has(me)) scoreOf.set(me, new Map());
      oppOf.get(me)!.set(m.week, { opp, oppScore });
      scoreOf.get(me)!.set(m.week, myScore);
    }
  }
  const grid = new Map<string, Map<string, ScheduleCell>>();
  for (const a of teams) {
    const row = new Map<string, ScheduleCell>();
    for (const b of teams) {
      const cell: ScheduleCell = { w: 0, l: 0, t: 0 };
      const bSched = oppOf.get(b.id) ?? new Map();
      for (const [week, { opp, oppScore }] of bSched) {
        const myScore = scoreOf.get(a.id)?.get(week);
        if (myScore == null) continue;
        // Taking B's schedule: if B played A that week, A plays B instead.
        const target = opp === a.id ? scoreOf.get(b.id)?.get(week) : oppScore;
        if (target == null) continue;
        if (myScore > target) cell.w++;
        else if (myScore < target) cell.l++;
        else cell.t++;
      }
      row.set(b.id, cell);
    }
    grid.set(a.id, row);
  }
  return grid;
}

export type RecordBookEntry = { label: string; teamId: string; detail: string; value: number };

export function recordBook(bundle: Bundle) {
  const finals = bundle.matchups.filter((m) => m.isFinal && m.awayTeamId);
  const perf: { teamId: string; week: number; points: number; against: string }[] = [];
  for (const m of finals) {
    perf.push({ teamId: m.homeTeamId, week: m.week, points: m.homeScore, against: m.awayTeamId! });
    perf.push({ teamId: m.awayTeamId!, week: m.week, points: m.awayScore, against: m.homeTeamId });
  }
  const margin = (m: Matchup) => Math.abs(m.homeScore - m.awayScore);
  return {
    topScores: [...perf].sort((a, b) => b.points - a.points).slice(0, 8),
    lowScores: [...perf].sort((a, b) => a.points - b.points).slice(0, 8),
    blowouts: [...finals].sort((a, b) => margin(b) - margin(a)).slice(0, 6),
    nailbiters: [...finals].sort((a, b) => margin(a) - margin(b)).slice(0, 6),
  };
}

/** Head-to-head all-time (this season's synced data) between every pair. */
export function headToHead(bundle: Bundle) {
  const h2h = new Map<string, ScheduleCell>();
  for (const m of bundle.matchups) {
    if (!m.isFinal || !m.awayTeamId) continue;
    const key = `${m.homeTeamId}|${m.awayTeamId}`;
    const rkey = `${m.awayTeamId}|${m.homeTeamId}`;
    if (!h2h.has(key)) h2h.set(key, { w: 0, l: 0, t: 0 });
    if (!h2h.has(rkey)) h2h.set(rkey, { w: 0, l: 0, t: 0 });
    if (m.homeScore === m.awayScore) {
      h2h.get(key)!.t++;
      h2h.get(rkey)!.t++;
    } else if (m.homeScore > m.awayScore) {
      h2h.get(key)!.w++;
      h2h.get(rkey)!.l++;
    } else {
      h2h.get(key)!.l++;
      h2h.get(rkey)!.w++;
    }
  }
  return (a: string, b: string) => h2h.get(`${a}|${b}`) ?? { w: 0, l: 0, t: 0 };
}

// ---------------------------------------------------------------------------
// Cross-season (franchise) reports. Managers are matched across seasons by
// ESPN owner guid, falling back to display name for very old seasons.

const franchiseKey = (t: Team) => t.ownerGuid ?? t.ownerName ?? t.name;

export type Franchise = {
  key: string;
  /** Most recent team object (for name, logo, links). */
  team: Team;
  managerName: string;
  seasonsPlayed: number;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  championships: number;
  runnerUps: number;
  top5: number;
  playoffBerths: number;
  bestFinish: { rank: number; season: number } | null;
  inCurrentSeason: boolean;
};

/** A season counts once games were played or a final rank exists. */
const seasonCounts = (t: Team) => t.wins + t.losses + t.ties > 0 || (t.finalRank ?? 0) > 0;

export function franchises(bundle: Bundle): Franchise[] {
  const map = new Map<string, Franchise>();
  bundle.seasons.forEach((slice, si) => {
    for (const t of slice.teams) {
      const key = franchiseKey(t);
      let f = map.get(key);
      if (!f) {
        f = {
          key, team: t, managerName: t.ownerName || t.name,
          seasonsPlayed: 0, wins: 0, losses: 0, ties: 0,
          pointsFor: 0, pointsAgainst: 0,
          championships: 0, runnerUps: 0, top5: 0, playoffBerths: 0,
          bestFinish: null, inCurrentSeason: si === 0,
        };
        map.set(key, f);
      }
      if (!seasonCounts(t)) continue;
      f.seasonsPlayed++;
      f.wins += t.wins;
      f.losses += t.losses;
      f.ties += t.ties;
      f.pointsFor += t.pointsFor;
      f.pointsAgainst += t.pointsAgainst;
      const rank = t.finalRank ?? 0;
      if (rank > 0) {
        if (rank === 1) f.championships++;
        if (rank === 2) f.runnerUps++;
        if (rank <= 5) f.top5++;
        if (rank <= slice.league.playoffTeamCount) f.playoffBerths++;
        if (!f.bestFinish || rank < f.bestFinish.rank)
          f.bestFinish = { rank, season: slice.league.season };
      }
    }
  });
  return [...map.values()].sort(
    (a, b) =>
      b.championships - a.championships ||
      (a.bestFinish?.rank ?? 99) - (b.bestFinish?.rank ?? 99) ||
      winPct(b) - winPct(a)
  );
}

export const winPct = (f: { wins: number; losses: number; ties: number }) => {
  const g = f.wins + f.losses + f.ties;
  return g ? (f.wins + f.ties * 0.5) / g : 0;
};

export function championshipHistory(bundle: Bundle) {
  return bundle.seasons
    .filter((s) => s.teams.some((t) => (t.finalRank ?? 0) > 0))
    .map((s) => ({
      season: s.league.season,
      champion: s.teams.find((t) => t.finalRank === 1),
      runnerUp: s.teams.find((t) => t.finalRank === 2),
    }))
    .sort((a, b) => b.season - a.season);
}

export type AllTimePerf = { season: number; week: number; teamName: string; oppAbbrev: string; points: number };
export type AllTimeGame = {
  season: number; week: number; margin: number;
  homeAbbrev: string; awayAbbrev: string; homeScore: number; awayScore: number; homeWon: boolean;
};

/** Record book across every synced season. Zero-score placeholder games
 * (unplayed old consolation slots) are excluded. */
export function recordBookAllTime(bundle: Bundle) {
  const perfs: AllTimePerf[] = [];
  const games: AllTimeGame[] = [];
  for (const slice of bundle.seasons) {
    const team = new Map(slice.teams.map((t) => [t.id, t]));
    for (const m of slice.matchups) {
      if (!m.isFinal || !m.awayTeamId) continue;
      if (m.homeScore <= 0 && m.awayScore <= 0) continue;
      const home = team.get(m.homeTeamId);
      const away = team.get(m.awayTeamId);
      if (!home || !away) continue;
      const base = { season: slice.league.season, week: m.week };
      perfs.push(
        { ...base, teamName: home.name, oppAbbrev: away.abbrev, points: m.homeScore },
        { ...base, teamName: away.name, oppAbbrev: home.abbrev, points: m.awayScore }
      );
      games.push({
        ...base,
        margin: Math.abs(m.homeScore - m.awayScore),
        homeAbbrev: home.abbrev, awayAbbrev: away.abbrev,
        homeScore: m.homeScore, awayScore: m.awayScore,
        homeWon: m.winnerId === m.homeTeamId,
      });
    }
  }
  const realPerfs = perfs.filter((p) => p.points > 0);
  return {
    topScores: [...perfs].sort((a, b) => b.points - a.points).slice(0, 8),
    lowScores: [...realPerfs].sort((a, b) => a.points - b.points).slice(0, 8),
    blowouts: [...games].sort((a, b) => b.margin - a.margin).slice(0, 6),
    nailbiters: [...games].sort((a, b) => a.margin - b.margin).slice(0, 6),
  };
}

/** Best single seasons: points-for and record. */
export function seasonBests(bundle: Bundle) {
  const rows = bundle.seasons.flatMap((s) =>
    s.teams.filter(seasonCounts).map((t) => ({
      season: s.league.season,
      team: t,
      pf: t.pointsFor,
      pct: winPct(t),
      record: { wins: t.wins, losses: t.losses, ties: t.ties },
    }))
  );
  return {
    topPF: [...rows].sort((a, b) => b.pf - a.pf).slice(0, 6),
    bestRecords: [...rows].sort((a, b) => b.pct - a.pct || b.pf - a.pf).slice(0, 6),
  };
}

/** All-time head-to-head between franchises (regular season + playoffs). */
export function franchiseH2H(bundle: Bundle) {
  const cells = new Map<string, ScheduleCell>();
  const bump = (a: string, b: string, field: keyof ScheduleCell) => {
    const key = `${a}|${b}`;
    if (!cells.has(key)) cells.set(key, { w: 0, l: 0, t: 0 });
    cells.get(key)![field]++;
  };
  for (const slice of bundle.seasons) {
    const keyOf = new Map(slice.teams.map((t) => [t.id, franchiseKey(t)]));
    for (const m of slice.matchups) {
      if (!m.isFinal || !m.awayTeamId) continue;
      if (m.homeScore <= 0 && m.awayScore <= 0) continue;
      const h = keyOf.get(m.homeTeamId);
      const a = keyOf.get(m.awayTeamId);
      if (!h || !a || h === a) continue;
      if (m.homeScore === m.awayScore) {
        bump(h, a, "t");
        bump(a, h, "t");
      } else if (m.winnerId === m.homeTeamId) {
        bump(h, a, "w");
        bump(a, h, "l");
      } else {
        bump(h, a, "l");
        bump(a, h, "w");
      }
    }
  }
  return (a: string, b: string): ScheduleCell => cells.get(`${a}|${b}`) ?? { w: 0, l: 0, t: 0 };
}
