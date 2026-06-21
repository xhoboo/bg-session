-- ============================================================================
-- BG Session — migration 0028: Weekly Sessions (schema + RLS + co-host edits)
--
-- A "weekly session" is a recurring meetup that rolls forward every week. The
-- recurring *template* lives in `weekly_series` (one per host). Each concrete
-- week is a normal `sessions` row (an "occurrence") tagged recurrence='weekly'
-- and linked back via series_id — so history, ratings, chat, addresses and the
-- session detail page keep working with zero changes.
--
-- Co-hosts (weekly_cohosts) are host-appointed helpers. They:
--   * are auto-added as APPROVED participants of every occurrence (migration
--     0029's roll function), so they keep their spot week to week, and
--   * may edit the session, but ONLY the fields the host allows — the allowed
--     field keys are stored in weekly_series.cohost_editable and enforced by the
--     triggers below (and mirrored in the edit UI).
--
-- This migration is schema + policies + the per-field co-host edit guard. The
-- roll/generation logic and session limits live in 0029/0030.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- weekly_series — the recurring template (one active weekly session per host)
-- ---------------------------------------------------------------------------
create table if not exists weekly_series (
  id               uuid primary key default gen_random_uuid(),
  host_id          uuid not null references profiles (id) on delete cascade,
  title            text not null check (char_length(title) between 1 and 140),
  weekly_day       smallint not null check (weekly_day between 0 and 6), -- 0=Sun..6=Sat (matches JS getDay / Postgres dow)
  start_time       time not null,                                        -- wall-clock time in Asia/Jakarta (WIB)
  duration_minutes int check (duration_minutes is null or duration_minutes > 0),
  region           text not null,
  area             text not null,
  min_players      int not null default 3,
  max_players      int not null check (max_players between 1 and 50),
  session_type     session_type not null default 'approval',
  -- Which field-groups co-hosts may edit. Keys: title, schedule, location,
  -- players, board_games, session_type, duration. Empty = co-hosts can't edit.
  cohost_editable  text[] not null default '{}',
  full_address     text not null,
  maps_url         text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint weekly_series_min_players_check check (min_players >= 3 and min_players <= max_players),
  unique (host_id)   -- a host can own at most ONE weekly session
);

create index if not exists weekly_series_host_idx on weekly_series (host_id);

-- ---------------------------------------------------------------------------
-- weekly_cohosts — host-appointed co-hosts of a series
-- ---------------------------------------------------------------------------
create table if not exists weekly_cohosts (
  series_id  uuid not null references weekly_series (id) on delete cascade,
  user_id    uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (series_id, user_id)
);

create index if not exists weekly_cohosts_user_idx on weekly_cohosts (user_id);

-- ---------------------------------------------------------------------------
-- sessions: link occurrences to their series + carry a persistent recurrence
-- tag (kept even if the series is later deleted, so history stays labelled).
-- ---------------------------------------------------------------------------
alter table sessions
  add column if not exists series_id  uuid references weekly_series (id) on delete set null,
  add column if not exists recurrence text not null default 'one_time';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'sessions_recurrence_check') then
    alter table sessions add constraint sessions_recurrence_check
      check (recurrence in ('one_time', 'weekly'));
  end if;
end $$;

create index if not exists sessions_series_idx on sessions (series_id);

-- ---------------------------------------------------------------------------
-- RLS
-- ---------------------------------------------------------------------------
alter table weekly_series  enable row level security;
alter table weekly_cohosts enable row level security;

-- weekly_series: the template (incl. full address) is visible to the host and
-- its co-hosts only. Browse/detail never read it — they read the public
-- occurrence rows. Co-hosts may UPDATE, but the trigger below limits which
-- columns they can actually change.
drop policy if exists "weekly_series_select_host_or_cohost" on weekly_series;
create policy "weekly_series_select_host_or_cohost"
  on weekly_series for select to authenticated
  using (
    host_id = auth.uid()
    or exists (select 1 from weekly_cohosts c where c.series_id = weekly_series.id and c.user_id = auth.uid())
  );

drop policy if exists "weekly_series_insert_host" on weekly_series;
create policy "weekly_series_insert_host"
  on weekly_series for insert to authenticated
  with check (host_id = auth.uid());

