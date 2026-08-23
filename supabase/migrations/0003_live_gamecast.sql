-- Live gamecast: real NFL scoreboard context + per-matchup AI analysis.

create table nfl_games (
  id             uuid primary key default gen_random_uuid(),
  season         int  not null,
  week           int  not null,
  espn_event_id  text not null unique,
  kickoff        timestamptz,
  short_name     text not null default '',
  home_abbrev    text not null default '',
  away_abbrev    text not null default '',
  home_score     int,
  away_score     int,
  status         text not null default 'pre',   -- pre / in / post
  status_detail  text,
  network        text,
  synced_at      timestamptz
);

create table game_analysis (
  id             uuid primary key default gen_random_uuid(),
  league_id      uuid not null references leagues (id) on delete cascade,
  week           int  not null,
  home_team_id   uuid not null references teams (id) on delete cascade,
  state          text not null default 'pre',   -- pre / live / final
  markdown       text not null,
  generated_at   timestamptz not null default now(),
  unique (league_id, week, home_team_id)
);

create index idx_nfl_games_wk on nfl_games (season, week);
create index idx_analysis_wk  on game_analysis (league_id, week);

alter table nfl_games enable row level security;
alter table game_analysis enable row level security;
create policy "public read" on nfl_games for select using (true);
create policy "public read" on game_analysis for select using (true);
