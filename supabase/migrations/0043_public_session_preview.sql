-- ============================================================================
-- BG Session — migration 0043: public session preview (rich link sharing)
--
-- When a participant shares a session link, chat apps (Telegram, WhatsApp, …)
-- fetch the page with an anonymous crawler that DOESN'T run JavaScript, so a
-- Vercel function renders the Open Graph "sneak peek" card server-side. To do
-- that it must read a session's PUBLIC listing fields with no logged-in user.
--
-- `sessions` RLS is `to authenticated`, so anon can't read it directly. This
-- view exposes a narrow, read-only slice — only the fields any signed-in user
-- already sees while browsing — joined to the host's public profile. The full
-- address lives in `session_addresses` and is never selected here, so it stays
-- protected exactly as before.
--
-- The view is deliberately NOT security_invoker: it runs with the definer's
-- rights so anon can read these specific columns without opening a blanket anon
-- policy on the base tables. Only the safe columns below are ever exposed.
-- ============================================================================

create or replace view public_session_preview
with (security_invoker = false) as
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
  p.display_name as host_name,
  p.avatar_url   as host_avatar
from sessions s
join profiles p on p.id = s.host_id;

-- Read-only, and only to the anonymous role (the preview function uses the anon
-- key). Signed-in users keep reading `sessions` directly through RLS.
revoke all on public_session_preview from anon;
grant select on public_session_preview to anon;

comment on view public_session_preview is
  'Anon-readable public listing fields for share/link-preview cards. No address. See migration 0043.';
