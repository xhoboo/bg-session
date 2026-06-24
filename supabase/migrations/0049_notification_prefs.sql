-- ============================================================================
-- BG Session — migration 0049: per-user email notification preferences
--
-- In-app notifications always land in the bell. This adds an opt-OUT for the
-- handful of types that also send an email (the 0047 whitelist). The five email
-- types collapse into three user-facing switches:
--
--   email_join_updates       → join_approved / join_confirmed / join_rejected
--   email_session_reminders  → session_reminder
--   email_session_changes    → session_canceled
--
-- A missing row means "all on" (the default), so existing users keep getting
-- emails until they opt out. send_notification_email() is patched to honour the
-- preference; everything still appears in-app regardless.
-- Re-runnable.
-- ============================================================================

create table if not exists notification_prefs (
  user_id                 uuid primary key references auth.users (id) on delete cascade,
  email_join_updates      boolean not null default true,
  email_session_reminders boolean not null default true,
  email_session_changes   boolean not null default true,
  updated_at              timestamptz not null default now()
);

alter table notification_prefs enable row level security;

drop policy if exists "notif_prefs_select_own" on notification_prefs;
create policy "notif_prefs_select_own"
  on notification_prefs for select
  to authenticated
  using (user_id = auth.uid());

drop policy if exists "notif_prefs_insert_own" on notification_prefs;
create policy "notif_prefs_insert_own"
  on notification_prefs for insert
  to authenticated
  with check (user_id = auth.uid());

drop policy if exists "notif_prefs_update_own" on notification_prefs;
create policy "notif_prefs_update_own"
  on notification_prefs for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger trg_notification_prefs_touch
  before update on notification_prefs
  for each row execute function touch_updated_at();

-- ---------------------------------------------------------------------------
-- Patch the email sender (from 0003/0047) to skip an email the recipient has
-- opted out of. Same body as 0047 plus the preference lookup near the top.
-- ---------------------------------------------------------------------------
create or replace function send_notification_email()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  recipient text;
  api_key   text;
  from_addr text;
  app_url   text;
  cta       text;
  t         text;
  b         text;
  html_body text;
  np        notification_prefs%rowtype;
  send_it   boolean := true;
begin
  -- Only important types get an email; the rest stay in-app only.
  if new.type not in (
    'join_approved', 'join_confirmed', 'join_rejected',
    'session_reminder', 'session_canceled'
  ) then
    return new;
  end if;

  -- Honour the recipient's email preferences. No row = all on (the default).
  select * into np from notification_prefs where user_id = new.user_id;
  if found then
    if new.type = 'session_reminder' then
      send_it := np.email_session_reminders;
    elsif new.type = 'session_canceled' then
      send_it := np.email_session_changes;
    else  -- join_approved / join_confirmed / join_rejected
      send_it := np.email_join_updates;
    end if;
  end if;
  if not send_it then
    return new;  -- opted out of this email; in-app notification still delivered
  end if;

  select value into api_key from app_config where key = 'resend_api_key';
  if api_key is null then
    return new;  -- not configured yet; in-app notification still delivered
  end if;

  select email into recipient from auth.users where id = new.user_id;
  if recipient is null then
    return new;
  end if;

  select value into from_addr from app_config where key = 'email_from';
  select value into app_url   from app_config where key = 'app_url';

  -- Escape user-controlled text (session titles) before embedding in HTML.
  t := replace(replace(replace(new.title, '&', '&amp;'), '<', '&lt;'), '>', '&gt;');
  b := replace(replace(replace(coalesce(new.body, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;');

  cta := coalesce(app_url, '') ||
         case when new.session_id is not null
              then '/sessions/' || new.session_id::text else '' end;

  html_body :=
    '<div style="font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif;max-width:480px;margin:0 auto;padding:24px">' ||
    '<h2 style="color:#0f766e;margin:0 0 8px">' || t || '</h2>' ||
    '<p style="color:#334155;font-size:15px;line-height:1.5">' || b || '</p>' ||
    case when cta <> '' then
      '<p style="margin-top:24px"><a href="' || cta ||
      '" style="background:#0f766e;color:#fff;text-decoration:none;padding:10px 18px;border-radius:8px;font-weight:600;display:inline-block">Open BG Session</a></p>'
    else '' end ||
    '<p style="color:#94a3b8;font-size:12px;margin-top:32px">You received this because you use BG Session. You can manage email notifications in your profile settings.</p>' ||
    '</div>';

  -- pg_net is async/fire-and-forget: this never blocks or fails the insert.
  perform net.http_post(
    url     := 'https://api.resend.com/emails',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || api_key,
      'Content-Type',  'application/json'
    ),
    body    := jsonb_build_object(
      'from',    coalesce(from_addr, 'BG Session <onboarding@resend.dev>'),
      'to',      recipient,
      'subject', new.title,
      'html',    html_body
    )
  );

  return new;
end;
$$;
