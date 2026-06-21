-- ============================================================================
-- BG Session — migration 0040: transferable host + delete under-staffed weeks
--
-- 1) cancel_understaffed_sessions(): until now weekly occurrences were EXEMPT
--    from the under-min auto-cancel (migration 0031 made them roll forward
--    regardless of attendance). Product decision: a weekly week that doesn't
--    reach Min Players by its start time should be treated like a failed one-time
--    session — notify everyone coming, then delete it, so that week leaves no
--    history. The series still continues: after deleting a weekly occurrence we
--    re-run roll_weekly_sessions() so the next week is materialized immediately
--    (the two maintenance RPCs are fired un-awaited on Browse and run as separate
--    pg_cron jobs, so we can't rely on ordering — re-rolling here closes the gap).
--
-- 2) transfer_weekly_host(): let a weekly host hand the session to a confirmed
--    participant. Weekly only (per decision). The new host must not already own a
--    weekly series (weekly_series has unique(host_id)) and must be an approved
--    participant of a not-yet-finished occurrence. The old host stays on as a
--    regular approved participant.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) Auto-cancel one-time AND under-staffed weekly occurrences
-- ---------------------------------------------------------------------------
create or replace function cancel_understaffed_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  doomed     uuid[];
  had_weekly boolean;
begin
  -- Claim every session (one-time or weekly) that reached its start time without
  -- enough confirmed players. FOR UPDATE SKIP LOCKED so a concurrent cleanup
  -- never double-processes a row.
  select coalesce(array_agg(id), '{}') into doomed
  from (
    select id
    from sessions
    where starts_at <= now()
      and confirmed_count + 1 < min_players   -- +1 for the host
    for update skip locked
  ) d;

  if array_length(doomed, 1) is null then
    return;   -- nothing to cancel
  end if;

  -- Note whether any claimed row was a weekly occurrence (decides the re-roll).
  select exists (
    select 1 from sessions where id = any(doomed) and recurrence = 'weekly'
  ) into had_weekly;

  -- Notify host + approved guests BEFORE deleting (join_requests still exist).
  -- session_id is left null so the notification survives the FK cascade.
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

  -- Delete the claimed sessions (cascade clears addresses, requests, messages,
  -- ratings and any session-linked notifications).
  delete from sessions where id = any(doomed);

  -- If we removed a weekly week, regenerate the next occurrence right away so the
  -- series never sits without an upcoming session.
  if had_weekly then
    perform roll_weekly_sessions();
  end if;
end;
$$;

grant execute on function cancel_understaffed_sessions() to authenticated;

-- ---------------------------------------------------------------------------
-- 2) Transfer a weekly session to a confirmed participant (weekly only)
--
-- SECURITY DEFINER: changing sessions.host_id would fail the sessions UPDATE
-- with-check (new host_id <> auth.uid()), and the host can't insert/delete
-- another user's join_request under RLS. The bg.skip_limits GUC bypasses the
-- co-host edit guard + the request status/notify triggers; sync_confirmed_count
-- still runs (the delete + insert net to zero, so capacity is preserved).
-- ---------------------------------------------------------------------------
create or replace function transfer_weekly_host(p_series_id uuid, p_new_host_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host  uuid;
  v_title text;
  occ     uuid;
begin
  select host_id, title into v_host, v_title from weekly_series where id = p_series_id;
  if v_host is null then raise exception 'Weekly session not found.'; end if;
  if v_host <> auth.uid() then raise exception 'Only the host can transfer this session.'; end if;
  if p_new_host_id = v_host then raise exception 'That person already hosts this session.'; end if;

  -- One weekly session per host: the new host can't already own a series.
  if exists (select 1 from weekly_series w where w.host_id = p_new_host_id) then
    raise exception 'That person already hosts a weekly session — they can only have one.';
  end if;

  -- The new host must be a confirmed participant of a not-yet-finished occurrence.
  if not exists (
    select 1
    from join_requests j
    join sessions s on s.id = j.session_id
    where s.series_id = p_series_id
      and j.guest_id = p_new_host_id
      and j.status = 'approved'
      and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > now()
  ) then
    raise exception 'You can only transfer hosting to a confirmed participant.';
  end if;

  perform set_config('bg.skip_limits', 'on', true);

  -- Can't be both host and co-host.
  delete from weekly_cohosts where series_id = p_series_id and user_id = p_new_host_id;

  -- Move the template to the new host first, then the live occurrences.
  update weekly_series set host_id = p_new_host_id where id = p_series_id;

  for occ in
    select s.id
    from sessions s
    where s.series_id = p_series_id
      and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > now()
  loop
    update sessions set host_id = p_new_host_id where id = occ;
    -- New host is no longer a guest of their own session.
    delete from join_requests where session_id = occ and guest_id = p_new_host_id;
    -- Old host keeps their spot as an approved participant.
    insert into join_requests (session_id, guest_id, status, message)
    values (occ, v_host, 'approved', '')
    on conflict (session_id, guest_id) do update set status = 'approved';
  end loop;

  -- Tell the new host (null session_id keeps it generic / cascade-proof).
  insert into notifications (user_id, type, title, body, session_id)
  values (
    p_new_host_id,
    'join_confirmed',
    'You are now the host of "' || v_title || '"',
    'The previous host transferred this weekly session to you.',
    null
  );
end;
$$;

grant execute on function transfer_weekly_host(uuid, uuid) to authenticated;
