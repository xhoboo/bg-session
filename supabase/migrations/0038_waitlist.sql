-- ============================================================================
-- BG Session — migration 0038: session waitlist
--
-- Before this, requesting to join a FULL open session raised "This session is
-- full" and the request never landed. Now a full session queues the request as
-- 'waitlisted' instead:
--
--   * OPEN sessions auto-fill from the waitlist (FIFO) the moment a confirmed
--     guest drops out or the host raises max_players. The promoted guest is
--     notified and the address unlocks for them — no host action needed.
--   * APPROVAL sessions keep the host in control: waitlisted requests show up in
--     the host's request list, and the host approves them when a spot frees
--     (the normal approve path, which sends the usual "approved" notification).
--
-- A waitlisted request is NOT a participant: is_session_participant /
-- shares_confirmed_session still key off status='approved', so waitlisters don't
-- see the address, private profiles, or session chat until they're promoted.
--
-- Re-runnable.
-- ============================================================================

-- New request status. (Used only at runtime by the functions/triggers below,
-- which never execute during this migration, so adding + referencing the value
-- here is safe — same pattern as the notification_type additions in 0011/0014.)
alter type request_status add value if not exists 'waitlisted';

-- ---------------------------------------------------------------------------
-- Insert: a full session queues the request instead of rejecting it. Privileged
-- inserts (weekly roll / co-hosts, via bg.skip_limits) keep their given status.
-- ---------------------------------------------------------------------------
create or replace function set_request_status_on_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s_type session_type;
  cap    int;
  taken  int;
begin
  if coalesce(current_setting('bg.skip_limits', true), '') = 'on' then
    return new;   -- privileged insert: keep status as given
  end if;

  select session_type, max_players, confirmed_count
    into s_type, cap, taken
    from sessions where id = new.session_id;

  if taken + 1 >= cap then          -- +1 for the host: session is full
    new.status := 'waitlisted';
  elsif s_type = 'open' then
    new.status := 'approved';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- notify_on_request_update: re-created from 0001 with a bg.skip_limits guard so
-- the waitlist auto-promote below can send its own, clearer notification instead
-- of the generic "the host approved your request".
-- ---------------------------------------------------------------------------
create or replace function notify_on_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s_title text;
begin
  if new.status = old.status then
    return new;
  end if;
  if coalesce(current_setting('bg.skip_limits', true), '') = 'on' then
    return new;   -- auto-promote handles its own notification
  end if;

  select title into s_title from sessions where id = new.session_id;

  if new.status = 'approved' then
    insert into notifications (user_id, type, title, body, session_id, request_id)
    values (
      new.guest_id,
      'join_approved',
      'Approved for "' || s_title || '"',
      'The host approved your request. The full address is now visible to you.',
      new.session_id,
      new.id
    );
  elsif new.status = 'rejected' then
    insert into notifications (user_id, type, title, body, session_id, request_id)
    values (
      new.guest_id,
      'join_rejected',
      'Request declined for "' || s_title || '"',
      'The host was unable to approve your request this time.',
      new.session_id,
      new.id
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- promote_from_waitlist(): fill open guest spots from the waitlist, oldest
-- first. Only OPEN sessions auto-fill; approval sessions are left to the host.
-- ---------------------------------------------------------------------------
create or replace function promote_from_waitlist(p_session_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s_type  session_type;
  s_title text;
  cap     int;
  taken   int;
  room    int;
  r       record;
begin
  select session_type, title, max_players, confirmed_count
    into s_type, s_title, cap, taken
    from sessions where id = p_session_id for update;
  if not found or s_type <> 'open' then
    return;
  end if;

  room := (cap - 1) - taken;        -- open guest spots (host occupies one)
  if room <= 0 then
    return;
  end if;

  -- Silence notify_on_request_update for these promotions; we send a tailored
  -- "a spot opened" notice ourselves. set_config(..., true) is txn-local.
  perform set_config('bg.skip_limits', 'on', true);

  for r in
    select id, guest_id
    from join_requests
    where session_id = p_session_id and status = 'waitlisted'
    order by created_at asc
    limit room
  loop
    -- BEFORE-UPDATE capacity guard still applies (room exists, so it passes);
    -- AFTER-UPDATE sync keeps confirmed_count correct.
    update join_requests set status = 'approved' where id = r.id;
    insert into notifications (user_id, type, title, body, session_id, request_id)
    values (
      r.guest_id,
      'join_confirmed',
      'A spot opened — you are confirmed for "' || s_title || '"',
      'Someone left this session, so you are in. The full address is now visible to you.',
      p_session_id,
      r.id
    );
  end loop;
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger: a confirmed guest leaving (approve -> not approved, or an approved
-- row deleted) frees a spot. Fires AFTER sync_confirmed_count (alphabetical
-- trigger order: trg_sync_confirmed_count < trg_waitlist_promote) so the count
-- is already decremented when we compute the open room.
--
-- Gated on OLD.status='approved' so the promotions it makes (waitlisted ->
-- approved) don't re-fire it: no recursion.
-- ---------------------------------------------------------------------------
create or replace function promote_waitlist_on_vacancy()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'approved' then
      perform promote_from_waitlist(old.session_id);
    end if;
    return old;
  else
    if old.status = 'approved' and new.status <> 'approved' then
      perform promote_from_waitlist(new.session_id);
    end if;
    return new;
  end if;
end;
$$;

drop trigger if exists trg_waitlist_promote on join_requests;
create trigger trg_waitlist_promote
  after update or delete on join_requests
  for each row execute function promote_waitlist_on_vacancy();

-- ---------------------------------------------------------------------------
-- Trigger: the host raising max_players opens spots too.
-- ---------------------------------------------------------------------------
create or replace function promote_waitlist_on_capacity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.max_players > old.max_players then
    perform promote_from_waitlist(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_waitlist_promote_capacity on sessions;
create trigger trg_waitlist_promote_capacity
  after update on sessions
  for each row execute function promote_waitlist_on_capacity();

-- ---------------------------------------------------------------------------
-- Privilege hygiene (see 0034/0036): these run as triggers / via the definer
-- context, so no client role needs EXECUTE.
-- ---------------------------------------------------------------------------
revoke execute on function public.promote_from_waitlist(uuid)      from public, anon, authenticated;
revoke execute on function public.promote_waitlist_on_vacancy()    from public, anon, authenticated;
revoke execute on function public.promote_waitlist_on_capacity()   from public, anon, authenticated;
