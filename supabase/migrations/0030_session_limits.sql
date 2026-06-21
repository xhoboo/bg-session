-- ============================================================================
-- BG Session — migration 0030: per-host session limits
--
-- Enforced server-side so the rules hold even if the client checks are bypassed:
--   1) A host's active (not-yet-finished) sessions may not OVERLAP in time. This
--      also covers "no two sessions at the same date & time".
--   2) A host may have at most 2 ACTIVE one-time sessions at once.
--   3) At most 1 weekly session per host — enforced by weekly_series.unique
--      (host_id) in 0028, not here.
--
-- Only applies to a host inserting/updating their OWN session by hand. Internal
-- flows (confirmed_count sync, a guest joining, the weekly roll generator) run
-- as a different actor or set the bg.skip_limits GUC and pass through.
--
-- Note: weekly occurrences are created by roll_weekly_sessions() with
-- bg.skip_limits set, so they are not overlap-checked against one-time sessions
-- here; CreateWeeklySession validates that on the client when the series starts.
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

  new_end := new.starts_at + make_interval(mins => coalesce(new.duration_minutes, 180));

  -- 1) No overlap with the host's other still-active sessions.
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
