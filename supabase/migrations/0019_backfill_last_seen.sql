-- ============================================================================
-- BG Session — migration 0019: backfill profiles.last_seen_at
--
-- last_seen_at (added in 0013) is only stamped when a member is active in the
-- app, so every account that hasn't opened the app since 0013 shipped reads a
-- bare "Offline" with no "last seen" time — even accounts that were clearly
-- active before. This one-off backfill seeds a sensible value for those rows
-- from the account's most recent recorded activity (sessions hosted, join
-- requests, chat messages, ratings), falling back to when the profile was
-- created.
--
-- It's an approximation: a plain sign-in leaves no row of its own, so the value
-- is a lower bound ("seen at least this recently"), not the exact last visit.
-- But it's honest and far better than a blank "Offline", and it self-corrects
-- the next time the member is active (the client now re-stamps on activity).
-- Idempotent: only fills rows where last_seen_at is still null.
-- ============================================================================

with activity as (
  select id, max(ts) as seen
  from (
    select host_id   as id, greatest(created_at, updated_at) as ts from sessions
    union all
    select guest_id,        greatest(created_at, updated_at)        from join_requests
    union all
    select user_id,         created_at                              from session_ratings
    union all
    select sender_id,       created_at                              from direct_messages
    union all
    select user_id,         created_at                              from session_messages
  ) acts
  group by id
)
update profiles p
set last_seen_at = coalesce(a.seen, src.created_at)
from profiles src
left join activity a on a.id = src.id
where p.id = src.id
  and p.last_seen_at is null;
