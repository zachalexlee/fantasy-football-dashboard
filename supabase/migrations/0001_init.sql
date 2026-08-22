-- League dashboard schema.
-- Idempotent-upsert friendly: every table the sync worker writes has a natural
-- unique key on ESPN identifiers so re-runs merge instead of duplicating.

create extension if not exists pgcrypto;

create table leagues (
  id             uuid primary key default gen_random_uuid(),
  espn_league_id bigint not null,
  season         int    not null,
  name           text   not null default '',
  scoring_json   jsonb  not null default '{}'::jsonb,
  settings_json  jsonb  not null default '{}'::jsonb,
  current_week   int    not null default 1,
  final_week     int    not null default 17,
  playoff_team_count int not null default 6,
  regular_season_weeks int not null default 14,
  faab_budget    int,
  synced_at      timestamptz,
  unique (espn_league_id, season)
);

create table teams (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues (id) on delete cascade,
  espn_team_id   int  not null,
  name           text not null default '',
  abbrev         text not null default '',
  owner_name     text not null default '',
  logo_url       text,
  wins           int  not null default 0,
  losses         int  not null default 0,
  ties           int  not null default 0,
  points_for     numeric not null default 0,
  points_against numeric not null default 0,
  waiver_rank    int,
  faab_remaining int,
  playoff_seed   int,
  unique (league_id, espn_team_id)
);

create table players (
  id             uuid primary key default gen_random_uuid(),
  espn_player_id bigint not null unique,
  name           text   not null default '',
  position       text   not null default '',
  nfl_team       text   not null default '',
  ownership_pct  numeric,
  ownership_delta numeric,       -- 7-day change from kona_player_info, for trending targets
  injury_status  text,
  headshot_url   text,
  season_points  numeric,
  season_projected numeric
);

create table matchups (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues (id) on delete cascade,
  week           int  not null,
  home_team_id   uuid not null references teams (id) on delete cascade,
  away_team_id   uuid references teams (id) on delete cascade,   -- null = bye
  home_score     numeric not null default 0,
  away_score     numeric not null default 0,
  home_projected numeric,
  away_projected numeric,
  home_yet_to_play int,
  away_yet_to_play int,
  is_playoff     boolean not null default false,
  is_final       boolean not null default false,
  winner_id      uuid references teams (id),
  unique (league_id, week, home_team_id)
);

create table roster_slots (
  id             uuid primary key default gen_random_uuid(),
  team_id        uuid not null references teams (id) on delete cascade,
  week           int  not null,
  player_id      uuid not null references players (id) on delete cascade,
  slot           text not null,              -- QB / RB / WR / TE / FLEX / D/ST / K / BE / IR
  is_starter     boolean not null default false,
  points         numeric not null default 0,
  projected      numeric,
  unique (team_id, week, player_id)
);

create table transactions (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues (id) on delete cascade,
  espn_tx_id     text not null unique,
  week           int  not null,
  type           text not null,              -- WAIVER / FREEAGENT / TRADE
  team_id        uuid references teams (id) on delete cascade,
  player_in_id   uuid references players (id),
  player_out_id  uuid references players (id),
  faab_bid       int,
  executed_at    timestamptz
);

create table draft_picks (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues (id) on delete cascade,
  team_id        uuid not null references teams (id) on delete cascade,
  player_id      uuid not null references players (id),
  round          int  not null,
  pick           int  not null,              -- overall pick number
  keeper         boolean not null default false,
  unique (league_id, pick)
);

-- The workhorse: the worker computes derived metrics once per sync so the
-- frontend never does heavy math. week = 0 means season-to-date.
create table computed_stats (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues (id) on delete cascade,
  team_id        uuid not null references teams (id) on delete cascade,
  week           int  not null default 0,
  stat_key       text not null,
  value          numeric not null,
  unique (league_id, team_id, week, stat_key)
);

create table recaps (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues (id) on delete cascade,
  week           int  not null,
  markdown       text not null,
  generated_at   timestamptz not null default now(),
  unique (league_id, week)
);

create index idx_teams_league        on teams (league_id);
create index idx_matchups_league_wk  on matchups (league_id, week);
create index idx_roster_team_wk      on roster_slots (team_id, week);
create index idx_tx_league_wk        on transactions (league_id, week);
create index idx_stats_league_key    on computed_stats (league_id, stat_key);
create index idx_recaps_league       on recaps (league_id, week desc);

-- RLS: public read, worker-only write. The worker uses the service-role key,
-- which bypasses RLS; anon gets select-only.
do $$
declare t text;
begin
  foreach t in array array['leagues','teams','players','matchups','roster_slots',
                           'transactions','draft_picks','computed_stats','recaps']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy "public read" on %I for select using (true)', t);
  end loop;
end $$;
