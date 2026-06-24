-- ============================================================================
-- BG Session — migration 0056: close the transfer_weekly_host anon bypass +
--                              tidy the game-score RPC grants
--
-- Two leftover items the Security Advisor flagged as "Public Can Execute":
--
-- 1) transfer_weekly_host (0040) — REAL auth bypass for the anon role.
--    Its only guard is `if v_host <> auth.uid() then raise ...`. For an
--    unauthenticated (anon-key) caller auth.uid() is NULL, so `v_host <> NULL`
--    evaluates to NULL, and PL/pgSQL treats a NULL IF-condition as false — the
--    "only the host can transfer" exception is never raised. anon still holds
--    the default EXECUTE grant (0040 only added a grant, never revoked anon), so
--    an anon caller who supplies a valid series id + an approved participant's id
--    could forcibly hand off a weekly host role. Fix: an explicit
--    `auth.uid() is null` guard as the very first statement, and revoke anon.
--    (The rest of the body is reproduced verbatim from 0040.)
--
-- 2) start_/submit_/delete_game_play (0046) — NOT exploitable (each opens with
--    `if v_uid is null then raise 'Not authenticated'`), but 0046 only revoked
--    `public`, leaving anon's explicit default grant in place — exactly the gap
--    0036 documented. Revoke anon so the advisor stops flagging them.
--
-- Re-runnable (create-or-replace + idempotent REVOKE/GRANT).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) transfer_weekly_host — add the auth.uid() IS NULL guard.
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
  -- Hard stop for the anon role: auth.uid() is NULL there, which would make the
  -- `v_host <> auth.uid()` host check below evaluate to NULL (treated as false)
  -- and silently pass. Reject before touching any data.
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

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

-- ---------------------------------------------------------------------------
-- 2) Drop the residual anon EXECUTE grants. authenticated (+ service_role)
--    keep theirs — these RPCs must stay callable by logged-in users, and each
--    verifies auth.uid() internally.
-- ---------------------------------------------------------------------------
revoke execute on function transfer_weekly_host(uuid, uuid) from anon, public;

revoke execute on function start_game_play(uuid, text)  from anon;
revoke execute on function submit_game_play(uuid, game_score_mode, boolean, boolean, jsonb, jsonb) from anon;
revoke execute on function delete_game_play(uuid)       from anon;
