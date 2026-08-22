// Deterministic demo league — lets the dashboard render with zero setup.
// Everything here is fictional. Once NEXT_PUBLIC_SUPABASE_URL is set, this
// module is never used.

import {
  allPlayAndLuck,
  lineupEfficiency,
  optimalLineupPoints,
  playoffMonteCarlo,
  powerScores,
  streaks,
} from "./compute";
import type {
  Bundle,
  DraftPick,
  Matchup,
  Player,
  Recap,
  RosterSlot,
  Stat,
  Team,
  Transaction,
} from "./types";

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const rand = mulberry32(20260822);
const gauss = (mean: number, sd: number) => {
  const u = Math.max(rand(), 1e-9);
  return mean + sd * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rand());
};

const TEAMS = [
  ["Bench Mob", "BMOB", "🪑", "Zach"],
  ["Hail Mary Rockets", "HMR", "🚀", "Priya"],
  ["Waiver Wire Wizards", "WWW", "🧙", "Marcus"],
  ["Garbage Time Heroes", "GTH", "🗑️", "Danny"],
  ["Red Zone Renegades", "RZR", "🔥", "Alexis"],
  ["Fourth & Long", "4TH", "🏈", "Jordan"],
  ["Prime Time Players", "PTP", "⭐", "Nina"],
  ["Trench Warfare", "TRW", "🛡️", "Sam"],
  ["The Audibles", "AUD", "📣", "Kevin"],
  ["Cold Brew Crushers", "CBC", "🧊", "Maya"],
] as const;

const FIRST = ["Jaylen", "Marcus", "Tucker", "Brock", "Zion", "Malik", "Chase", "Dante",
  "Ryder", "Colt", "Xavier", "Jamal", "Trey", "Boone", "Kellen", "Amari", "Rico",
  "Titus", "Ezra", "Knox", "Judah", "Cyrus", "Maddox", "Dre", "Silas", "Waylon",
  "Kane", "Orion", "Bodie", "Lincoln", "Ace", "Ridge", "Storm", "Deacon", "Hollis"];
const LAST = ["Hollister", "Vance", "Whitfield", "Steele", "Marsh", "Callahan",
  "Drummond", "Okafor", "Bellamy", "Fontaine", "Kowalski", "Hargrove", "Beaumont",
  "Ashford", "Redding", "Calloway", "Trask", "Winslow", "Mercer", "Booker",
  "Stallworth", "Iverson", "Delgado", "Rooks", "Vasquez", "Granger", "Holt",
  "Pemberton", "Croft", "Danforth", "Ellison", "Fairbanks", "Grimes", "Hyde", "Ives"];
const CITIES = ["Ironwood", "Granite Bay", "Copper Creek", "Blue Ridge", "Stonebrook",
  "Silver Lake", "Oak Hollow", "Riverton", "Fairhaven", "Northgate", "Westfall", "Duskwood",
  "Larkspur", "Milltown", "Cedar Falls", "Brackenford", "Eastvale", "Palisade",
  "Redstone", "Willow Bend", "Foxcroft", "Harborview", "Kingsbridge", "Summit Ridge"];
const NFL = ["ARI", "ATL", "BAL", "BUF", "CAR", "CHI", "CIN", "CLE", "DAL", "DEN",
  "DET", "GB", "HOU", "IND", "JAX", "KC", "LAC", "LAR", "LV", "MIA", "MIN", "NE",
  "NO", "NYG", "NYJ", "PHI", "PIT", "SEA", "SF", "TB", "TEN", "WSH"];

// Position baselines: [starter mean, spread]
const POS_BASE: Record<string, [number, number]> = {
  QB: [19, 3.5], RB: [12, 3.5], WR: [12, 3.5], TE: [9, 3], "D/ST": [8, 2.5], K: [8, 1.5],
};
const WEEK_SD: Record<string, number> = { QB: 6, RB: 6.5, WR: 7, TE: 5, "D/ST": 5, K: 3.5 };

const SLOT_COUNTS: Record<string, number> = { QB: 1, RB: 2, WR: 2, TE: 1, FLEX: 1, "D/ST": 1, K: 1 };
const ROSTER_SHAPE: [string, number][] = [["QB", 2], ["RB", 5], ["WR", 5], ["TE", 2], ["D/ST", 1], ["K", 1]];

type DemoPlayer = Player & { talent: number };

