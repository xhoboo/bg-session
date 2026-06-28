-- ============================================================================
-- BG Session — migration 0061: account bans & permanent email blocklist
--
-- Trust & safety follow-up to 0037 (reports). Admins triage user_reports in the
-- local admin tool (service_role) and can now act on them:
--
--   * Temporary ban — set profiles.banned_until to a future date (30 days /
--     6 months / 1 year). A banned member can still sign in, but BEFORE INSERT
--     triggers stop them from HOSTING a session or JOINING one (a join_request
--     covers both join and waitlist, see 0038). Enforced in the database so it
--     can't be bypassed from the client.
--
--   * Permanent delete — the admin tool deletes the auth user (which cascades to
--     profiles and everything they own) AND records their email in
--     email_blocklist. A BEFORE INSERT trigger on auth.users then refuses any
--     future sign-up with that address — for both email/password and
--     "Continue with Google", since both land a row in auth.users.
--
-- Privilege hygiene mirrors 0034/0036/0037: helper/trigger functions are
-- SECURITY DEFINER and their EXECUTE is revoked from anon/authenticated/public.
-- Re-runnable.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Ban columns on profiles. NULL banned_until = not banned. ban_reason is the
-- admin's note (usually the report reason) shown back in the admin tool.
-- ---------------------------------------------------------------------------
alter table profiles add column if not exists banned_until timestamptz;
alter table profiles add column if not exists ban_reason  text;

-- ---------------------------------------------------------------------------
-- email_blocklist — addresses that may never create an account again.
-- Emails are stored lower-cased (the admin tool normalises). No RLS policies:
-- only the service_role (admin tool, bypasses RLS) and the SECURITY DEFINER
-- sign-up trigger below ever touch it.
-- ---------------------------------------------------------------------------
create table if not exists email_blocklist (
  email      text primary key,
  reason     text not null default '',
  created_at timestamptz not null default now()
);

alter table email_blocklist enable row level security;

-- ---------------------------------------------------------------------------
-- is_banned(uid): true while the user has a ban that hasn't expired. SECURITY
-- DEFINER so the insert triggers can read profiles regardless of the caller's
-- RLS view.
-- ---------------------------------------------------------------------------
create or replace function is_banned(uid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from profiles
    where id = uid
      and banned_until is not null
      and banned_until > now()
  );
$$;

-- ---------------------------------------------------------------------------
-- Stop a banned member from hosting a session or joining one. We key off
-- auth.uid() (the acting member) so background maintenance jobs that run as the
-- table owner — e.g. the weekly roll — are unaffected.
-- ---------------------------------------------------------------------------
create or replace function forbid_banned_host()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_banned(auth.uid()) then
    raise exception 'Your account is suspended and cannot host sessions.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_forbid_banned_host on sessions;
create trigger trg_forbid_banned_host
  before insert on sessions
  for each row execute function forbid_banned_host();

create or replace function forbid_banned_guest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if is_banned(auth.uid()) then
    raise exception 'Your account is suspended and cannot join sessions.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_forbid_banned_guest on join_requests;
create trigger trg_forbid_banned_guest
  before insert on join_requests
  for each row execute function forbid_banned_guest();

-- ---------------------------------------------------------------------------
-- Refuse sign-ups from a blocklisted email. Fires on every new auth.users row,
-- so it covers both email/password sign-up and Google OAuth (the OAuth callback
-- inserts the Google account's email here too). Runs BEFORE the new-user
-- profile trigger (0045), so a blocked address never reaches onboarding.
-- ---------------------------------------------------------------------------
create or replace function forbid_blocklisted_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.email is not null
     and exists (select 1 from public.email_blocklist where email = lower(new.email)) then
    raise exception 'This email address can no longer be used to create an account.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_forbid_blocklisted_email on auth.users;
create trigger trg_forbid_blocklisted_email
  before insert on auth.users
  for each row execute function forbid_blocklisted_email();

-- ---------------------------------------------------------------------------
-- Privilege hygiene (see 0034/0036/0037). These run with owner rights via their
-- trigger / definer context; no client role needs EXECUTE. The admin tool reads
-- is_banned() through the service_role.
-- ---------------------------------------------------------------------------
revoke execute on function public.is_banned(uuid)              from public, anon, authenticated;
revoke execute on function public.forbid_banned_host()         from public, anon, authenticated;
revoke execute on function public.forbid_banned_guest()        from public, anon, authenticated;
revoke execute on function public.forbid_blocklisted_email()   from public, anon, authenticated;
grant  execute on function public.is_banned(uuid)              to service_role;
