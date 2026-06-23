-- ============================================================================
-- BG Session — migration 0044: a session can't be scheduled in the past
--
-- Backstop for the client guard in CreateSession/EditSession: a host must not be
-- able to create or reschedule a one-time session whose start time has already
-- passed, even by hitting the API directly.
--
-- Folded into enforce_session_limits() (0030/0042) rather than a column CHECK,
-- because a CHECK fires on EVERY update and would reject legitimate edits to a
-- session that is already in progress. Instead we only enforce it when the host
-- is actually SETTING the start time:
--   * on INSERT, always; or
--   * on UPDATE, only when starts_at actually changed.
-- So updating other fields of an in-progress session is never blocked.
--
-- Like the other checks here it's skipped for privileged internal flows
-- (bg.skip_limits='on', e.g. the weekly roll, which always inserts future
-- occurrences anyway) and for non-host actors (new.host_id <> auth.uid(), e.g.
-- the confirmed_count sync). Body is 0042's with check (0) prepended; re-runnable.
-- ============================================================================

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

  -- 0) The start time can't be in the past. Only when the host is actually
  --    setting/moving it (insert, or starts_at changed) — never when merely
  --    editing other fields of a session whose start time has already passed.
  if (tg_op = 'INSERT' or new.starts_at is distinct from old.starts_at)
     and new.starts_at <= now() then
    raise exception 'A session must start in the future — you can''t schedule one in the past.'
      using errcode = 'check_violation';
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
