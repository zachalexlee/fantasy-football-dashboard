// TypeScript mirror of worker/compute.py, used only to generate demo-mode
// computed stats. In live mode these numbers come from the computed_stats
// table, written by the sync worker.

import type { Matchup, RosterSlot, Stat, Team } from "./types";

export const FLEX_ELIGIBLE: Record<string, string[]> = {
  FLEX: ["RB", "WR", "TE"],
  "RB/WR": ["RB", "WR"],
  "WR/TE": ["WR", "TE"],
  OP: ["QB", "RB", "WR", "TE"],
};

export function weeklyScores(
  teams: Team[],
  matchups: Matchup[],
  throughWeek: number
): Map<string, Map<number, number>> {
  const scores = new Map(teams.map((t) => [t.id, new Map<number, number>()]));
  for (const m of matchups) {
    if (!m.isFinal || m.week > throughWeek || m.isPlayoff) continue;
    scores.get(m.homeTeamId)?.set(m.week, m.homeScore);
    if (m.awayTeamId) scores.get(m.awayTeamId)?.set(m.week, m.awayScore);
  }
  return scores;
}

export function allPlayAndLuck(teams: Team[], matchups: Matchup[], throughWeek: number): Stat[] {
  const scores = weeklyScores(teams, matchups, throughWeek);
  const weeks = new Set<number>();
  scores.forEach((s) => s.forEach((_, w) => weeks.add(w)));
  const apW = new Map<string, number>();
  const apL = new Map<string, number>();
  const expected = new Map<string, number>();
  for (const w of weeks) {
    const inWeek: [string, number][] = [];
    scores.forEach((s, tid) => {
      if (s.has(w)) inWeek.push([tid, s.get(w)!]);
    });
    const n = inWeek.length;
    if (n < 2) continue;
    for (const [tid, pts] of inWeek) {
      const wins = inWeek.filter(([, o]) => o < pts).length;
      const ties = inWeek.filter(([otid, o]) => o === pts && otid !== tid).length;
      apW.set(tid, (apW.get(tid) ?? 0) + wins);
      apL.set(tid, (apL.get(tid) ?? 0) + (n - 1 - wins - ties));
      expected.set(tid, (expected.get(tid) ?? 0) + (wins + ties * 0.5) / (n - 1));
    }
  }
  const rows: Stat[] = [];
  for (const t of teams) {
    rows.push(
      { teamId: t.id, week: 0, statKey: "all_play_wins", value: apW.get(t.id) ?? 0 },
      { teamId: t.id, week: 0, statKey: "all_play_losses", value: apL.get(t.id) ?? 0 },
      {
        teamId: t.id,
        week: 0,
        statKey: "luck_delta",
        value: Math.round((t.wins + t.ties * 0.5 - (expected.get(t.id) ?? 0)) * 100) / 100,
      }
    );
    scores.get(t.id)?.forEach((s, w) =>
      rows.push({ teamId: t.id, week: w, statKey: "weekly_score", value: s })
    );
  }
  return rows;
}

export function streaks(teams: Team[], matchups: Matchup[], throughWeek: number): Stat[] {
  const results = new Map<string, [number, number][]>(teams.map((t) => [t.id, []]));
  for (const m of matchups) {
    if (!m.isFinal || m.week > throughWeek || !m.awayTeamId) continue;
    let hs = 0;
    let as = 0;
    if (m.homeScore !== m.awayScore) {
      hs = m.winnerId === m.homeTeamId ? 1 : -1;
      as = -hs;
    }
    results.get(m.homeTeamId)?.push([m.week, hs]);
    results.get(m.awayTeamId)?.push([m.week, as]);
  }
  return teams.map((t) => {
    const seq = (results.get(t.id) ?? []).sort((a, b) => a[0] - b[0]).map(([, r]) => r);
    let streak = 0;
    for (let i = seq.length - 1; i >= 0; i--) {
      const r = seq[i];
      if (r === 0 || (streak !== 0 && r > 0 !== streak > 0)) break;
      streak += r;
    }
    return { teamId: t.id, week: 0, statKey: "streak", value: streak };
  });
}

function normalize(vals: Map<string, number>): Map<string, number> {
  const arr = [...vals.values()];
  const lo = Math.min(...arr);
  const hi = Math.max(...arr);
  const out = new Map<string, number>();
  vals.forEach((v, k) => out.set(k, hi === lo ? 0.5 : (v - lo) / (hi - lo)));
  return out;
}

