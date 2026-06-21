-- ============================================================================
-- BG Session — migration 0031: weekly-aware history + auto-cancel
--
-- 1) cancel_understaffed_sessions(): weekly occurrences must NEVER be auto-
--    deleted for low attendance — they roll forward instead. Restrict the
--    auto-cancel to one-time sessions.
-- 2) user_session_history(): expose `recurrence` so a player's profile can tag
--    each past session "One-time" / "Weekly". Each weekly week is its own
--    finished `sessions` row, so it already appears here automatically — we just
--    add the tag column. (CREATE OR REPLACE can't change the return signature,
--    so drop first, per the 0022 precedent.)
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Auto-cancel only one-time sessions
-- ---------------------------------------------------------------------------
create or replace function cancel_understaffed_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  doomed uuid[];
begin
  select coalesce(array_agg(id), '{}') into doomed
  from (
    select id
    from sessions
    where starts_at <= now()
      and confirmed_count + 1 < min_players   -- +1 for the host
      and recurrence = 'one_time'             -- weekly occurrences roll forward instead
    for update skip locked
  ) d;

  if array_length(doomed, 1) is null then
    return;
  end if;

  insert into notifications (user_id, type, title, body, session_id)
  select r.uid,
         'session_canceled',
         'Canceled: "' || r.title || '"',
         'This session was canceled because it didn''t reach its minimum of '
           || r.min_players || ' players by the start time.',
         null
  from (
    select s.id, s.title, s.min_players, s.host_id as uid
    from sessions s
    where s.id = any(doomed)
    union
    select s.id, s.title, s.min_players, j.guest_id
    from sessions s
    join join_requests j on j.session_id = s.id and j.status = 'approved'
    where s.id = any(doomed)
  ) r;

  delete from sessions where id = any(doomed);
end;
$$;

grant execute on function cancel_understaffed_sessions() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Add recurrence to public session history
-- ---------------------------------------------------------------------------
drop function if exists user_session_history(uuid);

create function user_session_history(uid uuid)
returns table (
  id               uuid,
  title            text,
  starts_at        timestamptz,
  duration_minutes int,
  area             text,
  confirmed_count  int,
  max_players      int,
  role             text,
  recurrence       text,
  avg_rating       numeric,
  rating_count     int
)
language sql
security definer
set search_path = public
stable
as $$
  -- Sessions this user hosted.
  select s.id, s.title, s.starts_at, s.duration_minutes, s.area,
         s.confirmed_count, s.max_players, 'Host'::text, s.recurrence,
         (select round(avg(r.rating)::numeric, 1) from session_ratings r where r.session_id = s.id),
         (select count(*)::int from session_ratings r where r.session_id = s.id)
  from sessions s
  where s.host_id = uid
    and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) < now()
  union all
  -- Sessions this user joined and was approved for (includes co-host weeks).
  select s.id, s.title, s.starts_at, s.duration_minutes, s.area,
         s.confirmed_count, s.max_players, 'Participant'::text, s.recurrence,
         (select round(avg(r.rating)::numeric, 1) from session_ratings r where r.session_id = s.id),
         (select count(*)::int from session_ratings r where r.session_id = s.id)
  from join_requests j
  join sessions s on s.id = j.session_id
  where j.guest_id = uid
    and j.status = 'approved'
    and s.host_id <> uid
    and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) < now()
  order by starts_at desc;
$$;

grant execute on function user_session_history(uuid) to authenticated;
