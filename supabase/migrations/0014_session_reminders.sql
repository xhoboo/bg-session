-- ============================================================================
-- BG Session — migration 0014: day-before reminders + attendance follow-up
--
-- A single "session_reminder" notification, enqueued on demand for sessions
-- that start within the next 24 hours and that the caller takes part in (host
-- or approved guest). It doubles as a reminder ("starts tomorrow") and an
-- attendance follow-up ("confirm you can make it / tell the group if plans
-- change"). The existing notifications email trigger delivers it like any other
-- notification, so no scheduler is required — mirrors enqueue_rating_reminders
-- in migration 0011. The client calls enqueue_session_reminders() on load.
-- ============================================================================

-- New notification type. Only *used* at runtime by the function below (never
-- within this migration), so adding the value here is safe.
alter type notification_type add value if not exists 'session_reminder';

create or replace function enqueue_session_reminders()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  uid uuid := auth.uid();
begin
  if uid is null then
    return;
  end if;

  insert into notifications (user_id, type, title, body, session_id)
  select
    uid,
    'session_reminder',
    'Tomorrow: "' || s.title || '"',
    'Starts ' || to_char(s.starts_at at time zone 'Asia/Jakarta', 'Dy DD Mon, HH24:MI')
      || ' WIB. Please confirm you can make it — or let the group know in the session chat if your plans change.',
    s.id
  from sessions s
  where s.starts_at > now()
    and s.starts_at <= now() + interval '24 hours'
    and (
      s.host_id = uid
      or exists (
        select 1 from join_requests j
        where j.session_id = s.id and j.guest_id = uid and j.status = 'approved'
      )
    )
    and not exists (
      select 1 from notifications n
      where n.user_id = uid and n.session_id = s.id and n.type = 'session_reminder'
    );
end;
$$;

grant execute on function enqueue_session_reminders() to authenticated;
