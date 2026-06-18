-- ============================================================================
-- BG Session — migration 0011: participant visibility + rating reminders
--
-- 1) Let any confirmed participant (host or approved guest) see the APPROVED
--    join_requests of a session they're in, so guests — not just the host —
--    can see who else is coming. The private "additional info" (real name,
--    gender, in-person photo) is still gated separately by profile_private RLS.
-- 2) A "rate_reminder" notification, enqueued on demand for sessions that have
--    finished and that the caller took part in but hasn't rated yet. The client
--    calls enqueue_rating_reminders() on load; the existing email trigger then
--    delivers it like any other notification. No scheduler required.
--
-- "Finished" = now is at/after starts_at + duration (defaulting to 180 minutes
-- when the host didn't specify one), matching lib/format.js.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Participants can see each other's approved requests
-- ---------------------------------------------------------------------------
drop policy if exists "requests_select_participants" on join_requests;
create policy "requests_select_participants"
  on join_requests for select to authenticated
  using (status = 'approved' and is_session_participant(session_id));

-- ---------------------------------------------------------------------------
-- 2) Rating reminder notifications
-- ---------------------------------------------------------------------------
-- New notification type. (Adding the value here is safe; it is only *used* at
-- runtime when the function below is called, never within this migration.)
alter type notification_type add value if not exists 'rate_reminder';

create or replace function enqueue_rating_reminders()
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
    'rate_reminder',
    'Rate "' || s.title || '"',
    'This session has ended — share a rating and review with the group.',
    s.id
  from sessions s
  where s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) < now()
    -- only recently finished sessions, so first run doesn't flood old ones
    and s.starts_at > now() - interval '30 days'
    and (
      s.host_id = uid
      or exists (
        select 1 from join_requests j
        where j.session_id = s.id and j.guest_id = uid and j.status = 'approved'
      )
    )
    and not exists (
      select 1 from session_ratings r
      where r.session_id = s.id and r.user_id = uid
    )
    and not exists (
      select 1 from notifications n
      where n.user_id = uid and n.session_id = s.id and n.type = 'rate_reminder'
    );
end;
$$;

grant execute on function enqueue_rating_reminders() to authenticated;
