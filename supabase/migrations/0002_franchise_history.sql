-- Franchise history: identify the same manager across seasons and record
-- where each team finished, so the record book can span every season.
alter table teams add column if not exists owner_guid text;
alter table teams add column if not exists final_rank int;
