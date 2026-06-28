-- ============================================================================
-- BG Session — migration 0058: guest (anon) read access to public reference data
--
-- Visitors who haven't signed in can now browse the app's PUBLIC content: the
-- Browse session list, a read-only view of each session (host + participants),
-- and the board-game pages (including who favorites / owns a game).
--
-- `sessions` and `profiles` stay fully closed to anon — guests never read those
-- tables directly. Instead, every member-facing field a guest sees is served by
-- a narrow SECURITY DEFINER function that returns ONLY public display columns
-- (nickname, display_name, avatar_url) in a specific context (a session, a
-- game). So there is no member enumeration, no search, no profile-page access,
-- and never any private data (real name, photo, address) — guests just see the
-- same public display info that already shows on a card, but can't click through
-- to a profile. Functions (not SECURITY DEFINER views) keep Supabase's linter
-- happy, mirroring the existing get_session_preview pattern (migration 0044).
--
-- The rest of what this opens to anon is pure catalog / reference data plus the
-- (already security-definer) RPC that backs the Browse game filter:
--   * board_games — the game catalog (names, category, BGG link)
--   * regions / areas — the location reference list (Browse filters)
--   * upcoming_game_options(text, text) — distinct game names in upcoming
--     sessions (definer, pinned search_path, returns only public strings)
--
-- Everything else (addresses, chat, join requests, ratings, private profile
-- fields) remains closed to anon.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 0a) Guest Browse list. SECURITY DEFINER so it can read `sessions` while that
--     table stays closed to anon. Returns the public listing columns the Browse
--     cards use, with the host's PUBLIC display fields (no address, no private
--     data). Callers apply the upcoming / region / area / game filters and
--     pagination on top (PostgREST horizontal filtering over a set-returning
--     function), exactly as the signed-in path does over the `sessions` table.
-- ---------------------------------------------------------------------------
create or replace function public.list_public_sessions()
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
  join public.profiles p on p.id = s.host_id;
$$;

revoke all on function public.list_public_sessions() from public;
grant execute on function public.list_public_sessions() to anon, authenticated;

comment on function public.list_public_sessions() is
  'Anon-readable public listing fields (+ host display) for the guest Browse list. No address, no private data. See migration 0058.';

-- ---------------------------------------------------------------------------
-- 0b) Guest single-session detail. Same public listing columns + the host's
--     public display fields, for one session by id. No address, no private data.
-- ---------------------------------------------------------------------------
create or replace function public.get_public_session(p_id uuid)
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
  series_id         uuid,
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
    s.series_id,
    p.nickname     as host_nickname,
    p.display_name as host_display_name,
    p.avatar_url   as host_avatar_url
  from public.sessions s
  join public.profiles p on p.id = s.host_id
  where s.id = p_id;
$$;

revoke all on function public.get_public_session(uuid) from public;
grant execute on function public.get_public_session(uuid) to anon, authenticated;

comment on function public.get_public_session(uuid) is
  'Anon-readable public detail (+ host display) for one session. No address, no private data. See migration 0058.';

-- ---------------------------------------------------------------------------
-- 0c) Guest participant list for a session: the host + approved guests, PUBLIC
--     display fields only (never real_name / photo — those stay between
--     confirmed participants via profile_private RLS).
-- ---------------------------------------------------------------------------
create or replace function public.get_public_participants(p_session_id uuid)
returns table (
  id           uuid,
  nickname     text,
  display_name text,
  avatar_url   text,
  is_host      boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select p.id, p.nickname, p.display_name, p.avatar_url, true as is_host
  from public.sessions s
  join public.profiles p on p.id = s.host_id
  where s.id = p_session_id
  union
  select p.id, p.nickname, p.display_name, p.avatar_url, false as is_host
  from public.join_requests jr
  join public.profiles p on p.id = jr.guest_id
  where jr.session_id = p_session_id
    and jr.status = 'approved';
$$;

revoke all on function public.get_public_participants(uuid) from public;
grant execute on function public.get_public_participants(uuid) to anon, authenticated;

comment on function public.get_public_participants(uuid) is
  'Anon-readable confirmed participants (host + approved) for a session, public display fields only. See migration 0058.';

-- ---------------------------------------------------------------------------
-- 0d) Guest game-page members: who favorites / owns a given game, PUBLIC
--     display fields only. Exact game-name match, mirroring the signed-in
--     `profiles.contains(favorite_games, [name])` query.
-- ---------------------------------------------------------------------------
create or replace function public.get_game_members(p_game text)
returns table (
  id           uuid,
  nickname     text,
  display_name text,
  avatar_url   text,
  is_favorite  boolean,
  is_owned     boolean
)
language sql
security definer
set search_path = ''
stable
as $$
  select
    p.id, p.nickname, p.display_name, p.avatar_url,
    (p_game = any(p.favorite_games)) as is_favorite,
    (p_game = any(p.owned_games))    as is_owned
  from public.profiles p
  where p_game = any(p.favorite_games)
     or p_game = any(p.owned_games);
$$;

revoke all on function public.get_game_members(text) from public;
grant execute on function public.get_game_members(text) to anon, authenticated;

comment on function public.get_game_members(text) is
  'Anon-readable members who favorite/own a game, public display fields only. See migration 0058.';

-- ---------------------------------------------------------------------------
-- 1) Board game catalog — readable by anyone (it's public reference data).
-- ---------------------------------------------------------------------------
drop policy if exists "board_games_read_anon" on board_games;
create policy "board_games_read_anon" on board_games
  for select to anon using (true);

-- ---------------------------------------------------------------------------
-- 2) Regions + areas — the location reference list behind the Browse filters.
-- ---------------------------------------------------------------------------
drop policy if exists "regions_read_anon" on regions;
create policy "regions_read_anon" on regions
  for select to anon using (true);

drop policy if exists "areas_read_anon" on areas;
create policy "areas_read_anon" on areas
  for select to anon using (true);

-- ---------------------------------------------------------------------------
-- 3) Browse game-filter dropdown. The RPC is security definer with a pinned
--    search_path and returns only distinct game-name strings from upcoming
--    sessions — safe to expose to anon. (0050 had revoked it from anon.)
-- ---------------------------------------------------------------------------
grant execute on function public.upcoming_game_options(text, text) to anon;
