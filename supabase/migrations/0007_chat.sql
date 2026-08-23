-- Smack-talk chat with a lightweight identity (name + email + chosen team).
-- No passwords: this is a private league board, identity is for attribution.
create table if not exists chat_users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text not null,
  team_id uuid,
  team_name text,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create table if not exists chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_email text not null,
  name text not null,
  team_name text,
  body text not null,
  created_at timestamptz not null default now()
);
create index if not exists chat_messages_created_idx on chat_messages (created_at);

alter table chat_users enable row level security;
alter table chat_messages enable row level security;

-- The web app talks to PostgREST with the anon key. Allow the anon role to
-- read the board and append (register / post), but not to delete history.
drop policy if exists chat_users_read on chat_users;
drop policy if exists chat_users_insert on chat_users;
drop policy if exists chat_users_update on chat_users;
drop policy if exists chat_messages_read on chat_messages;
drop policy if exists chat_messages_insert on chat_messages;

create policy chat_users_read on chat_users for select using (true);
create policy chat_users_insert on chat_users for insert with check (true);
create policy chat_users_update on chat_users for update using (true) with check (true);
create policy chat_messages_read on chat_messages for select using (true);
create policy chat_messages_insert on chat_messages for insert with check (true);