export function powerScores(
  teams: Team[],
  matchups: Matchup[],
  rosterSlots: RosterSlot[],
  throughWeek: number,
  prevRanks?: Map<string, number>
): Stat[] {
  const scores = weeklyScores(teams, matchups, throughWeek);
  const apStats = allPlayAndLuck(teams, matchups, throughWeek);
  const apPct = new Map<string, number>();
  for (const t of teams) {
    const w = apStats.find((s) => s.teamId === t.id && s.statKey === "all_play_wins")?.value ?? 0;
    const l = apStats.find((s) => s.teamId === t.id && s.statKey === "all_play_losses")?.value ?? 0;
    apPct.set(t.id, w + l ? w / (w + l) : 0.5);
  }
  const proj = new Map<string, number>();
  for (const rs of rosterSlots) {
    if (rs.week === throughWeek + 1 && rs.isStarter && rs.projected != null)
      proj.set(rs.teamId, (proj.get(rs.teamId) ?? 0) + rs.projected);
  }
  const recent = new Map<string, number>();
  const season = new Map<string, number>();
  for (const t of teams) {
    const vals = [...(scores.get(t.id) ?? new Map()).entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([, v]) => v)
      .slice(-3);
    recent.set(t.id, vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0);
    season.set(t.id, t.pointsFor);
  }
  const nRecent = normalize(recent);
  const nSeason = normalize(season);
  const nProj = proj.size ? normalize(proj) : null;

  const composite = new Map<string, number>();
  for (const t of teams) {
    let v =
      0.35 * (nRecent.get(t.id) ?? 0.5) +
      0.25 * (nSeason.get(t.id) ?? 0.5) +
      0.25 * (apPct.get(t.id) ?? 0.5);
    v += 0.15 * (nProj ? nProj.get(t.id) ?? 0.5 : apPct.get(t.id) ?? 0.5);
    composite.set(t.id, Math.round(v * 1000) / 10);
  }
  const ranked = [...teams].sort((a, b) => composite.get(b.id)! - composite.get(a.id)!);
  const rows: Stat[] = [];
  ranked.forEach((t, i) => {
    rows.push(
      { teamId: t.id, week: 0, statKey: "power_score", value: composite.get(t.id)! },
      { teamId: t.id, week: 0, statKey: "power_rank", value: i + 1 }
    );
    if (prevRanks?.has(t.id))
      rows.push({ teamId: t.id, week: 0, statKey: "power_rank_prev", value: prevRanks.get(t.id)! });
  });
  return rows;
}

export function optimalLineupPoints(
  slots: { points: number; position: string }[],
  slotCounts: Record<string, number>
): number {
  const pool = [...slots].sort((a, b) => b.points - a.points);
  const used = new Set<number>();
  let total = 0;
  for (const name of ["QB", "RB", "WR", "TE", "D/ST", "K"]) {
    for (let c = 0; c < (slotCounts[name] ?? 0); c++) {
      const i = pool.findIndex((p, idx) => !used.has(idx) && p.position === name);
      if (i >= 0) {
        used.add(i);
        total += pool[i].points;
      }
    }
  }
  for (const [flexName, eligible] of Object.entries(FLEX_ELIGIBLE)) {
    for (let c = 0; c < (slotCounts[flexName] ?? 0); c++) {
      const i = pool.findIndex((p, idx) => !used.has(idx) && eligible.includes(p.position));
      if (i >= 0) {
        used.add(i);
        total += pool[i].points;
      }
    }
  }
  return Math.round(total * 100) / 100;
}

