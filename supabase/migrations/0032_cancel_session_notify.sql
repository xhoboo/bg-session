-- ============================================================================
-- BG Session — migration 0032: notify confirmed guests on manual cancellation
--
-- Until now a host cancelling a session just deleted the row (the UI even said
-- "notifies no one"). The understaffed auto-cancel (0018) DOES notify, but a
-- deliberate host cancel didn't. This SECURITY DEFINER RPC notifies every
-- approved guest (which includes weekly co-hosts) BEFORE deleting — the
-- notification is written with a null session_id so it survives the cascade,
-- exactly like cancel_understaffed_sessions(). The email Edge Function then
-- delivers it like any other notification.
--
-- For a weekly occurrence it also deletes the series so it stops repeating; past
-- occurrences keep their rows (series_id becomes null via ON DELETE SET NULL),
-- so history is preserved.
-- ============================================================================

create or replace function cancel_session(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host   uuid;
  v_title  text;
  v_series uuid;
begin
  select host_id, title, series_id into v_host, v_title, v_series
  from sessions where id = p_session_id;

  if v_host is null then raise exception 'Session not found.'; end if;
  if v_host <> auth.uid() then raise exception 'Only the host can cancel this session.'; end if;

  insert into notifications (user_id, type, title, body, session_id)
  select j.guest_id,
         'session_canceled',
         'Canceled: "' || v_title || '"',
         case when v_series is not null
              then 'The host ended this weekly session.'
              else 'The host canceled this session.' end,
         null
  from join_requests j
  where j.session_id = p_session_id and j.status = 'approved';

  delete from sessions where id = p_session_id;

  if v_series is not null then
    delete from weekly_series where id = v_series and host_id = auth.uid();
  end if;
end;
$$;

grant execute on function cancel_session(uuid) to authenticated;
