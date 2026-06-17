-- ============================================================================
-- BG Session — migration 0006: private profile fields, maps link, host counts
--
-- 1) Move real_name + gender out of the public `profiles` table into a new
--    `profile_private` table (adding `photo_url` for the in-person photo).
--    These are readable ONLY by the user themselves and by people who share a
--    CONFIRMED session with them (host + approved guests of the same session).
-- 2) Add a Google Maps link to session addresses.
-- 3) Capacity now counts the host as 1 player.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1) profile_private
-- ---------------------------------------------------------------------------
create table if not exists profile_private (
  id        uuid primary key references profiles (id) on delete cascade,
  real_name text,
  gender    text,
  photo_url text   -- in-person ("foto diri") photo, shown to confirmed co-participants
);

-- Carry over any existing values, then drop the public columns. Guarded so the
-- migration is safe to re-run after the columns have already been moved.
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'profiles' and column_name = 'real_name'
  ) then
    insert into profile_private (id, real_name, gender)
      select id, real_name, gender from profiles
      where real_name is not null or gender is not null
    on conflict (id) do nothing;

    alter table profiles drop column real_name;
    alter table profiles drop column gender;
  end if;
end $$;

alter table profile_private enable row level security;

-- Do auth.uid() and `other` share a session where BOTH are confirmed
-- (host or approved guest)? SECURITY DEFINER so it bypasses RLS (no recursion).
create or replace function shares_confirmed_session(other uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1 from sessions s
    where (
      s.host_id = auth.uid()
      or exists (select 1 from join_requests j
                 where j.session_id = s.id and j.guest_id = auth.uid() and j.status = 'approved')
    )
    and (
      s.host_id = other
      or exists (select 1 from join_requests j2
                 where j2.session_id = s.id and j2.guest_id = other and j2.status = 'approved')
    )
  );
$$;

drop policy if exists "profile_private_select" on profile_private;
drop policy if exists "profile_private_insert" on profile_private;
drop policy if exists "profile_private_update" on profile_private;

create policy "profile_private_select"
  on profile_private for select to authenticated
  using (id = auth.uid() or shares_confirmed_session(id));

create policy "profile_private_insert"
  on profile_private for insert to authenticated
  with check (id = auth.uid());

create policy "profile_private_update"
  on profile_private for update to authenticated
  using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2) Google Maps link on the (private) session address
-- ---------------------------------------------------------------------------
alter table session_addresses add column if not exists maps_url text;

-- ---------------------------------------------------------------------------
-- 3) Capacity counts the host. Max approved guests = max_players - 1.
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

create or replace function enforce_capacity_on_approve()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap   int;
  taken int;
begin
  if new.status = 'approved' and old.status is distinct from 'approved' then
    select max_players, confirmed_count into cap, taken
      from sessions where id = new.session_id;
    if taken + 1 >= cap then        -- +1 for the host
      raise exception 'This session is already full.' using errcode = 'check_violation';
    end if;
  end if;
  return new;
end;
$$;

-- Ensure the approve-capacity trigger exists (also created in 0004; idempotent).
drop trigger if exists trg_enforce_capacity_approve on join_requests;
create trigger trg_enforce_capacity_approve
  before update on join_requests
  for each row execute function enforce_capacity_on_approve();
