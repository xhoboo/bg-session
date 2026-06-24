-- ============================================================================
-- BG Session — migration 0048: invite a specific member to a session
--
-- A confirmed participant (the host OR an approved guest) can invite a specific
-- member to a session — "bring a friend". The invite is a nudge, not a back
-- door: when the invitee accepts, the client inserts a normal join_request for
-- them, so the existing rules all still apply (open → auto-confirmed, approval →
-- waits for the host, full → waitlisted, time-conflict → blocked). The host
-- never loses control of who actually gets in.
--
--   * Only a confirmed participant of an upcoming session can send an invite
--     (enforced by the INSERT policy + the validation trigger).
--   * The invitee can't already be the host or an active (approved/pending/
--     waitlisted) participant; one live invite per (session, invitee).
--   * The invitee gets an in-app notification; accepting/declining is done from
--     the session page. When they accept, the inviter is notified back.
--
-- In-app only (not in the 0047 email whitelist) — kept quiet on purpose; the
-- notification-preferences feature can opt invites into email later.
-- Re-runnable.
-- ============================================================================

-- Notification kinds for this feature. Added + referenced only at runtime by the
-- triggers below (which never run during this migration), so it's safe to add
-- the values in the same file — same pattern as 0011/0014/0038/0042.
alter type notification_type add value if not exists 'session_invite';
alter type notification_type add value if not exists 'invite_accepted';

-- ---------------------------------------------------------------------------
-- Table: one row per (session, invitee). status walks pending → accepted /
-- declined. We keep the row after a response so a member isn't re-invited in a
-- loop and the inviter can see it landed.
-- ---------------------------------------------------------------------------
create table if not exists session_invites (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references sessions (id) on delete cascade,
  inviter_id  uuid not null references profiles (id) on delete cascade,
  invitee_id  uuid not null references profiles (id) on delete cascade,
  status      text not null default 'pending'
                check (status in ('pending', 'accepted', 'declined')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (session_id, invitee_id)
);

create index if not exists session_invites_session_idx on session_invites (session_id);
create index if not exists session_invites_invitee_idx on session_invites (invitee_id, status);

alter table session_invites enable row level security;

-- The invitee sees invites sent to them; the inviter sees the ones they sent;
-- the host sees every invite for their session.
drop policy if exists "invites_select_party" on session_invites;
create policy "invites_select_party"
  on session_invites for select
  to authenticated
  using (
    invitee_id = auth.uid()
    or inviter_id = auth.uid()
    or exists (
      select 1 from sessions s
      where s.id = session_invites.session_id and s.host_id = auth.uid()
    )
  );

-- Send: only a confirmed participant (host or approved guest) may invite, and
-- only as themselves. The richer "who can be invited" checks live in the
-- validation trigger (which can see the invitee's rows past RLS).
drop policy if exists "invites_insert_participant" on session_invites;
create policy "invites_insert_participant"
  on session_invites for insert
  to authenticated
  with check (
    inviter_id = auth.uid()
    and invitee_id <> auth.uid()
    and (
      exists (
        select 1 from sessions s
        where s.id = session_id and s.host_id = auth.uid()
      )
      or exists (
        select 1 from join_requests jr
        where jr.session_id = session_invites.session_id
          and jr.guest_id = auth.uid()
          and jr.status = 'approved'
      )
    )
  );

-- Respond: the invitee accepts/declines their own invite.
drop policy if exists "invites_update_invitee" on session_invites;
create policy "invites_update_invitee"
  on session_invites for update
  to authenticated
  using (invitee_id = auth.uid())
  with check (invitee_id = auth.uid());

-- Rescind: the inviter may delete an invite they sent.
drop policy if exists "invites_delete_inviter" on session_invites;
create policy "invites_delete_inviter"
  on session_invites for delete
  to authenticated
  using (inviter_id = auth.uid());

create trigger trg_session_invites_touch
  before update on session_invites
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Validation (SECURITY DEFINER so it can read the invitee's rows past the
-- caller's RLS): the session must be upcoming, and the invitee must not already
-- be in it. Friendly errors so the UI can show them verbatim.
-- ---------------------------------------------------------------------------
create or replace function validate_session_invite()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  s_host  uuid;
  s_start timestamptz;
begin
  select host_id, starts_at into s_host, s_start
    from sessions where id = new.session_id;
  if s_host is null then
    raise exception 'That session no longer exists.' using errcode = 'check_violation';
  end if;
  if s_start <= now() then
    raise exception 'This session has already started — you can no longer invite people to it.'
      using errcode = 'check_violation';
  end if;
  if new.invitee_id = s_host then
    raise exception 'They are the host of this session.' using errcode = 'check_violation';
  end if;
  if exists (
    select 1 from join_requests jr
    where jr.session_id = new.session_id
      and jr.guest_id = new.invitee_id
      and jr.status in ('approved', 'pending', 'waitlisted')
  ) then
    raise exception 'They are already in this session (or have a pending request).'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_validate_session_invite on session_invites;
create trigger trg_validate_session_invite
  before insert on session_invites
  for each row execute function validate_session_invite();

-- ---------------------------------------------------------------------------
-- Notify the invitee when an invite is created.
-- ---------------------------------------------------------------------------
create or replace function notify_on_invite_insert()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  inviter_name text;
  s_title      text;
begin
  select coalesce(display_name, 'Someone') into inviter_name from profiles where id = new.inviter_id;
  select title into s_title from sessions where id = new.session_id;

  insert into notifications (user_id, type, title, body, session_id)
  values (
    new.invitee_id,
    'session_invite',
    inviter_name || ' invited you to a session',
    '"' || s_title || '" — open the session to accept or decline.',
    new.session_id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_invite_insert on session_invites;
create trigger trg_notify_invite_insert
  after insert on session_invites
  for each row execute function notify_on_invite_insert();

-- ---------------------------------------------------------------------------
-- Notify the inviter when their invite is accepted (declines stay quiet).
-- ---------------------------------------------------------------------------
create or replace function notify_on_invite_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  invitee_name text;
  s_title      text;
begin
  if new.status = old.status or new.status <> 'accepted' then
    return new;
  end if;
  select coalesce(display_name, 'Someone') into invitee_name from profiles where id = new.invitee_id;
  select title into s_title from sessions where id = new.session_id;

  insert into notifications (user_id, type, title, body, session_id)
  values (
    new.inviter_id,
    'invite_accepted',
    invitee_name || ' accepted your invite',
    '"' || s_title || '"',
    new.session_id
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_invite_update on session_invites;
create trigger trg_notify_invite_update
  after update on session_invites
  for each row execute function notify_on_invite_update();

-- ---------------------------------------------------------------------------
-- Privilege hygiene (see 0034/0042): these run as triggers, so no client role
-- needs EXECUTE.
-- ---------------------------------------------------------------------------
revoke execute on function public.validate_session_invite()  from public, anon, authenticated;
revoke execute on function public.notify_on_invite_insert()  from public, anon, authenticated;
revoke execute on function public.notify_on_invite_update()  from public, anon, authenticated;