let nameIdx = 0;
let playerSeq = 0;
let dstIdx = 0;
function makePlayer(position: string, talent: number, ownershipPct: number): DemoPlayer {
  playerSeq++;
  const name =
    position === "D/ST"
      ? `${CITIES[dstIdx++ % CITIES.length]} D/ST`
      : `${FIRST[nameIdx % FIRST.length]} ${LAST[Math.floor(nameIdx / FIRST.length + nameIdx) % LAST.length]}`;
  if (position !== "D/ST") nameIdx++;
  return {
    id: `p${playerSeq}`,
    espnPlayerId: 100000 + playerSeq,
    name,
    position,
    nflTeam: NFL[Math.floor(rand() * NFL.length)],
    ownershipPct,
    ownershipDelta: 0,
    injuryStatus: rand() < 0.08 ? "QUESTIONABLE" : null,
    headshotUrl: null,
    talent,
  };
}

function buildSchedule(n: number, weeks: number): [number, number][][] {
  // Circle-method round robin, repeated to fill the season.
  const rounds: [number, number][][] = [];
  const idx = [...Array(n).keys()];
  for (let r = 0; r < n - 1; r++) {
    const round: [number, number][] = [];
    for (let k = 0; k < n / 2; k++) {
      const a = idx[k];
      const b = idx[n - 1 - k];
      round.push(r % 2 ? [b, a] : [a, b]);
    }
    rounds.push(round);
    idx.splice(1, 0, idx.pop()!);
  }
  return Array.from({ length: weeks }, (_, w) => rounds[w % rounds.length]);
}

