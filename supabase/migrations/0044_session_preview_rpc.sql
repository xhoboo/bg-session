-- ============================================================================
-- BG Session — migration 0044: session preview via SECURITY DEFINER function
--
-- Replaces the `public_session_preview` view (migration 0043) with an RPC.
--
-- Supabase's linter flags every SECURITY DEFINER *view* as CRITICAL because it
-- can't tell an intentional, locked-down RLS bypass from an accidental one. Our
-- view was intentional: it let anonymous link-preview crawlers read a narrow,
-- address-free slice of a session without opening a blanket anon policy on the
-- base tables. A SECURITY DEFINER *function* with a pinned search_path is the
-- idiomatic Supabase way to expose exactly that — same data, same anon-only
-- grant, but the linter is satisfied and `sessions` stays fully closed to anon.
--
-- The RPC also requires a specific session id (the share link's UUID), so anon
-- can no longer enumerate every session the way `select * from <view>` allowed.
--
-- Returns only the safe public listing columns: no address (that lives in
-- session_addresses and is never touched here) and no host identity — the
-- preview card intentionally omits the host, so we don't even join `profiles`.
-- ============================================================================

-- The view this replaces (migration 0043).
drop view if exists public.public_session_preview;

-- Idempotent: the OUT columns below differ from any earlier draft of this
-- function, and `create or replace` can't change a function's return shape.
drop function if exists public.get_session_preview(uuid);

create function public.get_session_preview(p_id uuid)
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
  occurrence_number int
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
    s.occurrence_number
  from public.sessions s
  where s.id = p_id;
$$;

-- Anon (the preview functions use the anon key) is the only caller. Signed-in
-- users keep reading `sessions` directly through RLS, so strip the default
-- PUBLIC execute and grant only to anon.
revoke all on function public.get_session_preview(uuid) from public;
grant execute on function public.get_session_preview(uuid) to anon;

comment on function public.get_session_preview(uuid) is
  'Anon-readable public listing fields for share/link-preview cards. No address, no host identity. Replaces the 0043 view. See migration 0044.';
