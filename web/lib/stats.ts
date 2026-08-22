// Cheap display-level selectors over the bundle. Heavy math (all-play, luck,
// power, odds, efficiency) comes precomputed from computed_stats.

import type { Bundle, Matchup, Team } from "./types";

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
