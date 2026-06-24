-- ============================================================================
-- BG Session — migration 0047: email only important notifications
--
-- The in-app feed gets a row for every event (rating nudges, join requests,
-- forfeited requests, …). Mirroring all of those to email turns the inbox into
-- spam, so we now email only the handful that genuinely warrant a push:
-- join approvals/confirmations/rejections, session reminders, and cancellations.
--
-- This patches the pg_net trigger path from migration 0003. The Edge Function
-- path (supabase/functions/send-notification-email) carries the same whitelist;
-- keep the two in sync. Everything still lands in-app regardless of this filter.
-- ============================================================================

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
  -- Only important types get an email; the rest stay in-app only.
  if new.type not in (
    'join_approved', 'join_confirmed', 'join_rejected',
    'session_reminder', 'session_canceled'
  ) then
    return new;
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
