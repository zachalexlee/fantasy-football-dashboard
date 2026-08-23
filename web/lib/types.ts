export type League = {
  id: string;
  name: string;
  season: number;
  currentWeek: number;
  finalWeek: number;
  playoffTeamCount: number;
  regularSeasonWeeks: number;
  faabBudget: number | null;
  syncedAt: string | null;
};

export type Team = {
  id: string;
  espnTeamId: number;
  name: string;
  abbrev: string;
  ownerName: string;
  ownerGuid: string | null;
  logoUrl: string | null;
  wins: number;
  losses: number;
  ties: number;
  pointsFor: number;
  pointsAgainst: number;
  waiverRank: number | null;
  faabRemaining: number | null;
  finalRank: number | null; // where the team finished; null while a season runs
};

export type Matchup = {
  id: string;
  week: number;
  homeTeamId: string;
  awayTeamId: string | null;
  homeScore: number;
  awayScore: number;
  homeProjected: number | null;
  awayProjected: number | null;
  homeYetToPlay: number | null;
  awayYetToPlay: number | null;
  isPlayoff: boolean;
  isFinal: boolean;
  winnerId: string | null;
};

export type Player = {
  id: string;
  espnPlayerId: number;
  name: string;
  position: string;
  nflTeam: string;
  ownershipPct: number | null;
  ownershipDelta: number | null;
  injuryStatus: string | null;
  headshotUrl: string | null;
};

export type RosterSlot = {
  teamId: string;
  week: number;
  playerId: string;
  slot: string;
  isStarter: boolean;
  points: number;
  projected: number | null;
};

export type Transaction = {
  id: string;
  week: number;
  type: string; // WAIVER | FREEAGENT | TRADE
  teamId: string | null;
  playerInId: string | null;
  playerOutId: string | null;
  faabBid: number | null;
  executedAt: string | null;
};

export type DraftPick = {
  teamId: string;
  playerId: string;
  round: number;
  pick: number;
  keeper: boolean;
};

export type Stat = {
  teamId: string;
  week: number; // 0 = season-to-date
  statKey: string;
  value: number;
};

export type NflGame = {
  espnEventId: string;
  kickoff: string | null;
  shortName: string;
  homeAbbrev: string;
  awayAbbrev: string;
  homeScore: number | null;
  awayScore: number | null;
  status: string; // pre / in / post
  statusDetail: string | null;
  network: string | null;
  seasonType: number; // 1 preseason / 2 regular / 3 postseason
};

export type GameAnalysis = {
  week: number;
  homeTeamId: string;
  state: string; // pre / live / final
  markdown: string;
  generatedAt: string;
};

export type Recap = {
  week: number;
  markdown: string;
  generatedAt: string;
};

/** One season's slice of the league — enough for cross-season reports. */
export type SeasonSlice = {
  league: League;
  teams: Team[];
  matchups: Matchup[];
};

export type Bundle = {
  /** Every synced season (current included), newest first. */
  seasons: SeasonSlice[];
  league: League;
  teams: Team[];
  matchups: Matchup[];
  players: Player[];
  rosterSlots: RosterSlot[];
  transactions: Transaction[];
  draftPicks: DraftPick[];
  stats: Stat[];
  recaps: Recap[];
  nflGames: NflGame[];
  gameAnalysis: GameAnalysis[];
  demo: boolean;
};
