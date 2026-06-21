-- ============================================================================
-- BG Session — migration 0029: weekly roll-forward + co-host management
--
-- roll_weekly_sessions() keeps exactly one upcoming occurrence per weekly_series.
-- Once the current occurrence finishes, the next week's occurrence is created
-- (board games cleared, no guests) and the series' co-hosts are re-added as
-- APPROVED participants. The client calls this on Browse load, alongside the
-- existing on-demand maintenance RPCs (cancel_understaffed_sessions, etc.) — no
-- scheduler required. It also creates the FIRST occurrence right after a series
-- is created.
--
-- Adding co-hosts as APPROVED participants must bypass two existing triggers:
--   * set_request_status_on_insert (0006) would force status='pending' on
--     approval-type sessions, and
--   * notify_on_request_insert (0001) would spam the host on every weekly roll.
-- Both now early-return when the transaction-local GUC bg.skip_limits='on'
-- (also used by enforce_session_limits in 0030 and the co-host edit guards).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Next occurrence datetime: the next `p_day`@`p_time` (Asia/Jakarta wall clock)
-- strictly after `p_ref`. dow: 0=Sun..6=Sat (matches weekly_series.weekly_day).
-- ---------------------------------------------------------------------------
create or replace function next_weekly_occurrence(p_day int, p_time time, p_ref timestamptz)
returns timestamptz
language plpgsql
stable
as $$
declare
  local_ref timestamp;   -- the reference moment as Jakarta wall-clock
  base_date date;
  days_ahead int;
  candidate timestamp;
begin
  local_ref := p_ref at time zone 'Asia/Jakarta';
  base_date := local_ref::date;
  days_ahead := ((p_day - extract(dow from base_date)::int) % 7 + 7) % 7;
  candidate := (base_date + days_ahead) + p_time;   -- date + time = timestamp
  while candidate <= local_ref loop
    candidate := candidate + interval '7 days';
  end loop;
  return candidate at time zone 'Asia/Jakarta';
end;
$$;

-- ---------------------------------------------------------------------------
-- Trigger guards: let privileged (bg.skip_limits) inserts keep their status and
-- stay silent. Bodies are otherwise identical to 0006 / 0001.
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
    return new;   -- privileged insert (e.g. roll adding co-hosts): keep status as given
  end if;

  select session_type, max_players, confirmed_count
    into s_type, cap, taken
    from sessions where id = new.session_id;

  if s_type = 'open' then
    if taken + 1 >= cap then        -- +1 for the host
      raise exception 'This session is full.' using errcode = 'check_violation';
    end if;
    new.status := 'approved';
  else
    new.status := 'pending';
  end if;
  return new;
end;
$$;

create or replace function notify_on_request_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s_host    uuid;
  s_title   text;
  guest_name text;
begin
  if coalesce(current_setting('bg.skip_limits', true), '') = 'on' then
    return new;   -- privileged insert (e.g. roll adding co-hosts): no notifications
  end if;

  select host_id, title into s_host, s_title from sessions where id = new.session_id;
  select coalesce(display_name, 'Someone') into guest_name from profiles where id = new.guest_id;

  insert into notifications (user_id, type, title, body, session_id, request_id)
  values (
    s_host,
    'join_requested',
    case when new.status = 'approved'
         then guest_name || ' joined your session'
         else guest_name || ' wants to join your session' end,
    '"' || s_title || '"' ||
      case when new.message <> '' then ' — ' || new.message else '' end,
    new.session_id,
    new.id
  );

  if new.status = 'approved' then
    insert into notifications (user_id, type, title, body, session_id, request_id)
    values (
      new.guest_id,
      'join_confirmed',
      'You are confirmed for "' || s_title || '"',
      'This is an open session — the host address is now visible to you.',
      new.session_id,
      new.id
    );
  end if;

  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- roll_weekly_sessions(): materialize the next occurrence where needed.
-- ---------------------------------------------------------------------------
create or replace function roll_weekly_sessions()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  s          weekly_series%rowtype;
  latest     sessions%rowtype;
  need       boolean;
  ref        timestamptz;
  next_start timestamptz;
  new_id     uuid;
