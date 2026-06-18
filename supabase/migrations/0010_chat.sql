-- ============================================================================
-- BG Session — migration 0010: chat (direct messages + per-session chat)
--
-- direct_messages : 1:1 private chat between any two members.
-- session_messages: group chat for a session's confirmed participants
--                   (host + approved guests), reusing is_session_participant().
-- Both stream live via Supabase Realtime.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Direct messages (private 1:1)
-- ---------------------------------------------------------------------------
create table if not exists direct_messages (
  id           uuid primary key default gen_random_uuid(),
  sender_id    uuid not null references profiles (id) on delete cascade,
  recipient_id uuid not null references profiles (id) on delete cascade,
  body         text not null check (char_length(body) between 1 and 2000),
  read         boolean not null default false,
  created_at   timestamptz not null default now()
);

create index if not exists dm_pair_idx on direct_messages (sender_id, recipient_id, created_at);
create index if not exists dm_recipient_idx on direct_messages (recipient_id, read);

alter table direct_messages enable row level security;

drop policy if exists "dm_select" on direct_messages;
drop policy if exists "dm_insert" on direct_messages;
drop policy if exists "dm_update_recipient" on direct_messages;

create policy "dm_select" on direct_messages for select to authenticated
  using (sender_id = auth.uid() or recipient_id = auth.uid());

create policy "dm_insert" on direct_messages for insert to authenticated
  with check (sender_id = auth.uid() and recipient_id <> auth.uid());

-- Recipient can mark messages read.
create policy "dm_update_recipient" on direct_messages for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Session chat (participants only)
-- ---------------------------------------------------------------------------
create table if not exists session_messages (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  body       text not null check (char_length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);

create index if not exists session_messages_idx on session_messages (session_id, created_at);

alter table session_messages enable row level security;

drop policy if exists "session_messages_select" on session_messages;
drop policy if exists "session_messages_insert" on session_messages;

create policy "session_messages_select" on session_messages for select to authenticated
  using (is_session_participant(session_id));

create policy "session_messages_insert" on session_messages for insert to authenticated
  with check (user_id = auth.uid() and is_session_participant(session_id));

-- ---------------------------------------------------------------------------
-- Realtime
-- ---------------------------------------------------------------------------
do $$
begin
  begin
    alter publication supabase_realtime add table direct_messages;
  exception when duplicate_object then null;
  end;
  begin
    alter publication supabase_realtime add table session_messages;
  exception when duplicate_object then null;
  end;
end $$;
