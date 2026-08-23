-- Per-game box score (line scores, team records, game leaders, venue) captured
-- from the ESPN scoreboard feed for the Scores tab. Preseason games carry line
-- scores + records; team stat totals and leaders fill in during the regular
-- season. Player-by-player stats need ESPN's summary endpoint (blocked from the
-- worker's IP), so "game leaders" is the stat granularity here.
alter table nfl_games add column if not exists boxscore jsonb;