drop policy if exists "weekly_series_update_host_or_cohost" on weekly_series;
create policy "weekly_series_update_host_or_cohost"
  on weekly_series for update to authenticated
  using (
    host_id = auth.uid()
    or exists (select 1 from weekly_cohosts c where c.series_id = weekly_series.id and c.user_id = auth.uid())
  )
  with check (
    host_id = auth.uid()
    or exists (select 1 from weekly_cohosts c where c.series_id = weekly_series.id and c.user_id = auth.uid())
  );

drop policy if exists "weekly_series_delete_host" on weekly_series;
create policy "weekly_series_delete_host"
  on weekly_series for delete to authenticated
  using (host_id = auth.uid());

-- weekly_cohosts: who co-hosts which series isn't sensitive (co-hosts already
-- show publicly as participants), so it's readable to authenticated users; this
-- lets the participant list / detail page tag co-hosts. Only the host adds; the
-- host OR the co-host themselves may remove (the latter = "step down").
drop policy if exists "weekly_cohosts_select_all" on weekly_cohosts;
create policy "weekly_cohosts_select_all"
  on weekly_cohosts for select to authenticated using (true);

drop policy if exists "weekly_cohosts_insert_host" on weekly_cohosts;
create policy "weekly_cohosts_insert_host"
  on weekly_cohosts for insert to authenticated
  with check (exists (select 1 from weekly_series s where s.id = series_id and s.host_id = auth.uid()));

drop policy if exists "weekly_cohosts_delete_host_or_self" on weekly_cohosts;
create policy "weekly_cohosts_delete_host_or_self"
  on weekly_cohosts for delete to authenticated
  using (
    user_id = auth.uid()
    or exists (select 1 from weekly_series s where s.id = weekly_cohosts.series_id and s.host_id = auth.uid())
  );

-- sessions UPDATE: was host-only; now also allow a co-host of the occurrence's
-- series (field-level limits enforced by the trigger below).
drop policy if exists "sessions_update_own" on sessions;
drop policy if exists "sessions_update_own_or_cohost" on sessions;
create policy "sessions_update_own_or_cohost"
  on sessions for update to authenticated
  using (
    host_id = auth.uid()
    or (series_id is not null and exists (
      select 1 from weekly_cohosts c where c.series_id = sessions.series_id and c.user_id = auth.uid()
    ))
  )
  with check (
    host_id = auth.uid()
    or (series_id is not null and exists (
      select 1 from weekly_cohosts c where c.series_id = sessions.series_id and c.user_id = auth.uid()
    ))
  );

-- session_addresses UPDATE/INSERT: allow co-hosts with 'location' permission to
-- edit the occurrence address (so the edit form can sync it). Host always may.
drop policy if exists "addresses_update_host" on session_addresses;
drop policy if exists "addresses_update_host_or_cohost" on session_addresses;
create policy "addresses_update_host_or_cohost"
  on session_addresses for update to authenticated
  using (
    exists (select 1 from sessions s where s.id = session_addresses.session_id and s.host_id = auth.uid())
    or exists (
      select 1 from sessions s
      join weekly_series ws on ws.id = s.series_id
      join weekly_cohosts c on c.series_id = ws.id and c.user_id = auth.uid()
      where s.id = session_addresses.session_id and 'location' = any(ws.cohost_editable)
    )
  )
  with check (
    exists (select 1 from sessions s where s.id = session_addresses.session_id and s.host_id = auth.uid())
    or exists (
      select 1 from sessions s
      join weekly_series ws on ws.id = s.series_id
      join weekly_cohosts c on c.series_id = ws.id and c.user_id = auth.uid()
      where s.id = session_addresses.session_id and 'location' = any(ws.cohost_editable)
    )
  );

-- ---------------------------------------------------------------------------
-- updated_at maintenance for weekly_series (reuses touch_updated_at from 0001)
-- ---------------------------------------------------------------------------
drop trigger if exists trg_weekly_series_touch on weekly_series;
create trigger trg_weekly_series_touch
  before update on weekly_series
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Per-field co-host edit enforcement
--
-- When a CO-HOST (not the host) updates an occurrence or the series, only the
-- field-groups present in weekly_series.cohost_editable may change. The host is
-- unrestricted here (other triggers/limits still apply). Non-host/non-co-host
-- updaters are not restricted by THIS trigger — RLS already decides who may
-- update at all, and internal flows (confirmed_count sync, a guest joining)
-- must pass through untouched. Privileged generation (roll) bypasses via the
-- bg.skip_limits GUC.
-- ---------------------------------------------------------------------------
create or replace function enforce_cohost_edit_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  ws       weekly_series%rowtype;
  editable text[];
