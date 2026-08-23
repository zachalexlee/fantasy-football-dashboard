// Data access: Supabase when configured, demo bundle otherwise.
// The frontend only ever reads Supabase — never ESPN directly — so the site
// stays up on last-good data whatever ESPN does.

import { cache } from "react";
import { demoBundle } from "./demo";
import type { Bundle, League, Matchup, SeasonSlice, Team } from "./types";

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

async function rest(path: string): Promise<Record<string, unknown>[]> {
  const rows: Record<string, unknown>[] = [];
  const page = 1000; // Supabase caps responses at 1000 rows by default
  for (let offset = 0; ; offset += page) {
    const res = await fetch(`${URL}/rest/v1/${path}`, {
      headers: {
        apikey: KEY!,
        Authorization: `Bearer ${KEY}`,
        Range: `${offset}-${offset + page - 1}`,
      },
      next: { revalidate: 60 },
    });
    if (!res.ok) throw new Error(`Supabase ${path}: ${res.status}`);
    const batch = (await res.json()) as Record<string, unknown>[];
    rows.push(...batch);
    if (batch.length < page) return rows;
  }
}

// Secondary tables: a transient failure on one should degrade just that
// section (empty), never throw away the whole real bundle for fabricated demo
// data. Only leagues/teams/matchups are load-bearing enough to be strict.
async function safeRest(path: string): Promise<Record<string, unknown>[]> {
  try {
    return await rest(path);
  } catch (err) {
    console.error(`Supabase read failed (degrading section): ${path}`, err);
    return [];
  }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const mapLeague = (lg: any): League => ({
  id: lg.id,
  name: lg.name,
  season: lg.season,
  currentWeek: lg.current_week,
  finalWeek: lg.final_week,
  playoffTeamCount: lg.playoff_team_count,
  regularSeasonWeeks: lg.regular_season_weeks,
  faabBudget: lg.faab_budget,
  syncedAt: lg.synced_at,
  scoring: lg.scoring_json ?? null,
  settings: lg.settings_json ?? null,
});

const mapTeam = (t: any): Team => ({
  id: t.id,
  espnTeamId: t.espn_team_id,
  name: t.name,
  abbrev: t.abbrev,
  ownerName: t.owner_name,
  ownerGuid: t.owner_guid ?? null,
  logoUrl: t.logo_url,
  wins: t.wins,
  losses: t.losses,
  ties: t.ties,
  pointsFor: Number(t.points_for),
  pointsAgainst: Number(t.points_against),
  waiverRank: t.waiver_rank,
  faabRemaining: t.faab_remaining,
  finalRank: t.final_rank ?? null,
});

const mapMatchup = (m: any): Matchup => ({
  id: m.id,
  week: m.week,
  homeTeamId: m.home_team_id,
  awayTeamId: m.away_team_id,
  homeScore: Number(m.home_score),
  awayScore: Number(m.away_score),
  homeProjected: m.home_projected == null ? null : Number(m.home_projected),
  awayProjected: m.away_projected == null ? null : Number(m.away_projected),
  homeYetToPlay: m.home_yet_to_play,
  awayYetToPlay: m.away_yet_to_play,
  isPlayoff: m.is_playoff,
  isFinal: m.is_final,
  winnerId: m.winner_id,
});

async function supabaseBundle(): Promise<Bundle | null> {
  const leagues = await rest("leagues?select=*&order=season.desc");
  if (!leagues.length) return null; // nothing synced yet — caller falls back to demo
  const lid = (leagues[0] as any).id as string;

  const [allTeams, allMatchups, players, rosterSlots, transactions, pending, draftPicks, stats, recaps, nflGames, gameAnalysis, highlights] =
    await Promise.all([
      rest(`teams?select=*`),
      rest(`matchups?select=*&order=week`),
      safeRest(`players?select=*`),
      safeRest(`roster_slots?select=*`),
      safeRest(`transactions?select=*&league_id=eq.${lid}&order=executed_at.desc`),
      safeRest(`pending_transactions?select=*&league_id=eq.${lid}&order=process_date`),
      safeRest(`draft_picks?select=*&league_id=eq.${lid}&order=pick`),
      safeRest(`computed_stats?select=*&league_id=eq.${lid}`),
      safeRest(`recaps?select=*&league_id=eq.${lid}&order=week`),
      safeRest(`nfl_games?select=*&order=kickoff`),
      safeRest(`game_analysis?select=*&league_id=eq.${lid}&week=eq.${(leagues[0] as any).current_week}`),
      safeRest(`game_highlights?select=provider_id,title,url,embed_url,thumbnail_url,source,home_team,away_team,kind,espn_event_id&order=synced_at.desc`),
    ]);

  const seasons: SeasonSlice[] = (leagues as any[]).map((lg) => ({
    league: mapLeague(lg),
    teams: (allTeams as any[]).filter((t) => t.league_id === lg.id).map(mapTeam),
    matchups: (allMatchups as any[]).filter((m) => m.league_id === lg.id).map(mapMatchup),
  }));
  const current = seasons[0];
  const teamIds = new Set(current.teams.map((t) => t.id));

  return {
    seasons,
    league: current.league,
    teams: current.teams,
    matchups: current.matchups,
    players: (players as any[]).map((p) => ({
      id: p.id,
      espnPlayerId: p.espn_player_id,
      name: p.name,
      position: p.position,
      nflTeam: p.nfl_team,
      ownershipPct: p.ownership_pct == null ? null : Number(p.ownership_pct),
      ownershipDelta: p.ownership_delta == null ? null : Number(p.ownership_delta),
      injuryStatus: p.injury_status,
      headshotUrl: p.headshot_url,
    })),
    rosterSlots: (rosterSlots as any[])
      .filter((r) => teamIds.has(r.team_id))
      .map((r) => ({
        teamId: r.team_id,
        week: r.week,
        playerId: r.player_id,
        slot: r.slot,
        isStarter: r.is_starter,
        points: Number(r.points),
        projected: r.projected == null ? null : Number(r.projected),
        stats: r.stats ?? null,
      })),
    transactions: (transactions as any[]).map((t) => ({
      id: t.id,
      week: t.week,
      type: t.type,
      teamId: t.team_id,
      playerInId: t.player_in_id,
      playerOutId: t.player_out_id,
      faabBid: t.faab_bid,
      executedAt: t.executed_at,
    })),
    pendingTransactions: (pending as any[]).map((p) => ({
      espnTxId: p.espn_tx_id,
      type: p.type,
      teamId: p.team_id,
      relatedTeamId: p.related_team_id,
      playerInId: p.player_in_id,
      playerOutId: p.player_out_id,
      faabBid: p.faab_bid,
      proposedAt: p.proposed_at,
      processDate: p.process_date,
    })),
    draftPicks: (draftPicks as any[]).map((d) => ({
      teamId: d.team_id,
      playerId: d.player_id,
      round: d.round,
      pick: d.pick,
      keeper: d.keeper,
      bidAmount: d.bid_amount == null ? null : Number(d.bid_amount),
    })),
    stats: (stats as any[]).map((s) => ({
      teamId: s.team_id,
      week: s.week,
      statKey: s.stat_key,
      value: Number(s.value),
    })),
    recaps: (recaps as any[]).map((r) => ({
      week: r.week,
      markdown: r.markdown,
      generatedAt: r.generated_at,
    })),
    nflGames: (nflGames as any[]).map((g) => ({
      espnEventId: g.espn_event_id,
      kickoff: g.kickoff,
      shortName: g.short_name,
      homeAbbrev: g.home_abbrev,
      awayAbbrev: g.away_abbrev,
      homeScore: g.home_score,
      awayScore: g.away_score,
      status: g.status,
      statusDetail: g.status_detail,
      network: g.network,
      seasonType: g.season_type ?? 2,
      boxscore: g.boxscore ?? null,
    })),
    gameAnalysis: (gameAnalysis as any[]).map((g) => ({
      week: g.week,
      homeTeamId: g.home_team_id,
      state: g.state,
      markdown: g.markdown,
      generatedAt: g.generated_at,
    })),
    highlights: (highlights as any[]).map((h) => ({
      providerId: h.provider_id,
      title: h.title,
      url: h.url,
      embedUrl: h.embed_url,
      thumbnailUrl: h.thumbnail_url,
      source: h.source,
      homeTeam: h.home_team,
      awayTeam: h.away_team,
      kind: h.kind,
      espnEventId: h.espn_event_id ?? null,
    })),
    demo: false,
  };
}

export const getBundle = cache(async (): Promise<Bundle> => {
  if (URL && KEY) {
    try {
      const bundle = await supabaseBundle();
      if (bundle) return bundle;
    } catch (err) {
      // Supabase down or misconfigured: serve demo rather than a broken page.
      console.error("Supabase read failed, serving demo data:", err);
    }
  }
  return demoBundle();
});
