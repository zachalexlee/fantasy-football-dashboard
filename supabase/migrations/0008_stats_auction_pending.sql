-- Auction draft value per pick (null for snake drafts).
alter table draft_picks add column if not exists bid_amount numeric;

-- Per-player weekly stat line (passing/rushing/receiving etc.), parsed from the
-- ESPN boxscore. Scoped to rostered players (one row per team-week-player,
-- same as points/projected already here).
alter table roster_slots add column if not exists stats jsonb;

-- Pending (not-yet-processed) waiver claims and trade proposals.
create table if not exists pending_transactions (
  id uuid primary key default gen_random_uuid(),
  league_id uuid not null,
  espn_tx_id text unique not null,
  type text not null,                 -- WAIVER / FREEAGENT / TRADE_PROPOSAL
  team_id uuid,                        -- proposing / claiming team
  related_team_id uuid,               -- trade counterparty
  player_in_id uuid,
  player_out_id uuid,
  faab_bid integer,
  proposed_at timestamptz,
  process_date timestamptz,
  synced_at timestamptz not null default now()
);
create index if not exists pending_tx_league_idx on pending_transactions (league_id);

alter table pending_transactions enable row level security;
drop policy if exists pending_tx_read on pending_transactions;
create policy pending_tx_read on pending_transactions for select using (true);
