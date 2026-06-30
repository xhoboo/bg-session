-- ============================================================================
-- BG Session — migration 0062: public session history (ratings + recent feed)
--
-- Three changes that open a session's PUBLIC history a little wider:
--
--   1) Ratings & reviews of a finished session are no longer private to its
--      participants — any signed-in member can now read them, so the
--      Ratings & Reviews block shows on every session detail page, not just the
--      ones you took part in. (Writing a rating stays participant-only.)
--
--   2) Guests (anon) get a read-only, NAME-MASKED view of the same ratings via a
--      SECURITY DEFINER function: the rating, the review text, and the reviewer's
--      nickname censored to its first letter (e.g. "A*****"). No user id, no
--      avatar, no way back to a profile.
--
--   3) Guests get a "recent sessions" feed — the 20 most recently FINISHED
--      sessions (any host, any participants) — through another SECURITY DEFINER
--      function, so the guest Sessions tab can show past meetups.
--
-- As elsewhere, `sessions` / `profiles` stay closed to anon; guests only ever
-- read the narrow public columns these functions return. See migration 0058 for
-- the matching guest-read pattern.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Ratings & reviews readable by any signed-in member (not just participants).
--    Insert/update/delete policies are untouched, so only a participant can
--    still create or change their own rating. The numbers stay anonymous in the
--    UI (only the average is shown); reviews remain attributed to their writer.
-- ---------------------------------------------------------------------------
drop policy if exists "ratings_select_participants" on session_ratings;
drop policy if exists "ratings_select_authenticated" on session_ratings;
create policy "ratings_select_authenticated"
  on session_ratings for select to authenticated
  using (true);

-- ---------------------------------------------------------------------------
-- 2) Guest (anon) ratings view — masked reviewer names. First letter kept, the
--    rest replaced with asterisks; empty/blank names fall back to "Player".
-- ---------------------------------------------------------------------------
create or replace function public.get_public_session_ratings(p_session_id uuid)
returns table (
  rating      int,
  review      text,
  masked_name text,
  created_at  timestamptz
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    r.rating,
    r.review,
    case
      when coalesce(nullif(trim(p.nickname), ''), nullif(trim(p.display_name), '')) is null
        then 'Player'
      else
        left(coalesce(nullif(trim(p.nickname), ''), trim(p.display_name)), 1)
        || repeat('*', greatest(char_length(coalesce(nullif(trim(p.nickname), ''), trim(p.display_name))) - 1, 0))
    end as masked_name,
    r.created_at
  from public.session_ratings r
  join public.profiles p on p.id = r.user_id
  where r.session_id = p_session_id
  order by r.created_at desc;
$$;

revoke all on function public.get_public_session_ratings(uuid) from public;
grant execute on function public.get_public_session_ratings(uuid) to anon, authenticated;

comment on function public.get_public_session_ratings(uuid) is
  'Anon-readable ratings/reviews for a session with the reviewer name masked to its first letter (A*****). No user id, no avatar. See migration 0062.';

-- ---------------------------------------------------------------------------
-- 3) Guest "recent sessions" feed — the 20 most recently finished sessions,
--    public listing columns + host display fields (mirrors get_public_session).
--    "Finished" = start + (duration or 3h fallback) is in the past, matching
--    isSessionFinished() on the client.
-- ---------------------------------------------------------------------------
create or replace function public.list_recent_finished_sessions()
returns table (
  id                uuid,
  title             text,
  starts_at         timestamptz,
  duration_minutes  int,
  region            text,
  area              text,
  board_games       text,
  session_type      public.session_type,
  min_players       int,
  max_players       int,
  confirmed_count   int,
  recurrence        text,
  occurrence_number int,
  host_nickname     text,
  host_display_name text,
  host_avatar_url   text
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    s.id,
    s.title,
    s.starts_at,
    s.duration_minutes,
    s.region,
    s.area,
    s.board_games,
    s.session_type,
    s.min_players,
    s.max_players,
    s.confirmed_count,
    s.recurrence,
    s.occurrence_number,
    p.nickname     as host_nickname,
    p.display_name as host_display_name,
    p.avatar_url   as host_avatar_url
  from public.sessions s
  join public.profiles p on p.id = s.host_id
  where s.starts_at + (coalesce(s.duration_minutes, 180) || ' minutes')::interval < now()
  order by s.starts_at + (coalesce(s.duration_minutes, 180) || ' minutes')::interval desc
  limit 20;
$$;

revoke all on function public.list_recent_finished_sessions() from public;
grant execute on function public.list_recent_finished_sessions() to anon, authenticated;

comment on function public.list_recent_finished_sessions() is
  'Anon-readable feed of the 20 most recently finished sessions (+ host display). No address, no private data. See migration 0062.';
