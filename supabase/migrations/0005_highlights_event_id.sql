-- Link highlight clips to a specific NFL game so the Scores tab can attach
-- each game's reel. ESPN inline highlights carry the event id; Highlightly
-- clips leave it null.
alter table game_highlights add column if not exists espn_event_id text;
create index if not exists game_highlights_event_idx on game_highlights (espn_event_id);