export function lineupEfficiency(
  teams: Team[],
  rosterSlots: RosterSlot[],
  positionOf: (playerId: string) => string,
  slotCounts: Record<string, number>,
  throughWeek: number
): Stat[] {
  const byTeamWeek = new Map<string, RosterSlot[]>();
  for (const rs of rosterSlots) {
    if (rs.week > throughWeek) continue;
    const key = `${rs.teamId}|${rs.week}`;
    if (!byTeamWeek.has(key)) byTeamWeek.set(key, []);
    byTeamWeek.get(key)!.push(rs);
  }
  const rows: Stat[] = [];
  const actualTotal = new Map<string, number>();
  const optimalTotal = new Map<string, number>();
  byTeamWeek.forEach((slots, key) => {
    const [tid, wStr] = key.split("|");
    const week = Number(wStr);
    const actual = slots.filter((s) => s.isStarter).reduce((a, s) => a + s.points, 0);
    const optimal = optimalLineupPoints(
      slots.map((s) => ({ points: s.points, position: positionOf(s.playerId) })),
      slotCounts
    );
    const bench = slots.filter((s) => !s.isStarter).reduce((a, s) => a + s.points, 0);
    actualTotal.set(tid, (actualTotal.get(tid) ?? 0) + actual);
    optimalTotal.set(tid, (optimalTotal.get(tid) ?? 0) + optimal);
    rows.push(
      { teamId: tid, week, statKey: "optimal_points", value: optimal },
      { teamId: tid, week, statKey: "bench_points", value: Math.round(bench * 100) / 100 }
    );
  });
  for (const t of teams) {
    const opt = optimalTotal.get(t.id) ?? 0;
    rows.push({
      teamId: t.id,
      week: 0,
      statKey: "lineup_efficiency",
      value: opt ? Math.round(((actualTotal.get(t.id) ?? 0) / opt) * 10000) / 10000 : 1,
    });
  }
  return rows;
}

export function playoffMonteCarlo(
  teams: Team[],
  matchups: Matchup[],
  throughWeek: number,
  regularSeasonWeeks: number,
  playoffTeamCount: number,
  rand: () => number,
  sims = 3000
): Stat[] {
  const scores = weeklyScores(teams, matchups, throughWeek);
  const dist = new Map<string, [number, number]>();
  for (const t of teams) {
    const vals = [...(scores.get(t.id) ?? new Map()).values()];
    const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 100;
    const sd =
      vals.length > 1
        ? Math.sqrt(vals.reduce((a, v) => a + (v - mean) ** 2, 0) / (vals.length - 1))
        : 25;
    dist.set(t.id, [mean, Math.max(sd, 8)]);
  }
  const remaining = matchups.filter(
    (m) => !m.isPlayoff && !m.isFinal && m.week <= regularSeasonWeeks && m.awayTeamId
  );
  const byeSlots = playoffTeamCount === 6 ? 2 : 0;
  const gauss = (mean: number, sd: number) => {
    const u = Math.max(rand(), 1e-9);
    const v = rand();
    return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };
  const made = new Map<string, number>();
  const bye = new Map<string, number>();
  const seedSum = new Map<string, number>();
  for (let s = 0; s < sims; s++) {
    const wins = new Map(teams.map((t) => [t.id, t.wins + 0.5 * t.ties]));
    const pf = new Map(teams.map((t) => [t.id, t.pointsFor]));
    for (const m of remaining) {
      const [hm, hsd] = dist.get(m.homeTeamId)!;
      const [am, asd] = dist.get(m.awayTeamId!)!;
      const hs = gauss(hm, hsd);
      const as = gauss(am, asd);
      pf.set(m.homeTeamId, pf.get(m.homeTeamId)! + hs);
      pf.set(m.awayTeamId!, pf.get(m.awayTeamId!)! + as);
      const w = hs >= as ? m.homeTeamId : m.awayTeamId!;
      wins.set(w, wins.get(w)! + 1);
    }
    const order = [...teams].sort(
      (a, b) => wins.get(b.id)! - wins.get(a.id)! || pf.get(b.id)! - pf.get(a.id)!
    );
    order.forEach((t, i) => {
      seedSum.set(t.id, (seedSum.get(t.id) ?? 0) + i + 1);
      if (i + 1 <= playoffTeamCount) made.set(t.id, (made.get(t.id) ?? 0) + 1);
      if (i + 1 <= byeSlots) bye.set(t.id, (bye.get(t.id) ?? 0) + 1);
    });
  }
  const rows: Stat[] = [];
  for (const t of teams) {
    rows.push(
      { teamId: t.id, week: 0, statKey: "playoff_odds", value: Math.round(((made.get(t.id) ?? 0) / sims) * 10000) / 10000 },
      { teamId: t.id, week: 0, statKey: "bye_odds", value: Math.round(((bye.get(t.id) ?? 0) / sims) * 10000) / 10000 },
      { teamId: t.id, week: 0, statKey: "proj_seed", value: Math.round(((seedSum.get(t.id) ?? 0) / sims) * 100) / 100 }
    );
  }
  return rows;
}
