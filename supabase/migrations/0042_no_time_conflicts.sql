-- ============================================================================
-- BG Session — migration 0042: a player can't double-book a time slot
--
-- "Commitment" = a session you HOST or one you've been APPROVED into. The rules,
-- all enforced server-side so they hold even if the client checks are bypassed:
--
--   1) You can't JOIN a session whose time overlaps a commitment you already
--      have. (You may still stack pending/waitlist requests at the same time —
--      those aren't commitments yet.)
--   2) You can't be APPROVED into a session that overlaps an existing commitment
--      (defensive — normally rule 3 has already cleared the conflicting request).
--   3) The moment a request becomes APPROVED, your OTHER still-pending /
--      waitlisted requests that overlap that now-confirmed slot are forfeited
--      ("hangus") and removed.
--   4) Hosting: enforce_session_limits (0030) already blocked a host from two
--      OVERLAPPING hosted sessions; it now also blocks creating/rescheduling a
--      hosted session that overlaps a session you ATTEND as an approved guest.
--
-- Overlap = [starts_at, starts_at + duration) intervals intersect, using the
-- 180-min fallback when duration_minutes is null (matches 0029/0030).
--
-- Privileged internal flows (weekly roll, co-host add, waitlist auto-promote)
-- set bg.skip_limits='on' and bypass the *blocking* checks (1, 2, 4) — but the
-- forfeit sweep (3) always runs, which is what keeps auto-promotion from ever
-- confirming someone into two overlapping slots. Re-runnable.
-- ============================================================================

-- New notification kind for the forfeit sweep (rule 3). Only used at runtime by
-- the function below, which never executes during this migration, so adding +
-- referencing the value in the same file is safe (same pattern as 0011/0014/0038).
alter type notification_type add value if not exists 'request_forfeited';

-- ---------------------------------------------------------------------------
-- Does `p_user` already have a commitment (hosted or approved-guest session,
-- still upcoming) whose time overlaps [p_start, p_end), other than the session
-- we're excluding? SECURITY DEFINER so it sees every row regardless of the
-- caller's RLS view (it's only ever called from the definer triggers below).
-- ---------------------------------------------------------------------------
create or replace function bg_commitment_conflict(
  p_user            uuid,
  p_start           timestamptz,
  p_end             timestamptz,
  p_exclude_session uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    -- sessions p_user HOSTS
    select 1
    from sessions s
    where s.host_id = p_user
      and s.id is distinct from p_exclude_session
      and s.starts_at < p_end
      and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > p_start
      and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > now()
    union all
    -- sessions p_user is an APPROVED participant of
    select 1
    from join_requests j
    join sessions s on s.id = j.session_id
    where j.guest_id = p_user
      and j.status = 'approved'
      and s.id is distinct from p_exclude_session
      and s.starts_at < p_end
      and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > p_start
      and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > now()
  );
$$;

-- ---------------------------------------------------------------------------
-- (1) Block a join request whose session overlaps an existing commitment.
--     Runs on every hand insert; status-setting is left to the other BEFORE
--     trigger. Privileged inserts (skip_limits) pass straight through.
-- ---------------------------------------------------------------------------
create or replace function enforce_join_time_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  w_start timestamptz;
  w_end   timestamptz;
begin
  if coalesce(current_setting('bg.skip_limits', true), '') = 'on' then
    return new;   -- weekly roll / co-host add: keep moving
  end if;

  select s.starts_at,
         s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180))
    into w_start, w_end
    from sessions s where s.id = new.session_id;

  if bg_commitment_conflict(new.guest_id, w_start, w_end, new.session_id) then
    raise exception 'You already have a session at this day and time. Leave that one first, or pick a session at a different time.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_join_time_conflict on join_requests;
create trigger trg_enforce_join_time_conflict
  before insert on join_requests
  for each row execute function enforce_join_time_conflict();

-- ---------------------------------------------------------------------------
-- (2) Block an approval that would land the guest in two overlapping slots.
--     Defensive: rule 3 normally deletes the conflicting request before a host
--     ever sees it. Bypassed for auto-promote (skip_limits), which is safe
--     because rule 3 guarantees no overlapping waitlist row survives.
-- ---------------------------------------------------------------------------
create or replace function enforce_approve_time_conflict()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  w_start timestamptz;
  w_end   timestamptz;
begin
  if coalesce(current_setting('bg.skip_limits', true), '') = 'on' then
    return new;
  end if;
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select s.starts_at,
           s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180))
      into w_start, w_end
      from sessions s where s.id = new.session_id;

    if bg_commitment_conflict(new.guest_id, w_start, w_end, new.session_id) then
      raise exception 'This player is already committed to another session at this time.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_enforce_approve_time_conflict on join_requests;
create trigger trg_enforce_approve_time_conflict
  before update on join_requests
  for each row execute function enforce_approve_time_conflict();