function buildBundle(): Bundle {
  const currentWeek = 11;
  const regularSeasonWeeks = 14;
  const teams: Team[] = TEAMS.map(([name, abbrev, emoji, owner], i) => ({
    id: `t${i + 1}`,
    espnTeamId: i + 1,
    name,
    abbrev,
    ownerName: owner,
    ownerGuid: owner,
    logoUrl: `emoji:${emoji}`,
    wins: 0, losses: 0, ties: 0,
    pointsFor: 0, pointsAgainst: 0,
    waiverRank: null,
    faabRemaining: 100,
    finalRank: null,
  }));

  // Team strength shapes rosters: strong teams drafted better.
  const strength = teams.map(() => gauss(0, 1));

  const players: DemoPlayer[] = [];
  const roster = new Map<string, DemoPlayer[]>();
  teams.forEach((t, ti) => {
    const mine: DemoPlayer[] = [];
    for (const [pos, count] of ROSTER_SHAPE) {
      const [base, spread] = POS_BASE[pos];
      for (let j = 0; j < count; j++) {
        // Depth chart: later players at a position are weaker.
        const talent = base + strength[ti] * 1.4 + spread * (1 - j * 0.9) + gauss(0, 1.2);
        mine.push(makePlayer(pos, Math.max(talent, 2), 60 + rand() * 39));
      }
    }
    roster.set(t.id, mine);
    players.push(...mine);
  });

  // Free-agent pool for waivers + trending targets.
  const freeAgents: DemoPlayer[] = [];
  for (let i = 0; i < 36; i++) {
    const pos = ["RB", "WR", "TE", "QB", "D/ST"][Math.floor(rand() * 5)];
    const [base, spread] = POS_BASE[pos];
    const fa = makePlayer(pos, base - 2 + gauss(0, spread * 0.8), rand() * 45);
    fa.ownershipDelta = Math.round((rand() < 0.3 ? rand() * 28 : rand() * 6 - 2) * 10) / 10;
    freeAgents.push(fa);
  }
  players.push(...freeAgents);

  // Draft: proper snake. Each team drafts its own (predetermined) roster in
  // value-over-replacement order, so rounds mix positions realistically.
  // Positional discounts push K / D/ST / QB2 down the board like a real 1-QB draft.
  const POS_DISCOUNT: Record<string, number> = { QB: 2.5, TE: 0.5, K: 5, "D/ST": 4 };
  const draftValue = new Map(
    players.map((p) => [
      p.id,
      p.talent - POS_BASE[p.position][0] - (POS_DISCOUNT[p.position] ?? 0) + gauss(0, 1.8),
    ])
  );
  const undrafted = new Map(teams.map((t) => [t.id, [...roster.get(t.id)!]]));
  const draftPicks: DraftPick[] = [];
  let overall = 1;
  const roundsTotal = ROSTER_SHAPE.reduce((a, [, n]) => a + n, 0);
  for (let round = 1; round <= roundsTotal; round++) {
    const order = round % 2 ? teams : [...teams].reverse();
    for (const t of order) {
      const pool = undrafted.get(t.id)!;
      pool.sort((a, b) => draftValue.get(b.id)! - draftValue.get(a.id)!);
      const p = pool.shift()!;
      draftPicks.push({
        teamId: t.id, playerId: p.id,
        round, pick: overall++,
        keeper: overall % 47 === 0,
      });
    }
  }

  const schedule = buildSchedule(teams.length, regularSeasonWeeks);
  const matchups: Matchup[] = [];
  const rosterSlots: RosterSlot[] = [];
  const transactions: Transaction[] = [];
  let txSeq = 0;

  const scoreWeek = (tid: string, week: number, partial: boolean) => {
    const mine = roster.get(tid)!;
    // Choose starters: best by talent, with occasional (seeded) coach error.
    const starters = new Set<string>();
    const pool = [...mine].sort((a, b) => b.talent - a.talent + gauss(0, 2.2));
    const take = (pred: (p: DemoPlayer) => boolean, n: number) => {
      for (const p of pool) {
        if (n <= 0) break;
        if (!starters.has(p.id) && pred(p)) {
          starters.add(p.id);
          n--;
        }
      }
    };
    take((p) => p.position === "QB", 1);
    take((p) => p.position === "RB", 2);
    take((p) => p.position === "WR", 2);
    take((p) => p.position === "TE", 1);
    take((p) => ["RB", "WR", "TE"].includes(p.position), 1); // FLEX
    take((p) => p.position === "D/ST", 1);
    take((p) => p.position === "K", 1);

    let total = 0;
    let projTotal = 0;
    let yetToPlay = 0;
    let flexUsed = false;
    for (const p of mine) {
      const isStarter = starters.has(p.id);
      const played = !partial || rand() < 0.6;
      const pts = played ? Math.max(0, gauss(p.talent, WEEK_SD[p.position])) : 0;
      const projected = Math.round(Math.max(2, p.talent + gauss(0, 1.5)) * 10) / 10;
      let slot = "BE";
      if (isStarter) {
        const posCount = [...starters].filter(
          (id) => mine.find((m) => m.id === id)!.position === p.position
        ).length;
        const cap = SLOT_COUNTS[p.position] ?? 0;
        if (posCount > cap && ["RB", "WR", "TE"].includes(p.position) && !flexUsed) {
          slot = "FLEX";
          flexUsed = true;
        } else slot = p.position;
        total += pts;
        projTotal += projected;
        if (!played) yetToPlay++;
      }
      rosterSlots.push({
        teamId: tid, week, playerId: p.id, slot,
        isStarter, points: Math.round(pts * 10) / 10, projected,
      });
    }
    return { total: Math.round(total * 10) / 10, proj: Math.round(projTotal * 10) / 10, yetToPlay };
  };

  for (let week = 1; week <= regularSeasonWeeks; week++) {
    const isFinal = week < currentWeek;
    const isLive = week === currentWeek;
    for (const [hi, ai] of schedule[week - 1]) {
      const home = teams[hi];
      const away = teams[ai];
      let hs = 0, as = 0, hp: number | null = null, ap: number | null = null;
      let hytp: number | null = null, aytp: number | null = null;
      if (isFinal || isLive) {
        const h = scoreWeek(home.id, week, isLive);
        const a = scoreWeek(away.id, week, isLive);
        hs = h.total; as = a.total; hp = h.proj; ap = a.proj;
        hytp = isLive ? h.yetToPlay : 0;
        aytp = isLive ? a.yetToPlay : 0;
      }
      const winnerId = isFinal ? (hs >= as ? home.id : away.id) : null;
      if (isFinal) {
        home.pointsFor += hs; home.pointsAgainst += as;
        away.pointsFor += as; away.pointsAgainst += hs;
        if (hs === as) { home.ties++; away.ties++; }
        else if (hs > as) { home.wins++; away.losses++; }
        else { away.wins++; home.losses++; }
      }
      matchups.push({
        id: `m${week}-${home.id}`, week,
        homeTeamId: home.id, awayTeamId: away.id,
        homeScore: hs, awayScore: as,
        homeProjected: hp, awayProjected: ap,
        homeYetToPlay: hytp, awayYetToPlay: aytp,
        isPlayoff: false, isFinal, winnerId,
      });
    }

    // Waiver churn: 2-4 pickups per completed week.
    if (isFinal && week > 1) {
      const nTx = 2 + Math.floor(rand() * 3);
      for (let i = 0; i < nTx && freeAgents.length; i++) {
        const t = teams[Math.floor(rand() * teams.length)];
        if ((t.faabRemaining ?? 0) < 2) continue;
        const fa = freeAgents.splice(Math.floor(rand() * freeAgents.length), 1)[0];
        const mine = roster.get(t.id)!;
        const samePos = mine.filter((p) => p.position === fa.position && p.position !== "D/ST");
        const drop = samePos.sort((a, b) => a.talent - b.talent)[0] ?? mine.sort((a, b) => a.talent - b.talent)[0];
        const bid = Math.min(t.faabRemaining ?? 0, Math.max(1, Math.round(rand() * rand() * 45)));
        t.faabRemaining = (t.faabRemaining ?? 0) - bid;
        roster.set(t.id, [...mine.filter((p) => p.id !== drop.id), fa]);
        transactions.push({
          id: `tx${++txSeq}`, week: week + 1, type: rand() < 0.85 ? "WAIVER" : "FREEAGENT",
          teamId: t.id, playerInId: fa.id, playerOutId: drop.id,
          faabBid: bid,
          executedAt: new Date(Date.UTC(2026, 8, 2 + week * 7, 15)).toISOString(),
        });
      }
    }
  }

  // Season totals for players (for draft value + waiver efficiency views).
  const seasonPts = new Map<string, number>();
  for (const rs of rosterSlots) seasonPts.set(rs.playerId, (seasonPts.get(rs.playerId) ?? 0) + rs.points);

  const throughWeek = currentWeek - 1;
  const positionOf = (pid: string) => players.find((p) => p.id === pid)?.position ?? "";
  const stats: Stat[] = [
    ...allPlayAndLuck(teams, matchups, throughWeek),
    ...streaks(teams, matchups, throughWeek),
    ...powerScores(
      teams, matchups, rosterSlots, throughWeek,
      // Previous ranks: rerun power through the prior week.
      new Map(
        powerScores(teams, matchups, rosterSlots, throughWeek - 1)
          .filter((s) => s.statKey === "power_rank")
          .map((s) => [s.teamId, s.value])
      )
    ),
    ...lineupEfficiency(teams, rosterSlots, positionOf, SLOT_COUNTS, throughWeek),
    ...playoffMonteCarlo(teams, matchups, throughWeek, regularSeasonWeeks, 6, rand, 3000),
  ];

  // FAAB efficiency (mirrors worker faab_efficiency).
  for (const t of teams) {
    let spent = 0;
    let produced = 0;
    for (const tx of transactions) {
      if (tx.teamId !== t.id || tx.type !== "WAIVER") continue;
      spent += tx.faabBid ?? 0;
      for (const rs of rosterSlots) {
        if (rs.teamId === t.id && rs.playerId === tx.playerInId && rs.week >= tx.week && rs.isStarter)
          produced += rs.points;
      }
    }
    stats.push(
      { teamId: t.id, week: 0, statKey: "faab_spent", value: spent },
      { teamId: t.id, week: 0, statKey: "faab_points", value: Math.round(produced * 10) / 10 }
    );
  }

  const teamName = new Map(teams.map((t) => [t.id, t.name]));
  const recaps: Recap[] = [];
  for (let week = 1; week <= throughWeek; week++) {
    recaps.push({
      week,
      markdown: buildRecapMarkdown(week, matchups, rosterSlots, players, transactions, teamName),
      generatedAt: new Date(Date.UTC(2026, 8, 1 + week * 7, 14)).toISOString(),
    });
  }

  const league = {
    id: "demo",
    name: "Sunday Scaries League",
    season: 2026,
    currentWeek,
    finalWeek: 17,
    playoffTeamCount: 6,
    regularSeasonWeeks,
    faabBudget: 100,
    syncedAt: null,
  };
  return {
    league,
    seasons: [{ league, teams, matchups }],
    teams,
    matchups,
    players: players.map(({ talent: _talent, ...p }) => ({
      ...p,
      // season points feed draft-value + waiver views
      ownershipPct: p.ownershipPct == null ? null : Math.round(p.ownershipPct * 10) / 10,
    })),
    rosterSlots,
    transactions,
    draftPicks,
    stats,
    recaps,
    demo: true,
  };
}

