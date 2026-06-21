-- ============================================================================
-- BG Session — migration 0039: "games I'll bring" per session
--
-- Profiles already carry a game collection (profiles.owned_games). This ties it
-- to a session: confirmed participants pledge which games THEY will bring, so a
-- table doesn't end up with three copies of Catan and nothing else.
--
-- Visibility matches the rest of the in-session surface (address, chat, private
-- profiles): only confirmed participants (is_session_participant) can see or add
-- entries. Each participant manages only their own pledges.
-- ============================================================================

create table if not exists session_brought_games (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  game_name  text not null check (char_length(game_name) between 1 and 80),
  created_at timestamptz not null default now(),
  unique (session_id, user_id, game_name)
);

create index if not exists sbg_session_idx on session_brought_games (session_id);

alter table session_brought_games enable row level security;

drop policy if exists "sbg_select_participants" on session_brought_games;
drop policy if exists "sbg_insert_self" on session_brought_games;
drop policy if exists "sbg_delete_self" on session_brought_games;

-- Participants of the session can see what's being brought.
create policy "sbg_select_participants" on session_brought_games for select to authenticated
  using (is_session_participant(session_id));

-- A participant adds only their OWN pledges, and only while confirmed.
create policy "sbg_insert_self" on session_brought_games for insert to authenticated
  with check (user_id = auth.uid() and is_session_participant(session_id));

-- A participant removes only their own pledges.
create policy "sbg_delete_self" on session_brought_games for delete to authenticated
  using (user_id = auth.uid());
