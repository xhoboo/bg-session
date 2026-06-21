-- ============================================================================
-- BG Session — migration 0037: report & block users (trust & safety)
--
-- This is a meetup app where strangers meet at private addresses, so two basic
-- safety primitives were missing:
--
--   user_blocks  : "I don't want to interact with this person." A block stops
--                  direct messages in BOTH directions (enforced by a trigger so
--                  it can't be bypassed from the client) and lets the UI hide
--                  the blocked person from the blocker's inbox.
--   user_reports : "Please look into this person." Insert-only for members;
--                  reports are read by admins via the service role (which
--                  bypasses RLS), so there is intentionally no SELECT policy.
--
-- Privilege hygiene mirrors migrations 0034/0036: trigger/helper functions are
-- revoked from anon/authenticated/public (they run with the owner's rights).
-- Re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- user_blocks
-- ---------------------------------------------------------------------------
create table if not exists user_blocks (
  blocker_id uuid not null references profiles (id) on delete cascade,
  blocked_id uuid not null references profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  check (blocker_id <> blocked_id)
);

create index if not exists user_blocks_blocked_idx on user_blocks (blocked_id);

alter table user_blocks enable row level security;

drop policy if exists "blocks_select_own" on user_blocks;
drop policy if exists "blocks_insert_own" on user_blocks;
drop policy if exists "blocks_delete_own" on user_blocks;

-- A member sees, creates and removes only their OWN block rows. (They must not
-- be able to learn who has blocked THEM — that's why there's no policy exposing
-- rows where blocked_id = auth.uid().)
create policy "blocks_select_own" on user_blocks for select to authenticated
  using (blocker_id = auth.uid());
create policy "blocks_insert_own" on user_blocks for insert to authenticated
  with check (blocker_id = auth.uid());
create policy "blocks_delete_own" on user_blocks for delete to authenticated
  using (blocker_id = auth.uid());

-- ---------------------------------------------------------------------------
-- Block helper + DM enforcement
--
-- is_blocked_between() is SECURITY DEFINER so the trigger can see block rows in
-- either direction regardless of the caller's RLS view. The trigger rejects a
-- DM if a block exists either way, with a neutral message so it doesn't reveal
-- to a sender that the recipient blocked them specifically.
-- ---------------------------------------------------------------------------
create or replace function is_blocked_between(a uuid, b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from user_blocks
    where (blocker_id = a and blocked_id = b)
       or (blocker_id = b and blocked_id = a)
  );
$$;

create or replace function forbid_dm_when_blocked()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_blocked_between(new.sender_id, new.recipient_id) then
    raise exception 'You can no longer message this user.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_forbid_dm_when_blocked on direct_messages;
create trigger trg_forbid_dm_when_blocked
  before insert on direct_messages
  for each row execute function forbid_dm_when_blocked();

-- ---------------------------------------------------------------------------
-- user_reports
-- ---------------------------------------------------------------------------
do $$
begin
  create type report_status as enum ('open', 'reviewed', 'dismissed');
exception when duplicate_object then null;
end $$;

create table if not exists user_reports (
  id          uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references profiles (id) on delete cascade,
  reported_id uuid not null references profiles (id) on delete cascade,
  reason      text not null check (char_length(reason) between 1 and 60),
  details     text not null default '' check (char_length(details) <= 2000),
  session_id  uuid references sessions (id) on delete set null,
  status      report_status not null default 'open',
  created_at  timestamptz not null default now(),
  check (reporter_id <> reported_id)
);

create index if not exists user_reports_reported_idx on user_reports (reported_id);
create index if not exists user_reports_status_idx on user_reports (status, created_at desc);

alter table user_reports enable row level security;

drop policy if exists "reports_insert_own" on user_reports;

-- Members can file a report about someone else. No SELECT/UPDATE/DELETE policy:
-- reports are triaged by admins through the service role (bypasses RLS).
create policy "reports_insert_own" on user_reports for insert to authenticated
  with check (reporter_id = auth.uid() and reported_id <> auth.uid());

-- ---------------------------------------------------------------------------
-- Privilege hygiene (see 0034/0036). These functions run with owner rights via
-- their trigger / definer context; no client role needs EXECUTE.
-- ---------------------------------------------------------------------------
revoke execute on function public.is_blocked_between(uuid, uuid)  from public, anon, authenticated;
revoke execute on function public.forbid_dm_when_blocked()        from public, anon, authenticated;
grant  execute on function public.is_blocked_between(uuid, uuid)  to service_role;
