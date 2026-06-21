-- ============================================================================
-- BG Session — migration 0041: number each weekly occurrence (#N)
--
-- A weekly session should show how many times it has actually run, e.g. a
-- series titled "Ayo Main Hansa" that has met five weeks in a row displays as
-- "Ayo Main Hansa #5" on its card. Weeks that don't reach Min Players are
-- deleted (migration 0040) and therefore leave no history — so a skipped week
-- consumes no number: if week 6 falls through, the next successful week is #6,
-- not #7.
--
-- We store the count on the occurrence row itself (`occurrence_number`),
-- assigned once at roll time as (max so far for the series) + 1. Because failed
-- weeks are removed before the next roll, the max only ever counts weeks that
-- happened — so the "+1" naturally reuses the number a skipped week would have
-- taken. The value is set server-side and never edited afterwards.
-- ============================================================================

-- One-time sessions stay null; only weekly occurrences carry a number.
alter table sessions
  add column if not exists occurrence_number int;

-- Backfill existing weekly occurrences: number them per series in start order.
-- Skipped weeks were already deleted, so the rows that remain are exactly the
-- ones that should be counted.
with numbered as (
  select id,
         row_number() over (partition by series_id order by starts_at) as n
  from sessions
  where recurrence = 'weekly'
    and series_id is not null
)
update sessions s
   set occurrence_number = numbered.n
  from numbered
 where numbered.id = s.id;

-- ---------------------------------------------------------------------------
-- roll_weekly_sessions(): same as 0029, but the freshly materialized occurrence
-- now gets the next sequential number for its series. coalesce(max,0)+1 gives 1
-- for the first week and reuses a skipped week's number (its row is gone).
-- ---------------------------------------------------------------------------
create or replace function roll_weekly_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s          weekly_series%rowtype;
  latest     sessions%rowtype;
  need       boolean;
  ref        timestamptz;
  next_start timestamptz;
  next_num   int;
  new_id     uuid;
begin
  perform set_config('bg.skip_limits', 'on', true);   -- transaction-local bypass

  for s in select * from weekly_series for update skip locked loop
    select * into latest
    from sessions
    where series_id = s.id
    order by starts_at desc
    limit 1;

    if not found then
      need := true;
      ref  := now();
    elsif latest.starts_at + make_interval(mins => coalesce(latest.duration_minutes, 180)) <= now() then
      need := true;
      ref  := greatest(now(), latest.starts_at);   -- next slot strictly after both
    else
      need := false;
    end if;

    if need then
      next_start := next_weekly_occurrence(s.weekly_day, s.start_time, ref);

      -- Next number = highest week so far + 1. Deleted (skipped) weeks don't
      -- count toward the max, so their number is reused by the next success.
      select coalesce(max(occurrence_number), 0) + 1 into next_num
      from sessions where series_id = s.id;

      insert into sessions (host_id, title, starts_at, region, area,
                            min_players, max_players, duration_minutes,
                            board_games, session_type, recurrence, series_id,
                            occurrence_number)
      values (s.host_id, s.title, next_start, s.region, s.area,
              s.min_players, s.max_players, s.duration_minutes,
              '', s.session_type, 'weekly', s.id,
              next_num)
      returning id into new_id;

      insert into session_addresses (session_id, full_address, maps_url)
      values (new_id, s.full_address, s.maps_url);

      -- carry co-hosts forward as APPROVED participants
      insert into join_requests (session_id, guest_id, status, message)
      select new_id, c.user_id, 'approved', ''
      from weekly_cohosts c
      where c.series_id = s.id;
    end if;
  end loop;
end;
$$;

grant execute on function roll_weekly_sessions() to authenticated;
