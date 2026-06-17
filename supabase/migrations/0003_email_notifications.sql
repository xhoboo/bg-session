-- ============================================================================
-- BG Session — migration 0003: email notifications via pg_net + Resend
--
-- Sends a transactional email whenever a row is inserted into `notifications`,
-- calling the Resend API directly from Postgres using the pg_net extension.
-- This is an alternative to the Edge Function approach (supabase/functions/
-- send-notification-email) that needs no CLI / deploy — everything runs from
-- the SQL editor. Use ONE of the two approaches, not both (avoid double emails).
--
-- After running this, store your Resend API key (kept out of this file):
--   insert into app_config (key, value)
--   values ('resend_api_key', 'YOUR_re_xxx_key')
--   on conflict (key) do update set value = excluded.value;
-- ============================================================================

-- 1. HTTP-from-Postgres extension.
create extension if not exists pg_net;

-- 2. Private config table. RLS is ON with NO policies, so anon/authenticated
--    users cannot read it; only SECURITY DEFINER functions (and the service
--    role) can. Holds the Resend key + sender settings.
create table if not exists app_config (
  key   text primary key,
  value text not null
);
alter table app_config enable row level security;

-- 3. Non-secret defaults (change EMAIL_FROM once you verify a domain in Resend;
--    APP_URL should point to your deployed app in production).
insert into app_config (key, value) values
  ('email_from', 'BG Session <onboarding@resend.dev>'),
  ('app_url',    'http://localhost:5173')
on conflict (key) do update set value = excluded.value;

-- 4. Send the email when a notification is created.
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
begin
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
    '<p style="color:#94a3b8;font-size:12px;margin-top:32px">You received this because you use BG Session.</p>' ||
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

drop trigger if exists trg_send_notification_email on notifications;
create trigger trg_send_notification_email
  after insert on notifications
  for each row execute function send_notification_email();