begin
  if coalesce(current_setting('bg.skip_limits', true), '') = 'on' then
    return new;
  end if;
  if new.series_id is null then
    return new;  -- one-time session: no co-host concept
  end if;

  select * into ws from weekly_series where id = new.series_id;
  if not found or ws.host_id = auth.uid() then
    return new;  -- host (or orphaned series): unrestricted here
  end if;
  if not exists (select 1 from weekly_cohosts c where c.series_id = new.series_id and c.user_id = auth.uid()) then
    return new;  -- internal/non-editor flow (e.g. confirmed_count sync)
  end if;

  editable := ws.cohost_editable;

  if new.title is distinct from old.title and not ('title' = any(editable)) then
    raise exception 'You do not have permission to edit the title of this session.';
  end if;
  if new.starts_at is distinct from old.starts_at and not ('schedule' = any(editable)) then
    raise exception 'You do not have permission to change the schedule of this session.';
  end if;
  if (new.region is distinct from old.region or new.area is distinct from old.area)
     and not ('location' = any(editable)) then
    raise exception 'You do not have permission to change the location of this session.';
  end if;
  if (new.min_players is distinct from old.min_players or new.max_players is distinct from old.max_players)
     and not ('players' = any(editable)) then
    raise exception 'You do not have permission to change the player limits of this session.';
  end if;
  if new.board_games is distinct from old.board_games and not ('board_games' = any(editable)) then
    raise exception 'You do not have permission to change the board games of this session.';
  end if;
  if new.session_type is distinct from old.session_type and not ('session_type' = any(editable)) then
    raise exception 'You do not have permission to change the join type of this session.';
  end if;
  if new.duration_minutes is distinct from old.duration_minutes and not ('duration' = any(editable)) then
    raise exception 'You do not have permission to change the duration of this session.';
  end if;
  -- Co-hosts can never change ownership / linkage / type.
  if new.host_id is distinct from old.host_id
     or new.series_id is distinct from old.series_id
     or new.recurrence is distinct from old.recurrence then
    raise exception 'Co-hosts cannot change the ownership or type of this session.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_cohost_edit_sessions on sessions;
create trigger trg_enforce_cohost_edit_sessions
  before update on sessions
  for each row execute function enforce_cohost_edit_sessions();

create or replace function enforce_cohost_edit_series()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  editable text[];
begin
  if coalesce(current_setting('bg.skip_limits', true), '') = 'on' then
    return new;
  end if;
  if new.host_id = auth.uid() then
    return new;  -- host: unrestricted
  end if;
  if not exists (select 1 from weekly_cohosts c where c.series_id = new.id and c.user_id = auth.uid()) then
    return new;
  end if;

  editable := old.cohost_editable;

  -- Co-hosts can never manage co-host config or hand off the series.
  if new.cohost_editable is distinct from old.cohost_editable then
    raise exception 'Only the host can change co-host permissions.';
  end if;
  if new.host_id is distinct from old.host_id then
    raise exception 'Co-hosts cannot change the host of this session.';
  end if;

  if new.title is distinct from old.title and not ('title' = any(editable)) then
    raise exception 'You do not have permission to edit the title of this session.';
  end if;
  if (new.weekly_day is distinct from old.weekly_day or new.start_time is distinct from old.start_time)
     and not ('schedule' = any(editable)) then
    raise exception 'You do not have permission to change the schedule of this session.';
  end if;
  if (new.region is distinct from old.region or new.area is distinct from old.area
      or new.full_address is distinct from old.full_address or new.maps_url is distinct from old.maps_url)
     and not ('location' = any(editable)) then
    raise exception 'You do not have permission to change the location of this session.';
  end if;
  if (new.min_players is distinct from old.min_players or new.max_players is distinct from old.max_players)
     and not ('players' = any(editable)) then
    raise exception 'You do not have permission to change the player limits of this session.';
  end if;
  if new.session_type is distinct from old.session_type and not ('session_type' = any(editable)) then
    raise exception 'You do not have permission to change the join type of this session.';
  end if;
  if new.duration_minutes is distinct from old.duration_minutes and not ('duration' = any(editable)) then
    raise exception 'You do not have permission to change the duration of this session.';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_cohost_edit_series on weekly_series;
create trigger trg_enforce_cohost_edit_series
  before update on weekly_series
  for each row execute function enforce_cohost_edit_series();
