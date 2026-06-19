-- ============================================================================
-- BG Session — migration 0018: auto-cancel under-staffed sessions
--
-- If a session reaches its start time without enough confirmed players (host +
-- approved guests < min_players), it counts as CANCELED: we notify everyone who
-- was coming, then delete it outright. Every foreign key into sessions is
-- ON DELETE CASCADE (addresses, join_requests, session_messages, session_ratings,
-- notifications), so the delete leaves no trace of the session itself.
--
-- The cancellation notifications are inserted with a NULL session_id precisely
-- so they SURVIVE the cascade — recipients still get told why it's gone. The
-- email trigger delivers them like any other notification.
--
-- Concurrency-safe: the under-staffed sessions are claimed with FOR UPDATE SKIP
-- LOCKED, so if two clients run the cleanup at once, each session is processed
-- (and its recipients notified) exactly once — never twice.
--
-- No new players can join after a session starts (the join UI is gated on
-- "not started"), so the confirmed count is final at start time. SECURITY
-- DEFINER so it can act on any session; the client calls it on load (Browse),
-- like the other on-demand maintenance RPCs. Safe to re-run.
-- ============================================================================

-- New notification type. Only *used* at runtime by the function below, never in
-- this migration, so adding it here is safe.
alter type notification_type add value if not exists 'session_canceled';

create or replace function cancel_understaffed_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  doomed uuid[];
begin
  -- 1) Claim the under-staffed sessions with a row lock and capture their ids.
  --    SKIP LOCKED means a concurrent cleanup won't pick up rows this call is
  --    already handling, so nobody is notified twice.
  select coalesce(array_agg(id), '{}') into doomed
  from (
    select id
    from sessions
    where starts_at <= now() and confirmed_count + 1 < min_players   -- +1 for the host
    for update skip locked
  ) d;

  if array_length(doomed, 1) is null then
    return;   -- nothing to cancel
  end if;

  -- 2) Notify the host + approved guests BEFORE deleting (join_requests still
  --    exist). session_id is left null so the notification survives the cascade.
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

  -- 3) Delete the claimed sessions (cascade removes addresses, requests,
  --    messages, ratings and any session-linked notifications).
  delete from sessions where id = any(doomed);
end;
$$;

grant execute on function cancel_understaffed_sessions() to authenticated;
