-- ============================================================================
-- BG Session — migration 0012: public session-participation history
--
-- A player's profile should list the finished sessions they took part in — both
-- HOSTED and JOINED (approved) — for anyone viewing the profile. Hosted sessions
-- are already public (sessions table), but "who joined which session" lives in
-- join_requests behind RLS. This SECURITY DEFINER function exposes ONLY the
-- public session fields plus a role label, for finished sessions, without
-- leaking any private column (e.g. the guest's join message).
--
-- "Finished" = start + duration (defaulting to 180 minutes), matching
-- lib/format.js and migration 0011.
-- ============================================================================

create or replace function user_session_history(uid uuid)
returns table (
  id               uuid,
  title            text,
  starts_at        timestamptz,
  duration_minutes int,
  area             text,
  confirmed_count  int,
  max_players      int,
  role             text
)
language sql
security definer
set search_path = public
stable
as $$
  -- Sessions this user hosted.
  select s.id, s.title, s.starts_at, s.duration_minutes, s.area,
         s.confirmed_count, s.max_players, 'Host'::text
  from sessions s
  where s.host_id = uid
    and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) < now()
  union all
  -- Sessions this user joined and was approved for.
  select s.id, s.title, s.starts_at, s.duration_minutes, s.area,
         s.confirmed_count, s.max_players, 'Participant'::text
  from join_requests j
  join sessions s on s.id = j.session_id
  where j.guest_id = uid
    and j.status = 'approved'
    and s.host_id <> uid
    and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) < now()
  order by starts_at desc;
$$;

grant execute on function user_session_history(uuid) to authenticated;
