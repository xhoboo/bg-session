-- ============================================================================
-- BG Session — migration 0057: close the capacity TOCTOU race
--
-- Both capacity gates read sessions.confirmed_count WITHOUT locking the row:
--   * set_request_status_on_insert (latest: 0038) — open-session auto-approve /
--     waitlist decision.
--   * enforce_capacity_on_approve (latest: 0006) — host approving a request.
--
-- Two concurrent joins/approvals to the SAME session can both read the same
-- confirmed_count, both pass the `taken + 1 >= cap` check, and both get
-- approved — pushing the session one (or more) over max_players. The window is
-- small (and confirmed_count is host-counted as +1), but it's a real
-- read-check-write race.
--
-- Fix: take a row lock (`SELECT … FOR UPDATE`) on the sessions row before
-- reading confirmed_count, so concurrent decisions for one session serialize.
-- The later transaction blocks until the earlier one commits (its AFTER trigger
-- sync_confirmed_count has already bumped confirmed_count by then), so it reads
-- the updated count and is correctly rejected when full.
--
-- Belt-and-suspenders: a CHECK constraint so the invariant (total players incl.
-- host never exceeds capacity) holds no matter which path writes the row.
-- Added NOT VALID so it enforces all new writes without failing the migration
-- on any pre-existing row.
--
-- Bodies below are reproduced verbatim from the latest versions, with only the
-- `for update` clause added. Re-runnable (create-or-replace + guarded ALTER).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Insert path (open auto-approve / waitlist) — from 0038, + FOR UPDATE.
-- ---------------------------------------------------------------------------
create or replace function set_request_status_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s_type session_type;
  cap    int;
  taken  int;
begin
  if coalesce(current_setting('bg.skip_limits', true), '') = 'on' then
    return new;   -- privileged insert: keep status as given
  end if;

  -- Lock the session row so concurrent joins to the same session serialize on
  -- the capacity check (TOCTOU fix — see migration header).
  select session_type, max_players, confirmed_count
    into s_type, cap, taken
    from sessions where id = new.session_id
    for update;

  if taken + 1 >= cap then          -- +1 for the host: session is full
    new.status := 'waitlisted';
  elsif s_type = 'open' then
    new.status := 'approved';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 2) Approve path (host approves a pending request) — from 0006, + FOR UPDATE.
-- ---------------------------------------------------------------------------
create or replace function enforce_capacity_on_approve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap   int;
  taken int;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    -- Same row lock as the insert path: serialize concurrent approvals so the
    -- capacity check can't be bypassed by a read-read-write race.
    select max_players, confirmed_count into cap, taken
      from sessions where id = new.session_id
      for update;
    if taken + 1 >= cap then        -- +1 for the host
      raise exception 'This session is already full.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3) Backstop invariant: total players (confirmed guests + host) never exceeds
--    max_players. Mirrors the `taken + 1 >= cap` rule the triggers enforce, so
--    confirmed_count can reach at most max_players - 1. NOT VALID: enforced on
--    every new/updated row, but won't fail this migration on legacy data.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'sessions_confirmed_within_capacity'
      and conrelid = 'public.sessions'::regclass
  ) then
    alter table public.sessions
      add constraint sessions_confirmed_within_capacity
      check (confirmed_count + 1 <= max_players) not valid;
  end if;
end $$;
