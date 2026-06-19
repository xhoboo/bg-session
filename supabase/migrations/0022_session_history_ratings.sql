-- ============================================================================
-- BG Session — migration 0022: average rating in public session history
--
-- The session-history cards on a player's profile should show how each finished
-- session was rated. session_ratings is behind RLS (only a session's own
-- participants can read its rows), so a visitor viewing someone else's profile
-- can't aggregate them client-side. We extend the SECURITY DEFINER history
-- function to return the per-session AVERAGE rating (anonymous aggregate) plus a
-- count — individual ratings are never exposed.
--
-- CREATE OR REPLACE can't change a function's return signature, so drop first.
-- ============================================================================

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
         s.confirmed_count, s.max_players, 'Host'::text,
         (select round(avg(r.rating)::numeric, 1) from session_ratings r where r.session_id = s.id),
         (select count(*)::int from session_ratings r where r.session_id = s.id)
  from sessions s
  where s.host_id = uid
    and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) < now()
  union all
  -- Sessions this user joined and was approved for.
  select s.id, s.title, s.starts_at, s.duration_minutes, s.area,
         s.confirmed_count, s.max_players, 'Participant'::text,
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