begin
  perform set_config('bg.skip_limits', 'on', true);   -- transaction-local bypass

  for s in select * from weekly_series for update skip locked loop
    select * into latest
    from sessions
    where series_id = s.id
    order by starts_at desc
    limit 1;

    if not found then
      need := true;
      ref  := now();
    elsif latest.starts_at + make_interval(mins => coalesce(latest.duration_minutes, 180)) <= now() then
      need := true;
      ref  := greatest(now(), latest.starts_at);   -- next slot strictly after both
    else
      need := false;
    end if;

    if need then
      next_start := next_weekly_occurrence(s.weekly_day, s.start_time, ref);

      insert into sessions (host_id, title, starts_at, region, area,
                            min_players, max_players, duration_minutes,
                            board_games, session_type, recurrence, series_id)
      values (s.host_id, s.title, next_start, s.region, s.area,
              s.min_players, s.max_players, s.duration_minutes,
              '', s.session_type, 'weekly', s.id)
      returning id into new_id;

      insert into session_addresses (session_id, full_address, maps_url)
      values (new_id, s.full_address, s.maps_url);

      -- carry co-hosts forward as APPROVED participants
      insert into join_requests (session_id, guest_id, status, message)
      select new_id, c.user_id, 'approved', ''
      from weekly_cohosts c
      where c.series_id = s.id;
    end if;
  end loop;
end;
$$;

grant execute on function roll_weekly_sessions() to authenticated;

-- ---------------------------------------------------------------------------
-- Co-host management RPCs (a host cannot delete/insert another user's
-- join_request directly under RLS, so these are SECURITY DEFINER).
-- "Current" = an occurrence that hasn't finished yet; past occurrences are left
-- untouched so history is preserved.
-- ---------------------------------------------------------------------------
create or replace function add_weekly_cohost(p_series_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
begin
  select host_id into v_host from weekly_series where id = p_series_id;
  if v_host is null then raise exception 'Weekly session not found.'; end if;
  if v_host <> auth.uid() then raise exception 'Only the host can add co-hosts.'; end if;
  if p_user_id = v_host then raise exception 'The host already runs this session.'; end if;

  insert into weekly_cohosts (series_id, user_id)
  values (p_series_id, p_user_id)
  on conflict do nothing;

  perform set_config('bg.skip_limits', 'on', true);
  insert into join_requests (session_id, guest_id, status, message)
  select s.id, p_user_id, 'approved', ''
  from sessions s
  where s.series_id = p_series_id
    and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > now()
    and not exists (select 1 from join_requests j where j.session_id = s.id and j.guest_id = p_user_id);
end;
$$;

create or replace function remove_weekly_cohost(p_series_id uuid, p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_host uuid;
begin
  select host_id into v_host from weekly_series where id = p_series_id;
  if v_host is null then raise exception 'Weekly session not found.'; end if;
  if v_host <> auth.uid() then raise exception 'Only the host can remove co-hosts.'; end if;

  delete from weekly_cohosts where series_id = p_series_id and user_id = p_user_id;

  perform set_config('bg.skip_limits', 'on', true);
  delete from join_requests j
  using sessions s
  where j.session_id = s.id
    and s.series_id = p_series_id
    and j.guest_id = p_user_id
    and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > now();
end;
$$;

create or replace function step_down_cohost(p_series_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (select 1 from weekly_cohosts where series_id = p_series_id and user_id = auth.uid()) then
    raise exception 'You are not a co-host of this session.';
  end if;

  delete from weekly_cohosts where series_id = p_series_id and user_id = auth.uid();

  perform set_config('bg.skip_limits', 'on', true);
  delete from join_requests j
  using sessions s
  where j.session_id = s.id
    and s.series_id = p_series_id
    and j.guest_id = auth.uid()
    and s.starts_at + make_interval(mins => coalesce(s.duration_minutes, 180)) > now();
end;
$$;

grant execute on function add_weekly_cohost(uuid, uuid)    to authenticated;
grant execute on function remove_weekly_cohost(uuid, uuid) to authenticated;
grant execute on function step_down_cohost(uuid)           to authenticated;
