// Data access: Supabase when configured, demo bundle otherwise.
// The frontend only ever reads Supabase — never ESPN directly — so the site
// stays up on last-good data whatever ESPN does.

import { cache } from "react";
import { demoBundle } from "./demo";
import type { Bundle } from "./types";

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

/* eslint-disable @typescript-eslint/no-explicit-any */
async function supabaseBundle(): Promise<Bundle | null> {
  const leagues = await rest("leagues?select=*&order=season.desc&limit=1");
  if (!leagues.length) return null; // nothing synced yet — caller falls back to demo
  const lg = leagues[0] as any;
  const lid = lg.id as string;

  const [teams, matchups, players, rosterSlots, transactions, draftPicks, stats, recaps] =
    await Promise.all([
      rest(`teams?select=*&league_id=eq.${lid}`),
      rest(`matchups?select=*&league_id=eq.${lid}&order=week`),
      rest(`players?select=*`),
      rest(`roster_slots?select=*`),
      rest(`transactions?select=*&league_id=eq.${lid}&order=executed_at.desc`),
      rest(`draft_picks?select=*&league_id=eq.${lid}&order=pick`),
      rest(`computed_stats?select=*&league_id=eq.${lid}`),
      rest(`recaps?select=*&league_id=eq.${lid}&order=week`),
    ]);

  const teamIds = new Set(teams.map((t: any) => t.id));
  return {
    league: {
      id: lid,
      name: lg.name,
      season: lg.season,
      currentWeek: lg.current_week,
      finalWeek: lg.final_week,
      playoffTeamCount: lg.playoff_team_count,
      regularSeasonWeeks: lg.regular_season_weeks,
      faabBudget: lg.faab_budget,
      syncedAt: lg.synced_at,
    },
    teams: (teams as any[]).map((t) => ({
      id: t.id,
      espnTeamId: t.espn_team_id,
      name: t.name,
      abbrev: t.abbrev,
      ownerName: t.owner_name,
      logoUrl: t.logo_url,
      wins: t.wins,
      losses: t.losses,
      ties: t.ties,
      pointsFor: Number(t.points_for),
      pointsAgainst: Number(t.points_against),
      waiverRank: t.waiver_rank,
      faabRemaining: t.faab_remaining,
    })),
    matchups: (matchups as any[]).map((m) => ({
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
    })),
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
    draftPicks: (draftPicks as any[]).map((d) => ({
      teamId: d.team_id,
      playerId: d.player_id,
      round: d.round,
      pick: d.pick,
      keeper: d.keeper,
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
