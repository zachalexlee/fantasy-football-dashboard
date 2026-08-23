-- Track preseason vs regular vs postseason on the live NFL slate.
alter table nfl_games add column if not exists season_type int not null default 2;