function buildRecapMarkdown(
  week: number,
  matchups: Matchup[],
  rosterSlots: RosterSlot[],
  players: Player[],
  transactions: Transaction[],
  teamName: Map<string, string>
): string {
  const wm = matchups.filter((m) => m.week === week && m.isFinal && m.awayTeamId);
  const name = (tid: string) => teamName.get(tid) ?? "?";
  const scores = wm.flatMap((m) => [
    [m.homeTeamId, m.homeScore] as const,
    [m.awayTeamId!, m.awayScore] as const,
  ]);
  const top = scores.reduce((a, b) => (b[1] > a[1] ? b : a));
  const low = scores.reduce((a, b) => (b[1] < a[1] ? b : a));
  const margin = (m: Matchup) => Math.abs(m.homeScore - m.awayScore);
  const blowout = wm.reduce((a, b) => (margin(b) > margin(a) ? b : a));
  const closest = wm.reduce((a, b) => (margin(b) < margin(a) ? b : a));
  const positionOf = new Map(players.map((p) => [p.id, p.position]));
  const playerName = new Map(players.map((p) => [p.id, p.name]));

  const byTeam = new Map<string, RosterSlot[]>();
  for (const rs of rosterSlots) {
    if (rs.week !== week) continue;
    if (!byTeam.has(rs.teamId)) byTeam.set(rs.teamId, []);
    byTeam.get(rs.teamId)!.push(rs);
  }
  let benchBest: [number, string, string] | null = null;
  const eff = new Map<string, [number, number, number]>();
  byTeam.forEach((slots, tid) => {
    const actual = slots.filter((s) => s.isStarter).reduce((a, s) => a + s.points, 0);
    const optimal = optimalLineupPoints(
      slots.map((s) => ({ points: s.points, position: positionOf.get(s.playerId) ?? "" })),
      SLOT_COUNTS
    );
    eff.set(tid, [optimal ? actual / optimal : 1, actual, optimal]);
    for (const s of slots) {
      if (!s.isStarter && (!benchBest || s.points > benchBest[0]))
        benchBest = [s.points, playerName.get(s.playerId) ?? "?", tid];
    }
  });
  const effArr = [...eff.entries()];
  const best = effArr.reduce((a, b) => (b[1][0] > a[1][0] ? b : a));
  const worst = effArr.reduce((a, b) => (b[1][0] < a[1][0] ? b : a));

  let pickup: [number, string, string, number | null] | null = null;
  for (const tx of transactions) {
    if (tx.week !== week || !tx.playerInId || !tx.teamId) continue;
    const pts = (byTeam.get(tx.teamId) ?? [])
      .filter((s) => s.playerId === tx.playerInId && s.isStarter)
      .reduce((a, s) => a + s.points, 0);
    if (!pickup || pts > pickup[0])
      pickup = [pts, playerName.get(tx.playerInId) ?? "?", tx.teamId, tx.faabBid];
  }

  const line = (m: Matchup) =>
    `**${name(m.homeTeamId)}** ${m.homeScore.toFixed(1)} — ${m.awayScore.toFixed(1)} **${name(m.awayTeamId!)}**`;

  const parts = [
    `# Week ${week} Recap`,
    ``,
    `## 🏆 Top scorer`,
    `**${name(top[0])}** dropped **${top[1].toFixed(1)}** — the week's high mark.`,
    ``,
    `## 🚽 The Toilet Bowl`,
    `**${name(low[0])}** limped to **${low[1].toFixed(1)}**. Somebody check on them.`,
    ``,
    `## 💥 Biggest blowout`,
    `${line(blowout)} — a ${margin(blowout).toFixed(1)}-point demolition.`,
    ``,
    `## 😅 Closest call`,
    `${line(closest)} — decided by ${margin(closest).toFixed(1)}.`,
    ``,
    `## 🧠 Best managed lineup`,
    `**${name(best[0])}** got ${best[1][1].toFixed(1)} of a possible ${best[1][2].toFixed(1)} (${Math.round(best[1][0] * 100)}%).`,
    ``,
    `## 🤦 Worst managed lineup`,
    `**${name(worst[0])}** left it on the table: ${worst[1][1].toFixed(1)} of a possible ${worst[1][2].toFixed(1)} (${Math.round(worst[1][0] * 100)}%).`,
  ];
  const bb = benchBest as [number, string, string] | null;
  if (bb && bb[0] > 0)
    parts.push(``, `## 🪑 Bench MVP`, `${bb[1]} scored **${bb[0].toFixed(1)}**… on **${name(bb[2])}**'s bench.`);
  if (pickup && pickup[0] > 0)
    parts.push(
      ``,
      `## 🛒 Waiver pickup of the week`,
      `**${name(pickup[2])}** grabbed ${pickup[1]}${pickup[3] ? ` ($${pickup[3]} FAAB)` : ""} and got **${pickup[0].toFixed(1)}** right away.`
    );
  return parts.join("\n");
}

let cached: Bundle | null = null;
export function demoBundle(): Bundle {
  if (!cached) cached = buildBundle();
  return cached;
}
