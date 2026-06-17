-- ============================================================================
-- BG Session — initial schema (V1)
-- Run this in the Supabase SQL editor (or via the Supabase CLI).
--
-- Design notes:
--  * The public-facing `sessions` table never stores the full address.
--    The full address lives in `session_addresses`, protected by its own RLS
--    so it is only readable by the host and APPROVED guests. This gives us
--    real row-level protection instead of relying on the client to "not ask"
--    for a hidden column.
--  * In-app notifications are written by SECURITY DEFINER triggers. Email
--    notifications are sent by an Edge Function subscribed to INSERTs on the
--    `notifications` table via a Database Webhook (see supabase/functions).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type session_type as enum ('open', 'approval');
create type request_status as enum ('pending', 'approved', 'rejected');
create type notification_type as enum (
  'join_requested',     -- -> host: someone asked to join
  'join_approved',      -- -> guest: you were approved
  'join_rejected',      -- -> guest: you were rejected
  'join_confirmed'      -- -> guest: open session, auto-confirmed
);

-- ---------------------------------------------------------------------------
-- profiles  (1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url   text,
  created_at   timestamptz not null default now()
);

alter table profiles enable row level security;

create policy "profiles_select_all"
  on profiles for select
  to authenticated
  using (true);

create policy "profiles_update_own"
  on profiles for update
  to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- Auto-create a profile row whenever a new auth user signs up.
create or replace function handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(
      new.raw_user_meta_data ->> 'full_name',
      new.raw_user_meta_data ->> 'name',
      split_part(new.email, '@', 1)
    ),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();