-- ---------------------------------------------------------------------------
-- (3) Forfeit sweep: once a request is confirmed, drop the same guest's OTHER
--     pending/waitlisted requests that overlap the confirmed slot. Always runs
--     (even under skip_limits) so the no-double-booking invariant survives
--     weekly roll-ins and waitlist auto-promotion. Deleting a non-approved row
--     touches neither confirmed_count nor the waitlist promote trigger.
-- ---------------------------------------------------------------------------
create or replace function void_overlapping_requests_on_commit()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  w_start timestamptz;
  w_end   timestamptz;
begin
  if new.status <> 'approved' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'approved' then
    return new;   -- was already confirmed; nothing newly to clear
  end if;

  select s.starts_at,
         s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180))
    into w_start, w_end
    from sessions s where s.id = new.session_id;

  -- Delete the overlapping requests and, for each one, tell the guest why it
  -- vanished. (Deleting a pending/waitlist row touches neither confirmed_count
  -- nor the waitlist-promote trigger, so no extra side effects.)
  with gone as (
    delete from join_requests j
    using sessions s
    where j.session_id = s.id
      and j.guest_id   = new.guest_id
      and j.id        <> new.id
      and j.status in ('pending', 'waitlisted')
      and s.starts_at < w_end
      and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > w_start
      and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > now()
    returning s.id as session_id, s.title as session_title
  )
  insert into notifications (user_id, type, title, body, session_id)
  select new.guest_id,
         'request_forfeited',
         'Request dropped — you joined another session',
         'You were confirmed for a session at the same day and time, so your overlapping request to "'
           || g.session_title || '" was cancelled.',
         g.session_id
  from gone g;

  return new;
end;
$$;

drop trigger if exists trg_void_overlapping_requests on join_requests;
create trigger trg_void_overlapping_requests
  after insert or update on join_requests
  for each row execute function void_overlapping_requests_on_commit();

-- ---------------------------------------------------------------------------
-- (4) Extend the host limits from 0030: besides "no two overlapping hosted
--     sessions", also forbid hosting a session that overlaps one you ATTEND.
--     Body is 0030's, with check (1b) added. Weekly occurrences are inserted by
--     roll_weekly_sessions() under skip_limits and still skip this (the client
--     validates the first occurrence) — unchanged from 0030.
-- ---------------------------------------------------------------------------
create or replace function enforce_session_limits()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  new_end        timestamptz;
  conflict_count int;
  onetime_count  int;
begin
  if coalesce(current_setting('bg.skip_limits', true), '') = 'on' then
    return new;
  end if;
  if new.host_id <> auth.uid() then
    return new;   -- not the host acting by hand (e.g. confirmed_count sync)
  end if;

  new_end := new.starts_at + make_interval(mins => coalesce(new.duration_minutes, 180));

  -- 1) No overlap with the host's other still-active hosted sessions.
  select count(*) into conflict_count
  from sessions s
  where s.host_id = new.host_id
    and s.id <> new.id
    and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > now()   -- active
    and s.starts_at < new_end
    and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > new.starts_at;
  if conflict_count > 0 then
    raise exception 'You already host a session that overlaps this time. Your sessions cannot overlap — the next one can only start after the previous one ends.'
      using errcode = 'check_violation';
  end if;

  -- 1b) No overlap with sessions the host ATTENDS as an approved participant.
  select count(*) into conflict_count
  from join_requests j
  join sessions s on s.id = j.session_id
  where j.guest_id = new.host_id
    and j.status = 'approved'
    and s.id <> new.id
    and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > now()
    and s.starts_at < new_end
    and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > new.starts_at;
  if conflict_count > 0 then
    raise exception 'You are already attending another session at this time. Pick a different day or time for the one you host.'
      using errcode = 'check_violation';
  end if;

  -- 2) At most 2 active one-time sessions.
  if new.recurrence = 'one_time' then
    select count(*) into onetime_count
    from sessions s
    where s.host_id = new.host_id
      and s.id <> new.id
      and s.recurrence = 'one_time'
      and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > now();
    if onetime_count >= 2 then
      raise exception 'You can host at most 2 active one-time sessions at a time.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_enforce_session_limits on sessions;
create trigger trg_enforce_session_limits
  before insert or update on sessions
  for each row execute function enforce_session_limits();

-- ---------------------------------------------------------------------------
-- Privilege hygiene (see 0030/0034/0037): these run as triggers / via the
-- definer context, so no client role needs EXECUTE.
-- ---------------------------------------------------------------------------
revoke execute on function public.bg_commitment_conflict(uuid, timestamptz, timestamptz, uuid) from public, anon, authenticated;
grant  execute on function public.bg_commitment_conflict(uuid, timestamptz, timestamptz, uuid) to service_role;
revoke execute on function public.enforce_join_time_conflict()          from public, anon, authenticated;
revoke execute on function public.enforce_approve_time_conflict()       from public, anon, authenticated;
revoke execute on function public.void_overlapping_requests_on_commit() from public, anon, authenticated;