-- ---------------------------------------------------------------------------
-- sessions  (public-facing; NO full address here)
-- ---------------------------------------------------------------------------
create table sessions (
  id           uuid primary key default gen_random_uuid(),
  -- host_id references profiles (which is 1:1 with auth.users) so PostgREST can
  -- embed the host's public profile when browsing.
  host_id      uuid not null references profiles (id) on delete cascade,
  title        text not null check (char_length(title) between 1 and 140),
  starts_at    timestamptz not null,
  area         text not null,                 -- Jakarta neighborhood (dropdown)
  max_players  int  not null check (max_players between 1 and 50),
  board_games  text not null default '',      -- free text list of games
  session_type session_type not null default 'approval',
  confirmed_count int not null default 0,     -- maintained by triggers below
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index sessions_area_idx       on sessions (area);
create index sessions_starts_at_idx  on sessions (starts_at);
create index sessions_host_idx       on sessions (host_id);

alter table sessions enable row level security;

-- Anyone logged in can browse sessions (the address is NOT in this table).
create policy "sessions_select_all"
  on sessions for select
  to authenticated
  using (true);

create policy "sessions_insert_own"
  on sessions for insert
  to authenticated
  with check (host_id = auth.uid());

create policy "sessions_update_own"
  on sessions for update
  to authenticated
  using (host_id = auth.uid())
  with check (host_id = auth.uid());

create policy "sessions_delete_own"
  on sessions for delete
  to authenticated
  using (host_id = auth.uid());

-- ---------------------------------------------------------------------------
-- join_requests
-- ---------------------------------------------------------------------------
create table join_requests (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions (id) on delete cascade,
  -- guest_id references profiles so the host can embed the guest's public name.
  guest_id    uuid not null references profiles (id) on delete cascade,
  status      request_status not null default 'pending',
  message     text not null default '',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (session_id, guest_id)
);

create index join_requests_session_idx on join_requests (session_id);
create index join_requests_guest_idx   on join_requests (guest_id);

alter table join_requests enable row level security;

-- Guests insert their own request; hosts can't request to join their own session.
create policy "requests_insert_self"
  on join_requests for insert
  to authenticated
  with check (
    guest_id = auth.uid()
    and not exists (
      select 1 from sessions s
      where s.id = session_id and s.host_id = auth.uid()
    )
  );

-- Guest sees their own requests; host sees requests for their sessions.
create policy "requests_select_guest_or_host"
  on join_requests for select
  to authenticated
  using (
    guest_id = auth.uid()
    or exists (
      select 1 from sessions s
      where s.id = join_requests.session_id and s.host_id = auth.uid()
    )
  );

-- Host approves/rejects requests on their own sessions.
create policy "requests_update_host"
  on join_requests for update
  to authenticated
  using (
    exists (
      select 1 from sessions s
      where s.id = join_requests.session_id and s.host_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from sessions s
      where s.id = join_requests.session_id and s.host_id = auth.uid()
    )
  );

-- Guest may withdraw (delete) their own pending request.
create policy "requests_delete_self"
  on join_requests for delete
  to authenticated
  using (guest_id = auth.uid());

-- Open sessions auto-confirm the guest on request.
create or replace function set_request_status_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s_type session_type;
begin
  select session_type into s_type from sessions where id = new.session_id;
  if s_type = 'open' then
    new.status := 'approved';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$;

create trigger trg_set_request_status
  before insert on join_requests
  for each row execute function set_request_status_on_insert();

-- ---------------------------------------------------------------------------
-- session_addresses  (the secret: only host + approved guests may read)
-- Defined after join_requests because its SELECT policy references that table.
-- ---------------------------------------------------------------------------
create table session_addresses (
  session_id   uuid primary key references sessions (id) on delete cascade,
  full_address text not null
);

alter table session_addresses enable row level security;

create policy "addresses_select_host_or_approved"
  on session_addresses for select
  to authenticated
  using (
    exists (
      select 1 from sessions s
      where s.id = session_addresses.session_id
        and s.host_id = auth.uid()
    )
    or exists (
      select 1 from join_requests jr
      where jr.session_id = session_addresses.session_id
        and jr.guest_id = auth.uid()
        and jr.status = 'approved'
    )
  );

create policy "addresses_insert_host"
  on session_addresses for insert
  to authenticated
  with check (
    exists (
      select 1 from sessions s
      where s.id = session_addresses.session_id
        and s.host_id = auth.uid()
    )
  );

create policy "addresses_update_host"
  on session_addresses for update
  to authenticated
  using (
    exists (
      select 1 from sessions s
      where s.id = session_addresses.session_id
        and s.host_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- notifications  (in-app inbox; also drives email via Edge Function)
-- ---------------------------------------------------------------------------
create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  type        notification_type not null,
  title       text not null,
  body        text not null default '',
  session_id  uuid references sessions (id) on delete cascade,
  request_id  uuid references join_requests (id) on delete cascade,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index notifications_user_idx on notifications (user_id, read, created_at desc);

alter table notifications enable row level security;

create policy "notifications_select_own"
  on notifications for select
  to authenticated
  using (user_id = auth.uid());

-- Mark-as-read only. Rows are created by triggers (SECURITY DEFINER), never
-- directly by clients, so there is intentionally no INSERT policy.
create policy "notifications_update_own"
  on notifications for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Notification triggers
-- ---------------------------------------------------------------------------

-- On a new join request: notify the host. If the session is open (and the
-- request was therefore auto-approved), also confirm the guest.
create or replace function notify_on_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s_host    uuid;
  s_title   text;
  guest_name text;
begin
  select host_id, title into s_host, s_title from sessions where id = new.session_id;
  select coalesce(display_name, 'Someone') into guest_name from profiles where id = new.guest_id;

  -- Host notification
  insert into notifications (user_id, type, title, body, session_id, request_id)
  values (
    s_host,
    'join_requested',
    case when new.status = 'approved'
         then guest_name || ' joined your session'
         else guest_name || ' wants to join your session' end,
    '"' || s_title || '"' ||
      case when new.message <> '' then ' — ' || new.message else '' end,
    new.session_id,
    new.id
  );

  -- Open session: guest is immediately confirmed
  if new.status = 'approved' then
    insert into notifications (user_id, type, title, body, session_id, request_id)
    values (
      new.guest_id,
      'join_confirmed',
      'You are confirmed for "' || s_title || '"',
      'This is an open session — the host address is now visible to you.',
      new.session_id,
      new.id
    );
  end if;

  return new;
end;
$$;

create trigger trg_notify_request_insert
  after insert on join_requests
  for each row execute function notify_on_request_insert();

-- On approve/reject of a pending request: notify the guest.
create or replace function notify_on_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s_title text;
begin
  if new.status = old.status then
    return new;
  end if;

  select title into s_title from sessions where id = new.session_id;

  if new.status = 'approved' then
    insert into notifications (user_id, type, title, body, session_id, request_id)
    values (
      new.guest_id,
      'join_approved',
      'Approved for "' || s_title || '"',
      'The host approved your request. The full address is now visible to you.',
      new.session_id,
      new.id
    );
  elsif new.status = 'rejected' then
    insert into notifications (user_id, type, title, body, session_id, request_id)
    values (
      new.guest_id,
      'join_rejected',
      'Request declined for "' || s_title || '"',
      'The host was unable to approve your request this time.',
      new.session_id,
      new.id
    );
  end if;

  return new;
end;
$$;

create trigger trg_notify_request_update
  after update on join_requests
  for each row execute function notify_on_request_update();

-- ---------------------------------------------------------------------------
-- confirmed_count maintenance
--
-- Keeps sessions.confirmed_count in sync with the number of APPROVED requests
-- so the public browse page can show "spots taken" without exposing the
-- individual (RLS-protected) join_request rows of other guests.
-- ---------------------------------------------------------------------------
create or replace function sync_confirmed_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (tg_op = 'INSERT') then
    if new.status = 'approved' then
      update sessions set confirmed_count = confirmed_count + 1 where id = new.session_id;
    end if;
  elsif (tg_op = 'UPDATE') then
    if old.status <> 'approved' and new.status = 'approved' then
      update sessions set confirmed_count = confirmed_count + 1 where id = new.session_id;
    elsif old.status = 'approved' and new.status <> 'approved' then
      update sessions set confirmed_count = greatest(confirmed_count - 1, 0) where id = new.session_id;
    end if;
  elsif (tg_op = 'DELETE') then
    if old.status = 'approved' then
      update sessions set confirmed_count = greatest(confirmed_count - 1, 0) where id = old.session_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger trg_sync_confirmed_count
  after insert or update or delete on join_requests
  for each row execute function sync_confirmed_count();

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------
create or replace function touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger trg_sessions_touch
  before update on sessions
  for each row execute function touch_updated_at();

create trigger trg_requests_touch
  before update on join_requests
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Realtime: stream new notifications to the in-app bell.
-- ---------------------------------------------------------------------------
alter publication supabase_realtime add table notifications;
